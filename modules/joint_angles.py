"""STEP 3: image-plane three-point angles; not anatomical 3-D rotation."""
import math
import numpy as np


def vector_angle(a, b, c):
    """Angle ABC in degrees. Degenerate/nonfinite vectors return None."""
    a, b, c = (np.asarray(p, dtype=float) for p in (a, b, c))
    u, v = a - b, c - b
    denom = np.linalg.norm(u) * np.linalg.norm(v)
    if not np.isfinite(denom) or denom < 1e-10:
        return None
    return float(np.degrees(np.arccos(np.clip(np.dot(u, v) / denom, -1, 1))))


def calculate_joint_angles(landmarks, image_shape, min_visibility=0.5):
    """Pixel-aspect-corrected 2-D angles; representative value=max valid side.

    Shoulder: hip-shoulder-elbow interior angle.
    Wrist: 180 minus elbow-wrist-index interior angle (neutral=0).
    Spine: shoulder-midpoint/hip-midpoint/vertical reference angle.
    Spine is image-plane trunk inclination, NOT lumbar axial rotation.
    """
    height, width = image_shape[:2]
    result = {k: None for k in ('shoulder_angle', 'wrist_angle', 'spine_angle')}
    def point(name):
        lm = (landmarks or {}).get(name)
        if lm is None or not math.isfinite(lm.visibility) or lm.visibility < min_visibility:
            return None
        if not (0 <= lm.x <= 1 and 0 <= lm.y <= 1):
            return None
        p = np.array([lm.x * width, lm.y * height], dtype=float)
        return p if np.all(np.isfinite(p)) else None
    for joint, names, supplement in (
        ('shoulder', ('HIP', 'SHOULDER', 'ELBOW'), False),
        ('wrist', ('ELBOW', 'WRIST', 'INDEX'), True),
    ):
        values = []
        for side in ('LEFT', 'RIGHT'):
            points = [point(f'{side}_{name}') for name in names]
            angle = None if any(p is None for p in points) else vector_angle(*points)
            if angle is not None:
                angle = round(180 - angle if supplement else angle, 2)
                values.append(angle)
            result[f'{side.lower()}_{joint}_angle'] = angle
        result[f'{joint}_angle'] = max(values) if values else None
    points = [point(n) for n in ('LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_HIP', 'RIGHT_HIP')]
    if all(p is not None for p in points):
        shoulder = (points[0] + points[1]) / 2
        hip = (points[2] + points[3]) / 2
        angle = vector_angle(shoulder, hip, hip + np.array([0., -height]))
        result['spine_angle'] = round(angle, 2) if angle is not None else None
    return result


def measurement_issues(landmarks, angles, min_visibility=0.5):
    """Observed failure conditions; do not guess blur/occlusion from confidence."""
    groups = {
        'shoulder_angle': [f'{side}_{n}' for side in ('LEFT','RIGHT') for n in ('HIP','SHOULDER','ELBOW')],
        'wrist_angle': [f'{side}_{n}' for side in ('LEFT','RIGHT') for n in ('ELBOW','WRIST','INDEX')],
        'spine_angle': ['LEFT_SHOULDER','RIGHT_SHOULDER','LEFT_HIP','RIGHT_HIP'],
    }
    issues = {}
    for key,names in groups.items():
        if angles.get(key) is not None:
            continue
        reasons=[]
        for name in names:
            lm=(landmarks or {}).get(name)
            if lm is None: reasons.append(f'{name}: 좌표 없음')
            elif not all(math.isfinite(v) for v in (lm.x,lm.y,lm.visibility)):
                reasons.append(f'{name}: 좌표/신뢰도 값 오류')
            elif lm.visibility < min_visibility:
                reasons.append(f'{name}: 신뢰도 {lm.visibility:.2f} < {min_visibility:.2f}')
            elif not (0 <= lm.x <= 1 and 0 <= lm.y <= 1):
                reasons.append(f'{name}: 화면 밖 좌표')
        issues[key] = '; '.join(reasons) or '기준점이 겹쳐 각도 벡터를 만들 수 없음'
    return issues
