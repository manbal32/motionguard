/* Printed course data is regenerated from the SAME measured report and saved seed. */
window.MotionCourseReport=(()=>{
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 function table(headers,rows){const t=node('table',undefined,'course-data-table'),head=t.createTHead().insertRow(),body=t.createTBody();for(const h of headers)head.append(node('th',h));for(const row of rows){const tr=body.insertRow();for(const v of row)tr.insertCell().textContent=v;}return t;}
 function figure(h,index){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),load=[];svg.setAttribute('viewBox','0 0 350 640');svg.setAttribute('role','img');svg.setAttribute('aria-label',`밸리 ${h.number}홀의 가상 샷 경로. 원본 안내도 일부에 수동 좌표를 사용했습니다.`);
  const add=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);svg.append(e);return e;};
  const img=add('image',{href:window.MotionCourseImages?.[index]??`./course-images/valley-${String(h.number).padStart(2,'0')}.png`,x:0,y:0,width:537,height:797});
  load.push(new Promise(resolve=>{const done=()=>{clearTimeout(timeout);resolve();};const timeout=setTimeout(()=>{svg.hidden=true;resolve();},3000);img.addEventListener('load',done,{once:true});img.addEventListener('error',()=>{svg.hidden=true;done();},{once:true});}));
  const coords=MotionCourse.course.holes[index];
  for(const [i,shot]of h.shots.entries()){const c=MotionCourse.curve(shot,coords);add('path',{d:`M${c.a} Q${c.c} ${c.b}`,fill:'none',stroke:i%2?'var(--good)':'var(--warn)','stroke-width':4,'stroke-linecap':'round'});add('circle',{cx:c.b[0],cy:c.b[1],r:17,fill:'var(--ink)',stroke:'var(--paper)','stroke-width':2});const text=add('text',{x:c.b[0],y:c.b[1]+10,'text-anchor':'middle',fill:'var(--paper)',style:'font:var(--t-course-map-label)'});text.textContent=i+1;}
  return{svg,load};
 }
 async function render(doc){
  const root=document.getElementById('course-print');if(!root)return;root.replaceChildren();root.hidden=true;
  const data=MotionCourseLink.snapshot(doc);if(!data)return;
  const {round,profile}=data,summary=node('div',undefined,'course-summary-page');
  summary.append(node('p','COURSE PLAY · 이번 스윙 기반 가상 플레이','note'),node('h2',MotionCourse.course.name+' · '+MotionCourse.course.tee),node('p',`9홀 ${round.total}타 · 기준 파 ${round.par}`,'course-pdf-total'),node('p',`홀별 샷과 퍼팅을 합산했습니다. 이번 분석의 유효 항목 ${profile.measuredCount}개를 가상 거리·좌우 편차 가정에 연결했습니다.`,'note'));
  const totals=table(['홀','거리','파','그린까지','퍼팅','타수'],round.holes.map(h=>[h.number,h.distance+'m',h.par,h.shots.length+'샷',h.putts??'—',h.total??'미완성']));
  const sum=totals.createTFoot().insertRow();sum.insertCell().textContent='합계';sum.insertCell().textContent=round.holes.reduce((s,h)=>s+h.distance,0)+'m';sum.insertCell().textContent=round.par;sum.insertCell().textContent=round.holes.reduce((s,h)=>s+h.shots.length,0)+'샷';sum.insertCell().textContent=round.holes.reduce((s,h)=>s+(h.putts??0),0);sum.insertCell().textContent=round.total;summary.append(totals);
  summary.append(node('h3','클럽별 거리 가정'),node('p','실측 비거리가 아닌 시뮬레이션 기준값입니다. 실제 샷은 거리 편차와 좌우 편차를 더해 생성합니다.','note'));
  summary.append(table(['클럽','기준 거리','클럽','기준 거리'],Array.from({length:Math.ceil(MotionCourse.clubs.length/2)},(_,i)=>{const left=MotionCourse.clubs[i*2],right=MotionCourse.clubs[i*2+1];return[left[0],Math.round(left[1]*profile.carryFactor)+'m',right?.[0]??'퍼터',right?Math.round(right[1]*profile.carryFactor)+'m':'기본 2~3퍼트'];})));
  summary.append(node('p','OB·해저드 충돌/벌타 미반영 · 과거 라운드 기록 미사용 · 실제 비거리·구질·타수와 다를 수 있습니다.','course-limit'),node('p',`자료: ${MotionCourse.course.source}. 티·그린·경로는 수동 배치이며 네이버 자동 경로 인식 결과가 아닙니다. 플레이 시나리오 ${data.seed}.`,'note'));
  root.append(summary);const pending=[];
  for(let first=0;first<round.holes.length;first+=3){const group=node('div',undefined,'course-hole-page');group.append(node('h2',`홀별 샷 기록 · ${first+1}–${Math.min(first+3,9)}홀`));
   for(let i=first;i<Math.min(first+3,round.holes.length);i++){
    const h=round.holes[i],article=node('article',undefined,'course-pdf-hole'),left=node('div',undefined,'course-pdf-map'),right=node('div',undefined,'course-pdf-shots'),picture=figure(h,i);pending.push(...picture.load);left.append(picture.svg,node('p','원본 안내도 일부 + 가상 경로','course-map-note'));right.append(node('h3',`${h.number}홀 · PAR ${h.par} · ${h.distance}m`),node('p',`${h.shots.length}온 · ${h.putts}퍼트 · ${h.total}타`,'course-hole-result'));
    right.append(table(['샷','클럽','이동 거리','방향'],h.shots.map(s=>[s.number,s.club,Math.round(s.carry)+'m',s.direction])));
    right.append(node('p','각 샷은 이전 착지점에서 출발합니다. 경로·구질·거리와 퍼팅은 모델 가정입니다.','note'));article.append(left,right);group.append(article);
   }
   root.append(group);
  }
  root.hidden=false;await Promise.all(pending);
  root.querySelectorAll('.course-pdf-map').forEach(map=>{if(map.querySelector('svg').hidden)map.querySelector('p').textContent='지도 자료 미연결 · 샷 기록 참조';});
 }
 return{render};
})();
