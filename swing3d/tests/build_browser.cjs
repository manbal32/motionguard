/* Current build gates: 22 body points and the stage-5 visual measurement.
   Use the avatar-area gate from revision 9cfee75. */
const {chromium,expect}=require('playwright/test');
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),url=process.env.BUILD_TEST_URL;
const shots=path.join(root,'mockups/shots');
const measure=c=>{
 const baseline=window.canvasBaseline,a=JSON.parse(c.dataset.measuredPose),s=JSON.parse(c.dataset.displayedPose);
 const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
 const ink=(data,i)=>data[i+3]>0 && data[i+1]>data[i]*1.1 && data[i+1]>data[i+2]*1.05;
 let exclusive=0,union=0,topPixels=0;
 for(let i=0;i<pixels.length;i+=4){const before=ink(baseline,i),after=ink(pixels,i);if(before||after)union++;if(before!==after)exclusive++;if(i<8*c.width*4 && after)topPixels++;}
 return {canvasCSS:[c.clientWidth,c.clientHeight],landmarks:a.length,frame:+c.dataset.frame,
  maxJointPx:Math.max(...a.map((p,i)=>Math.hypot(p[0]-s[i][0],p[1]-s[i][1]))),exclusivePixels:exclusive,avatarUnionPixels:union,exclusiveRatio:exclusive/union,top8AvatarPixels:topPixels};
};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const fixtures=JSON.parse(fs.readFileSync(process.env.BUILD_GUIDANCE_FIXTURES));
  for(const [i,reason] of ['too_far','tracking_failed','no_swing'].entries()){
   const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});let calls=0;
   await p.route('**/api/coaching/analyze',r=>{calls++;r.abort()});
   await p.route('**/api/video',r=>r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',data:fixtures[reason]})+'\n'}));
   await p.goto(url);await p.locator('#video').setInputFiles(path.join(root,'samples/golf_swing.mp4'));
   await p.locator('#start').click();await p.locator('#summary-approve').click();await p.locator('#quality-guidance').waitFor({state:'visible'});
   expect(calls).toBe(0);await p.screenshot({path:path.join(shots,`g${i+1}_${['too_far','tracking','no_swing'][i]}.png`)});await p.close();
  }
  const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);await p.locator('#csv').setInputFiles(path.join(root,'samples/swing_front_landmarks.csv'));
  await p.locator('#start').click();await p.locator('#summary-approve').click();await p.locator('#results').waitFor({state:'visible'});await p.locator('#show-points').click();await p.locator('#overlay').waitFor({state:'visible'});
  await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(100);
  const c=p.locator('#exaggerated'),slider=p.locator('#compare-factor'),button=p.locator('#mobile-toggle');
  const factor=async value=>{await slider.evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input'))},value);};
  const hold=async()=>{const b=await button.boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();};
  await factor(1);await c.screenshot({path:path.join(shots,'build_s5_canvas_1x.png')});
  await c.evaluate(c=>window.canvasBaseline=c.getContext('2d').getImageData(0,0,c.width,c.height).data);
  await factor(2.5);await hold();const result=await c.evaluate(measure);
  await c.screenshot({path:path.join(shots,'build_s5_canvas_25x.png')});await p.screenshot({path:path.join(shots,'build_s5_point.png')});await p.mouse.up();
  expect(await c.evaluate(c=>c.dataset.measuredPose===c.dataset.displayedPose)).toBe(true);
  await p.locator('#point-play').click();const first=await c.getAttribute('data-frame');await p.waitForTimeout(250);const second=await c.getAttribute('data-frame');
  await p.locator('#point-play').click();await p.locator('#point-seek').evaluate(e=>{e.value=141/60.116991157064994;e.dispatchEvent(new Event('input'));});
  const stopped=await c.getAttribute('data-frame');await p.waitForTimeout(180);expect(await c.getAttribute('data-frame')).toBe(stopped);expect(stopped).toBe('141');
  result.playFrames=[+first,+second];result.seekFrame=+stopped;expect(+second).not.toBe(+first);
  await p.locator('#point-phases [data-phase=top]').click();await p.setViewportSize({width:422,height:844});await p.waitForTimeout(100);
  await factor(1);await c.evaluate(c=>window.canvasBaseline=c.getContext('2d').getImageData(0,0,c.width,c.height).data);await factor(2.5);await hold();
  result.exact390=await c.evaluate(measure);
  result.allFrames=await p.evaluate(()=>{
   const seek=document.getElementById('point-seek'),c=document.getElementById('exaggerated');let maximum=0;
   for(let frame=81;frame<=172;frame++){
    seek.value=frame/60.116991157064994;seek.dispatchEvent(new Event('input'));
    const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;
    for(let i=0;i<data.length;i+=4){const pixel=i/4,x=pixel%c.width,y=Math.floor(pixel/c.width);if((x<8||x>=c.width-8||y<8||y>=c.height-8)&&data[i+3]>0&&data[i+1]>data[i]*1.1&&data[i+1]>data[i+2]*1.05)count++;}
    maximum=Math.max(maximum,count);
   }return{frames:92,maximumAvatarPixelsInOuter8:maximum};
  });await p.mouse.up();result.errors=errors;expect(errors).toEqual([]);
  console.log(JSON.stringify(result,null,2));fs.writeFileSync(process.env.BUILD_BROWSER_RESULT,JSON.stringify(result,null,2)+'\n');
  expect(result.landmarks).toBe(22);expect(result.exact390.canvasCSS[0]).toBe(390);
  expect(result.exact390.maxJointPx).toBeGreaterThanOrEqual(20);
  expect(result.exact390.exclusiveRatio).toBeGreaterThanOrEqual(.05);
  expect(result.exact390.top8AvatarPixels).toBe(0);expect(result.allFrames.maximumAvatarPixelsInOuter8).toBe(0);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
