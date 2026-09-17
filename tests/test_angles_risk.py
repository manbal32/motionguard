import math
import unittest
from unittest.mock import patch
from modules.joint_angles import vector_angle, calculate_joint_angles
from modules.pose_analyzer import Landmark
from modules.risk_assessor import assess_pose, injury_warnings
from modules.gemini_analyzer import GeminiAnalyzer

class AngleTests(unittest.TestCase):
    def test_vector_geometry(self):
        self.assertAlmostEqual(vector_angle((1,0),(0,0),(0,1)),90)
        self.assertAlmostEqual(vector_angle((-1,0),(0,0),(1,0)),180)
        self.assertIsNone(vector_angle((0,0),(0,0),(1,0)))
        self.assertIsNone(vector_angle((math.nan,0),(0,0),(1,0)))

    def test_pose_neutral_and_aspect_ratio(self):
        lm = {}
        for side, x in [('LEFT',.4),('RIGHT',.6)]:
            for name, y in [('SHOULDER',.2),('ELBOW',.4),('WRIST',.6),('INDEX',.7),('HIP',.8)]:
                lm[f'{side}_{name}'] = Landmark(x,y)
        a=calculate_joint_angles(lm,(100,200,3))
        self.assertEqual(a['shoulder_angle'],0)
        self.assertEqual(a['wrist_angle'],0)
        self.assertEqual(a['spine_angle'],0)
        # +.1 x and +.2 y are equal pixel displacements at 200x100.
        lm['LEFT_ELBOW']=Landmark(.5,.4)
        self.assertAlmostEqual(calculate_joint_angles(lm,(100,200,3))['left_shoulder_angle'],45)

    def test_missing_and_occlusion(self):
        a=calculate_joint_angles({},(100,100,3))
        self.assertIsNone(a['spine_angle'])
        lm={'LEFT_HIP':Landmark(0,1), 'LEFT_SHOULDER':Landmark(0,0),
            'LEFT_ELBOW':Landmark(1,0,visibility=.1)}
        self.assertIsNone(calculate_joint_angles(lm,(100,100,3))['shoulder_angle'])

class RiskTests(unittest.TestCase):
    def test_reference_boundaries(self):
        for angle,expected in [(0,1),(20,1),(20.01,2),(45,2),(45.01,3),(90,3),(90.01,4)]:
            r=assess_pose(dict(shoulder_angle=angle))
            self.assertEqual(r['reference_components']['rula_upper_arm_base_reference'],expected)
        for angle,rula,reba in [(0,1,1),(.01,2,1),(15,2,1),(15.01,3,2)]:
            r=assess_pose(dict(wrist_angle=angle))['reference_components']
            self.assertEqual(r['rula_wrist_base_reference'],rula)
            self.assertEqual(r['reba_wrist_base_reference'],reba)
        for angle,expected in [(0,1),(.01,2),(20,2),(20.01,3),(60,3),(60.01,4)]:
            self.assertEqual(assess_pose(dict(spine_angle=angle))['reference_components']['reba_trunk_base_reference'],expected)

    def test_missing_not_safe_score(self):
        for bad in (None,math.nan,math.inf,-1,181,'45',True):
            r=assess_pose(dict(shoulder_angle=bad,wrist_angle=38,spine_angle=45))
            self.assertIsNone(r['reference_components']['rula_upper_arm_base_reference'])
            self.assertIsNone(r['rula_score'])
            self.assertIsNone(r['reba_score'])

    def test_low_confidence_defers(self):
        row=dict(phase='임팩트',shoulder_angle=142,wrist_angle=38,spine_angle=45,low_confidence=True)
        r=assess_pose(row)
        self.assertTrue(all(v is None for v in r['reference_components'].values()))
        self.assertEqual(r['angles']['shoulder_angle'],142)
        self.assertIn('보류',injury_warnings([row])[0])

    def test_example_not_final_score(self):
        row=dict(phase='임팩트',shoulder_angle=142,wrist_angle=38,spine_angle=45)
        r=assess_pose(row)
        self.assertEqual(r['reference_components']['rula_upper_arm_base_reference'],4)
        self.assertEqual(r['reference_components']['reba_trunk_base_reference'],3)
        self.assertNotIn('mock_upper_limb_index',r)
        self.assertIsNone(r['rula_score'])
        text=' '.join(injury_warnings([row]))
        for token in ('142.0°','38.0°','45.0°','최종 위험 등급 아님'):
            self.assertIn(token,text)

    def test_mock_and_api_failure(self):
        data=[dict(phase='백스윙 탑',shoulder_angle=142,wrist_angle=38,spine_angle=45)]
        direct=GeminiAnalyzer(mock=True).analyze([],data)
        client=GeminiAnalyzer(mock=False)
        with patch.object(client,'_real_gemini_analysis',side_effect=RuntimeError('429')):
            fallback=client.analyze([],data)
        self.assertEqual(direct['injury_warnings'],fallback['injury_warnings'])
        self.assertEqual(direct['risk_assessment'],fallback['risk_assessment'])
        self.assertIn('142.0', direct['phase_feedback'][0]['evidence'])
        self.assertIn('데이터가 없어',GeminiAnalyzer(mock=True).analyze([])['summary'])

if __name__ == '__main__':
    unittest.main()
