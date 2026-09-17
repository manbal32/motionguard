"""
MotionGuard — VideoLoader
영상 로드 + 프레임 추출

작성자: 동원
"""

import cv2
from dataclasses import dataclass
from pathlib import Path
from typing import List


@dataclass
class FrameData:
    frame_idx: int
    timestamp: float
    image_bgr: object  # numpy array


class VideoLoader:
    def __init__(self, video_path: str, sport: str = "golf"):
        self.video_path = video_path
        self.sport = sport

    def load_frames(self) -> List[FrameData]:
        path = Path(self.video_path)
        if not path.exists():
            raise FileNotFoundError(f"영상 없음: {self.video_path}")

        cap   = cv2.VideoCapture(str(path))
        fps   = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        frames = []
        idx    = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frames.append(FrameData(
                frame_idx=idx,
                timestamp=idx / fps,
                image_bgr=frame,
            ))
            idx += 1
        cap.release()

        print(f"[VideoLoader] {path.name} | {total}프레임 | FPS={fps:.1f}")
        return frames
