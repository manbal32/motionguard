import math
import pickle
from pathlib import Path
from unittest import TestCase
import swing_track as st
from server import ROOT
class RealSwingTests(TestCase):
    def test_phases_real_swing(self):
        f,fps=st.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'));t=st.build_track(f,fps);m=t['meta'];p=m['phase_frames']
        self.assertEqual(list(p.values()),[81,118,141,146,172])
        self.assertTrue(m['impact_verified'])
        self.assertAlmostEqual(m['phase_diagnostics']['impact_height_difference'],.034535,places=6)
        self.assertGreaterEqual((p['top']-p['address'])/fps,.30)
        self.assertTrue(.15 <= (p['impact']-p['top'])/fps <= .60)
        self.assertTrue(p['top']<p['down']<p['impact'])
        def xf(phase):return t['track'][p[phase]-p['address']][t['channels'].index('x_factor')]
        self.assertLess(xf('top'),0);self.assertGreater(xf('impact'),0)
    def test_unverified_impact_is_not_a_main_frame(self):
        from unittest.mock import patch
        f,fps=st.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'))
        actual=st._swing_phases
        def candidate(*args,**kwargs):
            result=actual(*args,**kwargs)
            kwargs['diagnostics']['impact_height_difference']=.10
            return result
        with patch.object(st,'_swing_phases',side_effect=candidate):t=st.build_track(f,fps)
        self.assertFalse(t['meta']['impact_verified'])
        self.assertEqual(set(t['meta']['main_phase_frames']),{'address','top','down','finish'})
