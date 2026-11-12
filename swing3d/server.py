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
from uuid import uuid4

import coach
import swing_track
from findings_contract import validate_findings

ROOT = Path(__file__).resolve().parent
MAX_CSV_BYTES = 16 * 1024 * 1024
MAX_VIDEO_BYTES = 150 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    tracks = ROOT / "tracks"
    findings = ROOT / "findings"
    cache_lock = Lock()
    coaching_provider = coach.Gemini

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
        if re.fullmatch(r"/report/[a-f0-9]{64}", path):
            self.path = "/report.html"
            return super().do_GET()
        if path == "/api/coaching/status":
            self.respond({"mode": "gemini" if self.coaching_provider().key else "demo"},
                         headers={"Cache-Control": "no-store"})
            return
        if match := re.fullmatch(r"/api/coaching/report/([a-f0-9]{32})", path):
            file = self.tracks / "coaching" / (match[1] + ".json")
            if file.is_file():
                self.respond(json.loads(file.read_text(encoding="utf-8")), headers={"Cache-Control": "no-store"})
            else:
                self.failure("상담 리포트를 찾을 수 없습니다.", 404)
            return
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
        elif match := re.fullmatch(r"/api/still/([a-f0-9]{64})/(address|top|down|impact)", path):
            track_id, phase = match.groups()
            image = self.tracks / f"{track_id}.{phase}.jpg"
            if not (self.tracks / f"{track_id}.json").is_file() or not image.is_file():
                self.failure("스틸컷이 없습니다. 영상을 다시 분석해 주세요.", 404)
                return
            payload = image.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
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
        if path in {"/api/coaching/chat", "/api/coaching/analyze"}:
            try:
                self.post_coaching(path)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass
            return
        if path == "/api/video":
            try:
                self.post_video()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass
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

    def post_coaching(self, path):
        if self.headers.get_content_type() != "application/json":
            self.failure("JSON 요청이 필요합니다.", 415)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 64 * 1024:
                self.failure("상담 요청 크기가 허용 범위를 벗어났습니다.", 413)
                return
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict) or type(data.get("allow_external")) is not bool:
                raise ValueError("상담 요청 형식이 올바르지 않습니다.")
            messages = coach.history(data.get("messages"))
            provider = self.coaching_provider() if data["allow_external"] else coach.Gemini()
            if not data["allow_external"]:
                provider.key = ""
                provider.offline_reason = "외부 전송 없이 데모로 진행했습니다."
            headers = {"Cache-Control": "no-store"}
            if path.endswith("/chat"):
                self.respond(coach.chat(messages, provider), headers=headers)
                return
            track_id = data.get("track_id")
            if not isinstance(track_id, str) or not re.fullmatch(r"[a-f0-9]{64}", track_id):
                raise ValueError("트랙 ID가 올바르지 않습니다.")
            file = self.tracks / (track_id + ".json")
            if not file.is_file():
                self.failure("분석할 영상 트랙이 없습니다.", 404)
                return
            track = json.loads(file.read_text(encoding="utf-8"))
            if not track.get("evidence"):
                raise ValueError("영상으로 계측한 트랙이 필요합니다.")
            result = coach.analyze(track, messages, provider)
            report_id = uuid4().hex
            result.update(report_id=report_id, track_id=track_id)
            reports = self.tracks / "coaching"
            reports.mkdir(parents=True, exist_ok=True)
            (reports / (report_id + ".json")).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            self.respond(result, headers=headers)
        except ValueError as error:
            self.failure(str(error) if not isinstance(error, json.JSONDecodeError) else "JSON 형식이 올바르지 않습니다.", 422)

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
        streaming = self.headers.get("Accept") == "application/x-ndjson"
        if streaming:
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def emit(event):
            self.wfile.write((json.dumps(event, ensure_ascii=False, allow_nan=False) + "\n").encode())
            self.wfile.flush()

        def progress(stage, percent):
            if streaming:
                emit({"type": "progress", "stage": stage, "percent": percent})

        try:
            with self.cache_lock:
                result = self.get_or_build_video(payload, progress)
            if streaming:
                emit({"type": "result", "data": result})
            else:
                self.respond(result)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return
        except Exception as error:
            import video_pose
            reason = str(error) if isinstance(error, video_pose.ExtractionError) else (
                f"영상에서 트랙을 생성할 수 없습니다. {error} 전신이 보이는 MP4로 다시 시도해 주세요."
            )
            if streaming:
                try:
                    emit({"type": "error", "reason": reason})
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass
            else:
                self.failure(reason, 422)

    def get_or_build_video(self, payload, progress):
        import video_pose

        key = hashlib.sha256(b"video-evidence-5\0" + f"{swing_track.SCHEMA}:{swing_track.TRACK_REVISION}".encode()
                             + b"\0" + payload).hexdigest()
        target = self.tracks / (key + ".json")
        if target.exists() and all((self.tracks / f"{key}.{phase}.jpg").is_file()
                                   for phase in ("address", "top", "down", "impact")):
            return json.loads(target.read_text(encoding="utf-8"))
        with TemporaryDirectory() as temp:
            source = Path(temp) / "upload.mp4"
            source.write_bytes(payload)
            frames, fps, timeline = video_pose.extract(str(source), evidence=True, progress=progress)
            progress("국면 검출", 88)
            result = swing_track.build_track(frames, fps)
            phases = result["meta"]["phase_frames"]
            progress("국면 스틸컷 준비", 95)
            crops, overlay_crop = video_pose.person_crops(timeline, phases)
            images = video_pose.phase_jpegs(source, {phase: frame for phase, frame in phases.items() if phase != "finish"}, crops)
        result["track_id"] = key
        sample = ROOT / "samples/golf_swing.mp4"
        if sample.is_file() and payload == sample.read_bytes():
            result["findings_id"] = "sample"
        result["evidence"] = {
            "id": key, "fps": fps, "landmark_names": video_pose.LANDMARK_NAMES, "frames": timeline,
            "phase_frames": phases, "still_crops": crops, "overlay_crop": overlay_crop,
        }
        self.tracks.mkdir(parents=True, exist_ok=True)
        for phase, jpeg in images.items():
            (self.tracks / f"{key}.{phase}.jpg").write_bytes(jpeg)
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
        key = hashlib.sha256(f"{swing_track.SCHEMA}:{swing_track.TRACK_REVISION}:report-1".encode() + b"\0" + payload).hexdigest()
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
        result["track_id"] = key
        sample = ROOT / "samples/golf1_export.csv"
        if sample.is_file() and payload == sample.read_bytes():
            result["findings_id"] = "golf1"
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
