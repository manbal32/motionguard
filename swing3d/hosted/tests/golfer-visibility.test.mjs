import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.a={};this.dataset={};this.namespaceURI='http://www.w3.org/2000/svg';this.isConnected=true;}
  append(...elements){this.children.push(...elements);}
  setAttribute(key,value){this.a[key]=String(value);}
  getAttribute(key){return this.a[key]??null;}
  find(predicate){for(const child of this.children){if(predicate(child))return child;const found=child.find(predicate);if(found)return found;}return null;}
}
function setup(box=[0,0,400,640],size={width:340,height:440}){
  const events={},context={document:{createElementNS:(_,tag)=>new Element(tag)},addEventListener:(name,fn)=>events[name]=fn};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('dist/client/course-golfer.js','utf8'),context);
  const svg=new Element('svg');svg.setAttribute('viewBox',box.join(' '));svg.getBoundingClientRect=()=>size;const actor=context.MotionGolfer.mount(svg),root=svg.find(e=>e.getAttribute('id')==='course-golfer');
  return{svg,actor,root,size,events,transform:()=>root.getAttribute('transform').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number)};
}
const holes=fs.readdirSync('data/prepared-courses').flatMap(name=>JSON.parse(fs.readFileSync('data/prepared-courses/'+name)).holes);
test('the original cap, face and green shirt render without host CSS variables',()=>{
 const t=setup();t.actor.pose([200,560]);assert.ok(t.svg.find(e=>e.getAttribute('d')==='M-12 -49 Q-10 -64 5 -60 Q13 -57 12 -49Z'));assert.ok(t.svg.find(e=>e.tagName==='circle'&&e.getAttribute('cy')==='-49'&&e.getAttribute('fill')==='#ffffff'));assert.ok(t.svg.find(e=>e.getAttribute('fill')==='#57a27b'));
 function visit(e){for(const [key,value]of Object.entries(e.a))if(['fill','stroke'].includes(key))assert.match(value,/^(?:#[0-9a-f]{6}|none)$/i);e.children.forEach(visit);}visit(t.svg);
});
test('all 189 holes keep a readable golfer at the tee and green on a short mobile map',()=>{
 assert.equal(holes.length,189);
 for(const h of holes){const box=h.holeScene.viewBox,t=setup(box),pixelsPerUnit=Math.min(340/box[2],440/box[3]);for(const point of [h.route[0],h.route.at(-1)]){t.actor.pose(point,'swing',.45);const [x,y,scale]=t.transform();assert.ok(Math.abs(65*scale*pixelsPerUnit-56)<.001);assert.ok(x-52*scale>=box[0]);assert.ok(x+58*scale<=box[0]+box[2]);assert.ok(y-90*scale>=box[1]);assert.ok(y+8*scale<=box[1]+box[3]);assert.equal(t.root.dataset.x,point[0]);assert.equal(t.root.dataset.y,point[1]);}}
});
test('putting zoom and viewport resize preserve readable size and the actual ball anchor',()=>{
 const t=setup([-85,-100,180,200]);t.actor.pose([0,0]);const first=t.transform();t.size.width=680;t.size.height=600;t.events.resize();const after=t.transform();assert.notEqual(after[2],first[2]);assert.ok(Math.abs(after[2]*65*Math.min(680/180,600/200)-56)<.001);assert.equal(t.root.dataset.x,0);assert.equal(t.root.dataset.y,0);
});
test('the same character swings, putts and walks towards the ball',()=>{
 const t=setup();t.actor.pose([200,560],'ready');const arms=t.svg.find(e=>e.getAttribute('transform')==='translate(0 -34) rotate(0)');t.actor.pose([200,560],'swing',.45);assert.match(arms.getAttribute('transform'),/rotate\(-115\)/);t.actor.pose([200,560],'putt',.25);assert.match(arms.getAttribute('transform'),/rotate\(18\)/);t.actor.pose([210,530],'walk',1/12);assert.equal(t.root.dataset.phase,'walk');assert.equal(t.root.dataset.x,210);assert.ok(t.svg.find(e=>e.tagName==='line'&&Number(e.getAttribute('x2'))===-4));
});
test('main service, map-only tester and direct game all load the same sealed golfer module',()=>{
 for(const file of ['index.html','courses.html','game.html','play.html','round.html']){const html=fs.readFileSync('dist/client/'+file,'utf8');assert.match(html,/course-golfer\.js\?v=/,file);}
 assert.equal(fs.readFileSync('dist/client/course-golfer.js','utf8'),fs.readFileSync('overrides/course-golfer.js','utf8'));
});
