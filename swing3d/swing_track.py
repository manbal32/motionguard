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
- x, y 는 0~1 정규화 좌표(y 는 아래로 증가). z 는 쓰지 않는다.

측정 가능 / 불가능
-----------------
측정: 스윙각, 몸통회전, 골반회전, 전방기울기, 체중이동, 무릎굴곡, 뒤꿈치들림
불가: 손목 코킹(영상에 클럽이 없어 손-클럽 각도를 못 구함) → 뷰어에서 모델값으로 보정
불가: 깊이 방향 회전(단일 카메라 2D). 몸통/골반 회전은 폭 단축률에서 역산한 추정치다.
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
    "torso",    # 몸통 회전(rad). 어깨 폭 단축률에서 역산, 부호는 스윙 방향을 따름
    "hips",     # 골반 회전(rad)
    "lean",     # 전방 기울기(rad). 어깨-골반 거리 단축률에서 역산
    "wrist",    # 손목 힌지(rad). 전완 방향 − 스윙각. 클럽 미검출 시 ≈0
    "shiftX",   # 체중 이동. 골반 중심 x 변위(정규화)
    "kneeL",    # 왼무릎 굴곡(rad)
    "kneeR",    # 오른무릎 굴곡(rad)
    "heelR",    # 오른 뒤꿈치 들림 0~1
    "confidence",  # 원본 표본의 추적 신뢰도 0~1 (보간으로 높이지 않음)
]

SCHEMA = "motionguard.swingtrack/2"
TRACK_REVISION = 2
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


