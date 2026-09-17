import unittest
from dataclasses import dataclass
from unittest.mock import patch
import numpy as np
from modules.pose_compat import normalize_pose,prepare_session,ANALYSIS_SCHEMA_VERSION
from modules.angle_recovery import recover_angles
from modules.research_data import build_research_data
from modules.video_loader import FrameData

@dataclass
class OldPoseResult:
    is_detected:bool=False
    landmarks:object=None
    confidence:float=0.
    angles:object=None
    annotated_image:object=None

class CompatibilityTests(unittest.TestCase):
    def test_old_constructor_and_missing_fields(self):
        image=np.zeros((20,20,3),dtype=np.uint8)
        old=OldPoseResult(annotated_image=image)
        # Reproduce a running process that also retains the old imported class.
        with patch('modules.pose_compat.PoseResult',OldPoseResult):
            result=recover_angles([FrameData(0,0,image)],[old])[0]
            data=build_research_data([FrameData(0,0,image)],[old],[])
        self.assertEqual(result.angle_confidence,{})
        self.assertIs(result.annotated_image,image)
        self.assertFalse(hasattr(old,'measurement_issues'))
        self.assertEqual(data['series'][0]['measurement_issues'],{})

    def test_none_metadata_normalized(self):
        old=OldPoseResult();old.measurement_issues=None
        self.assertEqual(normalize_pose(old).measurement_issues,{})

    def test_cache_invalidated_once_only(self):
        state={'analysis_data':{'raw_poses':[OldPoseResult()]},'analysis_report':{},
               'motion_cursor':3,'source_digest':'keep','unrelated':'keep'}
        self.assertTrue(prepare_session(state))
        self.assertNotIn('analysis_data',state)
        self.assertNotIn('motion_cursor',state)
        self.assertEqual(state['source_digest'],'keep')
        self.assertEqual(state['analysis_schema_version'],ANALYSIS_SCHEMA_VERSION)
        state['analysis_data']={'new':True}
        self.assertFalse(prepare_session(state))
        self.assertEqual(state['analysis_data'],{'new':True})

if __name__=='__main__':unittest.main()
