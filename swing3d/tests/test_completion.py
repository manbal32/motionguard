from copy import deepcopy
import json
from pathlib import Path
from uuid import uuid4
import pytest
import coach,customer_report,profiles,scoring,swing_track,video_pose
ROOT=Path(__file__).resolve().parents[1]
@pytest.fixture
def analysis():
    f,fps=swing_track.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'));track=swing_track.build_track(f,fps);track['track_id']='a'*64
    provider=coach.Gemini();provider.key=''
    doc=coach.analyze(track,dict(concern='백스윙 탑 회전',improvement='',hypothesis='',goal='회전 순서'),provider)
    doc.update(score=scoring.compute(track),report_id=uuid4().hex,track_id=track['track_id']);doc['customer_report']=customer_report.build(doc,track)
    return doc,track

def test_report_language(analysis):
    doc,track=analysis;body=doc['customer_report']
    for word in ('신뢰도','프레임','정규화','채널'):assert word not in json.dumps(body,ensure_ascii=False)
    assert all(customer_report.meaningful(i) for i in body['improvements'])
    assert not customer_report.meaningful({'measured':1,'reference':1,'channel':'torso'})
    assert len(body['improvements'])==3

def test_profile_accumulate(tmp_path,analysis):
    doc,track=analysis;pid=str(uuid4());profiles.save(tmp_path,doc,track,pid)
    assert doc['session']==1 and 'comparison_history' not in doc
    second=deepcopy(doc);second['report_id']=uuid4().hex;profiles.save(tmp_path,second,track,pid)
    assert second['session']==2 and second['comparison_history']['comparable']
    assert second['comparison_history']['total_delta']==0
    a,b=second['profile']['entries'];b=deepcopy(b);b['items'].pop();b['item_keys'].pop()
    c=profiles.compare(a,b);assert not c['comparable'] and c['excluded_items']
    b['conditions']['camera']='other';assert not profiles.compare(a,b)['shared_items']
    profiles.delete(tmp_path,pid);assert profiles.load(tmp_path,pid) is None
    assert not list((tmp_path/'reports').glob('*.json'))

def test_profile_privacy(tmp_path,analysis):
    doc,track=analysis;pid=str(uuid4());profiles.save(tmp_path,doc,track,pid)
    entry=profiles.load(tmp_path,pid)['entries'][0]
    assert set(entry)=={'report_id','date','score_total','items','measured_count','conditions','item_keys'}
    for item in entry['items']:assert set(item)=={'id','channel','phase','score','measured'}
    text=(tmp_path/'profiles'/(pid+'.json')).read_text()
    for key in ('pose_landmarks','world_landmarks','conversation_summary','evidence','video_path'):assert key not in text
    assert (tmp_path/'reports'/(doc['report_id']+'.json')).is_file()
    with pytest.raises(ValueError):profiles.load(tmp_path,'../../escape')

def test_strokes_deterministic(analysis):
    doc,_=analysis;s=doc['score'];items=doc['customer_report']['improvements'];a=profiles.strokes(s,items)
    assert a==profiles.strokes(deepcopy(s),deepcopy(items))
    rules=scoring.constants();expected=sum(i['weight']*(100-i['score'])/100*rules['stroke_impact'][i['channel']] for i in s['items'])
    assert abs(a['penalty']-expected)<.00001
    assert a['current'][0]<=a['current'][1] and a['after'][0]<=a['current'][0]
    missing=deepcopy(s);missing['items'].pop();missing['excluded'].append('missing')
    b=profiles.strokes(missing,items);assert b['current'][1]-b['current'][0]>a['current'][1]-a['current'][0]
    assert a['condition']==profiles.CONDITION

@pytest.mark.parametrize('name',['golf_swing.mp4','golf_swing_portrait.mp4'])
def test_no_swing_samples(name):
    f,fps=video_pose.extract(str(ROOT/'samples'/name))[:2];track=swing_track.build_track(f,fps)
    assert not track['meta']['usable'] and track['meta']['unusable_reason']=='no_swing'
    assert set(map(len,f))=={22}


def test_exaggeration_px(tmp_path):
    """Measure the live 390px canvas; assertions live beside the pixel sampler."""
    import os,subprocess,sys
    output=tmp_path/'avatar.json'
    run=subprocess.run([sys.executable,str(ROOT/'tests/build_browser.py')],env=dict(os.environ,BUILD_BROWSER_RESULT=str(output)),capture_output=True,text=True)
    assert run.returncode==0,run.stdout+run.stderr
    result=json.loads(output.read_text())
    assert result['exact390']['maxJointPx']>=20
    assert result['exact390']['exclusiveRatio']>=.05
    assert result['allFrames']['maximumAvatarPixelsInOuter8']==0


def test_browser_calculation_matches_python():
    import os,subprocess
    run=subprocess.run(['node',str(ROOT/'tests/test_browser_core.cjs')],env=dict(os.environ,PYTHON=__import__('sys').executable),capture_output=True,text=True)
    assert run.returncode==0,run.stdout+run.stderr
