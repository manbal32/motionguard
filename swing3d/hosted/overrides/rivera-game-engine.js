/* Local arcade rules. Every stroke is played by the user, without coaching inference. */
((global)=>{
 'use strict';
 const clubs=[{id:'driver',label:'드라이버',range:220},{id:'wood',label:'5번 우드',range:185},{id:'utility',label:'유틸리티',range:170},{id:'iron5',label:'5번 아이언',range:155},{id:'iron7',label:'7번 아이언',range:135},{id:'iron9',label:'9번 아이언',range:115},{id:'pw',label:'PW',range:90},{id:'sw',label:'SW',range:60},{id:'putter',label:'퍼터',range:20}];
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),cup=h=>({x:0,y:h.distance});
 function courses(data,front,back){const a=data.courses.find(c=>c.id===front),b=data.courses.find(c=>c.id===back);if(!a||!b||a.id===b.id||a.holes.length!==9||b.holes.length!==9)throw Error('서로 다른 9홀 코스를 골라 주세요.');return[a,b];}
 function holes(data,state){return courses(data,state.front,state.back).flatMap(c=>c.holes.map(h=>({...h,courseId:c.id,courseLabel:c.label})));}
 function create(data,front='valley',back='lake',seed=Date.now()){courses(data,front,back);return{revision:1,dataRevision:data.revision,front,back,seed:seed>>>0,holeIndex:0,completed:[],shots:[],ball:{x:0,y:0},phase:'ready',club:'driver',aim:0,power:85};}
 function strokeCount(state){return state.concededStrokes??state.shots.length;}
 function total(state){return state.completed.reduce((n,h)=>n+h.strokes,0)+(state.phase==='finished'?0:strokeCount(state));}
 function random(seed){let n=(seed+0x6D2B79F5)>>>0;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296;}
 function recommend(h,ball){const remaining=distance(ball,cup(h));return remaining<=14?'putter':(clubs.find(c=>c.id!=='putter'&&c.range<=remaining+12)??clubs[7]).id;}
 function predict(state,h){const club=clubs.find(c=>c.id===state.club);if(!club)throw Error('클럽을 선택해 주세요.');return club.range*clamp(Number(state.power)||1,1,100)/100;}
 function hit(state,h){
  if(state.phase!=='ready'||state.shots.length>=12)throw Error('현재 샷이 끝난 뒤 다시 쳐 주세요.');
  if(!Number.isFinite(state.aim)||!Number.isFinite(state.power))throw Error('방향과 힘을 확인해 주세요.');
  const club=clubs.find(c=>c.id===state.club);if(!club)throw Error('클럽을 선택해 주세요.');
  const start={...state.ball},target=cup(h),remaining=distance(start,target);if(remaining<.01)throw Error('이미 홀에 도착했습니다.');
  const aim=clamp(state.aim,-65,65)*Math.PI/180,ux=(target.x-start.x)/remaining,uy=(target.y-start.y)/remaining,dx=ux*Math.cos(aim)+uy*Math.sin(aim),dy=uy*Math.cos(aim)-ux*Math.sin(aim),putt=club.id==='putter',seed=state.seed+state.holeIndex*7919+state.shots.length*101;
  const carry=predict(state,h)*(putt?1:.97+.06*random(seed)),lateral=putt?0:(random(seed+19)-.5)*Math.min(4,carry*.035);
  let end={x:clamp(start.x+dx*carry-dy*lateral,-80,80),y:clamp(start.y+dy*carry+dx*lateral,-35,h.distance+50)};
  const holed=distance(end,target)<(putt?.65:.45);if(holed)end=target;
  const shot={start,end,carry,putt,holed,club:club.label,remaining:distance(end,target)};state.pending=shot;state.phase='animating';return shot;
 }
 function complete(state,h){if(state.phase!=='animating'||!state.pending)throw Error('진행 중인 샷이 없습니다.');const shot=state.pending;delete state.pending;state.ball={...shot.end};state.shots.push(shot);if(shot.holed||state.shots.length>=12){state.phase='holed';if(!shot.holed)state.concededStrokes=12;}else{state.phase='ready';const next=recommend(h,state.ball);if(next==='putter'&&state.club!=='putter')state.power=50;state.club=next;state.aim=0;}return shot;}
 function concede(state,h){if(state.phase!=='ready')throw Error('샷이 끝난 뒤 홀을 마무리해 주세요.');state.concededStrokes=Math.min(12,Math.max(h.par+5,state.shots.length+1));state.phase='holed';}
 function undo(state){if(state.phase==='animating'||state.phase==='finished')return false;if(state.concededStrokes){delete state.concededStrokes;if(state.shots.length>=12){const last=state.shots.pop();state.ball={...last.start};}state.phase='ready';return true;}const last=state.shots.pop();if(!last)return false;state.ball={...last.start};state.phase='ready';state.aim=0;return true;}
 function next(data,state){if(state.phase!=='holed')throw Error('홀을 마무리한 뒤 이동해 주세요.');const h=holes(data,state)[state.holeIndex];state.completed.push({number:state.holeIndex+1,courseId:h.courseId,localNumber:h.number,par:h.par,strokes:strokeCount(state),conceded:!!state.concededStrokes});state.holeIndex++;state.shots=[];delete state.concededStrokes;if(state.holeIndex===18){state.phase='finished';return;}state.ball={x:0,y:0};state.club='driver';state.power=85;state.aim=0;state.phase='ready';}
 function project(point,h){const lengths=h.route.slice(1).map((p,i)=>Math.hypot(p[0]-h.route[i][0],p[1]-h.route[i][1])),sum=lengths.reduce((a,b)=>a+b,0);let d=point.y/h.distance*sum,index=0;while(index<lengths.length-1&&d>lengths[index])d-=lengths[index++];const a=h.route[index],b=h.route[index+1],len=lengths[index],t=d/len,scale=sum/h.distance;return[a[0]+(b[0]-a[0])*t-(b[1]-a[1])/len*point.x*scale,a[1]+(b[1]-a[1])*t+(b[0]-a[0])/len*point.x*scale];}
 function aimPoint(state,h){const end=cup(h),d=distance(state.ball,end),angle=clamp(Number(state.aim)||0,-65,65)*Math.PI/180,ux=(end.x-state.ball.x)/(d||1),uy=(end.y-state.ball.y)/(d||1),length=predict(state,h);return{x:state.ball.x+(ux*Math.cos(angle)+uy*Math.sin(angle))*length,y:state.ball.y+(uy*Math.cos(angle)-ux*Math.sin(angle))*length};}
 function restore(data,value){
  try{const s=typeof value==='string'?JSON.parse(value):structuredClone(value);if(s?.revision!==1||s.dataRevision!==data.revision)throw Error();const all=holes(data,s);if(!Number.isInteger(s.holeIndex)||s.holeIndex<0||s.holeIndex>18||!Array.isArray(s.completed)||s.completed.length!==s.holeIndex||!Array.isArray(s.shots)||s.shots.length>12||!['ready','holed','animating','finished'].includes(s.phase))throw Error();if((s.holeIndex===18)!==(s.phase==='finished'))throw Error();if(!Number.isFinite(s.ball?.x)||!Number.isFinite(s.ball?.y)||Math.abs(s.ball.x)>80||s.ball.y< -35||s.ball.y>(all[Math.min(17,s.holeIndex)].distance+50))throw Error();if(!Number.isFinite(s.seed)||!Number.isFinite(s.aim)||!Number.isFinite(s.power)||!clubs.some(c=>c.id===s.club))throw Error();for(const[i,r]of s.completed.entries())if(r.number!==i+1||r.par!==all[i].par||r.courseId!==all[i].courseId||!Number.isInteger(r.strokes)||r.strokes<1||r.strokes>12)throw Error();for(const shot of s.shots)for(const p of[shot.start,shot.end])if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))throw Error();if(s.concededStrokes!==undefined&&(!Number.isInteger(s.concededStrokes)||s.concededStrokes<1||s.concededStrokes>12))throw Error();if(s.phase==='animating'){s.phase='ready';delete s.pending;}return s;}catch{return null;}
 }
 const api={clubs,create,courses,holes,hit,complete,concede,undo,next,project,aimPoint,recommend,predict,distance,cup,total,strokeCount,restore};global.MotionRiveraGame=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
