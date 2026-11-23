window.MotionMapWorkflow={async run(name,entry,options={}){
 const $=id=>document.getElementById(id),status=options.status??$('course-search-status'),usage=[],post=async(path,data)=>{const r=await fetch('./api/courses/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.reason??'지도 요청 실패');if(d.usage)usage.push(d.usage);return d;};
 if(window.MotionPreparedCourses){
  const prepared=await window.MotionPreparedCourses.find(name,options.group??$('map-group')?.value);
  if(prepared){const course=await window.MotionPreparedCourses.loadDefault(prepared);if(options.onCourse){await options.onCourse(course);return course;}const id=new URLSearchParams(location.search).get('report')??'demo';sessionStorage.setItem('motionguard:selected-course:'+id,JSON.stringify(course));sessionStorage.removeItem('motionguard:course-result:'+id);location.reload();return course;}
 }
 status.textContent=name+' · 네이버에서 코스 지도 이미지를 찾는 중입니다.';
 const response=await fetch('./api/courses/discover?'+new URLSearchParams({q:name}));const found=await response.json();if(!response.ok||!found.ok)throw Error(found.reason??'지도 검색 실패');if(!found.candidates.length)throw Error('검색에서 사용할 지도 이미지를 찾지 못했습니다.');
 const cached=found.candidates.findIndex(c=>c.verified_map_source);let selected;
 if(cached>=0)selected={indices:[cached]};else{status.textContent='검색 이미지에서 실제 골프장 지도와 홀 안내를 구분하는 중입니다.';selected=await post('select-maps',{course_name:name,candidates:found.candidates.slice(0,20)});}
 if(!selected.indices.length)throw Error('풍경·다른 골프장·샷 기록을 제외하니 번호와 경로를 읽을 지도가 없습니다.');
 const courses=[],errors=[];async function extract(indices){for(const i of indices){const candidate=found.candidates[i];if(!candidate)continue;const group=(options.group??$('map-group')?.value)||candidate.known_groups?.[0]||'';status.textContent=name+' · '+group+' 지도에서 홀 번호·티·그린·경로를 읽는 중입니다.';try{const d=await post('analyze-map',{course_name:name,course_group:group,candidate,allow_approximate:options.approximate===true||$('map-approximate')?.checked===true});if(d.course?.holes?.length)courses.push(d.course);else if(d.course?.reason)errors.push(d.course.reason);}catch(e){errors.push(e.message);}}}
 await extract(selected.indices);if(!courses.length&&cached>=0&&found.candidates.length>1){status.textContent='전체 지도에서 홀을 구분하기 어려워 다른 홀 안내도를 찾는 중입니다.';const alternatives=await post('select-maps',{course_name:name,candidates:found.candidates.slice(0,20)});await extract(alternatives.indices.filter(i=>i!==cached));}
 if(!courses.length)throw Error(errors[0]??'골프장 이름·홀 번호·티/그린을 함께 확인하지 못해 잘못된 홀을 만들지 않았습니다.');
 const course=courses[0],seen=new Set();for(const other of courses.slice(1))for(const h of other.holes){const key=h.name+':'+h.ref;if(!seen.has(key)&&!course.holes.some(x=>x.name===h.name&&x.ref===h.ref)){course.holes.push(h);seen.add(key);}}
 course.holes.sort((a,b)=>a.name.localeCompare(b.name)||Number(a.ref)-Number(b.ref));course.map_usage=usage;course.search_notice=found.notice;course.requestedName=name;
 if(options.onCourse){await options.onCourse(course);return course;}
 const id=new URLSearchParams(location.search).get('report')??'demo';try{sessionStorage.setItem('motionguard:selected-course:'+id,JSON.stringify(course));sessionStorage.removeItem('motionguard:course-result:'+id);}catch{throw Error('지도 결과를 이 브라우저에 저장하지 못했습니다.');}location.reload();
}};
