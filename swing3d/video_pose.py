"""
video_pose.py — 영상에서 MediaPipe 랜드마크를 뽑아 swing_track 입력 형식으로 돌려준다.

swing_track.build_track() 이 기대하는 형식과 동일하다.
    frames[i] = {landmark_name: (x, y, z, visibility), ...}

모델은 저장소의 models/pose_landmarker_lite.task 에서 읽는다.
"""

from __future__ import annotations

from pathlib import Path
import math
import time
from typing import Dict, List

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
MODEL_NAME = "pose_landmarker_lite.task"
MAX_SECONDS = 30.0

# MediaPipe returns 33 internally; application data starts at the shoulders.
BODY_INDICES = tuple(range(11, 33))
LANDMARK_NAMES = [
    "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_ELBOW", "RIGHT_ELBOW",
    "LEFT_WRIST", "RIGHT_WRIST", "LEFT_PINKY", "RIGHT_PINKY",
    "LEFT_INDEX", "RIGHT_INDEX", "LEFT_THUMB", "RIGHT_THUMB",
    "LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE",
    "LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_HEEL", "RIGHT_HEEL",
    "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX",
]

class WorldObservations(dict):
    def __init__(self):
        super().__init__()
        self.world = {}



class ExtractionError(Exception):
    """사용자에게 그대로 보여줄 수 있는 실패 사유."""


def ensure_model() -> Path:
    path = MODEL_DIR / MODEL_NAME
    if path.is_file():
        return path
    raise ExtractionError(
        f"자세 모델이 없습니다. 저장소의 models/{MODEL_NAME} 파일을 복원하세요."
    )


class PoseFrames(list):
    """Crop-space observations with extraction provenance for build_track.

    The optional evidence timeline is in original-image coordinates instead.
    A list subclass preserves the existing extract(... )[:2] calling contract.
    """
    def __init__(self, frames, extraction_meta, world_frames=None):
        super().__init__(frames)
        self.extraction_meta = extraction_meta
        self.world_frames = world_frames or [None] * len(frames)


def crop_to_original(point, box):
    """Map a crop-normalized landmark to original normalized x/y and z."""
    x, y, z, visibility = point
    return (box['x'] + x * box['w'], box['y'] + y * box['h'],
            z * box['w'], visibility)


def original_to_crop(point, box):
    x, y, z, visibility = point
    return ((x - box['x']) / box['w'], (y - box['y']) / box['h'],
            z / box['w'], visibility)


def box_envelope(boxes):
    """One fixed envelope shared by extraction and still/playback crops."""
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def extraction_crop(observations, width, height):
    """Square in physical pixels, with 25% padding on each side."""
    import swing_track

    ordered = sorted(observations)
    status = swing_track._frame_acceptance([observations[i] for i in ordered])
    valid = [i for i, item in zip(ordered, status) if item['accepted']]
    boxes = [box for i in valid if (box := person_box([
        (p[0], p[1], p[3]) for p in observations[i].values()]))]
    if not boxes:
        raise ExtractionError('1패스에서 해부학적으로 유효한 인물을 찾지 못해 크롭할 수 없습니다.')
    x0, y0, x1, y1 = box_envelope(boxes)
    desired = math.ceil(max((x1 - x0) * width, (y1 - y0) * height) * 1.5)
    side = max(1, min(width, height, desired))
    desired_left = round((x0 + x1) * width / 2 - side / 2)
    desired_top = round((y0 + y1) * height / 2 - side / 2)
    left = max(0, min(width - side, desired_left))
    top = max(0, min(height - side, desired_top))
    return {
        'x': left / width, 'y': top / height, 'w': side / width, 'h': side / height,
        'pixels': [left, top, side, side], 'source_size': [width, height],
        'resized_side': max(640, side), 'padding_per_side': 0.25,
        'boundary_limited': side < desired or left != desired_left or top != desired_top,
        'inverse_transform': {'function': 'video_pose.crop_to_original',
                              'x': 'box.x + x_crop * box.w',
                              'y': 'box.y + y_crop * box.h', 'z': 'z_crop * box.w'},
    }, valid


def _detect_pass(capture, options, source_fps, *, stride=1, box=None, progress=None, total=1):
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import vision as mp_vision

    observations = WorldObservations()
    with mp_vision.PoseLandmarker.create_from_options(options) as landmarker:
        index = 0
        while capture.grab():
            if index % stride:
                index += 1
                continue
            ok, image = capture.retrieve()
            if not ok:
                raise ExtractionError('영상 프레임을 읽을 수 없습니다.')
            if box is not None:
                left, top, w, h = box['pixels']
                image = image[top:top + h, left:left + w]
                side = box['resized_side']
                image = cv2.resize(image, (side, side), interpolation=cv2.INTER_LINEAR)
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            result = landmarker.detect_for_video(
                mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb),
                int(index / source_fps * 1000))
            if result.pose_landmarks:
                observations[index] = {
                    name: (lm.x, lm.y, lm.z, getattr(lm, 'visibility', 1.0))
                    for name, i in zip(LANDMARK_NAMES, BODY_INDICES)
                    for lm in [result.pose_landmarks[0][i]]
                }
                if result.pose_world_landmarks:
                    observations.world[index] = {
                        name: (lm.x, lm.y, lm.z, getattr(lm, 'visibility', 1.0))
                        for name, i in zip(LANDMARK_NAMES, BODY_INDICES)
                        for lm in [result.pose_world_landmarks[0][i]]
                    }
            if progress and index % (5 * stride) == 0:
                progress('인물 찾기' if box is None else '크롭 자세 추출',
                         min(85, round((20 if box is None else 65) * index / total)
                             + (0 if box is None else 20)))
            index += 1
    return observations, index


