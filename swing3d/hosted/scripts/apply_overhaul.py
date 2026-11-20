from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1];d=root/'dist'
for name in ['visual-analysis.js','overhaul.css']:
 shutil.copy2(root/'overrides'/name,d/name)
for name in ['index.html','report.html']:
 p=d/name;s=p.read_text().replace('</head>','<link rel="stylesheet" href="./overhaul.css"></head>');s=s.replace('<script src="./motion-evidence.js"></script>','<script src="./motion-evidence.js"></script><script src="./visual-analysis.js"></script>');p.write_text(s)
p=d/'index.html';s=p.read_text().replace('Gemini에 상담 텍스트 전송 동의 (원본 영상 제외)</label>','Gemini에 상담 텍스트 전송 동의 (원본 영상 제외)</label><label><input id="photo-consent" type="checkbox"> 분석할 대표사진 5장과 승인한 상담 요약을 Gemini에 전송합니다. 원본 영상·좌표는 보내지 않습니다.</label>');p.write_text(s)
p=d/'client-api.js';s=p.read_text().replace("   if(route==='api/coaching/status')", "   if(route==='api/coaching/visual'||route==='api/coaching/videos'||route.startsWith('api/courses'))return nativeFetch(input,options);\n   if(route==='api/coaching/status')")
s=s.replace("const profile=await access('profiles'", "doc.visual_analysis=await MotionVisual.analyze(track,data.conversation_summary,options.signal);\n    const profile=await access('profiles'",1);s=s.replace("if(route==='api/coaching/summary')return reply","if(route==='api/coaching/summary'&&data.allow_external===true&&data.messages?.length)return nativeFetch(input,options);\n   if(route==='api/coaching/summary')return reply")
s=s.replace("   if(route==='api/coaching/analyze'){","   if(route==='api/coaching/videos/save'){const doc=await access('reports',data.report_id);if(!doc?.visual_analysis)return reply({ok:false,reason:'분석 결과를 찾지 못했습니다.'},404);doc.visual_analysis.recommendations=data.recommendations;await access('reports',data.report_id,doc);return reply({ok:true});}\n   if(route==='api/coaching/analyze'){")
p.write_text(s)
p=d/'instrument.js';s=p.read_text().replace('      enterPoint();','      step(3);',1).replace('pointOnce=true;pointPlaying=true;','pointOnce=false;pointPlaying=false;').replace('if(evidence){video.muted=true;video.play().catch(()=>{pointPlaying=false;byId(\'point-play\').textContent=\'재생\';});}',"if(evidence){video.muted=true;video.pause();}")
s=s.replace('  function renderAvatar(points, baseline, sample) {', '''  function renderAvatar(points, baseline, sample) {
    if(alternate.dataset.frozen==='true')return;
    alternate.dataset.frozen='true';''')
s=s.replace("byId('media-sync-note').textContent=evidence?'내 영상과 2D는 같은 순간·같은 반복 구간입니다. 원본 영상은 변형하지 않습니다.'", "byId('media-sync-note').textContent=evidence?'영상은 반복 재생하고, 2D는 선택한 장면의 정지 그림으로 보여줍니다.'")
s=s.replace("    comparisonView=evidence&&view==='video'?'video':'2d';", "    video.pause();pointPlaying=false;comparisonView=evidence&&view==='video'?'video':'2d';byId('point-play').disabled=comparisonView==='2d';")
s=s.replace("    if(evidence){video.pause();video.currentTime=seconds;return;}","    if(evidence){alternate.dataset.frozen='false';video.pause();video.currentTime=seconds;return;}")
s=s.replace("    else {pointPlaying=!pointPlaying;", "    else {pointPlaying=false;return;")
s=s.replace('    if (!approvedSummary) return;',"    if (!approvedSummary) return;\n    if(!csv&&!byId('photo-consent')?.checked){summaryPanel.hidden=true;step(1);coachStatus.textContent='AI 사진 분석을 위해 대표사진 5장 전송에 동의해 주세요.';return;}")
s=s.replace('coachStatus.textContent = reply.reason ?',"coachStatus.textContent = reply.usage?.totalTokenCount ? `입력 ${reply.usage.promptTokenCount} · 출력 ${reply.usage.candidatesTokenCount} · 총 ${reply.usage.totalTokenCount} 토큰` : reply.reason ?")
s=s.replace('    if (!w || !h) return;',"    if (!w || !h){alternate.dataset.frozen='false';return;}")
s=s.replace('canvas.dataset.frame = alternate.dataset.frame = String(frame);','canvas.dataset.frame = String(frame);')
s=s.replace('상담과 영상 계측 종합 중','대표사진 분석·관련 연습 영상 찾는 중')
s=s.replace('  function jump(frame) {',"  function jump(frame) {alternate.dataset.frozen='false';")
p.write_text(s)
p=d/'customer-ui.js';s=p.read_text().replace("window.MotionEvidence?.render($('result-visuals'),doc,track,select);", "if(!window.MotionVisual?.render($('result-visuals'),doc,track))window.MotionEvidence?.render($('result-visuals'),doc,track,select);")
# Local reference scores are not visual AI diagnoses.
s=s.replace("  $('result-report').href=", "  if(doc.visual_analysis?.mode==='gemini-images'){ $('score-verdict').textContent='사진 5장 기반 AI 관찰 · 아래 근거를 확인해 주세요.'; const r=doc.visual_analysis; $('phase-map').hidden=true;$('result-estimates').hidden=true;const title=document.getElementById('result-conclusion');if(title)title.textContent=r.analysis.summary; }\n  $('result-report').href=")
p.write_text(s)
p=d/'report.js';s=p.read_text().replace("MotionEvidence.render($('report-visuals'),doc,track,null,true);", "if(!window.MotionVisual?.render($('report-visuals'),doc,track,true))MotionEvidence.render($('report-visuals'),doc,track,null,true);")
s=s.replace("  await MotionCourseReport.render(doc);", "  if(doc.visual_analysis?.mode==='gemini-images'){ $('report-conclusion').textContent=doc.visual_analysis.analysis.summary; $('report-strength').textContent='대표사진 5장 기반 AI 관찰입니다.'; $('report-verdict').textContent='AI 관찰과 기기 내 기준 점수는 별도입니다.'; $('report-improvements').replaceChildren();$('report-videos').replaceChildren();$('report-strokes').hidden=true;$('report-summary-table').hidden=true; $('report-headline').textContent='대표사진 5장으로 살펴본 자세'; $('report-mode').textContent='Gemini 사진 분석 · '+doc.visual_analysis.model; }\n  await MotionCourseReport.render(doc);")
p.write_text(s)
# Evidence cards from old local sample are static too. No 2D loop.
p=d/'motion-evidence.js';s=p.read_text().replace("paint(j.canvas,j.data,i);paint(j.guide,j.data,i,true);","paint(j.canvas,j.data,j.data.center);paint(j.guide,j.data,j.data.center,true);")
s=s.replace("const playing=job.playing;stopAll();if(!playing){", "const playing=job.playing;stopAll();if(panel.dataset.mediaView!=='video')return;if(!playing){")
p.write_text(s)

p=d/'demo-start.js';s=p.read_text().replace('AI 상담은 연결 설정과 동의가 필요하며 상담 텍스트만 전송합니다. 영상 분석과 결과 생성은 기기 안에서 처리합니다.','상담 텍스트와 별도로 동의한 대표사진 5장을 Gemini에 전송해 피드백을 받습니다. 원본 영상·관절 좌표는 기기 안에서 처리하며 분석 결과는 이 브라우저에 보관합니다.');p.write_text(s)
