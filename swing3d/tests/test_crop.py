"""Stage-one crop geometry and two-pass contract, independent of video extras."""
import sys
from types import ModuleType, SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch

import swing_track as st
import video_pose as vp


def pose():
    d = {name: (0.5, 0.5, 0.0, 0.99) for name in vp.LANDMARK_NAMES}
    for side, x in [('LEFT', 0.45), ('RIGHT', 0.55)]:
        for name, y in [('SHOULDER', 0.3), ('HIP', 0.5), ('ANKLE', 0.8)]:
            d[side + '_' + name] = (x, y, 0.0, 0.99)
    return d


class CropTests(TestCase):
    def test_crop_roundtrip(self):
        for width, height in [(640, 360), (432, 768)]:
            box, _ = vp.extraction_crop({0: pose()}, width, height)
            for point in [(0, 0, -0.2, 0.8), (1, 1, 0.1, 0.99), (0.53, 0.67, 0, 1)]:
                restored = vp.crop_to_original(vp.original_to_crop(point, box), box)
                for actual, expected in zip(restored, point):
                    self.assertAlmostEqual(actual, expected, places=12)

    def test_pixel_square_and_per_side_padding(self):
        box, valid = vp.extraction_crop({0: pose(), 3: pose()}, 640, 360)
        self.assertEqual(valid, [0, 3])
        self.assertEqual(box['pixels'][2:], [270, 270])  # (.8-.3)*360*1.5
        self.assertAlmostEqual(box['w'] * 640, box['h'] * 360)
        self.assertEqual(box['resized_side'], 640)
        self.assertFalse(box['boundary_limited'])
        self.assertEqual(box['padding_per_side'], 0.25)

    def test_boundary_clamp_preserves_pixel_square_on_both_aspects(self):
        for width, height in [(640, 360), (432, 768)]:
            d = {name: (0.02, p[1], p[2], p[3]) for name, p in pose().items()}
            box, _ = vp.extraction_crop({0: d}, width, height)
            x, y, w, h = box['pixels']
            self.assertEqual(w, h)
            self.assertEqual(x, 0)
            self.assertTrue(0 <= y <= height - h)
            self.assertLessEqual(w, min(width, height))

    def test_anatomically_rejected_observation_cannot_enlarge_the_box(self):
        original = pose()
        bad = dict(original)
        for side in ('LEFT', 'RIGHT'):
            bad[side + '_SHOULDER'] = (-100 if side == 'LEFT' else 100, 0.9, 0, 0.99)
        expected, _ = vp.extraction_crop({3: original}, 640, 360)
        actual, valid = vp.extraction_crop({0: bad, 3: original}, 640, 360)
        self.assertEqual(actual, expected)
        self.assertEqual(valid, [3])
        with self.assertRaises(vp.ExtractionError):
            vp.extraction_crop({0: bad}, 640, 360)

    def test_two_pass_returns_only_crop_measurements_and_original_evidence(self):
        first = {i: pose() for i in range(0, 30, 3)}
        box, _ = vp.extraction_crop(first, 640, 360)
        second = {i: {n: vp.original_to_crop(p, box) for n, p in pose().items()}
                  for i in range(30) if i != 8}
        caps = [Mock(), Mock()]
        for cap in caps:
            cap.isOpened.return_value = True
            cap.get.side_effect = lambda key: {1: 30, 2: 30, 3: 640, 4: 360}[key]
        cv2 = SimpleNamespace(VideoCapture=Mock(side_effect=caps), CAP_PROP_FPS=1,
                              CAP_PROP_FRAME_COUNT=2, CAP_PROP_FRAME_WIDTH=3, CAP_PROP_FRAME_HEIGHT=4)
        python = ModuleType('mediapipe.tasks.python')
        python.BaseOptions = Mock(return_value=object())
        vision = SimpleNamespace(PoseLandmarkerOptions=Mock(return_value=object()),
                                 RunningMode=SimpleNamespace(VIDEO='video'))
        python.vision = vision
        tasks = ModuleType('mediapipe.tasks')
        tasks.python = python
        modules = {'cv2': cv2, 'mediapipe': ModuleType('mediapipe'),
                   'mediapipe.tasks': tasks, 'mediapipe.tasks.python': python}
        with patch.dict(sys.modules, modules), patch.object(vp, 'ensure_model', return_value=Mock()), \
                patch.object(vp, '_detect_pass', side_effect=[(first, 30), (second, 30)]) as detect:
            frames, fps, timeline = vp.extract('synthetic.mp4', evidence=True)
        self.assertEqual(fps, 30)
        self.assertEqual(len(frames), 30)
        self.assertEqual(len(timeline), 30)
        self.assertEqual(detect.call_args_list[0].kwargs['stride'], 3)
        self.assertEqual(detect.call_args_list[1].kwargs['box'], box)
        self.assertIsNone(timeline[8])
        self.assertTrue(all(p[3] == 0 for p in frames[8].values()))
        self.assertFalse(st._frame_acceptance(frames)[8]['accepted'])
        self.assertEqual(len(timeline[7]), 33)
        for i, name in enumerate(vp.LANDMARK_NAMES):
            self.assertEqual(timeline[7][i], [pose()[name][0], pose()[name][1], 0.99])
        self.assertEqual(frames[7], second[7])
        meta = st.build_track(frames, fps)['meta']
        self.assertEqual(meta['crop_box'], box)
        self.assertIsNotNone(meta['shoulder_width_max'])
        self.assertEqual(meta['coordinate_space'], 'crop')
        self.assertLess(meta['crop_alignment_error_max'], 1e-12)
        for cap in caps:
            cap.release.assert_called_once()
