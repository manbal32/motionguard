import ast
from pathlib import Path
import unittest
from modules.motion_dynamics import motion_window
from modules.motion_findings import graph_findings
from tests.test_motion_dynamics import series

class FindingTests(unittest.TestCase):
    def test_values_and_frames(self):
        rows=graph_findings(motion_window(series([10,20,5]),'spine_angle',0,2,0))
        self.assertIn('5.00° (f2)',rows[0]['관측 결과'])
        self.assertIn('+10.00° (f1)',rows[1]['관측 결과'])
        self.assertIn('f1→f2',rows[2]['관측 결과'])
    def test_no_reference(self):
        rows=graph_findings(motion_window(series([None,20,5]),'spine_angle',0,2,0))
        self.assertEqual(rows[1]['관측 결과'],'기준각 측정 불가')
    def test_no_data(self):
        rows=graph_findings(motion_window(series([None,None]),'spine_angle',0,1,0))
        self.assertEqual(len(rows),1)
        self.assertIn('0/2',rows[0]['관측 결과'])
    def test_gap_no_speed(self):
        rows=graph_findings(motion_window(series([10,None,20]),'spine_angle',0,2,0))
        self.assertEqual(rows[2]['관측 결과'],'계산 가능한 연속 프레임 쌍 없음')
