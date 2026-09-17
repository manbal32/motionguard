"""Normalize pre-update cached poses without mutating originals or copying images."""
from .pose_analyzer import PoseResult


def normalize_pose(pose):
    # Use only fields present in the original PoseResult constructor. A running
    # Streamlit process may still hold an older imported class definition.
    result=PoseResult(is_detected=getattr(pose,'is_detected',False),
        landmarks=getattr(pose,'landmarks',None),
        confidence=getattr(pose,'confidence',0.0),
        angles=getattr(pose,'angles',None),
        annotated_image=getattr(pose,'annotated_image',None))
    for name in ('measurement_issues','angle_confidence','angle_sources'):
        setattr(result,name,dict(getattr(pose,name,None) or {}))
    return result


ANALYSIS_SCHEMA_VERSION=4


def prepare_session(state):
    if state.get('analysis_schema_version')==ANALYSIS_SCHEMA_VERSION:
        return False
    had_analysis='analysis_data' in state
    for key in list(state):
        if key.startswith('motion_') or key in ('analysis_data','analysis_report','report_signature'):
            del state[key]
    state['analysis_schema_version']=ANALYSIS_SCHEMA_VERSION
    return had_analysis
