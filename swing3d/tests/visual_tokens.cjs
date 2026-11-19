/* Element-level typography, contrast and primary-action audit at both required sizes. */
const {chromium,expect}=require('playwright/test'),fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),url=process.env.MOBILE_URL||'http://127.0.0.1:8892';
const audit=()=>{
 const rgba=value=>{const n=value.match(/[\d.]+/g)?.map(Number)??[0,0,0];return[n[0],n[1],n[2],n[3]??1];};
 const blend=(a,b)=>[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3]));
 const background=e=>{const stack=[];for(let p=e;p;p=p.parentElement)stack.push(rgba(getComputedStyle(p).backgroundColor));return stack.reverse().reduce((b,c)=>blend(c,b),[255,255,255]);};
 const lum=color=>color.slice(0,3).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
 const visible=e=>e.checkVisibility({visibilityProperty:true,opacityProperty:true})&&e.getBoundingClientRect().height>0;
 const onScreen=e=>{
  if(!visible(e))return false;let r=e.getBoundingClientRect(),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
  for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),box=p.getBoundingClientRect();if(s.overflowY!=='visible'){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom);}if(s.overflowX!=='visible'){left=Math.max(left,box.left);right=Math.min(right,box.right);}}
  return right>left&&bottom>top;
 };
 const primary=[...document.querySelectorAll('button,a.button,.report-foot a')].filter(onScreen).filter(e=>{const color=rgba(getComputedStyle(e).backgroundColor);return color[3]>.9&&lum(color)<.25;}).map(e=>e.id||e.textContent);
 let minimum=Infinity,count=0;const failures=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){const text=walker.currentNode,parent=text.parentElement;if(!text.textContent.trim()||!parent||parent.namespaceURI!=='http://www.w3.org/1999/xhtml'||['SCRIPT','STYLE','TITLE'].includes(parent.tagName)||!visible(parent)||parent.closest(':disabled'))continue;
  const bg=background(parent),fg=blend(rgba(getComputedStyle(parent).color),bg),a=lum(fg),b=lum(bg),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);minimum=Math.min(minimum,contrast);count++;if(contrast<4.5)failures.push({id:parent.id,text:text.textContent.trim().slice(0,60),contrast});
 }
 return{primary,minimumContrast:minimum,textNodes:count,failures};
};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const results={};try{
 for(const [name,width,height]of [['mobile',390,844],['desktop',1440,900]]){
  const p=await browser.newPage({viewport:{width,height},deviceScaleFactor:2}),screens={};let errors=[];p.on('pageerror',e=>errors.push(e.message));
  const capture=async state=>{await p.evaluate(()=>document.fonts.ready);screens[state]=await p.evaluate(audit);await p.screenshot({path:path.join(root,`mockups/shots/11h_${name}_${state}.png`)});expect(screens[state].primary).toHaveLength(1);expect(screens[state].failures).toEqual([]);};
  await p.goto(url);await capture('empty');await p.locator('#csv').setInputFiles(path.join(root,'samples/swing_front_landmarks.csv'));
  await p.locator('#coach-message').fill('백스윙이 잘 안 돼요. 팔로만 드는 느낌입니다.');await p.locator('#coach-send').click();await expect(p.locator('#coach-send')).toBeEnabled();await capture('upload');
  await p.locator('#start').click();await expect(p.locator('#summary-review')).toBeVisible();await capture('summary');let pending;await p.route('**/api/track',r=>{pending=r;});await p.locator('#summary-approve').click();await expect(p.locator('#progress')).toBeVisible();await capture('busy');await pending.continue();await p.unroute('**/api/track');await expect(p.locator('#overlay')).toBeVisible();await p.waitForTimeout(1700);await capture('point');
  await p.locator('#flow-back').click();await expect(p.locator('#results')).toBeVisible();await capture('result');
  const meters=await p.locator('#result-items .meter').evaluateAll(es=>es.map(e=>({band:e.querySelector('.meter-band').getBoundingClientRect().width,fill:e.querySelector('.meter-fill').getBoundingClientRect().width})));expect(meters.every(m=>m.band>0&&m.fill>0)).toBe(true);
  await p.locator('#result-report').click();await expect(p.locator('#report-body')).toBeVisible();await capture('report');
  const text=await p.locator('#customer-body').innerText();expect(text).not.toMatch(/-139|-105|(?:^|\s)0\.\d+(?!\d|타)/m);
  if(name==='mobile')await p.pdf({path:path.join(root,'mockups/shots/report.pdf'),preferCSSPageSize:true,printBackground:true});
  if(process.env.BUILD_GUIDANCE_FIXTURES){
   const fixtures=JSON.parse(fs.readFileSync(process.env.BUILD_GUIDANCE_FIXTURES));
   for(const reason of ['too_far','tracking_failed','no_swing']){
    await p.goto(url);await p.route('**/api/video',r=>r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',data:fixtures[reason]})+'\n'}));
    await p.locator('#video').setInputFiles(path.join(root,'samples/golf_swing.mp4'));await p.locator('#start').click();await p.locator('#summary-approve').click();await expect(p.locator('#quality-guidance')).toBeVisible();await capture('guidance_'+reason);await p.unroute('**/api/video');
   }
  }
  expect(errors).toEqual([]);results[name]={screens,meters,errors};await p.close();
 }
 fs.writeFileSync(path.join(root,'mockups/11h-visual.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
