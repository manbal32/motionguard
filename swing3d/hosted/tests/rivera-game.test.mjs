import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const data=JSON.parse(fs.readFileSync('data/rivera-game.json','utf8'));
function engine(){const s={module:{exports:{}},structuredClone};vm.runInNewContext(fs.readFileSync('overrides/rivera-game-engine.js','utf8'),s);return s.module.exports;}
test('four real nine-hole sets have distinct images and twelve different ordered 18-hole combinations',()=>{
 const E=engine(),hashes=new Set();assert.equal(data.courses.length,4);
 for(const a of data.courses){assert.equal(a.holes.length,9);assert.equal(a.holes.reduce((n,h)=>n+h.par,0),36);for(const h of a.holes){const p='assets/'+h.image.slice(2),image=fs.readFileSync(p);assert.equal(image.readUInt32BE(16),537);assert.equal(image.readUInt32BE(20),797);hashes.add(crypto.createHash('sha256').update(image).digest('hex'));assert.ok(h.route.every(p=>p.every(Number.isFinite)));}for(const b of data.courses)if(a.id!==b.id){const round=E.create(data,a.id,b.id,42),all=E.holes(data,round);assert.equal(all.length,18);assert.equal(all[0].courseId,a.id);assert.equal(all[9].courseId,b.id);assert.notEqual(all[0].image,all[9].image);assert.equal(all.reduce((n,h)=>n+h.par,0),72);}}
 assert.equal(hashes.size,36);assert.throws(()=>E.create(data,'valley','valley'),/서로 다른/);assert.throws(()=>E.create(data,'valley','master'),/서로 다른/);
});
test('player power and direction change actual landing, and a second click cannot double count a flight',()=>{
 const E=engine(),s=E.create(data,'valley','lake',12),h=E.holes(data,s)[0],low=structuredClone(s),right=structuredClone(s),left=structuredClone(s);low.power=30;right.aim=25;left.aim=-25;
 const shot=E.hit(s,h),short=E.hit(low,h),r=E.hit(right,h),l=E.hit(left,h);assert.ok(shot.carry>short.carry*2);assert.ok(r.end.x>0);assert.ok(l.end.x<0);assert.equal(s.shots.length,0);assert.throws(()=>E.hit(s,h));E.complete(s,h);assert.equal(s.shots.length,1);assert.equal(E.total(s),1);assert.ok(E.distance(s.ball,{x:0,y:0})>100);assert.ok(E.undo(s));assert.equal(E.total(s),0);assert.deepEqual({...s.ball},{x:0,y:0});
});
test('green play requires a user putt and only a completed hole can advance to a new course',()=>{
 const E=engine(),s=E.create(data),h=E.holes(data,s)[0];assert.throws(()=>E.next(data,s));s.ball={x:0,y:h.distance-5};s.club='putter';s.power=25;const shot=E.hit(s,h);assert.equal(shot.putt,true);assert.equal(shot.holed,true);E.complete(s,h);assert.equal(s.phase,'holed');assert.equal(E.total(s),1);E.next(data,s);assert.equal(s.holeIndex,1);assert.equal(s.completed.length,1);assert.equal(E.total(s),1);
});
test('all twelve pairings can be played from tee through putting to an exact 18-hole scorecard',()=>{
 const E=engine();for(const front of data.courses)for(const back of data.courses)if(front.id!==back.id){const s=E.create(data,front.id,back.id,197);let played=0;while(s.phase!=='finished'){const h=E.holes(data,s)[s.holeIndex];while(s.phase==='ready'){const remaining=E.distance(s.ball,E.cup(h));s.club=E.recommend(h,s.ball);const club=E.clubs.find(c=>c.id===s.club);s.power=Math.max(1,Math.min(100,Math.round(remaining/club.range*100)));s.aim=0;E.hit(s,h);E.complete(s,h);played++;assert.ok(played<200);}E.next(data,s);}assert.equal(s.completed.length,18);assert.ok(s.completed.every(h=>!h.conceded));assert.equal(E.total(s),s.completed.reduce((n,h)=>n+h.strokes,0));assert.equal(s.completed[8].courseId,front.id);assert.equal(s.completed[9].courseId,back.id);assert.ok(E.restore(data,JSON.stringify(s)));}
});
test('stroke limit, undo and storage restore preserve counts without phantom strokes',()=>{
 const E=engine(),s=E.create(data),h=E.holes(data,s)[0];for(let i=0;i<12;i++){s.club='putter';s.power=1;E.hit(s,h);E.complete(s,h);}assert.equal(s.phase,'holed');assert.equal(E.strokeCount(s),12);E.undo(s);assert.equal(s.shots.length,11);assert.equal(s.phase,'ready');E.hit(s,h);const restored=E.restore(data,JSON.stringify(s));assert.equal(restored.phase,'ready');assert.equal(restored.shots.length,11);assert.equal(restored.pending,undefined);E.complete(s,h);assert.equal(E.strokeCount(s),12);assert.equal(E.restore(data,{...s,holeIndex:5}),null);assert.equal(E.restore(data,{...s,ball:{x:NaN,y:1}}),null);
});

