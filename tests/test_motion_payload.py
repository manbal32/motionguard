import copy
import json
import math
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from modules.motion_payload import build_motion_payload, validate_findings, LANDMARKS
from modules.gemini_analyzer import GeminiAnalyzer


def fixture(n=258):
    rows = []
    for i in range(n):
        rows.append({'frame_idx': i, 'timestamp': i/30, 'phase': ['address','top','down','impact'][min(3,i*4//n)],
          'confidence': .99, 'low_confidence': False, 'spine_angle': 20+i*.01,
          'side_angles': {'left_shoulder_angle': 45+30*math.sin(i/20), 'right_shoulder_angle': 45,
                          'left_wrist_angle': 15, 'right_wrist_angle': 12},
          'landmarks': {k:{'x': .123456789, 'y': .7654321, 'z': -.031415926, 'visibility': .99} for k in LANDMARKS}})
    return rows


class PayloadTests(unittest.TestCase):
    def test_bounded_preserves_anchors_and_input(self):
        rows = fixture(2000)
        events = [{'frame_idx':i, 'phase':rows[i]['phase'], 'shoulder_angle':40} for i in [0,500,1000,1500]]
        original = copy.deepcopy(rows)
        payload = build_motion_payload(events, {'research_data':{'series':rows},'reference_frame':25})
        frames = {r['frame_idx'] for r in payload['samples']}
        self.assertLessEqual(len(frames),40)
        self.assertTrue({0,500,1000,1500,1999,25} <= frames)
        self.assertEqual(rows,original)
        self.assertLess(len(json.dumps(payload)),120000)
        self.assertEqual(payload['original_frame_count'],2000)

    def test_velocity_uses_original_neighbor_and_reference(self):
        rows=fixture(10)
        for i,r in enumerate(rows): r['spine_angle']=i*2
        payload=build_motion_payload([], {'research_data':{'series':rows},'reference_frame':2})
        sample=next(r for r in payload['samples'] if r['frame_idx']==9)['metrics']['spine_angle']
        self.assertAlmostEqual(sample['velocity_deg_s'],60)
        self.assertEqual(sample['velocity_previous_frame'],8)
        self.assertEqual(sample['delta_reference_deg'],14)

    def test_no_velocity_across_missing_or_frame_gap(self):
        rows=fixture(3)
        rows[1]['low_confidence']=True
        rows[2]['frame_idx']=4
        payload=build_motion_payload([], {'research_data':{'series':rows}})
        last=next(r for r in payload['samples'] if r['frame_idx']==4)
        self.assertIsNone(last['metrics']['spine_angle']['velocity_deg_s'])

    def test_evidence_match_is_not_clinical_validation(self):
        payload=build_motion_payload([], {'research_data':{'series':fixture(4)}})
        good={'category':'concern','evidence':[{'frame_idx':0,'metric':'spine_angle','field':'angle_deg','value':20}]}
        bad=copy.deepcopy(good);bad['evidence'][0]['frame_idx']=999
        malformed=copy.deepcopy(good);malformed['evidence'][0]['metric']=[]
        results=validate_findings({'findings':[good,bad,malformed]},payload)
        self.assertEqual([r['evidence_status'] for r in results],['matched','unverified','unverified'])

    def test_success_is_displayable_and_text_only(self):
        client=MagicMock()
        client.models.count_tokens.return_value=SimpleNamespace(total_tokens=5000)
        client.models.generate_content.return_value=SimpleNamespace(text=json.dumps({'findings':[{
          'category':'uncertain','body_region':'몸통','observation':'20도','interpretation':'추가 확인 필요',
          'next_check':'촬영 방향 확인','evidence':[{'frame_idx':0,'metric':'spine_angle','field':'angle_deg','value':20}]}]}),
          usage_metadata=SimpleNamespace(prompt_token_count=5000,candidates_token_count=200,thoughts_token_count=0,total_token_count=5200))
        with patch('modules.gemini_analyzer.save_diagnostics'),patch('google.genai.Client') as factory:
            factory.return_value.__enter__.return_value=client
            result=GeminiAnalyzer(api_key='test',mock=False).analyze([], [{'phase':'address','frame_idx':0,'shoulder_angle':40}], user_context={'research_data':{'series':fixture()}})
        self.assertEqual(result['mode'],'real_gemini')
        self.assertEqual(result['motion_findings'][0]['evidence_status'],'matched')
        self.assertEqual(result['api_diagnostics']['usage']['total_token_count'],5200)
        self.assertIsInstance(client.models.generate_content.call_args.kwargs['contents'],str)
        self.assertEqual(result['api_diagnostics']['video_count'],0)
