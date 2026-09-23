"""Measurement-grounded reporting and explicit model disease-term labels."""
from __future__ import annotations
import json
import os
from dataclasses import dataclass, asdict, field
from typing import Any, Dict, List, Optional

from .risk_assessor import assess_pose, injury_warnings, ANGLE_KEYS, valid_angle
from .feedback import phase_tables, usable, inference_context
from .gemini_diagnostics import error_metadata, save_diagnostics
from .motion_payload import build_motion_payload, validate_findings


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

    motion_findings: List[Dict[str, Any]] = field(default_factory=list)
    api_diagnostics: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self):
        return asdict(self)


class RequestBudgetError(RuntimeError):
    """No generation request is sent when the input budget cannot be verified."""


class GeminiAnalyzer:
    def __init__(self, api_key=None, model='gemini-3.5-flash-lite', mock=None, strict_errors=False, http_options=None):
        self.strict_errors = strict_errors
        self.http_options = http_options
        self.api_key=api_key or os.getenv('GEMINI_API_KEY')
        self.model=os.getenv('GEMINI_MODEL') or model
        self.mock=(os.getenv('MOTIONGUARD_MOCK_GEMINI','0')=='1') if mock is None else mock

    def analyze(self, frames, pose_data=None, sport='golf', user_context=None):
        self._diagnostics = {}
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
            self._motion_payload = build_motion_payload(filtered, user_context)
            result=self._real_gemini_analysis(frames,filtered,sport,inference_context(user_context))
            # Tables are always based on measured values, never on a model's guessed angles.
            result.phase_feedback,result.measurement_quality=phase_tables(rows)
            result.risk_assessment=[assess_pose(r) for r in valid]
            return result.to_dict()
        except Exception as exc:
            self._diagnostics.update(model=self.model, outcome='blocked' if isinstance(exc, RequestBudgetError) else 'failed', error=error_metadata(exc, self.api_key))
            save_diagnostics(self._diagnostics)
            if self.strict_errors:
                raise
            reason='gemini_quota_or_rate_limit' if any(s in str(exc).lower() for s in ('429','quota','rate','resource_exhausted')) else 'gemini_error'
            fallback = self._mock_analysis(frames,rows,sport,user_context,reason)
            fallback.summary = ('입력 토큰을 안전하게 확인하지 못했거나 한도를 넘어 Gemini 생성을 중단했습니다.' if isinstance(exc, RequestBudgetError) else 'Gemini 요청에 실패했습니다.') + ' 아래 표는 로컬 측정 결과이며 AI 해석이 아닙니다.'
            fallback.api_diagnostics = self._diagnostics
            return fallback.to_dict()

    def _real_gemini_analysis(self, frames, pose_data, sport, user_context):
        if not self.api_key:
            raise RuntimeError('GEMINI_API_KEY is not set.')
        from google import genai
        from google.genai import types
        payload = self._motion_payload
        prompt = self._build_prompt(sport,pose_data,user_context,len(frames), payload=payload)
        self._diagnostics = {
            'model': self.model, 'payload_type': 'text_coordinates_and_angles',
            'image_count': 0, 'video_count': 0, 'phase_count': len(pose_data),
            'series_rows': payload['original_frame_count'],
            'selected_rows': len(payload['samples']), 'input_token_limit': 50000,
            'payload_schema': payload['schema_version'],
            'prompt_characters': len(prompt), 'prompt_utf8_bytes': len(prompt.encode('utf-8')),
        }
        if len(prompt) > 150000:
            self._diagnostics['block_reason'] = 'prompt_character_limit'
            raise RequestBudgetError('Input exceeds local character budget')
        # One generation attempt: do not hide rate limits behind automatic retries.
        options = self.http_options if self.http_options is not None else types.HttpOptions(
            timeout=60000, retry_options=types.HttpRetryOptions(attempts=1))
        with genai.Client(api_key=self.api_key, http_options=options) as client:
            try:
                counted = client.models.count_tokens(model=self.model, contents=prompt)
                self._diagnostics['input_tokens'] = counted.total_tokens
            except Exception as exc:
                self._diagnostics['token_count_error'] = error_metadata(exc, self.api_key)
                self._diagnostics['block_reason'] = 'token_count_unavailable'
                raise RequestBudgetError('Token count unavailable') from exc
            if not isinstance(counted.total_tokens, int) or counted.total_tokens > 50000 or counted.total_tokens < 0:
                self._diagnostics['block_reason'] = 'input_token_limit'
                raise RequestBudgetError('Input exceeds local token budget')
            response=client.models.generate_content(model=self.model, contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type='application/json', max_output_tokens=4096,
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)))
        usage = getattr(response, 'usage_metadata', None)
        if usage is not None:
            self._diagnostics['usage'] = {
                name: getattr(usage, name, None) for name in (
                    'prompt_token_count', 'candidates_token_count',
                    'thoughts_token_count', 'total_token_count')}
        self._diagnostics['outcome'] = 'success'
        save_diagnostics(self._diagnostics)
        raw=getattr(response,'text',None) or str(response)
        parsed=self._safe_parse_json(raw)
        return GeminiAnalysisResult(sport=sport,mode='real_gemini' if parsed else 'real_gemini_unparsed',
            summary='선택한 움직임 구간에 대한 Gemini 해석입니다. 근거 수치의 일치 여부와 부상 관련 해석의 타당성은 별개입니다.' if parsed else '모델 응답 형식을 확인하지 못했습니다. 원문을 확인하세요.',
            motion_findings=validate_findings(parsed, payload) if parsed else [],
            raw_response=raw, api_diagnostics=self._diagnostics)

    def _build_prompt(self, sport, pose_data, user_context, frame_count, payload=None):
        payload = payload if payload is not None else build_motion_payload(pose_data, user_context)
        return """MotionGuard 골프 움직임 연구 해석. 입력은 로컬 계산한 2D 각도, 기준 대비 차이,
직전 유효 인접 프레임 대비 각속도와 일부 관절 좌표다. 영상은 제공하지 않는다.
관찰된 움직임에 대해 부담을 검토할 부분(concern), 근거가 있는 긍정적 특징(positive),
판단 불가(uncertain)를 최대 6개 제시하라. 긍정/우려 항목을 억지로 만들지 마라.
빠르거나 각도가 크다는 이유만으로 부상이라고 단정하지 마라. 인접 좌표 튐/보간 가능성을 검토하라.
source가 nearby/interpolation이면 해당 출처의 한계를 명시하라. 신뢰도가 낮거나 결측인 값은 근거로 쓰지 마라.
힘, 토크, 실제 3D 회전, 개인의 부상 확률, 진단, 검증되지 않은 안전 임계값을 생성하지 마라.
선택되지 않은 프레임과 추적되지 않은 관절의 동작을 추측하지 마라. 유지 자세도 힘이 없다는 뜻이 아니다.
observation은 측정 사실, interpretation은 일반 지식에 따른 조건부 가설로 구분하라.
각 항목은 samples에 존재하는 수치(angle_deg/delta_reference_deg/velocity_deg_s)를 1개 이상 정확히 인용하라.
근거 수치 일치는 의학적 타당성 검증이 아니다. 알려지지 않은 병력/통증/훈련량은 next_check에 질문으로 기록하라.
JSON 형식만 반환:
{"findings":[{"category":"concern|positive|uncertain","body_region":"부위",
"observation":"관찰 사실","interpretation":"조건부 해석과 한계","next_check":"추가 확인 사항",
"evidence":[{"frame_idx":0,"metric":"left_shoulder_angle","field":"angle_deg","value":0.0}]}]}
입력:
""" + json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False)

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
