"""Real CSV 22-point flow plus explicit unusable-video guidance fixtures.

All stage 6–9 captures use DPR 2. The bundled videos are measured separately as
negative cases; no positive findings or successful video tracks are fabricated.
"""
import json, os, subprocess, sys
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'tests')]
from server import Handler,ThreadingHTTPServer
from test_capture_guidance import fixtures

def main():
    os.environ.pop('GEMINI_API_KEY',None)
    with TemporaryDirectory() as folder,ThreadingHTTPServer(('127.0.0.1',0),Handler) as server:
        Handler.tracks=Path(folder)/'tracks'
        fixture=Path(folder)/'guidance.json';fixture.write_text(json.dumps(fixtures()))
        env=dict(os.environ,BUILD_TEST_URL=f'http://127.0.0.1:{server.server_port}',BUILD_GUIDANCE_FIXTURES=str(fixture))
        thread=Thread(target=server.serve_forever,daemon=True);thread.start()
        try:return subprocess.run(['node',str(ROOT/'tests/mvp_browser.cjs')],env=env).returncode
        finally:server.shutdown();thread.join()
if __name__=='__main__':raise SystemExit(main())
