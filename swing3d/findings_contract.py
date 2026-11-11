"""Validate coaching findings loaded from a local JSON file."""
import math

from swing_track import CHANNELS

SCHEMA = "motionguard.findings/1"
POSE_CHANNELS = set(CHANNELS) - {"confidence"}
CAMERAS = {"front", "dtl", "high", "wrist"}


def number(value):
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def validate_findings(data, *, wrist_source="forearm"):
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        raise ValueError(f"schema는 {SCHEMA}이어야 합니다.")
    if data.get("reference") != "model":
        raise ValueError("reference는 model이어야 합니다.")
    findings = data.get("findings")
    if not isinstance(findings, list):
        raise ValueError("findings는 배열이어야 합니다.")
    seen = set()
    for index, item in enumerate(findings):
        prefix = f"findings[{index}]"
        if not isinstance(item, dict):
            raise ValueError(f"{prefix}는 객체여야 합니다.")
        for field in ("id", "label"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                raise ValueError(f"{prefix}.{field}는 비어 있지 않은 문자열이어야 합니다.")
        if item["id"] in seen:
            raise ValueError(f"{prefix}.id가 중복됩니다.")
        seen.add(item["id"])
        if "channel" in item:
            channel = item["channel"]
            if not isinstance(channel, str) or channel not in POSE_CHANNELS:
                raise ValueError(f"{prefix}.channel은 스윙 자세 채널이어야 합니다.")
            if channel == "wrist" and wrist_source != "index":
                raise ValueError(f"{prefix}.channel: wrist 판정에는 검지 기반 측정이 필요합니다.")
        if "range" in item:
            bounds = item["range"]
            if (not isinstance(bounds, list) or len(bounds) != 2
                    or not all(map(number, bounds)) or not 0 <= bounds[0] < bounds[1] <= 1):
                raise ValueError(f"{prefix}.range는 0~1 사이의 오름차순 구간이어야 합니다.")
        pose = "channel" in item and "range" in item
        for field in ("measured", "reference"):
            if (pose or field in item) and not number(item.get(field)):
                raise ValueError(f"{prefix}.{field}는 유한한 도 단위 숫자여야 합니다.")
        choices = {"direction": {"excess", "deficit"}, "severity": {"low", "medium", "high"},
                   "camera": CAMERAS}
        for field, allowed in choices.items():
            value = item.get(field)
            if (pose or field in item) and (not isinstance(value, str) or value not in allowed):
                raise ValueError(f"{prefix}.{field} 허용값: {', '.join(sorted(allowed))}")
        terms = item.get("youtube", [])
        if not isinstance(terms, list) or any(not isinstance(term, str) or not term.strip() for term in terms):
            raise ValueError(f"{prefix}.youtube는 비어 있지 않은 검색어의 배열이어야 합니다.")
    return data
