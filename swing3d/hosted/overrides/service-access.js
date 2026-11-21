/* Returning access is based on a saved successful analysis in this browser. */
window.MotionServiceAccess=(()=>{
 const completedReports=new Set(),cards=new Set();let returningEligible=false;
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 function validReport(doc){return /^[a-f0-9]{32}$/.test(doc?.report_id??'')&&/^[a-f0-9]{64}$/.test(doc?.track_id??'')&&doc.visual_analysis?.mode==='gemini-images'&&Number.isFinite(doc.visual_analysis.analysis?.assessment_score?.value);}
 async function refresh(){const host=document.getElementById('returning-service');if(!host)return false;returningEligible=false;syncCards();host.hidden=true;host.replaceChildren();try{
  const id=window.MotionProfileId;if(!/^[a-f0-9-]{36}$/.test(id??''))return false;
  const response=await fetch('./api/profile/'+id);if(!response.ok)return false;const entries=(await response.json()).entries??[];
  let doc;for(const entry of entries.slice(-5).reverse()){if(!/^[a-f0-9]{32}$/.test(entry.report_id??''))continue;const r=await fetch('./api/coaching/report/'+entry.report_id);if(!r.ok)continue;const candidate=await r.json();if(validReport(candidate)){doc=candidate;break;}}
  if(!doc)return false;returningEligible=true;syncCards();
  host.append(make('span','다시 오셨네요'),make('h2','분석 없이 바로 플레이하세요'));
  const links=make('div');links.className='returning-service-links';for(const[label,url]of [['게임하기','./game?from=service'],['내 게임 스코어','./game?score=1'],['내 분석 결과','./?result='+doc.report_id]]){const link=make('a',label);link.href=url;if(label==='게임하기')link.className='returning-game-primary';links.append(link);}host.append(links);host.hidden=false;return true;
 }catch{return false;}}
 function syncCards(){for(const sync of cards){if(sync.element.isConnected===false){cards.delete(sync);continue;}sync();}}
 function gameCard(host,root,doc){if(!validReport(doc))return null;const block=make('section'),badge=make('span'),title=make('h3','리베라 18홀 직접 플레이'),message=make('p'),button=make('button','게임하기');block.className='after-prediction-game service-game-card';block.hidden=false;badge.className='service-game-state';message.setAttribute('role','status');message.setAttribute('aria-live','polite');button.type='button';button.className='button primary';
  const ready=()=>returningEligible||completedReports.has(doc.report_id),sync=()=>{const enabled=ready();block.dataset.state=enabled?'ready':'locked';badge.textContent=enabled?'바로 플레이':'예상 플레이 후 이용';message.textContent=enabled?'클럽과 방향을 직접 골라 리베라 18홀을 플레이해 보세요.':'예상 플레이를 마치면 게임을 시작할 수 있어요.';button.disabled=!enabled;};
  button.onclick=()=>{if(ready())window.MotionSimulationRound?.open(root,doc);};block.append(badge,title,message,button);host.append(block);sync.element=block;cards.add(sync);sync();return block;
 }
 function mountResult(host,root,doc){return gameCard(host,root,doc);}
 function afterPrediction(panel,root,doc){if(!validReport(doc))return()=>{};gameCard(panel,root,doc);return()=>{completedReports.add(doc.report_id);syncCards();};}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
 return{validReport,refresh,mountResult,afterPrediction};
})();
