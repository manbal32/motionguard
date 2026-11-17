"""WEB_02 real-video gates; run from swing3d: python3 tests/measure_web02.py.

Exit 1 reports unmet gates, including missing phases. No fps or phase adjustment.
"""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import swing_track as st
import video_pose


def measure(path):
    frames, fps = video_pose.extract(str(path))[:2]
    track = st.build_track(frames, fps)
    meta, statuses = track['meta'], track['frame_status']
    phases = meta['phase_frames']
    have_phases = all(p in phases for p in ('address', 'top', 'down', 'impact', 'finish'))
    def geometry(i):
        frame = frames[i]
        y = {key: st._mid(frame, 'LEFT_' + key, 'RIGHT_' + key)[1]
             for key in ('SHOULDER', 'HIP', 'ANKLE', 'WRIST')}
        return dict(frame=i, accepted=statuses[i]['accepted'], shoulder_y=y['SHOULDER'],
                    hip_y=y['HIP'], ankle_y=y['ANKLE'], height=y['ANKLE'] - y['SHOULDER'],
                    hand_y=y['WRIST'], reason=statuses[i]['reason'])
    details = {p: geometry(i) for p, i in phases.items()}
    elapsed = (phases['impact'] - phases['top']) / fps if have_phases else None
    fraction = (phases['down'] - phases['top']) / (phases['impact'] - phases['top']) if have_phases else None
    valid = [frame for frame, item in zip(frames, statuses) if item['accepted']]
    maximum = max(abs(d['LEFT_SHOULDER'][0] - d['RIGHT_SHOULDER'][0]) for d in valid) if valid else None
    gates = {
        'acceptance_ratio_reported': True,
        'all_five_phases_accepted': have_phases and all(d['accepted'] for d in details.values()),
        'phase_heights_above_0.05': have_phases and all(d['height'] > 0.05 for d in details.values()),
        'address_hands_below_top': have_phases and details['address']['hand_y'] > details['top']['hand_y'],
        'top_to_impact_0.15_to_1.50s': have_phases and 0.15 <= elapsed <= 1.50,
        'down_at_25_to_75_percent': have_phases and 0.25 <= fraction <= 0.75,
    }
    return dict(sample=path.name, fps=fps, usable=meta['usable'], reason=meta['unusable_reason'],
                accepted_frames=meta['accepted_frames'], total_frames=meta['total_frames'],
                acceptance_ratio=meta['accepted_frames'] / meta['total_frames'],
                first_accepted=next((s['frame'] for s in statuses if s['accepted']), None),
                phase_details=details, top_to_impact_s=elapsed, down_fraction=fraction,
                camera_facing=meta['camera_facing'], address_shoulder_width_ratio=meta['address_shoulder_width_ratio'],
                accepted_raw_shoulder_width_max=maximum, unavailable=meta['unavailable'],
                non_null_measurements=sum(v is not None for row in track['track'] for v in row[:-1]),
                source_probes=[geometry(i) for i in (14, 32, 39, 50, 68, 104, 140, 194) if i < len(frames)],
                gates=gates)


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    results = [measure(root / 'samples' / name) for name in ('golf_swing.mp4', 'golf_swing_portrait.mp4')]
    print(json.dumps(results, indent=2, ensure_ascii=False))
    sys.exit(0 if all(all(r['gates'].values()) for r in results) else 1)
