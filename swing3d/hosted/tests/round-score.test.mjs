import {webcrypto} from 'node:crypto';
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {readRecentRoundScore} from '../server/round-score.mjs';
test('recent round is optional, never defaulted to zero, and numeric self-report is validated',()=>{for(const v of [undefined,null,''])assert.equal(readRecentRoundScore(v),undefined);for(const v of [54,105,121,200])assert.equal(readRecentRoundScore(v),v);for(const v of [0,53,201,105.5,'105','105;ignore',{},NaN])assert.throws(()=>readRecentRoundScore(v));});
test('upload record restores, edits and clears without retaining an old approved score',()=>{const saved=new Map(),events={},field={value:'',setCustomValidity(v){this.error=v;},reportValidity(){this.reported=true;},addEventListener(n,f){events[n]=f;}},s={document:{readyState:'complete',getElementById:id=>id==='recent-round-score'?field:null},sessionStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)}};s.window=s;const code=fs.readFileSync('overrides/round-score.js','utf8');vm.runInNewContext(code,s);assert.equal(s.MotionRoundScore.read(),undefined);field.value='105';events.input();assert.equal(s.MotionRoundScore.attach({goal:'practice'}).recent_round_score,105);field.value='';events.input();assert.equal(s.MotionRoundScore.attach({recent_round_score:105}).recent_round_score,undefined);assert.equal(saved.size,0);field.value='121';events.input();field.value='';vm.runInNewContext(code,s);assert.equal(field.value,'121');field.value='105.5';assert.throws(()=>s.MotionRoundScore.read());assert.equal(field.reported,true);field.value='105';events.input();assert.equal(s.MotionRoundScore.read(),105);assert.equal(field.error,'');});

test('approved record is saved in the browser report and survives reopening without consulting current upload input',async()=>{const saved=new Map(),db={transaction(store){const transaction={objectStore(){return {get:key=>run(saved.get(store+':'+key)),put:(value,key)=>{saved.set(store+':'+key,value);return run(value);},delete:key=>{saved.delete(store+':'+key);return run(undefined);}};}};function run(value){const request={result:value};queueMicrotask(()=>{request.onsuccess();transaction.oncomplete();});return request;}return transaction;}};const s={MotionStaticMode:'browser',navigator:{},document:{currentScript:{src:'https://example.test/client-api.js'},addEventListener(){}},location:{href:'https://example.test/'},indexedDB:{open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}},URL,Response,crypto:webcrypto,fetch:async()=>Response.json({}),MotionTrack:{csv:()=>({frames:[],fps:30}),build:()=>({meta:{usable:false}}),score:()=>({items:[]})},MotionLocalCoach:{analyze:(_track,summary)=>({conversation_summary:summary,score:{total:null,measured_count:0,items:[]}}),conditions:()=>({})},MotionVisual:{analyze:async(_track,summary)=>({mode:'gemini-images',input_receipt:{recent_round_score:summary.recent_round_score},analysis:{assessment_score:{dimensions:[]}}})}};s.window=s;vm.runInNewContext(fs.readFileSync('dist/client/client-api.js','utf8'),s);const track=await(await s.fetch('./api/track',{method:'POST',body:new Blob(['fixture'])})).json(),response=await s.fetch('./api/coaching/analyze',{method:'POST',body:JSON.stringify({approved:true,profile_id:'a'.repeat(8)+'-'+ 'b'.repeat(4)+'-'+ 'c'.repeat(4)+'-'+ 'd'.repeat(4)+'-'+ 'e'.repeat(12),track_id:track.track_id,conversation_summary:{concern:'fixture',recent_round_score:105}})});assert.equal(response.status,200);const report=await response.json(),reopened=await(await s.fetch('./api/coaching/report/'+report.report_id)).json();assert.equal(reopened.recent_round_score,105);assert.equal(reopened.conversation_summary.recent_round_score,105);assert.equal(reopened.visual_analysis.input_receipt.recent_round_score,105);});

function roundField(savedScore) {
  const storage = new Map([['motionguard:recent-round-score', String(savedScore)]]);
  const media = {open: false};
  const field = {
    value: '', validity: {badInput: false}, events: {},
    setCustomValidity(message) { this.error = message; },
    reportValidity() { this.reported = true; },
    closest(selector) { return selector === '#uploaded-media' ? media : null; },
    addEventListener(name, handler) { this.events[name] = handler; },
    blur() { this.blurred = true; },
  };
  const ctx = {
    document: {readyState: 'complete', getElementById: id => id === 'recent-round-score' ? field : null},
    sessionStorage: {getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k)},
  };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync('overrides/round-score.js', 'utf8'), ctx);
  return {api: ctx.MotionRoundScore, field, media};
}

test('restored round record stays editable and Enter accepts without changing its value', () => {
  const {api, field} = roundField(115);
  assert.equal(field.value, '115');
  let prevented = false;
  field.events.keydown({key: 'Enter', isComposing: true, preventDefault() { prevented = true; }});
  assert.equal(prevented, false);
  field.value = '112';
  field.events.input();
  field.events.keydown({key: 'Enter', isComposing: false, preventDefault() { prevented = true; }});
  assert.equal(prevented, true);
  assert.equal(field.blurred, true);
  assert.equal(api.payload().recent_round_score, 112);
});

test('invalid round record reveals its field and is not treated as an omitted score', () => {
  const {api, field, media} = roundField(115);
  field.value = '0';
  assert.throws(() => api.read());
  assert.equal(media.open, true);
  assert.equal(field.reported, true);
  field.value = '';
  field.validity.badInput = true;
  assert.throws(() => api.read());
  field.validity.badInput = false;
  field.events.input();
  assert.equal(api.read(), undefined);
  assert.equal(field.error, '');
});
