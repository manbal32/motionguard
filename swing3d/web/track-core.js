/* Native JavaScript counterpart of swing_track.py and scoring.py.
   Camera-space observations and world-space observations are separate inputs.
   No sample names, expected phases, or score corrections enter this code. */
window.MotionTrack=(()=>{
 'use strict';
 const names=['LEFT_SHOULDER','RIGHT_SHOULDER','LEFT_ELBOW','RIGHT_ELBOW','LEFT_WRIST','RIGHT_WRIST','LEFT_PINKY','RIGHT_PINKY','LEFT_INDEX','RIGHT_INDEX','LEFT_THUMB','RIGHT_THUMB','LEFT_HIP','RIGHT_HIP','LEFT_KNEE','RIGHT_KNEE','LEFT_ANKLE','RIGHT_ANKLE','LEFT_HEEL','RIGHT_HEEL','LEFT_FOOT_INDEX','RIGHT_FOOT_INDEX'];
 const required=[...names.slice(0,2),...names.slice(12,14),...names.slice(2,6),...names.slice(14)];
 const channels=['swing','torso','hips','lean','wrist','shiftX','kneeL','kneeR','heelR','x_factor','confidence'];
 const phases=['address','top','down','impact','finish'];
 const guidance={too_far:'촬영 거리가 멀어 몸의 회전을 잴 수 없습니다. 몸 전체가 화면 높이의 3분의 2를 채우도록 다시 찍어 주세요.',tracking_failed:'영상이 흔들리거나 인물이 가려져 자세를 추적하지 못했습니다. 고정된 위치에서 다시 찍어 주세요.',no_swing:'스윙 한 번이 처음부터 끝까지 담기지 않았습니다. 어드레스부터 피니쉬까지 한 번만 담아 주세요.'};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),sum=a=>a.reduce((s,v)=>s+v,0),mean=a=>sum(a)/a.length;
 const range=(a,b)=>Array.from({length:Math.max(0,b-a)},(_,i)=>a+i);
 const round=(v,d=0)=>{const f=10**d,x=v*f,n=Math.floor(x);if(x-n===.5&&Number.isInteger(v*2**(d+1)))return(n%2?n+1:n)/f;return Number(v.toFixed(d));};
 const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 const mid=(f,a,b)=>[(f[a][0]+f[b][0])/2,(f[a][1]+f[b][1])/2];
 const argmin=(a,fn)=>a.reduce((best,v)=>fn(v)<fn(best)?v:best,a[0]);
 const argmax=(a,fn)=>a.reduce((best,v)=>fn(v)>fn(best)?v:best,a[0]);
 const median=a=>{const s=a.slice().sort((a,b)=>a-b),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;};
 function unwrap(values){const out=[values[0]];for(let v of values.slice(1)){while(v-out.at(-1)>Math.PI)v-=2*Math.PI;while(v-out.at(-1)<-Math.PI)v+=2*Math.PI;out.push(v);}return out;}
 function smooth(values){if(values.length<7)return values.slice();return values.map((_,i)=>{const start=clamp(i-3,0,values.length-7),t=i-start-3;return sum(range(-3,4).map(x=>values[start+x+3]*(1/7+t*x/28+(t*t-4)*(x*x-4)/84)));});}
 function acceptance(frames){let previous;return frames.map((f,i)=>{let reason=null;const [shoulder,hip,ankle]=['SHOULDER','HIP','ANKLE'].map(p=>mid(f,'LEFT_'+p,'RIGHT_'+p)[1]),h=ankle-shoulder;
  if(!required.every(n=>f[n]?.every(Number.isFinite)))reason='좌표 또는 신뢰도가 유한수가 아닙니다.';
  else if(required.every(n=>f[n][3]<=0))reason='인물 미검출로 채운 프레임은 측정 관측이 아닙니다.';
  else if(![shoulder,hip,ankle].every(y=>0<y&&y<1))reason='어깨·골반·발목이 화면 범위를 벗어났습니다.';
  else if(h<=.05+1e-12)reason='발목이 어깨보다 충분히 아래에 있지 않습니다.';
  else if(!(shoulder<hip&&hip<ankle))reason='골반이 어깨와 발목 사이에 있지 않습니다.';
  else if(previous!==undefined&&Math.abs(h/previous-1)>=.40-1e-12)reason='인물 높이가 직전 채택 프레임보다 40% 이상 급변했습니다.';
  if(reason===null)previous=h;return{frame:i,accepted:reason===null,reason};});}
 function personBox(points){const body=points.filter(p=>p[2]>=.45&&p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1);if(body.length<8)return null;return[Math.min(...body.map(p=>p[0])),Math.min(...body.map(p=>p[1])),Math.max(...body.map(p=>p[0])),Math.max(...body.map(p=>p[1]))];}
 function crop(observations,width,height){const order=[...observations.keys()].sort((a,b)=>a-b),status=acceptance(order.map(i=>observations.get(i))),valid=order.filter((_,i)=>status[i].accepted);
  const boxes=valid.map(i=>personBox(Object.values(observations.get(i)).map(p=>[p[0],p[1],p[3]]))).filter(Boolean);if(!boxes.length)throw Error('1패스에서 해부학적으로 유효한 인물을 찾지 못해 크롭할 수 없습니다.');
  const [x0,y0,x1,y1]=[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))];
  const desired=Math.ceil(Math.max((x1-x0)*width,(y1-y0)*height)*1.5),side=Math.max(1,Math.min(width,height,desired)),dl=round((x0+x1)*width/2-side/2),dt=round((y0+y1)*height/2-side/2),left=clamp(dl,0,width-side),top=clamp(dt,0,height-side);
  return{valid,box:{x:left/width,y:top/height,w:side/width,h:side/height,pixels:[left,top,side,side],source_size:[width,height],resized_side:Math.max(640,side),padding_per_side:.25,boundary_limited:side<desired||left!==dl||top!==dt}};
 }
 const toOriginal=(p,b)=>[b.x+p[0]*b.w,b.y+p[1]*b.h,p[2]*b.w,p[3]];
 function clean(frames,fps){const out=frames.map(f=>({...f})),quality={},limit=.12*64.31/fps;
  for(const name of required){const observations=frames.map(f=>f[name]),valid=observations.map(p=>p[3]>=.3);
   for(let i=1;i<observations.length-1;i++){const [a,b,c]=observations.slice(i-1,i+2).map(p=>p.slice(0,2));if(dist(a,b)>limit&&dist(b,c)>limit&&dist(a,c)<=2*limit)valid[i]=false;}
   const rejected=new Set();for(let i=1;i<observations.length;i++)if(valid[i-1]&&valid[i]&&dist(observations[i-1].slice(0,2),observations[i].slice(0,2))>limit){rejected.add(i-1);rejected.add(i);}
   const anchors=range(0,frames.length).filter(i=>valid[i]&&!rejected.has(i));if(!anchors.length)throw Error('랜드마크 신뢰도 부족');const kept=new Set(anchors);
   quality[name]=observations.map((p,i)=>clamp(p[3],0,kept.has(i)?1:.25));
   const bounds=[[-1,anchors[0]],...anchors.slice(0,-1).map((v,i)=>[v,anchors[i+1]]),[anchors.at(-1),frames.length]];
   for(const [left,right]of bounds){const a=observations[Math.max(left,anchors[0])],b=observations[Math.min(right,anchors.at(-1))];for(let i=left+1;i<right;i++)out[i][name]=a.map((x,j)=>x+(b[j]-x)*(i-left)/(right-left));}
  }return{frames:out,quality};
 }
 function wrist(frames){const sides=['LEFT','RIGHT'].map(side=>{const found=new Map();frames.forEach((f,i)=>{const p=['ELBOW','WRIST','INDEX'].map(n=>f[side+'_'+n]);if(p.some(p=>!p||p[3]<.3||!p.every(Number.isFinite)))return;const [e,w,finger]=p,a=w.slice(0,3).map((v,j)=>v-e[j]),b=finger.slice(0,3).map((v,j)=>v-w[j]),length=Math.hypot(...a)*Math.hypot(...b);if(length>1e-8)found.set(i,Math.acos(clamp(sum(a.map((v,j)=>v*b[j]))/length,-1,1)));});return found;});
  const observed=sides[0].size>=sides[1].size?sides[0]:sides[1];if(observed.size<7)return{values:null,anchors:new Set()};const keys=[...observed.keys()],values=frames.map(()=>observed.get(keys[0]));
  for(let k=0;k<keys.length-1;k++){const left=keys[k],right=keys[k+1];for(let i=left;i<right;i++)values[i]=observed.get(left)+(observed.get(right)-observed.get(left))*(i-left)/(right-left);}
  for(let i=keys.at(-1);i<frames.length;i++)values[i]=observed.get(keys.at(-1));return{values:smooth(values),anchors:new Set(keys)};
 }
 function detectPhases(source,fps,numbers){let window=Math.max(3,round(fps/12));if(window%2===0)window++;window=Math.min(window,source.length%2?source.length:source.length-1);const half=Math.floor(window/2);
  const hands=source.map((_,i)=>[0,1].map(k=>sum(range(-half,half+1).map(j=>source[clamp(i+j,0,source.length-1)][k]))/window));
  const edge=Math.ceil(fps*.07),speed=hands.map((p,i)=>{if(numbers[i]-numbers[0]<edge||numbers.at(-1)-numbers[i]<edge)return 0;const l=Math.max(0,i-1),r=Math.min(hands.length-1,i+1);return dist(hands[l],hands[r])*fps/(numbers[r]-numbers[l]);});
  const ordered=speed.slice().sort((a,b)=>a-b),q=.95*(ordered.length-1),lo=Math.floor(q),p95=ordered[lo]+(ordered[Math.min(lo+1,ordered.length-1)]-ordered[lo])*(q-lo),med=median(speed),threshold=med+(p95-med)*.35;
  let groups=[];speed.forEach((v,i)=>{if(v<=threshold)return;if(!groups.length||numbers[i]-numbers[groups.at(-1).at(-1)]>fps*.25)groups.push([i]);else groups.at(-1).push(i);});groups=groups.filter(g=>numbers[g.at(-1)]-numbers[g[0]]>=fps*.12);if(!groups.length)throw Error('스윙 구간이 없습니다.');
  const group=argmax(groups,g=>{const ys=hands.slice(g[0],g.at(-1)+1).map(p=>p[1]);return Math.max(...ys)-Math.min(...ys);}),indices=range(0,numbers.length);
  const start=argmin(indices,i=>Math.abs(numbers[i]-(numbers[group[0]]-fps*.15))),finish=argmin(indices,i=>Math.abs(numbers[i]-(numbers[group.at(-1)]+fps*.25))),top=argmin(range(start,finish+1),i=>hands[i][1]);
  const eligible=range(top+1,finish+1).filter(i=>numbers[i]>=numbers[top]+fps*.05);if(!eligible.length)throw Error('하강 구간이 없습니다.');const impact=argmax(eligible,i=>hands[i][1]);if(!(start<top&&top<impact&&impact<finish))throw Error('국면 순서를 확정하지 못했습니다.');
  const target=(hands[top][1]+hands[impact][1])/2,down=range(top+1,impact).find(i=>hands[i][1]>=target);if(down===undefined)throw Error('다운스윙이 없습니다.');
  return{indices:[start,top,down,impact,finish],diagnostics:{window,threshold,edge_frames:edge,velocity_segments:groups.map(g=>[numbers[g[0]],numbers[g.at(-1)]]),impact_height_difference:Math.abs(hands[impact][1]-hands[start][1])}};
 }
 function worldRotations(world,address){return['SHOULDER','HIP'].map(part=>{const names=['LEFT_'+part,'RIGHT_'+part],indices=[],angles=[];
  world.forEach((f,i)=>{if(!f||!names.every(n=>f[n]?.[3]>=.3&&f[n].every(Number.isFinite)))return;const [l,r]=names.map(n=>f[n]);if(Math.hypot(r[0]-l[0],r[2]-l[2])>1e-9){indices.push(i);angles.push(Math.atan2(r[2]-l[2],r[0]-l[0]));}});
  const values=world.map(()=>null);if(indices.includes(address)){const unwrapped=unwrap(angles),origin=unwrapped[indices.indexOf(address)];indices.forEach((i,j)=>values[i]=Math.atan2(Math.sin(unwrapped[j]-origin),Math.cos(unwrapped[j]-origin)));}return values;});
 }
 function unusable(fps,hold,status,reason,extra){const count=status.length,unavailable=channels.slice(0,-1);return{schema:'motionguard.swingtrack/2',channels,frame_status:status,track:status.map(()=>[...unavailable.map(()=>null),0]),events:{},meta:{...extra,usable:false,unusable_reason:reason,guidance:guidance[reason],accepted_frames:status.filter(s=>s.accepted).length,total_frames:count,fps:round(fps,2),hold,dur:round((count-1)/fps+hold,3),samples:count,source_frames:[0,count-1],backswing_sign:null,wrist_source:'unavailable',camera_facing:'unknown',address_shoulder_width_ratio:null,unavailable,rotation_sign_source:'unavailable',measured:[],modeled:[],channel_confidence:Object.fromEntries(unavailable.map(k=>[k,status.map(()=>null)])),phase_frames:{},phase_confidence:{}}};}
 function build(source,fps,world=[],extra={},hold=.30){
  if(source.length<10||!Number.isFinite(fps)||fps<=0)throw Error('좌표 표본과 영상 속도를 확인해 주세요.');
  for(const f of source)for(const name of required)if(!f[name])throw Error('필수 신체 좌표가 없습니다.');
  const diagnostics={...extra,shoulder_width_max:null},status=acceptance(source),numbers=status.filter(s=>s.accepted).map(s=>s.frame),fail=reason=>unusable(fps,hold,status,reason,diagnostics);
  if(numbers.length<source.length/2)return fail('tracking_failed');const hands=numbers.map(i=>mid(source[i],'LEFT_WRIST','RIGHT_WRIST')),observed=numbers.map(i=>source[i]),w=numbers.map(i=>world[i]??null),index=wrist(observed);
  let cleaned;try{cleaned=clean(observed,fps);}catch{return fail('tracking_failed');}const frames=cleaned.frames,quality=cleaned.quality;
  const joint=(d,a,b,c)=>{const v1=[0,1].map(j=>d[a][j]-d[b][j]),v2=[0,1].map(j=>d[c][j]-d[b][j]),length=Math.hypot(...v1)*Math.hypot(...v2);return length<1e-12?Math.PI:Math.acos(clamp(sum(v1.map((v,j)=>v*v2[j]))/length,-1,1));};
  const raw=frames.map(d=>{const sh=mid(d,'LEFT_SHOULDER','RIGHT_SHOULDER'),hp=mid(d,'LEFT_HIP','RIGHT_HIP'),hd=mid(d,'LEFT_WRIST','RIGHT_WRIST');return{sw:Math.atan2(hd[0]-sh[0],hd[1]-sh[1]),faL:Math.atan2(d.LEFT_WRIST[0]-d.LEFT_ELBOW[0],d.LEFT_WRIST[1]-d.LEFT_ELBOW[1]),shw:Math.abs(d.LEFT_SHOULDER[0]-d.RIGHT_SHOULDER[0]),hpw:Math.abs(d.LEFT_HIP[0]-d.RIGHT_HIP[0]),tlen:dist(sh,hp),hx:hp[0],kneeL:Math.PI-joint(d,'LEFT_HIP','LEFT_KNEE','LEFT_ANKLE'),kneeR:Math.PI-joint(d,'RIGHT_HIP','RIGHT_KNEE','RIGHT_ANKLE'),heelR:d.RIGHT_HEEL[1]-d.RIGHT_FOOT_INDEX[1]};});
  const fields=Object.fromEntries(Object.keys(raw[0]).map(k=>[k,smooth(['sw','faL'].includes(k)?unwrap(raw.map(r=>r[k])):raw.map(r=>r[k]))]));
  const {sw,faL:fa,shw,hpw,tlen:tln,hx,kneeL:kl,kneeR:kr,heelR:hr}=fields,shmax=Math.max(...shw),hpmax=Math.max(...hpw),tlmax=Math.max(...tln),side=extra.crop_box?.resized_side;
  diagnostics.shoulder_width_max=shmax;diagnostics.shoulder_width_pixels=side?shmax*side:null;if(side&&diagnostics.shoulder_width_pixels<60)return fail('too_far');if(Math.min(shmax,hpmax,tlmax)<=0)return fail('tracking_failed');
  let detected;try{detected=detectPhases(hands,fps,numbers);}catch{return fail('no_swing');}const [start,top,down,impact,end]=detected.indices,back=sw[top]>=sw[start]?1:-1,baseSW=sw[start],baseHX=hx[start],baseHeel=hr[start],width=shw[start]/shmax;
  const [torso,pelvis]=worldRotations(w,start),unavailable=['torso','hips','x_factor'].filter((k,j)=>!torso.some((v,i)=>j===0?v!==null:j===1?pelvis[i]!==null:v!==null&&pelvis[i]!==null));
  const deps={swing:[...required.slice(0,2),...required.slice(6,8)],torso:required.slice(0,2),hips:required.slice(2,4),x_factor:required.slice(0,4),lean:required.slice(0,4),wrist:required.slice(4,8),shiftX:required.slice(2,4),kneeL:[required[2],required[8],required[10]],kneeR:[required[3],required[9],required[11]],heelR:[required[13],required[15]]};
  const conf=Object.fromEntries(Object.keys(deps).map(k=>[k,[]])),baseLean=.40*(1-tln[start]/tlmax),baseWrist=-(fa[start]-sw[start]),track=[];
  for(let i=start;i<=end;i++){const s=(sw[i]-baseSW)*back,turn=torso[i]===null?null:round(torso[i],6),hip=pelvis[i]===null?null:round(pelvis[i],6),lean=.40*(1-tln[i]/tlmax)-baseLean+.26,wristValue=index.values?clamp(index.values[i],0,Math.PI):clamp(-(fa[i]-sw[i])-baseWrist,-.35,1.70);
   for(const [key,names]of Object.entries(deps)){let grade=mean(names.map(n=>quality[n][i]));if(['torso','hips','x_factor'].includes(key)){
    if(!w[i]||(key==='torso'&&turn===null)||(key==='hips'&&hip===null)||(key==='x_factor'&&(turn===null||hip===null))){conf[key].push(null);continue;}grade=Math.min(grade,...names.map(n=>w[i][n][3]));}
    if(key==='wrist'&&index.values&&!index.anchors.has(i))grade=Math.min(grade,.25);conf[key].push(unavailable.includes(key)?null:round(grade,3));}
   const confidence=Math.min(...Object.values(conf).map(v=>v.at(-1)).filter(v=>v!==null));track.push([round(s,3),turn,hip,round(clamp(lean,.05,.42),3),round(wristValue,3),round((hx[i]-baseHX)*-1.1*back,3),round(clamp(kl[i],.02,.50),3),round(clamp(kr[i],.02,.50),3),round(clamp((baseHeel-hr[i])*9,0,1),3),turn===null||hip===null?null:round(turn-hip,6),confidence]);
  }
  const sourceStart=numbers[start],sourceEnd=numbers[end],count=sourceEnd-sourceStart+1,observations=new Map(numbers.slice(start,end+1).map((n,i)=>[n,track[i]])),rows=range(sourceStart,sourceEnd+1).map(n=>observations.get(n)??[...channels.slice(0,-1).map(()=>null),0]);
  for(const [key,values]of Object.entries(conf)){const seen=new Map(numbers.slice(start,end+1).map((n,i)=>[n,values[i]]));conf[key]=range(sourceStart,sourceEnd+1).map(n=>seen.get(n)??null);}
  const phaseFrames=Object.fromEntries(phases.map((p,i)=>[p,numbers[detected.indices[i]]])),dur=(count-1)/fps,total=dur+hold,verified=detected.diagnostics.impact_height_difference<.06;
  return{schema:'motionguard.swingtrack/2',channels,frame_status:status,track:rows,events:Object.fromEntries(phases.map(p=>[p,round((hold+(phaseFrames[p]-sourceStart)/fps)/total,4)])),meta:{...diagnostics,usable:true,measurement_revision:11,unusable_reason:null,accepted_frames:numbers.length,total_frames:status.length,fps:round(fps,2),hold,dur:round(total,3),samples:count,source_frames:[sourceStart,sourceEnd],backswing_sign:back,wrist_source:index.values?'index':'forearm',camera_facing:width>=.8?'front':width>=.45?'oblique':'down_the_line',address_shoulder_width_ratio:round(width,4),unavailable,rotation_sign_source:'pose_world_landmarks',rotation_model:'lite',world_units:'meters',channel_confidence:conf,measured:channels.filter(c=>c!=='confidence'&&!unavailable.includes(c)&&(c!=='wrist'||index.values)),modeled:index.values?[]:['wrist'],phase_frames:phaseFrames,phase_diagnostics:detected.diagnostics,impact_verified:verified,main_phase_frames:Object.fromEntries(Object.entries(phaseFrames).filter(([p])=>p!=='impact'||verified)),phase_confidence:Object.fromEntries(phases.map(p=>[p,round(rows[phaseFrames[p]-sourceStart].at(-1),3)]))}};
 }
 function score(track){const rules=SwingReference.scoring,items=[],excluded=[],m=track.meta;if(!m.usable)return{total:null,items,measured_count:0,excluded:SwingReference.channels};
  const start=m.source_frames[0],address=track.track[m.phase_frames.address-start];
  for(const [phase,k]of [['top',1],['down',2],['impact',3],['finish',4]])for(const channel of SwingReference.channels){const i=m.phase_frames[phase]-start,col=track.channels.indexOf(channel),row=track.track[i],actual=row[col],grades=m.channel_confidence?.[channel],grade=grades?grades[i]:row.at(-1),key=phase+'_'+channel;
   if(actual===null||address[col]===null||grade===null||grade<.3||m.unavailable.includes(channel)||m.modeled.includes(channel)||(phase==='impact'&&m.impact_verified===false)){excluded.push(key);continue;}
   const normalized=['shiftX','heelR'].includes(channel),measured=normalized?actual:actual*180/Math.PI,baseline=normalized?address[col]:address[col]*180/Math.PI,[low,high]=rules.plausible?.[channel]??[-Infinity,Infinity];if(measured<low||measured>high){excluded.push(key);continue;}
   const reference=baseline+SwingReference[channel][k]-SwingReference[channel][0],delta=measured-reference,tolerance=rules.tolerances[channel],value=clamp(100-Math.abs(delta)/tolerance*100,0,100),state=Math.abs(delta)<=tolerance?'적정':delta<0?'부족':'과다';items.push({id:key,channel,phase,score:round(value,2),measured:round(measured,4),reference:round(reference,4),state,weight:rules.weights[channel]});
  }const weight=sum(items.map(i=>i.weight));return{total:weight?round(sum(items.map(i=>i.score*i.weight))/weight,2):null,items,measured_count:items.length,excluded};
 }
 function csv(text){const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),header=lines.shift().split(','),map=new Map(),world=new Map(),times=new Map();for(const line of lines){const values=line.split(','),r=Object.fromEntries(header.map((k,i)=>[k,values[i]]));if(!names.includes(r.landmark))continue;const i=+r.frame_idx;if(!map.has(i))map.set(i,{});map.get(i)[r.landmark]=[+r.x,+r.y,Number(r.z||0),Number(r.visibility||1)];if(['wx','wy','wz'].every(k=>r[k]!==undefined&&r[k]!=='')){if(!world.has(i))world.set(i,{});world.get(i)[r.landmark]=[+r.wx,+r.wy,+r.wz,Number(r.visibility||1)];}times.set(i,+r.timestamp);}
  const order=[...map.keys()].sort((a,b)=>a-b),span=times.get(order.at(-1))-times.get(order[0]);return{frames:order.map(i=>map.get(i)),world:order.map(i=>world.get(i)??null),fps:span>0?(order.length-1)/span:30};
 }
 return Object.freeze({names,required,channels,guidance,round,acceptance,personBox,crop,toOriginal,build,score,csv,worldRotations});
})();
