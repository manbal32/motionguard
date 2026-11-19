"""WEB_02: reject anatomical impossibilities before measurement input."""
from copy import deepcopy
from unittest import TestCase
from unittest.mock import Mock, patch
import coach
import swing_track as st
from server import ROOT


def skeleton(shoulder=0.3, hip=0.45, ankle=0.7):
    frame = {name: (0.5, 0.5, 0.0, 0.99) for name in st.REQUIRED}
    for part, y in [('SHOULDER', shoulder), ('HIP', hip), ('ANKLE', ankle)]:
        for side in ('LEFT', 'RIGHT'):
            frame[side + '_' + part] = (0.5, y, 0.0, 0.99)
    return frame


class FrameAcceptanceTests(TestCase):
    def test_original_geometry_and_last_accepted_height(self):
        frames = [skeleton(), skeleton(0.6, 0.4, 0.3), skeleton(0.3, 0.8, 0.7),
                  skeleton(0, 0.3, 0.6), skeleton(0.3, 0.32, 0.35),
                  skeleton(0.1, 0.5, 0.9), skeleton()]
        status = st._frame_acceptance(frames)
        self.assertEqual([s['accepted'] for s in status], [True, False, False, False, False, False, True])
        self.assertTrue(all(s['reason'] for s in status if not s['accepted']))
        self.assertEqual([s['frame'] for s in status], list(range(7)))

    def test_forty_percent_boundary_and_reference(self):
        for ankle in (0.86, 0.54):
            with self.subTest(ankle=ankle):
                status = st._frame_acceptance([skeleton(), skeleton(0.3, 0.4, ankle), skeleton()])
                self.assertEqual([s['accepted'] for s in status], [True, False, True])
        self.assertTrue(st._frame_acceptance([skeleton(), skeleton(0.3, 0.4, 0.855)])[1]['accepted'])

    def test_less_than_half_returns_null_without_preprocessing(self):
        frames = [skeleton()] * 4 + [skeleton(0.6, 0.4, 0.3)] * 6
        with patch.object(st, '_clean_landmarks') as clean, patch.object(st, '_index_wrist') as wrist:
            track = st.build_track(frames, 30)
        clean.assert_not_called()
        wrist.assert_not_called()
        meta = track['meta']
        self.assertIs(meta['usable'], False)
        self.assertEqual((meta['accepted_frames'], meta['total_frames']), (4, 10))
        self.assertEqual(meta['unusable_reason'], 'tracking_failed')
        self.assertEqual(meta['phase_frames'], {})
        self.assertEqual(meta['measured'], [])
        self.assertTrue({'torso', 'hips'} <= set(meta['unavailable']))
        self.assertEqual(len(track['frame_status']), 10)
        self.assertTrue(all(row == [None] * 9 + [0.0] for row in track['track']))
        with self.assertRaisesRegex(ValueError, '추적하지 못했습니다'):
            coach.evidence(track)

    def test_rejected_prefix_and_gap_do_not_change_width_or_source_timing(self):
        original, fps = st.load_csv(str(ROOT / 'samples/golf1_export.csv'))
        baseline = st.build_track(original, fps)
        bad = skeleton(0.6, 0.4, 0.3)
        bad['LEFT_SHOULDER'] = (-100, 0.6, 0, 0.99)
        bad['RIGHT_SHOULDER'] = (100, 0.6, 0, 0.99)
        bad['LEFT_WRIST'] = (100, 100, 0, 0.99)
        frames = [deepcopy(bad) for _ in range(20)] + original[:130] + [bad] + original[130:]
        track = st.build_track(frames, fps)
        self.assertTrue(track['meta']['usable'])
        self.assertEqual(track['meta']['accepted_frames'], len(original))
        self.assertEqual(track['meta']['total_frames'], len(frames))
        self.assertEqual(track['meta']['address_shoulder_width_ratio'], baseline['meta']['address_shoulder_width_ratio'])
        source = track['meta']['source_frames'][0]
        self.assertEqual(track['track'][150 - source], [None] * 9 + [0.0])
        for values in track['meta']['channel_confidence'].values():
            self.assertIsNone(values[150 - source])
        for i in track['meta']['phase_frames'].values():
            self.assertTrue(track['frame_status'][i]['accepted'])
            d = frames[i]
            self.assertGreater(st._mid(d, 'LEFT_ANKLE', 'RIGHT_ANKLE')[1] - st._mid(d, 'LEFT_SHOULDER', 'RIGHT_SHOULDER')[1], 0.05)
        phases = track['meta']['phase_frames']
        self.assertEqual(phases['top'], baseline['meta']['phase_frames']['top'] + 21)
        self.assertEqual(phases['impact'], baseline['meta']['phase_frames']['impact'] + 21)
        self.assertEqual(track['meta']['fps'], baseline['meta']['fps'])

    def test_exactly_half_is_not_low_acceptance(self):
        original, fps = st.load_csv(str(ROOT / 'samples/golf1_export.csv'))
        frames = [skeleton(0.6, 0.4, 0.3)] * len(original) + original
        track = st.build_track(frames, fps)
        self.assertTrue(track['meta']['usable'])
        self.assertEqual(track['meta']['accepted_frames'] * 2, track['meta']['total_frames'])
        for i in track['meta']['phase_frames'].values():
            self.assertGreaterEqual(i, len(original))
            self.assertTrue(track['frame_status'][i]['accepted'])

    def test_gap_inside_downswing_remains_in_event_duration(self):
        original, fps = st.load_csv(str(ROOT / 'samples/golf1_export.csv'))
        bad = skeleton(0.6, 0.4, 0.3)
        track = st.build_track(original[:156] + [bad] + original[156:], fps)
        phases = track['meta']['phase_frames']
        self.assertEqual((phases['top'], phases['impact']), (152, 165))
        self.assertTrue(0.25 <= (phases['down'] - 152) / 13 <= 0.75)
        duration = (track['meta']['source_frames'][1] - track['meta']['source_frames'][0]) / fps
        normalized_duration = (track['events']['impact'] - track['events']['top'])
        self.assertAlmostEqual(normalized_duration * (duration + track['meta']['hold']), 13 / fps, places=3)

    def test_high_acceptance_without_a_swing_does_not_invent_phases(self):
        frames, fps = st.load_csv(str(ROOT / 'samples/golf1_export.csv'))
        for d in frames:
            sh = st._mid(d, 'LEFT_SHOULDER', 'RIGHT_SHOULDER')
            for side in ('LEFT', 'RIGHT'):
                d[side + '_WRIST'] = (sh[0], sh[1] + 0.15, 0, 0.99)
        track = st.build_track(frames, fps)
        self.assertEqual(track['meta']['accepted_frames'], len(frames))
        self.assertFalse(track['meta']['usable'])
        self.assertEqual(track['meta']['phase_frames'], {})
        self.assertIsNone(track['meta']['address_shoulder_width_ratio'])
        provider = Mock()
        with self.assertRaises(ValueError):
            coach.analyze(track, dict.fromkeys(coach.SUMMARY_FIELDS, ''), provider)
        provider.generate.assert_not_called()
