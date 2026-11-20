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
# Conversation is the primary setup UI. Keep internal import handlers but remove demo controls.
p=d/'index.html';s=p.read_text();s=s.replace('id="csv" type="file"','id="csv" type="file" disabled');p.write_text(s)
p=d/'demo-start.js';s=p.read_text();s=s.replace("document.getElementById('start').focus();", "document.getElementById('start').focus();")
s += '''\n(()=>{function clean(){document.getElementById('try-sample')?.remove();document.querySelectorAll('.full-scenario-entry,.full-demo-tour,.full-demo-help').forEach(e=>e.remove());const csv=document.getElementById('csv');if(csv)csv.closest('details')?.setAttribute('hidden','');document.querySelectorAll('.site-notice').forEach(e=>e.remove());}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',clean);else clean();})();\n'''
p.write_text(s)
# The scenario entry is installed by an earlier DOMContentLoaded callback; remove it after callbacks.
p=d/'index.html';s=p.read_text();s=s.replace('document.getElementById("drop").append(a);','/* Course entry belongs to results, not upload. */');p.write_text(s)
p=d/'instrument.js';s=p.read_text();s=s.replace('    log.scrollTop = log.scrollHeight;','    log.scrollTop = log.scrollHeight;\n    requestAnimationFrame(()=>line.scrollIntoView?.({block:"nearest",behavior:"smooth"}));');p.write_text(s)
p=d/'overhaul.css';s=p.read_text();s+='''
/* Natural document flow: embedded mobile browser/keyboard must not compress messages. */
body:has(.instrument){display:block;height:auto;min-height:100%;overflow-y:auto}
.instrument{height:auto;min-height:100dvh}
.instrument[data-step='1'] .setup,.instrument[data-step='1'] #upload,.instrument[data-step='1'] #upload>.section-body{flex:none;min-height:auto;overflow:visible}
.instrument[data-step='1'] #coach-panel{flex:none;min-height:auto;overflow:visible}
#coach-log{flex:none;min-height:260px;max-height:none;overflow:visible;padding-block:12px}
#coach-log li{flex:0 0 auto;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-size:16px}
#coach-log li[data-role='user']{align-self:flex-end;background:var(--ink);color:var(--paper)}
#coach-log li[data-role='assistant'],#coach-log li.coach-welcome{align-self:flex-start;background:var(--field);color:var(--ink)}
#coach-form{position:sticky;bottom:0;z-index:4;background:var(--paper);padding:10px 0 max(10px,env(safe-area-inset-bottom));margin-top:8px}
#coach-message{font-size:16px;min-height:52px;height:64px;max-height:160px;overflow-y:auto}
#upload-actions{position:static;margin-top:12px}#file-info{overflow-wrap:anywhere}
#preview-slot{max-height:150px;min-height:100px;flex:none}
#coach-panel>.privacy{order:5}#coach-panel>.privacy:not([open]){font-size:14px}
.instrument[data-step='2'] #summary-review,.instrument[data-step='2'] .summary-fields{min-height:auto;overflow:visible;flex:none}
@media(max-width:600px){#coach-log{min-height:300px}#coach-log li{max-width:94%}#coach-panel{gap:10px}.instrument{padding-bottom:24px}}
''';p.write_text(s)
# One analysis action: summary internally, then extraction, then results; failures stay visible.
p=d/'index.html';s=p.read_text().replace('AI 코칭 이용에 동의합니다','AI 코칭·자세 분석 이용에 동의합니다').replace('사용자가 추정한 원인','원인 가설');s=s.replace('동의하면 상담 텍스트가 외부 AI 서비스로 전송됩니다.','동의하면 상담 텍스트와 분석용 정지 이미지 5장이 외부 AI 서비스로 전송됩니다. 원본 영상과 좌표는 전송하지 않습니다.')
s=s.replace('<div id="progress"','<div id="progress"')
s=s.replace('<button id="cancel"', '<button id="analysis-retry" type="button" hidden>분석 다시 시도</button><button id="analysis-back" type="button" hidden>대화로 돌아가기</button><button id="cancel"')
p.write_text(s)
p=d/'instrument.js';s=p.read_text().replace('AI 코치','모션가드 코치')
s=s.replace('summaryPanel.hidden=false;step(2);approve.disabled=true;','summaryPanel.hidden=true;step("busy");approve.disabled=true;byId("analysis-retry").hidden=byId("analysis-back").hidden=true;')
a=s.index('      for (const input of summaryFields) {',s.index('  async function reviewSummary()'));b=s.index('\n    } catch (error) {',a)
s=s[:a]+'''      clearTimeout(summaryTimeout);request=undefined;
      await analyze(result.summary);'''+s[b:]
