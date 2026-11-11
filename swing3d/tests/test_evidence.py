import json
from unittest import TestCase
from unittest.mock import patch

from server import ROOT
import swing_track
import test_track
import video_pose


class EvidenceTests(TestCase):
    setUp = test_track.TrackTests.setUp

    def test_stream_exposes_original_timeline_and_exact_stills(self):
        frames, fps = swing_track.load_csv(str(ROOT / "samples/golf1_export.csv"))
        timeline = [None] + [[[0.5, 0.6, 0.75]] * 33] * (len(frames) - 1)

        def extract(path, *, evidence, progress):
            self.assertTrue(evidence)
            progress("좌표 추출", 17)
            return frames, fps, timeline

        def stills(path, indices):
            self.assertEqual(indices, {"address": 98, "top": 152, "down": 161, "impact": 164})
            return {phase: b"\xff\xd8" + str(frame).encode() + b"\xff\xd9" for phase, frame in indices.items()}

        with patch.object(video_pose, "extract", side_effect=extract), patch.object(video_pose, "phase_jpegs", side_effect=stills):
            self.connection.request("POST", "/api/video", b"fixture", {"Accept": "application/x-ndjson"})
            response = self.connection.getresponse()
            self.assertEqual(response.status, 200)
            events = [json.loads(line) for line in response]
        self.assertEqual([event["percent"] for event in events[:-1]], [17, 88, 95])
        result = events[-1]["data"]["evidence"]
        self.assertIsNone(result["frames"][0])
        self.assertEqual(len(result["frames"]), len(frames))
        self.assertEqual(len(result["landmark_names"]), 33)
        self.assertEqual(result["phase_frames"]["top"], 152)
        self.connection.request("GET", f'/api/still/{result["id"]}/top')
        response = self.connection.getresponse()
        self.assertEqual(response.getheader("Content-Type"), "image/jpeg")
        self.assertEqual(response.read(), b"\xff\xd8152\xff\xd9")

    def test_unknown_still_returns_404(self):
        self.connection.request("GET", f"/api/still/{'a' * 64}/impact")
        response = self.connection.getresponse()
        self.assertEqual(response.status, 404)
        self.assertIn("스틸컷", json.load(response)["reason"])
