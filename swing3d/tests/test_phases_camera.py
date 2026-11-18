"""Regression checks for WEB_01; video acceptance is measured separately."""
import math
from unittest import TestCase
from unittest.mock import patch

import swing_track as st
from server import ROOT


class PhaseCameraTests(TestCase):
    def test_down_is_inside_the_descent_at_different_recording_speeds(self):
        frames, fps = st.load_csv(str(ROOT / 'samples/golf1_export.csv'))
        clean, _ = st._clean_landmarks(frames, fps, channel_quality=True)
        angles = st._smooth(st._unwrap([
            st._screen_angle(*(a - b for a, b in zip(
                st._mid(d, 'LEFT_WRIST', 'RIGHT_WRIST'),
                st._mid(d, 'LEFT_SHOULDER', 'RIGHT_SHOULDER'))))
            for d in clean
        ]))
        for stretch in (1, 4):
            for sign in (-1, 1):
                with self.subTest(stretch=stretch, sign=sign):
                    sw = [sign * angle for angle in angles for _ in range(stretch)]
                    start, top, down, impact, end, _ = st._swing_phases(sw, fps)
                    self.assertTrue(start < top < down < impact < end)
                    self.assertTrue(0.25 <= (down - top) / (impact - top) <= 0.75)
                    self.assertGreaterEqual((impact - down) / fps, 0.05)

    def test_address_ends_the_low_quiet_interval_and_ignores_a_low_spike(self):
        # Higher y means lower hands. A single later low glitch is not address.
        hands = [(0.5, 0.8)] * 20 + [(0.5, 0.8 - (i + 1) * 0.02) for i in range(30)]
        hands[28] = (0.5, 0.95)
        address = st._address_frame(hands, 49, 30)
        self.assertEqual(address, 19)
        self.assertGreater(hands[address][1], hands[49][1])

    def test_camera_gates_only_unavailable_rotation_channels(self):
        original, fps = st.load_csv(str(ROOT / 'samples/golf1_export.csv'))
        for ratio, facing, missing in ((0.95, 'front', []),
                                       (0.65, 'oblique', ['hips']),
                                       (0.20, 'down_the_line', ['torso', 'hips'])):
            with self.subTest(facing=facing):
                frames = [d.copy() for d in original]
                for i, d in enumerate(frames):
                    # Flat address and a broad smooth maximum later in the clip.
                    width = 0.2 * (ratio if i < 25 else ratio + (1 - ratio) *
                                   math.sin(min(1, (i - 25) / 100) * math.pi / 2))
                    for name, sign in [('LEFT_SHOULDER', -1), ('RIGHT_SHOULDER', 1)]:
                        _, y, z, visibility = d[name]
                        d[name] = (0.5 + sign * width / 2, y, z, visibility)
                with patch.object(st, '_swing_phases', return_value=(10, 50, 60, 70, 90, 1)):
                    track = st.build_track(frames, fps)
                meta = track['meta']
                self.assertEqual(meta['camera_facing'], facing)
                self.assertEqual(meta['unavailable'], missing)
                for channel in ('torso', 'hips'):
                    column = st.CHANNELS.index(channel)
                    for row, confidence in zip(track['track'], meta['channel_confidence'][channel]):
                        if channel in missing:
                            self.assertIsNone(row[column])
                            self.assertIsNone(confidence)
                            self.assertNotIn(channel, meta['measured'])
                        else:
                            self.assertIsNotNone(row[column])
                            self.assertIsNotNone(confidence)
                            self.assertIn(channel, meta['measured'])
