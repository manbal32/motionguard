/* Run with MOBILE_URL against an isolated local server; keep measured artifacts. */
const {chromium,expect}=require('playwright/test');
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),url=process.env.MOBILE_URL||'http://127.0.0.1:8890';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const output={};
 try{
  for(const [name,width,height] of [['mobile',390,844],['desktop',1440,900]]){
   const p=await browser.newPage({viewport:{width,height},deviceScaleFactor:2});const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto(url);await p.locator('#csv').setInputFiles(path.join(root,'samples/swing_front_landmarks.csv'));
   await p.locator('#start').click();await p.locator('#summary-approve').click();
   await expect(p.locator('#overlay')).toBeVisible();await expect(p.locator('#results')).toBeHidden();
   const first=+(await p.locator('#exaggerated').getAttribute('data-frame'));await p.waitForTimeout(250);
   const second=+(await p.locator('#exaggerated').getAttribute('data-frame'));expect(second).not.toBe(first);
   await p.waitForTimeout(1600);const end=await p.locator('#exaggerated').getAttribute('data-frame');await p.waitForTimeout(150);expect(await p.locator('#exaggerated').getAttribute('data-frame')).toBe(end);
   expect(await p.locator('#overlay a[href*="report"],#result-actions a').count()).toBe(0);
   await p.screenshot({path:path.join(root,`mockups/shots/11a_${name}_point.png`)});
   await p.locator('#flow-back').click();await expect(p.locator('#results')).toBeVisible();
   await expect(p.locator('#show-points')).toHaveText('스윙 다시 보기');
   await p.locator('#show-points').click();await expect(p.locator('#overlay')).toBeVisible();await p.locator('#flow-back').click();
   await p.locator('#result-report').click();await expect(p.locator('#report-body')).toBeVisible();
   await p.locator('#return-result').click();await expect(p.locator('#results')).toBeVisible();
   expect(errors).toEqual([]);output[name]={autoplay:[first,second],endFrame:+end,reportLinksOnPoint:0,returnResult:true,errors};await p.close();
  }
  fs.writeFileSync(path.join(root,'mockups/11a-flow.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
