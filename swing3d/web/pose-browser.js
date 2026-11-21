/* Local two-pass VIDEO inference. Retain only MediaPipe body indices 11..32. */
window.MotionPose=(()=>{
 const base=new URL('./',document.currentScript.src),core=MotionTrack;
 let visionPromise,demuxPromise;
 const vision=()=>visionPromise??=import(new URL('vendor/mediapipe/vision_bundle.mjs',base)).then(async m=>({module:m,files:await m.FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm',base).href)}));
 function boxes(view,start,end){const found=[];for(let i=start;i+8<=end;){let size=view.getUint32(i),header=8;if(size===1){if(i+16>end)break;size=Number(view.getBigUint64(i+8));header=16;}if(size===0)size=end-i;if(size<header||i+size>end)break;const type=String.fromCharCode(...new Uint8Array(view.buffer,i+4,4));found.push({type,start:i+header,end:i+size});i+=size;}return found;}
 function metadata(buffer){const v=new DataView(buffer),child=(box,type)=>boxes(v,box.start,box.end).find(b=>b.type===type),moov=boxes(v,0,v.byteLength).find(b=>b.type==='moov');if(!moov)throw Error('MP4/MOV 영상 정보를 읽지 못했습니다.');
  for(const trak of boxes(v,moov.start,moov.end).filter(b=>b.type==='trak')){const mdia=child(trak,'mdia');if(!mdia)continue;const h=child(mdia,'hdlr');if(!h||String.fromCharCode(...new Uint8Array(buffer,h.start+8,4))!=='vide')continue;
   const mdhd=child(mdia,'mdhd'),minf=child(mdia,'minf'),stbl=minf&&child(minf,'stbl'),stts=stbl&&child(stbl,'stts');if(!mdhd||!stts)continue;
   const version=v.getUint8(mdhd.start),scale=v.getUint32(mdhd.start+(version===1?20:12));let count=0,ticks=0;
   const entries=v.getUint32(stts.start+4);for(let i=0;i<entries;i++){const n=v.getUint32(stts.start+8+i*8),delta=v.getUint32(stts.start+12+i*8);count+=n;ticks+=n*delta;}
   if(count>0&&ticks>0&&scale>0)return{total:count,fps:count*scale/ticks,duration:ticks/scale};
  }throw Error('프레임 속도가 있는 MP4/MOV 영상을 선택해 주세요.');
 }
 const abort=signal=>{if(signal?.aborted)throw new DOMException('취소했습니다.','AbortError');};
 const event=(target,name,signal)=>new Promise((resolve,reject)=>{
  const done=()=>{clean();resolve();},error=()=>{clean();reject(Error('영상을 읽을 수 없습니다.'));},cancel=()=>{clean();reject(new DOMException('취소했습니다.','AbortError'));};
  const clean=()=>{target.removeEventListener(name,done);target.removeEventListener('error',error);signal?.removeEventListener('abort',cancel);};
  target.addEventListener(name,done,{once:true});target.addEventListener('error',error,{once:true});signal?.addEventListener('abort',cancel,{once:true});abort(signal);
 });
 async function demux(buffer){
  if(!('VideoDecoder' in window))return null;
  demuxPromise??=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('vendor/mp4box/mp4box.all.min.js',base);script.onload=resolve;script.onerror=reject;document.head.append(script);});
  await demuxPromise;
  const parser=MP4Box.createFile(),samples=[];let selected,description,failure;
  parser.onError=error=>failure=Error(String(error));
  parser.onReady=info=>{selected=info.videoTracks[0];if(!selected)return;
   const trak=parser.getTrackById(selected.id);for(const entry of trak.mdia.minf.stbl.stsd.entries){const config=entry.avcC??entry.hvcC??entry.vpcC??entry.av1C;if(config){const stream=new DataStream(undefined,0,DataStream.BIG_ENDIAN);config.write(stream);description=new Uint8Array(stream.buffer,8);break;}}
   parser.setExtractionOptions(selected.id,null,{nbSamples:1});parser.start();};
  parser.onSamples=(id,_,batch)=>{if(id===selected?.id)samples.push(...batch);};
  buffer.fileStart=0;parser.appendBuffer(buffer);parser.flush();if(failure)throw failure;if(!selected||!samples.length)return null;
  const config={codec:selected.codec,codedWidth:selected.video.width,codedHeight:selected.video.height,...(description?{description}:{}),hardwareAcceleration:'prefer-software'};
  if(!(await VideoDecoder.isConfigSupported(config)).supported)return null;
  return{config,samples};
 }
 async function extract(file,{signal,progress=()=>{},debug=false}={}){
  abort(signal);if(!file.size||file.size>150*1024*1024)throw Error('150MB 이하 영상을 선택해 주세요.');
  const started=performance.now(),buffer=await file.arrayBuffer();let meta,initialPackets;
  try{meta=metadata(buffer);}catch(error){
   // Fragmented recordings keep timing in moof/trun rather than a populated stts.
   initialPackets=await demux(buffer);if(!initialPackets?.samples.length)throw error;
   const duration=initialPackets.samples.reduce((s,p)=>s+p.duration/p.timescale,0);
   if(!(duration>0))throw error;meta={total:initialPackets.samples.length,fps:initialPackets.samples.length/duration,duration};
  }
  if(meta.duration>30.5)throw Error('30초 이하 영상으로 잘라 주세요.');
  const {module:m,files}=await vision();abort(signal);
  const modelURL=window.MotionStaticMode?new URL('pose_landmarker_lite.task',base):new URL('models/pose_landmarker_lite.task',base);
  const response=await fetch(modelURL,{signal});if(!response.ok)throw Error('자세 모델 파일을 읽지 못했습니다.');const model=new Uint8Array(await response.arrayBuffer());
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';const objectURL=URL.createObjectURL(file);video.src=objectURL;
  try{
   await event(video,'loadeddata',signal);let packets;try{packets=initialPackets??await demux(buffer);}catch{packets=null;}const width=video.videoWidth,height=video.videoHeight,canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
   async function pass(stride,box){
    const landmarker=await m.PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:model,delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5,outputSegmentationMasks:false});
    const frames=new Map(),world=new Map();
    try{
     canvas.width=box?box.resized_side:width;canvas.height=box?box.resized_side:height;
     if(packets){
      let index=0,failure;
      const decoder=new VideoDecoder({output(frame){const i=index++;try{abort(signal);if(i%stride)return;
       if(box)ctx.drawImage(frame,...box.pixels,0,0,canvas.width,canvas.height);else ctx.drawImage(frame,0,0,canvas.width,canvas.height);
       const result=landmarker.detectForVideo(canvas,Math.floor(i/meta.fps*1000));
       if(result.landmarks.length){frames.set(i,Object.fromEntries(core.names.map((name,j)=>{const p=result.landmarks[0][j+11];return[name,[p.x,p.y,p.z,p.visibility??1]];})));if(result.worldLandmarks.length)world.set(i,Object.fromEntries(core.names.map((name,j)=>{const p=result.worldLandmarks[0][j+11];return[name,[p.x,p.y,p.z,p.visibility??1]];})));}
       if(i%(5*stride)===0)progress(box?'크롭 자세 추출':'인물 찾기',Math.min(85,Math.round((box?65:20)*i/meta.total)+(box?20:0)));
      }catch(error){failure=error;}finally{frame.close();}},error(error){failure=error;}});
      try{decoder.configure(packets.config);for(const sample of packets.samples){abort(signal);if(failure)throw failure;while(decoder.decodeQueueSize>8){await new Promise(r=>setTimeout(r,0));abort(signal);if(failure)throw failure;}
       decoder.decode(new EncodedVideoChunk({type:sample.is_sync?'key':'delta',timestamp:Math.round(sample.cts*1e6/sample.timescale),duration:Math.round(sample.duration*1e6/sample.timescale),data:sample.data}));}
       await decoder.flush();if(failure)throw failure;if(index!==meta.total)throw Error('읽은 영상 표본 수가 원본과 다릅니다.');
      }finally{decoder.close();}
     }else for(let i=0;i<meta.total;i+=stride){abort(signal);const time=Math.min(video.duration-.000001,(i+.001)/meta.fps);
      if(Math.abs(video.currentTime-time)>.0000001){const ready=event(video,'seeked',signal);video.currentTime=time;await ready;}
      if(box)ctx.drawImage(video,...box.pixels,0,0,canvas.width,canvas.height);else ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const result=landmarker.detectForVideo(canvas,Math.floor(i/meta.fps*1000));
      if(result.landmarks.length){frames.set(i,Object.fromEntries(core.names.map((name,j)=>{const p=result.landmarks[0][j+11];return[name,[p.x,p.y,p.z,p.visibility??1]];})));
       if(result.worldLandmarks.length)world.set(i,Object.fromEntries(core.names.map((name,j)=>{const p=result.worldLandmarks[0][j+11];return[name,[p.x,p.y,p.z,p.visibility??1]];})));}
      if(i%(5*stride)===0){progress(box?'크롭 자세 추출':'인물 찾기',Math.min(85,Math.round((box?65:20)*i/meta.total)+(box?20:0)));await new Promise(r=>setTimeout(r,0));}
     }
    }finally{landmarker.close();}return{frames,world};
   }
   const failed=()=>{const status=Array.from({length:meta.total},(_,frame)=>({frame,accepted:false,reason:'인물 추적 실패'})),track=core.unusable(meta.fps,.30,status,'tracking_failed',{original_size:[width,height],extraction_seconds:(performance.now()-started)/1000});track.score=core.score(track);return debug?{track,frames:[],world:[],original:[],fps:meta.fps}:track;};
   const first=await pass(3,null);let selected;try{selected=core.crop(first.frames,width,height);}catch{return failed();}
   const {box,valid}=selected,second=await pass(1,box);
   if(second.frames.size<20)return failed();
   let previous=second.frames.values().next().value;const frames=[],world=[],timeline=[],original=[];
   for(let i=0;i<meta.total;i++){const observed=second.frames.get(i);if(observed)previous=observed;frames.push(observed??Object.fromEntries(core.names.map(n=>[n,[...previous[n].slice(0,3),0]])));world.push(second.world.get(i)??null);
    const mapped=observed?Object.fromEntries(core.names.map(n=>[n,core.toOriginal(observed[n],box)])):null;original.push(mapped);timeline.push(mapped?core.names.map(n=>[Number(mapped[n][0].toFixed(5)),Number(mapped[n][1].toFixed(5)),Number(mapped[n][3].toFixed(5))]):null);}
   const errors=valid.filter(i=>second.frames.has(i)).map(i=>{const mid=f=>['LEFT_SHOULDER','RIGHT_SHOULDER'].map(n=>f[n]).reduce((p,q)=>[p[0]+q[0]/2,p[1]+q[1]/2],[0,0]);const a=mid(first.frames.get(i)),b=mid(original[i]);return Math.hypot(a[0]-b[0],a[1]-b[1]);});
   const extraction={decoder:packets?'WebCodecs':'HTMLVideoElement',original_size:[width,height],crop_box:box,coordinate_space:'crop',pass1_stride:3,pass1_observations:first.frames.size,pass2_observations:second.frames.size,crop_alignment_error_max:errors.length?Math.max(...errors):null,crop_alignment_error_mean:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null,crop_alignment_samples:errors.length,extraction_seconds:(performance.now()-started)/1000};
   progress('국면 검출',88);const track=core.build(frames,meta.fps,world,extraction);track.score=core.score(track);
   if(track.meta.usable){const [start,end]=track.meta.source_frames;track.pose_landmarks=timeline.slice(start,end+1);const phaseFrames=track.meta.main_phase_frames,boxes=timeline.map(p=>p&&core.personBox(p)),available=boxes.map((b,i)=>b?i:null).filter(i=>i!==null);
    const nearest=frame=>available.reduce((best,i)=>Math.abs(i-frame)<Math.abs(best-frame)?i:best,available[0]);
    const sizeFor=(b,padding=1.6)=>Math.min(1,Math.max(.04,Math.max(b[2]-b[0],b[3]-b[1])*padding));
    const cropFor=(b,size)=>[Math.max(0,Math.min(1-size,(b[0]+b[2]-size)/2)),Math.max(0,Math.min(1-size,(b[1]+b[3]-size)/2)),size];
    const phaseBoxes=Object.fromEntries(Object.entries(phaseFrames).map(([p,f])=>[p,boxes[nearest(f)]])),size=Math.max(...Object.values(phaseBoxes).map(b=>sizeFor(b))),stillCrops=Object.fromEntries(Object.entries(phaseBoxes).map(([p,b])=>[p,cropFor(b,size)]));
    const swing=boxes.slice(start,end+1).filter(Boolean),envelope=[Math.min(...swing.map(b=>b[0])),Math.min(...swing.map(b=>b[1])),Math.max(...swing.map(b=>b[2])),Math.max(...swing.map(b=>b[3]))],stillURLs={};
    for(const [phase,frame]of Object.entries(phaseFrames)){
     abort(signal);const ready=event(video,'seeked',signal);video.currentTime=Math.min(video.duration-.000001,(frame+.001)/meta.fps);await ready;
     const [x,y,s]=stillCrops[phase];canvas.width=Math.max(1,Math.round(s*width));canvas.height=Math.max(1,Math.round(s*height));ctx.drawImage(video,x*width,y*height,s*width,s*height,0,0,canvas.width,canvas.height);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));stillURLs[phase]=URL.createObjectURL(blob);
    }
    track.evidence={fps:meta.fps,landmark_names:core.names,frames:timeline,phase_frames:phaseFrames,still_crops:stillCrops,still_urls:stillURLs,overlay_crop:cropFor(envelope,sizeFor(envelope,1.25)),has_finish_still:!!stillURLs.finish};}
   return debug?{track,frames,world,original,fps:meta.fps}:track;
  }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(objectURL);}
 }
 return Object.freeze({extract,metadata});
})();
