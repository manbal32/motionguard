import math
import unittest

from findings_contract import validate_findings
from swing_track import _index_wrist


class WristTests(unittest.TestCase):
    def test_index_angle(self):
        frames = [{
            "RIGHT_ELBOW": (0, 0, 0, 1),
            "RIGHT_WRIST": (1, 0, 0, 1),
            "RIGHT_INDEX": (1.5, math.sqrt(3) / 2, 0, 1),
        } for _ in range(10)]
        angles, anchors = _index_wrist(frames)
        self.assertEqual(len(anchors), 10)
        self.assertAlmostEqual(math.degrees(angles[5]), 60)
        for frame in frames:
            del frame["RIGHT_INDEX"]
        self.assertIsNone(_index_wrist(frames)[0])

    def test_wrist_finding_requires_index(self):
        data = {"schema": "motionguard.findings/1", "reference": "model", "findings": [{
            "id": "casting", "label": "캐스팅", "channel": "wrist", "range": [0.5, 0.7],
            "measured": 20, "reference": 45, "direction": "deficit",
            "severity": "medium", "camera": "wrist",
        }]}
        with self.assertRaisesRegex(ValueError, "wrist"):
            validate_findings(data, wrist_source="forearm")
        self.assertEqual(validate_findings(data, wrist_source="index"), data)
