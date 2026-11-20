"""Latest consultation UI and retry recovery, applied after the shared flow patches."""
from pathlib import Path
r=Path(__file__).resolve().parents[1];d=r/'dist'
p=d/'index.html';s=p.read_text();s=s.replace('<h3>어디가 고민이세요? <span id="coach-mode" class="caption" role="status"></span></h3>','<span id="coach-mode" role="status" hidden></span>')
s=s.replace('<h2 id="summary-heading" tabindex="-1">이렇게 이해했어요</h2>','<div class="summary-intro"><span class="summary-eyebrow">나를 위한 코칭 방향</span><h2 id="summary-heading" tabindex="-1">이렇게 이해했어요</h2><p>고민에서 연습 목표까지, 핵심만 정리했어요.</p></div>')
s=s.replace('<p>사용자 자기보고입니다. 영상에서 확인된 사실은 분석 후 따로 표시합니다.</p>','')
icons={'concern':'M5 5h14v10H9l-4 4V5Z','improvement':'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l8-8M15 4h5v5','hypothesis':'M9 18h6M10 21h4M9 15c0-3-3-3-3-7a6 6 0 0 1 12 0c0 4-3 4-3 7Z','goal':'M5 21V3l14 4-14 5'}
for key,old,title,hint in [('concern','고민','지금의 고민','대화에서 들려주신 이야기'),('improvement','개선하고 싶은 부분','바꾸고 싶은 동작','이번 분석에서 집중할 부분'),('hypothesis','원인 가설','코치의 가설','사진 분석에서 함께 확인할 방향'),('goal','연습 목표','이번 연습의 목표','어떤 연습을 할지 구체적으로')]:
 old_text='<label>'+old+'<textarea name="'+key+'"'
 icon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+icons[key]+'" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
 new='<label class="summary-direction '+key+'"><span class="summary-direction-heading">'+icon+'<span>'+title+'</span></span><span class="summary-direction-hint">'+hint+'</span><textarea name="'+key+'"'
 assert old_text in s,key;s=s.replace(old_text,new)
p.write_text('\n'.join(line.rstrip() for line in s.splitlines())+'\n')
p=d/'demo-start.js';s=p.read_text().replace("title.textContent='첨부 파일'","title.textContent='영상 업로드 완료'").replace("title.textContent='파일 첨부됨'","title.textContent='영상 업로드 완료'").replace("card.setAttribute('aria-label','첨부 파일 펼치기 또는 접기')","card.setAttribute('aria-label','업로드한 영상 펼치기 또는 접기')")
# Move the original checkbox node; its existing consent listeners and checked state remain intact.
s=s.replace('log.before(card);const sync=',"log.before(card);const agreement=document.getElementById('coach-consent')?.closest('label');if(agreement){agreement.classList.add('upload-agreement');card.after(agreement);}const sync=")
s=s.replace("'영상이 첨부되어 있습니다 · '+f.name+' · 고민을 입력한 뒤 보내 주세요.'","'영상 업로드 완료'").replace("'파일 다시 올리기'","'영상 다시 올리기'")
p.write_text(s)
p=d/'instrument.js';s=p.read_text().replace('스윙 영상 첨부됨','영상 업로드 완료').replace('영상 첨부됨 · 위의 영상 보기에서 확인할 수 있어요.','영상 업로드 완료');s=s.replace('  async function reviewSummary() {','  let lastApprovedSummary=null;\n  async function reviewSummary() {')
s=s.replace('    const summaryTimeout=setTimeout(', '    lastApprovedSummary=null;\n    const summaryTimeout=setTimeout(')
s=s.replace("byId('summary-origin').textContent='대화에서 정리한 고민과 코치 제안입니다. 필요하면 수정해 주세요.';","byId('summary-origin').textContent='내용을 바로 수정할 수 있어요. 확인 후 분석을 시작해 주세요.';")
s=s.replace('    if (!approvedSummary) return;', '    if (!approvedSummary) return;\n    lastApprovedSummary={...approvedSummary};')
s=s.replace('byId("analysis-retry").onclick=reviewSummary;', 'byId("analysis-retry").onclick=()=>{if(lastApprovedSummary)analyze({...lastApprovedSummary});else reviewSummary();};')
p.write_text(s)

# Chat/summary must get a full response before the browser aborts, with a small network margin.
p=d/'instrument.js';s=p.read_text().replace('const chatTimeout=setTimeout(()=>controller.abort(),35000);','const chatTimeout=setTimeout(()=>controller.abort(),80000);').replace('const summaryTimeout=setTimeout(()=>controller.abort(),35000);','const summaryTimeout=setTimeout(()=>controller.abort(),80000);')
s=s.replace('{messages}), ...data, allow_external:', '{messages,client_timeout_ms:80000}), ...data, allow_external:')
s=s.replace('    return readResponse(response);\n  }\n\n  function chatLine', "    if(!response.ok){let error;try{error=await response.json();}catch{}throw Error((error?.reason||'코치 연결을 확인해 주세요.')+(error?.request_id?' (확인번호 '+error.request_id.slice(0,8)+')':''));}\n    return readResponse(response);\n  }\n\n  function chatLine")
s=s.replace('    coachStatus.textContent = "답변을 기다리는 중입니다.";', '    const pendingLine=chatLine("모션가드 코치","답변을 준비하고 있어요…");pendingLine.className="coach-pending";byId("coach-retry").hidden=true;\n    coachStatus.textContent = "";')
s=s.replace(' + " 입력한 메시지를 다시 보낼 수 있습니다.";', ';\n      byId("coach-retry").hidden=false;')
s=s.replace('      clearTimeout(chatTimeout);','      pendingLine.remove();clearTimeout(chatTimeout);')
s=s.replace('  function node(tag, text, className) {','  byId("coach-retry").onclick=()=>{if(message.value.trim())coachForm.requestSubmit();};\n  function node(tag, text, className) {')
p.write_text(s)
p=d/'index.html';p.write_text(p.read_text().replace('<p id="coach-status" role="status"></p>','<p id="coach-status" role="status"></p><button id="coach-retry" type="button" hidden>다시 보내기</button>'))
# The controls are optional when a previously cached page loads the new script.
p=d/'instrument.js';s=p.read_text().replace('byId("coach-retry").hidden=true;', 'if(byId("coach-retry"))byId("coach-retry").hidden=true;').replace('byId("coach-retry").hidden=false;', 'if(byId("coach-retry"))byId("coach-retry").hidden=false;').replace('  byId("coach-retry").onclick=()=>{if(message.value.trim())coachForm.requestSubmit();};', '  if(byId("coach-retry"))byId("coach-retry").onclick=()=>{if(message.value.trim())return coachForm.requestSubmit();};')
a=s.index('  coachForm.addEventListener("submit"');b=s.index('  function node(',a);part=s[a:b].replace('if (controller.signal.aborted) return;', 'if (controller.signal.aborted) throw Error("답변 연결 시간이 초과됐습니다.");');s=s[:a]+part+s[b:];p.write_text(s)
