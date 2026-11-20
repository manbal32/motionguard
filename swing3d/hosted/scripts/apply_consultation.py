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
p=d/'demo-start.js';s=p.read_text().replace("title.textContent='파일 첨부됨'","title.textContent='영상 업로드 완료'").replace("card.setAttribute('aria-label','첨부 파일 '+file.name+' 보기 또는 변경')","card.setAttribute('aria-label','업로드한 영상 보기 또는 변경')")
# Move the original checkbox node; its existing consent listeners and checked state remain intact.
s=s.replace('log.before(card);const sync=',"log.before(card);const agreement=document.getElementById('coach-consent')?.closest('label');if(agreement){agreement.classList.add('upload-agreement');card.after(agreement);}const sync=")
p.write_text(s)
p=d/'instrument.js';s=p.read_text();s=s.replace('  async function reviewSummary() {','  let lastApprovedSummary=null;\n  async function reviewSummary() {')
s=s.replace('    const summaryTimeout=setTimeout(', '    lastApprovedSummary=null;\n    const summaryTimeout=setTimeout(')
s=s.replace("byId('summary-origin').textContent='대화에서 정리한 고민과 코치 제안입니다. 필요하면 수정해 주세요.';","byId('summary-origin').textContent='내용을 바로 수정할 수 있어요. 확인 후 분석을 시작해 주세요.';")
s=s.replace('    if (!approvedSummary) return;', '    if (!approvedSummary) return;\n    lastApprovedSummary={...approvedSummary};')
s=s.replace('byId("analysis-retry").onclick=reviewSummary;', 'byId("analysis-retry").onclick=()=>{if(lastApprovedSummary)analyze({...lastApprovedSummary});else reviewSummary();};')
p.write_text(s)
