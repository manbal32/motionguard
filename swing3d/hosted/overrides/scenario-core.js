/* Illustrative score-level priors, not measured launch data or a validated score predictor. */
window.MotionScenario=(()=>{
 const presets={80:{carry:1.06,spread:10,miss:.06,short:.10,three:.10,one:.13},90:{carry:1,spread:17,miss:.15,short:.20,three:.19,one:.08},100:{carry:.93,spread:24,miss:.25,short:.30,three:.29,one:.04},110:{carry:.85,spread:32,miss:.37,short:.39,three:.41,one:.02}};
 const clubs=[['드라이버',205],['3번 우드',185],['5번 우드',175],['유틸리티',165],['5번 아이언',155],['6번 아이언',145],['7번 아이언',135],['8번 아이언',125],['9번 아이언',115],['PW',95],['SW',65]];
 function random(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
 function effective(profile,improved=false){
  const grade=presets[profile.grade]?profile.grade:90,p=presets[grade],selected=(profile.improvements??[]).filter(i=>i.enabled!==false),effect=improved?Math.min(.30,selected.length*.08):0;
  return{grade,carryFactor:(profile.carryFactor??1)*p.carry,spread:p.spread*(profile.spreadMeters??15)/15*(1-effect),miss:p.miss*(1-effect*1.4),short:p.short*(1-effect),three:p.three*(1-effect*.4),one:p.one,effect,improved,selected:improved?selected:[],basis:improved?'선택한 자세 개선이 샷 일관성 향상으로 이어진다는 가정':'타수 수준별 거리·편차·미스 빈도 가정'};
 }
 function hole(h,profile,seed,improved=false){
  const p=effective(profile,improved),difficulty=Math.max(.7,Math.min(1.5,profile.difficulty??1)),rng=random((seed>>>0)+h.number*7919),shots=[],green={x:0,y:h.distance};let current={x:0,y:0};
  while(Math.hypot(green.x-current.x,green.y-current.y)>8&&shots.length<15){const n=shots.length+1,r=[rng(),rng(),rng(),rng(),rng()],remaining=Math.hypot(green.x-current.x,green.y-current.y),available=n===1?clubs:clubs.slice(1),entry=remaining<55?['SW · 거리 조절',remaining/p.carryFactor]:(available.find(([,m])=>m*p.carryFactor<=remaining+6)??clubs.at(-1)),planned=Math.min(remaining,entry[1]*p.carryFactor),miss=r[0]<p.miss*difficulty,carry=planned*(.96+.08*r[1])*(miss?1-p.short*(.6+r[2]):1),ux=(green.x-current.x)/remaining,uy=(green.y-current.y)/remaining,spread=Math.min(remaining<55?5:45,p.spread*difficulty*Math.min(1.3,planned/150)),lateral=(r[3]*2-1)*spread*(miss?1.8:1),end={x:current.x+ux*carry-uy*lateral,y:current.y+uy*carry+ux*lateral};
   shots.push({number:n,club:entry[0],carry,direction:lateral>1?'왼쪽 편차':lateral<-1?'오른쪽 편차':'중앙 부근',lateral,miss,start:{...current},end,remaining:Math.hypot(green.x-end.x,green.y-end.y)});current=end;
  }
  const reached=Math.hypot(green.x-current.x,green.y-current.y)<=8,r=rng(),putts=reached?(r<p.one?1:r>1-p.three?3:2):null;
  const visualShots=[...shots];if(reached){let start={...current};for(let i=0;i<putts;i++){const end=i===putts-1?{...green}:{x:current.x*.15,y:green.y+(current.y-green.y)*.15};visualShots.push({number:visualShots.length+1,club:'퍼터',carry:Math.hypot(end.x-start.x,end.y-start.y),direction:'그린 위 가상 퍼팅',lateral:0,putt:true,start,end,remaining:Math.hypot(green.x-end.x,green.y-end.y)});start=end;}}
  return{number:h.number,par:h.par,distance:h.distance,shots,visualShots,reached,putts,total:reached?shots.length+putts:null,seed,improved};
 }
 function round(course,profile,seed=1,improved=false){const holes=course.holes.map(h=>hole(h,profile,seed,improved));return{courseId:course.id,seed,holes,total:holes.every(h=>h.total!==null)?holes.reduce((n,h)=>n+h.total,0):null,par:course.holes.every(h=>Number.isFinite(h.par))?course.holes.reduce((n,h)=>n+h.par,0):null,profile,improved};}
 function compare(course,profile,seed=1){const current=round(course,profile,seed),improved=round(course,profile,seed,true),runs=Array.from({length:32},(_,i)=>({a:round(course,profile,i+1),b:round(course,profile,i+1,true)})),valid=runs.filter(r=>r.a.total!==null&&r.b.total!==null);return{current,improved,currentMean:valid.length?valid.reduce((n,r)=>n+r.a.total,0)/valid.length:null,improvedMean:valid.length?valid.reduce((n,r)=>n+r.b.total,0)/valid.length:null,trials:valid.length,effect:effective(profile,true).effect};}
 function attach(M){const old=M.profile;M.profile=doc=>({...old(doc),scenarioRevision:2,grade:90,difficulty:1,improvements:(doc.visual_analysis?.analysis?.items??[]).filter(i=>i.kind==='improvement'&&i.status!=='unassessable'&&i.confidence!=='낮음').slice(0,3).map((i,n)=>({id:'improvement-'+n,title:i.title,region:i.region,enabled:true}))});M.round=(p,seed=1)=>round(M.course,p,seed,window.MotionScenarioView==='improved');M.hole=(h,p,seed=1)=>hole(h,p,seed,window.MotionScenarioView==='improved');}
 return{presets,effective,hole,round,compare,attach};
})();
if(window.MotionCourse)MotionScenario.attach(MotionCourse);
