/* Real offline API implementation for static hosting. Python remains the local-server option. */
(()=>{
 if(window.MotionStaticMode!=='browser')return;
 if('serviceWorker' in navigator)navigator.serviceWorker.register(new URL('sw.js',document.currentScript.src)).catch(()=>{window.MotionOfflineUnavailable=true;});
 const nativeFetch=window.fetch.bind(window),base=new URL('./',document.currentScript.src),memory=new Map();
 const database=new Promise((resolve,reject)=>{const r=indexedDB.open('motionguard',1);r.onupgradeneeded=()=>{for(const name of ['tracks','reports','profiles'])r.result.createObjectStore(name);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 async function access(store,key,value){
  try{const db=await database;return await new Promise((resolve,reject)=>{const transaction=db.transaction(store,value===undefined?'readonly':'readwrite'),s=transaction.objectStore(store),request=value===undefined?s.get(key):value===null?s.delete(key):s.put(value,key);let result;request.onsuccess=()=>result=request.result;transaction.oncomplete=()=>resolve(value===undefined?result:value);transaction.onerror=()=>reject(transaction.error);});}
  catch{const k=store+':'+key;if(value!==undefined){if(value===null)memory.delete(k);else memory.set(k,value);}return value===undefined?memory.get(k):value;}
 }
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
 const key=async file=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
 document.addEventListener('DOMContentLoaded',()=>{const label=document.createElement('p');label.className='site-notice';label.setAttribute('role','status');label.textContent='기기 안에서 영상 분석 · 기준 코칭 · 영상과 좌표를 외부로 보내지 않습니다.';document.querySelector('.instrument,.sheet')?.prepend(label);const c=document.getElementById('coach-consent');if(c){c.checked=false;c.disabled=true;c.closest('label').hidden=true;}});
 function summarize(messages){const texts=(messages??[]).filter(i=>i.role==='user').map(i=>i.text);return{concern:texts.slice(-2).join(' / ').slice(0,500),improvement:texts.find(t=>/팔로|몸통|회전|개선|고치/.test(t))??'',hypothesis:texts.find(t=>/느낌|같아|생각/.test(t))??'',goal:texts.find(t=>/연습|목표|하고 싶/.test(t))??''};}
 async function buildCSV(file){const data=MotionTrack.csv(await file.text()),track=MotionTrack.build(data.frames,data.fps,data.world);track.score=MotionTrack.score(track);if(track.meta.usable){const [start,end]=track.meta.source_frames;track.pose_landmarks=data.frames.slice(start,end+1).map(f=>MotionTrack.names.map(n=>[f[n][0],f[n][1],f[n][3]]));}track.track_id=await key(file);await access('tracks',track.track_id,track);return track;}
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname+'api/'))return nativeFetch(input,options);
  const route=url.pathname.slice(base.pathname.length),method=options.method??'GET';
  try{
   if(route==='api/coaching/status')return reply({mode:'demo'});
   if(route==='api/coaching/chat')return reply({mode:'demo',text:'어떤 순간에 어려운가요? 느낌과 연습 목표를 한 줄씩 적어 주세요. 영상에서 확인한 사실은 분석 후 따로 보여 드립니다.',reason:'기기 내 기준 코칭입니다. 외부 AI를 호출하지 않습니다.'});
   const data=typeof options.body==='string'?JSON.parse(options.body):{};
   if(route==='api/coaching/summary')return reply({mode:'local',summary:summarize(data.messages)});
   if(route==='api/track')return reply(await buildCSV(options.body));
   if(route==='api/video'){
    const encoder=new TextEncoder();let cancelled=false;
    const stream=new ReadableStream({async start(controller){const emit=data=>{if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify(data)+'\n'));};try{const track=await MotionPose.extract(options.body,{signal:options.signal,progress:(stage,percent)=>emit({type:'progress',stage,percent})});track.track_id=await key(options.body);if(track.evidence)track.evidence.id=track.track_id;await access('tracks',track.track_id,track);emit({type:'result',data:track});}catch(error){emit({type:'error',reason:error.message});}finally{if(!cancelled)controller.close();}},cancel(){cancelled=true;}});
    return new Response(stream,{headers:{'Content-Type':'application/x-ndjson'}});
   }
   if(route==='api/coaching/analyze'){
    if(data.approved!==true||!/^[a-f0-9-]{36}$/.test(data.profile_id??''))return reply({ok:false,reason:'상담 요약과 프로필을 확인해 주세요.'},422);
    const track=await access('tracks',data.track_id);if(!track)return reply({ok:false,reason:'이 브라우저에 분석이 없습니다.'},404);
    const doc=MotionLocalCoach.analyze(track,data.conversation_summary);doc.report_id=crypto.randomUUID().replaceAll('-','');doc.track_id=data.track_id;doc.profile_id=data.profile_id;
    const profile=await access('profiles',data.profile_id)??{profile_id:data.profile_id,entries:[]};
    const entry={report_id:doc.report_id,date:new Date().toISOString(),score_total:doc.score.total,measured_count:doc.score.measured_count,items:doc.score.items.map(({id,channel,phase,score,measured})=>({id,channel,phase,score,measured})),conditions:MotionLocalCoach.conditions(track),item_keys:doc.score.items.map(i=>i.id).sort()};
    if(profile.entries.length)doc.comparison_history=MotionLocalCoach.compare(profile.entries.at(-1),entry);profile.entries.push(entry);doc.profile=profile;doc.session=profile.entries.length;
    await access('profiles',data.profile_id,profile);await access('reports',doc.report_id,doc);return reply(doc);
   }
   const report=route.match(/^api\/coaching\/report\/([a-f0-9]{32})$/);if(report){const doc=await access('reports',report[1]);return doc?reply(doc):reply({ok:false,reason:'이 브라우저에 리포트가 없습니다.'},404);}
   const track=route.match(/^api\/track\/([a-f0-9]{64})$/);if(track){const t=await access('tracks',track[1]);return t?reply(t):reply({ok:false,reason:'분석이 없습니다.'},404);}
   const profile=route.match(/^api\/profile\/([a-f0-9-]{36})$/);if(profile){const p=await access('profiles',profile[1]);if(method==='DELETE'){for(const e of p?.entries??[])await access('reports',e.report_id,null);await access('profiles',profile[1],null);return reply({ok:true});}return p?reply(p):reply({ok:false,reason:'기록이 없습니다.'},404);}
   return reply({ok:false,reason:'지원하지 않는 요청입니다.'},404);
  }catch(error){return reply({ok:false,reason:error.message},422);}
 };
})();
