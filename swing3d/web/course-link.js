/* Store only the derived scenario profile. No original video, raw points or chat text. */
window.MotionCourseLink=(()=>{
 const key=id=>'motionguard:course:'+id;
 function bind(anchor,doc,track){
  try{
   const profile=MotionCourse.profile(doc);anchor.hidden=false;anchor.href=new URL('course.html?'+new URLSearchParams({report:doc.report_id}),location.href).href;
   try{sessionStorage.setItem(key(doc.report_id),JSON.stringify({reportId:doc.report_id,trackId:track?.track_id??doc.track_id,profile}));}catch{/* The course page can reload this report through the local API. */}
  }catch{anchor.hidden=true;}
 }
 function summary(doc){try{const s=JSON.parse(sessionStorage.getItem('motionguard:course-result:'+doc.report_id));return s?.reportId===doc.report_id&&s.profileRevision===1&&s.holes===9&&Number.isFinite(s.total)?s:null;}catch{return null;}}
 return{bind,summary};
})();
