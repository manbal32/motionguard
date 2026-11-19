/* global SwingFindings, SwingReference */
(async()=>{
 const $=id=>document.getElementById(id),{node,number,phases,channels}=SwingFindings;
 function theme(v){document.documentElement.dataset.theme=v;document.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===v)));}
 theme('dark');document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>theme(b.dataset.theme));
 $('print-report').onclick=async()=>{await document.fonts.ready;await Promise.allSettled([...document.images].map(i=>i.decode()));window.print();};
 try{
  const id=location.pathname.split('/').at(-1);if(!/^[a-f0-9]{64}$/.test(id))throw Error('리포트 주소가 올바르지 않습니다.');
  const response=await fetch('/api/track/'+id);if(!response.ok)throw Error('기록을 읽지 못했습니다.');const track=await response.json();
  const coaching=new URLSearchParams(location.search).get('coaching');let doc;
  if(coaching){if(!/^[a-f0-9]{32}$/.test(coaching))throw Error('상담 주소를 확인해 주세요.');const r=await fetch('/api/coaching/report/'+coaching);doc=await r.json();if(doc.track_id!==id)throw Error('상담과 영상이 일치하지 않습니다.');}
  doc??=await SwingFindings.load(track);
  let saved;try{saved=JSON.parse(sessionStorage.getItem('motionguard:'+coaching));}catch{}
  const report=doc.customer_report??{concern:doc.conversation_summary?.concern||'내 스윙 확인',answer:'선택한 동작을 같은 시점에서 비교해 보세요.',positives:[],improvements:[],goal:doc.conversation_summary?.goal||'천천히 같은 동작을 반복하세요.'};
  $('report-question').textContent=report.concern;$('summary').textContent=report.answer;$('report-goal').textContent=report.goal;
  $('report-mode').textContent=doc.mode==='demo'?'데모 코칭 · 실제 영상에서 관찰한 동작을 바탕으로 정리했습니다.':'영상 관찰과 승인한 상담 내용을 함께 정리했습니다.';
  function image(area,data,caption){const f=node('figure'),im=node('img');im.src=data;im.alt=caption;f.append(im,node('figcaption',caption));area.append(f);}
  if(saved?.image?.startsWith('data:image/jpeg;base64,')){image($('report-image'),saved.image,'내 동작과 교육용 과장');$('report-comparison').hidden=false;}
  const snapshots=new Map((saved?.items??[]).map(s=>[s.id,s]));
  for(const item of report.positives.slice(0,2)){const c=node('article',undefined,'report-entry');c.append(node('h3',item.title),node('p',item.observation),node('p','이 동작은 유지하며 반복해 보세요.'));$('report-positives').append(c);}
  if(!report.positives.length)$('report-positives').textContent='이번 영상에서 유지할 동작을 확정할 근거가 충분하지 않았습니다.';
  for(const item of report.improvements.slice(0,3)){
   const card=node('article',undefined,'report-entry');card.dataset.finding=item.id;card.append(node('h3',item.title));
   if(track.evidence&&item.phase){const im=node('img');im.src='/api/still/'+id+'/'+item.phase;im.alt='해당 동작의 원본 사진';const f=node('figure');f.append(im);card.append(f);}
   const snap=snapshots.get(item.id);if(snap?.image?.startsWith('data:image/jpeg;base64,'))image(card,snap.image,'교육용 과장 · 교본 잔상과 비교');
   card.append(node('p',item.observation,'observation'),node('p',item.drill));$('report-findings').append(card);
   for(const q of item.youtube??[]){const a=node('a',q);a.href='https://www.youtube.com/results?'+new URLSearchParams({search_query:q});a.target='_blank';a.rel='noopener noreferrer';$('report-videos').append(a);}
  }
  if(!report.improvements.length)$('report-findings').textContent='이번에는 뚜렷한 차이가 있는 동작만 다시 확인해 보세요.';
  $('wrist-limit').textContent=track.meta.wrist_source==='index'?'손끝 방향으로 손목의 움직임을 근사한 값입니다.':'손목의 움직임은 이번에 판단하지 않았습니다.';
  $('facts').textContent=`${track.meta.fps}fps · ${track.meta.samples}표본 · ${track.meta.dur}초`;
  for(const [key,label] of [['concern','고민'],['improvement','개선 희망'],['hypothesis','사용자 추정'],['goal','연습 목표']])$('report-approved').append(node('p',label+' · '+(doc.conversation_summary?.[key]||'입력 없음')));
  const reference=SwingReference.expand(track),keys=SwingReference.channels,table=$('report-angles'),head=table.createTHead().insertRow();
  for(const label of ['국면',...keys.map(k=>channels[k])])head.append(node('th',label));const body=table.createTBody();
  for(const [p,label] of phases){const i=track.meta.phase_frames[p]-track.meta.source_frames[0],row=body.insertRow();row.append(node('th',label));
   for(const key of keys){const v=track.track[i][track.channels.indexOf(key)],cell=row.insertCell(),unit=['shiftX','heelR'].includes(key)?'비율':'°';cell.textContent=v===null?'측정 불가':(v*(unit==='°'?180/Math.PI:1)).toFixed(unit==='°'?1:3)+unit;}
   if(track.evidence){const f=node('figure'),im=node('img');im.src='/api/still/'+id+'/'+p;im.alt=label+' 원본';f.append(im,node('figcaption',label));$('report-stills').append(f);}
  }
  $('report-body').hidden=false;$('report-status').hidden=true;$('print-report').disabled=false;
 }catch(e){$('report-status').textContent=e.message+' 분석 화면에서 다시 열어 주세요.';}
})();
