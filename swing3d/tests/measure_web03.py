"""Stage-one real-video gates. Exit 1 means a measured or unmeasured failure.

From swing3d: python3 tests/measure_web03.py --baseline /path/to/baseline.json
The optional baseline JSON is [{"sample":"name", "times":[seconds,...]}, ...].
Use medians of three warm runs of the previous extractor on the same machine.
"""
import argparse
import json
import math
from pathlib import Path
import statistics
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import swing_track as st
import video_pose as vp


def measure(path, runs, baseline_times):
    vp.extract(str(path))  # warm up imports, model/runtime and decoder
    times = []
    for _ in range(runs):
        start = time.perf_counter()
        frames, fps = vp.extract(str(path))[:2]
        times.append(time.perf_counter() - start)
    track = st.build_track(frames, fps)
    m, phases = track['meta'], track['meta']['phase_frames']
    have_phases = all(p in phases for p in ('address', 'top', 'down', 'impact', 'finish'))
    local = {p: f - m['source_frames'][0] for p, f in phases.items()}
    hand_y = {p: st._mid(frames[f], 'LEFT_WRIST', 'RIGHT_WRIST')[1] for p, f in phases.items()}
    angles = {p: {c: track['track'][i][st.CHANNELS.index(c)] for c in ('torso', 'hips')}
              for p, i in local.items()}
    elapsed = (phases['impact'] - phases['top']) / fps if have_phases else None
    fraction = (phases['down'] - phases['top']) / (phases['impact'] - phases['top']) if have_phases else None
    baseline = statistics.median(baseline_times) if baseline_times else None
    median = statistics.median(times)
    ratio = median / baseline if baseline else None
    alignment = m.get('crop_alignment_error_max')
    tops = angles.get('top', {})
    gates = {
        'shoulder_width_at_least_0.20': m['shoulder_width_max'] is not None and m['shoulder_width_max'] >= 0.20,
        'acceptance_at_least_70_percent': m['accepted_frames'] / m['total_frames'] >= 0.70,
        'five_phases': have_phases,
        'top_to_impact_0.15_to_1.50s': have_phases and 0.15 <= elapsed <= 1.50,
        'down_at_25_to_75_percent': have_phases and 0.25 <= fraction <= 0.75,
        'address_hands_below_top': have_phases and hand_y['address'] > hand_y['top'],
        'cross_pass_shoulder_error_at_most_0.05': alignment is not None and alignment <= 0.05,
        'top_rotations_nonzero_or_null': have_phases and all(v is None or v != 0 for v in tops.values()),
        'runtime_at_most_1.6_baseline': ratio is not None and ratio <= 1.6,
    }
    return dict(sample=path.name, fps=fps, source_frames=m['source_frames'], phase_frames=phases,
                usable=m['usable'], reason=m['unusable_reason'], shoulder_width_max=m['shoulder_width_max'],
                accepted_frames=m['accepted_frames'], total_frames=m['total_frames'],
                accepted_ratio=m['accepted_frames'] / m['total_frames'],
                all_phases_accepted=all(track['frame_status'][f]['accepted'] for f in phases.values()) if have_phases else False,
                top_to_impact_s=elapsed, down_fraction=fraction, hand_y_crop=hand_y,
                phase_angles_rad=angles,
                phase_angles_degrees={p: {c: None if v is None else math.degrees(v) for c, v in a.items()} for p, a in angles.items()},
                camera=m['camera_facing'], width_ratio=m['address_shoulder_width_ratio'],
                crop_box=m.get('crop_box'), alignment_error_max=alignment,
                alignment_error_mean=m.get('crop_alignment_error_mean'), alignment_samples=m.get('crop_alignment_samples'),
                baseline_times=baseline_times, baseline_median_s=baseline, two_pass_times=times,
                two_pass_median_s=median, runtime_ratio=ratio, gates=gates)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--runs', type=int, default=3)
    args = parser.parse_args()
    if args.runs < 1:
        parser.error('--runs must be positive')
    baseline = json.loads(args.baseline.read_text()) if args.baseline else []
    times = {Path(r['sample']).stem: r['times'] for r in baseline}
    result = [measure(ROOT / 'samples' / name, args.runs, times.get(Path(name).stem, []))
              for name in ('golf_swing.mp4', 'golf_swing_portrait.mp4')]
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if all(all(r['gates'].values()) for r in result) else 1)
