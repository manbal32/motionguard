import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture(){
 const events=[];class Audio{
  constructor(){this.state='suspended';this.currentTime=10;this.destination={};events.push(['create']);}
  resume(){this.state='running';events.push(['resume']);return Promise.resolve();}
  suspend(){this.state='suspended';events.push(['suspend']);return Promise.resolve();}
  createOscillator(){const e={frequency:{setValueAtTime:(hz,t)=>events.push(['note',hz,t])},connect(){},disconnect(){},start:t=>events.push(['start',t]),stop:t=>events.push(['stop',t])};return e;}
  createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime:(value)=>events.push(['volume',value]),exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 }
 const scope={AudioContext:Audio};scope.window=scope;vm.runInNewContext(fs.readFileSync('overrides/rivera-game-sound.js','utf8'),scope);return{events,sound:scope.MotionGameSound.create(scope),scope};
}
test('hole-in sound is silent until unlocked and schedules three brief ascending notes',()=>{
 const{events,sound}=fixture();assert.equal(sound.holeIn(),false);assert.equal(events.length,0);sound.unlock();assert.equal(sound.holeIn(),true);const notes=events.filter(e=>e[0]==='note');assert.deepEqual(notes.map(e=>e[1]),[523.25,659.25,783.99]);assert.ok(notes[0][2]<notes[1][2]&&notes[1][2]<notes[2][2]);assert.equal(events.filter(e=>e[0]==='start').length,3);assert.equal(events.filter(e=>e[0]==='stop').length,3);assert.ok(events.filter(e=>e[0]==='volume').every(e=>e[1]<=.12));
});
test('muting blocks notes and re-enabling resumes the same audio context',()=>{
 const{events,sound}=fixture();sound.unlock();assert.equal(sound.toggle(),false);assert.equal(sound.holeIn(),false);assert.equal(events.some(e=>e[0]==='note'),false);assert.equal(sound.toggle(),true);assert.equal(sound.holeIn(),true);assert.equal(events.filter(e=>e[0]==='create').length,1);
});
test('missing audio support or blocked mobile resume never interrupts game execution',async()=>{
 const{scope}=fixture(),silent=scope.MotionGameSound.create({});assert.doesNotThrow(()=>silent.unlock());assert.equal(silent.holeIn(),false);
 class Blocked{constructor(){this.state='suspended';}resume(){return Promise.reject(Error('gesture required'));}}
 const blocked=scope.MotionGameSound.create({AudioContext:Blocked});blocked.unlock();await new Promise(resolve=>setImmediate(resolve));assert.equal(blocked.holeIn(),false);
});
