"""Run stages 3 and 5 against an isolated local server. Stage 5 can fail honestly."""
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'tests')]
from server import Handler,ThreadingHTTPServer
from test_capture_guidance import fixtures

def main():
    os.environ.pop('GEMINI_API_KEY',None)
    output=Path(os.environ.get('BUILD_BROWSER_RESULT',str(ROOT/'mockups/build-browser.json')))
    with TemporaryDirectory() as folder, ThreadingHTTPServer(('127.0.0.1',0),Handler) as server:
        Handler.tracks=Path(folder)/'tracks';file=Path(folder)/'guidance.json';file.write_text(json.dumps(fixtures()))
        env=dict(os.environ,BUILD_TEST_URL=f'http://127.0.0.1:{server.server_port}',BUILD_GUIDANCE_FIXTURES=str(file),BUILD_BROWSER_RESULT=str(output))
        thread=Thread(target=server.serve_forever,daemon=True);thread.start()
        try:return subprocess.run(['node',str(ROOT/'tests/build_browser.cjs')],env=env).returncode
        finally:server.shutdown();thread.join()
if __name__=='__main__':raise SystemExit(main())
