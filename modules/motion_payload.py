"""Bounded motion evidence for model interpretation; full records remain local."""
import math
from .motion_dynamics import METRICS, motion_window

SCHEMA_VERSION = 'motion_evidence_v1'
MAX_SAMPLES = 40
LANDMARKS = [f'{side}_{joint}' for side in ('LEFT', 'RIGHT')
             for joint in ('SHOULDER', 'ELBOW', 'WRIST', 'INDEX', 'HIP')]


def number(value, digits=3):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return round(value, digits)


def source_info(source):
    source = source or {}
    return {k: source[k] for k in ('method', 'frame_idx', 'source_frame', 'event_frame', 'offset_seconds', 'side', 'interpolated_landmarks') if k in source}


def build_motion_payload(pose_data, context=None):
    research = (context or {}).get('research_data') or {}
    series = [r for r in (research.get('series') or [])
              if isinstance(r.get('frame_idx'), int) and not isinstance(r['frame_idx'], bool)]
    reference = (context or {}).get('reference_frame')
    if reference is None:
        reference = next((r.get('frame_idx') for r in pose_data if r.get('frame_idx') is not None),
                         series[0]['frame_idx'] if series else None)
    payload = {
        'schema_version': SCHEMA_VERSION,
        'units': {'time': 'seconds', 'angle': 'degrees (2D image projection)', 'velocity': 'degrees/second',
                  'coordinates': 'MediaPipe normalized image x/y; z is relative model depth, NOT metres or calibrated 3D',
                  'landmark_columns': ['x', 'y', 'z', 'visibility']},
        'reference_frame': reference,
        'sampling_policy': 'At most 40 frames: anchors/endpoints, angle extrema and high angular speed with neighboring frames. Selection is NOT an injury threshold. Omitted frames are not evidence of safety.',
        'limitations': ['Single-view pose estimates; no force, torque, diagnosis or injury probability measured.',
                       'Velocity is computed before selection using adjacent valid original frames only; missing intervals are not bridged.',
                       'Extremes may be tracking noise; check confidence and interpolation. No universal safe-angle threshold is supplied.'],
        'events': [], 'phase_statistics': [], 'samples': [], 'original_frame_count': len(series),
    }
    for row in pose_data[:4]:
        payload['events'].append({
            'phase': row.get('phase'), 'frame_idx': row.get('frame_idx'),
            'angles_deg': {k: number(row.get(k)) for k in ('shoulder_angle', 'wrist_angle', 'spine_angle')
                           if k not in row.get('excluded_angles', [])},
            'angle_sources': {k: source_info(v) for k,v in (row.get('angle_sources') or {}).items()},
            'note': 'shoulder/wrist aggregate can switch sides; do not derive angular velocity from aggregate events.',
        })
    if not series:
        payload['limitations'].append('No full frame series supplied; no velocity or coordinate evidence available. Event angles may use nearby source frames; read source metadata.')
        for row in pose_data[:4]:
            frame = row.get('frame_idx')
            if not isinstance(frame, int): continue
            payload['samples'].append({'frame_idx': frame, 'time_s': number(row.get('timestamp'), 6),
                'phase': row.get('phase'), 'selection': ['event_only'], 'landmarks': {},
                'metrics': {k: {'angle_deg': number(row.get(k)), 'delta_reference_deg': None, 'velocity_deg_s': None,
                               'source': source_info((row.get('angle_sources') or {}).get(k))}
                            for k in ('shoulder_angle','wrist_angle','spine_angle')
                            if number(row.get(k)) is not None and k not in row.get('excluded_angles', [])}})
        payload['selected_frame_count'] = len(payload['samples'])
        payload['omitted_frame_count'] = 0
        return payload
    by_frame = {r['frame_idx']: r for r in series}
    tracks = {key: motion_window(series, key, series[0]['frame_idx'], series[-1]['frame_idx'], reference)
              for key in METRICS}
    track_rows = {key: {s['frame_idx']: s for s in track['samples']} for key,track in tracks.items()}
    selected = set()
    reasons = {}
    def add(frame, reason):
        if frame in by_frame and (frame in selected or len(selected) < MAX_SAMPLES):
            selected.add(frame)
            reasons.setdefault(frame, set()).add(reason)
    # Preserve all anchors before allocating context neighbors.
    anchors = [reference, series[0]['frame_idx'], series[-1]['frame_idx']]
    anchors += [r.get('frame_idx') for r in pose_data[:4]]
    for frame in anchors:
        add(frame, 'reference/anchor/endpoint')
    for frame in anchors:
        if frame is not None:
            for offset in (-1, 1): add(frame + offset, 'anchor_neighbor')
    phases = list(dict.fromkeys(r.get('phase') for r in series))
    candidates_by_phase = []
    for phase in phases:
        candidates = []
        phase_ids = {r['frame_idx'] for r in series if r.get('phase') == phase}
        for key, track in tracks.items():
            rows = [r for r in track['samples'] if r['frame_idx'] in phase_ids and r['angle'] is not None]
            velocities = [r for r in rows if r['velocity_deg_s'] is not None]
            payload['phase_statistics'].append({
                'phase': phase, 'metric': key, 'total_count': len(phase_ids), 'valid_count': len(rows),
                'min_angle': number(min((r['angle'] for r in rows), default=None)),
                'max_angle': number(max((r['angle'] for r in rows), default=None)),
                'peak_abs_velocity_deg_s': number(max((abs(r['velocity_deg_s']) for r in velocities), default=None)),
            })
            if velocities:
                candidates.append((max(velocities, key=lambda r: abs(r['velocity_deg_s']))['frame_idx'], 'peak_speed:' + key))
            if rows:
                candidates.extend([(min(rows, key=lambda r: r['angle'])['frame_idx'], 'min_angle:' + key),
                                   (max(rows, key=lambda r: r['angle'])['frame_idx'], 'max_angle:' + key)])
    # Round-robin phases so an early phase cannot consume the entire budget.
        candidates_by_phase.append(candidates)
    candidates = [group[i] for i in range(max(map(len, candidates_by_phase), default=0))
                  for group in candidates_by_phase if i < len(group)]
    for frame, reason in candidates:
        # Only admit an extreme with its available immediate context as a group.
        group = {f for f in (frame - 1, frame, frame + 1) if f in by_frame}
        if len(selected | group) <= MAX_SAMPLES:
            for f in group: add(f, reason if f == frame else 'change_neighbor')
    for frame in sorted(selected):
        row = by_frame[frame]
        metrics = {}
        for key in METRICS:
            point = track_rows[key][frame]
            if point['angle'] is None: continue
            metrics[key] = {
                'angle_deg': number(point['angle']), 'delta_reference_deg': number(point['delta_reference']),
                'velocity_deg_s': number(point['velocity_deg_s']),
                'velocity_previous_frame': frame - 1 if point['velocity_deg_s'] is not None else None,
                'confidence': number((row.get('angle_confidence') or {}).get(key, row.get('confidence'))),
                'source': source_info((row.get('angle_sources') or {}).get(key)),
            }
        landmarks = {}
        for name in LANDMARKS:
            lm = (row.get('landmarks') or {}).get(name)
            if lm:
                landmarks[name] = [number(lm.get(k), 4) for k in ('x', 'y', 'z', 'visibility')]
        payload['samples'].append({'frame_idx': frame, 'time_s': number(row.get('timestamp'), 6),
            'phase': row.get('phase'), 'selection': sorted(reasons[frame]), 'metrics': metrics, 'landmarks': landmarks})
    payload['selected_frame_count'] = len(payload['samples'])
    payload['omitted_frame_count'] = len(series) - len(payload['samples'])
    return payload


