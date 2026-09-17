import unittest
import numpy as np
from modules.pose_analyzer import Landmark,PoseResult
from modules.video_loader import FrameData
from modules.frame_selector import KeyFrame
from modules.angle_recovery import recover_angles,resolve_event_angles
from modules.research_data import build_research_data
from modules.gemini_analyzer import GeminiAnalyzer


def fixtures(n=12,visibility=.9):
    frames=[FrameData(i,i/30,np.zeros((100,100,3),dtype=np.uint8)) for i in range(n)]
    poses=[]
    for i in range(n):
        lm={}
        for side,x in [('LEFT',.3),('RIGHT',.7)]:
            for joint,y in [('HIP',.8),('SHOULDER',.2),('ELBOW',.4),('WRIST',.6),('INDEX',.7)]:
                lm[f'{side}_{joint}']=Landmark(x+(i*.001 if joint=='ELBOW' else 0),y,visibility=visibility)
        poses.append(PoseResult(is_detected=True,landmarks=lm,confidence=.1))
    return frames,poses


def events(frames,poses):
    return [KeyFrame(frames[i],poses[i],label,event,frames[i].timestamp,poses[i].confidence)
            for i,event,label in [(0,'address','어드레스'),(4,'backswing_top','백스윙 탑'),(7,'downswing','다운스윙'),(10,'impact','임팩트')]]

class RecoveryTests(unittest.TestCase):
    def test_joint_confidence_not_whole_body_mean(self):
        f,p=fixtures(); recovered=recover_angles(f,p)
        self.assertEqual(recovered[0].angle_sources['shoulder_angle']['method'],'direct')
        data=build_research_data(f,recovered,events(f,recovered))
        self.assertFalse(data['series'][0]['low_confidence'])
        self.assertIsNotNone(data['phase_statistics'][0]['angles']['shoulder_angle']['mean'])

    def test_short_gap_interpolates_coordinates_and_preserves_raw(self):
        f,p=fixtures(); del p[3].landmarks['LEFT_ELBOW']
        recovered=recover_angles(f,p)
        self.assertIsNotNone(recovered[3].angles['left_shoulder_angle'])
        source=recovered[3].angle_sources['left_shoulder_angle']
        self.assertEqual(source['method'],'coordinate_interpolation')
        self.assertEqual(source['interpolated_landmarks']['LEFT_ELBOW'],[2,4])
        self.assertNotIn('LEFT_ELBOW',p[3].landmarks)
        self.assertIs(recovered[3].annotated_image,p[3].annotated_image)

    def test_long_gap_not_fabricated(self):
        f,p=fixtures()
        for i in range(2,8): del p[i].landmarks['LEFT_ELBOW']
        recovered=recover_angles(f,p)
        self.assertIsNone(recovered[4].angles['left_shoulder_angle'])

    def test_nearest_observation_keeps_event_time(self):
        f,p=fixtures()
        for side in ('LEFT','RIGHT'): del p[4].landmarks[f'{side}_INDEX']
        recovered=recover_angles(f,p,max_gap=0)
        resolved=resolve_event_angles(f,recovered,events(f,recovered))
        row=resolved[1]
        self.assertEqual(row['frame_idx'],4)
        self.assertEqual(row['angle_sources']['wrist_angle']['source_frame'],3)
        self.assertEqual(row['angle_sources']['wrist_angle']['method'],'nearby_frame_direct')

    def test_low_quality_geometry_shown_not_used_for_disease(self):
        f,p=fixtures(visibility=.1)
        recovered=recover_angles(f,p)
        self.assertIsNotNone(recovered[4].angles['wrist_angle'])
        self.assertEqual(recovered[4].angle_sources['wrist_angle']['method'],'low_confidence_geometry')
        rows=resolve_event_angles(f,recovered,events(f,recovered))
        self.assertTrue(rows[1]['low_confidence'])
        self.assertIsNotNone(rows[1]['wrist_angle'])
        self.assertEqual(GeminiAnalyzer(mock=True).analyze([],rows)['mode'],'insufficient_data')

    def test_no_coordinates_no_angle(self):
        f,p=fixtures(); p=[PoseResult() for _ in p]
        recovered=recover_angles(f,p)
        rows=resolve_event_angles(f,recovered,events(f,recovered))
        self.assertTrue(all(row['shoulder_angle'] is None for row in rows))

if __name__=='__main__': unittest.main()
