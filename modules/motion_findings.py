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
        f"선택한 영상 구간에서 {lo['frame_idx']}번 프레임의 각도가 {lo['angle']:.2f}°로 가장 작고, {hi['frame_idx']}번 프레임의 각도가 {hi['angle']:.2f}°로 가장 큽니다. 두 값의 차이는 {hi['angle']-lo['angle']:.2f}°입니다." if len(valid)>1 else '유효 프레임이 하나뿐이므로 움직임 범위를 판단할 수 없습니다.')
    delta = [s for s in valid if s['delta_reference'] is not None]
    if delta:
        peak = max(delta,key=lambda s:abs(s['delta_reference']))
        change=peak['delta_reference']
        direction='커졌습니다' if change>0 else '작아졌습니다'
        explanation=(f"기준으로 삼은 {result['reference_frame']}번 프레임은 {result['reference_angle']:.2f}°입니다. 기준과 가장 차이가 큰 {peak['frame_idx']}번 프레임은 {peak['angle']:.2f}°로, 기준보다 {abs(change):.2f}° {direction}." if change else f"계산 가능한 프레임의 각도가 모두 기준 {result['reference_angle']:.2f}°와 같습니다.")
        add('기준각 대비 변화', f"기준 f{result['reference_frame']}의 {result['reference_angle']:.2f}° 대비 최대 이탈 {peak['delta_reference']:+.2f}° (f{peak['frame_idx']})",
            explanation)
    else:
        add('기준각 대비 변화', '기준각 측정 불가', '주변 유효 각도의 최소·최대는 볼 수 있지만 기준 대비 변화는 계산하지 않습니다.')
    speed = [s for s in samples if s['velocity_deg_s'] is not None]
    if speed:
        peak = max(speed,key=lambda s:abs(s['velocity_deg_s']))
        previous=next(s for s in samples if s['frame_idx']==peak['frame_idx']-1)
        elapsed=peak['timestamp']-previous['timestamp']
        difference=peak['angle']-previous['angle']
        direction='커졌습니다' if difference>0 else '작아졌습니다'
        explanation=(f"{previous['frame_idx']}번에서 {peak['frame_idx']}번 프레임으로 넘어가는 {elapsed:.4f}초 동안 각도가 {previous['angle']:.2f}°에서 {peak['angle']:.2f}°로 {abs(difference):.2f}° {direction}. 이 짧은 구간의 변화량을 시간으로 나눈 값이 {abs(peak['velocity_deg_s']):.2f}°/s이며, 계산 가능한 연속 프레임 중 가장 빠른 변화입니다. 1초 동안 실제로 그만큼 움직였다는 뜻은 아닙니다." if difference else '계산 가능한 연속 프레임 사이에 각도 변화가 없어 최대 변화속도는 0°/s입니다.')
        add('인접 프레임 변화속도', f"최대 속도 크기 {abs(peak['velocity_deg_s']):.2f}°/s (f{peak['frame_idx']-1}→f{peak['frame_idx']}, 변화 방향 {peak['velocity_deg_s']:+.2f}°/s)",
            explanation)
    else:
        add('인접 프레임 변화속도', '계산 가능한 연속 프레임 쌍 없음', '측정 공백을 건너 속도를 계산하지 않습니다.')
    add('측정 범위', f"유효 프레임 {result['valid_count']}/{result['total_count']} ({result['coverage']:.0%})",
        '※ 계산값이 모두 있어도 관절 좌표의 위치나 촬영 방향에 따라 실제 각도와 차이가 날 수 있습니다. 계산하지 못한 프레임은 결과에서 제외됩니다.')
    return rows
