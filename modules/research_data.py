"""Research plan STEP 2/3: complete series and explicit phase aggregation."""
from dataclasses import asdict
from bisect import bisect_left
import math
import statistics
from .risk_assessor import ANGLE_KEYS, valid_angle
from .pose_compat import normalize_pose


def finite(value):
    value = float(value)
    return value if math.isfinite(value) else None


def build_research_data(frames, poses, key_frames, confidence_threshold=0.5):
    if len(frames) != len(poses):
        raise ValueError('프레임과 자세 데이터 개수가 다릅니다.')
    if not 0 <= confidence_threshold <= 1:
        raise ValueError('신뢰도 기준은 0~1이어야 합니다.')
    indices = [int(f.frame_idx) for f in frames]
    if any(b <= a for a,b in zip(indices,indices[1:])):
        raise ValueError('프레임 인덱스는 증가해야 합니다.')
    anchors = [(int(k.frame_idx), k.phase_label) for k in key_frames]
    valid_segmentation = bool(anchors) and all(i in indices for i,_ in anchors) and all(
        b[0] > a[0] for a,b in zip(anchors,anchors[1:]))
    boundaries = [(a[0]+b[0])/2 for a,b in zip(anchors,anchors[1:])] if valid_segmentation else []
    series = []
    for frame, pose in zip(frames, poses):
        pose=normalize_pose(pose)
        confidence = finite(pose.confidence)
        low = not pose.is_detected or confidence is None or confidence < confidence_threshold
        angles = {k: valid_angle((pose.angles or {}).get(k)) for k in ANGLE_KEYS}
        excluded = [k for k in ANGLE_KEYS if pose.angle_confidence.get(k,pose.confidence)<confidence_threshold]
        if pose.angle_confidence:
            low = not any(v is not None and k not in excluded for k,v in angles.items())
        phase = anchors[bisect_left(boundaries,frame.frame_idx)][1] if valid_segmentation else '미분류'
        series.append({'frame_idx': int(frame.frame_idx), 'timestamp': finite(frame.timestamp), 'phase': phase,
                       'confidence': confidence, 'low_confidence': low, 'angle_confidence': dict(pose.angle_confidence),
                       'angle_sources': dict(pose.angle_sources), 'confidence_threshold': confidence_threshold,'excluded_angles':excluded, 'is_detected': bool(pose.is_detected),
                       **angles, 'measurement_issues': dict(pose.measurement_issues), 'side_angles': {k:valid_angle(v) if pose.angle_confidence.get(k, pose.confidence) >= confidence_threshold else None for k,v in (pose.angles or {}).items() if k not in ANGLE_KEYS},
                       'landmarks': {name:{k:finite(v) for k,v in asdict(lm).items()}
                                     for name,lm in (pose.landmarks or {}).items()}})
    summaries = []
    labels = list(dict.fromkeys(r['phase'] for r in series))
    for phase in labels:
        rows = [r for r in series if r['phase']==phase]
        stats = {}
        for key in ANGLE_KEYS:
            values = [r[key] for r in rows if not r['low_confidence'] and r[key] is not None and key not in r.get('excluded_angles',[])]
            stats[key] = {'valid_count':len(values), 'excluded_count':len(rows)-len(values),
                          'mean':statistics.mean(values) if values else None,
                          'min':min(values) if values else None, 'max':max(values) if values else None,
                          'std_population':statistics.pstdev(values) if values else None}
        summaries.append({'phase':phase,'frame_count':len(rows), 'low_confidence_count':sum(r['low_confidence'] for r in rows),
                          'first_frame':rows[0]['frame_idx'],'last_frame':rows[-1]['frame_idx'],
                          'start_time':rows[0]['timestamp'],'end_time':rows[-1]['timestamp'],'angles':stats})
    return {'schema_version':'motionguard_research_v1', 'angle_method':'2d_pixel_projection',
            'confidence_threshold':confidence_threshold,'threshold_status':'구현 설정값; 연구에서 검증 필요',
            'segmentation_valid':valid_segmentation,
            'segmentation_method':'선택된 이벤트 프레임 사이 중간점을 경계로 한 임시 국면 구간; 경계 동률은 앞 국면',
            'series':series,'phase_statistics':summaries}
