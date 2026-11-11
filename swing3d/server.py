"""Local Swing3D HTTP server."""
import hashlib
import json
import math
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile, TemporaryDirectory
from threading import Lock
from urllib.parse import urlsplit

import swing_track

ROOT = Path(__file__).resolve().parent
MAX_CSV_BYTES = 16 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    tracks = ROOT / "tracks"
    cache_lock = Lock()

    def __init__(self, *args):
        super().__init__(*args, directory=str(ROOT / "web"))

    def respond(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def failure(self, reason, status):
        self.respond({"ok": False, "reason": reason}, status)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/tracks":
            items = []
            for file in sorted(self.tracks.glob("*.json")):
                data = json.loads(file.read_text(encoding="utf-8"))
                items.append({"id": file.stem, "name": file.stem,
                              "samples": data["meta"]["samples"], "dur": data["meta"]["dur"]})
            self.respond(items)
        elif path.startswith("/api/"):
            match = re.fullmatch(r"/api/track/([a-zA-Z0-9_-]+)", path)
            if match:
                file = self.tracks / (match[1] + ".json")
                if file.is_file():
                    self.respond(json.loads(file.read_text(encoding="utf-8")))
                    return
            self.failure("트랙을 찾을 수 없습니다.", 404)
        else:
            super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/track":
            self.failure("경로를 찾을 수 없습니다.", 404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if not 0 < size <= MAX_CSV_BYTES:
            self.failure("1바이트 이상 16MiB 이하의 좌표 CSV가 필요합니다.", 413 if size > MAX_CSV_BYTES else 400)
            return
        payload = self.rfile.read(size)
        if len(payload) != size:
            self.failure("CSV 전송이 완료되지 않았습니다.", 400)
            return
        try:
            with self.cache_lock:
                result = self.get_or_build(payload)
        except (ValueError, KeyError, IndexError, ZeroDivisionError) as error:
            self.failure(f"좌표 CSV에서 트랙을 생성할 수 없습니다. {error}", 422)
            return
        self.respond(result)

    def get_or_build(self, payload):
        key = hashlib.sha256(swing_track.SCHEMA.encode() + b"\0" + payload).hexdigest()
        target = self.tracks / (key + ".json")
        if target.exists():
            return json.loads(target.read_text(encoding="utf-8"))
        with TemporaryDirectory() as temp:
            source = Path(temp) / "input.csv"
            source.write_bytes(payload)
            frames, fps = swing_track.load_csv(str(source))
        for frame_number, frame in enumerate(frames):
            for name in swing_track.REQUIRED:
                if name not in frame:
                    raise ValueError(f"프레임 {frame_number} 필수 랜드마크 누락 ({name})")
                if not all(map(math.isfinite, frame[name])):
                    raise ValueError(f"프레임 {frame_number} 좌표가 유한수가 아닙니다 ({name})")
        for name in swing_track.REQUIRED:
            if max(frame[name][3] for frame in frames) < 0.5:
                raise ValueError(f"랜드마크 신뢰도 부족 ({name})")
        if not math.isfinite(fps) or fps <= 0:
            raise ValueError("유효하지 않은 프레임 속도입니다.")
        result = swing_track.build_track(frames, fps)
        encoded = json.dumps(result, ensure_ascii=False, allow_nan=False)
        self.tracks.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(dir=self.tracks, delete=False) as temp:
            temporary = Path(temp.name)
            try:
                temp.write(encoded.encode())
                temp.close()
                temporary.replace(target)
            finally:
                temp.close()
                temporary.unlink(missing_ok=True)
        return result


if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", 8765), Handler) as server:
        print("Swing3D http://127.0.0.1:8765", flush=True)
        server.serve_forever()
