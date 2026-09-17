import unittest
from unittest.mock import patch
from modules.gemini_analyzer import GeminiAnalyzer, GeminiAnalysisResult
from modules.feedback import phase_tables
from modules.disease_labels import map_mentions
from modules.joint_angles import calculate_joint_angles, measurement_issues
from modules.pose_analyzer import Landmark

class FeedbackTests(unittest.TestCase):
    def test_missing_skips_api_and_disease(self):
        client=GeminiAnalyzer(mock=False)
        data=[{'phase':'임팩트','shoulder_angle':None,'measurement_issues':{'pose':'포즈 미검출'}}]
        with patch.object(client,'_real_gemini_analysis') as call:
            r=client.analyze([],data)
            call.assert_not_called()
        self.assertEqual(r['mode'],'insufficient_data')
        self.assertEqual(r['phase_feedback'],[])
        self.assertEqual(r['injury_warnings'],[])
        self.assertEqual(r['disease_labels'],[])
        self.assertIn('포즈 미검출',r['measurement_quality'][0]['reason'])

    def test_partial_table_no_fake_angles(self):
        feedback,quality=phase_tables([{'phase':'임팩트','wrist_angle':38}])
        self.assertEqual(len(feedback),1)
        self.assertEqual(len(quality),2)
        self.assertIn('38.0',feedback[0]['finding'])
        self.assertNotEqual(feedback[0]['finding'],feedback[0]['suggestion'])

    def test_mixed_input_excludes_invalid_from_model(self):
        client=GeminiAnalyzer(mock=False)
        valid={'phase':'임팩트','wrist_angle':38,'shoulder_angle':None}
        invalid={'phase':'어드레스','wrist_angle':38,'low_confidence':True}
        context={'research_data':{'series':[valid,invalid]}}
        with patch.object(client,'_real_gemini_analysis',return_value=GeminiAnalysisResult('golf','real','ok')) as call:
            result=client.analyze([],[invalid,valid],user_context=context)
        args=call.call_args.args
        self.assertEqual(len(args[1]),1)
        self.assertNotIn('shoulder_angle',args[1][0])
        self.assertEqual(len(args[3]['research_data']['series']),1)
        self.assertEqual(len(context['research_data']['series']),2)
        self.assertTrue(result['measurement_quality'])

    def test_observed_measurement_failures(self):
        lm={'LEFT_HIP':Landmark(.5,.8),'LEFT_SHOULDER':Landmark(.5,.2),
            'LEFT_ELBOW':Landmark(1.2,.4),'RIGHT_ELBOW':Landmark(.5,.3,visibility=.1)}
        angles=calculate_joint_angles(lm,(100,100,3))
        issues=measurement_issues(lm,angles)
        self.assertIn('화면 밖',issues['shoulder_angle'])
        self.assertIn('신뢰도',issues['shoulder_angle'])
        self.assertIn('좌표 없음',issues['wrist_angle'])

class DiseaseLabelTests(unittest.TestCase):
    def test_explicit_term_candidate_preserves_negation(self):
        r=map_mentions([{'phase':'임팩트','term':'내측상과염','evidence':'손목 38도',
                         'statement':'내측상과염이라고 단정할 수 없음'}],{'임팩트'})[0]
        self.assertEqual(r['code'],'M77.0')
        self.assertIn('단정할 수 없음',r['original_statement'])
        self.assertFalse(r['is_diagnosis'])
        self.assertIn('검토 필요',r['status'])

    def test_generic_stress_does_not_invent_diagnosis(self):
        for term in ['허리 부담','팔꿈치 부상','허리와 팔꿈치 부담이 커질 수 있습니다.']:
            r=map_mentions([{'phase':'임팩트','term':term,'evidence':'손목 38도'}],{'임팩트'})[0]
            self.assertIsNone(r['code'])

    def test_no_supported_phase_or_evidence_no_code(self):
        r=map_mentions([{'phase':'임팩트','term':'요통','evidence':'각도'}],set())[0]
        self.assertIsNone(r['code'])
        r=map_mentions([{'phase':'임팩트','term':'요통'}],{'임팩트'})[0]
        self.assertIsNone(r['code'])

if __name__=='__main__': unittest.main()
