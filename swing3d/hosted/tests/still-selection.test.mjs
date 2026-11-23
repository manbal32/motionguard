import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function api(){const s={window:{}};vm.runInNewContext(fs.readFileSync('overrides/still-selection.js','utf8'),s);return s.window.MotionStills;}
test('late phase detections cannot restrict the candidate scan to the finish',()=>{const p=api().plan({meta:{fps:30,phase_frames:{address:60,top:82,down:84,impact:86,finish:88}}},4);assert.ok(p[0]<.2);assert.ok(p.at(-1)>3.8);assert.ok(p.some(t=>t>1&&t<1.5));});
test('different JPEG bytes of the same pose are rejected',()=>{const c=Array.from({length:17},(_,i)=>({time:i/4,image:'jpeg'+i,fingerprint:Array.from({length:24},()=>i%2)}));assert.throws(()=>api().choose(c,4),/구분하지 못했습니다/);});
test('keyframes cover the clip and keep varied poses instead of repeated finish frames',()=>{const c=Array.from({length:17},(_,i)=>({time:i/4,image:'jpeg'+i,fingerprint:Array.from({length:24},(_,j)=>i>=10?90:(j+i)%4*30)}));const s=api().choose(c,4);assert.equal(s.length,5);assert.ok(s[0].time<=.72);assert.ok(s[4].time>=3.28);assert.equal(s.filter(x=>x.time>=2.5).length,1);assert.ok(s.every(x=>x.min_pair_change>=.035&&x.phase_unverified));});

test('full wrist trajectory recovers the early preparation and swing instead of trusting late phase labels',()=>{const frames=Array.from({length:121},(_,i)=>{const p=Array.from({length:22},()=>[.5,.5,.9]);const y=i<45?.65:i<65?.65-(i-45)*.0175:i<76?.30+(i-65)*.03:.38;for(const k of [4,5])p[k]=[.5,y,.8];return p;});const h=api().hints({meta:{fps:30,phase_frames:{address:80,top:90,down:95,impact:98,finish:100}},evidence:{frames}},4);assert.ok(h.address<.2);assert.ok(h.top>=2&&h.top<2.3);assert.ok(h.impact>h.top);assert.ok(h.down>h.top&&h.down<h.impact);});

test('wide shots with a small moving golfer use motion-region comparison without accepting repeated poses',()=>{
 const a=api(),c=Array.from({length:33},(_,i)=>{const state=i<10?0:i<15?1:i<19?2:i<24?3:4;return{time:.1+i*.1194,image:'jpeg-'+i,fingerprint:Array.from({length:1536},(_,p)=>p>=700&&p<764?((p-700+state*13)%64<16?80:0):0)};});
 assert.ok(Math.max(...c.flatMap(x=>c.map(y=>a.distance(x,y))))<.035);const s=a.choose(c,4.022114);assert.equal(s.length,5);assert.equal(new Set(s.map(x=>JSON.stringify(x.fingerprint))).size,5);assert.ok(s.every(x=>x.comparison_scope==='motion-region'&&x.phase_unverified&&x.min_pair_change>=.035));assert.ok(s[0].time<.73);assert.ok(s[4].time>=3.29);
});
test('single-pixel changes and JPEG noise cannot become five poses through motion normalization',()=>{
 const a=api(),c=Array.from({length:33},(_,i)=>({time:.1+i*.1194,image:'noise-'+i,fingerprint:Array.from({length:1536},(_,p)=>p===i?80:((p+i)%3))}));assert.equal(a.motionMask(c),null);assert.throws(()=>a.choose(c,4.022114),/구분하지 못했습니다/);
});
test('short videos are sampled densely enough to include brief swing transitions',()=>{
 const times=api().plan({meta:{fps:30}},4.022114);assert.equal(times.length,33);assert.ok(times.slice(1).every((t,i)=>t-times[i]<.13));
});
