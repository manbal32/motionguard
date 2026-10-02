"""Allowlisted API diagnostics; never persist request bodies or raw errors."""
import re


def error_details(exc, api_key=None):
    def safe(value):
        if not isinstance(value, (str, int, float)):
            return None
        value = str(value)
        if api_key:
            value = value.replace(api_key, '[redacted]')
        if not re.fullmatch(r'[A-Za-z0-9_./ :\-]{1,200}', value):
            return None
        return value

    raw = getattr(exc, 'details', {})
    if isinstance(raw, dict):
        raw = raw.get('error', raw)
    details = raw.get('details', []) if isinstance(raw, dict) else []
    result = {'quota_violations': [], 'retry_delay': None}
    for item in details if isinstance(details, list) else []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get('@type', ''))
        if kind.endswith('/google.rpc.QuotaFailure'):
            violations = item.get('violations', [])
            for violation in violations if isinstance(violations, list) else []:
                if not isinstance(violation, dict):
                    continue
                row = {key: safe(violation.get(key)) for key in
                       ('quotaMetric', 'quotaId', 'quotaValue')}
                dimensions = violation.get('quotaDimensions', {})
                if isinstance(dimensions, dict):
                    row.update({key: safe(dimensions.get(key)) for key in ('model', 'location')})
                result['quota_violations'].append({k: v for k, v in row.items() if v is not None})
        elif kind.endswith('/google.rpc.RetryInfo'):
            result['retry_delay'] = safe(item.get('retryDelay'))
    return result
