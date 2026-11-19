/* Real video inference, with every retained body observation exported for independent comparison. */
const {chromium,expect}=require('playwright/test'),fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),url=process.env.PAGES_TEST_URL||'http://127.0.0.1:8891/motionguard/',out=process.env.POSE_OUTPUT||'/tmp/motionguard-browser-pose';
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const p=await browser.newPage(),errors=[],outside=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(new URL(r.url()).origin!==new URL(url).origin)outside.push(r.url())});await p.goto(url);await p.waitForFunction(()=>window.MotionPose&&window.MotionTrack);
 for(const name of ['golf_swing.mp4','golf_swing_portrait.mp4']){
  if(name.includes('portrait')){await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.context().setOffline(true);}
  const payload=fs.readFileSync(path.join(root,'samples',name)).toString('base64'),start=Date.now();
  const data=await p.evaluate(async({name,payload})=>{const bytes=Uint8Array.from(atob(payload),c=>c.charCodeAt(0)),file=new File([bytes],name,{type:'video/mp4'});return await MotionPose.extract(file,{debug:true});},{name,payload});
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data));console.log(JSON.stringify({name,wallSeconds:(Date.now()-start)/1000,fps:data.fps,usable:data.track.meta.usable,reason:data.track.meta.unusable_reason,decoder:data.track.meta.decoder,crop:data.track.meta.crop_box,bodyCounts:[...new Set(data.frames.map(f=>Object.keys(f).length))],outside,errors}));
  expect(errors).toEqual([]);expect(outside).toEqual([]);expect([...new Set(data.frames.map(f=>Object.keys(f).length))]).toEqual([22]);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
