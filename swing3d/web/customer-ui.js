/* Browser-local identity. The marker contains no identifier or measurement. */
(()=>{const key='motionguard:profile';let id;try{id=localStorage.getItem(key);if(!/^[a-f0-9-]{36}$/.test(id??'')){window.MotionProfileMessage=document.cookie.includes('motionguard_seen=1')?'이전 기록을 찾을 수 없습니다. 새 프로필로 시작합니다.':'첫 기록을 시작합니다.';id=crypto.randomUUID();localStorage.setItem(key,id);}document.cookie='motionguard_seen=1; SameSite=Strict; path=/; max-age=31536000';}catch{ id=crypto.randomUUID();window.MotionProfileMessage='브라우저에 기록을 저장할 수 없어 이번 분석만 표시합니다.';}window.MotionProfileId=id;})();
/* Shared customer components. Measurements stay numeric; customer text uses Korean names. */
window.MotionCustomer=(()=>{
 const labels={swing:'스윙각',torso:'몸통 회전',hips:'골반 회전',x_factor:'어깨·골반 분리',lean:'상체 기울기',wrist:'손목 힌지',shiftX:'체중 이동',kneeL:'왼무릎',kneeR:'오른무릎',heelR:'오른 뒤꿈치'};
 const phases={address:'어드레스',top:'백스윙 탑',down:'다운스윙',impact:'임팩트',finish:'피니쉬'};
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const RATIO=['shiftX','heelR'];
 // 고객 화면에는 좌표값을 쓰지 않는다. 각도는 사람이 아는 단위라 그대로 쓰고,
 // 정규화한 비율 채널은 교본을 100 으로 둔 값으로 바꾼다. 0.177 은 뜻이 없다.
 const value=(v,channel)=>RATIO.includes(channel)?null:Number(v).toFixed(1)+'°';
 const cell=(v,item)=>{
  if(!RATIO.includes(item.channel))return value(v,item.channel);
  const r=Number(item.reference),n=Number(v);
  if(!(Math.abs(r)>1e-9))return Math.abs(n)>1e-9?'교본 밖':'0%';
  // 교본과 반대로 움직였으면 음수 퍼센트가 아니라 그렇다고 적는다.
  if(n*r<0)return '반대 방향';
  return Math.round(n/r*100)+'%';
 };
 const pair=item=>`${cell(item.measured,item)} / 교본 ${cell(item.reference,item)}`;
 const meaningful=i=>Number.isFinite(i.measured)&&Number.isFinite(i.reference)&&Math.abs(i.measured-i.reference)>1e-9;
 function improvements(doc){return (doc.customer_report?.improvements??doc.findings??[]).filter(meaningful).slice(0,3);}
 function diagram(item){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 120 90');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${labels[item.channel]} · 나 ${cell(item.measured,item)}, 교본 ${cell(item.reference,item)}`);svg.dataset.diagramChannel=item.channel;
  const el=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);svg.append(e);return e;};
  const line=(x1,y1,x2,y2,color,opacity=1,width=4,dash)=>el('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width,'stroke-opacity':opacity,'stroke-linecap':'round',...(dash?{'stroke-dasharray':dash}:{})});
  const actual=item.state==='적정'?'var(--good)':'var(--warn)';
  if(['shiftX','heelR'].includes(item.channel)){
   line(10,75,110,75,'var(--line)',1,2);
   el('rect',{x:17,y:66,width:25,height:8,rx:4,fill:'var(--ink-3)'});el('rect',{x:78,y:66,width:25,height:8,rx:4,fill:'var(--ink-3)'});
   const center=v=>60+Math.max(-1,Math.min(1,v))*35;
   if(item.channel==='shiftX'){
    el('circle',{cx:center(item.reference),cy:35,r:8,fill:'none',stroke:'var(--good)','stroke-width':2,'stroke-dasharray':'3 3'});
    el('circle',{cx:center(item.measured),cy:35,r:8,fill:actual});line(center(item.measured),44,center(item.measured),62,actual);
   }else{
    const y=v=>67-Math.max(0,Math.min(1,v))*37;
    line(80,y(item.reference),102,70,'var(--good)',.35,4,'3 3');line(80,y(item.measured),102,70,actual,1,6);
   }
  }else if(item.channel==='wrist'){
   line(16,15,53,53,'var(--ink-3)',1,8);el('circle',{cx:53,cy:53,r:8,fill:'var(--ink-2)'});
   const point=angle=>[53+45*Math.cos((angle-90)*Math.PI/180),53+45*Math.sin((angle-90)*Math.PI/180)];
   const [rx,ry]=point(item.reference),[ax,ay]=point(item.measured);line(53,53,rx,ry,'var(--good)',.35,3);line(53,53,ax,ay,actual,1,4);
  }else{
   el('ellipse',{cx:60,cy:49,rx:39,ry:25,fill:'var(--field)'});
   const ends=angle=>{const a=angle*Math.PI/180;return[60-36*Math.cos(a),49-24*Math.sin(a),60+36*Math.cos(a),49+24*Math.sin(a)]};
   line(...ends(item.reference),'var(--good)',.35,4);line(...ends(item.measured),actual,1,5);
   // Each angle is derived from this item's measured/reference values.
   for(const [angle,color,opacity] of [[item.reference,'var(--good)',.35],[item.measured,actual,1]]){
    const turn=Math.max(-179,Math.min(179,angle)),r=22,a=turn*Math.PI/180;
    el('path',{d:`M82 49 A22 22 0 ${Math.abs(turn)>180?1:0} ${turn>=0?1:0} ${60+r*Math.cos(a)} ${49+r*Math.sin(a)}`,fill:'none',stroke:color,'stroke-width':3,'stroke-opacity':opacity});
   }
  }
  return svg;
 }

 function historyChart(area,entries,current){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 700 150');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');svg.setAttribute('aria-label','회차별 총점. 촬영 조건이나 항목이 다른 기록은 점을 비웁니다.');
  const add=(tag,attrs)=>{const e=document.createElementNS(svg.namespaceURI,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);svg.append(e);return e;};
  for(const y of [20,75,130])add('line',{x1:10,y1:y,x2:690,y2:y,stroke:'var(--line)','stroke-width':1});
  let previous;
  entries.slice(-10).forEach((e,i,all)=>{
   const compatible=JSON.stringify(e.conditions)===JSON.stringify(current.conditions)&&e.item_keys?.join('|')===current.item_keys?.join('|');
   const x=all.length===1?350:20+i*660/(all.length-1),y=130-e.score_total*1.1;
   if(!compatible||!Number.isFinite(e.score_total)){previous=undefined;return;}
   if(previous)add('line',{x1:previous[0],y1:previous[1],x2:x,y2:y,stroke:'var(--good)','stroke-width':3});
   add('circle',{cx:x,cy:y,r:5,fill:'var(--good)'});previous=[x,y];
  });area.replaceChildren(svg);
 }
 function renderResult(doc,track,select){
  const $=id=>document.getElementById(id),score=doc.score??track.score;
  $('score-total').textContent=score.total===null?'—':Math.round(score.total);
  $('measured-count').textContent=`이번 영상에서는 ${score.measured_count}개 항목을 쟀습니다.`;
  const items=improvements(doc),list=$('result-items');list.replaceChildren();
  const strokes=doc.strokes;$('result-strokes').hidden=!strokes;
  if(strokes){
   const range=v=>v.map(n=>n.toFixed(1)).join('–')+'타';
   $('result-strokes-current').textContent=range(strokes.current);$('result-strokes-after').textContent=range(strokes.after);
   $('result-strokes-condition').textContent=strokes.condition;$('result-strokes-missing').textContent=strokes.missing_note;
  }
  $('score-verdict').textContent=score.total===null?'점수를 내지 못했습니다.':score.total>=80?'교본에 가까운 스윙입니다.':score.total>=60?'대체로 교본 안에 있습니다.':score.total>=40?'고칠 점이 몇 가지 있습니다.':'고칠 점이 뚜렷합니다.';
  const map=$('phase-map');map.replaceChildren();
  for(const [phase,label] of Object.entries(phases)){
   const measured=Object.hasOwn(track.meta.main_phase_frames??track.meta.phase_frames,phase);
   const findings=items.filter(i=>i.phase===phase),b=node('button',undefined,'phase-cell '+(!measured?'unmeasured':findings.length?'warn':'good'));
   b.append(node('b',label),node('span',!measured?'측정 안 됨':findings.length?'고칠 점 '+findings.length+'개':'적정'));
   b.disabled=!measured;b.dataset.phase=phase;b.onclick=()=>select(findings[0]?.id,phase);map.append(b);
  }
  for(const item of items){
   const scoreItem=score.items.find(s=>s.id===item.id)??item;
   const meter=node('article',undefined,'meter'),button=node('button'),head=node('div',undefined,'meter-head');
   head.append(node('b',labels[item.channel]),node('span',scoreItem.state??'확인','state'+(scoreItem.state==='적정'?' good':'')));
   const bar=node('div',undefined,'meter-track'),fill=node('div',undefined,'meter-fill'+(scoreItem.state==='적정'?' good':''));fill.style.width=(scoreItem.score??0)+'%';bar.append(fill);
   button.append(head,bar,node('p',`${phases[item.phase]} · ${pair(item)}`,'meter-values'));
   button.onclick=()=>select(item.id);meter.append(button);list.append(meter);
  }
  if(!items.length)list.append(node('p','이번에는 뚜렷한 차이가 있는 항목을 확정하지 않았습니다.','note'));
  const profile=doc.profile??{entries:[{report_id:doc.report_id,score_total:score.total,conditions:{},item_keys:score.items.map(i=>i.id).sort()}]};
  const entry=profile.entries.at(-1);$('history-area').hidden=profile.entries.length<=1;$('first-history').hidden=profile.entries.length>1;
  if(profile.entries.length>1)historyChart($('history-chart'),profile.entries,entry);
  $('history-note').textContent=profile.entries.length===1?'첫 기록입니다. 다음 분석부터 같은 조건의 기록을 비교합니다.':'같은 촬영 조건과 같은 항목을 기록한 회차만 이어 표시합니다.';
  $('history-comparison').hidden=!doc.comparison_history;
  $('history-comparison').textContent=doc.comparison_history?.message??'';
  $('score-change').hidden=!doc.comparison_history?.comparable;
  if(doc.comparison_history?.comparable)$('score-change').textContent=`지난번보다 ${(doc.comparison_history.total_delta>=0?'+':'')+doc.comparison_history.total_delta.toFixed(1)}점`;
  $('profile-message').textContent=window.MotionProfileMessage??'';
  $('result-report').href=new URL('report.html?'+new URLSearchParams({track:track.track_id,coaching:doc.report_id}),location.href).href;
  $('delete-profile').onclick=async()=>{if(!doc.profile_id)return;const r=await fetch('/api/profile/'+doc.profile_id,{method:'DELETE'});if(r.ok){localStorage.removeItem('motionguard:profile');location.assign(new URL('./',location.href));}};
 }
 return {node,labels,phases,value,cell,pair,meaningful,improvements,diagram,historyChart,renderResult};
})();
