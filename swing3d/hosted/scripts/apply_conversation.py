from pathlib import Path
r=Path(__file__).resolve().parents[1];d=r/'dist'
p=d/'index.html';s=p.read_text()
s=s.replace('Gemini에 상담 텍스트 전송 동의 (원본 영상 제외)','AI 코칭 이용에 동의합니다')
old='<label><input id="photo-consent" type="checkbox"> 분석할 대표사진 5장과 승인한 상담 요약을 Gemini에 전송합니다. 원본 영상·좌표는 보내지 않습니다.</label>'
assert old in s;s=s.replace(old,'')
s=s.replace('<div class="flow-foot"><button id="summary-approve">','<p id="summary-feedback" role="status" aria-live="polite"></p><label><input id="photo-consent" type="checkbox"> 선택한 장면으로 AI 자세 분석을 받는 데 동의합니다.</label><details><summary>분석 데이터 안내</summary><p>선택한 정지 이미지 5장과 승인한 상담 요약을 외부 AI 서비스에 전송합니다. 원본 영상과 관절 좌표는 보내지 않습니다.</p></details><button id="summary-retry" type="button" hidden>상담 요약 다시 불러오기</button><div class="flow-foot"><button id="summary-approve">')
s=s.replace('영상을 먼저 선택하세요. 상담 없이 분석할 수도 있습니다.','먼저 편하게 이야기해 주세요. 대화를 정리한 뒤 영상 분석으로 이어집니다.')
s=s.replace('Gemini로 전송됩니다.','외부 AI 서비스로 전송됩니다.')
s=s.replace('상담 텍스트와 계측 수치가','상담 텍스트가')
p.write_text(s)
p=d/'instrument.js';s=p.read_text()
s=s.replace('providerMode === "gemini" ? (consent.checked ? "Gemini 상담 연결" : "텍스트 전송 동의 후 AI 상담") : "AI 상담 연결 필요"','providerMode === "gemini" ? "AI 코치와 대화" : "상담 연결 확인 중"')
s=s.replace('    if (request || chatRequest || composing || !value) return;','''    if (request || chatRequest || composing || !value) return;
    if(!consent.checked){coachStatus.textContent='대화를 시작하려면 AI 코칭 이용에 동의해 주세요.';consent.focus();return;}''')
s=s.replace('    const controller = new AbortController();\n    summaryPanel.hidden = true;','    const controller = new AbortController();\n    const chatTimeout=setTimeout(()=>controller.abort(),35000);\n    summaryPanel.hidden = true;',1)
s=s.replace('      chatLine(reply.mode === "gemini" ? "Gemini 코치" : "상담 응답", reply.text);','''      if(typeof reply.text!=='string'||!reply.text.trim())throw Error('답변을 받지 못했습니다. 다시 보내 주세요.');
      chatLine("AI 코치", reply.text);
      byId('start').textContent='상담 정리하고 분석하기';''')
# Validate before mutating history.
s=s.replace('      messages.push({role: "assistant", text: reply.text});\n      if(typeof reply.text', '      if(typeof reply.text')
s=s.replace('      chatLine("AI 코치", reply.text);','      messages.push({role:"assistant",text:reply.text});\n      chatLine("AI 코치", reply.text);')
s=s.replace('      if (controller.signal.aborted) return;\n      messages.pop();','      messages.pop();',1)
s=s.replace('      coachStatus.textContent = error.message + " 입력한 메시지를 다시 보낼 수 있습니다.";','      coachStatus.textContent = (controller.signal.aborted?"답변 연결 시간이 초과됐습니다.":error.message) + " 입력한 메시지를 다시 보낼 수 있습니다.";')
s=s.replace('      if (chatRequest === controller) {','      clearTimeout(chatTimeout);\n      if (chatRequest === controller) {',1)
s=s.replace('    if (!selected || request || chatRequest) return;\n    const controller = new AbortController();','''    if(request||chatRequest)return;
    if(!selected){coachStatus.textContent='대화를 이어갈 수 있어요. 분석하려면 먼저 스윙 영상을 선택해 주세요.';byId('choose-video').focus();return;}
    if(messages.length&&!consent.checked){coachStatus.textContent='AI 코칭 이용 동의를 확인해 주세요.';consent.focus();return;}
    const controller = new AbortController();''',1)
s=s.replace('    summaryPanel.hidden = true;\n    report("상담 요약 준비", 0);','''    summaryPanel.hidden=false;step(2);approve.disabled=true;
    byId('summary-feedback').textContent='대화 내용을 정리하고 있어요.';
    byId('summary-retry').hidden=true;
    const summaryTimeout=setTimeout(()=>controller.abort(),35000);
    report("상담 요약 준비", 0);''')
s=s.replace('      byId("summary-origin").textContent = result.mode === "gemini" ? "Gemini 요약 · 확인이 필요합니다"','      byId("summary-origin").textContent = result.mode === "gemini" ? "이야기한 내용이 맞는지 확인해 주세요"')
s=s.replace('      report("상담 요약 확인 대기", 0);','      byId("summary-feedback").textContent="확인 후 이대로 분석을 눌러 주세요.";approve.disabled=false;\n      report("상담 요약 확인 대기", 0);')
s=s.replace('      report("요약을 불러오지 못했습니다. 분석하기로 다시 시도해 주세요. " + error.message, 0);','''      byId('summary-feedback').textContent='상담 요약을 불러오지 못했습니다. '+(controller.signal.aborted?'연결 시간이 초과됐습니다.':error.message);
      byId('summary-retry').hidden=false;''')
s=s.replace('    } finally {\n      request = undefined;\n      byId("start").disabled', '    } finally {\n      clearTimeout(summaryTimeout);request = undefined;\n      byId("start").disabled',1)
s=s.replace('  byId("summary-edit").onclick =', '  byId("summary-retry").onclick=reviewSummary;\n  byId("summary-edit").onclick =',1)
s=s.replace("if(!csv&&!byId('photo-consent')?.checked){summaryPanel.hidden=true;step(1);coachStatus.textContent='AI 사진 분석을 위해 대표사진 5장 전송에 동의해 주세요.';return;}","if(!csv&&!byId('photo-consent')?.checked){byId('summary-feedback').textContent='AI 자세 분석 이용 동의를 확인해 주세요.';byId('photo-consent').focus();return;}")
p.write_text(s)
p=d/'demo-start.js';s=p.read_text();s=s.replace('상담 텍스트와 별도로 동의한 대표사진 5장을 Gemini에 전송해 피드백을 받습니다. 원본 영상·관절 좌표는 기기 안에서 처리하며 분석 결과는 이 브라우저에 보관합니다.','AI 코치와 대화하고 내 스윙의 개선점을 확인하세요. 데이터 처리 내용은 이용 안내에서 확인할 수 있습니다.');s=s.replace('동의 후 Gemini AI 상담','내 스윙을 위한 AI 코칭');p.write_text(s)
