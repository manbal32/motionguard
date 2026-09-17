"""
MotionGuard — FrameSelector v5.3
하강 구간 패턴 기반 골프 이벤트 감지

로직:
1. 어드레스 = frame 0
2. 백스윙탑 = 첫 번째 큰 하강 구간 + 이후 20프레임 안 최솟값
3. 다운스윙 = 백스윙탑 이후 vy 양수 전환 첫 순간
4. 임팩트   = acc > 0.02 AND wrist_y >= addr_y - 0.08 동시 만족 첫 순간
5. 피니시   = 임팩트 이후 두 번째 하강 구간 최솟값

작성자: 동원
버전: v5.3
"""

import sys
import cv2
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from modules.video_loader import FrameData
from modules.pose_analyzer import PoseAnalyzer, PoseResult


@dataclass
class KeyFrame:
    frame_data: FrameData
    pose_result: PoseResult
    phase_label: str
    event_type: str
    timestamp: float = 0.0
    confidence: float = 0.0
    debug: dict = None

    @property
    def frame_idx(self):
        return self.frame_data.frame_idx

    @property
    def image_bgr(self):
        if self.pose_result.annotated_image is not None:
            return self.pose_result.annotated_image
        return self.frame_data.image_bgr

    @property
    def angles(self):
        return self.pose_result.angles or {}


def _load_all_frames(video_path):
    cap    = cv2.VideoCapture(video_path)
    fps    = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames = []
    idx    = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(FrameData(frame_idx=idx, timestamp=idx/fps, image_bgr=frame))
        idx += 1
    cap.release()
    return frames, fps

def _get_wrist_y(pose):
    if not pose.landmarks:
        return None
    lm = pose.landmarks
    wy = lm.get("RIGHT_WRIST")
    ly = lm.get("LEFT_WRIST")
    if wy and ly: return (wy.y + ly.y) / 2
    if wy: return wy.y
    if ly: return ly.y
    return None

def _fill_none(values, fallback=0.5):
    result = list(values)
    for i, v in enumerate(result):
        if v is not None:
            continue
        prev = next((result[j] for j in range(i-1,-1,-1) if result[j] is not None), None)
        nxt  = next((result[j] for j in range(i+1,len(result)) if result[j] is not None), None)
        result[i] = ((prev or fallback) + (nxt or fallback)) / 2
    return [float(v) for v in result]

def _smooth(values, window=7):
    half = window // 2
    out = []
    for i in range(len(values)):
        s = max(0, i-half)
        e = min(len(values), i+half+1)
        out.append(float(np.mean(values[s:e])))
    return out

def _velocity(values):
    v = [0.0]
    for i in range(1, len(values)):
        v.append(values[i] - values[i-1])
    return v

def _safe_range(start, end, n):
    start = max(0, min(start, n-1))
    end   = max(start+1, min(end, n))
    return range(start, end)

def _find_descent_zones(ys, addr_y, min_drop=0.08, min_below=0.10):
    n     = len(ys)
    zones = []
    zone_start = None
    for i in range(1, n):
        if ys[i] < ys[i-1]:
            if zone_start is None:
                zone_start = i-1
        else:
            if zone_start is not None:
                zone_end = i-1
                drop     = ys[zone_start] - ys[zone_end]
                end_y    = ys[zone_end]
                if drop > min_drop and end_y < addr_y - min_below:
                    zones.append({
                        'start':   zone_start,
                        'end':     zone_end,
                        'start_y': ys[zone_start],
                        'end_y':   end_y,
                        'drop':    drop,
                    })
                zone_start = None
    return zones

def _best_conf_near(frames, poses, idx, window=3, used=None, min_gap=5):
    idx = max(0, min(idx, len(frames)-1))
    if used is None:
        used = set()
    start = max(0, idx-window)
    end   = min(len(frames), idx+window+1)
    candidates = []
    for i in range(start, end):
        if any(abs(i-u) < min_gap for u in used):
            continue
        conf = float(getattr(poses[i], "confidence", 0.0) or 0.0)
        candidates.append((conf - abs(i-idx)*0.01, i))
    if not candidates:
        return frames[idx], poses[idx], idx
    candidates.sort(reverse=True)
    bi = candidates[0][1]
    return frames[bi], poses[bi], bi


