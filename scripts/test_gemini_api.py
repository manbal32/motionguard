"""Sequential real Gemini smoke test. Run from any working directory."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv
from modules.gemini_analyzer import GeminiAnalyzer


def quota_error(exc):
    code = str(getattr(exc, 'code', '') or getattr(exc, 'status_code', ''))
    text = str(exc).lower()
    return code == '429' or any(x in text for x in ('429', 'quota', 'resource_exhausted', 'rate limit', 'rate_limit'))


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.json.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    temp.replace(path)


def extract_angles(path, threshold):
    from modules.video_loader import VideoLoader
    from modules.pose_analyzer import PoseAnalyzer
    from modules.frame_selector import FrameSelector
    from modules.angle_recovery import recover_angles, resolve_event_angles
    frames = VideoLoader(str(path)).load_frames()
    if len(frames) < 5:
        raise ValueError('영상에 최소 5프레임이 필요합니다.')
    analyzer = PoseAnalyzer(sport='golf')
    try:
        if analyzer._mode == 'none':
            raise RuntimeError('MediaPipe를 사용할 수 없습니다.')
        raw = analyzer.analyze_frames(frames)
    finally:
        analyzer.close()
    events = [k for k in FrameSelector().select(frames, raw) if k.event_type != 'finish']
    poses = recover_angles(frames, raw, threshold)
    rows = resolve_event_angles(frames, poses, events, threshold)
    return rows, len(frames)


def run_batch(paths, output, analyzer, threshold=.5):
    progress = {'started_at': datetime.now(timezone.utc).isoformat(), 'model': analyzer.model,
                'completed': [], 'insufficient_data': [], 'remaining': [p.name for p in paths],
                'status': 'running'}
    for position, path in enumerate(paths, 1):
        print(f'[{position}/{len(paths)}] {path.name}: 전체 좌표 추출 및 자동 4국면 각도 계산', flush=True)
        stage = 'pose_extraction'
        try:
            rows, count = extract_angles(path, threshold)
            stage = 'gemini_api'
            print(f'[{position}/{len(paths)}] {path.name}: Gemini 요청 (유효 각도만 전달)', flush=True)
            # Only four phase observations are sent, not images or the full time series.
            result = analyzer.analyze([None] * 4, pose_data=rows, sport='golf',
                user_context={'angle_method': '2d_pixel_projection', 'confidence_threshold': threshold})
            if result['mode'] not in ('real_gemini', 'real_gemini_unparsed', 'insufficient_data'):
                raise RuntimeError('실연동 테스트에 Mock 결과가 반환되었습니다.')
            stage = 'save_result'
            save_json(output / f'{path.stem}.json', {
                'video': path.name, 'model': analyzer.model,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'frame_count': count, 'confidence_threshold': threshold,
                'phase_angles': rows, 'result': result})
            category = 'insufficient_data' if result['mode'] == 'insufficient_data' else 'completed'
            progress[category].append(path.name)
            progress['remaining'].remove(path.name)
            print(f"[{position}/{len(paths)}] 저장 완료: {path.stem}.json ({result['mode']})", flush=True)
            save_json(output / 'progress.json', progress)
        except Exception as exc:
            is_quota = quota_error(exc)
            progress.update(status='stopped_quota' if is_quota else 'stopped_error',
                failed_video=path.name, failed_stage=stage, error_type=type(exc).__name__)
            # Do not print raw exceptions: SDK errors can include request details or credentials.
            save_json(output / 'progress.json', progress)
            print(f"중단: {path.name} / {stage} / {'429 또는 quota 제한' if is_quota else type(exc).__name__}. 재시도·Mock 대체 없음.", flush=True)
            print(f"API 완료 {len(progress['completed'])}/{len(paths)}, 측정 부족 {len(progress['insufficient_data'])}, 남은 영상: {', '.join(progress['remaining'])}", flush=True)
            return 2 if is_quota else 1
    progress['status'] = 'completed'
    save_json(output / 'progress.json', progress)
    print(f"종료: API 완료 {len(progress['completed'])}/{len(paths)}, 측정 부족 {len(progress['insufficient_data'])}. 저장 위치: {output}", flush=True)
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start', type=int, choices=range(1, 6), default=1, help='재개할 영상 번호 (기본 1)')
    parser.add_argument('--confidence', type=float, default=.5)
    args = parser.parse_args()
    if not 0 <= args.confidence <= 1:
        parser.error('--confidence는 0~1이어야 합니다.')
    load_dotenv(ROOT / '.env')
    paths = [ROOT / 'samples' / f'golf{i}.MP4' for i in range(args.start, 6)]
    missing = [str(p) for p in paths if not p.is_file()]
    missing += [name + ' 환경변수 또는 .env 설정' for name in ('GEMINI_API_KEY', 'GEMINI_MODEL') if not os.getenv(name, '').strip()]
    if not (ROOT / 'models' / 'pose_landmarker.task').is_file():
        missing.append('models/pose_landmarker.task')
    if missing:
        print('실행 준비가 필요합니다:\n- ' + '\n- '.join(missing), flush=True)
        return 1
    from google.genai import types
    analyzer = GeminiAnalyzer(mock=False, strict_errors=True,
        http_options=types.HttpOptions(timeout=120000, retry_options=types.HttpRetryOptions(attempts=1)))
    return run_batch(paths, ROOT / 'outputs' / 'gemini_results', analyzer, args.confidence)


if __name__ == '__main__':
    raise SystemExit(main())
