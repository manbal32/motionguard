/* One sent JPEG owns each scene; legacy phase frames never replace it. */
window.MotionPhotoReplay=(()=>{
 let active;
 const scenes=doc=>(doc?.visual_analysis?.local_stills??[]).filter(s=>Number.isInteger(s.id)&&Number.isFinite(s.time)&&s.image?.startsWith('data:image/jpeg;base64,'));
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 function open(doc,track){
  active?.close();document.getElementById('original')?.pause();window.MotionEvidence?.stopAll();const list=scenes(doc);if(!list.length)return;
  const host=document.querySelector('.instrument'),panel=make('section',null,'photo-replay'),back=make('button','분석 결과로','replay-back');back.type='button';
  const heading=make('h2','내 스윙 다시 보기'),caption=make('p',null,'replay-scene-caption'),tabs=make('div',null,'replay-tabs'),photoTab=make('button','내 영상 · 부위 표시'),poseTab=make('button','2D 교정 비교');for(const b of [photoTab,poseTab])b.type='button';tabs.append(photoTab,poseTab);
  const strip=make('div',null,'replay-scene-strip'),original=make('div',null,'replay-original-view'),frame=make('div',null,'replay-media-frame'),image=make('img'),video=make('video'),marks=make('canvas');image.alt='분석에 사용한 선택 장면';video.muted=true;video.playsInline=true;video.setAttribute('playsinline','');video.preload='metadata';video.hidden=true;marks.setAttribute('aria-label','선택한 장면의 부위 표시');frame.append(image,video,marks);
  const tools=make('div',null,'replay-tools'),markButton=make('button','부위 표시 켜짐'),playButton=make('button','이 장면 영상 반복');markButton.type=playButton.type='button';tools.append(markButton,playButton);original.append(frame,tools);
  const pair=make('div',null,'replay-pose-pair'),current=make('figure'),currentPhoto=make('img'),poseCanvas=make('canvas'),guide=make('figure'),guideBox=make('div',null,'replay-guide-box');currentPhoto.alt='동일한 분석 장면';poseCanvas.hidden=true;poseCanvas.setAttribute('aria-label','선택한 분석 사진에서 읽은 현재 2D 자세');current.append(currentPhoto,poseCanvas,make('figcaption','선택한 장면'));guide.append(guideBox,make('figcaption','연습 방향 · 설명 그림'));pair.append(current,guide);
  const note=make('p','같은 장면을 선택해 사진과 2D를 확인하세요. 연습 방향 그림은 동작 설명입니다.','replay-note');panel.append(back,heading,caption,tabs,strip,original,pair,note);host.append(panel);
  const dimensions=doc.visual_analysis?.analysis?.assessment_score?.dimensions??[],focus=[...dimensions].sort((a,b)=>a.value-b.value)[0],channel=({setup:'lean',rotation:'torso',balance:'hips',arms:'swing'})[focus?.id]??'torso';guideBox.append(MotionSummary.diagram(focus?.id??'rotation'));if(focus?.drill)guideBox.append(make('p',focus.drill));
  const source=window.MotionVideo?.source?.(track.track_id);playButton.hidden=!source;if(source)video.src=source;
  let selected=list[0],pose=null,marked=true,playing=false,closed=false,raf=0,generation=0,playRequest=0;
  const buttons=[];
  const stop=()=>{playRequest++;playing=false;video.pause();cancelAnimationFrame(raf);video.hidden=true;image.hidden=false;playButton.textContent='이 장면 영상 반복';};
  function draw(){
   const w=playing?video.videoWidth:(image.naturalWidth||pose?.width),h=playing?video.videoHeight:(image.naturalHeight||pose?.height);if(!w||!h)return;
   if(marks.width!==w)marks.width=w;if(marks.height!==h)marks.height=h;const ctx=marks.getContext('2d');ctx.clearRect(0,0,w,h);marks.dataset.sampleId=String(selected.id);marks.dataset.mediaTime=String(playing?video.currentTime:selected.time);
   const data=playing?window.MotionVideo?.landmarks?.(track.track_id,video.currentTime):null,points=playing?data?.points:pose?.points;
   if(marked&&points)MotionVideo.draw(ctx,points,{channel,positive:false},{width:w,height:h});marks.hidden=!marked;
  }
  function mode(next){stop();original.hidden=next!=='photo';pair.hidden=next!=='pose';photoTab.setAttribute('aria-pressed',String(next==='photo'));poseTab.setAttribute('aria-pressed',String(next==='pose'));draw();}
  async function choose(scene){
   stop();selected=scene;pose=null;const token=++generation;panel.dataset.sampleId=String(scene.id);caption.textContent='분석 장면 '+scene.id+' · '+scene.time.toFixed(2)+'초';
   image.src=currentPhoto.src=scene.image;currentPhoto.hidden=false;poseCanvas.hidden=true;image.dataset.sampleId=currentPhoto.dataset.sampleId=String(scene.id);pair.dataset.sampleId=String(scene.id);marks.getContext('2d').clearRect(0,0,marks.width,marks.height);
   for(const [b,id] of buttons)b.setAttribute('aria-pressed',String(id===scene.id));

   try{const value=scene.pose?.revision===2?scene.pose:await window.MotionStillPose?.extract(scene.image,track.meta?.crop_box);if(closed||token!==generation||!value)return;pose=value;scene.pose=value;if(MotionStillPose.paint(poseCanvas,value)){poseCanvas.dataset.sampleId=String(scene.id);poseCanvas.hidden=false;currentPhoto.hidden=true;}draw();}catch{/* Keep the exact JPEG visible. */}
  }
  for(const scene of list){const b=make('button'),thumb=make('img');b.type='button';thumb.src=scene.image;thumb.alt='';b.append(thumb,make('span','장면 '+scene.id));b.setAttribute('aria-label','분석 장면 '+scene.id+' · '+scene.time.toFixed(2)+'초');b.onclick=()=>choose(scene);buttons.push([b,scene.id]);strip.append(b);}
  image.onload=()=>draw();photoTab.onclick=()=>mode('photo');poseTab.onclick=()=>mode('pose');markButton.setAttribute('aria-pressed','true');markButton.onclick=()=>{marked=!marked;markButton.setAttribute('aria-pressed',String(marked));markButton.textContent=marked?'부위 표시 켜짐':'부위 표시 꺼짐';draw();};
  function tick(){if(!playing||closed)return;if(video.currentTime>selected.time+.6||video.ended)video.currentTime=Math.max(0,selected.time-.4);if(!video.seeking)draw();raf=requestAnimationFrame(tick);}
  const readyVideo=()=>new Promise((resolve,reject)=>{if(video.readyState>=1){resolve();return;}const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',done);video.removeEventListener('error',fail);},done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(Error('video unavailable'));};const timer=setTimeout(fail,10000);video.addEventListener('loadedmetadata',done,{once:true});video.addEventListener('error',fail,{once:true});});
  playButton.onclick=async()=>{if(playing){stop();draw();return;}const ticket=++playRequest;playButton.disabled=true;try{await readyVideo();if(closed||ticket!==playRequest)return;video.currentTime=Math.max(0,selected.time-.4);await video.play();if(closed||ticket!==playRequest||original.hidden){video.pause();return;}playing=true;video.hidden=false;image.hidden=true;playButton.textContent='반복 멈추기';raf=requestAnimationFrame(tick);}catch{stop();note.textContent='원본 재생을 시작하지 못했습니다. 선택한 분석 사진으로 확인해 주세요.';}finally{playButton.disabled=false;}};
  const visibility=()=>{if(document.hidden){stop();draw();}};document.addEventListener('visibilitychange',visibility);
  function close(){closed=true;generation++;stop();document.removeEventListener('visibilitychange',visibility);video.removeAttribute('src');video.load();panel.remove();active=null;}
  back.onclick=close;active={close,panel,choose,mode};mode('photo');choose(selected);panel.scrollIntoView?.({block:'start'});return active;
 }
 function bind(doc,track){const button=document.getElementById('show-points');if(!button||!scenes(doc).length)return;button.hidden=false;button.onclick=()=>open(doc,track);}
 const previous=MotionCustomer.renderResult;MotionCustomer.renderResult=function(doc,track,...args){const result=previous.call(this,doc,track,...args);bind(doc,track);return result;};
 return{open,bind,scenes};
})();