class FrameSelector:

    GOLF_PHASES = [
        ("address",       "어드레스"),
        ("backswing_top", "백스윙 탑"),
        ("downswing",     "다운스윙"),
        ("impact",        "임팩트"),
        ("finish",        "피니시"),
    ]

    def __init__(self, sport="golf"):
        self.sport     = sport
        self._analyzer = None
        print(f"[FrameSelector v5.3] 초기화 | 종목: {sport}")

    def select_from_video(self, video_path):
        print(f"\n[v5.3] 원본 프레임 로드: {video_path}")
        frames, fps = _load_all_frames(video_path)
        n = len(frames)
        print(f"  총 {n}프레임 | FPS={fps:.1f}")
        if self._analyzer is None:
            self._analyzer = PoseAnalyzer(sport=self.sport)
        print(f"  포즈 분석 중...")
        poses = self._analyzer.analyze_frames(frames)
        return self._detect_events(frames, poses, fps)

    def select(self, frames, pose_results):
        fps = 30.0
        if len(frames) > 1 and frames[1].timestamp > 0:
            fps = 1.0 / frames[1].timestamp
        return self._detect_events(frames, pose_results, fps)

    def _detect_events(self, frames, poses, fps):
        n = len(frames)
        if n < 5:
            raise ValueError('분석하려면 최소 5프레임 이상의 영상이 필요합니다.')
        if len(poses) != n:
            raise ValueError('영상 프레임과 자세 데이터의 개수가 다릅니다.')
        print(f"\n[v5.3] {n}프레임 골프 5단계 감지...")

        raw_wy    = _fill_none([_get_wrist_y(p) for p in poses])
        wrist_y_s = _smooth(raw_wy, window=7)
        wrist_y_r = _smooth(raw_wy, window=3)
        vy        = _velocity(wrist_y_r)
        acc       = _velocity(vy)
        timestamps = [float(getattr(f, "timestamp", i/fps)) for i, f in enumerate(frames)]

        addr_y = float(np.mean(wrist_y_r[:min(20, n)]))
        print(f"  addr_y = {addr_y:.3f}")

        # ── 1. 어드레스 ───────────────────────────────
        address_idx = 0

        # ── 2. 백스윙 탑 ─────────────────────────────
        # 첫 번째 큰 하강 구간 + 이후 20프레임 안 최솟값
        zones = _find_descent_zones(wrist_y_s, addr_y, min_drop=0.08, min_below=0.10)

        if zones:
            fz           = zones[0]
            search_start = fz['start']
            search_end   = min(fz['end'] + 20, n)
            backswing_idx = search_start + int(np.argmin(wrist_y_r[search_start:search_end]))
            print(f"  [백스윙탑] 하강구간 f{fz['start']}~{fz['end']} "
                  f"(drop={fz['drop']:.3f}) → f{backswing_idx} | y={wrist_y_r[backswing_idx]:.3f}")
        else:
            bt_s = int(n * 0.40)
            bt_e = int(n * 0.65)
            backswing_idx = bt_s + int(np.argmin(wrist_y_r[bt_s:bt_e]))
            print(f"  [백스윙탑] 폴백 | f{backswing_idx}")

        # ── 3. 다운스윙 — 임팩트 확정 후 역산 ──────
        # 임팩트 확정 후 아래에서 계산 (임팩트 - 4프레임)
        downswing_idx = 0  # 임팩트 확정 후 업데이트

        # ── 4. 임팩트 ─────────────────────────────────
        # 조건: acc > 0.02 AND wrist_y >= addr_y - 0.08
        # 첫 번째 만족이 아니라 초반 6개 후보 중 acc 최대 선택
        # 이유: golf3처럼 1프레임 앞서 조건 만족하는 경우 대응
        imp_start = backswing_idx + 5
        imp_end   = min(backswing_idx + 45, n)

        imp_candidates = [
            i for i in _safe_range(imp_start, imp_end, n)
            if acc[i] > 0.02 and wrist_y_r[i] >= (addr_y - 0.08)
        ]

        if imp_candidates:
            impact_idx = max(imp_candidates[:6], key=lambda i: acc[i])
            # 데이터 근거: 실제 임팩트는 acc 최대 직후 1프레임
            impact_idx = min(impact_idx + 1, n - 1)
        else:
            impact_idx = min(
                _safe_range(imp_start, imp_end, n),
                key=lambda i: abs(wrist_y_r[i] - addr_y)
            )

        print(f"  [임팩트] f{impact_idx} | y={wrist_y_r[impact_idx]:.3f} | "
              f"v={vy[impact_idx]:+.4f} | acc={acc[impact_idx]:+.4f}")

        # ── 3-1. 다운스윙 — 임팩트 - 4프레임 ────────
        downswing_idx = min(n - 1, max(impact_idx - 4, backswing_idx + 1))
        print(f"  [다운스윙] f{downswing_idx} | y={wrist_y_r[downswing_idx]:.3f}")

        # ── 5. 피니시 ─────────────────────────────────
        fin_start = min(impact_idx + 10, n - 1)
        fin_zones = _find_descent_zones(
            wrist_y_s[fin_start:], addr_y, min_drop=0.05, min_below=0.10
        )
        if fin_zones:
            fz2 = fin_zones[0]
            fz2_s = fin_start + fz2['start']
            fz2_e = min(fin_start + fz2['end'] + 10, n)
            finish_idx = fz2_s + int(np.argmin(wrist_y_r[fz2_s:fz2_e]))
        else:
            finish_idx = fin_start + int(np.argmin(wrist_y_r[fin_start:n]))
        print(f"  [피니시] f{finish_idx} | y={wrist_y_r[finish_idx]:.3f}")

        event_indices = {
            "address":       address_idx,
            "backswing_top": backswing_idx,
            "downswing":     downswing_idx,
            "impact":        impact_idx,
            "finish":        finish_idx,
        }

        print(f"\n  {'단계':8s} | {'frame':>6s} | {'시간':>6s} | {'손목y':>6s} | {'변화율':>8s}")
        print(f"  {'-'*50}")
        for key, idx in event_indices.items():
            label = dict(self.GOLF_PHASES)[key]
            print(f"  {label:8s} | {idx:6d} | {timestamps[idx]:5.2f}s | "
                  f"{wrist_y_r[idx]:6.3f} | {vy[idx]:+8.4f}")

        selected = []
        used = set()
        for event_type, phase_label in self.GOLF_PHASES:
            raw_idx = event_indices[event_type]
            # 임팩트는 정확한 프레임 유지 (window=0)
            w = 0  # Preserve detected event time; recover angle observations separately.
            frame, pose, best_idx = _best_conf_near(
                frames, poses, raw_idx, window=w, used=used, min_gap=5)
            used.add(best_idx)
            selected.append(KeyFrame(
                frame_data=frame,
                pose_result=pose,
                phase_label=phase_label,
                event_type=event_type,
                timestamp=float(frame.timestamp),
                confidence=float(getattr(pose, "confidence", 0.0) or 0.0),
                debug={
                    "raw_idx":    raw_idx,
                    "best_idx":   best_idx,
                    "wrist_y":    round(wrist_y_r[raw_idx], 4),
                    "wrist_v":    round(vy[raw_idx], 4),
                    "addr_y_ref": round(addr_y, 4),
                },
            ))

        print(f"\n[v5.3] 선택 완료: {len(selected)}장")
        return selected

    def close(self):
        if self._analyzer:
            try:
                self._analyzer.close()
            except Exception:
                pass

    def get_analysis_confidence(self, key_frames):
        if not key_frames:
            return {"overall": 0.0, "level": "낮음", "warning": "분석 불가"}
        scores  = [float(kf.confidence) for kf in key_frames]
        overall = float(np.mean(scores))
        if overall >= 0.7:   level, warning = "높음", None
        elif overall >= 0.4: level, warning = "보통", "일부 추정값 포함 가능"
        else:                level, warning = "낮음", "신뢰도 낮음"
        return {"overall": round(overall, 3), "level": level, "warning": warning}
