/* Complete public guide catalog. A round is two distinct nines from one club. */
window.MotionPreparedCourses=(()=>{
 let pending;
 const norm=s=>String(s??'').toLowerCase().replace(/[\s·._-]/g,'');
 async function list(){if(!pending)pending=fetch('./prepared-courses.json').then(async r=>{if(!r.ok)throw Error('골프장 목록을 불러오지 못했습니다.');const d=await r.json();if(d.revision!==1||!Array.isArray(d.clubs))throw Error('골프장 목록을 확인해 주세요.');return d.clubs;}).catch(e=>{pending=null;throw e;});return pending;}
 async function find(name,group){const club=(await list()).find(c=>[c.name,...c.aliases].some(n=>norm(n)===norm(name)));if(!club)return null;return {...club,selected:club.groups.find(g=>norm(g.name)===norm(group)||g.id===group)};}
 async function load(id){const group=(await list()).flatMap(c=>c.groups).find(g=>g.id===id);if(!group||!/^[a-z0-9-]+$/.test(id))throw Error('목록에서 코스를 선택해 주세요.');const r=await fetch('./prepared-courses/'+id+'.json');if(!r.ok)throw Error('선택한 코스의 지도를 불러오지 못했습니다.');const c=await r.json();if(c.id!==id||c.holes?.length!==group.holes||!c.holes.every(h=>(h.mapImage?.image_url||/^\.\/(?:rivera-game\/(?:valley|lake|pine|cherry)-0[1-9]\.png|prepared-course-images\/giheung-(?:south|west|north)-0[1-9]\.jpg)$/.test(h.mapImage?.asset))&&h.route?.length>=2&&h.route.every(p=>p.length===2&&p.every(Number.isFinite))))throw Error('선택한 코스의 홀 정보를 확인해 주세요.');return c;}
 function initialNines(club,selected){const saved=selected?.roundSelection;if(saved&&club.nines.some(n=>n.id===saved.front)&&club.nines.some(n=>n.id===saved.back)&&saved.front!==saved.back)return [saved.front,saved.back];const same=club.nines.filter(n=>n.groupId===selected?.id);return same.length===2?same.map(n=>n.id):[...club.defaultRound];}
 async function loadRound(clubId,front,back){const club=(await list()).find(c=>c.id===clubId);if(!club)throw Error('골프장을 선택해 주세요.');[front,back]=front&&back?[front,back]:club.defaultRound;const nines=[front,back].map(id=>club.nines.find(n=>n.id===id));if(front===back||nines.some(n=>!n||n.holeNumbers.length!==9))throw Error('전반과 후반에 서로 다른 9홀을 선택해 주세요.');const ids=[...new Set(nines.map(n=>n.groupId))],groups=await Promise.all(ids.map(load)),seen=new Set(),holes=[];
  for(const nine of nines){const group=groups.find(g=>g.id===nine.groupId);for(const number of nine.holeNumbers){const original=group.holes.find(h=>h.number===number),key=nine.groupId+':'+number;if(!original||seen.has(key))throw Error('18홀 구성에 중복되거나 빠진 홀이 있습니다.');seen.add(key);holes.push({...original,number:holes.length+1,sourceNumber:number,sourceCourse:group.groupName,sourceGroupId:group.id,tee:group.tee,ref:String(number)});}}
  return {revision:1,id:'round-'+club.id+'-'+front+'-'+back,clubId:club.id,clubName:club.name,name:club.name+' · '+nines.map(n=>n.label).join(' + '),roundSelection:{front,back},holes,tee:groups.map(g=>g.tee).filter((v,i,a)=>a.indexOf(v)===i).join(' / '),geometrySource:'prepared-guide',sourceUrl:groups[0].sourceUrl,notice:'선택한 두 9홀을 연결한 18홀 가상 라운드입니다.'};
 }
 async function loadDefault(club){const pair=initialNines(club,club.selected);return loadRound(club.id,...pair);}
 async function mount(host, {selected, onSelect, status, onBusy = () => {}}) {
  const make = (tag, text) => {
   const element = document.createElement(tag);
   if (text) element.textContent = text;
   return element;
  };
  const box = make('div');
  box.className = 'prepared-course-picker';
  const clubLabel = make('label', '골프장'), clubSelect = make('select');
  const frontLabel = make('label', '전반 9홀'), frontSelect = make('select');
  const backLabel = make('label', '후반 9홀'), backSelect = make('select');
  clubLabel.className = 'prepared-club-label';
  clubSelect.setAttribute('aria-label', '준비된 골프장 선택');
  frontSelect.setAttribute('aria-label', '전반 9홀 선택');
  backSelect.setAttribute('aria-label', '후반 9홀 선택');
  clubLabel.append(clubSelect);
  frontLabel.append(frontSelect);
  backLabel.append(backSelect);
  box.append(clubLabel, frontLabel, backLabel);
  host.append(box);

  const clubs = await list();
  let generation = 0, activeCourse = selected, locked = false;
  for (const club of clubs) {
   const option = make('option', club.name + ' · 전체 ' + club.totalHoles + '홀');
   option.value = club.id;
   clubSelect.append(option);
  }
  const customOption = make('option');
  customOption.value = 'search-result';
  customOption.hidden = true;
  customOption.disabled = true;
  clubSelect.append(customOption);

  const clubFor = course => clubs.find(club =>
   club.id === course?.clubId || club.groups.some(group => group.id === course?.id));
  function setLocked(value) {
   locked = value;
   clubSelect.disabled = locked;
   frontSelect.disabled = backSelect.disabled = locked || frontLabel.hidden;
  }
  function fill(club, pair) {
   clubSelect.value = club.id;
   customOption.hidden = true;
   frontLabel.hidden = backLabel.hidden = false;
   for (const select of [frontSelect, backSelect]) {
    select.replaceChildren();
    for (const nine of club.nines) {
     const option = make('option', nine.label);
     option.value = nine.id;
     select.append(option);
    }
   }
   [frontSelect.value, backSelect.value] = pair;
   setLocked(locked);
  }
  function show(course) {
   const club = clubFor(course);
   if (club) {
    fill(club, initialNines(club, course));
    return;
   }
   customOption.textContent = course.clubName ?? course.name;
   customOption.hidden = false;
   clubSelect.value = customOption.value;
   frontLabel.hidden = backLabel.hidden = true;
   setLocked(locked);
  }
  function setSelected(course) {
   generation++;
   activeCourse = course;
   show(course);
   onBusy(false);
  }
  async function choose() {
   const club = clubs.find(item => item.id === clubSelect.value);
   if (!club || locked) return;
   const ticket = ++generation, front = frontSelect.value, back = backSelect.value;
   onBusy(true);
   status.textContent = '선택한 18홀 지도를 불러오고 있습니다.';
   try {
    const course = await loadRound(club.id, front, back);
    if (ticket !== generation) return;
    await onSelect(course);
    if (ticket !== generation) return;
    activeCourse = course;
    status.textContent = course.name + ' · 18홀 준비 완료';
   } catch (error) {
    if (ticket === generation) {
     if (activeCourse) show(activeCourse);
     status.textContent = error.message + ' 현재 선택한 라운드는 유지됩니다.';
    }
   } finally {
    if (ticket === generation) onBusy(false);
   }
  }
  clubSelect.onchange = () => {
   const club = clubs.find(item => item.id === clubSelect.value);
   if (!club || locked) return;
   fill(club, club.defaultRound);
   return choose();
  };
  function changeNine(changed, other) {
   const club = clubs.find(item => item.id === clubSelect.value);
   if (!club || locked) return;
   if (changed.value === other.value) other.value = club.nines.find(nine => nine.id !== changed.value).id;
   return choose();
  }
  frontSelect.onchange = () => changeNine(frontSelect, backSelect);
  backSelect.onchange = () => changeNine(backSelect, frontSelect);

  if (selected) show(selected);
  else fill(clubs[0], clubs[0].defaultRound);
  if (!selected || clubFor(selected)) await choose();
  else onBusy(false);
  return {box, clubSelect, frontSelect, backSelect, choose, setSelected, setLocked};
 }
 return {list,find,load,loadRound,loadDefault,mount};
})();
