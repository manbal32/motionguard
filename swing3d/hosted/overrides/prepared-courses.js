/* Published hole-guide snapshots: selecting a prepared club needs no new AI request. */
window.MotionPreparedCourses=(()=>{
 let pending;
 const norm=s=>String(s??'').toLowerCase().replace(/[\s·._-]/g,'');
 async function list(){
  if(!pending)pending=fetch('./prepared-courses.json').then(async r=>{if(!r.ok)throw Error('골프장 목록을 불러오지 못했습니다.');const d=await r.json();if(d.revision!==1||!Array.isArray(d.clubs))throw Error('골프장 목록을 확인해 주세요.');return d.clubs;}).catch(e=>{pending=null;throw e;});
  return pending;
 }
 async function find(name,group){
  const clubs=await list(),key=norm(name);
  const club=clubs.find(c=>[c.name,...c.aliases].some(n=>norm(n)===key));
  if(!club)return null;
  return {...club,selected:club.groups.find(g=>norm(g.name)===norm(group)||g.id===group)??club.groups[0]};
 }
 async function load(id){
  const clubs=await list(),group=clubs.flatMap(c=>c.groups).find(g=>g.id===id);
  if(!group)throw Error('목록에서 코스를 선택해 주세요.');
  if(id==='rivera-valley')return MotionCourse.defaultCourse();
  if(!/^[a-z0-9-]+$/.test(id))throw Error('코스 정보를 확인해 주세요.');
  const r=await fetch('./prepared-courses/'+id+'.json');if(!r.ok)throw Error('선택한 코스의 지도를 불러오지 못했습니다.');const course=await r.json();
  if(course.id!==id||course.holes?.length!==group.holes||!course.holes.every(h=>h.mapImage?.image_url&&h.route?.length>=2&&h.route.every(p=>p.length===2&&p.every(Number.isFinite))))throw Error('선택한 코스의 홀 정보를 확인해 주세요.');
  return course;
 }
 async function mount(host,{selected,onSelect,status,onBusy=()=>{}}){
  const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;},box=make('div'),clubLabel=make('label','골프장'),groupLabel=make('label','코스'),clubSelect=make('select'),groupSelect=make('select');box.className='prepared-course-picker';clubSelect.setAttribute('aria-label','준비된 골프장 선택');groupSelect.setAttribute('aria-label','준비된 코스 선택');clubLabel.append(clubSelect);groupLabel.append(groupSelect);box.append(clubLabel,groupLabel);host.append(box);
  let generation=0;const clubs=await list();
  for(const c of clubs){const o=make('option',c.name);o.value=c.id;clubSelect.append(o);}
  const initial=clubs.find(c=>c.groups.some(g=>g.id===selected?.id))??clubs[0];clubSelect.value=initial.id;
  function groups(id){groupSelect.replaceChildren();const club=clubs.find(c=>c.id===id);for(const g of club.groups){const o=make('option',g.name+' · '+g.holes+'홀');o.value=g.id;groupSelect.append(o);}groupSelect.value=club.groups[0].id;return club;}
  groups(initial.id);if(initial.groups.some(g=>g.id===selected?.id))groupSelect.value=selected.id;
  async function choose(){const ticket=++generation,id=groupSelect.value;onBusy(true);status.textContent='코스 지도를 불러오고 있습니다.';try{const course=await load(id);if(ticket!==generation)return;await onSelect(course);status.textContent=course.name+' · '+course.holes.length+'홀 준비 완료';}catch(e){if(ticket===generation)status.textContent=e.message+' 현재 선택한 코스는 유지됩니다.';}finally{if(ticket===generation)onBusy(false);}}
  clubSelect.onchange=()=>{groups(clubSelect.value);return choose();};groupSelect.onchange=choose;
  return {box,clubSelect,groupSelect,choose};
 }
 return {list,find,load,mount};
})();
