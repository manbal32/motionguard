# MotionGuard Swing3D

저장소 루트의 app.py가 Studio 진입점입니다. Swing3D 서버는 Python 3.9 이상에서 별도 환경 변수나 의존성 설치 없이 실행됩니다.

- Windows에서는 `powershell -File start.ps1` 또는 `py -3 server.py`를 실행합니다.
- macOS에서는 `./start.command` 또는 `python3 server.py`를 실행합니다.
- 뷰어 주소는 http://127.0.0.1:8765 입니다.
- 테스트는 이 디렉터리에서 `python -m unittest discover -s tests`로 실행합니다.

`POST /api/track`은 CSV 원문을 받아 트랙 JSON을 반환합니다. `GET /api/tracks`의 목록에서 ID를 찾고 `GET /api/track/<id>`로 저장된 트랙을 읽을 수 있습니다.

몸통·골반 회전은 단일 카메라의 폭 단축률로 추정합니다. 클럽과 손목 코킹은 영상에서 직접 측정하지 않습니다.
