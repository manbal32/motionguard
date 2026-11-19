from copy import deepcopy
from pathlib import Path
from unittest import TestCase
import swing_track as st,scoring
ROOT=Path(__file__).resolve().parents[1]
class ScoreTests(TestCase):
    def test_score_range(self):
        f,fps=st.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'));t=st.build_track(f,fps);a=scoring.compute(t);b=scoring.compute(t)
        self.assertTrue(0<=a['total']<=100);self.assertEqual(a,b)
        for item in a['items']:self.assertTrue(0<=item['score']<=100)
        t=deepcopy(t);t['meta']['unavailable']=['torso']
        for row in t['track']:row[t['channels'].index('torso')]=None
        x=scoring.compute(t)
        self.assertEqual(len([i for i in x['items'] if i['channel']=='torso']),0)
        self.assertTrue({'top_torso','down_torso','impact_torso','finish_torso'}<=set(x['excluded']))
        expected=[i for i in a['items'] if i['channel']!='torso']
        mean=round(sum(i['score']*i['weight'] for i in expected)/sum(i['weight'] for i in expected),2)
        self.assertEqual(x['total'],mean)
        self.assertTrue(scoring.constants()['tolerances'])
    def test_low_confidence_excluded(self):
        f,fps=st.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'));t=st.build_track(f,fps)
        i=t['meta']['phase_frames']['top']-t['meta']['source_frames'][0]
        t['meta']['channel_confidence']['x_factor'][i]=.29
        r=scoring.compute(t);self.assertIn('top_x_factor',r['excluded'])