def _clean_landmarks(frames: List[Dict], fps: float):
    """Reject invalid observations before computing any angles."""
    # golf1 (64.31 fps): pooled displacement p95 is about 0.03, while wrist
    # glitches reach 0.13–0.31. Leave margin for the fast downswing, and scale
    # the 0.12/frame cutoff by frame interval for other recordings.
    step_limit = 0.12 * 64.31 / fps
    cleaned = [frame.copy() for frame in frames]
    confidence = [1.0] * len(frames)
    confidence_landmarks = set(REQUIRED[:8])
    shoulder_width = [abs(frame["LEFT_SHOULDER"][0] - frame["RIGHT_SHOULDER"][0])
                      for frame in frames]
    typical_width = sorted(shoulder_width)[len(frames) // 2]

    for name in REQUIRED:
        observations = [frame[name] for frame in frames]
        valid = [obs[3] >= 0.5 for obs in observations]
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
    return cleaned, confidence


def _smooth(values: Sequence[float]) -> List[float]:
    """Quadratic Savitzky–Golay, seven samples, with one-sided edge fits."""
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
            if any(point is None or point[3] < 0.5 or not all(map(math.isfinite, point)) for point in points):
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

def build_track(frames: List[Dict], fps: float, hold: float = 0.30) -> Dict:
    """프레임별 랜드마크 dict 리스트 → 트랙 JSON.

    frames[i] 는 {landmark_name: (x, y, z, visibility), ...} 형태.
    반환값의 track 은 CHANNELS 순서의 리스트들이다.
    """
    if len(frames) < 10:
        raise ValueError("프레임이 너무 적다: %d" % len(frames))
    if not math.isfinite(fps) or fps <= 0:
        raise ValueError("유효하지 않은 프레임 속도입니다.")
    for i, frame in enumerate(frames):
        missing = [name for name in REQUIRED if name not in frame]
        if missing:
            raise ValueError(f"프레임 {i} 필수 랜드마크 누락: {', '.join(missing)}")
    index_wrist, wrist_anchors = _index_wrist(frames)
    frames, confidence = _clean_landmarks(frames, fps)
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
    if min(shw_max, hpw_max, tln_max) <= 0:
        raise ValueError("랜드마크 폭이나 길이가 유효하지 않습니다.")

    # 이벤트 검출: 백스윙 탑 = 스윙각 절대값 최대, 임팩트 = 그 뒤 어드레스값 복귀
    top = max(range(len(sw)), key=lambda i: abs(sw[i] - sw[0]))
    back = 1 if sw[top] > sw[0] else -1

    start = 0
    for i in range(top, 0, -1):
        if abs(sw[i] - sw[0]) < 0.06:
            start = i
            break

    impact = top
    for i in range(top, len(sw)):
        if (sw[i] - sw[start]) * back <= 0:
            impact = i
            break
    end = min(len(sw) - 1, impact + int(0.65 * fps))

    base_sw, base_hx, base_heel = sw[start], hx[start], hr[start]
    base_turn = math.acos(max(-1.0, min(1.0, shw[start] / shw_max)))
    base_hip = math.acos(max(-1.0, min(1.0, hpw[start] / hpw_max)))
    base_lean = 0.40 * (1 - tln[start] / tln_max)
    base_wrist = -(fa[start] - sw[start])

    track = []
    for i in range(start, end + 1):
        s = (sw[i] - base_sw) * back            # 백스윙이 + 가 되도록 방향 정규화
        sign = 1.0 if s >= 0 else -1.0
        # 폭 단축률에서 역산한 회전량은 어드레스 기준값보다 작아질 수 있다.
        # 그대로 두면 sign 과 곱해져 몸통과 반대 방향으로 도는 값이 나오고,
        # 백스윙 탑에서 골반이 몸통을 상쇄해 몸이 안 도는 것처럼 보였다.
        turn = max(0.0, math.acos(max(-1.0, min(1.0, shw[i] / shw_max))) - base_turn)
        hip = max(0.0, math.acos(max(-1.0, min(1.0, hpw[i] / hpw_max))) - base_hip)
        lean = 0.40 * (1 - tln[i] / tln_max) - base_lean + 0.26
        wrist = -(fa[i] - sw[i]) - base_wrist
        if index_wrist is not None:
            wrist = max(0, min(math.pi, index_wrist[i]))
            if i not in wrist_anchors:
                confidence[i] = 0
        track.append([
            round(s, 3),
            round(turn * sign, 3),
            round(hip * sign * 0.85, 3),
            round(max(0.05, min(0.42, lean)), 3),
            round(wrist if index_wrist is not None else max(-0.35, min(1.70, wrist)), 3),
            round((hx[i] - base_hx) * -1.1 * back, 3),
            round(max(0.02, min(0.50, kl[i])), 3),
            round(max(0.02, min(0.50, kr[i])), 3),
            round(max(0.0, min(1.0, (base_heel - hr[i]) * 9)), 3),
            round(confidence[i], 3),
        ])

    n = len(track) - 1
    dur = n / fps
    events = {
        "address": 0.0,
        "top": (top - start) / n,
        "down": max(0.0, (impact - start - int(0.06 * fps))) / n,
        "impact": (impact - start) / n,
        "finish": 1.0,
    }
    # hold(정지 구간)를 앞에 붙인 타임라인 기준으로 환산
    total = dur + hold
    events = {k: (hold + v * dur) / total for k, v in events.items()}

    return {
        "schema": SCHEMA,
        "channels": CHANNELS,
        "meta": {
            "fps": round(fps, 2),
            "hold": hold,
            "dur": round(total, 3),
            "samples": len(track),
            "source_frames": [start, end],
            "backswing_sign": back,
            "wrist_source": "index" if index_wrist is not None else "forearm",
            "measured": [c for c in CHANNELS if c != "confidence" and (c != "wrist" or index_wrist is not None)],
            "modeled": [] if index_wrist is not None else ["wrist"],
            "phase_frames": {
                "address": start, "top": top,
                "down": max(start, impact - int(0.06 * fps)),
                "impact": impact, "finish": end,
            },
            "phase_confidence": {
                phase: round(track[index][-1], 3)
                for phase, index in {
                    "address": 0, "top": top - start,
                    "down": max(0, impact - start - int(0.06 * fps)),
                    "impact": impact - start, "finish": len(track) - 1,
                }.items()
            },
        },
        "events": {k: round(v, 4) for k, v in events.items()},
        "track": track,
    }


# ── CSV 입력 ──────────────────────────────────────────────────────────

def load_csv(path: str):
    """긴 형식 CSV → (frames, fps)."""
    by_frame: Dict[int, Dict] = {}
    ts: Dict[int, float] = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            i = int(row["frame_idx"])
            by_frame.setdefault(i, {})[row["landmark"]] = (
                float(row["x"]), float(row["y"]),
                float(row.get("z") or 0.0), float(row.get("visibility") or 1.0),
            )
            ts[i] = float(row["timestamp"])
    order = sorted(by_frame)
    span = ts[order[-1]] - ts[order[0]]
    fps = (len(order) - 1) / span if span > 0 else 30.0
    return [by_frame[i] for i in order], fps


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
