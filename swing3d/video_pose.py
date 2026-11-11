"""
video_pose.py — 영상에서 MediaPipe 랜드마크를 뽑아 swing_track 입력 형식으로 돌려준다.

swing_track.build_track() 이 기대하는 형식과 동일하다.
    frames[i] = {landmark_name: (x, y, z, visibility), ...}

모델은 저장소의 models/pose_landmarker_lite.task 에서 읽는다.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
MODEL_NAME = "pose_landmarker_lite.task"
MAX_SECONDS = 30.0

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
    raise ExtractionError(
        f"자세 모델이 없습니다. 저장소의 models/{MODEL_NAME} 파일을 복원하세요."
    )


def extract(video_path: str, *, evidence=False, progress=None):
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

        options = mp_vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_buffer=model.read_bytes()),
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
                if progress and index % 5 == 0:
                    progress("좌표 추출", min(85, round(85 * index / total)))
                rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result = landmarker.detect_for_video(mp_image, int(index / source_fps * 1000))
                if not result.pose_landmarks:
                    misses += 1
                    frames.append(None)
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

    if len(frames) - misses < 20:
        raise ExtractionError(
            f"사람을 안정적으로 찾지 못했습니다. 인식된 표본 {len(frames) - misses}개, 놓친 프레임 {misses}개. "
            "전신이 화면에 들어오고 밝은 영상으로 다시 시도해 주세요."
        )
    # Preserve original frame indices even when MediaPipe misses a person.
    timeline = [
        [[round(frame[name][0], 5), round(frame[name][1], 5), round(frame[name][3], 3)]
         for name in LANDMARK_NAMES] if frame else None
        for frame in frames
    ] if evidence else None
    previous = next(frame for frame in frames if frame)
    for index, frame in enumerate(frames):
        if frame is None:
            frames[index] = {name: (*point[:3], 0) for name, point in previous.items()}
        else:
            previous = frame
    return (frames, source_fps, timeline) if evidence else (frames, source_fps)


def person_box(points):
    """Return the visible body's bounds in normalized image coordinates."""
    if not points:
        return None
    body = [(x, y) for x, y, visibility in points if visibility >= 0.45 and 0 <= x <= 1 and 0 <= y <= 1]
    if len(body) < 8:
        return None
    xs, ys = zip(*body)
    return min(xs), min(ys), max(xs), max(ys)


def person_crops(timeline, phases):
    boxes = {i: box for i, points in enumerate(timeline) if (box := person_box(points))}
    if not boxes:
        return {phase: (0, 0, 1) for phase in phases}, (0, 0, 1)

    def crop(box, size):
        x0, y0, x1, y1 = box
        return (max(0, min(1 - size, (x0 + x1 - size) / 2)),
                max(0, min(1 - size, (y0 + y1 - size) / 2)), size)

    def size_for(box):
        x0, y0, x1, y1 = box
        return min(1, max(0.04, max(x1 - x0, y1 - y0) * 1.6))

    phase_boxes = {phase: boxes[min(boxes, key=lambda i: abs(i - frame))] for phase, frame in phases.items()}
    size = max(map(size_for, phase_boxes.values()))
    stills = {phase: crop(box, size) for phase, box in phase_boxes.items()}

    # A fixed crop across the swing keeps playback from panning and zooming on tracking noise.
    start, end = phases["address"], phases["finish"]
    swing = [box for index, box in boxes.items() if start <= index <= end] or list(phase_boxes.values())
    envelope = (min(box[0] for box in swing), min(box[1] for box in swing),
                max(box[2] for box in swing), max(box[3] for box in swing))
    return stills, crop(envelope, size_for(envelope))


def phase_jpegs(video_path, indices, crops):
    """Decode in order so every JPEG is from the exact original frame."""
    import cv2

    capture = cv2.VideoCapture(str(video_path))
    images = {}
    try:
        pending = set(indices.values())
        for index in range(max(pending) + 1):
            if not capture.grab():
                break
            if index in pending:
                ok, frame = capture.retrieve()
                if not ok:
                    break
                images[index] = frame
        if pending != images.keys():
            raise ExtractionError("국면 프레임을 읽을 수 없습니다. 영상을 MP4로 다시 저장해 주세요.")
        output = {}
        for phase, index in indices.items():
            frame = images[index]
            height, width = frame.shape[:2]
            x, y, size = crops[phase]
            crop_width, crop_height = max(1, round(size * width)), max(1, round(size * height))
            left = min(width - crop_width, round(x * width))
            top = min(height - crop_height, round(y * height))
            cropped = frame[top:top + crop_height, left:left + crop_width]
            ok, encoded = cv2.imencode(".jpg", cropped)
            if not ok:
                raise ExtractionError("국면 JPEG를 만들 수 없습니다. 영상을 다시 분석해 주세요.")
            output[phase] = encoded.tobytes()
        return output
    finally:
        capture.release()
