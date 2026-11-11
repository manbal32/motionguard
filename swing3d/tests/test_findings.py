import copy
import hashlib
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from server import Handler, ROOT
import test_track


class FindingsTests(unittest.TestCase):
    setUp = test_track.TrackTests.setUp
    request = test_track.TrackTests.request

    def test_fixture_is_bound_to_sample(self):
        self.connection.request("GET", "/api/findings/golf1")
        response = self.connection.getresponse()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader("X-Swing3D-Source-SHA256"), hashlib.sha256(self.csv).hexdigest())
        data = json.load(response)
        self.assertEqual(data["schema"], "motionguard.findings/1")
        self.assertEqual(data["findings"][0]["channel"], "torso")

    def test_invalid_documents_return_reasons_and_comment_stays_text_only(self):
        fixture = json.loads((ROOT / "findings/golf1.json").read_text(encoding="utf-8"))
        # Serve temporary files through the same endpoint without touching the fixture.
        with TemporaryDirectory() as directory:
            file = Path(directory) / "custom.json"
            with patch.object(Handler, "findings", file.parent):
                for field, value in [
                    ("channel", "unknown"), ("channel", "confidence"), ("channel", "wrist"),
                    ("range", [0.72, 0.62]), ("range", [-0.1, 0.62]), ("range", [0.62, 0.62]),
                    ("measured", True), ("reference", float("inf")),
                ]:
                    with self.subTest(field=field, value=value):
                        data = copy.deepcopy(fixture)
                        data["findings"][0][field] = value
                        file.write_text(json.dumps(data), encoding="utf-8")
                        status, result = self.request("GET", "/api/findings/custom")
                        self.assertEqual(status, 422)
                        self.assertIs(result["ok"], False)
                        self.assertIn(field, result["reason"])
                comment = {"id": "general", "label": "그립 점검"}
                fixture["findings"] = [comment]
                file.write_text(json.dumps(fixture), encoding="utf-8")
                self.assertEqual(self.request("GET", "/api/findings/custom"), (200, fixture))
