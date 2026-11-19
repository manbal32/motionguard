"""Real video, 33-landmark avatar, consultation/approval, report/PDF and quality screens.

Requires Playwright for Node (`playwright/test`) and Chromium. No API key is used.
Run from swing3d: python tests/mvp_browser.py
"""
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'tests')]
from server import Handler, ThreadingHTTPServer
from test_guidance import GuidanceTests
from test_frame_acceptance import skeleton
import swing_track as st


def main():
    os.environ.pop('GEMINI_API_KEY',None)
    with TemporaryDirectory() as folder, ThreadingHTTPServer(('127.0.0.1',0),Handler) as server:
        Handler.tracks=Path(folder)/'tracks'
        case=GuidanceTests();f,fps=case.sample(.04)
        fixtures={'too_far':st.build_track(f,fps),
                  'tracking_failed':st.build_track([skeleton(.6,.4,.3)]*30,30)}
        f,fps=case.sample(.20)
        for d in f:
            sh=st._mid(d,'LEFT_SHOULDER','RIGHT_SHOULDER')
            for n in ('LEFT_WRIST','RIGHT_WRIST'):d[n]=(sh[0],sh[1]+.15,0,.99)
        fixtures['no_swing']=st.build_track(f,fps)
        file=Path(folder)/'quality.json';file.write_text(json.dumps(fixtures,ensure_ascii=False))
        env=dict(os.environ,SWING_TEST_URL=f'http://127.0.0.1:{server.server_port}',SWING_QUALITY_FIXTURES=str(file))
        thread=Thread(target=server.serve_forever,daemon=True);thread.start()
        try:subprocess.run(['node',str(ROOT/'tests/w03_browser.cjs')],env=env,check=True)
        finally:server.shutdown();thread.join()

if __name__=='__main__':main()
