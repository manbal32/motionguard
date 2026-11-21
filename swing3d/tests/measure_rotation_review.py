"""Report raw yaw and bounded relative rotations without fitting reference angles."""
import json,math,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import swing_track as st,scoring
f,fps=st.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'));t=st.build_track(f,fps);address=t['meta']['phase_frames']['address'];out={}
raw={part:[math.atan2(w['RIGHT_'+part][2]-w['LEFT_'+part][2],w['RIGHT_'+part][0]-w['LEFT_'+part][0]) for w in f.world_frames] for part in ('SHOULDER','HIP')}
unwrapped={part:st._unwrap(a) for part,a in raw.items()}
for phase,i in t['meta']['phase_frames'].items():
    before={part:math.degrees(a[i]-a[address]) for part,a in unwrapped.items()};after={k:math.degrees(t['track'][i-address][t['channels'].index(k)]) for k in ('torso','hips','x_factor')}
    out[phase]={'frame':i,'raw_yaw':{part:math.degrees(a[i]) for part,a in raw.items()},'before':dict(torso=before['SHOULDER'],hips=before['HIP'],x_factor=before['SHOULDER']-before['HIP']),'after':after}
score=scoring.compute(t)
result={'phases':out,'score':score['total'],'excluded':score['excluded'],'method':'atan2(sin(unwrapped_yaw-address_yaw),cos(unwrapped_yaw-address_yaw))','fitted_constants':False,'conclusion':'The top was already within ±180°. Wrapping does not repair lite-model world yaw.'}
(ROOT/'mockups/11e-rotation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
