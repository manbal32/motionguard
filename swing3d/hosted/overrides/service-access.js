/* Returning access is based on a saved successful analysis in this browser. */
window.MotionServiceAccess=(()=>{
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 function validReport(doc){return /^[a-f0-9]{32}$/.test(doc?.report_id??'')&&/^[a-f0-9]{64}$/.test(doc?.track_id??'')&&doc.visual_analysis?.mode==='gemini-images'&&Number.isFinite(doc.visual_analysis.analysis?.assessment_score?.value);}
 async function refresh(){const host=document.getElementById('returning-service');if(!host)return false;host.hidden=true;host.replaceChildren();try{
  const id=window.MotionProfileId;if(!/^[a-f0-9-]{36}$/.test(id??''))return false;
  const response=await fetch('./api/profile/'+id);if(!response.ok)return false;const entries=(await response.json()).entries??[];
  let doc;for(const entry of entries.slice(-5).reverse()){if(!/^[a-f0-9]{32}$/.test(entry.report_id??''))continue;const r=await fetch('./api/coaching/report/'+entry.report_id);if(!r.ok)continue;const candidate=await r.json();if(validReport(candidate)){doc=candidate;break;}}
  if(!doc)return false;
  host.append(make('span','다시 오셨네요'),make('h2','분석 없이 바로 플레이하세요'));
  const links=make('div');links.className='returning-service-links';for(const[label,url]of [['게임하기','./game?from=service'],['내 게임 스코어','./game?score=1'],['내 분석 결과','./?result='+doc.report_id]]){const link=make('a',label);link.href=url;if(label==='게임하기')link.className='returning-game-primary';links.append(link);}host.append(links);host.hidden=false;return true;
 }catch{return false;}}
 function gameCard(host,root,doc){if(!validReport(doc))return null;const block=make('section'),badge=make('span'),title=make('h3','직접 게임하기'),message=make('p'),button=make('button','게임하기');block.className='after-prediction-game service-game-card';block.hidden=false;badge.className='service-game-state';message.setAttribute('role','status');message.setAttribute('aria-live','polite');button.type='button';button.className='button primary';
  block.dataset.state='ready';badge.textContent='바로 플레이';message.textContent='분석이 완료됐어요. 예상 플레이를 보지 않아도 바로 게임할 수 있어요.';button.disabled=false;
  let selected=doc.course_scenario?.course;const mapStatus=make('p');mapStatus.className='forecast-note';button.onclick=()=>{if(validReport(doc))window.MotionSimulationRound?.open(root,doc,{course:selected});};block.append(badge,title,message);if(window.MotionPreparedCourses){button.disabled=true;MotionPreparedCourses.mount(block,{selected,status:mapStatus,onSelect:c=>selected=c,onBusy:busy=>button.disabled=busy}).catch(e=>{mapStatus.textContent=e.message;button.disabled=false;});block.append(mapStatus);}block.append(button);host.append(block);return block;
 }
 function mountResult(host,root,doc){return gameCard(host,root,doc);}
 function afterPrediction(panel,root,doc){gameCard(panel,root,doc);return()=>{};}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
 return{validReport,refresh,mountResult,afterPrediction};
})();
