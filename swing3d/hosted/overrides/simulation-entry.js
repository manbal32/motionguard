/* Select a destination and open its play or score view. */
window.MotionSimulationEntry={mount(host,root,doc,button){
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;},card=make('section');card.className='simulation-course-entry';
 let selected=doc.course_scenario?.course??MotionCourse.defaultCourse?.()??MotionCourse.course,busy=false,generation=0,mapBusy=false,predictBusy=false,lastAction=null,picker;
 const heading=make('h4','내 스윙 시뮬레이션'),title=make('h5','방문 예정 골프장'),chosen=make('strong',selected.name),form=make('form'),label=make('label','골프장 검색'),input=make('input'),submit=make('button','코스 찾기'),status=make('p'),pickerHost=make('div'),retry=make('button','예상 결과 다시 받기'),actions=make('div'),score=make('button','스코어만 보기');score.type=retry.type='button';retry.className='forecast-retry';retry.hidden=true;retry.onclick=()=>lastAction&&run(lastAction.mode,lastAction.course);actions.className='forecast-entry-actions';input.type='search';input.value=selected.id==='rivera-valley'?'리베라CC':selected.name;input.maxLength=60;input.required=true;input.setAttribute('aria-label','검색할 골프장 이름');submit.type='submit';status.setAttribute('role','status');label.append(input);form.append(label,submit);card.append(heading,title,chosen,form,pickerHost,status,retry);host.append(card);button.textContent='홀별 플레이 보기';actions.append(button,score);card.append(actions);
 const update=()=>{
  button.disabled=busy||mapBusy||predictBusy;
  submit.disabled=busy||mapBusy;
  input.disabled=busy;
  retry.disabled=busy||mapBusy||predictBusy;
  picker?.setLocked(busy);
  score.disabled=button.disabled||!window.MotionCourseForecast;
 };
 async function run(mode,course=selected){if(!window.MotionCourseForecast){if(mode==='play')return MotionSimulation.open(root,doc,{course});return;}lastAction={mode,course};retry.hidden=true;const ticket=++generation;predictBusy=true;update();status.textContent='선택한18홀의 예상 스코어를 준비하고 있어요.';try{const p=await MotionCourseForecast.get(doc,course,{allowSavedOnWeatherError:mode==='scores'});if(ticket!==generation)return;MotionCourseForecast.remember(doc,course,p);status.textContent=p.displayNotice??'18홀 예상 스코어 준비 완료';if(mode==='scores')MotionCourseForecast.openScores(root,doc,course,p);else MotionSimulation.open(root,doc,{course,prediction:p});}catch(e){if(ticket===generation){status.textContent=e.message+' 선택한 코스는 유지됩니다.';retry.hidden=false;}}finally{if(ticket===generation){predictBusy=false;update();}}}
 button.onclick=()=>run('play');score.onclick=()=>run('scores');
 function selectCourse(course) {
  generation++;
  predictBusy=false;
  lastAction=null;
  retry.hidden=true;
  selected=course;
  chosen.textContent=course.name;
  input.value=course.clubName??course.name;
  update();
 }
 mapBusy=Boolean(window.MotionPreparedCourses);update();
 window.MotionPreparedCourses?.mount(pickerHost,{
  selected,status,
  onBusy(loading){
   if(loading){generation++;predictBusy=false;}
   mapBusy=loading;update();
  },
  onSelect:selectCourse,
 }).then(controller=>{
  picker=controller;
  update();
 }).catch(error=>{status.textContent=error.message;mapBusy=false;update();});

 form.onsubmit=async event=>{
  event.preventDefault();
  if(busy||mapBusy)return;
  const name=input.value.trim();
  if(name.length<2){status.textContent='골프장 이름을 두 글자 이상 입력해 주세요.';return;}
  busy=true;
  generation++;
  predictBusy=false;
  update();
  try{
   await MotionMapWorkflow.run(name,null,{status,approximate:true,onCourse:course=>{
    if(!course?.holes?.length)throw Error('재생할 홀 경로를 가져오지 못했습니다.');
    selectCourse(course);
    picker?.setSelected(course);
    status.textContent=course.name+' · '+course.holes.length+'홀 준비 완료';
   }});
  }catch(error){
   status.textContent='코스를 가져오지 못했습니다. '+error.message+' 현재 선택: '+selected.name;
  }finally{busy=false;update();}
 };
 return card;
}};
