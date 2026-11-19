const {chromium,expect}=require('playwright/test');
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..'),shots=path.join(root,'mockups/shots'),url=process.env.BUILD_TEST_URL;
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const metrics={screens:{},errors:[]};
 try{
 for(const [prefix,width,height] of [['m',390,844],['d',1440,900]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2});const p=await context.newPage();p.on('pageerror',e=>metrics.errors.push(e.message));
  await p.goto(url);await p.locator('#csv').setInputFiles(path.join(root,'samples/swing_front_landmarks.csv'));
  const message=p.locator('#coach-message');await message.fill('백스윙 탑에서 몸통 회전이 궁금합니다.');
  await message.evaluate(e=>{e.dispatchEvent(new CompositionEvent('compositionstart'));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});
  expect(await p.locator('#coach-log li:not(.coach-welcome)').count()).toBe(0);
  await message.evaluate(e=>e.dispatchEvent(new CompositionEvent('compositionend')));await message.press('Shift+Enter');expect(await message.inputValue()).toContain('\n');await message.press('Enter');await expect(p.locator('#coach-send')).toBeEnabled();
  await message.fill('회전 순서를 천천히 연습하고 싶어요.');await p.locator('#coach-send').click();await expect(p.locator('#coach-send')).toBeEnabled();
  const snap=async name=>{await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(shots,name+'.png')});metrics.screens[name]=[width,height,2];};
  await snap(prefix+'1_upload');let analyzeCalls=0;p.on('request',r=>{if(r.url().endsWith('/api/coaching/analyze'))analyzeCalls++});
  await p.locator('#start').click();await expect(p.locator('#summary-review')).toBeVisible();expect(analyzeCalls).toBe(0);
  await p.locator('#summary-edit').click();await p.locator('[name=concern]').fill('백스윙 탑에서 몸통 회전이 궁금합니다.');await p.locator('[name=goal]').fill('회전 순서를 천천히 연습');await snap(prefix+'2_summary');
  await p.locator('#summary-approve').click();await expect(p.locator('#overlay')).toBeVisible();await p.locator('#flow-back').click();await expect(p.locator('#results')).toBeVisible();expect(analyzeCalls).toBe(1);await expect(p.locator('#history-comparison')).toBeHidden();await snap(prefix+'3_result');
  const firstProfile=await p.evaluate(()=>MotionProfileId),reportLink=await p.locator('#result-report').getAttribute('href');
  await p.locator('#show-points').click();await p.waitForTimeout(1700);await snap(prefix+'4_point');expect(await p.locator('#exaggerated').getAttribute('data-landmark-count')).toBe('22');
  metrics[prefix+'point']=await p.locator('#exaggerated').evaluate(c=>({css:[c.clientWidth,c.clientHeight],frame:+c.dataset.frame,points:+c.dataset.landmarkCount}));
  if(prefix==='d'){
   await p.locator('#playback-details > summary').click();await p.locator('#result-details > summary').click();await p.locator('#swing-details > summary').click();
   await expect(p.locator('#viewer canvas')).toBeVisible({timeout:15000});
   const downloadPromise=p.waitForEvent('download',{timeout:60000});await p.locator('#record').click();const download=await downloadPromise;
   const file=await download.path();metrics.webmBytes=fs.statSync(file).size;expect(metrics.webmBytes).toBeGreaterThan(1000);
  }
  const r=await context.newPage();r.on('pageerror',e=>metrics.errors.push(e.message));await r.goto(new URL(reportLink,url).href);await expect(r.locator('#report-body')).toBeVisible();await r.evaluate(()=>document.fonts.ready);await r.screenshot({path:path.join(shots,prefix+'5_report.png')});metrics.screens[prefix+'5_report']=[width,height,2];
  const body=await r.locator('#customer-body').innerText();expect(body).not.toMatch(/신뢰도|프레임|정규화|채널/);expect(await r.locator('.gap-row').count()).toBe(3);expect(await r.locator('#report-videos a[data-curated=true]').count()).toBe(3);expect(body).toContain('평지가 많은 코스 기준입니다.');
  metrics.report={zeroDifferences:await r.locator('.gap-row').evaluateAll(es=>es.filter(e=>Math.abs(+e.dataset.difference)<.0001).length),curated:await r.locator('#report-videos a[data-curated=true]').count(),forbidden:body.match(/신뢰도|프레임|정규화|채널/g)??[]};
  if(prefix==='m'){
   await r.pdf({path:path.join(shots,'report.pdf'),preferCSSPageSize:true,printBackground:true});
   await p.locator('#flow-back').click();await p.locator('#new-analysis').click();await p.locator('#start').click();await p.locator('#summary-approve').click();await expect(p.locator('#overlay')).toBeVisible();await p.locator('#flow-back').click();await expect(p.locator('#results')).toBeVisible();await expect(p.locator('#history-comparison')).toBeVisible();await snap('h1_history');expect(await p.evaluate(()=>MotionProfileId)).toBe(firstProfile);
   const secondLink=await p.locator('#result-report').getAttribute('href');await r.goto(new URL(secondLink,url).href);await expect(r.locator('#report-body')).toBeVisible();await expect(r.locator('#report-delta')).toBeVisible();await r.screenshot({path:path.join(shots,'h2_report_compare.png')});metrics.screens.h2_report_compare=[width,height,2];
   metrics.history={session:await r.locator('#report-round').innerText(),delta:await r.locator('#report-delta').innerText(),comparison:await p.locator('#history-comparison').innerText()};
   const profile=await(await p.request.get(url+'/api/profile/'+firstProfile)).json();metrics.profileEntries=profile.entries.length;expect(profile.entries).toHaveLength(2);
   await p.evaluate(()=>localStorage.clear());await p.reload();expect(await p.evaluate(()=>MotionProfileId)).not.toBe(firstProfile);metrics.resetMessage=await p.evaluate(()=>MotionProfileMessage);expect(metrics.resetMessage).toContain('이전 기록을 찾을 수 없습니다');
   expect((await p.request.delete(url+'/api/profile/'+firstProfile)).status()).toBe(200);expect((await p.request.get(url+'/api/profile/'+firstProfile)).status()).toBe(404);expect((await p.request.get(url+'/api/coaching/report/'+profile.entries[0].report_id)).status()).toBe(404);
  }
  await context.close();
 }
 const fixtures=JSON.parse(fs.readFileSync(process.env.BUILD_GUIDANCE_FIXTURES));
 for(const [i,reason] of ['too_far','tracking_failed','no_swing'].entries()){
  const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});let calls=0;
  await p.route('**/api/coaching/analyze',r=>{calls++;r.abort()});await p.route('**/api/video',r=>r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',data:fixtures[reason]})+'\n'}));
  await p.goto(url);await p.locator('#video').setInputFiles(path.join(root,'samples/golf_swing.mp4'));await p.locator('#start').click();await p.locator('#summary-approve').click();await expect(p.locator('#quality-guidance')).toBeVisible();expect(calls).toBe(0);await p.screenshot({path:path.join(shots,`g${i+1}_${['too_far','tracking','no_swing'][i]}.png`)});metrics.screens[`g${i+1}`]=[390,844,2];await p.close();
 }
 expect(metrics.errors).toEqual([]);fs.writeFileSync(path.join(root,'mockups/complete-browser.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics,null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
