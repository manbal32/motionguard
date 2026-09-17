"""Bounded coordinate recovery with provenance; never fill an entire missing track."""
from copy import deepcopy
import math
from .pose_analyzer import Landmark
from .pose_compat import normalize_pose
from .joint_angles import calculate_joint_angles, measurement_issues


def good(lm,threshold):
    return lm is not None and all(math.isfinite(v) for v in (lm.x,lm.y,lm.visibility)) and 0<=lm.x<=1 and 0<=lm.y<=1 and lm.visibility>=threshold


def recover_angles(frames,raw_poses,threshold=.5,max_gap=3,max_seconds=.12):
    if len(frames)!=len(raw_poses): raise ValueError('프레임/포즈 개수 불일치')
    # Copy only metadata: full-size image arrays remain shared and unchanged.
    raw_poses=[normalize_pose(p) for p in raw_poses]
    poses=[]
    for raw in raw_poses:
        p=normalize_pose(raw)
        p.landmarks=deepcopy(raw.landmarks or {})
        p.angles={}
        p.angle_sources={}
        p.angle_confidence={}
        poses.append(p)
    n=len(poses); provenance=[{} for _ in poses]
    names=set(name for p in poses for name in p.landmarks)
    for name in names:
        valid=[i for i,p in enumerate(raw_poses) if good((p.landmarks or {}).get(name),threshold)]
        for left,right in zip(valid,valid[1:]):
            gap=right-left-1
            dt=frames[right].timestamp-frames[left].timestamp
            if gap<1 or gap>max_gap or not 0<dt<=max_seconds: continue
            a,b=raw_poses[left].landmarks[name],raw_poses[right].landmarks[name]
            for i in range(left+1,right):
                alpha=(frames[i].timestamp-frames[left].timestamp)/dt
                if not 0<alpha<1: continue
                poses[i].landmarks[name]=Landmark(a.x+(b.x-a.x)*alpha,a.y+(b.y-a.y)*alpha,
                    a.z+(b.z-a.z)*alpha,min(a.visibility,b.visibility))
                provenance[i][name]=[frames[left].frame_idx,frames[right].frame_idx]
    for i,p in enumerate(poses):
        p.angles=calculate_joint_angles(p.landmarks,frames[i].image_bgr.shape,threshold)
        geometric=calculate_joint_angles(p.landmarks,frames[i].image_bgr.shape,0.)
        for key,value in geometric.items():
            if p.angles.get(key) is None and value is not None: p.angles[key]=value
        groups={}
        for side in ('LEFT','RIGHT'):
            groups[f'{side.lower()}_shoulder_angle']=[f'{side}_{x}' for x in ('HIP','SHOULDER','ELBOW')]
            groups[f'{side.lower()}_wrist_angle']=[f'{side}_{x}' for x in ('ELBOW','WRIST','INDEX')]
        groups['spine_angle']=['LEFT_SHOULDER','RIGHT_SHOULDER','LEFT_HIP','RIGHT_HIP']
        for key,required in groups.items():
            if p.angles.get(key) is None: continue
            interpolated={name:provenance[i][name] for name in required if name in provenance[i]}
            p.angle_confidence[key]=min(p.landmarks[name].visibility for name in required)
            p.angle_sources[key]={'method':('low_confidence_geometry' if p.angle_confidence[key]<threshold else 'coordinate_interpolation' if interpolated else 'direct'),
                'frame_idx':frames[i].frame_idx,'interpolated_landmarks':interpolated}
        for joint in ('shoulder','wrist'):
            candidates=[f'{s}_{joint}_angle' for s in ('left','right') if p.angles.get(f'{s}_{joint}_angle') is not None]
            if candidates:
                reliable=[key for key in candidates if p.angle_confidence.get(key,0)>=threshold]
                selected=max(reliable or candidates,key=lambda key:p.angles[key])
                p.angles[f'{joint}_angle']=p.angles[selected]
                p.angle_confidence[f'{joint}_angle']=p.angle_confidence[selected]
                p.angle_sources[f'{joint}_angle']={**p.angle_sources[selected],'side':selected.split('_')[0]}
        p.measurement_issues={**raw_poses[i].measurement_issues,**measurement_issues(p.landmarks,p.angles,threshold)}
        if not p.landmarks:p.measurement_issues['pose']=p.measurement_issues.get('pose','')+'; 전체 주변 구간에서도 관절 좌표가 검출되지 않음'
    return poses


def angle_usable(pose,key,threshold):
    value=(pose.angles or {}).get(key)
    quality=pose.angle_confidence.get(key,pose.confidence)
    return value is not None and math.isfinite(value) and quality>=threshold


def resolve_event_angles(frames,poses,events,threshold=.5,max_seconds=.15):
    """Keep event time fixed; locate nearest valid per-angle observation within its cell."""
    indices=[k.frame_idx for k in events]
    ordered=all(a<b for a,b in zip(indices,indices[1:]))
    output=[]
    for pos,k in enumerate(events):
        target=k.frame_idx
        lo=(indices[pos-1]+target)//2+1 if pos and ordered else target
        hi=(target+indices[pos+1])//2 if pos+1<len(indices) and ordered else target
        if pos==0:lo=0
        if pos==len(indices)-1:hi=len(frames)-1
        candidates=[i for i in range(max(0,lo),min(len(frames)-1,hi)+1)
                    if abs(frames[i].timestamp-k.timestamp)<=max_seconds]
        candidates.sort(key=lambda i:(abs(frames[i].timestamp-k.timestamp),i))
        row={'phase':k.phase_label,'frame_idx':target,'low_confidence':False,'angle_sources':{},'measurement_issues':{},'excluded_angles':[]}
        for key in ('shoulder_angle','wrist_angle','spine_angle'):
            selected=next((i for i in candidates if angle_usable(poses[i],key,threshold)),None)
            reliable = selected is not None
            if selected is None:
                selected=next((i for i in candidates if (poses[i].angles or {}).get(key) is not None),None)
                if selected is not None:
                    row['excluded_angles'].append(key)
                    row['measurement_issues'][key]='좌표로 기하 계산은 가능하지만 관절 신뢰도가 낮아 판정에서 제외'
            row[key]=poses[selected].angles[key] if selected is not None else None
            if selected is not None:
                source=dict(poses[selected].angle_sources.get(key,{'method':'direct'}))
                source.update({'source_frame':selected,'event_frame':target,
                               'offset_seconds':frames[selected].timestamp-k.timestamp})
                if selected!=target:source['method']='nearby_frame_'+source['method']
                row['angle_sources'][key]=source
            else:row['measurement_issues'][key]='국면 전후 0.15초 안에서 필요한 유효 관절 좌표를 확보하지 못함'
        row['low_confidence']=all(row[key] is None or key in row['excluded_angles'] for key in ('shoulder_angle','wrist_angle','spine_angle'))
        output.append(row)
    return output
