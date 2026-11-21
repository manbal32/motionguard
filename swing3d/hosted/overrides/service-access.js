/* Returning access is based on a saved successful analysis in this browser. */
window.MotionServiceAccess=(()=>{
 const completedPredictions=new Set();
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 function validReport(doc){return /^[a-f0-9]{32}$/.test(doc?.report_id??'')&&/^[a-f0-9]{64}$/.test(doc?.track_id??'')&&doc.visual_analysis?.mode==='gemini-images'&&Number.isFinite(doc.visual_analysis.analysis?.assessment_score?.value);}
 async function refresh(){const host=document.getElementById('returning-service');if(!host)return false;host.hidden=true;host.replaceChildren();try{
  const id=window.MotionProfileId;if(!/^[a-f0-9-]{36}$/.test(id??''))return false;
  const response=await fetch('./api/profile/'+id);if(!response.ok)return false;const entries=(await response.json()).entries??[];
  let doc;for(const entry of entries.slice(-5).reverse()){if(!/^[a-f0-9]{32}$/.test(entry.report_id??''))continue;const r=await fetch('./api/coaching/report/'+entry.report_id);if(!r.ok)continue;const candidate=await r.json();if(validReport(candidate)){doc=candidate;break;}}
  if(!doc)return false;
  host.append(make('span','다시 오셨네요'),make('h2','내 결과를 보거나 바로 플레이하세요'));
  const links=make('div');links.className='returning-service-links';for(const[label,url]of [['내 분석 결과','./?result='+doc.report_id],['게임하기','./game?from=service'],['내 게임 스코어','./game?score=1']]){const link=make('a',label);link.href=url;links.append(link);}host.append(links);host.hidden=false;return true;
 }catch{return false;}}
 function afterPrediction(panel,root,doc,course){if(!validReport(doc))return()=>{};const key=doc.report_id+':'+(course?.id??'course'),block=make('section');block.className='after-prediction-game';block.hidden=!completedPredictions.has(key);const button=make('button','게임하기');button.type='button';button.className='button primary';button.onclick=()=>window.MotionSimulationRound?.open(root,doc);block.append(make('h3','예상 플레이를 다 봤어요'),make('p','이제 클럽과 방향을 직접 골라 리베라 18홀을 플레이해 보세요.'),button);panel.append(block);return()=>{completedPredictions.add(key);block.hidden=false;};}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
 return{validReport,refresh,afterPrediction};
})();
