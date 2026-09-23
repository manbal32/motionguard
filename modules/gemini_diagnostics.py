"""Request metadata only: never persist prompts, coordinates, keys or responses."""
import json
from datetime import datetime, timezone
from pathlib import Path

LOG_PATH = Path(__file__).resolve().parents[1] / 'outputs' / 'gemini_requests.jsonl'


def error_metadata(exc, api_key=None):
    def safe(value):
        text = str(value)
        return (text.replace(api_key, '[REDACTED]') if api_key else text)[:300]
    result = {'type': type(exc).__name__}
    code = getattr(exc, 'code', None)
    if isinstance(code, int):
        result['code'] = code
    payload = getattr(exc, 'details', {})
    if not isinstance(payload, dict):
        return result
    payload = payload.get('error', payload)
    if not isinstance(payload, dict):
        return result
    for detail in payload.get('details', []) or []:
        if not isinstance(detail, dict):
            continue
        if str(detail.get('@type', '')).endswith('QuotaFailure'):
            result['quota_violations'] = [
                {k: safe(v[k]) for k in ('quotaMetric', 'quotaId', 'quotaValue') if k in v}
                for v in detail.get('violations', []) if isinstance(v, dict)]
        elif str(detail.get('@type', '')).endswith('RetryInfo'):
            result['retry_delay'] = safe(detail.get('retryDelay', ''))
    return result


def save_diagnostics(record):
    entry = {'timestamp_utc': datetime.now(timezone.utc).isoformat(), **record}
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + '\n')
    except OSError:
        record['log_write_failed'] = True
