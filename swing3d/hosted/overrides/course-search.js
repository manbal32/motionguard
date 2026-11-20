/* Search a public course catalog, then fetch geometry on selection. Never invent missing holes. */
(()=>{
 const $=id=>document.getElementById(id),M=window.MotionCourse;
 function geometry(g,features){const ns='http://www.w3.org/2000/svg';for(const f of features??[]){const p=document.createElementNS(ns,'polygon');p.setAttribute('points',f.points.map(p=>p.join(',')).join(' '));p.setAttribute('fill',({fairway:'#acd88c',green:'#76bd70',tee:'#a9d58c',bunker:'#e8dba9',water_hazard:'#a0d9ed',boundary:'#d5e8cc'})[f.type]??'#d5e8cc');g.append(p);}}
 window.MotionCourseSearch={geometry};
 const form=$('course-search-form');if(!form)return;
 const status=$('course-search-status'),results=$('course-search-results');let controller;
 form.onsubmit=async e=>{e.preventDefault();controller?.abort();controller=new AbortController();status.textContent='골프장을 검색하고 있습니다.';results.replaceChildren();try{const r=await fetch('./api/courses/search?'+new URLSearchParams({q:$('course-query').value.trim()}),{signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.reason);status.textContent=data.notice;for(const entry of data.results){const b=document.createElement('button');b.type='button';b.textContent=entry.name;b.onclick=()=>load(entry);results.append(b);}}catch(e){if(e.name!=='AbortError')status.textContent=e.message;}};
 async function load(entry){status.textContent=entry.name+'의 홀 지도를 가져오고 있습니다.';for(const b of results.children)b.disabled=true;try{const r=await fetch('./api/courses/load?'+new URLSearchParams({id:entry.id}));const data=await r.json();if(!r.ok)throw Error(data.reason);const c=data.course;
  if(!c.holes.length){status.textContent=c.reason;const preview=$('course-source-preview');preview.replaceChildren();if(c.overview?.length){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 400 640');svg.setAttribute('aria-label',c.name+' 공개 지도 · 홀 번호 미확인');geometry(svg,c.overview);preview.append(svg);}const link=document.createElement('a');link.textContent='네이버 지도에서 '+entry.name+' 확인';link.href='https://map.naver.com/p/search/'+encodeURIComponent(entry.name);link.target='_blank';link.rel='noopener noreferrer';preview.append(link);status.textContent+=' 현재 재생 중인 코스는 바꾸지 않았습니다.';return;}
  const id=new URLSearchParams(location.search).get('report');sessionStorage.setItem('motionguard:selected-course:'+id,JSON.stringify(c));location.reload();
 }catch(e){status.textContent=e.message;}finally{for(const b of results.children)b.disabled=false;}}
 $('course-reset').onclick=()=>{const id=new URLSearchParams(location.search).get('report');sessionStorage.removeItem('motionguard:selected-course:'+id);location.reload();};
})();
