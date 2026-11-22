"""Optional recent round input and explicit request propagation."""
from pathlib import Path
import shutil
r=Path(__file__).resolve().parents[1];d=r/'dist'
p=d/'index.html';s=p.read_text();card='''<details class="recent-round-card" id="recent-round-card" open>
  <summary class="recent-round-heading"><span class="recent-round-label" id="recent-round-title">18홀 타수</span><span class="recent-round-optional" id="recent-round-summary-value">선택</span></summary>
  <div class="recent-round-input"><input id="recent-round-score" type="number" inputmode="numeric" min="54" max="200" step="1" placeholder="입력" aria-label="18홀 라운드 타수 (선택)" aria-describedby="recent-round-hint"></div>
  <p id="recent-round-hint">영상 촬영 시기와 가까운 타수를 입력해 주세요.</p>
</details>'''
assert '<div id="coach-panel">' in s;s=s.replace('<div id="coach-panel">',card+'<div id="coach-panel">',1);s=s.replace('<script src="./instrument.js"','<script src="./round-score.js"></script><script src="./chat-layout.js"></script><script src="./instrument.js"');p.write_text(s);shutil.copy2(r/'overrides/round-score.js',d/'round-score.js');shutil.copy2(r/'overrides/chat-layout.js',d/'chat-layout.js')
p=d/'instrument.js';s=p.read_text();s=s.replace('...data, allow_external: consent.checked','...data, ...window.MotionRoundScore?.payload?.(), allow_external: consent.checked');s=s.replace('    lastApprovedSummary={...approvedSummary};',"    try{approvedSummary=window.MotionRoundScore?.attach(approvedSummary)??approvedSummary;}catch(error){coachStatus.textContent=error.message;return;}\n    lastApprovedSummary={...approvedSummary};");p.write_text(s)
p=d/'client-api.js';s=p.read_text();old='    doc.visual_analysis=await MotionVisual.analyze';assert old in s;s=s.replace(old,"    const recentScore=data.conversation_summary?.recent_round_score;if(Number.isInteger(recentScore)&&recentScore>=54&&recentScore<=200)doc.recent_round_score=recentScore;\n"+old);p.write_text(s)

# Chat validation happens before adding a turn. Message scroll waits for settled layout.
p=d/'instrument.js';s=p.read_text();a=s.index('  coachForm.addEventListener("submit"');b=s.index('  function node(',a);part=s[a:b];marker='    const controller = new AbortController();';assert marker in part;part=part.replace(marker,"    try{window.MotionRoundScore?.read();}catch(error){coachStatus.textContent=error.message;return;}\n    window.MotionRoundScore?.collapse?.();\n"+marker,1);part=part.replace('      pendingLine?.remove();clearTimeout(chatTimeout);','      pendingLine?.remove();window.MotionChatLayout?.settle?.();clearTimeout(chatTimeout);');s=s[:a]+part+s[b:];old='    requestAnimationFrame(()=>line.scrollIntoView?.({block:"nearest",behavior:"smooth"}));';assert old in s;s=s.replace(old,'    if(window.MotionChatLayout)window.MotionChatLayout.reveal(line);else requestAnimationFrame(()=>line.scrollIntoView?.({block:"nearest",behavior:"smooth"}));');p.write_text(s)
