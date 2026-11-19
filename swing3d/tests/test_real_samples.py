"""Real bundled videos: revised November 19 gates, never sample exceptions."""
from pathlib import Path
import pytest
import swing_track as st
import video_pose as vp

@pytest.fixture(scope='module',params=['golf_swing.mp4','golf_swing_portrait.mp4'])
def sample(request):
    pytest.importorskip('mediapipe')
    pytest.importorskip('cv2')
    frames,fps=vp.extract(str(Path(__file__).resolve().parents[1]/'samples'/request.param))[:2]
    return frames,fps,st.build_track(frames,fps)


def test_shoulder_width(sample):
    _,_,t=sample;m=t['meta']
    assert m['shoulder_width_max']*m['crop_box']['resized_side']>=60
    assert m['accepted_frames']/m['total_frames']>=.70


def test_phases_resolved(sample):
    frames,fps,t=sample;p=t['meta']['phase_frames']
    assert set(p)=={'address','top','down','impact','finish'}
    assert .25 <= (p['down']-p['top'])/(p['impact']-p['top']) <= .75
    assert st._mid(frames[p['address']],'LEFT_WRIST','RIGHT_WRIST')[1]>st._mid(frames[p['top']],'LEFT_WRIST','RIGHT_WRIST')[1]
    assert all(t['frame_status'][i]['accepted'] for i in p.values())
    assert (p['impact']-p['top'])/fps>0  # original time is reported; no invented upper bound


def test_real_crop_roundtrip(sample):
    _,_,t=sample
    assert t['meta']['crop_alignment_error_max']<=.05
