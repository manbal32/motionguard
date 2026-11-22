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
 for(const f of ['course-core.js','scenario-core.js','course-golfer.js','embedded-simulation.js','prepared-courses.js','simulation-entry.js','course-map-workflow.js'])vm.runInContext(fs.readFileSync('dist/client/'+f,'utf8'),s);
 return {s,queue,calls,tick(n){for(let i=0;i<n;i++)queue.shift()?.(i*60);}};
}
test('five additional clubs contain complete, distinct source-backed hole guides',()=>{
 assert.deepEqual(manifest.clubs.slice(1).map(c=>c.name),['코리아CC','골드CC','남서울CC','88CC','기흥CC']);
 const expected=[9,18,18,18,9];
 for(const [i,club]of manifest.clubs.slice(1).entries())for(const group of club.groups){const c=read('prepared-courses/'+group.id+'.json');assert.equal(c.holes.length,expected[i]);assert.equal(group.holes,c.holes.length);assert.equal(new Set(c.holes.map(h=>h.mapImage.image_url)).size,c.holes.length);assert.deepEqual(c.holes.map(h=>h.number),Array.from({length:expected[i]},(_,n)=>n+1));for(const h of c.holes){assert.ok(h.route.length>=2);assert.ok(h.sourceRoute.every(p=>p.every(v=>v>=0&&v<=1)));assert.ok(h.route.every(p=>p.every(Number.isFinite)));assert.ok(h.route[0][1]>h.route.at(-1)[1]);assert.ok(h.mapImage.display.transform.startsWith('rotate('));assert.ok(new URL(h.mapImage.image_url).hostname.endsWith('naver.net'));assert.ok(h.mapImage.source_page.startsWith('https://m.blog.naver.com/'));assert.ok([3,4,5].includes(h.par));assert.ok(h.distance>=30&&h.distance<=900);}}
});
test('prepared names and aliases open stored guides without Naver search or Gemini calls',async()=>{
 const t=runtime();for(const name of ['코리아CC','골드 CC','남서울컨트리클럽','팔팔CC','기흥']){let chosen;const c=await t.s.MotionMapWorkflow.run(name,null,{status:{},onCourse:x=>chosen=x});assert.ok(chosen.holes.length>=9);assert.equal(c.id,chosen.id);}assert.equal(t.calls.filter(u=>u.includes('/api/')).length,0);assert.equal(await t.s.MotionPreparedCourses.find('존재하지않는CC'),null);
});
test('unlisted ids and damaged snapshots cannot replace a selected course',async()=>{
 const t=runtime();await assert.rejects(t.s.MotionPreparedCourses.load('../../secret'));assert.equal(t.calls.length,1);const original=t.s.MotionCourse.defaultCourse();t.s.fetch=async()=>Response.json({id:'gold-master',holes:[]});await assert.rejects(t.s.MotionPreparedCourses.load('gold-master'));assert.equal(t.s.MotionCourse.course.id,original.id);
});
test('the result picker selects a real prepared map and preserves an already restored course',async()=>{
 const t=runtime(),host=new E(),root=new E(),button=new E('button'),doc={course_scenario:{course:await t.s.MotionPreparedCourses.load('gold-master')}};const entry=t.s.MotionSimulationEntry.mount(host,root,doc,button);await new Promise(resolve=>setImmediate(resolve));assert.equal(entry.find(e=>e.tagName==='STRONG').textContent,'골드CC · 마스터');const clubSelect=entry.find(e=>e.getAttribute('aria-label')==='준비된 골프장 선택');assert.equal(clubSelect.value,'gold');clubSelect.value='giheung';await clubSelect.onchange();assert.equal(button.disabled,false);assert.equal(entry.find(e=>e.tagName==='STRONG').textContent,'기흥CC · 동코스');assert.equal(entry.find(e=>e.tagName==='INPUT').value,'기흥CC');
 // A real analysis uses the normal profile path; the picker itself never manufactures one.
 const course=t.s.MotionCourse.course.id;t.s.MotionSimulation.open=(_root,_doc,options)=>assert.equal(options.course.id,'giheung-east');button.onclick();assert.equal(t.s.MotionCourse.course.id,course);
});
test('each prepared course actually animates all holes to completion on its own image',async()=>{
 for(const club of manifest.clubs.slice(1)){const t=runtime(),root=new E(),c=await t.s.MotionPreparedCourses.load(club.groups[0].id);t.s.MotionSimulation.open(root,{}, {course:c,preview:true,inline:true});const image=root.find(e=>e.tagName==='IMAGE');assert.ok(image.getAttribute('href').includes(encodeURIComponent(c.holes[0].mapImage.image_url)));assert.ok(root.find(e=>e.getAttribute('id')==='course-golfer'));const ball=root.find(e=>e.getAttribute('id')==='direct-ball'),start=ball.getAttribute('cy');t.tick(70);assert.notEqual(ball.getAttribute('cy'),start);t.tick(c.holes.length*1400);assert.match(root.find(e=>e.className==='direct-status').textContent,/전체 홀 재생 완료/);assert.equal(root.find(e=>e.className==='direct-source').href,c.holes.at(-1).mapImage.source_page);assert.equal(root.find(e=>e.textContent==='현재').hidden,true);assert.equal(root.find(e=>e.className==='direct-estimate'),null);}
});
test('quick course changes keep the latest choice even when the earlier load finishes last',async()=>{
 const t=runtime(),host=new E(),status={},chosen=[];const picker=await t.s.MotionPreparedCourses.mount(host,{selected:{id:'rivera-valley'},status,onSelect:c=>chosen.push(c.id)});let finish;const actual=t.s.fetch;t.s.fetch=async u=>u.endsWith('/gold-master.json')?new Promise(resolve=>finish=()=>actual(u).then(resolve)):actual(u);picker.clubSelect.value='gold';const older=picker.clubSelect.onchange();await Promise.resolve();picker.clubSelect.value='giheung';await picker.clubSelect.onchange();finish();await older;assert.equal(chosen.at(-1),'giheung-east');assert.ok(!chosen.includes('gold-master'));
});
