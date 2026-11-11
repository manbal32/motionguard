"""
video_pose.py — 영상에서 MediaPipe 랜드마크를 뽑아 swing_track 입력 형식으로 돌려준다.

swing_track.build_track() 이 기대하는 형식과 동일하다.
    frames[i] = {landmark_name: (x, y, z, visibility), ...}

모델 파일
--------
MediaPipe Pose Landmarker 모델(.task)이 필요하다. 기본 경로는 models/ 아래다.
없으면 한 번 내려받는다. 사내망에서 storage.googleapis.com 이 막히면 내려받기가
실패하므로, 그때는 다른 망에서 받은 파일을 models/ 에 직접 넣으면 된다.
실패 사유에 그 안내를 담아 올린다.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
MODEL_NAME = "pose_landmarker_lite.task"
MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
             "pose_landmarker_lite/float16/1/pose_landmarker_lite.task")

MAX_SECONDS = 30.0
TARGET_SAMPLES = 400          # 긴 영상도 이 수준으로 균일 샘플링한다

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


class ExtractionError(Exception):
    """사용자에게 그대로 보여줄 수 있는 실패 사유."""


def ensure_model() -> Path:
    path = MODEL_DIR / MODEL_NAME
    if path.is_file():
        return path
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    import urllib.error
    import urllib.request
    try:
        with urllib.request.urlopen(MODEL_URL, timeout=60) as source:
            data = source.read()
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise ExtractionError(
            "자세 인식 모델을 내려받지 못했습니다. 사내망에서 차단된 경우가 많습니다. "
            f"다른 망에서 {MODEL_URL} 을 받아 {path} 로 넣어주세요. 원인: {error}"
        ) from error
    temporary = path.with_suffix(".part")
    temporary.write_bytes(data)
    temporary.replace(path)
    return path


def extract(video_path: str) -> Tuple[List[Dict], float]:
    """영상 → (frames, fps). 실패하면 ExtractionError 를 올린다."""
    try:
        import cv2
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision
    except ImportError as error:
        raise ExtractionError(
            "영상 업로드에는 mediapipe 설치가 필요합니다. "
            "`py -3 -m pip install mediapipe` 로 설치한 뒤 다시 시도해 주세요. "
            "좌표 CSV 업로드는 설치 없이 그대로 쓸 수 있습니다."
        ) from error

    model = ensure_model()
    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        raise ExtractionError("영상을 열 수 없습니다. mp4 또는 mov 파일인지 확인해 주세요.")

    try:
        source_fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
        total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if source_fps <= 0 or total <= 0:
            raise ExtractionError("영상의 프레임 정보를 읽을 수 없습니다.")
        duration = total / source_fps
        if duration > MAX_SECONDS + 0.5:
            raise ExtractionError(
                f"영상이 {duration:.0f}초입니다. {MAX_SECONDS:.0f}초 이하로 잘라서 올려주세요."
            )

        # 균일 간격 샘플링. 원본이 느려도 빨라도 트랙 길이를 비슷하게 유지한다.
        stride = max(1, round(total / TARGET_SAMPLES))
        fps = source_fps / stride

        options = mp_vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(model)),
            running_mode=mp_vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_segmentation_masks=False,
        )

        frames: List[Dict] = []
        misses = 0
        with mp_vision.PoseLandmarker.create_from_options(options) as landmarker:
            index = 0
            while True:
                ok, image = capture.read()
                if not ok:
                    break
                if index % stride:
                    index += 1
                    continue
                rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result = landmarker.detect_for_video(mp_image, int(index / source_fps * 1000))
                if not result.pose_landmarks:
                    misses += 1
                    index += 1
                    continue
                landmarks = result.pose_landmarks[0]
                frames.append({
                    LANDMARK_NAMES[i]: (lm.x, lm.y, lm.z, getattr(lm, "visibility", 1.0))
                    for i, lm in enumerate(landmarks) if i < len(LANDMARK_NAMES)
                })
                index += 1
    finally:
        capture.release()

    if len(frames) < 20:
        raise ExtractionError(
            f"사람을 안정적으로 찾지 못했습니다. 인식된 표본 {len(frames)}개, 놓친 프레임 {misses}개. "
            "전신이 화면에 들어오고 밝은 영상으로 다시 시도해 주세요."
        )
    return frames, fps
