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
        self.assertEqual(data["schema"], "motionguard.swingtrack/1")
        self.assertEqual(data["channels"], swing_track.CHANNELS)
        self.assertEqual(len(data["track"]), data["meta"]["samples"])
        self.assertEqual(data["meta"]["samples"], 109)
        self.assertTrue(all(len(row) == 9 and all(map(math.isfinite, row)) for row in data["track"]))
        events = [data["events"][key] for key in ("address", "top", "down", "impact", "finish")]
        self.assertTrue(0 <= events[0] < events[1] < events[2] < events[3] < events[4] <= 1)
        self.assertEqual(events, [0.1516, 0.5758, 0.6543, 0.6779, 1.0])
        meta = data["meta"]
        frames = [meta["source_frames"][0] + round((u * meta["dur"] - meta["hold"]) * meta["fps"])
                  for u in events]
        self.assertEqual(frames, [98, 152, 162, 165, 206])
        status, listing = self.request("GET", "/api/tracks")
        self.assertEqual(status, 200)
        self.assertEqual(len(listing), 1)
        self.assertEqual(listing[0]["samples"], 109)
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
