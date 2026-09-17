"""Measurement-grounded reporting and explicit model disease-term labels."""
from __future__ import annotations
import json
import os
from dataclasses import dataclass, asdict, field
from typing import Any, Dict, List, Optional

from .risk_assessor import assess_pose, injury_warnings, ANGLE_KEYS, valid_angle
from .feedback import phase_tables, usable, inference_context
from .disease_labels import map_mentions


@dataclass
class GeminiAnalysisResult:
    sport: str
    mode: str
    summary: str
    phase_feedback: List[Dict[str, Any]] = field(default_factory=list)
    improvements: List[str] = field(default_factory=list)
    drills: List[str] = field(default_factory=list)
    injury_warnings: List[str] = field(default_factory=list)
    youtube_keywords: List[str] = field(default_factory=list)
    raw_response: Optional[str] = None
    risk_assessment: List[Dict[str, Any]] = field(default_factory=list)
    measurement_quality: List[Dict[str, Any]] = field(default_factory=list)
    disease_labels: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self):
        return asdict(self)


class GeminiAnalyzer:
    def __init__(self, api_key=None, model='gemini-1.5-flash', mock=None):
        self.api_key=api_key or os.getenv('GEMINI_API_KEY')
        self.model=os.getenv('GEMINI_MODEL') or model
        self.mock=(os.getenv('MOTIONGUARD_MOCK_GEMINI','0')=='1') if mock is None else mock

    def analyze(self, frames, pose_data=None, sport='golf', user_context=None):
        rows=pose_data or []
        valid=[r for r in rows if usable(r)]
        if not valid:
            feedback, quality=phase_tables(rows)
            return GeminiAnalysisResult(sport=sport,mode='insufficient_data',
                summary='유효한 관절각 데이터가 없어 부담·질환 추론을 보류했습니다. 측정 실패 원인을 확인하세요.',
                measurement_quality=quality).to_dict()
        if self.mock:
            return self._mock_analysis(frames,rows,sport,user_context,'mock_mode_enabled').to_dict()
        try:
            filtered=[{k:v for k,v in r.items() if k not in ANGLE_KEYS or (valid_angle(v) is not None and k not in r.get('excluded_angles',[]))} for r in valid]
            result=self._real_gemini_analysis(frames,filtered,sport,inference_context(user_context))
            # Tables are always based on measured values, never on a model's guessed angles.
            result.phase_feedback,result.measurement_quality=phase_tables(rows)
            result.risk_assessment=[assess_pose(r) for r in valid]
            return result.to_dict()
        except Exception as exc:
            reason='gemini_quota_or_rate_limit' if any(s in str(exc).lower() for s in ('429','quota','rate','resource_exhausted')) else 'gemini_error'
            return self._mock_analysis(frames,rows,sport,user_context,reason).to_dict()

    def _real_gemini_analysis(self, frames, pose_data, sport, user_context):
        if not self.api_key:
            raise RuntimeError('GEMINI_API_KEY is not set.')
        from google import genai
        with genai.Client(api_key=self.api_key) as client:
            response=client.models.generate_content(model=self.model,
                contents=self._build_prompt(sport,pose_data,user_context,len(frames)))
        raw=getattr(response,'text',None) or str(response)
        parsed=self._safe_parse_json(raw)
        labels=map_mentions(parsed.get('disease_mentions',[]) if parsed else [],
                            {r.get('phase') for r in pose_data if usable(r)})
        return GeminiAnalysisResult(sport=sport,mode='real_gemini' if parsed else 'real_gemini_unparsed',
            summary='유효한 관절각으로 기준 구간을 대조했습니다. 모델의 질환 서술은 별도 연구 라벨로 표시합니다.',
            raw_response=raw, disease_labels=labels)

    def _build_prompt(self, sport, pose_data, user_context, frame_count):
        return f"""MotionGuard 연구 분석. 종목: {sport}, 핵심 프레임 수: {frame_count}
유효 관절각:
{json.dumps(pose_data or [],ensure_ascii=False)}
연구 입력:
{json.dumps(user_context or {},ensure_ascii=False)}
측정되지 않은 각도나 제외된 프레임을 추론 근거로 쓰지 마라.
angle_sources의 보간/인접 프레임 출처를 그대로 명시하고, 인접 프레임 각도를 정확한 이벤트 순간의 측정값으로 표현하지 마라.
몸통 기울기는 요추 회전각이 아니다. 세 각도만으로 통증·질환이나 공식 RULA/REBA 최종 등급을 판정할 수 없다.
일반적인 종목 지식을 해당 피험자의 관찰 결과처럼 작성하지 마라.
질환 서술이 있다면 phase, 질환명 term, 원문 statement, 실제 입력에 존재하는 evidence를 함께 기록하라.
'팔꿈치 부담'처럼 부위만 있는 표현을 임의의 구체적 질환으로 바꾸지 마라.
질환명은 진단이 아니라 연구에서 검증할 모델 서술이다. 코드 자체를 생성하지 마라.
근거가 없으면 disease_mentions는 빈 배열로 둔다. JSON만 반환:
{{"summary":"요약", "phase_feedback":[{{"phase":"국면","finding":"발견","evidence":"측정 근거","suggestion":"제안"}}],
"disease_mentions":[{{"phase":"국면","term":"질환명","statement":"원문·부정/불확실성 포함","evidence":"측정값과 프레임 근거"}}]}}
"""

    def _mock_analysis(self, frames, pose_data, sport, user_context, reason):
        rows=pose_data or []
        valid=[r for r in rows if usable(r)]
        feedback,quality=phase_tables(rows)
        return GeminiAnalysisResult(sport=sport,mode=f'mock_fallback:{reason}',
            summary=f'유효 각도가 있는 {len(valid)}개 국면을 측정값으로 정리했습니다. Mock은 질환을 추론하지 않습니다.',
            phase_feedback=feedback, measurement_quality=quality,
            injury_warnings=injury_warnings(valid) if valid else [],
            risk_assessment=[assess_pose(r) for r in valid])

    def _safe_parse_json(self,text):
        try:
            value=json.loads(text)
        except (json.JSONDecodeError,TypeError):
            start,end=text.find('{'),text.rfind('}')
            try: value=json.loads(text[start:end+1])
            except (json.JSONDecodeError,TypeError): return None
        return value if isinstance(value,dict) else None
