"""Display-only body overlay; facial landmarks remain in the analysis data."""
import math
import cv2
from .pose_analyzer import LANDMARK_NAMES

BODY_EDGES = (
    (11,12),(11,13),(13,15),(15,17),(15,19),(15,21),(17,19),
    (12,14),(14,16),(16,18),(16,20),(16,22),(18,20),
    (11,23),(12,24),(23,24),(23,25),(24,26),(25,27),(26,28),
    (27,29),(28,30),(29,31),(30,32),(27,31),(28,32),
)


def body_still(image_bgr, landmarks):
    image = image_bgr.copy()
    height, width = image.shape[:2]
    points = {}
    for index, name in enumerate(LANDMARK_NAMES[11:], start=11):
        lm = (landmarks or {}).get(name)
        if lm is not None and all(math.isfinite(v) for v in (lm.x, lm.y, lm.visibility)) and lm.visibility > .5 and 0 <= lm.x <= 1 and 0 <= lm.y <= 1:
            points[index] = (min(width-1, int(lm.x*width)), min(height-1, int(lm.y*height)))
    for a, b in BODY_EDGES:
        if a in points and b in points:
            cv2.line(image, points[a], points[b], (0,220,0), 2)
    for point in points.values():
        cv2.circle(image, point, 3, (0,0,255), -1)
    return image
