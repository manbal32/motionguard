"""
swing_track.py — MediaPipe 좌표에서 3D 아바타 구동용 트랙과 표본별 신뢰도를 산출한다.

MotionGuard Studio 의 cpu_pose.py 가 뽑은 랜드마크를 입력으로 받아,
웹 뷰어(web/swing3d.js)가 그대로 재생할 수 있는 JSON 을 만든다.

사용법
------
    # 1) 긴 형식 CSV (frame_idx,timestamp,landmark,x,y,z,visibility)
    python swing_track.py --csv exports/golf1_export.csv --out web/tracks/golf1.json

    # 2) cpu_pose.py 결과(프레임별 dict 리스트)를 코드에서 직접
    from swing_track import build_track
    track = build_track(frames, fps=64.3)

입력 요구사항
------------
- 프레임당 다음 랜드마크가 있어야 한다(이름은 MediaPipe Pose 표준):
  LEFT/RIGHT_SHOULDER, LEFT/RIGHT_HIP, LEFT/RIGHT_ELBOW, LEFT/RIGHT_WRIST,
  LEFT/RIGHT_KNEE, LEFT/RIGHT_ANKLE, LEFT/RIGHT_HEEL, LEFT/RIGHT_FOOT_INDEX
- x, y 는 0~1 화면 좌표. world_frames 는 별도의 3D 미터 좌표다.

측정 가능 / 불가능
-----------------
측정: 스윙각, 몸통회전, 골반회전, 전방기울기, 체중이동, 무릎굴곡, 뒤꿈치들림
불가: 손목 코킹(영상에 클럽이 없어 손-클럽 각도를 못 구함) → 뷰어에서 모델값으로 보정
몸통·골반·X-factor: pose_world_landmarks의 상대 yaw. 단일 카메라 모델의 3D 추정값이다.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from typing import Dict, List, Sequence

# 트랙 채널 순서 — 뷰어와 반드시 동일해야 한다
CHANNELS = [
    "swing",    # 가슴중점→손 벡터의 화면 내 각도. 어드레스 기준 0, 백스윙이 +
    "torso",    # 몸통 회전(rad). pose_world_landmarks 상대 yaw
    "hips",     # 골반 회전(rad)
    "lean",     # 전방 기울기(rad). 어깨-골반 거리 단축률에서 역산
    "wrist",    # 손목 힌지(rad). 전완 방향 − 스윙각. 클럽 미검출 시 ≈0
    "shiftX",   # 체중 이동. 골반 중심 x 변위(정규화)
    "kneeL",    # 왼무릎 굴곡(rad)
    "kneeR",    # 오른무릎 굴곡(rad)
    "heelR",    # 오른 뒤꿈치 들림 0~1
    "x_factor",   # 3D shoulder minus pelvis relative yaw (rad)
    "confidence",  # 원본 표본의 추적 신뢰도 0~1 (보간으로 높이지 않음)
]

SCHEMA = "motionguard.swingtrack/2"
TRACK_REVISION = 10
GUIDANCE = {
 'too_far':'촬영 거리가 멀어 몸의 회전을 잴 수 없습니다. 몸 전체가 화면 높이의 3분의 2를 채우도록 다시 찍어 주세요.',
 'tracking_failed':'영상이 흔들리거나 인물이 가려져 자세를 추적하지 못했습니다. 고정된 위치에서 다시 찍어 주세요.',
 'no_swing':'스윙 한 번이 처음부터 끝까지 담기지 않았습니다. 어드레스부터 피니쉬까지 한 번만 담아 주세요.',
}
OPTIONAL = ("LEFT_INDEX", "RIGHT_INDEX")

REQUIRED = [
    "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP",
    "LEFT_ELBOW", "RIGHT_ELBOW", "LEFT_WRIST", "RIGHT_WRIST",
    "LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE",
    "LEFT_HEEL", "RIGHT_HEEL", "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX",
]


# ── 기하 ──────────────────────────────────────────────────────────────

def _mid(d, a, b):
    return ((d[a][0] + d[b][0]) / 2.0, (d[a][1] + d[b][1]) / 2.0)


def _screen_angle(vx: float, vy: float) -> float:
    """화면 좌표(y 아래로 증가) 기준 각도. 0 = 아래, + = 화면 오른쪽."""
    return math.atan2(vx, vy)


def _joint_angle(d, a, b, c) -> float:
    """삼점 ABC 사이각(rad). 좌표가 겹치면 pi 를 돌려준다."""
    v1 = (d[a][0] - d[b][0], d[a][1] - d[b][1])
    v2 = (d[c][0] - d[b][0], d[c][1] - d[b][1])
    n1 = math.hypot(*v1)
    n2 = math.hypot(*v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return math.pi
    cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)
    return math.acos(max(-1.0, min(1.0, cos)))


def _unwrap(values: Sequence[float]) -> List[float]:
    """±pi 경계에서 튀는 각도 시계열을 연속으로 편다."""
    out = [values[0]]
    for v in values[1:]:
        prev = out[-1]
        while v - prev > math.pi:
            v -= 2 * math.pi
        while v - prev < -math.pi:
            v += 2 * math.pi
        out.append(v)
    return out


def _clean_landmarks(frames: List[Dict], fps: float, *, channel_quality=False):
    """Reject invalid observations before computing any angles."""
    # golf1 (64.31 fps): pooled displacement p95 is about 0.03, while wrist
    # glitches reach 0.13–0.31. Leave margin for the fast downswing, and scale
    # the 0.12/frame cutoff by frame interval for other recordings.
    step_limit = 0.12 * 64.31 / fps
    cleaned = [frame.copy() for frame in frames]
    confidence = [1.0] * len(frames)
    quality = {}
    confidence_landmarks = set(REQUIRED[:8])
    shoulder_width = [abs(frame["LEFT_SHOULDER"][0] - frame["RIGHT_SHOULDER"][0])
                      for frame in frames]
    typical_width = sorted(shoulder_width)[len(frames) // 2]

    for name in REQUIRED:
        observations = [frame[name] for frame in frames]
        valid = [obs[3] >= (0.3 if channel_quality else 0.5) for obs in observations]
        for i in range(1, len(observations) - 1):
            before, current, after = (obs[:2] for obs in observations[i - 1:i + 2])
            if (math.dist(before, current) > step_limit
                    and math.dist(current, after) > step_limit
                    and math.dist(before, after) <= 2 * step_limit):
                valid[i] = False
        rejected = set()
        for i in range(1, len(observations)):
            if valid[i - 1] and valid[i] and math.dist(observations[i - 1][:2], observations[i][:2]) > step_limit:
                # The offending side of a single jump is ambiguous. Reject both ends.
                rejected.update((i - 1, i))
        anchors = [i for i, accepted in enumerate(valid) if accepted and i not in rejected]
        if not anchors:
            raise ValueError(f"랜드마크 신뢰도 부족 ({name})")
        anchor_set = set(anchors)
        quality[name] = [max(0.0, min(1.0 if i in anchor_set else 0.25, obs[3]))
                         for i, obs in enumerate(observations)]
        for i, observation in enumerate(observations):
            if i not in anchor_set:
                confidence[i] = 0.0
            elif name in confidence_landmarks:
                confidence[i] = min(confidence[i], observation[3])
        bounds = [(-1, anchors[0]), *zip(anchors, anchors[1:]), (anchors[-1], len(frames))]
        for left, right in bounds:
            a = observations[max(left, anchors[0])]
            b = observations[min(right, anchors[-1])]
            for i in range(left + 1, right):
                t = (i - left) / (right - left)
                cleaned[i][name] = tuple(x + (y - x) * t for x, y in zip(a, b))

    # Width can collapse even when MediaPipe reports high shoulder visibility.
    if typical_width > 0:
        for i, width in enumerate(shoulder_width):
            confidence[i] = min(confidence[i], width / (0.25 * typical_width))
    return cleaned, quality if channel_quality else confidence


def _smooth(values: Sequence[float]) -> List[float]:
    """Quadratic Savitzky–Golay, seven samples, with one-sided edge fits."""
    if len(values) < 7:
        return list(values)
    result = []
    for i in range(len(values)):
        start = max(0, min(i - 3, len(values) - 7))
        t = i - start - 3
        result.append(sum(
            values[start + x + 3] * (1 / 7 + t * x / 28 + (t * t - 4) * (x * x - 4) / 84)
            for x in range(-3, 4)
        ))
    return result


def _index_wrist(frames):
    """Estimate flexion from the best tracked forearm and index finger."""
    sides = []
    for finger in OPTIONAL:
        side = finger.split("_")[0]
        observations = {}
        for i, frame in enumerate(frames):
            points = [frame.get(name) for name in (side + "_ELBOW", side + "_WRIST", finger)]
            if any(point is None or point[3] < 0.3 or not all(map(math.isfinite, point)) for point in points):
                continue
            elbow, wrist, index = points
            forearm = [wrist[j] - elbow[j] for j in range(3)]
            hand = [index[j] - wrist[j] for j in range(3)]
            length = math.hypot(*forearm) * math.hypot(*hand)
            if length > 1e-8:
                cosine = sum(a * b for a, b in zip(forearm, hand)) / length
                observations[i] = math.acos(max(-1, min(1, cosine)))
        sides.append(observations)
    observations = max(sides, key=len)
    if len(observations) < 7:
        return None, set()
    anchors = sorted(observations)
    values = [observations[anchors[0]]] * len(frames)
    for left, right in zip(anchors, anchors[1:]):
        for i in range(left, right):
            values[i] = observations[left] + (observations[right] - observations[left]) * (i - left) / (right - left)
    values[anchors[-1]:] = [observations[anchors[-1]]] * (len(frames) - anchors[-1])
    return _smooth(values), observations.keys()


# ── 본체 ──────────────────────────────────────────────────────────────

def _frame_acceptance(frames):
    """Validate original observations before interpolation, angles or smoothing."""
    status, previous_height = [], None
    for i, frame in enumerate(frames):
        shoulder, hip, ankle = (_mid(frame, 'LEFT_' + name, 'RIGHT_' + name)[1]
                                for name in ('SHOULDER', 'HIP', 'ANKLE'))
        height = ankle - shoulder
        reason = None
        if not all(math.isfinite(v) for name in REQUIRED for v in frame[name]):
            reason = '좌표 또는 신뢰도가 유한수가 아닙니다.'
        elif all(frame[name][3] <= 0 for name in REQUIRED):
            reason = '인물 미검출로 채운 프레임은 측정 관측이 아닙니다.'
        elif not all(0 < y < 1 for y in (shoulder, hip, ankle)):
            reason = '어깨·골반·발목이 화면 범위를 벗어났습니다.'
        elif height <= 0.05 or math.isclose(height, 0.05, abs_tol=1e-12):
            reason = '발목이 어깨보다 충분히 아래에 있지 않습니다.'
        elif not shoulder < hip < ankle:
            reason = '골반이 어깨와 발목 사이에 있지 않습니다.'
        elif previous_height is not None and (abs(height / previous_height - 1) >= 0.40
                or math.isclose(abs(height / previous_height - 1), 0.40, abs_tol=1e-12)):
            reason = '인물 높이가 직전 채택 프레임보다 40% 이상 급변했습니다.'
        if reason is None:
            previous_height = height
        status.append({'frame': i, 'accepted': reason is None, 'reason': reason})
    return status


def _unusable_track(fps, hold, status, reason, extra_meta=None):
    """Preserve the source timeline without inventing phases or measurements."""
    count = len(status)
    unavailable = CHANNELS[:-1]
    return {
        'schema': SCHEMA, 'channels': CHANNELS,
        'frame_status': status,
        'track': [[None] * len(unavailable) + [0.0] for _ in status],
        'events': {},
        'meta': {
            **(extra_meta or {}),
            'usable': False, 'unusable_reason': reason, 'guidance': GUIDANCE[reason],
            'accepted_frames': sum(item['accepted'] for item in status),
            'total_frames': count, 'fps': round(fps, 2), 'hold': hold,
            'dur': round((count - 1) / fps + hold, 3), 'samples': count,
            'source_frames': [0, count - 1], 'backswing_sign': None,
            'wrist_source': 'unavailable', 'camera_facing': 'unknown',
            'address_shoulder_width_ratio': None, 'unavailable': unavailable,
            'rotation_sign_source': 'unavailable', 'measured': [], 'modeled': [],
            'channel_confidence': {key: [None] * count for key in unavailable},
            'phase_frames': {}, 'phase_confidence': {},
        },
    }


def _address_frame(hands, top, fps, *, frame_numbers=None):
    """End of a low, quiet hand interval before the selected backswing top.

    Compare short intervals rather than a single low observation (which can be
    a tracking spike). Scale tolerances by this recording's hand excursion.
    """
    window = max(3, round(0.12 * fps))
    numbers = list(range(len(hands))) if frame_numbers is None else frame_numbers
    last = numbers[top] - math.ceil(0.30 * fps)
    intervals = []
    for end in range(window - 1, top):
        if numbers[end] > last or numbers[end] - numbers[end - window + 1] != window - 1:
            continue
        points = hands[end - window + 1:end + 1]
        height = sum(p[1] for p in points) / window
        motion = sum(math.dist(a, b) for a, b in zip(points, points[1:])) / (window - 1)
        intervals.append((end, height, motion))
    if not intervals:
        return None
    excursion = max(p[1] for p in hands[:top + 1]) - min(p[1] for p in hands[:top + 1])
    lowest = max(height for _, height, _ in intervals)
    low = [item for item in intervals if item[1] >= lowest - 0.05 * excursion]
    quiet = min(motion for _, _, motion in low)
    tolerance = max(quiet * 1.5, 0.01 * excursion / window)
    return max(end for end, _, motion in low if motion <= tolerance)


def _hand_speed_phases(hands, fps, frame_numbers=None):
    """Document's screen-space hand-speed segmentation; source time is preserved."""
    import statistics
    numbers=list(range(len(hands))) if frame_numbers is None else frame_numbers
    window=max(3,round(fps/12))
    if window%2==0:window+=1
    window=min(window,len(hands) if len(hands)%2 else len(hands)-1)
    half=window//2
    # Box smoothing uses the documented odd fps/12 window on hand positions.
    # Clamp the edge rather than invent coordinates outside the video.
    hands=[tuple(sum(hands[max(0,min(len(hands)-1,i+j))][k] for j in range(-half,half+1))/window for k in (0,1)) for i in range(len(hands))]
    smooth=[]
    for i in range(len(hands)):
        left=max(0,i-1);right=min(len(hands)-1,i+1)
        smooth.append(math.dist(hands[left],hands[right])*fps/(numbers[right]-numbers[left]))
    edge=math.ceil(fps*.07)
    for i,number in enumerate(numbers):
        if number-numbers[0]<edge or numbers[-1]-number<edge:smooth[i]=0
    ordered=sorted(smooth);q=.95*(len(ordered)-1);low=int(q);p95=ordered[low]+(ordered[min(low+1,len(ordered)-1)]-ordered[low])*(q-low)
    median=statistics.median(smooth);threshold=median+(p95-median)*.35
    active=[i for i,v in enumerate(smooth) if v>threshold]
    groups=[]
    for i in active:
        if not groups or numbers[i]-numbers[groups[-1][-1]]>fps*.25:groups.append([i])
        else:groups[-1].append(i)
    groups=[g for g in groups if numbers[g[-1]]-numbers[g[0]]>=fps*.12]
    if not groups:raise ValueError('손 속도에서 스윙 구간을 찾지 못했습니다.')
    group=max(groups,key=lambda g:max(p[1] for p in hands[g[0]:g[-1]+1])-min(p[1] for p in hands[g[0]:g[-1]+1]))
    start=min(range(len(numbers)),key=lambda i:abs(numbers[i]-(numbers[group[0]]-fps*.15)))
    finish=min(range(len(numbers)),key=lambda i:abs(numbers[i]-(numbers[group[-1]]+fps*.25)))
    top=min(range(start,finish+1),key=lambda i:hands[i][1])
    eligible=[i for i in range(top+1,finish+1) if numbers[i]>=numbers[top]+fps*.05]
    if not eligible:raise ValueError('탑 이후 하강 구간이 없습니다.')
    impact=max(eligible,key=lambda i:hands[i][1])
    if not start<top<impact<finish:raise ValueError('스윙 국면 순서를 확정할 수 없습니다.')
    target=(hands[top][1]+hands[impact][1])/2
    down=next((i for i in range(top+1,impact) if hands[i][1]>=target),None)
    if down is None:raise ValueError("손 높이의 절반을 지난 다운스윙을 찾지 못했습니다.")
    diagnostics=dict(window=window,threshold=threshold,edge_frames=edge,velocity_segments=[[numbers[g[0]],numbers[g[-1]]] for g in groups],impact_height_difference=abs(hands[impact][1]-hands[start][1]))
    return (start,top,down,impact,finish,1),diagnostics

