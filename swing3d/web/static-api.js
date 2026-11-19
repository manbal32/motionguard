/* Static-host adapter, installed only by the Pages build. No secret or remote LLM. */
(()=>{
 if(!window.MotionStaticMode)return;
 const nativeFetch=window.fetch.bind(window),base=new URL('./',document.currentScript.src);
 const recording=nativeFetch(new URL('demo/recorded.json',base)).then(r=>{if(!r.ok)throw Error('시연 좌표를 읽지 못했습니다.');return r.json();});
 const memory=new Map(),read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return memory.get(key)??fallback;}};
 const write=(key,value)=>{memory.set(key,value);try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Explicit browser-storage notice is displayed by MotionProfile. */}};
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
 const uuid=()=>crypto.randomUUID().replaceAll('-','');
 document.addEventListener('DOMContentLoaded',()=>{
  const label=document.createElement('p');label.className='site-notice';label.setAttribute('role','status');
  label.textContent='녹화 좌표 시연 · 올린 영상은 분석하지 않습니다. 브라우저 계측은 다음 단계에서 연결합니다.';
  document.querySelector('.instrument,.sheet')?.prepend(label);
  const consent=document.getElementById('coach-consent');if(consent){consent.checked=false;consent.disabled=true;consent.closest('label').hidden=true;}
 });
 function profileEntry(doc){return{report_id:doc.report_id,date:new Date().toISOString(),score_total:doc.score.total,measured_count:doc.score.measured_count,
  items:doc.score.items.map(({id,channel,phase,score,measured})=>({id,channel,phase,score,measured})),conditions:{recording:true},item_keys:doc.score.items.map(i=>i.id).sort()};}
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname+'api/'))return nativeFetch(input,options);
  const route=url.pathname.slice(base.pathname.length),method=options.method??'GET';
  try{
   if(route==='api/coaching/status')return reply({mode:'demo'});
   if(route==='api/coaching/chat')return reply({mode:'demo',text:'어떤 순간에 어려운지 한 줄 더 적어 주세요. 이 화면은 녹화 좌표로 동작하는 시연입니다.',reason:'외부로 전송하지 않는 시연입니다.'});
   const data=typeof options.body==='string'?JSON.parse(options.body):{};
   if(route==='api/coaching/summary'){
    const texts=(data.messages??[]).filter(i=>i.role==='user').map(i=>i.text);
    return reply({mode:'demo',summary:{concern:texts[0]??'',improvement:texts.find(t=>/고치|개선|연습/.test(t))??'',hypothesis:texts.find(t=>/느낌|같아|생각/.test(t))??'',goal:texts.find(t=>/목표|연습|하고 싶/.test(t))??''},reason:'입력한 대화에서 정리했습니다.'});
   }
   if(route==='api/video'||route==='api/track')return reply(structuredClone((await recording).track));
   if(route==='api/coaching/analyze'){
    if(data.approved!==true)return reply({ok:false,reason:'요약을 먼저 승인해 주세요.'},422);
    if(!/^[a-f0-9-]{36}$/.test(data.profile_id??''))return reply({ok:false,reason:'프로필을 확인해 주세요.'},422);
    const doc=structuredClone((await recording).coaching);doc.report_id=uuid();doc.profile_id=data.profile_id;doc.conversation_summary=data.conversation_summary;doc.customer_report.concern=data.conversation_summary.concern;doc.customer_report.goal=data.conversation_summary.goal;
    const key='motionguard:static-profile:'+data.profile_id,profile=read(key,{profile_id:data.profile_id,entries:[]}),entry=profileEntry(doc),last=profile.entries.at(-1);
    if(last)doc.comparison_history={comparable:true,total_delta:Math.round((entry.score_total-last.score_total)*100)/100,message:'같은 시연 좌표로 기록한 회차입니다.'};else delete doc.comparison_history;
    profile.entries.push(entry);doc.profile=profile;doc.session=profile.entries.length;write(key,profile);write('motionguard:static-report:'+doc.report_id,doc);return reply(doc);
   }
   const report=route.match(/^api\/coaching\/report\/([a-f0-9]{32})$/);
   if(report){const doc=read('motionguard:static-report:'+report[1],null);return doc?reply(doc):reply({ok:false,reason:'이 브라우저에 리포트가 없습니다.'},404);}
   const profileId=route.match(/^api\/profile\/([a-f0-9-]{36})$/);
   if(profileId){const key='motionguard:static-profile:'+profileId[1],p=read(key,null);
    if(method==='DELETE'){for(const e of p?.entries??[])write('motionguard:static-report:'+e.report_id,null);write(key,null);return reply({ok:true});}
    return p?reply(p):reply({ok:false,reason:'기록이 없습니다.'},404);
   }
   return reply({ok:false,reason:'정적 시연에서 제공하지 않는 요청입니다.'},404);
  }catch(error){return reply({ok:false,reason:error.message},422);}
 };
})();
