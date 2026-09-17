import unittest
from modules.motion_dynamics import motion_window


def series(values,fps=10):
    return [{'frame_idx':i,'timestamp':i/fps,'is_detected':True,'low_confidence':False,
             'side_angles':{'left_shoulder_angle':v,'right_shoulder_angle':170},
             'shoulder_angle':170,'spine_angle':v} for i,v in enumerate(values)]

class MotionTests(unittest.TestCase):
    def test_range_delta_and_velocity(self):
        r=motion_window(series([0,10,20,30,40]),'left_shoulder_angle',1,4,0)
        self.assertEqual(r['observed_rom_deg'],30)
        self.assertEqual(r['net_change_deg'],30)
        self.assertEqual(r['samples'][0]['delta_reference'],10)
        self.assertAlmostEqual(r['peak_abs_velocity_deg_s'],100)
        self.assertEqual(r['reference_angle'],0)

    def test_no_bridge_over_missing(self):
        r=motion_window(series([0,None,20,30]),'left_shoulder_angle',0,3,0)
        self.assertIsNone(r['samples'][2]['velocity_deg_s'])
        self.assertNotEqual(r['samples'][0]['segment'],r['samples'][2]['segment'])
        self.assertAlmostEqual(r['samples'][3]['velocity_deg_s'],100)
        self.assertEqual(r['coverage'],.75)

    def test_low_confidence_and_missing_reference(self):
        s=series([0,10,20]); s[0]['low_confidence']=True
        r=motion_window(s,'left_shoulder_angle',0,2,0)
        self.assertIsNone(r['reference_angle'])
        self.assertTrue(all(x['delta_reference'] is None for x in r['samples']))
        self.assertTrue(any(x['kind']=='missing_reference' for x in r['review_points']))

    def test_no_invented_rom_one_frame(self):
        r=motion_window(series([None,10,None]),'left_shoulder_angle',0,2,1)
        self.assertIsNone(r['observed_rom_deg'])
        self.assertIsNone(r['peak_abs_velocity_deg_s'])

    def test_detect_local_jump_not_constant_motion(self):
        r=motion_window(series([0,1,2,3,4,5,80,7,8,9]),'left_shoulder_angle',0,9,0)
        self.assertTrue(any(x['kind']=='speed_review' and x['frame_idx']==6 for x in r['review_points']))
        r=motion_window(series([10]*10),'left_shoulder_angle',0,9,0)
        self.assertFalse(r['review_points'])

    def test_nonpositive_time_not_velocity(self):
        s=series([0,10,20]); s[1]['timestamp']=0
        r=motion_window(s,'left_shoulder_angle',0,2,0)
        self.assertIsNone(r['samples'][1]['velocity_deg_s'])

    def test_reject_side_switching_aggregate(self):
        with self.assertRaises(ValueError): motion_window(series([10,20]),'shoulder_angle',0,1,0)
        with self.assertRaises(ValueError): motion_window(series([10,20]),'spine_angle',2,1,0)

if __name__=='__main__': unittest.main()
