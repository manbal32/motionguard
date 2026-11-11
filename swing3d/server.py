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
from findings_contract import validate_findings

ROOT = Path(__file__).resolve().parent
MAX_CSV_BYTES = 16 * 1024 * 1024
MAX_VIDEO_BYTES = 150 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    tracks = ROOT / "tracks"
    findings = ROOT / "findings"
    cache_lock = Lock()

    def __init__(self, *args):
        super().__init__(*args, directory=str(ROOT / "web"))

    def respond(self, data, status=200, headers=None):
        payload = json.dumps(data, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(payload)

    def failure(self, reason, status):
        self.respond({"ok": False, "reason": reason}, status)

    def do_GET(self):
        path = urlsplit(self.path).path
        finding = re.fullmatch(r"/api/findings/([a-zA-Z0-9_-]+)", path)
        if finding:
            file = self.findings / (finding[1] + ".json")
            if not file.is_file():
                self.failure("결함 파일을 찾을 수 없습니다.", 404)
                return
            try:
                data = validate_findings(json.loads(file.read_text(encoding="utf-8")))
            except (UnicodeError, ValueError) as error:
                self.failure(str(error), 422)
                return
            sample = ROOT / "samples" / (finding[1] + "_export.csv")
            headers = {}
            if sample.is_file():
                headers["X-Swing3D-Source-SHA256"] = hashlib.sha256(sample.read_bytes()).hexdigest()
            self.respond(data, headers=headers)
        elif path == "/api/tracks":
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
        path = urlsplit(self.path).path
        if path == "/api/video":
            self.post_video()
            return
        if path != "/api/track":
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

    def post_video(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if not 0 < size <= MAX_VIDEO_BYTES:
            self.failure("1바이트 이상 150MiB 이하의 영상 파일이 필요합니다.",
                         413 if size > MAX_VIDEO_BYTES else 400)
            return
        payload = self.rfile.read(size)
        if len(payload) != size:
            self.failure("영상 전송이 완료되지 않았습니다.", 400)
            return
        try:
            with self.cache_lock:
                result = self.get_or_build_video(payload)
        except Exception as error:   # 추출 실패 사유를 그대로 전달한다
            import video_pose
            if isinstance(error, video_pose.ExtractionError):
                self.failure(str(error), 422)
            else:
                self.failure(f"영상에서 트랙을 생성할 수 없습니다. {error}", 422)
            return
        self.respond(result)

    def get_or_build_video(self, payload):
        import video_pose
        key = hashlib.sha256(b"video\0" + swing_track.SCHEMA.encode() + b"\0" + payload).hexdigest()
        target = self.tracks / (key + ".json")
        if target.exists():
            return json.loads(target.read_text(encoding="utf-8"))
        with TemporaryDirectory() as temp:
            source = Path(temp) / "upload.mp4"
            source.write_bytes(payload)
            frames, fps = video_pose.extract(str(source))
        result = swing_track.build_track(frames, fps)
        self.store(target, result)
        return result

    def store(self, target, result):
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
    import sys
    import threading
    import webbrowser

    address = "http://127.0.0.1:8765"
    with ThreadingHTTPServer(("127.0.0.1", 8765), Handler) as server:
        print(f"Swing3D {address}", flush=True)
        print("끄려면 Ctrl+C 를 누르세요.", flush=True)
        if "--no-browser" not in sys.argv:
            # 서버가 요청을 받기 시작한 뒤에 연다.
            threading.Timer(0.5, lambda: webbrowser.open(address)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n종료했습니다.", flush=True)
