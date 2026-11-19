"""Regression checks for WEB_01; video acceptance is measured separately."""
import math
from unittest import TestCase
from unittest.mock import patch

import swing_track as st
from server import ROOT


class PhaseCameraTests(TestCase):
    def test_down_is_inside_descent_and_is_height_not_time_midpoint(self):
        f,fps=st.load_csv(str(ROOT/'samples/swing_front_landmarks.csv'))
        h=[st._mid(d,'LEFT_WRIST','RIGHT_WRIST') for d in f]
        start,top,down,impact,finish,_=st._swing_phases([],fps,hands=h)
        self.assertEqual((start,top,down,impact,finish),(81,118,141,146,172))
        self.assertGreater(down,(top+impact)/2)

    def test_address_ends_the_low_quiet_interval_and_ignores_a_low_spike(self):
        # Higher y means lower hands. A single later low glitch is not address.
        hands = [(0.5, 0.8)] * 20 + [(0.5, 0.8 - (i + 1) * 0.02) for i in range(30)]
        hands[28] = (0.5, 0.95)
        address = st._address_frame(hands, 49, 30)
        self.assertEqual(address, 19)
        self.assertGreater(hands[address][1], hands[49][1])

    def test_camera_gates_only_unavailable_rotation_channels(self):
        original, fps = st.load_csv(str(ROOT / 'samples/golf1_export.csv'))
        for ratio, facing, missing in ((0.95, 'front', ['torso', 'hips', 'x_factor']),
                                       (0.65, 'oblique', ['torso', 'hips', 'x_factor']),
                                       (0.20, 'down_the_line', ['torso', 'hips', 'x_factor'])):
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
