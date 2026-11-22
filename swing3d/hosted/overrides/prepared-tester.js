(()=>{
 const host=document.getElementById('prepared-picker'),status=document.getElementById('prepared-status'),button=document.getElementById('prepared-play'),player=document.getElementById('prepared-player');let selected;
 const clear=()=>{const old=player.querySelector('.embedded-simulation');old?._dispose?.();player.replaceChildren();};
 const choose=course=>{clear();selected=course;button.disabled=false;};
 button.onclick=()=>{if(selected)MotionSimulation.open(player,{}, {course:selected,preview:true,inline:true});};
 (async()=>{try{const clubs=await MotionPreparedCourses.list(),requested=new URLSearchParams(location.search).get('course'),group=clubs.flatMap(c=>c.groups).find(g=>g.id===requested)??clubs.find(c=>c.id!=='rivera')?.groups[0]??clubs[0].groups[0];const club=clubs.find(c=>c.groups.some(g=>g.id===group.id));const initial=await MotionPreparedCourses.loadDefault({...club,selected:group});choose(initial);await MotionPreparedCourses.mount(host,{selected,status,onSelect:choose,onBusy:loading=>button.disabled=loading});status.textContent=selected.name+' · '+selected.holes.length+'홀 준비 완료';button.onclick();}catch(e){status.textContent=e.message;}})();
})();
