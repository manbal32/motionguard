const {chromium,expect}=require('playwright/test');const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),url=process.env.PAGES_TEST_URL||'http://127.0.0.1:8891/motionguard/';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const results={};try{
 for(const [name,width,height]of [['mobile',390,844],['desktop',1440,900]]){
  const p=await browser.newPage({viewport:{width,height},deviceScaleFactor:2}),errors=[],missing=[],outside=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()===404&&!r.url().endsWith('favicon.ico'))missing.push(r.url())});p.on('request',r=>{if(new URL(r.url()).origin!==new URL(url).origin)outside.push(r.url());});
  await p.goto(url);await expect(p.locator('.site-notice')).toContainText('기기 안에서 영상 분석');
  await p.locator('#csv').setInputFiles(path.join(root,'web/demo/sample.csv'));await p.locator('#start').click();await expect(p.locator('#summary-review')).toBeVisible();await p.locator('#summary-approve').click();await expect(p.locator('#overlay')).toBeVisible();await p.waitForTimeout(1700);await p.screenshot({path:path.join(root,`mockups/shots/11f_${name}_point.png`)});
  await p.locator('#flow-back').click();await expect(p.locator('#results')).toBeVisible();await p.locator('#result-report').click();await expect(p.locator('#report-body')).toBeVisible();await p.screenshot({path:path.join(root,`mockups/shots/11f_${name}_report.png`)});await p.locator('#return-result').click();await expect(p.locator('#results')).toBeVisible();
  expect(errors).toEqual([]);expect(missing).toEqual([]);expect(outside).toEqual([]);results[name]={errors,missing,outside,reportReturn:true};await p.close();
 }
 fs.writeFileSync(path.join(root,'mockups/11f-pages.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