def _swing_phases(sw, fps, *, relaxed=False, hands=None, frame_numbers=None, diagnostics=None):
    if hands is None:
        raise ValueError('국면 검출에는 관측한 손 좌표가 필요합니다.')
    phases, details = _hand_speed_phases(hands, fps, frame_numbers)
    if diagnostics is not None:diagnostics.update(details)
    return (*phases[:5], (1 if sw[phases[1]] >= sw[phases[0]] else -1) if sw else 1)


def build_track(frames: List[Dict], fps: float, hold: float = 0.30) -> Dict:
    """프레임별 랜드마크 dict 리스트 → 트랙 JSON.

    frames[i] 는 {landmark_name: (x, y, z, visibility), ...} 형태.
    반환값의 track 은 CHANNELS 순서의 리스트들이다.
    """
    diagnostics = dict(getattr(frames, 'extraction_meta', {}))
    source_world = getattr(frames, 'world_frames', [None] * len(frames))
    diagnostics['shoulder_width_max'] = None
    if len(frames) < 10:
        raise ValueError("프레임이 너무 적다: %d" % len(frames))
    if not math.isfinite(fps) or fps <= 0:
        raise ValueError("유효하지 않은 프레임 속도입니다.")
    for i, frame in enumerate(frames):
        missing = [name for name in REQUIRED if name not in frame]
        if missing:
            raise ValueError(f"프레임 {i} 필수 랜드마크 누락: {', '.join(missing)}")
    status = _frame_acceptance(frames)
    frame_numbers = [item['frame'] for item in status if item['accepted']]
    if len(frame_numbers) < len(frames) / 2:
        return _unusable_track(fps, hold, status,
                               'tracking_failed', diagnostics)
    # No rejected observation may become an interpolation anchor, a smoothing
    # input, a wrist estimate or a width maximum. Keep source indices separately.
    observed_hands = [_mid(frames[i], "LEFT_WRIST", "RIGHT_WRIST") for i in frame_numbers]
    frames = [frames[i] for i in frame_numbers]
    world = [source_world[i] for i in frame_numbers]
    index_wrist, wrist_anchors = _index_wrist(frames)
    try:
        frames, landmark_quality = _clean_landmarks(frames, fps, channel_quality=True)
    except ValueError:
        return _unusable_track(fps, hold, status, 'tracking_failed', diagnostics)
    raw = []
    for d in frames:
        sh = _mid(d, "LEFT_SHOULDER", "RIGHT_SHOULDER")
        hp = _mid(d, "LEFT_HIP", "RIGHT_HIP")
        hd = _mid(d, "LEFT_WRIST", "RIGHT_WRIST")
        raw.append({
            "sw": _screen_angle(hd[0] - sh[0], hd[1] - sh[1]),
            "faL": _screen_angle(d["LEFT_WRIST"][0] - d["LEFT_ELBOW"][0],
                                 d["LEFT_WRIST"][1] - d["LEFT_ELBOW"][1]),
            "shw": abs(d["LEFT_SHOULDER"][0] - d["RIGHT_SHOULDER"][0]),
            "hpw": abs(d["LEFT_HIP"][0] - d["RIGHT_HIP"][0]),
            "tlen": math.dist(sh, hp),
            "hx": hp[0],
            "kneeL": math.pi - _joint_angle(d, "LEFT_HIP", "LEFT_KNEE", "LEFT_ANKLE"),
            "kneeR": math.pi - _joint_angle(d, "RIGHT_HIP", "RIGHT_KNEE", "RIGHT_ANKLE"),
            "heelR": d["RIGHT_HEEL"][1] - d["RIGHT_FOOT_INDEX"][1],
        })

    sw = _smooth(_unwrap([r["sw"] for r in raw]))
    fa = _smooth(_unwrap([r["faL"] for r in raw]))
    shw = _smooth([r["shw"] for r in raw])
    hpw = _smooth([r["hpw"] for r in raw])
    tln = _smooth([r["tlen"] for r in raw])
    hx = _smooth([r["hx"] for r in raw])
    kl = _smooth([r["kneeL"] for r in raw])
    kr = _smooth([r["kneeR"] for r in raw])
    hr = _smooth([r["heelR"] for r in raw])

    shw_max, hpw_max, tln_max = max(shw), max(hpw), max(tln)
    diagnostics['shoulder_width_max'] = shw_max
    side=diagnostics.get('crop_box',{}).get('resized_side')
    diagnostics['shoulder_width_pixels']=shw_max*side if side else None
    if side and diagnostics['shoulder_width_pixels']<60:
        return _unusable_track(fps,hold,status,'too_far',diagnostics)
    if min(shw_max, hpw_max, tln_max) <= 0:
        return _unusable_track(fps, hold, status, 'tracking_failed', diagnostics)

    hands = observed_hands
    phase_diagnostics = {}
    try:
        start, top, down, impact, end, back = _swing_phases(
            sw, fps, hands=hands, frame_numbers=frame_numbers, diagnostics=phase_diagnostics)
    except ValueError:
        return _unusable_track(fps, hold, status,
                               'no_swing', diagnostics)

    base_sw, base_hx, base_heel = sw[start], hx[start], hr[start]
    width_ratio = shw[start] / shw_max
    camera_facing = 'front' if width_ratio >= .80 else 'oblique' if width_ratio >= .45 else 'down_the_line'
    torso, pelvis = world_rotations(world, start)
    unavailable = [key for key, values in [('torso', torso), ('hips', pelvis),
                   ('x_factor', [None if a is None or b is None else a-b for a,b in zip(torso,pelvis)])]
                   if not any(v is not None for v in values)]

    dependencies = {
        "swing": REQUIRED[:2] + REQUIRED[6:8], "torso": REQUIRED[:2], "hips": REQUIRED[2:4],
        "x_factor": REQUIRED[:4], "lean": REQUIRED[:4], "wrist": REQUIRED[4:8], "shiftX": REQUIRED[2:4],
        "kneeL": REQUIRED[2:3] + REQUIRED[8:9] + REQUIRED[10:11],
        "kneeR": REQUIRED[3:4] + REQUIRED[9:10] + REQUIRED[11:12],
        "heelR": REQUIRED[13:14] + REQUIRED[15:16],
    }
    channel_confidence = {key: [] for key in dependencies}
    base_lean = 0.40 * (1 - tln[start] / tln_max)
    base_wrist = -(fa[start] - sw[start])

    track = []
    for i in range(start, end + 1):
        s = (sw[i] - base_sw) * back            # 백스윙이 + 가 되도록 방향 정규화
        turn = None if torso[i] is None else round(torso[i], 6)
        hip = None if pelvis[i] is None else round(pelvis[i], 6)
        lean = 0.40 * (1 - tln[i] / tln_max) - base_lean + 0.26
        wrist = -(fa[i] - sw[i]) - base_wrist
        if index_wrist is not None:
            wrist = max(0, min(math.pi, index_wrist[i]))
        for key, names in dependencies.items():
            grade = sum(landmark_quality[name][i] for name in names) / len(names)
            if key in {'torso', 'hips', 'x_factor'}:
                if world[i] is None or (key == 'torso' and turn is None) or (key == 'hips' and hip is None) or (key == 'x_factor' and (turn is None or hip is None)):
                    channel_confidence[key].append(None)
                    continue
                grade = min(grade, min(world[i][name][3] for name in names))
            if key == "wrist" and index_wrist is not None and i not in wrist_anchors:
                grade = min(grade, 0.25)
            channel_confidence[key].append(None if key in unavailable else round(grade, 3))
        confidence = min(values[-1] for values in channel_confidence.values() if values[-1] is not None)
        track.append([
            round(s, 3),
            turn,
            hip,
            round(max(0.05, min(0.42, lean)), 3),
            round(wrist if index_wrist is not None else max(-0.35, min(1.70, wrist)), 3),
            round((hx[i] - base_hx) * -1.1 * back, 3),
            round(max(0.02, min(0.50, kl[i])), 3),
            round(max(0.02, min(0.50, kr[i])), 3),
            round(max(0.0, min(1.0, (base_heel - hr[i]) * 9)), 3),
            None if turn is None or hip is None else round(turn-hip, 6),
            confidence,
        ])

    source_start, source_end = frame_numbers[start], frame_numbers[end]
    phases = dict(zip(('address', 'top', 'down', 'impact', 'finish'),
                      (frame_numbers[i] for i in (start, top, down, impact, end))))
    # Restore gaps on the original timeline; rejected rows are explicitly null,
    # never a confident interpolation or a zero angle. The numeric row contract
    # stays compatible with the existing 9-channel viewer.
    observed = dict(zip(frame_numbers[start:end + 1], track))
    track = [observed.get(i, [None] * (len(CHANNELS)-1) + [0.0]) for i in range(source_start, source_end + 1)]
    for key, values in channel_confidence.items():
        observed_quality = dict(zip(frame_numbers[start:end + 1], values))
        channel_confidence[key] = [observed_quality.get(i) for i in range(source_start, source_end + 1)]
    n = len(track) - 1
    dur = n / fps
    events = {
        "address": 0.0,
        "top": (phases['top'] - source_start) / n,
        "down": (phases['down'] - source_start) / n,
        "impact": (phases['impact'] - source_start) / n,
        "finish": 1.0,
    }
    # hold(정지 구간)를 앞에 붙인 타임라인 기준으로 환산
    total = dur + hold
    events = {k: (hold + v * dur) / total for k, v in events.items()}

    return {
        "schema": SCHEMA,
        "channels": CHANNELS,
        "frame_status": status,
        "meta": {
            **diagnostics,
            "usable": True,
            "unusable_reason": None,
            "accepted_frames": len(frame_numbers),
            "total_frames": len(status),
            "fps": round(fps, 2),
            "hold": hold,
            "dur": round(total, 3),
            "samples": len(track),
            "source_frames": [source_start, source_end],
            "backswing_sign": back,
            "wrist_source": "index" if index_wrist is not None else "forearm",
            "camera_facing": camera_facing,
            "address_shoulder_width_ratio": round(width_ratio, 4),
            "unavailable": unavailable,
            "rotation_sign_source": "pose_world_landmarks",
            "rotation_model": "lite", "world_units": "meters",
            "channel_confidence": channel_confidence,
            "measured": [c for c in CHANNELS if c != "confidence" and c not in unavailable and (c != "wrist" or index_wrist is not None)],
            "modeled": [] if index_wrist is not None else ["wrist"],
            "phase_frames": phases,
            "phase_diagnostics": phase_diagnostics,
            "impact_verified": phase_diagnostics.get('impact_height_difference', 0) < .06,
            "main_phase_frames": {p:f for p,f in phases.items() if p!='impact' or phase_diagnostics.get('impact_height_difference',0)<.06},
            "phase_confidence": {
                phase: round(track[index][-1], 3)
                for phase, index in ((phase, frame - source_start) for phase, frame in phases.items())
            },
        },
        "events": {k: round(v, 4) for k, v in events.items()},
        "track": track,
    }


