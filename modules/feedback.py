"""Measurement-grounded tables and inference eligibility."""
from .risk_assessor import ANGLE_KEYS, valid_angle, assess_pose
LABELS={'shoulder_angle':'어깨각','wrist_angle':'손목 편위각','spine_angle':'몸통 기울기'}


def usable(row):
    return row.get('low_confidence') is not True and any(valid_angle(row.get(k)) is not None and k not in row.get('excluded_angles',[]) for k in ANGLE_KEYS)


def phase_tables(rows):
    feedback, quality = [], []
    for row in rows or []:
        phase=row.get('phase','구간 미상')
        issues=row.get('measurement_issues') or {}
        references=assess_pose(row)['reference_components']
        for key in ANGLE_KEYS:
            value=valid_angle(row.get(key))
            if row.get('low_confidence') is True or value is None or key in row.get('excluded_angles',[]):
                reason=issues.get(key) or issues.get('pose') or ('프레임 신뢰도가 설정 기준 미만' if row.get('low_confidence') else '각도 산출값 없음; 측정 로그 확인 필요')
                quality.append({'phase':phase,'joint':LABELS[key],'reason':reason,
                                'suggestion':'전신과 해당 관절이 보이는 구간으로 재촬영하거나 원본 좌표·오류 로그 확인'})
                continue
            reference,score_key={
                'shoulder_angle':('RULA 상완','rula_upper_arm_base_reference'),
                'wrist_angle':('RULA 손목','rula_wrist_base_reference'),
                'spine_angle':('REBA 몸통','reba_trunk_base_reference')}[key]
            finding={'shoulder_angle':f'팔과 몸통의 투영 사이각 {value:.1f}°',
                     'wrist_angle':f'손목 직선 정렬에서의 편위 {value:.1f}°',
                     'spine_angle':f'화면 수직선 대비 몸통 기울기 {value:.1f}°'}[key]
            suggestion={'shoulder_angle':'팔의 외전·지지 여부를 추가 확인',
                        'wrist_angle':'굴곡·신전과 옆 방향 편위를 구분하고 그립 부하 확인',
                        'spine_angle':'굴곡·신전 방향 확인; 요추 회전 여부는 이 값으로 판정 불가'}[key]
            source=(row.get('angle_sources') or {}).get(key,{})
            source_note = f"; 산출 방법: {source.get('method','direct')}, 출처 프레임 {source.get('source_frame',row.get('frame_idx','-'))}"
            feedback.append({'phase':phase,'joint':LABELS[key], 'finding':finding,
                             'evidence':f'{LABELS[key]} {value:.1f}°; {reference} 기본 구간 {references[score_key]} 참고(굴곡 가정·최종 위험 등급 아님)'+source_note,
                             'suggestion':suggestion})
    return feedback, quality


def inference_context(context):
    context=dict(context or {})
    research=dict(context.get('research_data') or {})
    if research:
        research.pop('raw_series',None)
        series=research.get('series',[])
        accepted=[]
        for row in series:
            if usable(row):
                accepted.append({k:v for k,v in row.items() if k not in ANGLE_KEYS or (valid_angle(v) is not None and k not in row.get('excluded_angles',[]))})
        research['series']=accepted
        research['excluded_frame_count']=len(series)-len(accepted)
        research['input_policy']='유효 각도가 있는 프레임만 추론에 사용. 전체 기록은 로컬 JSON에 보존.'
        context['research_data']=research
    return context
