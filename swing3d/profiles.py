"""Summary-only browser profiles and reproducible provisional stroke estimates."""
import json
from datetime import datetime, timezone
from uuid import UUID
import scoring

CONDITION='평지가 많은 코스 기준입니다. 언듈레이션이 심하거나 그린이 까다로운 코스에서는 더 나올 수 있습니다. 스윙 계측에서 나온 추정이며 경기 기록이 아닙니다.'

def identity(value):
    try:
        if str(UUID(value)) != value: raise ValueError()
    except (ValueError,TypeError,AttributeError): raise ValueError('프로필 ID가 올바르지 않습니다.') from None
    return value

def load(root,value):
    file=root/'profiles'/(identity(value)+'.json')
    return json.loads(file.read_text()) if file.is_file() else None

def write(file,data):
    file.parent.mkdir(parents=True,exist_ok=True)
    temp=file.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8');temp.replace(file)

def conditions(track):
    m=track['meta']
    return {'source':'video' if track.get('evidence') else 'csv','camera':m.get('camera_facing','unknown'),
            'fps':round(m.get('fps',0),2),'input':m.get('original_size'), 'rotation_model':m.get('rotation_model'),'measurement_revision':m.get('measurement_revision',10),
            'unknown_capture':track.get('track_id') if not m.get('original_size') else None}

def compare(previous,current):
    if previous['conditions']!=current['conditions']:
        return {'comparable':False,'shared_items':[],'message':'촬영 조건이 달라 이번 기록의 변화량은 비교하지 않았습니다.'}
    left={i['id']:i for i in previous['items']};right={i['id']:i for i in current['items']}
    shared=sorted(left.keys()&right.keys())
    partial=previous['item_keys']!=current['item_keys']
    result={'comparable':not partial and current['score_total'] is not None and previous['score_total'] is not None,
            'shared_items':[{'id':k,'score_delta':round(right[k]['score']-left[k]['score'],2)} for k in shared],
            'excluded_items':sorted(left.keys()^right.keys()),
            'message':'빠진 항목은 비교에서 제외했습니다. 공통 항목만 비교하며 총점 그래프는 비워 둡니다.' if partial else '같은 촬영 조건과 같은 항목으로 지난 기록과 비교했습니다.'}
    if result['comparable']:result['total_delta']=round(current['score_total']-previous['score_total'],2)
    return result

def strokes(score,improvements):
    rules=scoring.constants();selected={i['id'] for i in improvements};contributions=[]
    for i in score['items']:
        penalty=rules['weights'][i['channel']]*(100-i['score'])/100*rules['stroke_impact'][i['channel']]
        contributions.append({'id':i['id'],'weight':rules['weights'][i['channel']],'score':i['score'],'impact':rules['stroke_impact'][i['channel']],'penalty':round(penalty,6)})
    penalty=sum(c['penalty'] for c in contributions);after=sum(c['penalty'] for c in contributions if c['id'] not in selected)
    missing=len(score['excluded']);uncertainty=2+missing*rules['missing_item_uncertainty'];base=rules['base_strokes']
    return {'base':base,'penalty':round(penalty,6),'current':[round(base+penalty-uncertainty,1),round(base+penalty+uncertainty,1)],
            'after':[round(base+after-uncertainty,1),round(base+after+uncertainty,1)],'contributions':contributions,
            'condition':CONDITION,'basis':'기준 타수 + Σ(항목 가중치 × (100−점수)/100 × 항목 영향 계수). 선택한 개선점만 교본값(100점)에 맞춘 경우를 계산했습니다. 영향 계수는 잠정 기준입니다.',
            'missing_note':f'재지 못한 {missing}개 항목은 합산에서 제외하고 범위를 항목당 ±{rules["missing_item_uncertainty"]}타 넓혔습니다.' if missing else '모든 계측 항목을 반영했으며 범위는 ±2타입니다.'}

def save(root,doc,track,profile_id=None):
    doc['session']=1
    if profile_id is not None:
        profile=load(root,profile_id) or {'profile_id':profile_id,'entries':[]}
        score=doc['score'];entry={'report_id':doc['report_id'],'date':datetime.now(timezone.utc).isoformat(),'score_total':score['total'],
            'items':[{k:i[k] for k in ('id','channel','phase','score','measured')} for i in score['items']],
            'measured_count':score['measured_count'],'conditions':conditions(track),'item_keys':sorted(i['id'] for i in score['items'])}
        if profile['entries']:doc['comparison_history']=compare(profile['entries'][-1],entry)
        profile['entries'].append(entry);doc.update(profile_id=profile_id,profile=profile,session=len(profile['entries']))
        write(root/'profiles'/(profile_id+'.json'),profile)
    write(root/'reports'/(doc['report_id']+'.json'),doc)

def delete(root,profile_id):
    profile=load(root,profile_id)
    if profile:
        for entry in profile['entries']:
            for folder in ('reports','coaching'):(root/folder/(entry['report_id']+'.json')).unlink(missing_ok=True)
        (root/'profiles'/(profile_id+'.json')).unlink()
