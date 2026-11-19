const {chromium,expect}=require('playwright/test');const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),url=process.env.MOBILE_URL||'http://127.0.0.1:8890';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});let results={};
try{for(const [name,width,height]of [['mobile',390,844],['desktop',1440,900]]){
 const p=await browser.newPage({viewport:{width,height},deviceScaleFactor:2});let errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.evaluate(()=>document.fonts.ready);
 await expect(p.locator('.coach-welcome')).toBeVisible();await expect(p.locator('#coach-examples button')).toHaveCount(3);
 const empty=await p.evaluate(()=>({preview:document.getElementById('preview-slot').clientHeight,body:document.querySelector('#upload>.section-body').clientHeight}));
 expect(empty.preview/empty.body).toBeGreaterThanOrEqual(.18);expect(empty.preview/empty.body).toBeLessThanOrEqual(.26);
 await p.screenshot({path:path.join(root,`mockups/shots/11c_${name}_empty.png`)});
 await p.locator('#coach-examples button').first().click();await expect(p.locator('#coach-message')).toHaveValue('백스윙이 잘 안 돼요');await p.locator('#coach-send').click();await expect(p.locator('#coach-send')).toBeEnabled();
 await p.locator('#video').setInputFiles(path.join(root,'samples/golf_swing_portrait.mp4'));await expect(p.locator('#upload-preview')).toBeVisible();
 await p.locator('#coach-message').fill('회전 순서를 천천히 연습');await p.locator('#coach-send').click();await expect(p.locator('#coach-send')).toBeEnabled();
 const consult=await p.evaluate(()=>{const box=id=>document.getElementById(id).getBoundingClientRect();return {overlap:box('coach-send').bottom-box('start').top,preview:box('preview-slot').height,body:document.querySelector('#upload>.section-body').clientHeight,log:box('coach-log').height,fit:getComputedStyle(document.getElementById('upload-preview')).objectFit};});
 expect(consult.overlap).toBeLessThanOrEqual(0);expect(consult.log/consult.body).toBeGreaterThanOrEqual(.2);expect(consult.fit).toBe('contain');await p.screenshot({path:path.join(root,`mockups/shots/11c_${name}_consult.png`)});
 await p.locator('#start').click();await expect(p.locator('#summary-review')).toBeVisible();
 await p.locator('#summary-review textarea').last().scrollIntoViewIfNeeded();const summary=await p.evaluate(()=>{const fields=[...document.querySelectorAll('#summary-review textarea')];const rect=document.querySelector('.summary-fields').getBoundingClientRect();return {overlap:rect.bottom-document.getElementById('summary-approve').getBoundingClientRect().top,clipped:fields.map(f=>f.scrollHeight-f.clientHeight)};});
 expect(summary.overlap).toBeLessThanOrEqual(0);expect(Math.max(...summary.clipped)).toBe(0);expect(errors).toEqual([]);results[name]={empty,consult,summary,errors};await p.close();
}fs.writeFileSync(path.join(root,'mockups/11c-empty.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
