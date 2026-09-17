import json
import unittest
from types import SimpleNamespace as NS
from modules.pose_analyzer import PoseResult, Landmark
from modules.research_data import build_research_data
from modules.gemini_analyzer import GeminiAnalyzer

class ResearchTests(unittest.TestCase):
    def fixtures(self):
        frames=[NS(frame_idx=i,timestamp=i/30) for i in range(5)]
        poses=[PoseResult(is_detected=True, confidence=.9,landmarks={'NOSE':Landmark(.1,.2)},
                 angles={'shoulder_angle':float(i*10),'wrist_angle':0.,'spine_angle':20.}) for i in range(5)]
        anchors=[NS(frame_idx=0,phase_label='어드레스'),NS(frame_idx=4,phase_label='임팩트')]
        return frames,poses,anchors

    def test_complete_series_stats_exclude_low(self):
        frames,poses,anchors=self.fixtures()
        poses[1].confidence=.2
        data=build_research_data(frames,poses,anchors)
        self.assertEqual(len(data['series']),5)
        self.assertEqual(data['series'][1]['shoulder_angle'],10)
        self.assertEqual(data['series'][1]['landmarks']['NOSE']['x'],.1)
        stats=data['phase_statistics'][0]['angles']['shoulder_angle']
        self.assertEqual(stats['valid_count'],2)
        self.assertEqual(stats['excluded_count'],1)
        self.assertEqual(stats['mean'],10)
        self.assertEqual(stats['std_population'],10)
        self.assertEqual(data['series'][2]['phase'],'어드레스')
        self.assertEqual(data['series'][3]['phase'],'임팩트')
        json.dumps(data,allow_nan=False)

    def test_invalid_segmentation_preserves_frames(self):
        frames,poses,anchors=self.fixtures()
        data=build_research_data(frames,poses,anchors[::-1])
        self.assertFalse(data['segmentation_valid'])
        self.assertTrue(all(r['phase']=='미분류' for r in data['series']))

    def test_no_valid_angles_not_zero(self):
        frames,poses,anchors=self.fixtures()
        for pose in poses: pose.is_detected=False
        data=build_research_data(frames,poses,anchors)
        self.assertIsNone(data['phase_statistics'][0]['angles']['shoulder_angle']['mean'])

    def test_prompt_includes_last_frame_and_coordinates(self):
        data=build_research_data(*self.fixtures())
        prompt=GeminiAnalyzer(mock=True)._build_prompt('golf',[],{'research_data':data},2)
        self.assertIn('"frame_idx": 4',prompt)
        self.assertIn('"landmarks"',prompt)
        self.assertIn('"phase_statistics"',prompt)

    def test_alignment_errors(self):
        f,p,k=self.fixtures()
        with self.assertRaises(ValueError): build_research_data(f,p[:-1],k)
        with self.assertRaises(ValueError): build_research_data(f[::-1],p,k)
        with self.assertRaises(ValueError): build_research_data(f,p,k,1.1)

if __name__=='__main__': unittest.main()
