/* Customer report: tables and diagrams from the saved, approved analysis. */
(async()=>{
 const $=id=>document.getElementById(id),{node,labels,phases,cell,pair,improvements,diagram}=MotionCustomer;
 $('print-report').onclick=async()=>{await document.fonts.ready;window.print();};
 try{
  const id=new URLSearchParams(location.search).get('track')??location.pathname.split('/').at(-1),reportId=new URLSearchParams(location.search).get('coaching');
  if(!/^[a-f0-9]{64}$/.test(id)||!/^[a-f0-9]{32}$/.test(reportId??''))throw Error('리포트 주소를 확인해 주세요.');
  const response=await fetch('/api/coaching/report/'+reportId);if(!response.ok)throw Error('리포트를 찾을 수 없습니다.');const doc=await response.json();
  if(doc.track_id!==id)throw Error('분석과 리포트가 일치하지 않습니다.');
  $('return-result').href=new URL('./?result='+reportId,location.href).href;
  const report=doc.customer_report,items=improvements(doc),score=doc.score;
  MotionCourseLink.bind($('report-course'),doc);const played=MotionCourseLink.summary(doc);$('report-course-summary').textContent=played?`${played.course} · ${played.holes}홀 가상 플레이를 다시 볼 수 있어요.`:'이번 스윙을 바탕으로 클럽 거리와 편차를 가정해 재생합니다. 실제 비거리·구질은 측정하지 않았습니다.';
  $('report-round').textContent=String(doc.session??1).padStart(2,'0')+'회';$('report-date').textContent=(report.issued_at??'').slice(0,10);
  $('report-total').textContent=score.total===null?'—':Math.round(score.total);
  // 숫자 하나로는 좋은지 나쁜지 알 수 없다. 읽으면 바로 아는 한 줄을 붙인다.
  $('report-verdict').textContent=score.total===null?'이번 영상으로는 점수를 내지 못했습니다.'
   :score.total>=80?'교본에 가까운 스윙입니다.':score.total>=60?'대체로 교본 안에 있습니다.'
   :score.total>=40?'고칠 점이 몇 가지 있습니다.':'고칠 점이 뚜렷합니다.';
  if(items[0])$('report-headline').append(document.createTextNode('이번에 먼저 고칠 것 · '),node('b',labels[items[0].channel]));
  const delta=doc.comparison_history;if(delta?.comparable){$('report-delta').hidden=false;$('report-delta').textContent=(delta.total_delta>=0?'+':'')+delta.total_delta.toFixed(1)+'점';}
  for(const e of doc.profile?.entries??[{score_total:score.total}]){const bar=node('i');bar.style.height=(5+(e.score_total??0)*.25)+'px';bar.setAttribute('aria-label',String(e.score_total));$('report-round-bars').append(bar);}
  $('report-question').textContent=report.concern;$('report-conclusion').textContent=report.conclusion;$('report-strength').textContent=report.strength;
  $('report-measured').textContent=`이번 영상에서는 ${score.measured_count}개 항목을 쟀습니다.`;$('measurement-note').textContent=report.measurement_note;
  for(const [i,item] of items.entries()){
   const row=$('report-summary-table').tBodies[0].insertRow();
   for(const text of [labels[item.channel],cell(item.measured,item),cell(item.reference,item),item.state]){const cell=row.insertCell();cell.textContent=text;}
   row.cells[2].className='ref';row.cells[3].className='state'+(item.state==='적정'?' good':'');
   const card=node('article',undefined,'gap-row');card.dataset.finding=item.id;card.dataset.difference=String(item.measured-item.reference);
   const content=node('div',undefined,'c'),title=node('h3',item.title),state=node('span',item.state,'state'+(item.state==='적정'?' good':''));title.append(state);
   content.append(title,node('p',item.observation,'d'),node('p',`${phases[item.phase]} · ${pair(item)}`,'v'),node('p',item.drill,'d'));
   card.append(node('span',String(i+1),'no'),diagram(item),content);$('report-improvements').append(card);
   const drill=window.MotionDrills?.get(item)??{title:'관련 연습 영상 검색',url:'https://www.youtube.com/results?'+new URLSearchParams({search_query:item.youtube?.[0]??'골프 '+labels[item.channel]+' 연습'}),seconds:null,curated:false};
   const link=node('a',undefined,'vid-card');link.href=drill.url;link.target='_blank';link.rel='noopener noreferrer';link.dataset.curated=String(!!drill.curated);
   const meta=node('span',undefined,'m');meta.append(node('b',drill.title),node('span',(drill.seconds?Math.floor(drill.seconds/60)+'분 '+String(drill.seconds%60).padStart(2,'0')+'초':'검색 결과')+` · 고칠 점 ${i+1}번`,'sub'));
   link.append(node('span','▶','th'),meta);$('report-videos').append(link);
  }
  if(!items.length)$('report-improvements').append(node('p','확정한 개선 포인트가 없습니다.','note'));
  const strokes=doc.strokes;
  if(strokes){const range=v=>v.map(n=>n.toFixed(1)).join('–')+'타';$('strokes-current').textContent=range(strokes.current);$('strokes-after').textContent=range(strokes.after);$('strokes-condition').textContent=strokes.condition;
   $('strokes-missing').textContent=strokes.missing_note;
   $('strokes-basis').append(node('p',strokes.basis));
   $('strokes-basis').append(node('p',`기준 ${strokes.base}타 + 측정 항목의 영향 ${strokes.penalty.toFixed(2)}타. 선택한 개선 포인트만 교본값에 맞춰 다시 계산합니다.`));
   for(const item of strokes.contributions)$('strokes-basis').append(node('p',`${phases[item.id.split('_')[0]]} · ${labels[item.id.split('_').slice(1).join('_')]} ${item.score.toFixed(1)}점 × 가중치 ${item.weight} × 영향 ${item.impact} → +${item.penalty.toFixed(2)}타`));
  }else $('report-strokes').hidden=true;
  $('report-goal').textContent=report.goal?'다음 연습 목표 · '+report.goal:'';$('report-mode').textContent=(doc.mode==='demo'?'데모 코칭':'상담·영상 종합')+' · '+report.issued_at.slice(0,16).replace('T',' ');
  $('appendix-facts').textContent=`회차 ${doc.session??1} · 총점 ${score.total} · 측정 ${score.measured_count}개`;
  for(const [key,label] of [['concern','고민'],['improvement','개선 희망'],['hypothesis','사용자 추정'],['goal','연습 목표']])$('appendix-approved').append(node('p',label+' · '+(doc.conversation_summary[key]||'입력 없음')));
  $('appendix-excluded').textContent=score.excluded.length?score.excluded.map(k=>{const [phase,...channel]=k.split('_');return(phases[phase]??phase)+' '+(labels[channel.join('_')]??'동작');}).join(' · '):'제외한 항목 없음';
  for(const item of score.items){const row=$('report-angles').tBodies[0].insertRow();for(const text of [phases[item.phase],labels[item.channel],cell(item.measured,item),cell(item.reference,item),item.score.toFixed(1),item.state])row.insertCell().textContent=text;}
  try{const r=await fetch('/api/track/'+id);if(!r.ok)throw Error('missing');const track=await r.json();MotionEvidence.render($('report-visuals'),doc,track,null,true);await MotionEvidence.ready();}catch{$('report-visuals').textContent='이 기기에서 동작 좌표를 찾지 못해 이미지를 표시하지 못했습니다. 아래 측정 근거를 확인해 주세요.';}
  await MotionCourseReport.render(doc);
  const hasCourse=!$('course-print').hidden;$('include-course-label').hidden=!hasCourse;$('course-print').hidden=true;
  $('include-course').onchange=()=>{$('course-print').hidden=!$('include-course').checked;};
  $('report-body').hidden=false;$('report-status').hidden=true;$('print-report').disabled=false;
 }catch(error){$('report-status').textContent=error.message+' 분석 화면에서 다시 열어 주세요.';}
})();
