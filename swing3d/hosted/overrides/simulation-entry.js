/* Course choice stays beside the result; search maps feed the same golfer/ball player. */
window.MotionSimulationEntry={mount(host,root,doc,button){
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;},card=make('section');card.className='simulation-course-entry';
 let selected=doc.course_scenario?.course??MotionCourse.defaultCourse?.()??MotionCourse.course,busy=false;
 const title=make('h4','어느 골프장에서 쳐 볼까요?'),chosen=make('strong',selected.name),form=make('form'),label=make('label','골프장 검색'),input=make('input'),submit=make('button','지도 불러오기'),status=make('p');input.type='search';input.value=selected.id==='rivera-valley'?'리베라CC':selected.name;input.maxLength=60;input.required=true;input.setAttribute('aria-label','검색할 골프장 이름');submit.type='submit';status.setAttribute('role','status');label.append(input);form.append(label,submit);card.append(title,chosen,form,status);host.append(card);
 const play=()=>MotionSimulation.open(root,doc,{course:selected});button.onclick=play;
 window.MotionPreparedCourses?.mount(card,{selected,status,onBusy:loading=>button.disabled=loading,onSelect:course=>{selected=course;chosen.textContent=course.name;input.value=course.clubName??course.name;}}).catch(error=>{status.textContent=error.message;});
 form.onsubmit=async event=>{event.preventDefault();if(busy)return;const name=input.value.trim();if(name.length<2){status.textContent='골프장 이름을 두 글자 이상 입력해 주세요.';return;}busy=true;submit.disabled=true;try{await MotionMapWorkflow.run(name,null,{status,approximate:true,onCourse:course=>{if(!course?.holes?.length)throw Error('재생할 홀 경로를 가져오지 못했습니다.');selected=course;chosen.textContent=course.name;status.textContent=course.holes.length+'개 홀 지도를 불러왔습니다.'+(course.holes.some(h=>h.distanceAssumed)?' 거리 미표시 홀은 재생용 거리 가정을 사용합니다.':'');play();}});}catch(error){status.textContent='지도를 가져오지 못했습니다. '+error.message+' 현재 선택: '+selected.name;}finally{busy=false;submit.disabled=false;}};
 return card;
}};
