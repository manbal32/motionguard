"""Correct the original/2D replay timeline and canvas lifecycle without changing analysis."""
from pathlib import Path
import shutil
r=Path(__file__).resolve().parents[1];d=r/'dist'
shutil.copy2(r/'overrides/replay-sync.js',d/'replay-sync.js')
p=d/'index.html';s=p.read_text().replace('<script src="./instrument.js" defer>','<script src="./replay-sync.js"></script><script src="./instrument.js" defer>');s=s.replace('<canvas id="exaggerated" aria-label="개선 포인트 그림 관절"></canvas>','<canvas id="exaggerated" aria-label="개선 포인트 그림 관절"></canvas><div id="replay-still-fallback" hidden></div>');p.write_text(s)
p=d/'instrument.js';s=p.read_text()
s=s.replace('  function updateOverlay(mediaTime = video.currentTime) {','  function updateOverlay(mediaTime = video.currentTime) {\n    if(video.seeking)return;')
s=s.replace('if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight || alternate.width !== video.videoWidth) {\n      canvas.width = alternate.width = video.videoWidth;\n      canvas.height = alternate.height = video.videoHeight;','if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {\n      canvas.width = video.videoWidth;\n      canvas.height = video.videoHeight;')
s=s.replace('    alternateContext.clearRect(0, 0, width, height);','')
a=s.index('    const zoom = byId("zoom-person")',s.index('  function updateOverlay('));b=s.index('\n  function renderAvatar(',a)
s=s[:a]+'''    const measured=points.map(([x,y,v])=>[x*width,y*height,v]);
    const exact=MotionReplaySync.index(comparison.track,frame);
    const baseline=exact===null?null:comparison.track.track[exact];
    if(byId('toggle-joints').getAttribute('aria-pressed')==='true'&&activeFinding&&exact!==null&&inFindingRange(exact))MotionVideo.draw(ctx,points,activeFinding,{width,height});
    const scene=MotionReplaySync.sceneAt(comparison.replayScenes,frame,evidence.fps);
    byId('phase-label').textContent=(scene?'분석 장면 '+scene.id:'원본 영상')+' · '+(frame/evidence.fps).toFixed(2)+'초';
    canvas.dataset.frame=String(frame);
    if(comparisonView==='2d')renderAvatar(measured,baseline,exact??sample,frame);
  }
''' +s[b:]
s=s.replace('function renderAvatar(points, baseline, sample) {','function renderAvatar(points, baseline, sample, sourceFrame=sample+(comparison.track.meta.source_frames?.[0]??0)) {')
s=s.replace("    if(alternate.dataset.frozen==='true')return;\n    alternate.dataset.frozen='true';", "    if(alternate.dataset.frozen==='true')return;")
s=s.replace("    if (!w || !h){alternate.dataset.frozen='false';return;}", "    if (!w || !h)return;\n    alternate.dataset.frozen='true';\n    alternate.hidden=false;byId('replay-still-fallback').hidden=true;")
s=s.replace('    let base=project(measured,baseline,', '    const hasBaseline=Array.isArray(baseline);\n    let base=hasBaseline?project(measured,baseline,').replace('key=>baseline[comparison.track.channels.indexOf(key)]);\n    const held=', 'key=>baseline[comparison.track.channels.indexOf(key)]):measured;\n    const held=')
s=s.replace('let shown=project(measured,baseline,key=>(held?target:baseline)[comparison.track.channels.indexOf(key)]);','let shown=hasBaseline?project(measured,baseline,key=>(held?target:baseline)[comparison.track.channels.indexOf(key)]):measured;')
s=s.replace('let reference=project(measured,baseline,key=>key===activeFinding?.channel','let reference=hasBaseline?project(measured,baseline,key=>key===activeFinding?.channel').replace(': baseline[comparison.track.channels.indexOf(key)]);\n    // Keep',': baseline[comparison.track.channels.indexOf(key)]):measured;\n    // Keep')
s=s.replace('const maxRow=SwingExaggeration.apply(', 'const maxRow=hasBaseline?SwingExaggeration.apply(').replace('activeFinding?.positive?null:activeFinding,2.5)[sample];', 'activeFinding?.positive?null:activeFinding,2.5)[sample]:null;')
s=s.replace('const extreme=project(measured,baseline,key=>maxRow[comparison.track.channels.indexOf(key)]);','const extreme=hasBaseline?project(measured,baseline,key=>maxRow[comparison.track.channels.indexOf(key)]):measured;')
s=s.replace('if (activeFinding && !activeFinding.positive && hasDeviation(sample)) paintAngleGuide(shown,reference);','if (hasBaseline && activeFinding && !activeFinding.positive && hasDeviation(sample)) paintAngleGuide(shown,reference);')
s=s.replace('alternate.dataset.frame=String(sample+comparison.track.meta.source_frames[0]);','alternate.dataset.frame=String(sourceFrame);')
s=s.replace('      byId("compare-cue").textContent = "이 프레임에서 관절을 추적하지 못했습니다.";','      showReplayFallback(frame);\n      byId("compare-cue").textContent = "이 장면의 연습 방향";')
s=s.replace('  function paintTrackPose() {\n    const sample=', '  function paintTrackPose() {\n    const sample=')
s=s.replace('    if(points)renderAvatar(points,comparison.track.track[sample],sample);','    if(points)renderAvatar(points,comparison.track.track[sample],sample);else showReplayFallback(Math.round(pointTime*comparison.track.meta.fps));')
s=s.replace("video.pause();pointPlaying=false;comparisonView=", "video.pause();pointPlaying=false;alternate.dataset.frozen='false';byId('point-play').textContent='재생';comparisonView=")
s=s.replace("  byId('view-original').onclick=", "  function showReplayFallback(frame){if(comparisonView!=='2d')return;const host=byId('replay-still-fallback'),scene=MotionReplaySync.sceneAt(comparison.replayScenes,frame,comparison.track.meta.fps);host.replaceChildren();if(scene?.image){const image=node('img');image.src=scene.image;image.alt='분석 장면 '+scene.id;host.append(image);}const dims=comparison.coaching?.visual_analysis?.analysis?.assessment_score?.dimensions??[],focus=[...dims].sort((a,b)=>a.value-b.value)[0];host.append(MotionSummary.diagram(focus?.id||'rotation'),node('p',scene?'분석 사진 · 연습 방향':'연습 방향 설명 그림'));host.hidden=false;alternate.hidden=true;}\n  byId('view-original').onclick=")
s=s.replace("    panes.dataset.original=String(comparisonView==='video');", "    panes.dataset.original=String(comparisonView==='video');requestAnimationFrame(()=>updateOverlay());")
s=s.replace('    setupPoint();\n    setComparisonView', '    comparison.coaching=doc;comparison.replayScenes=MotionReplaySync.scenes(track,doc);\n    setupPoint();\n    setComparisonView')
s=s.replace("    seekPoint(t.meta.phase_frames[phase??'address']/t.meta.fps);", "    const scene=comparison.replayScenes?.[0];\n    seekPoint(!phase&&scene?scene.time:t.meta.phase_frames[phase??'address']/t.meta.fps);")
s=s.replace("    const t=comparison.track,bar=byId('point-seek');", "    const t=comparison.track,bar=byId('point-seek');")
needle="    for(const [key,label] of mainPhases(t)){const b=node('button',label);b.onclick=()=>jump(t.meta.phase_frames[key]);b.dataset.phase=key;byId('point-phases').append(b);}"
assert needle in s
s=s.replace(needle,"    if(comparison.replayScenes?.length){for(const scene of comparison.replayScenes){const b=node('button','장면 '+scene.id);b.onclick=()=>seekPoint(scene.time);b.dataset.sampleId=scene.id;byId('point-phases').append(b);}bar.min=0;bar.max=evidence?duration:t.meta.source_frames[1]/t.meta.fps;}else{"+needle.strip()+"}")
s=s.replace("    pointPlaying=false;byId('point-play').textContent='재생';\n    if(!comparison)return;", "    pointPlaying=false;alternate.dataset.frozen='false';byId('point-play').textContent='재생';\n    if(!comparison)return;")
s=s.replace("video.currentTime=seconds;return;", "video.currentTime=seconds;requestAnimationFrame(()=>updateOverlay());return;")
s=s.replace('    if (!wrapLoop()) updateOverlay();','    if (!wrapLoop()&&(!video.requestVideoFrameCallback||video.paused||event===\'seeked\'||event===\'loadeddata\')) updateOverlay();')
s=s.replace('  }).observe(byId("comparison-panes"));','    alternate.dataset.frozen=\'false\';requestAnimationFrame(()=>updateOverlay());\n  }).observe(byId("comparison-panes"));')
s=s.replace('    const hasBaseline=Array.isArray(baseline);', '    const hasBaseline=Array.isArray(baseline);paneLabel.textContent=hasBaseline?"현재 2D · 연습 방향 가이드":"선택한 장면 · 현재 2D 자세";')
s=s.replace('    if (!body.length) return;', '    if (!body.length){showReplayFallback(sourceFrame);return;}')
s=s.replace('  function changeFactor() {', "  function changeFactor() {alternate.dataset.frozen='false';")
s=s.replace('    const button = event.currentTarget;\n    button.setAttribute("aria-pressed"', '    const button = event.currentTarget;alternate.dataset.frozen=\'false\';\n    button.setAttribute("aria-pressed"')
s=s.replace('    const sample=comparison.sample??0;\n    const points=', "    const exact=comparison.replayFrame===undefined?(comparison.sample??0):MotionReplaySync.index(comparison.track,comparison.replayFrame);if(exact===null){showReplayFallback(comparison.replayFrame);return;}const sample=exact;\n    const points=")
s=s.replace('    const t=comparison.track,start=t.meta.source_frames[0];\n    pointTime=', "    const t=comparison.track,start=t.meta.source_frames[0];\n    comparison.replayFrame=Math.round(seconds*t.meta.fps);if(MotionReplaySync.index(t,comparison.replayFrame)===null){pointTime=seconds;byId('point-seek').value=seconds;showReplayFallback(comparison.replayFrame);return;}\n    pointTime=")
p.write_text(s)

