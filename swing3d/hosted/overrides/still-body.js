/* Local view-adaptive comparisons; missing joints stay missing. */
window.MotionStillBody=(()=>{
 const phases=['address','top','down','impact','finish'],armIds=[2,3,4,5];
 const visible=(p,i)=>p[i]?.[2]>=.2;
 function describe(pose){
  const p=pose?.points,aspect=pose?.width/pose?.height;
  if(!p||p.length<22||!Number.isFinite(aspect)||aspect<=0||p.some(q=>!q||!q.slice(0,3).every(Number.isFinite)))return null;
  const shoulders=[0,1].filter(i=>visible(p,i)),hips=[12,13].filter(i=>visible(p,i));
  if(!shoulders.length||!hips.length)return null;
  const xy=i=>[p[i][0]*aspect,p[i][1]],mean=ids=>ids.reduce((a,i)=>[a[0]+xy(i)[0]/ids.length,a[1]+xy(i)[1]/ids.length],[0,0]);
  const shoulder=mean(shoulders),hip=mean(hips),vx=shoulder[0]-hip[0],vy=shoulder[1]-hip[1],size=Math.hypot(vx,vy);
  if(!(size>.025))return null;
  const normalize=(point,origin,dx,dy,length)=>[(point[0]-origin[0])*(-dy)/length+(point[1]-origin[1])*dx/length,(point[0]-origin[0])*dx/length+(point[1]-origin[1])*dy/length];
  const points=p.map((q,i)=>visible(p,i)?normalize(xy(i),hip,vx/size,vy/size,size):null),features={},heights=[];
  for(const side of [0,1]){
   const sh=side,hp=side+12;
   if(!visible(p,sh)||!visible(p,hp))continue;
   const a=xy(sh),b=xy(hp),dx=a[0]-b[0],dy=a[1]-b[1],length=Math.hypot(dx,dy);
   if(length<=.025)continue;
   for(const joint of [side+2,side+4])if(visible(p,joint))features[joint]=normalize(xy(joint),a,dx/length,dy/length,length);
   if(features[side+4])heights.push(features[side+4][1]);
  }
  if(Object.keys(features).length<2||!heights.length)return null;
  const bilateralCore=[0,1,12,13].every(i=>visible(p,i)),wrists=[4,5].filter(i=>points[i]),height=bilateralCore?wrists.reduce((v,i)=>v+points[i][1],0)/wrists.length-1:heights.reduce((a,b)=>a+b,0)/heights.length;const shoulderSpan=shoulders.length===2?Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]):null;return{points,features,bilateralCore,shoulderSpan,joints:p.map(q=>[q[0]*aspect,q[1],q[2]]),height};
 }
 function roi(pose){
  const all=pose?.points;if(!all||![16,17,18,19,20,21].some(i=>all[i]?.[2]>=.35))return null;
  const p=all.filter(x=>x?.[2]>=.35);if(p.length<6)return null;
  const xs=p.map(x=>x[0]),ys=p.map(x=>x[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),w=Math.min(1,Math.max(.12,(right-left)*1.6)),h=Math.min(1,Math.max(.2,(bottom-top)*1.4));
  return{x:Math.max(0,Math.min(1-w,(left+right-w)/2)),y:Math.max(0,Math.min(1-h,(top+bottom-h)/2)),w,h};
 }
 function wristDistance(a,b){
  const x=a.body?.joints,y=b.body?.joints;if(!x||!y)return 0;
  const shoulders=[0,1].filter(i=>visible(x,i)&&visible(y,i)),hips=[12,13].filter(i=>visible(x,i)&&visible(y,i));if(!shoulders.length||!hips.length)return 0;
  const center=(j,ids)=>ids.reduce((p,i)=>[p[0]+j[i][0]/ids.length,p[1]+j[i][1]/ids.length],[0,0]);
  function normalize(j){const s=center(j,shoulders),h=center(j,hips),w=[4,5].filter(i=>visible(j,i));if(!w.length)return null;const p=center(j,w),dx=s[0]-h[0],dy=s[1]-h[1],length=Math.hypot(dx,dy);if(length<=.025)return null;return[(p[0]-s[0])*(-dy)/length**2+(p[1]-s[1])*dx/length**2,(p[0]-s[0])*dx/length**2+(p[1]-s[1])*dy/length**2];}
  const p=normalize(x),q=normalize(y);if(!p||!q)return 0;
  const commonWrist=[4,5].some(i=>visible(x,i)&&visible(y,i)),uncertainty=commonWrist?0:.2;
  return Math.max(0,Math.hypot(p[0]-q[0],p[1]-q[1])-uncertainty);
 }
 function distance(a,b){
  if(a.image===b.image)return 0;
  const x=a.body?.bilateralCore&&b.body?.bilateralCore?a.body.points:a.body?.features,y=a.body?.bilateralCore&&b.body?.bilateralCore?b.body.points:b.body?.features;if(!x||!y)return 0;
  const common=armIds.filter(i=>x[i]&&y[i]);if(common.length<2||!common.some(i=>i===4||i===5))return wristDistance(a,b);
  return Math.sqrt(common.reduce((s,i)=>s+(x[i][0]-y[i][0])**2+(x[i][1]-y[i][1])**2,0)/common.length);
 }
 function finishFor(c,before,after){return c.filter(x=>x.time>after.time+.25&&x.time<after.time+1.8&&distance(before,x)>distance(before,after)+.18&&distance(after,x)>.25).sort((a,b)=>distance(before,b)-distance(before,a))[0];}
 function verticalSequence(input){
  const c=input.filter(x=>x.body.bilateralCore);let best=null;
  for(const top of c){
   if(top.body.height<.12)continue;
   const preceding=c.filter(x=>x.time<top.time-.12&&x.time>top.time-2.5&&x.body.height<-.35),low=Math.min(...preceding.map(x=>x.body.height)),before=preceding.filter(x=>x.body.height<=low+.15).at(-1);
   if(!before||distance(before,top)<.45)continue;
   const after=c.filter(x=>x.time>top.time+.06&&x.time<top.time+.95&&x.body.height<-.35).sort((a,b)=>distance(before,a)-distance(before,b))[0];
   if(!after)continue;
   const finish=finishFor(c,before,after);if(!finish)continue;
   const target=(top.body.height+after.body.height)/2,down=c.filter(x=>x.time>top.time+.025&&x.time<after.time-.025).sort((a,b)=>Math.abs(a.body.height-target)-Math.abs(b.body.height-target))[0];
   const score=Math.min(top.body.height-before.body.height,top.body.height-after.body.height);
   if(!best||score>best.score)best={address:before,top,down,impact:after,finish,score,method:'wrist-height'};
  }
  return best;
 }
 function extension(body){const values=[0,1].flatMap(side=>{const e=body.features[side+2],w=body.features[side+4];return e&&w?[Math.hypot(...w)/(Math.hypot(...e)+Math.hypot(w[0]-e[0],w[1]-e[1]))]:[];});return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;}
 function pathSequence(c){
  let best=null;
  for(let i=1;i<c.length;i++){
   const before=c[i];if(extension(before.body)<.85||reach(before.body)<.65)continue;const stable=c.slice(0,i).filter(x=>before.time-x.time>=.25&&before.time-x.time<=1&&distance(before,x)<.2);
   if(!stable.length)continue;
   for(const top of c){
    if(top.time<=before.time+.12||top.time>before.time+2.2)continue;
    const peak=distance(before,top);if(peak<.5)continue;
    const after=c.filter(x=>x.time>top.time+.06&&x.time<top.time+1.1).sort((a,b)=>distance(before,a)-distance(before,b))[0];
    if(!after||distance(before,after)>peak*.75)continue;
    const finish=finishFor(c,before,after);if(!finish)continue;
    const between=c.filter(x=>x.time>top.time+.025&&x.time<after.time-.025),span=distance(top,after),down=between.sort((a,b)=>Math.abs(distance(top,a)-span/2)-Math.abs(distance(top,b)-span/2))[0];
    const score=peak-distance(before,after);
    if(!best||(!best.down&&down)||(Boolean(best.down)===Boolean(down)&&score>best.score))best={address:before,top,down,impact:after,finish,score,method:'body-path'};
   }
  }
  return best;
 }
 function reach(body){const values=[4,5].filter(i=>body.features[i]).map(i=>Math.hypot(...body.features[i]));return values.reduce((a,b)=>a+b,0)/values.length;}
 function firstTurn(c,initial,direction,prominence,minimumChange){let turn=null,value=initial;for(const x of c){const r=reach(x.body);if(direction*(r-value)>0){value=r;turn=x;}if(turn&&direction*(value-initial)>=minimumChange&&direction*(value-r)>=prominence&&x.time-turn.time>.04)break;}return turn&&direction*(value-initial)>=minimumChange?turn:null;}
 function reachSequence(c){
  let best=null;
  for(let i=1;i<c.length;i++){
   const before=c[i],base=reach(before.body),stable=c.slice(0,i).some(x=>before.time-x.time>=.2&&before.time-x.time<=1&&distance(before,x)<.2);if(!stable)continue;
   const top=firstTurn(c.filter(x=>x.time>before.time+.12&&x.time<before.time+2.4),base,-1,.18,Math.max(.3,base*.35));if(!top)continue;
   const folded=reach(top.body),after=firstTurn(c.filter(x=>x.time>top.time+.06&&x.time<top.time+1),folded,1,.15,.18);if(!after)continue;
   const finish=c.filter(x=>x.time>after.time+.25&&x.time<after.time+1.8&&distance(after,x)>.25&&reach(x.body)<reach(after.body)-.15).sort((a,b)=>reach(a.body)-reach(b.body))[0];if(!finish)continue;
   const middle=(folded+reach(after.body))/2,down=c.filter(x=>x.time>top.time+.025&&x.time<after.time-.025).sort((a,b)=>Math.abs(reach(a.body)-middle)-Math.abs(reach(b.body)-middle))[0],score=base+reach(after.body)-2*folded;
   if(!best||(!best.down&&down)||(Boolean(best.down)===Boolean(down)&&score>best.score))best={address:before,top,down,impact:after,finish,score,method:'arm-reach'};
  }
  return best;
 }
 function sequences(input){const c=input.filter(x=>x.body).sort((a,b)=>a.time-b.time),vertical=verticalSequence(c),fold=reachSequence(c),path=pathSequence(c),ordered=[vertical,fold,path].filter(Boolean);if(path){const preferred=ordered[0],ratio=q=>distance(q.address,q.impact)/Math.max(.01,distance(q.address,q.top));if(preferred!==path&&(preferred.method!=='arm-reach'||preferred.address.body.shoulderSpan===null||preferred.address.body.shoulderSpan<.65)&&distance(preferred.address,path.address)<.35&&ratio(path)<ratio(preferred)*.5)return[path,...ordered.filter(x=>x!==path)];}return ordered;}
 function sequence(input){return sequences(input)[0]??null;}
 function refine(c,duration){
  const s=sequence(c);let start,end;
  if(s){start=Math.max(0,s.top.time-.65);end=Math.min(duration-.03,s.impact.time+.9);}else{
   const p=c.filter(x=>x.body).sort((a,b)=>a.time-b.time);let best=0,center=null;
   for(let i=1;i<p.length;i++){if(p[i].time-p[i-1].time>1)continue;const score=distance(p[i-1],p[i]);if(score>best){best=score;center=p[i].time;}}
   if(center===null||best<.2)return[];start=Math.max(0,center-1.6);end=Math.min(duration-.03,center+1.5);
  }
  const count=Math.min(49,Math.ceil((end-start)/.04)+1);return Array.from({length:count},(_,i)=>Number((start+(end-start)*i/(count-1)).toFixed(4)));
 }
 function preparation(c,s){const possible=c.filter(x=>x.time<=s.address.time&&x.time>s.top.time-2.5),steady=possible.filter(x=>c.some(p=>x.time-p.time>=.12&&x.time-p.time<=.6&&armIds.filter(i=>x.body.features[i]&&p.body.features[i]).length>=2&&distance(x,p)<.15));return steady.length?steady:possible;}
 function select(c,s){
  if(!s?.down)return null;
  const target=phases.map(p=>s[p].time),groups=[preparation(c,s),c.filter(x=>Math.abs(x.time-s.top.time)<.18),c.filter(x=>x.time>s.top.time+.025&&x.time<s.impact.time-.025),c.filter(x=>Math.abs(x.time-s.impact.time)<.13&&x.time>s.top.time+.06),c.filter(x=>x.time>s.impact.time+.25&&x.time<=s.impact.time+1.8)].map((g,i)=>g.sort((a,b)=>Math.abs(a.time-target[i])-Math.abs(b.time-target[i])).slice(0,i===4?8:6));
  let best=null,bestScore=-Infinity;
  function search(ids,sum,min,error){
   const k=ids.length;if(k===5){const score=min+sum/10-error*.35;if(score>bestScore){bestScore=score;best=[...ids];}return;}
   for(const next of groups[k]){if(ids.length&&next.time-ids.at(-1).time<.035)continue;let low=min,total=sum;let separated=true;for(let j=0;j<ids.length;j++){const d=distance(ids[j],next),minimum=j===0&&k===3?.06:((j===1&&k===2)||(j===2&&k===3))?.1:.16;low=Math.min(low,d);total+=d;if(d<minimum)separated=false;}if(!separated)continue;ids.push(next);search(ids,total,low,error+Math.abs(next.time-target[k]));ids.pop();}
  }
  search([],0,Infinity,0);
  return best?.map((x,i)=>({...x,id:i+1,phase:phases[i],phase_unverified:true,selection_revision:'multi-view-body-v5',comparison_scope:'body-pose',sequence_method:s.method,selection_window:[best[0].time,best[4].time],min_pair_change:Math.min(...best.filter(y=>y!==x).map(y=>distance(x,y)))}))??null;
 }
 function choose(input){
  const c=input.filter(x=>x.body).sort((a,b)=>a.time-b.time);
  for(const s of sequences(c)){const result=select(c,s);if(result)return result;}
  throw Error('서로 다른 스윙 장면을 확인하지 못했습니다. 준비부터 마무리까지 보이는 영상인지 확인해 주세요.');
 }
 return{describe,roi,distance,sequences,sequence,refine,choose};
})();
