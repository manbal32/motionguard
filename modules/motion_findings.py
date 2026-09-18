"""Descriptions derived only from observed angle samples."""

def graph_findings(result):
    samples = result['samples']
    valid = [s for s in samples if s['angle'] is not None]
    rows = []
    def add(graph, finding, meaning):
        rows.append({'그래프': graph, '관측 결과': finding, '읽는 방법·확인할 사항': meaning})
    if not valid:
        add('측정 상태', f"유효 프레임 0/{result['total_count']}", '해당 관절의 좌표·신뢰도 조건을 충족하지 못해 변화 해석을 보류합니다.')
        return rows
    lo, hi = min(valid,key=lambda s:s['angle']), max(valid,key=lambda s:s['angle'])
    add('각도', f"최소 {lo['angle']:.2f}° (f{lo['frame_idx']}), 최대 {hi['angle']:.2f}° (f{hi['frame_idx']})",
        f"관측된 각도 폭은 {hi['angle']-lo['angle']:.2f}°입니다. 정상 범위와의 비교값은 아닙니다." if len(valid)>1 else '유효 프레임이 하나뿐이므로 움직임 범위를 판단할 수 없습니다.')
    delta = [s for s in valid if s['delta_reference'] is not None]
    if delta:
        peak = max(delta,key=lambda s:abs(s['delta_reference']))
        add('기준각 대비 변화', f"기준 f{result['reference_frame']}의 {result['reference_angle']:.2f}° 대비 최대 이탈 {peak['delta_reference']:+.2f}° (f{peak['frame_idx']})",
            '+는 기준보다 각도가 커짐, −는 작아짐을 뜻합니다. 자세가 좋거나 나쁘다는 부호가 아닙니다.')
    else:
        add('기준각 대비 변화', '기준각 측정 불가', '주변 유효 각도의 최소·최대는 볼 수 있지만 기준 대비 변화는 계산하지 않습니다.')
    speed = [s for s in samples if s['velocity_deg_s'] is not None]
    if speed:
        peak = max(speed,key=lambda s:abs(s['velocity_deg_s']))
        add('인접 프레임 변화속도', f"최대 속도 크기 {abs(peak['velocity_deg_s']):.2f}°/s (f{peak['frame_idx']-1}→f{peak['frame_idx']}, 변화 방향 {peak['velocity_deg_s']:+.2f}°/s)",
            '이 두 프레임에서 실제 동작과 관절 점을 확인하세요. 빠른 움직임·좌표 튐·보간의 영향을 이 수치만으로 구분할 수 없습니다.')
    else:
        add('인접 프레임 변화속도', '계산 가능한 연속 프레임 쌍 없음', '측정 공백을 건너 속도를 계산하지 않습니다.')
    add('측정 범위', f"유효 프레임 {result['valid_count']}/{result['total_count']} ({result['coverage']:.0%})",
        '유효 비율은 각도 정확도가 아닙니다. 누락된 구간의 움직임은 결과에 포함되지 않습니다.')
    return rows
