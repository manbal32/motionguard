"""STEP 7: cited angle-bin references, not composite ergonomic scores.

2-D unsigned projection angles cannot establish anatomical flexion planes.
Reference components assume flexion and exclude all posture/load adjustments.
"""
import math

METHOD = 'rula_reba_reference_components_v2'
SOURCES = {
    'RULA': 'https://ergo.human.cornell.edu/Pub/AHquest/RULAworksheet.pdf',
    'REBA': 'https://ergo.human.cornell.edu/Pub/AHquest/Cornell_REBA.pdf',
}
ANGLE_KEYS = ('shoulder_angle', 'wrist_angle', 'spine_angle')


def valid_angle(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) and 0 <= value <= 180 else None


def reference_components(shoulder, wrist, spine):
    """Unadjusted bins only, under stated flexion-plane assumption.

    Exact zero is neutral; no undocumented 5-degree neutral tolerance.
    Shared endpoints are assigned to the lower bin (20,45,90,15,60).
    """
    arm = None if shoulder is None else 1 + sum(shoulder > t for t in (20,45,90))
    rula_wrist = None if wrist is None else (1 if wrist == 0 else 2 if wrist <= 15 else 3)
    reba_wrist = None if wrist is None else (1 if wrist <= 15 else 2)
    trunk = None if spine is None else (1 if spine == 0 else 2 if spine <= 20 else 3 if spine <= 60 else 4)
    return {'rula_upper_arm_base_reference': arm, 'rula_wrist_base_reference': rula_wrist,
            'reba_wrist_base_reference': reba_wrist, 'reba_trunk_base_reference': trunk}


def assess_pose(row):
    angles = {key: valid_angle(row.get(key)) if key not in row.get('excluded_angles',[]) else None for key in ANGLE_KEYS}
    low = row.get('low_confidence') is True
    values = [None]*3 if low else list(angles.values())
    return {
        'phase': row.get('phase', '구간 미상'), 'method': METHOD, 'angles': angles,
        'reference_components': reference_components(*values),
        'rula_score': None, 'reba_score': None, 'rula_action_level': None, 'reba_action_level': None,
        'status': '저신뢰로 기준 대조 보류' if low else '기준 구간 참고만 가능; 최종 평가 불가',
        'low_confidence': low, 'missing_angles': [k for k,v in angles.items() if v is None],
        'sources': SOURCES,
        'missing_assessment_inputs': ['해부학적 운동면 및 굴곡/신전 방향 확인', '목·팔꿈치·다리 자세',
            '어깨 들림·외전·지지, 손목 비틀림·편위, 몸통 비틀림 보정',
            '하중·근육 사용·반복·그립·활동성', '좌우별 완전한 입력 및 공식 표 A/B/C 조합'],
        'limitations': '2D 투영값을 굴곡으로 가정한 부위별 기본 구간 대조. 공식 최종 점수·위험 등급·질병 진단 아님.',
    }


def injury_warnings(pose_data):
    warnings = []
    for row in pose_data or []:
        result = assess_pose(row)
        phase, angles, comp = result['phase'], result['angles'], result['reference_components']
        if result['low_confidence']:
            warnings.append(f'{phase}: 저신뢰 프레임 — 기준 구간 대조 보류')
            continue
        for key, label, reference, score_key in (
            ('shoulder_angle', '어깨각', 'RULA 상완', 'rula_upper_arm_base_reference'),
            ('wrist_angle', '손목 편위각', 'RULA 손목', 'rula_wrist_base_reference'),
            ('spine_angle', '몸통 기울기', 'REBA 몸통', 'reba_trunk_base_reference'),
        ):
            angle, score = angles[key], comp[score_key]
            if angle is not None:
                warnings.append(f'{phase} {label} = {angle:.1f}° → {reference} 기본 구간 {score} 참고 '
                                '(굴곡 가정·보정 전·최종 위험 등급 아님)')
        if result['missing_angles']:
            warnings.append(f'{phase}: 일부 관절각 측정 불가 — 가림·랜드마크 신뢰도 확인 필요')
    return warnings or ['관절각 데이터가 없어 기준 구간을 대조할 수 없습니다.']