def extract(video_path: str, *, evidence=False, progress=None):
    """Sparse full-image localization, then full-rate square-crop measurement."""
    started = time.perf_counter()
    try:
        import cv2
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision
    except ImportError as error:
        raise ExtractionError('영상 업로드에는 mediapipe 설치가 필요합니다. '
                              '`python3 -m pip install mediapipe`로 설치해 주세요.') from error
    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        raise ExtractionError('영상을 열 수 없습니다. mp4 또는 mov 파일인지 확인해 주세요.')
    try:
        fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
        total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width, height = (int(capture.get(p)) for p in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT))
        if fps <= 0 or total <= 0 or min(width, height) <= 0:
            raise ExtractionError('영상의 프레임 정보를 읽을 수 없습니다.')
        if total / fps > MAX_SECONDS + 0.5:
            raise ExtractionError(f'영상이 {total / fps:.0f}초입니다. {MAX_SECONDS:.0f}초 이하로 잘라서 올려주세요.')
        options = mp_vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_buffer=ensure_model().read_bytes()),
            running_mode=mp_vision.RunningMode.VIDEO, num_poses=1,
            min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5, output_segmentation_masks=False)
        first, decoded = _detect_pass(capture, options, fps, stride=3, progress=progress, total=total)
        if decoded != total:
            raise ExtractionError('원본 영상의 프레임 수와 읽은 프레임 수가 다릅니다.')
        box, first_valid = extraction_crop(first, width, height)
    finally:
        capture.release()
    capture = cv2.VideoCapture(video_path)
    try:
        second, decoded = _detect_pass(capture, options, fps, box=box, progress=progress, total=total)
    finally:
        capture.release()
    if decoded != total:
        raise ExtractionError('2패스의 프레임 수가 원본과 다릅니다.')
    if len(second) < 20:
        raise ExtractionError(f'크롭 영상에서 사람을 안정적으로 찾지 못했습니다. 인식된 표본 {len(second)}개.')
    # Missing observations retain the source frame number and zero visibility.
    previous = second[min(second)]
    frames, timeline = [], [] if evidence else None
    for i in range(total):
        observed = second.get(i)
        if observed is not None:
            previous = observed
        frames.append(observed if observed is not None else {
            name: (*p[:3], 0.0) for name, p in previous.items()})
        if evidence:
            original = {name: crop_to_original(p, box) for name, p in observed.items()} if observed else None
            timeline.append([[round(original[name][0], 5), round(original[name][1], 5),
                              round(original[name][3], 3)] for name in LANDMARK_NAMES] if original else None)
    # Cross-pass agreement is a diagnostic, not an identity: the two inferences
    # may disagree. Never use first-pass landmarks as measurement replacements.
    errors = []
    for i in first_valid:
        if i in second:
            def midpoint(d):
                return tuple((d['LEFT_SHOULDER'][j] + d['RIGHT_SHOULDER'][j]) / 2 for j in (0, 1))
            original = {name: crop_to_original(p, box) for name, p in second[i].items()}
            errors.append(math.dist(midpoint(first[i]), midpoint(original)))
    meta = {'original_size': [width,height], 'crop_box': box, 'coordinate_space': 'crop', 'pass1_stride': 3,
            'pass1_observations': len(first), 'pass2_observations': len(second),
            'crop_alignment_error_max': max(errors) if errors else None,
            'crop_alignment_error_mean': sum(errors) / len(errors) if errors else None,
            'crop_alignment_samples': len(errors), 'extraction_seconds': time.perf_counter() - started}
    frames = PoseFrames(frames, meta, [getattr(second, "world", {}).get(i) for i in range(total)])
    return (frames, fps, timeline) if evidence else (frames, fps)

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

    def size_for(box, padding=1.6):
        x0, y0, x1, y1 = box
        return min(1, max(0.04, max(x1 - x0, y1 - y0) * padding))

    phase_boxes = {phase: boxes[min(boxes, key=lambda i: abs(i - frame))] for phase, frame in phases.items()}
    size = max(map(size_for, phase_boxes.values()))
    stills = {phase: crop(box, size) for phase, box in phase_boxes.items()}

    # A fixed crop across the swing keeps playback from panning and zooming on tracking noise.
    start, end = phases["address"], phases["finish"]
    swing = [box for index, box in boxes.items() if start <= index <= end] or list(phase_boxes.values())
    envelope = box_envelope(swing)
    return stills, crop(envelope, size_for(envelope, padding=1.25))


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