async function ui(storage=new Map(),weather={mode:'live',temperature:20,windSpeed:0,windFrom:0,gust:0,precipitation:0,code:0,weatherTime:'2026-11-21T02:30:00Z'}){
 const nodes=new Map(),queue=[],calls=[];let document;
 class El{constructor(tag='div'){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.style={};this.hidden=false;this._text='';this.value='';this.id='';this.classList={add(){},remove(){}};}set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(x=>x.textContent??'').join('');}append(...values){this.children.push(...values);}replaceChildren(...values){this._text='';this.children=[...values];}setAttribute(k,v){this.attributes[k]=String(v);if(k==='id'){this.id=v;nodes.set(v,this);}}getAttribute(k){return this.attributes[k];}addEventListener(){}focus(){document.activeElement=this;}}
 const html=fs.readFileSync('overrides/rivera-game.html','utf8');for(const m of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new El(m[1]);e.id=m[2];e.hidden=/\bhidden\b/.test(m[0]);nodes.set(m[2],e);}
 document={getElementById:id=>{assert.ok(nodes.has(id),'Missing '+id);return nodes.get(id);},createElement:t=>new El(t),createElementNS:(_,t)=>new El(t),createTextNode:text=>({textContent:text}),body:new El('body'),hidden:false};
 const s={document,URL,AbortController,structuredClone,setTimeout,clearTimeout,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},fetch:async u=>{calls.push(u);if(u==='./api/game/weather')return Response.json(weather?{ok:true,weather}:{ok:false,reason:'unavailable'},{status:weather?200:503});assert.equal(u,'./rivera-game.json');return Response.json(data);},requestAnimationFrame:f=>{queue.push(f);return queue.length;},cancelAnimationFrame(){},scrollTo(){},addEventListener(){},matchMedia:()=>({matches:false})};s.window=s;
 vm.createContext(s);for(const f of['overrides/rivera-game-engine.js','dist/client/course-golfer.js','overrides/rivera-game.js'])vm.runInContext(fs.readFileSync(f,'utf8'),s);await new Promise(resolve=>setImmediate(resolve));return{nodes,queue,storage,calls};
}
test('actual UI start and shot buttons animate a ball, save one stroke and allow undo without any analysis request',async()=>{
 const t=await ui(),get=id=>t.nodes.get(id);get('start-game').onclick();assert.equal(get('play-screen').hidden,false);const ball=get('player-ball'),before=ball.getAttribute('cy');get('hit-shot').onclick();get('hit-shot').onclick();assert.equal(get('hit-shot').disabled,true);let moved=false;for(let i=0;i<90&&t.queue.length;i++){t.queue.shift()(i*50);if(ball.getAttribute('cy')!==before)moved=true;}assert.equal(moved,true);assert.equal(get('hit-shot').disabled,false);assert.match(get('total-strokes').textContent,/1/);get('undo-shot').onclick();assert.match(get('total-strokes').textContent,/0/);assert.equal(t.calls.length,2);assert.ok(t.calls.every(u=>u==='./rivera-game.json'||u==='./api/game/weather'));
});
test('UI pairs different courses, switches after nine holes, finishes eighteen and resumes the saved result',async()=>{
 const t=await ui(),get=id=>t.nodes.get(id);get('front-courses').children.find(b=>b.dataset.course==='pine').onclick();get('back-courses').children.find(b=>b.dataset.course==='cherry').onclick();get('start-game').onclick();for(let i=0;i<18;i++){get('concede-hole').onclick();assert.equal(get('hole-finish').hidden,false);get('next-hole').onclick();if(i===8)assert.match(get('leg-label').textContent,/체리힐/);}assert.equal(get('result-screen').hidden,false);assert.equal(get('final-total').textContent,'162타');get('result-score').onclick();assert.equal(get('score-overlay').hidden,false);assert.equal(get('score-content').children.filter(c=>c.tagName==='table').length,2);get('close-score').onclick();const again=await ui(t.storage);assert.equal(again.nodes.get('resume-game').hidden,false);again.nodes.get('resume-game').onclick();assert.equal(again.nodes.get('result-screen').hidden,false);assert.equal(again.nodes.get('final-total').textContent,'162타');
});