def world_rotations(world, address):
    """Unwrapped world yaw, relative to the measured address (radians)."""
    result = []
    for part in ('SHOULDER', 'HIP'):
        names = ['LEFT_'+part, 'RIGHT_'+part]
        angles, indices = [], []
        for i, frame in enumerate(world):
            if frame and all(name in frame and frame[name][3] >= .3 and all(map(math.isfinite,frame[name])) for name in names):
                left,right=(frame[name] for name in names)
                if math.hypot(right[0]-left[0],right[2]-left[2]) > 1e-9:
                    angles.append(math.atan2(right[2]-left[2],right[0]-left[0]));indices.append(i)
        values = [None]*len(world)
        if address in indices:
            unwrapped = _unwrap(angles)
            origin = unwrapped[indices.index(address)]
            for i,value in zip(indices,unwrapped):values[i]=value-origin
        result.append(values)
    return tuple(result)


# ── CSV 입력 ──────────────────────────────────────────────────────────

def load_csv(path: str):
    """긴 형식 CSV → (frames, fps)."""
    from video_pose import PoseFrames, LANDMARK_NAMES
    by_frame: Dict[int, Dict] = {}
    world = {}
    ts: Dict[int, float] = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            if row['landmark'] not in LANDMARK_NAMES:
                continue
            i = int(row["frame_idx"])
            by_frame.setdefault(i, {})[row["landmark"]] = (
                float(row["x"]), float(row["y"]),
                float(row.get("z") or 0.0), float(row.get("visibility") or 1.0),
            )
            if all(row.get(c) not in (None, '') for c in ('wx','wy','wz')):
                world.setdefault(i, {})[row['landmark']] = (
                    *[float(row[c]) for c in ('wx','wy','wz')], float(row.get('visibility') or 1))
            ts[i] = float(row["timestamp"])
    order = sorted(by_frame)
    span = ts[order[-1]] - ts[order[0]]
    fps = (len(order) - 1) / span if span > 0 else 30.0
    return PoseFrames([by_frame[i] for i in order], {}, [world.get(i) for i in order]), fps


def main() -> int:
    ap = argparse.ArgumentParser(description="MediaPipe 좌표 → 스윙 트랙 JSON")
    ap.add_argument("--csv", required=True, help="긴 형식 랜드마크 CSV")
    ap.add_argument("--out", required=True, help="출력 JSON 경로")
    ap.add_argument("--hold", type=float, default=0.30, help="앞에 붙일 정지 구간(초)")
    args = ap.parse_args()

    frames, fps = load_csv(args.csv)
    data = build_track(frames, fps, hold=args.hold)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))

    m, e = data["meta"], data["events"]
    print("fps %.1f · 표본 %d · 길이 %.2fs · 원본 프레임 %s"
          % (m["fps"], m["samples"], m["dur"], m["source_frames"]))
    print("이벤트(0~1): " + "  ".join("%s %.3f" % (k, v) for k, v in e.items()))
    print("저장: " + args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
