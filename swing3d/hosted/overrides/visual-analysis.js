/* Five stills leave this browser only after explicit image consent. Coordinates stay local. */
window.MotionVisual=(()=>{
 let prepared=null,preparing=null,savedAnalysis=null,pendingAnalysis=null;
 const clone=value=>JSON.parse(JSON.stringify(value));
 const cancelled=signal=>{if(signal?.aborted)throw new DOMException('분석을 취소했습니다.','AbortError');};
 const reused=(result,reason,elapsed=0)=>{const copy=clone(result);copy.reused_result=true;copy.reuse_reason=reason;copy.request_elapsed_ms=elapsed;copy.request_usage={promptTokenCount:0,candidatesTokenCount:0,totalTokenCount:0};window.MotionAudit?.record('analysis_reused',{request_id:copy.input_receipt?.request_id,reason});return copy;};
 const $=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 async function analyze(track,summary,signal,{force=false}={}){
  const began=Date.now();
  if(!window.MotionVideo?.has(track.track_id))return{mode:'unavailable',reason:'원본 영상이 없는 샘플입니다. Gemini 사진 분석을 하지 않았습니다.'};
  if(!document.getElementById('photo-consent')?.checked)throw Error('사진 5장 전송 동의가 필요합니다. 영상 원본은 보내지 않습니다.');
  cancelled(signal);
  let selected;
  if(prepared?.trackId===track.track_id)selected=prepared.samples;
  else{
   let job=preparing;
   if(!job||job.trackId!==track.track_id||job.signal!==signal){job={trackId:track.track_id,signal,promise:track.photo_samples?Promise.resolve(track.photo_samples.map(s=>({...s}))):MotionStills.extract(track,{signal})};preparing=job;}
   try{selected=await job.promise;cancelled(signal);prepared={trackId:track.track_id,samples:selected};}finally{if(preparing===job)preparing=null;}
  }
  const selectedHashes=await Promise.all(selected.map(async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(atob(s.image),c=>c.charCodeAt(0))))].map(n=>n.toString(16).padStart(2,'0')).join('')));
  cancelled(signal);
  const cleanSummary=Object.fromEntries(['concern','improvement','hypothesis','goal'].map(k=>[k,String(summary?.[k]??'').slice(0,500)]));
  const recentScore=summary?.recent_round_score;if(recentScore!==undefined&&recentScore!==null){if(!Number.isInteger(recentScore)||recentScore<54||recentScore>200)throw Error('최근 라운드 타수를 확인해 주세요.');cleanSummary.recent_round_score=recentScore;}
  if(summary?.swing_club)cleanSummary.swing_club=summary.swing_club;
  const key=JSON.stringify({revision:'concise-photo-v1',build:window.MotionBuild??'source',track:track.track_id,summary:cleanSummary,hashes:selectedHashes,samples:selected.map(({id,time,frame,phase,phase_unverified})=>({id,time,frame,phase,phase_unverified}))});
  if(!force&&savedAnalysis?.key===key&&Date.now()<savedAnalysis.expires)return reused(savedAnalysis.result,'identical-input',Date.now()-began);
  if(!force&&pendingAnalysis?.key===key&&pendingAnalysis.signal===signal){const result=await pendingAnalysis.promise;cancelled(signal);return reused(result,'shared-request',Date.now()-began);}
  async function requestAnalysis(){
   const requestId=crypto.randomUUID();window.MotionAudit?.record('photos_ready',{request_id:requestId,count:selected.length,times:selected.map(s=>s.time)});
   const r=await fetch(new URL('api/coaching/visual',location.href),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:requestId,allow_images:true,summary:cleanSummary,samples:selected}),signal});
   const d=await r.json();cancelled(signal);
   if(!r.ok||!d.ok){window.MotionAudit?.record('analysis_failed',{request_id:d.request_id??requestId,code:d.error_code??'unknown',upstream_status:d.upstream_status??null});throw Error((d.reason??'분석에 실패했습니다.')+(d.request_id?' (확인번호 '+d.request_id.slice(0,8)+')':''));}
   if(d.input_receipt?.request_id!==requestId||d.input_receipt?.photo_count!==5||d.input_receipt?.forwarded_images!==5||JSON.stringify(d.input_receipt?.image_sha256)!==JSON.stringify(selectedHashes))throw Error('서버에서 이번 분석 사진 5장의 수신을 확인하지 못했습니다. 최신 화면에서 다시 시도해 주세요.');
   window.MotionAudit?.record('ai_response',{request_id:requestId,photos:5,items:d.analysis?.items?.length??0});
   d.selection_audit={revision:'multi-view-v5',times:selected.map(s=>s.time),minimum_pose_change:Math.min(...selected.map(s=>s.min_pair_change??0)),comparison_scopes:[...new Set(selected.map(s=>s.comparison_scope??'full-frame'))],motion_area_ratio:selected[0]?.motion_area_ratio??null,selection_window:selected[0]?.selection_window??null,sequence_method:selected[0]?.sequence_method??null};
   if(d.analysis?.assessment_score)d.analysis.assessment_score.rubric='photo-four-v2-keyframes';
   d.local_stills=selected.map(({id,phase,time,image})=>({id,phase,time,image:'data:image/jpeg;base64,'+image}));return d;
  }
  const job={key,signal,promise:requestAnalysis()};pendingAnalysis=job;
  try{const result=await job.promise;cancelled(signal);savedAnalysis={key,result:clone(result),expires:Date.now()+600000};return result;}finally{if(pendingAnalysis===job)pendingAnalysis=null;}
 }
 const valid=i=>i.status!=='unassessable'&&i.confidence!=='낮음';
 function render(root,doc,track,print=false){
  const result=doc.visual_analysis;if(!result)return false;root.replaceChildren();
  root.append($('h2','사진으로 살펴본 내 스윙'));
  if(result.mode!=='gemini-images'){root.append($('p',result.reason??'이번에는 AI 사진 분석을 하지 않았습니다.'));return true;}
  root.append($('p',result.analysis.summary,'visual-summary'));
  if(print&&result.local_stills?.length){const grid=$('section',undefined,'report-original-grid');grid.append($('h3','분석에 사용한 대표사진 5장'));for(const still of result.local_stills){if(!still.image?.startsWith('data:image/jpeg;base64,'))continue;const figure=$('figure'),img=$('img');img.src=still.image;img.className='report-original-still';img.alt='분석 사진 '+still.id;figure.append(img,$('figcaption',img.alt+' · '+still.time.toFixed(2)+'초'));grid.append(figure);}root.append(grid);}
  const assessed=result.analysis.items.filter(valid).slice(0,5),uncertain=result.analysis.items.filter(i=>!valid(i));
  for(const item of assessed){const sample=result.samples.find(s=>s.id===item.sample_id);if(!sample)continue;const card=$('article',undefined,'photo-finding');card.append($('p',`${item.kind==='positive'?'잘한 점 후보':'개선 후보'} · ${'분석 장면'} · ${sample.time.toFixed(2)}초`,'evidence-kicker'),$('h3',item.title));
   const area=$('div',undefined,'photo-media'),staticCanvas=$('canvas'),vcanvas=$('canvas'),original=$('img');const still=result.local_stills?.find(s=>s.id===sample.id);let playing=false,handle=0,start=0,busy=false,view='photo';const itemForPaint={channel:item.region,positive:item.kind==='positive'};
   if(still?.image){original.src=still.image;original.alt='제미나이 분석에 사용한 원본 사진 · '+sample.time.toFixed(2)+'초';original.dataset.source='sent-analysis-jpeg';original.style.width='100%';}
   const caption=$('p','분석 사진 · '+sample.time.toFixed(2)+'초','evidence-kicker');card.querySelector('.evidence-kicker').textContent=caption.textContent;staticCanvas.hidden=true;
   let poseReady=Promise.resolve();if(still&&window.MotionStillPose&&!(result.analysis.assessment_score?.dimensions?.length&&!print)){poseReady=(still.pose?.revision===2?Promise.resolve(still.pose):MotionStillPose.extract(still.image,track.meta.crop_box)).then(pose=>{if(pose){still.pose=pose;MotionStillPose.paint(staticCanvas,pose);staticCanvas.hidden=false;}return pose;}).catch(()=>null);}
   area.append(print?staticCanvas:original);card.append(area);let play;const stop=()=>{playing=false;cancelAnimationFrame(handle);if(play)play.textContent='영상 구간 반복';};
   const draw=async now=>{if(!playing||document.hidden||!vcanvas.isConnected){stop();return;}if(!busy){busy=true;const radius=Math.round(track.meta.fps*.4),frame=Math.max(0,sample.frame-radius)+Math.floor((now-start)/1000*track.meta.fps*.5)%(radius*2+1);try{await MotionVideo.paint(vcanvas,track,itemForPaint,frame,track.evidence?.frames?.[frame],{mark:true,isCurrent:()=>playing});card.querySelector('.evidence-kicker').textContent='영상 반복 · '+(frame/track.meta.fps).toFixed(2)+'초';}finally{busy=false;}}handle=requestAnimationFrame(draw);};
   if(!print){const tabs=$('div',undefined,'evidence-view-tabs'),photoButton=$('button','분석 사진'),poseButton=$('button','같은 사진의 2D');photoButton.type=poseButton.type='button';photoButton.setAttribute('aria-pressed','true');const mode=async next=>{stop();view=next;photoButton.setAttribute('aria-pressed',String(next==='photo'));poseButton.setAttribute('aria-pressed',String(next==='pose'));card.querySelector('.evidence-kicker').textContent=next==='video'?'원본 영상 보기':'분석 사진 · '+sample.time.toFixed(2)+'초';if(play)play.hidden=next!=='video';if(next==='pose'){poseButton.disabled=true;poseButton.textContent='2D 준비 중';await poseReady;poseButton.disabled=false;poseButton.textContent='같은 사진의 2D';if(!staticCanvas.hidden)area.replaceChildren(staticCanvas);else{area.replaceChildren(original,$('p','이 장면은 사진으로 확인해 주세요.'));}}else area.replaceChildren(next==='video'?vcanvas:original);};photoButton.onclick=()=>mode('photo');poseButton.onclick=()=>mode('pose');tabs.append(photoButton,poseButton);if(MotionVideo.has(track.track_id)){const videoButton=$('button','영상 보기');videoButton.type='button';videoButton.onclick=async()=>{await mode('video');await MotionVideo.paint(vcanvas,track,itemForPaint,sample.frame,null,{mark:false});};tabs.append(videoButton);play=$('button','영상 구간 반복');play.hidden=true;play.onclick=()=>{if(playing)stop();else{document.dispatchEvent(new Event('motion-stop-video'));playing=true;start=performance.now();play.textContent='반복 멈추기';handle=requestAnimationFrame(draw);}};card.append(play);}card.insertBefore(tabs,area);document.addEventListener('motion-stop-video',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});}
   card.append($('p','관찰 · '+item.observation),$('p','의미 · '+item.meaning),$('p','연습 · '+item.drill),$('p','2D는 분석에 보낸 같은 사진에서 재구성한 자세입니다.','evidence-note'));
   if(item.kind==='improvement'){
    const links=$('section',undefined,'recommended-videos');links.append($('h4','이 피드백에 맞는 연습 영상'));
    const index=result.analysis.items.indexOf(item),found=result.recommendations?.find(r=>r.item_index===index);
    if(found?.videos?.length){for(const v of found.videos){const entry=$('article',undefined,'recommended-video'),link=$('a',v.title);link.href=v.url;link.target='_blank';link.rel='noopener noreferrer';entry.append(link,$('p',v.channel||'채널 확인 안 됨','video-channel'),$('p',v.reason),$('p',(v.review==='title_only'?'제목 확인 · 설명 미제공':'제목·공개 자료 확인')+' · 전체 영상 미검토','evidence-note'));links.append(entry);}}
    else links.append($('p','현재 확인한 자료에서 이 피드백에 맞는 영상을 찾지 못했습니다.'));
    if(found?.notice)links.append($('p',found.notice,'evidence-note'));
    if(!print){const again=$('button',found?'관련 영상 다시 찾기':'관련 영상 찾기');again.type='button';again.onclick=async()=>{again.disabled=true;again.textContent='관련 영상을 찾고 있습니다.';try{const items=result.analysis.items.map(({sample_id,title,drill,kind,status,confidence})=>({sample_id,title,drill,kind,status,confidence}));const r=await fetch('./api/coaching/videos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.reason??'영상 검색 실패');const saved=await fetch('./api/coaching/videos/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({report_id:doc.report_id,recommendations:d.recommendations})});if(!saved.ok)throw Error('추천 영상 저장 실패');result.recommendations=d.recommendations;render(root,doc,track,print);}catch(e){again.textContent=e.message;again.disabled=false;}};links.append(again);}
    links.append($('p','AI가 제시한 개선 후보와 관련된 참고 영상입니다. 사용자에게 맞는 교정 효과까지 검증한 것은 아닙니다.','evidence-note'));card.append(links);
   }
   root.append(card);
  }
  if(!assessed.length)root.append($('p','이번 사진에서는 근거가 충분한 교정점을 정하지 못했습니다. 판단 보류 내용을 확인해 주세요.'));
  const details=$('details'),summary=$('summary','판단을 미룬 내용');details.append(summary);for(const i of uncertain)details.append($('p',i.title+' · '+i.observation+(i.caution?' · '+i.caution:'')));for(const t of [...result.analysis.withheld,...result.analysis.phase_notes])details.append($('p',t));root.append(details);
  const u=result.request_usage??result.usage??{};if(result.reused_result)root.append($('p','같은 사진과 승인 내용으로 완료한 분석을 재사용했습니다. 이번 요청 사용량은 0토큰입니다.','evidence-note'));if(result.failed_attempt_usage)root.append($('p',result.failed_attempt_usage,'evidence-note'));
  root.append($('p',`분석 사용량 · 사진 5장 / 입력 ${u.promptTokenCount??'미제공'} · 출력 ${u.candidatesTokenCount??'미제공'} · 총 ${u.totalTokenCount??'미제공'} 토큰 · ${((result.request_elapsed_ms??result.elapsed_ms)/1000).toFixed(2)}초`,'token-usage'));
  const receipt=$('details',undefined,'analysis-receipt');receipt.append($('summary','이번 분석에 사용한 사진 5장'));const sent=result.input_receipt;receipt.append($('p',sent?`원본 영상에서 선택한 사진 ${sent.photo_count}장`:'이전 분석 기록 · 사진 수신 증명 미포함'));const grid=$('div',undefined,'receipt-photos');for(const still of result.local_stills??[]){const fig=$('figure'),img=$('img');img.src=still.image;img.alt='실제 분석에 보낸 장면 '+still.id;fig.append(img,$('figcaption',still.time.toFixed(2)+'초'));grid.append(fig);}receipt.append(grid);root.append(receipt);
  return true;
 }
 return{analyze,render};
})();
