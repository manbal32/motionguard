import json
import math
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from unittest.mock import patch

from server import Handler, ROOT
import swing_track


class TrackTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        handler = type("TestHandler", (Handler,), {"tracks": Path(temp.name)})
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = Thread(target=server.serve_forever)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(thread.join)
        self.addCleanup(server.shutdown)
        self.connection = HTTPConnection("127.0.0.1", server.server_port, timeout=5)
        self.addCleanup(self.connection.close)
        self.csv = (ROOT / "samples/golf1_export.csv").read_bytes()

    def request(self, method, path, body=None):
        self.connection.request(method, path, body)
        response = self.connection.getresponse()
        return response.status, json.load(response)

    def test_contract_and_events(self):
        status, data = self.request("POST", "/api/track", self.csv)
        self.assertEqual(status, 200)
        self.assertEqual(data["schema"], swing_track.SCHEMA)
        self.assertEqual(data["channels"], swing_track.CHANNELS)
        self.assertEqual(len(data["track"]), data["meta"]["samples"])
        self.assertEqual(data["meta"]["samples"], 108)
        self.assertTrue(all(len(row) == 10 and all(map(math.isfinite, row)) for row in data["track"]))
        events = [data["events"][key] for key in ("address", "top", "down", "impact", "finish")]
        self.assertTrue(0 <= events[0] < events[1] < events[2] < events[3] < events[4] <= 1)
        self.assertEqual(events, [0.1528, 0.5803, 0.6516, 0.6754, 1.0])
        meta = data["meta"]
        frames = [meta["source_frames"][0] + round((u * meta["dur"] - meta["hold"]) * meta["fps"])
                  for u in events]
        self.assertEqual(frames, [98, 152, 161, 164, 205])
        confidence = [row[data["channels"].index("confidence")] for row in data["track"]]
        self.assertTrue(all(0 <= value <= 1 for value in confidence))
        self.assertGreater(confidence[0], 0.75)
        self.assertLess(confidence[180 - frames[0]], 0.45)
        status, listing = self.request("GET", "/api/tracks")
        self.assertEqual(status, 200)
        self.assertEqual(len(listing), 1)
        self.assertEqual(listing[0]["samples"], 108)
        self.assertEqual(self.request("GET", "/api/track/" + listing[0]["id"]), (200, data))

    def test_missing_landmark_returns_reason(self):
        incomplete = b"\n".join(line for line in self.csv.splitlines() if b",LEFT_SHOULDER," not in line)
        status, result = self.request("POST", "/api/track", incomplete)
        self.assertEqual(status, 422)
        self.assertIs(result["ok"], False)
        self.assertIn("LEFT_SHOULDER", result["reason"])

    def test_cache_skips_recalculation(self):
        with patch.object(swing_track, "build_track", wraps=swing_track.build_track) as build:
            first = self.request("POST", "/api/track", self.csv)
            self.assertEqual(first[0], 200)
            self.assertEqual(first, self.request("POST", "/api/track", self.csv))
            build.assert_called_once()

    def test_cleanup_repairs_jump_and_low_visibility_before_filtering(self):
        frames, fps = swing_track.load_csv(str(ROOT / "samples/golf1_export.csv"))
        wrist = "RIGHT_WRIST"
        x, y, z, visibility = frames[99][wrist]
        frames[99][wrist] = (x + 0.31, y, z, visibility)
        x, y, z, _ = frames[100][wrist]
        frames[100][wrist] = (x, y, z, 0.1)
        cleaned, confidence = swing_track._clean_landmarks(frames, fps)
        self.assertEqual(confidence[99:101], [0, 0])
        for i, fraction in [(99, 1 / 3), (100, 2 / 3)]:
            a, b = (frames[index][wrist][0] for index in (98, 101))
            self.assertAlmostEqual(cleaned[i][wrist][0], a + (b - a) * fraction)

    def test_quadratic_peak_survives_filter(self):
        values = [25 - (i - 5) ** 2 for i in range(11)]
        for actual, expected in zip(swing_track._smooth(values), values):
            self.assertAlmostEqual(actual, expected)