s=s.replace("byId('summary-retry').hidden=false;", "byId('summary-retry').hidden=false;report('상담 정리를 완료하지 못했습니다. '+(controller.signal.aborted?'연결 시간이 초과됐습니다.':error.message),0);byId('analysis-retry').hidden=byId('analysis-back').hidden=false;")
s=s.replace("if(!csv&&!byId('photo-consent')?.checked){byId('summary-feedback').textContent='AI 자세 분석 이용 동의를 확인해 주세요.';byId('photo-consent').focus();return;}","if(!consent.checked){step(1);coachStatus.textContent='AI 코칭·자세 분석 이용에 동의해 주세요.';consent.focus();return;}byId('photo-consent').checked=true;")
s=s.replace('    preview.pause();\n    report(csv', '    const analysisTimeout=setTimeout(()=>controller.abort(),180000);\n    byId("analysis-retry").hidden=byId("analysis-back").hidden=true;\n    preview.pause();\n    report(csv')
s=s.replace('      step(csv ? 1 : 2);', '      step("busy");byId("analysis-retry").hidden=byId("analysis-back").hidden=false;')
s=s.replace('" 전신이 보이는 MP4를 선택하거나 좌표 CSV로 다시 시도해 주세요."','" 같은 영상으로 다시 시도하거나 대화로 돌아갈 수 있습니다."')
s=s.replace('      request = undefined;\n      byId("start").disabled = byId("video")','      clearTimeout(analysisTimeout);request = undefined;\n      byId("start").disabled = byId("video")')
s=s.replace('  byId("start").addEventListener("click", reviewSummary);','  byId("start").textContent="분석하기";\n  byId("start").addEventListener("click", reviewSummary);\n  byId("analysis-retry").onclick=reviewSummary;byId("analysis-back").onclick=()=>step(1);')
s=s.replace("byId('start').textContent='상담 정리하고 분석하기';","byId('start').textContent='분석하기';")
p.write_text(s)
p=d/'overhaul.css';p.write_text(p.read_text()+"\n#progress:has(#analysis-retry:not([hidden])){justify-content:flex-start}#analysis-retry,#analysis-back{min-height:48px}#coach-mode{white-space:normal}\n")
p=d/'instrument.js';s=p.read_text();needle='  async function analyze(approvedSummary) {';s=s.replace(needle,'''  function analysisWait(promise,signal){return new Promise((resolve,reject)=>{const stop=()=>reject(new Error('분석이 중단됐거나 처리 시간이 초과됐습니다.'));if(signal.aborted){stop();return;}signal.addEventListener('abort',stop,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));});}
'''+needle)
s=s.replace('      const track = await readResponse(response);','      const track = await analysisWait(readResponse(response),controller.signal);')
s=s.replace('        coaching = await coachPost("analyze", {','        coaching = await analysisWait(coachPost("analyze", {').replace('conversation_summary: approvedSummary}, controller.signal);','conversation_summary: approvedSummary}, controller.signal),controller.signal);')
p.write_text(s)
for name in ['index.html','instrument.js']:
 p=d/name;p.write_text(p.read_text().replace('AI 코칭·자세 분석','모션가드 코칭·자세 분석').replace('AI 코칭 이용','모션가드 코칭 이용'))
p=d/'demo-start.js';s=p.read_text();s+='''
(()=>{function ready(){const preview=document.getElementById('preview-slot'),drop=document.getElementById('drop'),form=document.getElementById('coach-form'),panel=document.getElementById('coach-panel');if(!preview||!drop||!form)return;const media=document.createElement('details');media.id='uploaded-media';media.open=true;const title=document.createElement('summary');title.textContent='내 스윙 영상';media.append(title);preview.before(media);media.append(preview,drop);const collapse=()=>{const input=document.getElementById('coach-message');if(!input?.value.trim()||!document.getElementById('coach-consent')?.checked)return;const video=document.getElementById('upload-preview');video?.pause();media.open=false;title.textContent='올린 영상 보기·변경';panel.classList.add('conversation-active');};form.addEventListener('submit',collapse,true);document.getElementById('video')?.addEventListener('change',()=>{media.open=true;title.textContent='내 스윙 영상';});}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();})();
''';p.write_text(s)
p=d/'overhaul.css';p.write_text(p.read_text()+'''
#uploaded-media{flex:none;border-bottom:1px solid var(--line);padding-bottom:8px}
#uploaded-media>summary{font-size:16px;color:var(--ink);min-height:44px}
#uploaded-media:not([open])>:not(summary){display:none!important}
#uploaded-media #drop{margin-top:8px}
#coach-panel.conversation-active #coach-log{min-height:55svh;min-height:max(320px,55svh)}
#coach-panel.conversation-active #coach-log li{height:auto;max-height:none;overflow:visible;flex-shrink:0}
#coach-log strong{margin-bottom:5px}
''')
p=d/'index.html';s=p.read_text().replace('<form id="coach-form">','<p id="attachment-status" class="attachment-status" role="status" hidden></p><form id="coach-form">');p.write_text(s)
p=d/'demo-start.js';s=p.read_text();s+='''
(()=>{function ready(){const file=document.getElementById('video'),status=document.getElementById('attachment-status');if(!file||!status)return;const refresh=()=>{const f=file.files?.[0];status.hidden=!f;status.textContent=f?'영상이 첨부되어 있습니다 · '+f.name+' · 고민을 입력한 뒤 보내 주세요.':'';};file.addEventListener('change',refresh);refresh();}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();})();
''';p.write_text(s)
p=d/'instrument.js';s=p.read_text().replace('    const line = chatLine("나", value);','''    const line = chatLine("나", value);
    if(selected?.file&&!messages.slice(0,-1).some(m=>m.role==='user')){
      const attachment=node('small','첨부 영상 · '+selected.file.name,'chat-attachment');line.append(attachment);
    }''')
