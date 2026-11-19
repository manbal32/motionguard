from unittest import TestCase
from unittest.mock import Mock, patch
import coach
import swing_track as st
from video_pose import PoseFrames
from server import ROOT
from test_frame_acceptance import skeleton

class GuidanceTests(TestCase):
    def sample(self, width):
        frames, fps = st.load_csv(str(ROOT / 'samples/golf1_export.csv'))
        for i, d in enumerate(frames):
            w = width * (0.65 if i < 25 else 1)
            for name, sign in [('LEFT_SHOULDER', -1), ('RIGHT_SHOULDER', 1)]:
                _, y, z, v = d[name];d[name] = (0.5 + sign * w/2, y, z, v)
        return PoseFrames(frames, {'crop_box': {'resized_side': 640}}), fps

    def test_guidance_states(self):
        f, fps = self.sample(.04)
        self.assertEqual(st.build_track(f, fps)['meta']['unusable_reason'], 'too_far')
        t = st.build_track([skeleton(0.6, 0.4, 0.3)] * 30, 30)
        self.assertEqual(t['meta']['unusable_reason'], 'tracking_failed')
        f, fps = self.sample(.20)
        for d in f:
            sh = st._mid(d, 'LEFT_SHOULDER', 'RIGHT_SHOULDER')
            for n in ('LEFT_WRIST','RIGHT_WRIST'):d[n] = (sh[0],sh[1]+.15,0,.99)
        self.assertEqual(st.build_track(f, fps)['meta']['unusable_reason'], 'no_swing')
        provider = Mock()
        with self.assertRaises(ValueError):coach.analyze(t, dict.fromkeys(coach.SUMMARY_FIELDS, ''), provider)
        provider.generate.assert_not_called()

    def test_oblique_partial(self):
        f, fps = self.sample(.20)
        with patch.object(st,'_swing_phases',return_value=(10,50,60,70,90,1)):
            t = st.build_track(f,fps)
        self.assertTrue(t['meta']['usable'])
        self.assertEqual(t['meta']['unusable_reason'],'oblique')
        self.assertEqual(t['meta']['unavailable'],['torso','hips'])
        for row in t['track']:
            self.assertIsNone(row[1]);self.assertIsNone(row[2])
            self.assertTrue(all(row[i] is not None for i in (0,3,4,5,6,7,8)))
