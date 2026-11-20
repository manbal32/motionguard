/* Evidence images use measured body-only poses. Guides are illustrative, never new measurements. */
window.MotionEvidence=(()=>{
 const $=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const jobs=new Set(),cache=new WeakMap();let raf=0;
 const focus={heelR:[17,19,21],kneeL:[14,16],kneeR:[15,17],hips:[12,13],torso:[0,1],lean:[0,1,12,13],wrist:[4,5],swing:[2,3,4,5],shiftX:[12,13],x_factor:[0,1,12,13]};
 function prepare(track,item){
  const poses=track?.pose_landmarks;if(!Array.isArray(poses)||!poses.length)return null;
  const frame=Number.isInteger(item.frame)?item.frame:track.meta.phase_frames?.[item.phase],center=frame-(track.meta.source_frames?.[0]??0);if(!Number.isInteger(center)||center<0||center>=poses.length)return null;
  const radius=Math.max(3,Math.round(track.meta.fps*.4)),start=Math.max(0,center-radius),end=Math.min(poses.length-1,center+radius),reference=cache.get(track)??SwingReference.expand(track);cache.set(track,reference);
  const frames=[];for(let i=start;i<=end;i++){const source=poses[i];if(!Array.isArray(source)||source.length!==22||source.some(p=>!p||!p.slice(0,3).every(Number.isFinite)))return null;
   const current=source.map(p=>[p[0]*1000,p[1]*1000,p[2]]),baseline=track.track[i],guide=item.positive?current:SwingPoseProject.project(current,baseline,key=>key===item.channel?reference[i][SwingReference.channels.indexOf(key)]:baseline[track.channels.indexOf(key)],{channels:track.channels,channel:item.channel,width:1000,height:1000});frames.push({current,guide});
  }
  const boxes=frames.flatMap(f=>[SwingPoseAvatar.bounds(f.current),SwingPoseAvatar.bounds(f.guide)]),bounds=[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))];
  const selected=frames.flatMap(f=>[f.current,f.guide]).flatMap(p=>(focus[item.channel]??[0,1]).map(i=>p[i]));const margin=Math.max(70,(bounds[3]-bounds[1])*.15),focusBounds=[Math.min(...selected.map(p=>p[0]))-margin,Math.min(...selected.map(p=>p[1]))-margin,Math.max(...selected.map(p=>p[0]))+margin,Math.max(...selected.map(p=>p[1]))+margin];
  return{frames,center:center-start,start,end,bounds,focusBounds,item,zoom:false};
 }
 function paint(canvas,data,index,guide=false){const w=320,h=300;canvas.width=w*2;canvas.height=h*2;const ctx=canvas.getContext('2d'),styles=getComputedStyle(document.documentElement),color=k=>styles.getPropertyValue(k).trim();ctx.scale(2,2);ctx.fillStyle=color('--stage');ctx.fillRect(0,0,w,h);const b=data.zoom?data.focusBounds:data.bounds,padding=24,scale=Math.min((w-2*padding)/(b[2]-b[0]),(h-2*padding)/(b[3]-b[1])),map=pose=>pose.map(p=>[(p[0]-(b[0]+b[2])/2)*scale+w/2,(p[1]-(b[1]+b[3])/2)*scale+h/2,p[2]]),f=data.frames[index],pose=map(guide?f.guide:f.current),tint=color('--avatar'),colors={far:tint,near:tint,shirt:tint,skin:tint,shoes:tint,outline:tint};
  if(guide&&!data.item.positive)SwingPoseAvatar.paint(ctx,map(f.current),colors,.22);SwingPoseAvatar.paint(ctx,pose,colors,.94);
  const points=(focus[data.item.channel]??[0,1]).map(i=>pose[i]).filter(Boolean),cx=points.reduce((s,p)=>s+p[0],0)/points.length,cy=points.reduce((s,p)=>s+p[1],0)/points.length;
  ctx.strokeStyle=color(data.item.positive?'--good':'--arc');ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(cx,cy,Math.max(19,Math.max(...points.map(p=>Math.abs(p[0]-cx)))+12),Math.max(20,Math.max(...points.map(p=>Math.abs(p[1]-cy)))+12),0,0,Math.PI*2);ctx.stroke();
  if(guide&&!data.item.positive&&data.item.channel==='heelR'){const x=cx+22,y=cy-5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-28);ctx.moveTo(x-6,y-20);ctx.lineTo(x,y-28);ctx.lineTo(x+6,y-20);ctx.stroke();}
  canvas.dataset.sample=String(data.start+index);canvas.dataset.kind=guide?'guide':'measured';canvas.dataset.positive=String(!!data.item.positive);canvas.dataset.zoom=String(data.zoom);
 }
 function stopAll(){for(const j of jobs){j.playing=false;j.button.textContent='동작 반복 보기';}jobs.clear();cancelAnimationFrame(raf);raf=0;}
 function tick(now){for(const j of jobs){if(!j.canvas.isConnected||j.canvas.closest('[hidden]')){j.playing=false;j.button.textContent='동작 반복 보기';jobs.delete(j);continue;}if(!document.hidden){const i=Math.floor((now-j.start)/1000*j.fps*.5)%j.data.frames.length;paint(j.canvas,j.data,i);paint(j.guide,j.data,i,true);}}raf=jobs.size?requestAnimationFrame(tick):0;}
 function figures(track,item){const data=prepare(track,item);if(!data)return null;const box=$('div',undefined,'evidence-pair'),current=$('canvas'),guide=$('canvas');for(const [canvas,title] of [[current,'현재 동작 · 계측 재구성'],[guide,item.positive?'유지할 동작':'교정 방향 가이드']]){canvas.setAttribute('role','img');canvas.setAttribute('aria-label',title+' · '+MotionCustomer.labels[item.channel]);const f=$('figure');f.append(canvas,$('figcaption',title));box.append(f);}paint(current,data,data.center);paint(guide,data,data.center,true);return{box,current,guide,data};}
 function card(track,item,select,print=false){const panel=$('article',undefined,'evidence-card');panel.dataset.evidence=item.id;const view=figures(track,item);if(!view){panel.append($('p','이 항목의 동작 이미지를 구성하지 못했습니다.','note'));return panel;}
  panel.append($('p',(item.positive?'잘한 점 · 유지':'개선점 · 교정')+' / '+(MotionCustomer.phases[item.phase]??''),'evidence-kicker'),$('h3',MotionCustomer.labels[item.channel]),view.box);
  panel.append($('p','이번 영상의 몸 관절로 재구성한 그림입니다. 원본 사진이 아닙니다.','evidence-note'));
  if(!item.positive)panel.append($('p','교정 그림·화살표는 연습 방향을 설명하며 실제로 바뀐 동작을 측정한 것은 아닙니다.','evidence-note'));
  const descriptions=item.positive?[['관찰',`${MotionCustomer.labels[item.channel]}은 이번 영상에서 참고 범위에 가까웠습니다.`],['유지',`이 동작은 크게 바꾸기보다 같은 리듬으로 반복해 보세요.`]]:[['관찰',item.observation??`${MotionCustomer.labels[item.channel]}이 교본 참고 범위와 차이를 보였습니다.`],['이해',`${MotionCustomer.phases[item.phase]}의 표시한 부위를 반복해서 확인하세요. 구질이나 비거리를 이 항목만으로 단정하지 않습니다.`],['연습',item.drill??'해당 구간을 천천히 반복하고 같은 각도로 다시 촬영해 보세요.']];
  for(const [title,text]of descriptions){const p=$('p',undefined,'evidence-explanation');p.append($('b',title+' '),document.createTextNode(text));panel.append(p);}
  if(!print){const actions=$('div',undefined,'evidence-actions'),repeat=$('button','동작 반복 보기'),detail=$('button',item.positive?'유지 동작 크게 보기':'교정 화면 크게 보기'),zoom=$('button','부위 확대');const job={canvas:view.current,guide:view.guide,data:view.data,fps:track.meta.fps,button:repeat,playing:false};repeat.onclick=()=>{const playing=job.playing;stopAll();if(!playing){job.playing=true;job.start=performance.now();repeat.textContent='반복 멈추기';jobs.add(job);if(!raf)raf=requestAnimationFrame(tick);}};detail.onclick=()=>{stopAll();select?.(item.id,item.phase);};zoom.onclick=()=>{view.data.zoom=!view.data.zoom;const i=Math.max(0,Number(view.current.dataset.sample)-view.data.start);paint(view.current,view.data,i);paint(view.guide,view.data,i,true);zoom.textContent=view.data.zoom?'전체 자세 보기':'부위 확대';};actions.append(repeat,detail,zoom);panel.append(actions);}
  return panel;
 }
 function positives(doc){const allowed=new Set(doc.score?.items?.map(i=>i.id));return(doc.positives??[]).filter(i=>i.reliable===true&&!i.deviation&&allowed.has(i.id)&&Number.isFinite(i.measured)&&Math.abs(i.measured-i.reference)>1e-9).slice(0,1).map(i=>({...i,positive:true}));}
 function render(root,doc,track,select,print=false){if(!root)return;root.replaceChildren();if(!print)stopAll();const items=[...positives(doc),...MotionCustomer.improvements(doc)];for(const item of items)root.append(card(track,item,select,print));if(!items.length)root.append($('p','이번에는 그림으로 연결할 근거가 있는 항목을 찾지 못했습니다.','note'));}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});
 return{render,prepare,paint,positives,stopAll};
})();
