"""Explicit disease-term normalization, never angle -> disease diagnosis.
Pinned reference: NHS ICD-10 5th edition; not KCD or ICD-10-CM billing codes.
"""
SYSTEM = 'ICD-10 (NHS 5th edition)'
SOFT = 'https://classbrowser.nhs.uk/ICD-10-5TH-Edition/vol1/block-m70-m79.htm'
BACK = 'https://classbrowser.nhs.uk/ICD-10-5TH-Edition/vol1/block-m50-m54.htm'
CATALOG = [
    {'term':'내측상과염','code':'M77.0','aliases':['내측상과염','골프 엘보우','골프엘보','medial epicondylitis'], 'source':SOFT},
    {'term':'외측상과염','code':'M77.1','aliases':['외측상과염','테니스 엘보','lateral epicondylitis'], 'source':SOFT},
    {'term':'요통','code':'M54.5','aliases':['요통','low back pain'], 'source':BACK},
]


def map_mentions(mentions, supported_phases):
    rows=[]
    for mention in mentions if isinstance(mentions,list) else []:
        if not isinstance(mention,dict): continue
        term=str(mention.get('term','')).strip()
        phase=str(mention.get('phase',''))
        evidence=str(mention.get('evidence','')).strip()
        entry=next((e for e in CATALOG if term.casefold() in [a.casefold() for a in e['aliases']]),None)
        supported=phase in supported_phases and bool(evidence)
        # Preserve the model's words, including uncertainty/negation, as a research label only.
        code=entry['code'] if entry and supported else None
        rows.append({'phase':phase, 'original_term':term, 'original_statement':str(mention.get('statement','')),
                     'evidence_claim':evidence, 'code_system':SYSTEM, 'code':code,
                     'normalized_term':entry['term'] if entry and supported else None,
                     'status':'용어 매핑 후보·근거와 문맥 검토 필요' if code else '매핑 보류: 질환명 또는 측정 근거 불충분',
                     'source':entry['source'] if entry else None, 'is_diagnosis':False})
    return rows
