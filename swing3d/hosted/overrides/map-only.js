/* A map-only view of the actual public image. No swing upload or hole inference. */
(()=>{
 const $=id=>document.getElementById(id),status=$('map-status'),canvas=$('map-canvas'),stage=$('map-stage');
 let current,zoom=1,cropped=true,searchController,searchGeneration=0,imageGeneration=0;
 const cropFor=c=>c.preview_crop;
 function layout(){
  if(!current)return;
  const c=current.candidate,crop=cropped&&cropFor(c),box=crop||{x:0,y:0,width:c.width,height:c.height};
  canvas.style.width=zoom*100+'%';canvas.style.aspectRatio=box.width+'/'+box.height;
  Object.assign(current.image.style,{left:-box.x/box.width*100+'%',top:-box.y/box.height*100+'%',width:c.width/box.width*100+'%',height:c.height/box.height*100+'%'});
  $('zoom-value').textContent=Math.round(zoom*100)+'%';$('zoom-out').disabled=zoom<=1;$('zoom-in').disabled=zoom>=3;
  $('crop-toggle').hidden=!cropFor(c);$('crop-toggle').textContent=cropped?'전체 이미지 보기':'지도만 보기';$('crop-toggle').setAttribute('aria-pressed',String(!!crop));
 }
 async function show(candidate,name){
  const generation=++imageGeneration;stage.setAttribute('aria-busy','true');
  try{
   const img=document.createElement('img');img.alt=name+' 코스 지도';img.decoding='async';
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{img.onload=img.onerror=null;reject(Error('지도 이미지를 불러오는 시간이 길어지고 있습니다.'));},20000);img.onload=()=>{clearTimeout(timer);resolve();};img.onerror=()=>{clearTimeout(timer);reject(Error('지도 이미지를 불러오지 못했습니다.'));};img.src='./api/courses/image?'+new URLSearchParams({url:candidate.image_url});});
   if(generation!==imageGeneration)return;
   const measured={...candidate,width:img.naturalWidth||candidate.width,height:img.naturalHeight||candidate.height};
   // The known crop belongs to one exact source size; never crop an unrelated map.
   if(measured.width!==candidate.width||measured.height!==candidate.height)delete measured.preview_crop;
   current={candidate:measured,image:img};zoom=1;cropped=true;canvas.replaceChildren(img);layout();stage.scrollTop=stage.scrollLeft=0;
   $('map-name').textContent=name;$('map-description').textContent=candidate.preview_label||'검색에서 찾은 코스 지도';
   const source=$('map-source');try{const u=new URL(candidate.source_page);if(!['http:','https:'].includes(u.protocol))throw Error();source.href=u.href;source.hidden=false;}catch{source.hidden=true;source.removeAttribute('href');}
   status.textContent=name+' 지도를 불러왔습니다.';
  }catch(e){if(generation===imageGeneration)status.textContent=e.message+(current?' 현재 지도는 그대로 유지합니다.':' 검색으로 다시 시도해 주세요.');}
  finally{if(generation===imageGeneration)stage.setAttribute('aria-busy','false');}
 }
 async function json(path,init={}){const response=await fetch(path,init);let d;try{d=await response.json();}catch{throw Error('지도 서버 응답을 확인하지 못했습니다.');}if(!response.ok||!d.ok)throw Error(d.reason||'지도를 찾지 못했습니다.');return d;}
 $('zoom-in').onclick=()=>{zoom=Math.min(3,Math.round((zoom+.5)*10)/10);layout();};$('zoom-out').onclick=()=>{zoom=Math.max(1,zoom-.5);layout();};$('zoom-reset').onclick=()=>{zoom=1;layout();stage.scrollTop=stage.scrollLeft=0;};$('crop-toggle').onclick=()=>{cropped=!cropped;layout();};
 $('map-form').onsubmit=async event=>{
  event.preventDefault();const name=$('map-query').value.trim();if(name.length<2){status.textContent='골프장 이름을 두 글자 이상 입력해 주세요.';return;}
  searchController?.abort();searchController=new AbortController();const controller=searchController,signal=controller.signal,generation=++searchGeneration,timer=setTimeout(()=>controller.abort(),90000);++imageGeneration;stage.setAttribute('aria-busy','false');$('map-search').disabled=true;
  try{
   status.textContent=name+' 지도 이미지를 찾고 있습니다.';
   const found=await json('./api/courses/discover?'+new URLSearchParams({q:name}),{signal});if(!found.candidates?.length)throw Error('검색에서 지도 이미지를 찾지 못했습니다.');
   let maps=found.candidates.filter(c=>c.verified_map_source);
   if(!maps.length){status.textContent='검색 이미지에서 코스 지도를 고르고 있습니다.';const selected=await json('./api/courses/select-maps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({course_name:name,candidates:found.candidates.slice(0,20)}),signal});maps=(selected.indices??[]).map(i=>found.candidates[i]).filter(Boolean);}
   if(generation!==searchGeneration)return;if(!maps.length)throw Error('검색 결과에서 사용할 코스 지도를 찾지 못했습니다.');
   const alternatives=$('map-alternatives');alternatives.replaceChildren();
   const select=async(candidate,button)=>{for(const b of alternatives.children)b.setAttribute('aria-pressed',String(b===button));await show(candidate,name);};
   for(const[i,c]of maps.entries()){const b=document.createElement('button');b.type='button';b.textContent='지도 '+(i+1);b.setAttribute('aria-pressed',String(i===0));b.onclick=()=>select(c,b);if(maps.length>1)alternatives.append(b);}
   await show(maps[0],name);
  }catch(e){if(generation===searchGeneration)status.textContent=(e.name==='AbortError'?'지도 검색이 지연되고 있습니다. 다시 시도해 주세요.':e.message)+(current?' 현재 지도는 그대로 유지합니다.':'');}
  finally{clearTimeout(timer);if(generation===searchGeneration)$('map-search').disabled=false;}
 };
 fetch('./map-preview-sources.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(sources=>{if(searchGeneration===0&&sources[0])return show(sources[0],sources[0].course_name);}).catch(()=>{if(!searchGeneration)status.textContent='기본 지도를 불러오지 못했습니다. 골프장 이름으로 검색해 주세요.';stage.setAttribute('aria-busy','false');});
})();
