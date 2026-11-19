"""Deterministic measurement scores. Reference constants live only in reference.js."""
import json
import math
from functools import lru_cache
from pathlib import Path
import re
import coach

@lru_cache(maxsize=1)
def constants():
    source=(Path(__file__).resolve().parent/'web/reference.js').read_text()
    return json.loads(re.search(r'const scoring = (\{[^;]+\});',source)[1])


def compute(track):
    rules=constants();model=coach.model();m=track['meta'];items=[];excluded=[]
    if not m.get('usable'):return dict(total=None,items=[],measured_count=0,excluded=list(model))
    start=m['source_frames'][0];address=track['track'][m['phase_frames']['address']-start]
    for phase,k in [('top',1),('down',2),('impact',3),('finish',4)]:
        i=m['phase_frames'][phase]-start;row=track['track'][i]
        for channel in model:
            col=track['channels'].index(channel);actual=row[col]
            grades=m.get('channel_confidence',{}).get(channel);grade=grades[i] if grades else row[track['channels'].index('confidence')]
            key=phase+'_'+channel
            if actual is None or address[col] is None or grade is None or grade<.3 or channel in m.get('unavailable',[]) or channel in m.get('modeled',[]) or (phase=='impact' and m.get('impact_verified') is False):
                excluded.append(key);continue
            normalized=channel in coach.DISTANCES
            measured=actual if normalized else math.degrees(actual)
            baseline=address[col] if normalized else math.degrees(address[col])
            reference=baseline+model[channel][k]-model[channel][0]
            delta=measured-reference;tolerance=rules['tolerances'][channel]
            score=max(0,min(100,100-abs(delta)/tolerance*100))
            state='적정' if abs(delta)<=tolerance else '부족' if delta<0 else '과다'
            items.append(dict(id=key,channel=channel,phase=phase,score=round(score,2),measured=round(measured,4),reference=round(reference,4),state=state,weight=rules['weights'][channel]))
    denominator=sum(i['weight'] for i in items)
    total=round(sum(i['score']*i['weight'] for i in items)/denominator,2) if denominator else None
    return dict(total=total,items=items,measured_count=len(items),excluded=excluded)
