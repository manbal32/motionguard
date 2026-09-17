"""
MotionGuard — PoseAnalyzer
MediaPipe Tasks API 기반 포즈 추정

작성자: 동원
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
import numpy as np
from .joint_angles import calculate_joint_angles, measurement_issues


@dataclass
class Landmark:
    x: float
    y: float
    z: float = 0.0
    visibility: float = 1.0


@dataclass
class PoseResult:
    is_detected: bool = False
    landmarks: Optional[Dict[str, Landmark]] = None
    confidence: float = 0.0
    angles: Optional[Dict[str, float]] = None
    measurement_issues: Dict[str, str] = field(default_factory=dict)
    annotated_image: Optional[Any] = None
    angle_confidence: Dict[str, float] = field(default_factory=dict)
    angle_sources: Dict[str, Any] = field(default_factory=dict)


LANDMARK_NAMES = [
    "NOSE", "LEFT_EYE_INNER", "LEFT_EYE", "LEFT_EYE_OUTER",
    "RIGHT_EYE_INNER", "RIGHT_EYE", "RIGHT_EYE_OUTER",
    "LEFT_EAR", "RIGHT_EAR", "MOUTH_LEFT", "MOUTH_RIGHT",
    "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_ELBOW", "RIGHT_ELBOW",
    "LEFT_WRIST", "RIGHT_WRIST", "LEFT_PINKY", "RIGHT_PINKY",
    "LEFT_INDEX", "RIGHT_INDEX", "LEFT_THUMB", "RIGHT_THUMB",
    "LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE",
    "LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_HEEL", "RIGHT_HEEL",
    "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX",
]


class PoseAnalyzer:
    def __init__(self, sport: str = "golf"):
        self.sport    = sport
        self._model   = None
        self._mp      = None
        self._drawing = None
        self._pose    = None
        self._init_mediapipe()

    def _init_mediapipe(self):
        try:
            import mediapipe as mp

            # Tasks API 시도
            try:
                from mediapipe.tasks import python as mp_tasks
                from mediapipe.tasks.python import vision as mp_vision
                import urllib.request
                import os

                from pathlib import Path
                model_path = str(Path(__file__).resolve().parent.parent / 'models' / 'pose_landmarker.task')
                os.makedirs(os.path.dirname(model_path), exist_ok=True)

                if not os.path.exists(model_path):
                    print("[PoseAnalyzer] 모델 다운로드 중...")
                    url = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
                    urllib.request.urlretrieve(url, model_path)

                base_opts = mp_tasks.BaseOptions(model_asset_buffer=Path(model_path).read_bytes())
                opts = mp_vision.PoseLandmarkerOptions(
                    base_options=base_opts,
                    output_segmentation_masks=False,
                    num_poses=1,
                    min_pose_detection_confidence=0.5,
                    min_pose_presence_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
                self._model = mp_vision.PoseLandmarker.create_from_options(opts)
                self._mp    = mp
                self._mode  = "tasks"
                print("[PoseAnalyzer] Tasks API 초기화 완료")

            except Exception as exc:
                if not hasattr(mp, "solutions"):
                    raise RuntimeError("자세 인식 모델 초기화 실패. models/pose_landmarker.task 파일과 네트워크를 확인하세요.") from exc
                # Legacy API 폴백
                self._pose    = mp.solutions.pose.Pose(
                    static_image_mode=False,
                    model_complexity=1,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
                self._drawing = mp.solutions.drawing_utils
                self._mp      = mp
                self._mode    = "legacy"
                print("[PoseAnalyzer] Legacy API 초기화 완료")

        except ImportError:
            self._mode = "none"
            print("[PoseAnalyzer] MediaPipe 없음 — Mock 모드")

    def analyze_frames(self, frames) -> List[PoseResult]:
        print(f"[PoseAnalyzer] {len(frames)}개 프레임 분석 시작...")
        results = []
        for i, frame in enumerate(frames):
            result = self._analyze_one(frame)
            results.append(result)
            if (i+1) % 20 == 0 or (i+1) == len(frames):
                detected = sum(1 for r in results if r.is_detected)
                print(f"  진행: {i+1}/{len(frames)} | 감지율: {detected/(i+1)*100:.1f}%")
        print(f"[PoseAnalyzer] 완료! {sum(1 for r in results if r.is_detected)}/{len(frames)} 감지")
        return results

    def _analyze_one(self, frame_data) -> PoseResult:
        import cv2

        if self._mode == "none":
            return PoseResult(is_detected=False, confidence=0.0, measurement_issues={"pose": "포즈 미검출"})

        img = frame_data.image_bgr
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        try:
            if self._mode == "tasks":
                result = self._analyze_tasks(img, rgb)
            else:
                result = self._analyze_legacy(img, rgb)
            if result.is_detected:
                result.measurement_issues = measurement_issues(result.landmarks, result.angles or {})
            return result
        except Exception as e:
            return PoseResult(is_detected=False, confidence=0.0, measurement_issues={"pose": f"포즈 처리 오류: {type(e).__name__}: {e}"})

    def _analyze_tasks(self, img_bgr, img_rgb) -> PoseResult:
        import mediapipe as mp

        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=img_rgb,
        )
        detection = self._model.detect(mp_image)

        if not detection.pose_landmarks:
            return PoseResult(is_detected=False, confidence=0.0, measurement_issues={"pose": "포즈 미검출"})

        raw_lms = detection.pose_landmarks[0]
        landmarks = {}
        vis_sum   = 0.0

        for i, lm in enumerate(raw_lms):
            if i < len(LANDMARK_NAMES):
                name = LANDMARK_NAMES[i]
                landmarks[name] = Landmark(x=lm.x, y=lm.y, z=lm.z, visibility=lm.visibility)
                vis_sum += lm.visibility

        confidence = vis_sum / max(len(raw_lms), 1)

        annotated = img_bgr.copy()
        try:
            # 오버레이
            import copy
            annotated = copy.deepcopy(img_bgr)
            import cv2
            from mediapipe.tasks.python.vision import PoseLandmarksConnections
            height, width = annotated.shape[:2]
            for connection in PoseLandmarksConnections.POSE_LANDMARKS:
                a, b = raw_lms[connection.start], raw_lms[connection.end]
                if a.visibility > 0.5 and b.visibility > 0.5:
                    cv2.line(annotated, (int(a.x * width), int(a.y * height)),
                             (int(b.x * width), int(b.y * height)), (0, 220, 0), 2)
            for lm in raw_lms:
                if lm.visibility > 0.5:
                    cv2.circle(annotated, (int(lm.x * width), int(lm.y * height)), 3, (0, 0, 255), -1)
    
        except Exception:
            annotated = img_bgr.copy()

        return PoseResult(
            is_detected=True,
            landmarks=landmarks,
            confidence=float(confidence),
            annotated_image=annotated,
            angles=calculate_joint_angles(landmarks, img_bgr.shape),
        )

    def _analyze_legacy(self, img_bgr, img_rgb) -> PoseResult:
        import copy
        result = self._pose.process(img_rgb)

        if not result.pose_landmarks:
            return PoseResult(is_detected=False, confidence=0.0, measurement_issues={"pose": "포즈 미검출"})

        landmarks = {}
        vis_sum   = 0.0
        for i, lm in enumerate(result.pose_landmarks.landmark):
            if i < len(LANDMARK_NAMES):
                name = LANDMARK_NAMES[i]
                landmarks[name] = Landmark(x=lm.x, y=lm.y, z=lm.z, visibility=lm.visibility)
                vis_sum += lm.visibility

        confidence = vis_sum / 33

        annotated = copy.deepcopy(img_bgr)
        self._drawing.draw_landmarks(
            annotated,
            result.pose_landmarks,
            self._mp.solutions.pose.POSE_CONNECTIONS,
        )

        return PoseResult(
            is_detected=True,
            landmarks=landmarks,
            confidence=float(confidence),
            annotated_image=annotated,
            angles=calculate_joint_angles(landmarks, img_bgr.shape),
        )

    def close(self):
        try:
            if self._model:
                self._model.close()
            if self._pose:
                self._pose.close()
            print("[PoseAnalyzer] 리소스 해제 완료")
        except Exception:
            pass
