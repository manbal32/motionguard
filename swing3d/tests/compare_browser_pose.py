"""Compare every common second-pass body observation against real Python inference."""
import argparse,json,math,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import video_pose as vp,swing_track as st,scoring

def measure(directory):
    result={}
    for name in ('golf_swing.mp4','golf_swing_portrait.mp4'):
        js=json.loads((directory/(name+'.json')).read_text());frames,fps=vp.extract(str(ROOT/'samples'/name))[:2];track=st.build_track(frames,fps)
        diffs=[[],[],[]];world=[[],[],[]];count=0
        for i,(py,browser) in enumerate(zip(frames,js['original'])):
            if browser is None or not all(p[3]>0 for p in py.values()):continue
            count+=1
            for key in vp.LANDMARK_NAMES:
                actual=vp.crop_to_original(py[key],frames.extraction_meta['crop_box'])
                for j in range(3):diffs[j].append(abs(actual[j]-browser[key][j]))
                if frames.world_frames[i] and js['world'][i]:
                    for j in range(3):world[j].append(abs(frames.world_frames[i][key][j]-js['world'][i][key][j]))
        result[name]={'commonFrames':count,'coordinates':{key:{'max':max(values),'rms':math.sqrt(sum(v*v for v in values)/len(values))} for key,values in zip('xyz',diffs)},'worldMax':{key:max(values) for key,values in zip('xyz',world)},'browserFPS':js['fps'],'pythonFPS':fps,'pythonCrop':frames.extraction_meta['crop_box'],'browserCrop':js['track']['meta']['crop_box'],'decoder':js['track']['meta'].get('decoder'),'pythonReason':track['meta']['unusable_reason'],'browserReason':js['track']['meta']['unusable_reason'],'pythonPhases':track['meta']['phase_frames'],'browserPhases':js['track']['meta']['phase_frames'],'pythonScore':scoring.compute(track)['total'],'browserScore':js['track']['score']['total'],'browserExtractionSeconds':js['track']['meta']['extraction_seconds']}
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path);p.add_argument('--out',type=Path,default=ROOT/'mockups/11f-video-comparison.json');args=p.parse_args();result=measure(args.directory);args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