for name in ['simulation-entry.js','course-map-workflow.js']:
 shutil.copy2(r/'overrides'/name,d/name)
p=d/'index.html';p.write_text(p.read_text().replace('<script src="./result-dashboard.js">','<script src="./course-map-workflow.js"></script><script src="./simulation-entry.js"></script><script src="./result-dashboard.js">'))

p=d/'course-core.js';s=p.read_text().replace(' function selectCourse(c)', ' const defaultCourse=JSON.parse(JSON.stringify(course));\n function selectCourse(c)').replace('const api={selectCourse,','const api={defaultCourse:()=>JSON.parse(JSON.stringify(defaultCourse)),selectCourse,');p.write_text(s)
# Photo-coaching replay owns its exact selected JPEG rather than legacy phase frames.
shutil.copy2(r/'overrides/photo-replay.js',d/'photo-replay.js')
p=d/'index.html';p.write_text(p.read_text().replace('<script src="./replay-sync.js">','<script src="./photo-replay.js"></script><script src="./replay-sync.js">'))
p=d/'video-evidence.js';s=p.read_text().replace('return{register,frame,ready,',"return{source:id=>registry.get(id)?.url??null,landmarks:(id,time)=>{const r=registry.get(id);if(!r)return null;const frame=Math.floor(time*r.evidence.fps+.001);return{frame,points:r.evidence.frames?.[frame]??null};},register,frame,ready,");p.write_text(s)
p=d/'instrument.js';s=p.read_text().replace("byId('show-points').hidden=true;byId('results').hidden=false;", "byId('show-points').hidden=!window.MotionPhotoReplay?.scenes(coaching).length;byId('results').hidden=false;");p.write_text(s)

p=d/'video-evidence.js';s=p.read_text().replace('if(old?.url===url)return;', 'if(old?.url===url){old.evidence={...old.evidence,...evidence};return;}');p.write_text(s)
