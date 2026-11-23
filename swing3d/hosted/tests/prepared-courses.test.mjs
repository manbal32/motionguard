import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>JSON.parse(fs.readFileSync('data/'+p,'utf8')),manifest=read('prepared-courses.json');
class E{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.style={};this.className='';this.classList={add:c=>this.className+=' '+c};this.namespaceURI='http://www.w3.org/2000/svg';this.value='';}
 append(...nodes){for(const e of nodes){if(e.parent)e.parent.children=e.parent.children.filter(x=>x!==e);e.parent=this;this.children.push(e);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k];}
 addEventListener(){}scrollIntoView(){}remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);}
 find(fn){for(const e of this.children){if(fn(e))return e;const found=e.find?.(fn);if(found)return found;}return null;}
 querySelector(q){return this.find(e=>e.className.split(' ').includes(q.slice(1)));}
}
function runtime(){
 const queue=[],calls=[],saved=new Map();const s={URL,URLSearchParams,Number,location:{search:'',reload(){throw Error('Unexpected navigation');}},sessionStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},document:{hidden:false,getElementById:()=>null,createElement:t=>new E(t),createElementNS:(_,t)=>new E(t)},requestAnimationFrame:f=>(queue.push(f),queue.length),cancelAnimationFrame(){},fetch:async url=>{calls.push(url);return Response.json(read(url.replace(/^\.\//,'')));}};s.window=s;vm.createContext(s);
 for(const f of ['course-core.js','scenario-core.js','course-golfer.js','hole-scene.js','embedded-simulation.js','prepared-courses.js','simulation-entry.js','course-map-workflow.js'])vm.runInContext(fs.readFileSync('dist/client/'+f,'utf8'),s);
 return {s,queue,calls,tick(n){for(let i=0;i<n;i++)queue.shift()?.(i*60);}};
}
test('all six clubs contain every course and 189 distinct source-backed holes',()=>{
 assert.deepEqual(manifest.clubs.map(c=>c.totalHoles),[36,27,36,18,36,36]);let count=0;const images=new Set();
 for(const club of manifest.clubs)for(const group of club.groups){const c=read('prepared-courses/'+group.id+'.json');assert.equal(c.holes.length,group.holes);assert.deepEqual(c.holes.map(h=>h.number),Array.from({length:group.holes},(_,n)=>n+1));for(const h of c.holes){const image=h.mapImage.image_url??h.mapImage.asset;assert.ok(!images.has(image));images.add(image);count++;assert.ok(h.sourceRoute.every(p=>p.every(v=>v>=0&&v<=1)));assert.ok(h.route.every(p=>p.every(Number.isFinite)));assert.ok(h.route[0][1]>h.route.at(-1)[1]);assert.ok(h.mapImage.display.transform.startsWith('rotate('));assert.ok(h.mapImage.source_page.startsWith('https://'));assert.ok([3,4,5].includes(h.par));assert.ok(h.distance>=30&&h.distance<=900);}}
 assert.equal(count,189);
});
test('every distinct nine pairing creates exactly 18 unique source holes; cross-club and repeated nines reject',async()=>{
 const t=runtime();for(const club of manifest.clubs){for(const front of club.nines)for(const back of club.nines){if(front.id===back.id){await assert.rejects(t.s.MotionPreparedCourses.loadRound(club.id,front.id,back.id));continue;}const c=await t.s.MotionPreparedCourses.loadRound(club.id,front.id,back.id);assert.equal(c.holes.length,18);assert.equal(new Set(c.holes.map(h=>h.sourceGroupId+':'+h.sourceNumber)).size,18);assert.deepEqual(Array.from(c.holes,h=>h.number),Array.from({length:18},(_,i)=>i+1));assert.deepEqual(Array.from(c.holes.slice(9),h=>h.sourceNumber),back.holeNumbers);}
 await assert.rejects(t.s.MotionPreparedCourses.loadRound(club.id,club.nines[0].id,'other-club-nine'));}
});
test('prepared names and aliases open stored guides without Naver search or Gemini calls',async()=>{
 const t=runtime();for(const name of ['코리아CC','골드 CC','남서울컨트리클럽','팔팔CC','기흥']){let chosen;const c=await t.s.MotionMapWorkflow.run(name,null,{status:{},onCourse:x=>chosen=x});assert.equal(chosen.holes.length,18);assert.equal(c.id,chosen.id);}assert.equal(t.calls.filter(u=>u.includes('/api/')).length,0);assert.equal(await t.s.MotionPreparedCourses.find('존재하지않는CC'),null);
});
test('unlisted ids and damaged snapshots cannot replace a selected course',async()=>{
 const t=runtime();await assert.rejects(t.s.MotionPreparedCourses.load('../../secret'));assert.equal(t.calls.length,1);const original=t.s.MotionCourse.defaultCourse();t.s.fetch=async()=>Response.json({id:'gold-master',holes:[]});await assert.rejects(t.s.MotionPreparedCourses.load('gold-master'));assert.equal(t.s.MotionCourse.course.id,original.id);
});
test('the result picker selects a real prepared map and preserves an already restored course',async()=>{
 const t=runtime(),host=new E(),root=new E(),button=new E('button'),doc={course_scenario:{course:await t.s.MotionPreparedCourses.load('gold-master')}};const entry=t.s.MotionSimulationEntry.mount(host,root,doc,button);await new Promise(resolve=>setImmediate(resolve));assert.match(entry.find(e=>e.tagName==='STRONG').textContent,/골드CC · 마스터 OUT/);const clubSelect=entry.find(e=>e.getAttribute('aria-label')==='준비된 골프장 선택');assert.equal(clubSelect.value,'gold');clubSelect.value='giheung';await clubSelect.onchange();assert.equal(button.disabled,false);assert.match(entry.find(e=>e.tagName==='STRONG').textContent,/기흥CC · 동코스 \+ 남코스/);assert.equal(entry.find(e=>e.tagName==='INPUT').value,'기흥CC');
 // A real analysis uses the normal profile path; the picker itself never manufactures one.
 const course=t.s.MotionCourse.course.id;t.s.MotionSimulation.open=(_root,_doc,options)=>assert.equal(options.course.clubId,'giheung');button.onclick();assert.equal(t.s.MotionCourse.course.id,course);
});
test('each prepared course actually animates all holes on its source-derived local vector scene',async()=>{
 for(const club of manifest.clubs)for(const group of club.groups){const t=runtime(),root=new E(),c=await t.s.MotionPreparedCourses.load(group.id);t.s.MotionSimulation.open(root,{}, {course:c,preview:true,inline:true});assert.equal(root.find(e=>e.tagName==='IMAGE'),null);assert.equal(root.find(e=>e.getAttribute('data-hole-scene')==='guide-scene-v1').getAttribute('data-source'),c.holes[0].holeScene.sourceSha256);assert.ok(root.find(e=>e.getAttribute('id')==='course-golfer'));const ball=root.find(e=>e.getAttribute('id')==='direct-ball'),start=ball.getAttribute('cy');t.tick(70);assert.notEqual(ball.getAttribute('cy'),start);t.tick(c.holes.length*1400);assert.match(root.find(e=>e.className==='direct-status').textContent,/전체 홀 재생 완료/);assert.equal(root.find(e=>e.className==='direct-source').href,c.holes.at(-1).mapImage.source_page);assert.equal(root.find(e=>e.textContent==='현재').hidden,true);assert.equal(root.find(e=>e.className==='direct-estimate'),null);}
});
test('quick course changes keep the latest choice even when the earlier load finishes last',async()=>{
 const t=runtime(),host=new E(),status={},chosen=[];const picker=await t.s.MotionPreparedCourses.mount(host,{selected:{id:'rivera-valley'},status,onSelect:c=>chosen.push(c.id)});let finish;const actual=t.s.fetch;t.s.fetch=async u=>u.endsWith('/gold-champion.json')?new Promise(resolve=>finish=()=>actual(u).then(resolve)):actual(u);picker.clubSelect.value='gold';const older=picker.clubSelect.onchange();while(!finish)await new Promise(resolve=>setImmediate(resolve));picker.clubSelect.value='giheung';await picker.clubSelect.onchange();finish();await older;assert.match(chosen.at(-1),/^round-giheung-/);assert.ok(!chosen.some(id=>id.startsWith('round-gold-')));
});

test('all six default rounds finish 18 holes and retain actual source hole labels at the 9-to-10 transition',async()=>{
 for(const club of manifest.clubs){const t=runtime(),root=new E(),c=await t.s.MotionPreparedCourses.loadRound(club.id);t.s.MotionSimulation.open(root,{}, {course:c,preview:true,inline:true});const select=root.find(e=>e.getAttribute('aria-label')==='플레이할 홀');assert.match(select.children[9].textContent,/^10홀 · /);assert.ok(select.children[9].textContent.includes(String(c.holes[9].sourceNumber)+'번'));t.tick(18*1400);assert.match(root.find(e=>e.className==='direct-status').textContent,/전체 홀 재생 완료/);}
});
test('failed round loading and unlisted restored maps keep the existing course usable',async()=>{
 const t=runtime(),host=new E(),status={},selected={id:'image:custom',name:'사용자 지도',holes:[{}]};const button=new E('button');t.s.MotionSimulationEntry.mount(host,new E(),{course_scenario:{course:selected}},button);await new Promise(resolve=>setImmediate(resolve));assert.equal(button.disabled,false);assert.equal(host.find(e=>e.tagName==='STRONG').textContent,'사용자 지도');
 const club=host.find(e=>e.getAttribute('aria-label')==='준비된 골프장 선택');
 assert.equal(club.value,'search-result');
 assert.equal(club.find(e=>e.value==='search-result').textContent,'사용자 지도');
 assert.equal(host.find(e=>e.getAttribute('aria-label')==='전반 9홀 선택').disabled,true);
 assert.equal(host.find(e=>e.getAttribute('aria-label')==='후반 9홀 선택').disabled,true);
 const picked=[],picker=await t.s.MotionPreparedCourses.mount(new E(),{selected:await t.s.MotionPreparedCourses.loadRound('88'),status,onSelect:c=>picked.push(c.id)});const last=picked.at(-1);t.s.fetch=async()=>new Response('',{status:503});picker.clubSelect.value='gold';await picker.clubSelect.onchange();assert.equal(picked.at(-1),last);assert.match(status.textContent,/유지/);
});
test('every source image and its route use the same affine transform',()=>{
 for(const club of manifest.clubs)for(const g of club.groups)for(const h of read('prepared-courses/'+g.id+'.json').holes){const m=h.mapImage,d=m.display,angle=Number(d.transform.match(/rotate\(([^ ]+)/)[1])*Math.PI/180;for(let i=0;i<h.sourceRoute.length;i++){const [x,y]=h.sourceRoute[i],dx=d.x+x*d.width-200,dy=d.y+y*d.height-350,actual=[200+dx*Math.cos(angle)-dy*Math.sin(angle),350+dx*Math.sin(angle)+dy*Math.cos(angle)];assert.ok(Math.hypot(actual[0]-h.route[i][0],actual[1]-h.route[i][1])<.01,g.id+':'+h.number);}}
});

test('Giheung official guide copies are present locally with original dimensions and source provenance',()=>{for(const group of ['south','west','north'])for(const h of read('prepared-courses/giheung-'+group+'.json').holes){assert.match(h.mapImage.asset,/^\.\/prepared-course-images\/giheung-/);assert.ok(fs.existsSync('assets/'+h.mapImage.asset.replace('./','')));assert.match(h.mapImage.image_url,/^https:\/\/www\.ghcc\.kr\/mobile\/images\/course\//);}});

test('the 27-hole Korea picker composes the chosen two nines into 18 and never repeats a nine',async()=>{
 const t=runtime(),selected=[],picker=await t.s.MotionPreparedCourses.mount(new E(),{status:{},onSelect:c=>selected.push(c)});picker.clubSelect.value='creek';await picker.clubSelect.onchange();assert.equal(picker.frontSelect.children.length,3);picker.backSelect.value='korea-creek';await picker.backSelect.onchange();let c=selected.at(-1);assert.equal(c.holes.length,18);assert.equal(c.holes[0].sourceGroupId,'korea-lake');assert.equal(c.holes[9].sourceGroupId,'korea-creek');picker.frontSelect.value='korea-creek';await picker.frontSelect.onchange();c=selected.at(-1);assert.notEqual(c.roundSelection.front,c.roundSelection.back);assert.equal(new Set(c.holes.map(h=>h.sourceGroupId+':'+h.sourceNumber)).size,18);
});
