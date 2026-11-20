/* Five stills leave this browser only after explicit image consent. Coordinates stay local. */
window.MotionVisual=(()=>{
 const $=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 function samples(track){
  const fps=track.meta.fps,ph={...track.meta.phase_frames},frames=track.evidence?.frames;
  if(frames&&Number.isInteger(ph.address)&&Number.isInteger(ph.down)){
   // Uppermost visible wrist pair before downswing; do not pretend this verifies club top.
   const start=Math.max(ph.address+3,ph.top-Math.round(fps*.18)),end=Math.min(ph.down-2,ph.top+Math.round(fps*.3));let best=Infinity;const reliable=frames.slice(start,end+1).filter(p=>p?.[4]?.[2]>.5&&p?.[5]?.[2]>.5).length/(end-start+1);
   for(let i=start;i<=end;i++){const a=frames[i]?.[4],b=frames[i]?.[5];if(reliable>.7&&a?.[2]>.5&&b?.[2]>.5){const y=(a[1]+b[1])/2;if(y<best){best=y;ph.top=i;}}}
  }
  return ['address','top','down','impact','finish'].map((phase,i)=>({id:i+1,phase,frame:ph[phase],time:Number((ph[phase]/fps).toFixed(4))}));
 }
 async function analyze(track,summary,signal){
  if(!window.MotionVideo?.has(track.track_id))return{mode:'unavailable',reason:'원본 영상이 없는 샘플입니다. Gemini 사진 분석을 하지 않았습니다.'};
  if(!document.getElementById('photo-consent')?.checked)throw Error('사진 5장 전송 동의가 필요합니다. 영상 원본은 보내지 않습니다.');
  const selected=samples(track);for(const s of selected){if(signal?.aborted)throw new DOMException('취소','AbortError');const c=await MotionVideo.frame(track.track_id,s.frame);if(!c)throw Error('대표사진을 추출하지 못했습니다.');s.image=c.toDataURL('image/jpeg',.85).split(',')[1];}
  const r=await fetch(new URL('api/coaching/visual',location.href),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({allow_images:true,summary,samples:selected}),signal});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.reason??'AI 분석 실패');return d;
 }
 const valid=i=>i.status!=='unassessable'&&i.confidence!=='낮음';
 function render(root,doc,track,print=false){
  const result=doc.visual_analysis;if(!result)return false;root.replaceChildren();
  root.append($('h2','사진으로 살펴본 내 스윙'));
  if(result.mode!=='gemini-images'){root.append($('p',result.reason??'이번에는 AI 사진 분석을 하지 않았습니다.'));return true;}
  root.append($('p',result.analysis.summary,'visual-summary'));
  const assessed=result.analysis.items.filter(valid).slice(0,5),uncertain=result.analysis.items.filter(i=>!valid(i));
  for(const item of assessed){const sample=result.samples.find(s=>s.id===item.sample_id);if(!sample)continue;const card=$('article',undefined,'photo-finding');card.append($('p',`${item.kind==='positive'?'잘한 점 후보':'개선 후보'} · ${MotionCustomer.phases[sample.phase]} 후보 · ${sample.time.toFixed(2)}초`,'evidence-kicker'),$('h3',item.title));
   const area=$('div',undefined,'photo-media'),staticCanvas=$('canvas'),vcanvas=$('canvas');let isVideo=false,playing=false,handle=0,start=0,busy=false;const itemForPaint={channel:item.region,positive:item.kind==='positive'};
   const offset=sample.frame-(track.meta.source_frames?.[0]??0),pose=track.evidence?.frames?.[sample.frame]??track.pose_landmarks?.[offset];
   const data=MotionEvidence.prepare(track,{...itemForPaint,frame:sample.frame,phase:sample.phase});
   if(data)MotionEvidence.paint(staticCanvas,data,data.center);else staticCanvas.hidden=true;
   staticCanvas.setAttribute('aria-label','선택 장면에 고정한 2D · '+item.title);area.append(staticCanvas);card.append(area);
   const stop=()=>{playing=false;cancelAnimationFrame(handle);if(play)play.textContent='영상 구간 반복';};let play;
   const draw=async(now)=>{if(!playing||document.hidden||!vcanvas.isConnected){stop();return;}if(!busy){busy=true;const radius=Math.round(track.meta.fps*.4),frame=Math.max(0,sample.frame-radius)+Math.floor((now-start)/1000*track.meta.fps*.5)%(radius*2+1);const p=track.evidence?.frames?.[frame];try{await MotionVideo.paint(vcanvas,track,itemForPaint,frame,p,{mark:true,isCurrent:()=>playing});}finally{busy=false;}}handle=requestAnimationFrame(draw);};
   if(!print&&MotionVideo.has(track.track_id)){const tabs=$('div',undefined,'evidence-view-tabs'),vb=$('button','내 영상'),pb=$('button','2D 정지 그림');play=$('button','영상 구간 반복');play.hidden=true;
    const mode=async(video)=>{stop();isVideo=video;area.replaceChildren(video?vcanvas:staticCanvas);play.hidden=!video;vb.setAttribute('aria-pressed',String(video));pb.setAttribute('aria-pressed',String(!video));if(video)await MotionVideo.paint(vcanvas,track,itemForPaint,sample.frame,pose,{mark:true});};vb.onclick=()=>mode(true);pb.onclick=()=>mode(false);pb.setAttribute('aria-pressed','true');vb.setAttribute('aria-pressed','false');tabs.append(vb,pb);card.insertBefore(tabs,area);play.onclick=()=>{if(playing)stop();else{document.dispatchEvent(new Event('motion-stop-video'));playing=true;start=performance.now();play.textContent='반복 멈추기';handle=requestAnimationFrame(draw);}};document.addEventListener('motion-stop-video',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});card.append(play);}
   card.append($('p','관찰 · '+item.observation),$('p','의미 · '+item.meaning),$('p','연습 · '+item.drill),$('p','2D는 해당 순간의 관절 재구성입니다. 교정 완료 모습이나 실제 사진이 아닙니다.','evidence-note'));
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
  const u=result.usage??{};if(result.failed_attempt_usage)root.append($('p',result.failed_attempt_usage,'evidence-note'));
  root.append($('p',`Gemini · ${result.model} · 사진 5장 / 입력 ${u.promptTokenCount??'미제공'} · 출력 ${u.candidatesTokenCount??'미제공'} · 총 ${u.totalTokenCount??'미제공'} 토큰 · ${(result.elapsed_ms/1000).toFixed(2)}초`,'token-usage'));
  return true;
 }
 return{samples,analyze,render};
})();