s=s.replace('    if(request||chatRequest)return;\n    if(!selected)',"    if(request||chatRequest)return;\n    if(!messages.some(m=>m.role==='user')){coachStatus.textContent='먼저 고민을 입력하고 보내 주세요. 대화를 바탕으로 분석합니다.';message.focus();return;}\n    if(!selected)")
p.write_text(s)
p=d/'overhaul.css';p.write_text(p.read_text()+"\n.attachment-status{font-size:14px;line-height:1.5;padding:10px 12px;background:var(--field);border-radius:10px;overflow-wrap:anywhere}.chat-attachment{display:block;margin-top:10px;padding-top:8px;border-top:1px solid currentColor;font-size:14px;overflow-wrap:anywhere}\n")
p=d/'instrument.js';s=p.read_text().replace("node('small','첨부 영상 · '+selected.file.name,'chat-attachment')","node('small','스윙 영상 첨부됨','chat-attachment')")
s=s.replace('      message.value = "";','''      message.value = "";
      const attached=byId('attachment-status');if(attached&&!attached.hidden){attached.textContent='영상 첨부됨 · 위의 영상 보기에서 확인할 수 있어요.';attached.dataset.sent='true';}''')
p.write_text(s)
p=d/'demo-start.js';s=p.read_text().replace("status.hidden=!f;status.textContent=", "status.hidden=!f;delete status.dataset.sent;status.textContent=");p.write_text(s)
p=d/'overhaul.css';p.write_text(p.read_text()+'''
.site-notice{display:none!important}
#coach-panel.conversation-active #coach-log,#coach-log{min-height:0;justify-content:flex-start;padding-block:12px}
#coach-panel.conversation-active{gap:10px}
.attachment-status[data-sent='true']{font-size:14px;padding:6px 0;background:transparent;color:var(--ink-2)}
#coach-panel #coach-form{margin-top:0}
''')
# A single attachment card above the conversation replaces verbose/duplicate notices.
p=d/'demo-start.js';s=p.read_text();s+='''
(()=>{function ready(){const input=document.getElementById('video'),log=document.getElementById('coach-log'),media=document.getElementById('uploaded-media');if(!input||!log||!media)return;const card=document.createElement('button');card.id='conversation-file';card.type='button';card.hidden=true;card.setAttribute('aria-controls','uploaded-media');const icon=document.createElement('span');icon.textContent='▤';icon.setAttribute('aria-hidden','true');const text=document.createElement('span'),title=document.createElement('strong'),name=document.createElement('span');title.textContent='파일 첨부됨';name.className='conversation-file-name';text.append(title,name);const action=document.createElement('span');action.textContent='보기·변경';action.className='conversation-file-action';card.append(icon,text,action);log.before(card);const sync=()=>{const file=input.files?.[0];card.hidden=!file;if(file){name.textContent=file.name;name.title=file.name;card.setAttribute('aria-label','첨부 파일 '+file.name+' 보기 또는 변경');media.open=false;media.dataset.attached='true';}};card.onclick=()=>{media.open=!media.open;card.setAttribute('aria-expanded',String(media.open));};media.addEventListener('toggle',()=>card.setAttribute('aria-expanded',String(media.open)));input.addEventListener('change',sync);sync();}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();})();
''';p.write_text(s)
p=d/'overhaul.css';p.write_text(p.read_text()+'''
#attachment-status,#file-info,.chat-attachment{display:none!important}
#uploaded-media[data-attached='true']:not([open]){display:none}
#conversation-file{display:flex;align-items:center;justify-content:flex-start;gap:10px;width:100%;max-width:420px;padding:10px 12px;min-height:60px;border:1px solid var(--line);border-radius:12px;background:var(--field);text-align:left;flex:none}
#conversation-file>span:first-child{font-size:25px;flex:none}
#conversation-file>span:nth-child(2){display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
#conversation-file strong{font-size:14px;font-weight:600}
.conversation-file-name{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;color:var(--ink-2)}
.conversation-file-action{font-size:14px;flex:none;color:var(--ink-2)}
#coach-panel #coach-mode{margin-bottom:0}
#upload-actions{padding-top:10px}#upload-actions #start{min-height:52px}
''')
