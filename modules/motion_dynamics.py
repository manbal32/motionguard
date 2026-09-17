"""Observed video motion, not a clinical flexibility or injury assessment."""
import math
import statistics
from .risk_assessor import valid_angle

METRICS={
 'left_shoulder_angle':'왼쪽 어깨각', 'right_shoulder_angle':'오른쪽 어깨각',
 'left_wrist_angle':'왼쪽 손목 편위각','right_wrist_angle':'오른쪽 손목 편위각',
 'spine_angle':'몸통 기울기',
}


def measured(row,key):
    if row.get('angle_confidence'):
        if row['angle_confidence'].get(key,0) < row.get('confidence_threshold',.5): return None
    elif row.get('low_confidence') or not row.get('is_detected',True): return None
    source=row if key=='spine_angle' else row.get('side_angles',{})
    return valid_angle(source.get(key))


def motion_window(series,key,start,end,reference_frame):
    if key not in METRICS: raise ValueError('좌우가 구분된 관절각을 선택하세요.')
    if start>end: raise ValueError('구간 시작은 끝보다 앞이어야 합니다.')
    reference_row=next((r for r in series if r['frame_idx']==reference_frame),None)
    reference=measured(reference_row,key) if reference_row else None
    selected=[r for r in series if start<=r['frame_idx']<=end]
    samples=[]
    previous=None
    segment=0
    for row in selected:
        angle=measured(row,key)
        velocity=None
        timestamp=row.get('timestamp')
        if angle is not None and previous and previous['angle'] is not None:
            dt=timestamp-previous['timestamp'] if timestamp is not None and previous['timestamp'] is not None else None
            if row['frame_idx']==previous['frame_idx']+1 and dt is not None and math.isfinite(dt) and dt>0:
                velocity=(angle-previous['angle'])/dt
            else: segment+=1
        elif angle is not None: segment+=1
        sample={'frame_idx':row['frame_idx'],'timestamp':timestamp,'angle':angle,
                'delta_reference':angle-reference if angle is not None and reference is not None else None,
                'velocity_deg_s':velocity,'segment':segment}
        samples.append(sample)
        previous=sample
    valid=[s for s in samples if s['angle'] is not None]
    velocities=[abs(s['velocity_deg_s']) for s in samples if s['velocity_deg_s'] is not None]
    issues=[]
    # Relative within-window screen, not a clinical threshold. >=5 adjacent pairs.
    limit=None
    if len(velocities)>=5:
        median=statistics.median(velocities)
        mad=statistics.median(abs(v-median) for v in velocities)
        limit=max(median+3*1.4826*mad,median*3,1e-6)
        for s in samples:
            if s['velocity_deg_s'] is not None and abs(s['velocity_deg_s'])>limit:
                issues.append({'kind':'speed_review','frame_idx':s['frame_idx'], 'timestamp':s['timestamp'],
                    'finding':'구간 내 상대적으로 큰 각도 변화속도',
                    'evidence':f"{s['velocity_deg_s']:.1f}°/s; 구간 비교 기준 {limit:.1f}°/s",
                    'suggestion':'실제 빠른 동작인지 좌표 튐인지 앞뒤 프레임 확인; 부상 판정 아님'})
    missing=[s for s in samples if s['angle'] is None]
    if missing:
        issues.append({'kind':'missing_data','frame_idx':missing[0]['frame_idx'],'timestamp':missing[0]['timestamp'],
            'finding':'측정 공백으로 변화 해석 제한','evidence':f'{len(samples)}개 중 {len(missing)}개 프레임 제외',
            'suggestion':'관절 가림·신뢰도·좌표 오류 확인; 공백을 건너 속도를 계산하지 않음'})
    if reference is None:
        issues.append({'kind':'missing_reference','frame_idx':reference_frame,'timestamp':None,
            'finding':'기준 각도 측정 불가','evidence':'기준 대비 변화량은 산출하지 않음','suggestion':'같은 국면의 유효한 프레임으로 기준 이동'})
    angles=[s['angle'] for s in valid]
    first,last=(valid[0],valid[-1]) if valid else (None,None)
    return {'metric':key,'label':METRICS[key],'start_frame':start,'end_frame':end,'reference_frame':reference_frame,
        'reference_angle':reference,'valid_count':len(valid),'total_count':len(samples),
        'coverage':len(valid)/len(samples) if samples else 0.,
        'observed_rom_deg':max(angles)-min(angles) if len(angles)>=2 else None,
        'min_angle':min(angles) if angles else None,'max_angle':max(angles) if angles else None,
        'net_change_deg':last['angle']-first['angle'] if len(angles)>=2 else None,
        'net_change_frame_pair':[first['frame_idx'],last['frame_idx']] if len(angles)>=2 else None,
        'peak_abs_velocity_deg_s':max(velocities) if velocities else None,
        'speed_review_threshold_deg_s':limit,'samples':samples,'review_points':issues,
        'interpretation':'영상에서 관측한 2D 움직임 범위. 최대 신체 유연성·임상 ROM·부상 확률이 아님.'}
