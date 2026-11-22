/* The service opens play after analysis, keeping the report alive in this document. */
window.MotionSimulationRound={open(root,doc,options={}){
 const old=root.querySelector('.embedded-simulation');old?._dispose?.();old?.remove();
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const summary=root.querySelector('.result-summary-view'),panel=make('section');panel.className='embedded-simulation simulation-round';
 const toolbar=make('div');toolbar.className='simulation-round-toolbar';const back=make('button','분석 결과로'),heading=make('h2',options.course?.clubName?options.course.clubName+' 18홀 게임':'리베라 18홀 게임'),actions=make('div'),watch=make('button','자동 재생'),reload=make('button','다시 열기'),status=make('p',(options.course?.clubName??'리베라CC')+' 코스를 준비하고 있어요.'),frame=make('iframe');
 actions.className='simulation-round-actions';status.className='simulation-round-status';status.setAttribute('role','status');frame.className='simulation-round-frame';frame.title=(options.course?.clubName??'리베라CC')+' 18홀 직접 플레이';const gameURL=options.course?.roundSelection?'./round?'+new URLSearchParams({club:options.course.clubId,front:options.course.roundSelection.front,back:options.course.roundSelection.back}):'./round';frame.src=gameURL;frame.setAttribute('loading','eager');
 let observer,disposed=false;
 function fit(){if(disposed)return;frame.style.height='100%';}
 function ready(){if(disposed)return;try{const body=frame.contentDocument?.body;if(!body?.querySelector('#game-map'))throw Error();observer?.disconnect();if(window.ResizeObserver){observer=new ResizeObserver(fit);observer.observe(body);}fit();status.hidden=true;status.textContent='9홀 코스 두 개를 고르고, 방향과 힘을 조절해 직접 쳐 보세요.';}catch{status.hidden=false;status.textContent='플레이 화면을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.';}}
 panel._dispose=()=>{document.body?.classList?.remove?.('round-screen-open');disposed=true;observer?.disconnect();frame.removeEventListener?.('load',ready);frame.src='about:blank';};
 back.type=watch.type=reload.type='button';
 back.onclick=()=>{panel._dispose();panel.remove();if(summary)summary.hidden=false;};
 watch.onclick=async()=>{if(window.MotionCourseForecast){try{status.hidden=false;status.textContent='선택한 코스의 예상 스코어를 준비해요.';const course=options.course??doc.course_scenario?.course??await MotionPreparedCourses.loadRound('rivera'),prediction=await MotionCourseForecast.get(doc,course);if(disposed)return;MotionCourseForecast.remember(doc,course,prediction);MotionSimulation.open(root,doc,{course,prediction});}catch(e){status.textContent=e.message;}return;}panel._dispose();panel.remove();MotionSimulation.open(root,doc);};
 reload.onclick=()=>{status.hidden=false;status.textContent='플레이를 다시 준비하고 있어요.';frame.src=gameURL+(gameURL.includes('?')?'&':'?')+'retry='+Date.now();};
 frame.addEventListener('load',ready);actions.append(watch,reload);toolbar.append(heading,actions);panel.append(back,toolbar,status,frame);document.body?.classList?.add?.('round-screen-open');root.append(panel);if(summary)summary.hidden=true;panel.scrollIntoView({block:'start'});
 return panel;
}};