def validate_findings(parsed, payload):
    """Check cited numeric evidence, NOT medical validity of model prose."""
    findings = parsed.get('findings', [])
    if not isinstance(findings, list): return []
    samples = {r['frame_idx']: r for r in payload['samples']}
    output = []
    for item in findings[:8]:
        if not isinstance(item, dict) or item.get('category') not in ('concern', 'positive', 'uncertain'): continue
        checks = []
        evidence = item.get('evidence', [])
        if not isinstance(evidence, list): evidence = []
        for citation in evidence[:8]:
            if not isinstance(citation, dict): continue
            frame, metric, field = (citation.get(k) for k in ('frame_idx', 'metric', 'field'))
            safe_frame = isinstance(frame, int) and not isinstance(frame, bool)
            actual = None
            if safe_frame and isinstance(metric, str) and field in ('angle_deg', 'delta_reference_deg', 'velocity_deg_s'):
                actual = samples.get(frame, {}).get('metrics', {}).get(metric, {}).get(field)
            quoted = number(citation.get('value'))
            matched = actual is not None and quoted is not None and abs(actual - quoted) <= .011
            checks.append({'frame_idx': frame if safe_frame else None, 'metric': metric if isinstance(metric, str) else '',
                           'field': field if isinstance(field, str) else '', 'model_value': quoted,
                           'measured_value': actual, 'matches': matched})
        output.append({k: str(item.get(k, ''))[:1500] for k in ('category', 'body_region', 'observation', 'interpretation', 'next_check')} | {
            'evidence': checks, 'evidence_status': 'matched' if checks and all(c['matches'] for c in checks) else 'unverified'})
    return output
