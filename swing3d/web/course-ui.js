/* The course player is separate from measurement and coaching. No metrics are rewritten. */
(async()=>{
 'use strict';const $=id=>document.getElementById(id),M=window.MotionCourse,ns='http://www.w3.org/2000/svg';
 const el=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;};
 const text=(id,v)=>$(id).textContent=v,place=(e,p)=>{e.setAttribute('cx',p[0]);e.setAttribute('cy',p[1]);};
 let profile,reportId,trackId;
 try{
  reportId=new URLSearchParams(location.search).get('report');
  if(window.MotionCoursePreview){profile=window.MotionCoursePreview.profile;reportId=null;}
  else{
   if(!/^[a-f0-9]{32}$/.test(reportId??''))throw Error('분석 결과 화면에서 코스 플레이를 열어 주세요.');
   let saved;try{saved=JSON.parse(sessionStorage.getItem('motionguard:course:'+reportId));}catch{}
   if(saved?.reportId===reportId&&saved.profile?.revision===1){profile=saved.profile;trackId=saved.trackId;}
   else{const response=await fetch('/api/coaching/report/'+reportId);if(!response.ok)throw Error('이번 스윙 분석을 찾을 수 없습니다.');const doc=await response.json();if(doc.report_id!==reportId)throw Error('분석 기록이 일치하지 않습니다.');profile=M.profile(doc);trackId=doc.track_id;}
  }
  if(!Number.isFinite(profile?.carryFactor)||!Number.isFinite(profile?.spreadMeters)||!(profile.measuredCount>0))throw Error('유효한 스윙 계측이 없습니다.');
 }catch(error){$('course-error').hidden=false;text('course-error-message',error.message);return;}
 const resultUrl=reportId?'./?result='+reportId:'./',reportUrl=reportId&&/^[a-f0-9]{64}$/.test(trackId??'')?'report.html?'+new URLSearchParams({coaching:reportId,track:trackId}):null;
 $('return-result').href=$('course-return').href=resultUrl;if(reportUrl)$('course-report').href=reportUrl;else $('course-report').hidden=true;
 text('course-basis',window.MotionCoursePreview?'샘플 좌표 분석 기반 미리보기 · 실제 비거리/구질 아님':`이번 스윙의 ${profile.measuredCount}개 유효 항목 반영 · 과거 기록 미사용`);
 text('profile-basis',profile.basis);text('course-provenance',M.course.source+' · 홀 앵커 수동 배치. 네이버 자동 수집은 미연결.');
 for(const [club,carry] of M.clubs){const row=document.createElement('tr');for(const v of [club,Math.round(carry*profile.carryFactor)+'m']){const td=document.createElement('td');td.textContent=v;row.append(td);}$('club-table').append(row);}
 let seed=1;try{const saved=JSON.parse(sessionStorage.getItem('motionguard:course-result:'+reportId));if(saved?.reportId===reportId&&Number.isInteger(saved.seed)&&saved.seed>0&&saved.seed<1000000)seed=saved.seed;}catch{}
 let holeIndex=1,round=M.round(profile,seed),index=0,t=0,mode='ready',pausedMode='flight',auto=false,wait=0,last=0,curve,line,disposed=false;
 const paintSummary=()=>{
  round=M.round(profile,seed);text('round-total',round.total===null?'합계 미완성':round.total+'타');text('round-detail',`파 ${round.par} · ${M.course.holes.length}홀 합산\nOB·해저드 벌타 미반영`);text('round-sum',round.total??'미완성');$('round-table').replaceChildren();
  round.holes.forEach(h=>{const row=document.createElement('tr');for(const v of [h.number,h.par,h.shots.length,h.putts??'—',h.total??'—']){const cell=document.createElement('td');cell.textContent=v;row.append(cell);}$('round-table').append(row);});
  if(reportId)try{sessionStorage.setItem('motionguard:course-result:'+reportId,JSON.stringify({reportId,course:M.course.name,tee:M.course.tee,holes:9,total:round.total,seed,profileRevision:1,excluded:'OB·해저드 벌타 미반영',assumed:true}));}catch{}
 };
 const current=()=>round.holes[holeIndex],hole=()=>M.course.holes[holeIndex];
 function controls(){text('course-play',mode==='flight'||mode==='hold'?'일시정지':mode==='paused'?'이어서 재생':mode==='done'?'다시 재생':'홀 시뮬레이션 재생');$('course-shot').disabled=['flight','hold','paused','done'].includes(mode);text('shot-count',Math.min(index,current().shots.length)+' / '+current().shots.length+'샷');}
 function rows(){const list=$('course-shots');list.replaceChildren();current().shots.forEach((shot,i)=>{const li=document.createElement('li');li.dataset.done=i<index;const content=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('span'),distance=document.createElement('b');title.textContent=shot.number+'샷 · '+shot.club;sub.textContent=shot.direction;content.append(title,sub);distance.textContent=Math.round(shot.carry)+'m';li.append(content,distance);list.append(li);});}
 function ground(){const g=$('course-ground');g.replaceChildren();const provided=window.MotionCourseImages?.[holeIndex];const src=provided?.startsWith('data:image/')?provided:'./course-images/valley-'+String(holeIndex+1).padStart(2,'0')+'.png';const image=el('image',{href:src,x:0,y:0,width:537,height:797});image.addEventListener('error',()=>{text('map-caption','홀 안내 이미지를 불러오지 못했습니다. 자료 연결이 필요합니다.');$('course-play').disabled=$('course-shot').disabled=true;});g.append(image);text('map-caption','공개 홀 안내도 + 가상 샷 경로 · 조사용');
  $('course-aim').setAttribute('d','M'+hole().route.map(p=>p.join(' ')).join(' L'));
 }

 function reset(){$('course-play').disabled=false;index=0;t=0;wait=0;auto=false;mode='ready';curve=null;line=null;$('course-trails').replaceChildren();$('course-markers').replaceChildren();$('course-finish').hidden=true;$('course-progress').value=0;$('hole-choice').value=String(holeIndex);ground();place($('course-ball'),hole().route[0]);place($('course-shadow'),hole().route[0]);text('hole-title','VALLEY '+String(holeIndex+1).padStart(2,'0'));text('hole-meta','PAR '+hole().par+' · '+hole().distance+'m');text('shot-state','티샷 준비');text('shot-club','재생을 눌러 주세요');text('shot-distance','샷마다 다른 방향과 착지');text('play-status','공이 떨어진 위치에서 다음 샷 출발');rows();controls();}
 function draw(){if(!curve)return;const u=1-t,ground=[u*u*curve.a[0]+2*u*t*curve.c[0]+t*t*curve.b[0],u*u*curve.a[1]+2*u*t*curve.c[1]+t*t*curve.b[1]],lift=Math.sin(Math.PI*t)*46;place($('course-shadow'),ground);place($('course-ball'),[ground[0],ground[1]-lift]);$('course-ball').setAttribute('r',7+Math.sin(Math.PI*t)*2);if(line){const length=line.getTotalLength();line.setAttribute('stroke-dasharray',length);line.setAttribute('stroke-dashoffset',length*(1-t));}$('course-progress').value=(index+t)/current().shots.length*100;}
 function start(){if(index>=current().shots.length)return;mode='flight';t=0;wait=0;const shot=current().shots[index];curve=M.curve(shot,hole());line=el('path',{d:`M${curve.a} Q${curve.c} ${curve.b}`,fill:'none',stroke:index%2?'var(--good)':'var(--warn)','stroke-width':3,'stroke-linecap':'round'});$('course-trails').append(line);text('shot-state',(index+1)+'샷 · 비행 중');text('shot-club',shot.club);text('shot-distance','가상 비거리 '+Math.round(shot.carry)+'m · '+shot.direction);text('play-status',(index+1)+'샷 · 공이 날아가고 있어요');draw();rows();controls();}
 function land(){t=1;draw();const point=curve.b,g=el('g',{});g.append(el('circle',{cx:point[0],cy:point[1],r:11,fill:'var(--ink)',stroke:'var(--paper)','stroke-width':2}));const number=el('text',{x:point[0],y:point[1]+4,'text-anchor':'middle','font-size':12,fill:'var(--paper)'});number.textContent=index+1;g.append(number);$('course-markers').append(g);index++;mode='hold';wait=0;text('shot-state',index+'샷 · 착지');text('play-status','착지! 이 위치에서 다음 샷을 준비해요');rows();controls();}
 function finish(){mode='done';wait=0;const h=current();text('shot-state',h.reached?'그린 도착':'아직 그린에 도달하지 못했어요');text('shot-club',h.reached?h.shots.length+'온 · '+h.putts+'퍼트':'시뮬레이션 중단');text('shot-distance',h.total===null?'타수 합계 미완성':'이번 홀 '+h.total+'타');text('play-status','홀 재생 완료');$('course-finish').hidden=false;text('course-finish',h.total===null?'그린 미도달 · 타수 미확정':`${h.shots.length}온 · ${h.putts}퍼트 · ${h.total}타`);controls();}
 $('course-play').onclick=()=>{if(mode==='flight'||mode==='hold'){pausedMode=mode;mode='paused';text('play-status','일시정지');}else if(mode==='paused'){mode=pausedMode;auto=true;}else{if(mode==='done')reset();auto=true;start();}controls();};
 $('course-shot').onclick=()=>{auto=false;start();};$('course-replay').onclick=()=>{reset();auto=true;start();};$('course-new').onclick=()=>{seed++;paintSummary();reset();};$('course-next').onclick=()=>{holeIndex=(holeIndex+1)%9;reset();};$('hole-choice').onchange=()=>{holeIndex=Number($('hole-choice').value);reset();};
 M.course.holes.forEach((h,i)=>{const option=document.createElement('option');option.value=i;option.textContent=h.number+'홀 · PAR '+h.par+' · '+h.distance+'m';$('hole-choice').append(option);});
 function pauseHidden(){if(document.hidden&&(mode==='flight'||mode==='hold')){pausedMode=mode;mode='paused';controls();}}
 document.addEventListener('visibilitychange',pauseHidden);window.addEventListener('pagehide',()=>{disposed=true;});window.addEventListener('pageshow',e=>{if(e.persisted){disposed=false;last=0;requestAnimationFrame(tick);}});
 function tick(now){if(disposed)return;const dt=Math.min(60,last?now-last:0);last=now;if(mode==='flight'){t=Math.min(1,t+dt/2100);draw();if(t===1)land();}else if(mode==='hold'){wait+=dt;if(wait>=900){if(index>=current().shots.length)finish();else if(auto)start();else{mode='ready';controls();}}}else if(mode==='done'&&$('course-auto').checked&&!document.hidden){wait+=dt;if(wait>=1800){if(holeIndex===8){$('course-auto').checked=false;text('play-status','밸리 9홀 재생을 마쳤습니다.');}else{holeIndex++;reset();auto=true;start();}}}requestAnimationFrame(tick);}
 paintSummary();reset();$('course-body').hidden=false;requestAnimationFrame(tick);
})();
