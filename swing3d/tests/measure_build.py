"""Measure implemented build stages 1–4; no reference frames enter production code."""
import json
import math
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import swing_track as st,video_pose as vp,scoring
from test_capture_guidance import fixtures

def measure():
    frames,fps=st.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'));track=st.build_track(frames,fps);m=track['meta'];p=m['phase_frames'];start=m['source_frames'][0]
    score=scoring.compute(track)
    real=dict(fps=fps,frames=len(frames),body_points=sorted(set(map(len,frames))),world_points=sorted(set(map(len,frames.world_frames))),phase_frames=p,accepted_frames=m['accepted_frames'],total_frames=m['total_frames'],impact_verified=m['impact_verified'],impact_height_difference=m['phase_diagnostics']['impact_height_difference'],address_to_top_s=(p['top']-p['address'])/fps,top_to_impact_s=(p['impact']-p['top'])/fps,
              angles_degrees={phase:{channel:math.degrees(track['track'][i-start][track['channels'].index(channel)]) for channel in ('torso','hips','x_factor')} for phase,i in p.items()},score=score,score_repeat_difference=abs(score['total']-scoring.compute(track)['total']))
    result={'real':real,'guidance':{k:{key:t['meta'].get(key) for key in ('usable','unusable_reason','accepted_frames','total_frames','shoulder_width_pixels')} for k,t in fixtures().items()},'samples':{}}
    for name in ('golf_swing.mp4','golf_swing_portrait.mp4'):
        f,fps=vp.extract(str(ROOT/'samples'/name))[:2];t=st.build_track(f,fps)
        result['samples'][name]=dict(frames=len(f),body_point_counts=sorted(set(map(len,f))),world_point_counts=sorted({len(w) for w in f.world_frames if w}),usable=t['meta']['usable'],unusable_reason=t['meta']['unusable_reason'],phases=t['meta']['phase_frames'])
    return result
if __name__=='__main__':print(json.dumps(measure(),ensure_ascii=False,indent=2))
