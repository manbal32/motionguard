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

        def stills(path, indices, crops):
            self.assertEqual(indices, {"address": 98, "top": 152, "down": 161, "impact": 164, "finish": 205})
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
        self.connection.request("GET", f'/api/still/{result["id"]}/finish')
        self.assertEqual(self.connection.getresponse().read(), b"\xff\xd8205\xff\xd9")

    def test_unknown_still_returns_404(self):
        self.connection.request("GET", f"/api/still/{'a' * 64}/impact")
        response = self.connection.getresponse()
        self.assertEqual(response.status, 404)
        self.assertIn("스틸컷", json.load(response)["reason"])


    def test_crops_use_one_scale_and_preserve_bounds(self):
        points = [[0.45, 0.4, 0.99]] * 15 + [[0.55, 0.55, 0.99]] * 18
        shifted = [[x + 0.1, y, confidence] for x, y, confidence in points]
        frames = [points, shifted, None, points, points]
        phases = dict(zip(("address", "top", "down", "impact", "finish"), range(5)))
        crops, zoom = video_pose.person_crops(frames, phases)
        self.assertEqual(len({crop[2] for crop in crops.values()}), 1)
        self.assertAlmostEqual(crops["top"][2], 0.24)
        self.assertGreater(crops["top"][0], crops["address"][0])
        self.assertGreater(zoom[2], crops["top"][2])
        self.assertEqual(video_pose.person_crops([None] * 5, phases)[1], (0, 0, 1))


    def test_report_route_serves_track_report(self):
        self.connection.request("GET", f"/report/{'a' * 64}")
        response = self.connection.getresponse()
        self.assertEqual(response.status, 200)
        self.assertIn("재지 못한 것", response.read().decode("utf-8"))
