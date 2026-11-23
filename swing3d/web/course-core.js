/* Seeded illustrative golf model. No ball, clubface, speed or handedness was measured.
 * Do not use this heuristic as a calibrated predictor. No history or target total input.
 */
(function(global){
 'use strict';
 const clubs=[['드라이버',205],['3번 우드',185],['5번 우드',175],['유틸리티',165],['5번 아이언',155],['6번 아이언',145],['7번 아이언',135],['8번 아이언',125],['9번 아이언',115],['PW',95],['SW',65]];
 const pars=[4,5,3,4,4,3,5,4,4],distances=[244,509,116,315,323,115,412,277,294];
 const routes=[[[241,477],[205,320],[148,184],[82,110]],[[134,533],[150,362],[151,168],[146,62]],[[220,507],[179,256],[141,205]],[[169,504],[180,254],[120,110]],[[156,534],[151,259],[101,120]],[[113,409],[126,123]],[[173,552],[160,310],[160,137],[142,75]],[[153,538],[138,210],[156,80]],[[115,541],[163,211],[128,75]]];
 const course={id:'rivera-valley',name:'리베라CC · 밸리',tee:'화이트티',source:'2023-08-24 공개 홀 안내 · 최신 공식 대조 미완료',sourceUrl:'https://kaypen.tistory.com/entry/리베라CC-골프코스-소개-및-공략법',holes:pars.map((par,i)=>({number:i+1,par,distance:distances[i],route:routes[i]}))};
 function rng(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
 function profile(doc){
  const allowed=doc?.score?.items?.filter(i=>Number.isFinite(i.score)&&i.score>=0&&i.score<=100&&Number.isFinite(i.measured)&&Number.isFinite(i.reference))??[];
  if(!allowed.length)throw Error('현재 스윙의 유효한 계측이 없습니다. 먼저 스윙을 분석해 주세요.');
  const mean=allowed.reduce((a,i)=>a+i.score,0)/allowed.length;
  return {revision:1,reportId:doc.report_id??null,measuredCount:allowed.length,mean,carryFactor:.9+.15*mean/100,spreadMeters:8+14*(1-mean/100),basis:'이번 영상의 유효 항목 점수를 가상 거리·편차 가정에 연결했습니다. 실측 비거리·구질이 아닙니다.'};
 }
 function clubFor(remaining,p,tee){if(remaining<55)return{name:'SW · 거리 조절',carry:remaining};const available=tee?clubs:clubs.slice(1);const c=available.find(([,m])=>m*p.carryFactor<=remaining+6)??clubs.at(-1);return{name:c[0],carry:Math.min(remaining,c[1]*p.carryFactor)};}
 function hole(h,p,seed){
  if(!Number.isFinite(p.carryFactor)||!Number.isFinite(p.spreadMeters))throw Error('샷 가정을 확인해 주세요.');
  const random=rng(seed+h.number*7919);let current={x:0,y:0};const green={x:0,y:h.distance},shots=[];
  while(Math.hypot(green.x-current.x,green.y-current.y)>8&&shots.length<12){
   const remaining=Math.hypot(green.x-current.x,green.y-current.y),club=clubFor(remaining,p,shots.length===0),dx=green.x-current.x,dy=green.y-current.y,ux=dx/remaining,uy=dy/remaining;
   const carry=club.carry*(.93+.14*random()),spread=Math.min(p.spreadMeters*(club.carry/160),remaining<55?4:25),lateral=(random()*2-1)*spread;
   const end={x:current.x+ux*carry-uy*lateral,y:current.y+uy*carry+ux*lateral};
   shots.push({number:shots.length+1,club:club.name,carry,direction:lateral>1?'왼쪽 편차':lateral<-1?'오른쪽 편차':'중앙 부근',lateral,start:{...current},end,remaining:Math.hypot(green.x-end.x,green.y-end.y)});current=end;
  }
  const reached=Math.hypot(current.x,current.y-h.distance)<=8,putts=reached?(random()<.16?3:2):null;
  return {number:h.number,par:h.par,distance:h.distance,shots,reached,putts,total:reached?shots.length+putts:null,seed};
 }
 function round(p,seed=1){const holes=course.holes.map(h=>hole(h,p,seed));return{courseId:course.id,seed,holes,total:holes.every(h=>h.total!==null)?holes.reduce((a,h)=>a+h.total,0):null,par:pars.reduce((a,b)=>a+b,0),profile:p};}
 // Map an illustrative local shot plane onto manually placed image anchors.
 function project(point,h){const route=h.route,lengths=route.slice(1).map((p,i)=>Math.hypot(p[0]-route[i][0],p[1]-route[i][1])),sum=lengths.reduce((a,b)=>a+b,0);let distance=point.y/h.distance*sum;let i=0;while(i<lengths.length-1&&distance>lengths[i])distance-=lengths[i++];const a=route[i],b=route[i+1],t=distance/lengths[i],dx=b[0]-a[0],dy=b[1]-a[1],scale=sum/h.distance;return[a[0]+dx*t-dy/lengths[i]*point.x*scale,a[1]+dy*t+dx/lengths[i]*point.x*scale];}
 function curve(shot,h){const a=project(shot.start,h),b=project(shot.end,h),bend=shot.lateral*1.3;return{a,b,c:[(a[0]+b[0])/2+bend,(a[1]+b[1])/2]};}
 const api={clubs,course,profile,hole,round,project,curve};global.MotionCourse=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
