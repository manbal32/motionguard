const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),context={};context.window=context;vm.createContext(context);
for(const file of ['reference.js','track-core.js'])vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),context);
const py=process.env.PYTHON||'python3';
const expected=JSON.parse(execFileSync(py,['-c',`import json,swing_track as s,scoring
f,fps=s.load_csv('samples/swing_front_landmarks.csv');t=s.build_track(f,fps)
print(json.dumps(dict(frames=f,world=f.world_frames,fps=fps,track=t,score=scoring.compute(t))))`],{cwd:root,maxBuffer:20*1024*1024}));
const input=context.MotionTrack.csv(fs.readFileSync(path.join(root,'samples/swing_front_landmarks.csv'),'utf8'));
const track=context.MotionTrack.build(input.frames,input.fps,input.world),score=context.MotionTrack.score(track);
assert.deepEqual(JSON.parse(JSON.stringify(track.meta.phase_frames)),expected.track.meta.phase_frames);
let maximum=0;track.track.forEach((row,i)=>row.forEach((v,j)=>{const other=expected.track.track[i][j];assert.equal(v===null,other===null);if(v!==null)maximum=Math.max(maximum,Math.abs(v-other));}));
assert.ok(maximum<=.001,`channel delta ${maximum}`);assert.ok(Math.abs(score.total-expected.score.total)<=3);
assert.deepEqual(JSON.parse(JSON.stringify(score.excluded)),expected.score.excluded);
const missing=input.world.map(()=>null),unavailable=context.MotionTrack.build(input.frames,input.fps,missing);assert.ok(unavailable.meta.unavailable.includes('torso'));
const result={phases:track.meta.phase_frames,maxChannelDifference:maximum,pythonScore:expected.score.total,browserScore:score.total,excluded:score.excluded};
fs.writeFileSync(path.join(root,'mockups/11f-core.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