const liveWind=(speed,from,extra={})=>({mode:'live',temperature:20,windSpeed:speed,windFrom:from,gust:speed,precipitation:0,weatherTime:'2026-11-21T02:30:00Z',...extra});
test('meteorological head/tail/crosswind changes landing in the correct screen-relative direction',()=>{
 const E=engine(),hole={distance:400,route:[[100,600],[100,100]]};function shot(w){const s=E.create(data,'valley','lake',25);E.setWeather(s,w);return E.hit(s,hole);}
 const calm=shot(E.neutralWeather()),head=shot(liveWind(6,0)),tail=shot(liveWind(6,180)),east=shot(liveWind(6,270)),west=shot(liveWind(6,90));assert.ok(head.carry<calm.carry);assert.ok(tail.carry>calm.carry);assert.ok(east.end.x>calm.end.x+3);assert.ok(west.end.x<calm.end.x-3);const s=E.create(data);E.setWeather(s,liveWind(6,0));assert.ok(E.conditions(s,{...hole,route:[[100,100],[100,600]]}).along>0);
});
test('temperature and rain change range while wind alone never pushes a putt',()=>{
 const E=engine(),h=E.holes(data,E.create(data))[0];function distance(w,club='driver'){const s=E.create(data);s.club=club;E.setWeather(s,w);return E.predict(s,h);}
 assert.ok(distance(liveWind(0,0,{temperature:30}))>distance(liveWind(0,0,{temperature:0})));assert.ok(distance(liveWind(0,0,{precipitation:2}))<distance(E.neutralWeather()));assert.equal(distance(liveWind(15,90),'putter'),distance(E.neutralWeather(),'putter'));assert.ok(distance(liveWind(0,0,{precipitation:2}),'putter')<distance(E.neutralWeather(),'putter'));
});
test('a shot freezes its weather and old saves restore as explicit baseline conditions',()=>{
 const E=engine(),s=E.create(data),h=E.holes(data,s)[0];E.setWeather(s,liveWind(3,0));E.hit(s,h);assert.throws(()=>E.setWeather(s,liveWind(10,90)));E.complete(s,h);E.setWeather(s,liveWind(10,90));assert.equal(s.shots[0].weather.windSpeed,3);assert.equal(s.weather.windSpeed,10);assert.equal(E.restore(data,JSON.stringify(s)).weather.windSpeed,10);delete s.weather;assert.equal(E.restore(data,s).weather.mode,'baseline');s.weather=liveWind(NaN,0);assert.equal(E.restore(data,s),null);
});
test('weather outage leaves the game playable with a clearly labeled baseline',async()=>{
 const t=await ui(new Map(),null),get=id=>t.nodes.get(id);assert.equal(get('start-game').disabled,false);assert.match(get('weather-status').textContent,/불러오지 못했습니다/);assert.match(get('weather-summary').textContent,/기본 조건/);get('start-game').onclick();assert.equal(get('play-screen').hidden,false);
});
test('live weather arriving during flight applies after landing without changing that shot snapshot',async()=>{
 const w=liveWind(3,0),t=await ui(new Map(),w),get=id=>t.nodes.get(id);get('start-game').onclick();get('hit-shot').onclick();w.windSpeed=8;w.gust=8;await get('weather-refresh').onclick();for(let i=0;i<90&&t.queue.length;i++)t.queue.shift()(i*50);const saved=JSON.parse(t.storage.get('motionguard:rivera-game:v1'));assert.equal(saved.shots[0].weather.windSpeed,3);assert.equal(saved.weather.windSpeed,8);
});
