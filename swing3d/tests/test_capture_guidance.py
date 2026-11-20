from unittest import TestCase
from unittest.mock import Mock
from pathlib import Path
import swing_track as st,video_pose as vp,coach
ROOT=Path(__file__).resolve().parents[1]
def fixtures():
    f,fps=st.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'))
    for d in f:
        for name,sign in [('LEFT_SHOULDER',-1),('RIGHT_SHOULDER',1)]:
            x,y,z,v=d[name];d[name]=(.5+sign*.02,y,z,v)
    f.extraction_meta={'crop_box':{'resized_side':640}}
    far=st.build_track(f,fps)
    bad=[{k:(x,y,z,0) for k,(x,y,z,v) in d.items()} for d in f]
    failed=st.build_track(bad,fps)
    f,fps=st.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'))
    for d in f:
        for name in ('LEFT_WRIST','RIGHT_WRIST'):d[name]=(.5,.55,0,1)
    none=st.build_track(f,fps)
    return dict(too_far=far,tracking_failed=failed,no_swing=none)
class GuidanceTests(TestCase):
    def test_guidance_states(self):
        for reason,t in fixtures().items():
            self.assertFalse(t['meta']['usable']);self.assertEqual(t['meta']['unusable_reason'],reason)
            self.assertEqual(t['meta']['guidance'],st.GUIDANCE[reason])
            provider=Mock()
            with self.assertRaises(ValueError):coach.analyze(t,dict.fromkeys(coach.SUMMARY_FIELDS,''),provider)
            provider.generate.assert_not_called()
