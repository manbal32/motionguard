"""Run from swing3d with optional video dependencies: python3 tests/measure_web01.py.

Real-video acceptance is separate from unit tests. Exit 1 means a failed gate.
Source fps and observations are never modified to satisfy an acceptance limit.
"""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import swing_track as st
import video_pose


def measure(path):
    frames, fps = video_pose.extract(str(path))[:2]
    meta = st.build_track(frames, fps)['meta']
    phases = meta['phase_frames']
    address, top, down, impact, finish = (phases[p] for p in
                                         ('address', 'top', 'down', 'impact', 'finish'))
    elapsed = (impact - top) / fps
    fraction = (down - top) / (impact - top)
    cleaned, _ = st._clean_landmarks(frames, fps, channel_quality=True)
    height = lambda sequence, i: st._mid(sequence[i], 'LEFT_WRIST', 'RIGHT_WRIST')[1]
    missing = meta['unavailable']
    gates = {
        'top_to_impact_0.15_to_0.60s': 0.15 <= elapsed <= 0.60,
        'down_at_25_to_75_percent': 0.25 <= fraction <= 0.75,
        'down_to_impact_at_least_0.05s': (impact - down) / fps >= 0.05,
        'address_to_top_at_least_0.30s': (top - address) / fps >= 0.30,
        'impact_to_finish_at_least_0.20s': (finish - impact) / fps >= 0.20,
        'camera_not_front': meta['camera_facing'] != 'front',
        'unavailable_sample_requirement':
            all(c in missing for c in ('torso', 'hips')) if 'portrait' in path.name
            else any(c in missing for c in ('torso', 'hips')),
        'address_hands_below_top': height(frames, address) > height(frames, top),
    }
    return {
        'sample': path.name, 'fps': fps, 'phase_frames': phases,
        'top_to_impact_s': elapsed, 'top_to_down_s': (down - top) / fps,
        'down_fraction': fraction, 'down_to_impact_s': (impact - down) / fps,
        'address_to_top_s': (top - address) / fps,
        'impact_to_finish_s': (finish - impact) / fps,
        'address_hand_y': height(frames, address), 'top_hand_y': height(frames, top),
        'cleaned_address_hand_y': height(cleaned, address),
        'cleaned_top_hand_y': height(cleaned, top),
        'camera_facing': meta['camera_facing'],
        'address_shoulder_width_ratio': meta['address_shoulder_width_ratio'],
        'unavailable': missing, 'gates': gates,
    }


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    results = [measure(root / 'samples' / name) for name in
               ('golf_swing.mp4', 'golf_swing_portrait.mp4')]
    print(json.dumps(results, indent=2, ensure_ascii=False))
    sys.exit(0 if all(all(result['gates'].values()) for result in results) else 1)
