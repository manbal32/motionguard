import csv
import math
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch
import swing_track as st
import video_pose as vp
ROOT=Path(__file__).resolve().parents[1]
class WorldPoseTests(TestCase):
    def test_no_face_landmarks(self):
        self.assertEqual(len(vp.LANDMARK_NAMES),22)
        self.assertEqual(vp.BODY_INDICES,tuple(range(11,33)))
        for path in (ROOT/'samples').glob('*.csv'):
            f,_=st.load_csv(str(path))
            self.assertTrue(all(set(d)<=set(vp.LANDMARK_NAMES) for d in f))
            with path.open() as src:self.assertFalse({r['landmark'] for r in csv.DictReader(src)}-set(vp.LANDMARK_NAMES))
    def test_rotation_3d(self):
        f,fps=st.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'))
        # Independently observed document phases; automatic detection is stage 2.
        torso,hips=st.world_rotations(f.world_frames,81)
        for frame,a,b in [(81,0,0),(118,-139.3402,-105.7083),(141,-13.5471,-12.3374),(146,15.4924,2.8335),(172,97.3007,72.9010)]:
            self.assertAlmostEqual(math.degrees(torso[frame]),a,places=3)
            self.assertAlmostEqual(math.degrees(hips[frame]),b,places=3)
        self.assertLess(torso[118]-hips[118],0);self.assertGreater(torso[146]-hips[146],0)
        with patch.object(st,'_swing_phases',return_value=(81,118,141,146,172,1)):
            t=st.build_track(f,fps)
        for phase,i in t['meta']['phase_frames'].items():
            self.assertAlmostEqual(t['track'][i-81][t['channels'].index('x_factor')],torso[i]-hips[i],places=5)
    def test_world_unwrap_and_camera_heading(self):
        for heading in (0,math.pi/3,math.pi):
            world=[dict(LEFT_SHOULDER=(0,0,0,1),RIGHT_SHOULDER=(math.cos(a+heading),0,math.sin(a+heading),1),LEFT_HIP=(0,0,0,1),RIGHT_HIP=(math.cos(heading),0,math.sin(heading),1)) for a in map(math.radians,(0,70,140,210))]
            torso,hips=st.world_rotations(world,0)
            self.assertEqual([round(math.degrees(a)) for a in torso],[0,70,140,-150])
            self.assertTrue(all(abs(v)<1e-9 for v in hips))
    def test_internal_unwrap_is_continuous_but_public_relative_rotation_is_bounded(self):
        values=st._unwrap(list(map(math.radians,(0,70,140,-150))))
        self.assertEqual([round(math.degrees(v)) for v in values],[0,70,140,210])
        world=[dict(LEFT_SHOULDER=(0,0,0,1),RIGHT_SHOULDER=(math.cos(a),0,math.sin(a),1),LEFT_HIP=(0,0,0,1),RIGHT_HIP=(1,0,0,1)) for a in map(math.radians,(0,70,140,210,280,350))]
        torso,_=st.world_rotations(world,0)
        self.assertTrue(all(-math.pi<=v<=math.pi for v in torso))
        self.assertEqual(round(math.degrees(torso[-1])),-10)

    def test_missing_world_never_uses_width_instead(self):
        f,fps=st.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'))
        with patch.object(st,'_swing_phases',return_value=(81,118,141,146,172,1)):
            t=st.build_track(list(f),fps)
        self.assertEqual(t['meta']['unavailable'],['torso','hips','x_factor'])
        self.assertTrue(all(row[1] is None and row[2] is None and row[-2] is None for row in t['track']))
