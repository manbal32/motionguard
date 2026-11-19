"""Customer-facing facts from validated measurements and the approved summary."""
from datetime import datetime
from zoneinfo import ZoneInfo
import coach



def meaningful(item):
    a,b=item.get('measured'),item.get('reference')
    return isinstance(a,(int,float)) and isinstance(b,(int,float)) and round(a-b,3 if item.get('channel') in coach.DISTANCES else 1)!=0


def build(document,track):
    scores={i['id']:i for i in document['score']['items']}
    def clean(text):
        for a,b in {'신뢰도':'관찰 상태','프레임':'시점','정규화':'비율','채널':'동작','과장':'개선 포인트'}.items():text=text.replace(a,b)
        return text
    def entry(item):
        authoritative=scores.get(item['id'],{})
        value={**item,**authoritative}
        name=coach.CHANNELS[value['channel']][0]
        return {k:value[k] for k in ('id','channel','phase','measured','reference','score','state') if k in value} | {
            'title':name,'drill':clean(item.get('drill') or f'{coach.PHASES[value["phase"]]}에서 천천히 멈추고 같은 동작을 반복해 보세요.'),
            'youtube':item.get('youtube',[]),
            'observation':f'{coach.PHASES[value["phase"]]}의 {name} 차이를 확인해 보세요.'}
    improvements=[entry(i) for i in document.get('findings',[]) if i['id'] in scores and meaningful({**i,**scores[i['id']]})]
    rank={'high':3,'medium':2,'low':1}
    priorities={i['id']:rank.get(i.get('severity'),0) for i in document.get('findings',[])}
    improvements.sort(key=lambda i:priorities.get(i['id'],0),reverse=True)
    positives=[entry(i) for i in document.get('positives',[]) if i['id'] in scores and meaningful({**i,**scores[i['id']]})][:2]
    concern=document['conversation_summary']['concern'] or '내 스윙을 확인하고 싶어요.'
    requested=next((p for p,words in [('top',('백스윙','탑')),('down',('다운',)),('impact',('임팩트',)),('finish',('피니쉬','피니시'))] if any(w in concern for w in words)),None)
    phase=coach.PHASES.get(requested,'이번 스윙')
    relevant=[i for i in improvements if i['phase']==requested] or improvements
    focus=next((i for i in relevant if any(w in concern for w in i['title'].split())),relevant[0] if relevant else None)
    if focus:
        # 고객에게는 좌표값을 주지 않는다. 각도는 아는 단위이므로 그대로 쓰고,
        # 정규화한 비율 채널은 교본과의 관계를 말로 바꾼다.
        name=focus['title']; stage=coach.PHASES[focus['phase']]
        gap=focus['measured']-focus['reference']
        # 비율 채널은 그 동작이 실제로 하는 말로 적는다. '작다'는 뒤꿈치에 맞지 않는다.
        WORDS={'heelR':('더 들렸습니다','덜 들렸습니다'),
               'shiftX':('교본보다 더 옮겨졌습니다','교본보다 덜 옮겨졌습니다')}
        if focus['channel'] in coach.DISTANCES:
            said=WORDS.get(focus['channel'],('교본보다 큽니다','교본보다 작습니다'))[gap<=0]
            conclusion=f"{stage}에서 {name}{coach.josa(name,'이','가')} 교본보다 {said}." \
                       if focus['channel']=='heelR' else f"{stage}에서 {name}{coach.josa(name,'이','가')} {said}"
        else:
            conclusion=(f"{stage}의 {name}{coach.josa(name,'은','는')} {focus['measured']:.1f}°입니다. "
                        f"교본{coach.josa('본','은','는')} {focus['reference']:.1f}°입니다.")
    else: conclusion=f'{phase} 동작에서 뚜렷한 차이를 확정하지 않았습니다.'
    return dict(version=2,concern=concern,conclusion=conclusion,improvements=improvements[:3],positives=positives,
                strength=(f'{positives[0]["title"]}{coach.josa(positives[0]["title"],"은","는")} 교본에 가까운 움직임입니다.' if positives else '한 번의 영상에서 유지할 동작을 확정하지 않았습니다.'),
                issued_at=datetime.now(ZoneInfo('Asia/Seoul')).isoformat(timespec='seconds'),
                goal=document['conversation_summary']['goal'],
                measurement_note='회전은 3D 추정값이며 손목은 손끝 방향을 기준으로 비교합니다.')
