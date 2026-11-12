# MotionGuard Swing3D

저장소 루트의 app.py가 Studio 진입점입니다. Swing3D 서버는 Python 3.9 이상에서 별도 환경 변수나 의존성 설치 없이 실행됩니다.

- Windows에서는 `powershell -File start.ps1` 또는 `py -3 server.py`를 실행합니다.
- macOS에서는 `./start.command` 또는 `python3 server.py`를 실행합니다.
- 실행하면 브라우저가 자동으로 열립니다. 안 열리면 http://127.0.0.1:8765 를 직접 여세요. `--no-browser` 를 붙이면 열지 않습니다.
- 테스트는 이 디렉터리에서 `python -m unittest discover -s tests`로 실행합니다.

`POST /api/video`는 mp4/mov 원문을 받아 MediaPipe로 좌표를 뽑고 트랙 JSON을 반환합니다. 30초 150MB 이하입니다. 이 경로에만 `mediapipe` 설치가 필요하며, 없으면 설치 안내를 사유로 돌려줍니다. 자세 모델은 저장소의 models/ 에 포함됩니다. 원본 영상은 저장하지 않고 처리 후 버립니다.

`POST /api/track`은 CSV 원문을 받아 트랙 JSON을 반환합니다. `GET /api/tracks`의 목록에서 ID를 찾고 `GET /api/track/<id>`로 저장된 트랙을 읽을 수 있습니다.

몸통·골반 회전은 단일 카메라의 폭 단축률로 추정합니다. 클럽과 손목 코킹은 영상에서 직접 측정하지 않습니다.

## 과제 MVP 시연

Windows PowerShell에서 저장소의 `swing3d` 디렉터리로 이동해 실행합니다.

```powershell
py -3 -m pip install -r requirements.txt mediapipe
py -3 server.py
```

macOS에서는 `python3 -m pip install -r requirements.txt mediapipe` 및 `python3 server.py`를 사용합니다.
Gemini를 사용하려면 서버를 시작하는 환경의 `GEMINI_API_KEY`에 키를 설정합니다. Windows에서는 PowerShell의
`Read-Host -AsSecureString`으로 입력받아 현재 프로세스 환경에 설정할 수 있습니다.

```powershell
$env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Gemini API key')).Password
py -3 server.py
```

macOS 기본 셸 zsh에서는 `read -rs 'GEMINI_API_KEY?Gemini API key: '; export GEMINI_API_KEY` 뒤에
서버를 실행합니다. 모델은 `GEMINI_MODEL`로 선택할 수 있습니다. 키 없이 실행하거나 화면의 외부 전송 동의를 끄면 데모 모드입니다.

1. `samples/golf_swing.mp4`를 선택하고 고민과 목표를 두 번에 나눠 보냅니다. PC에서는 Enter로 보내고 Shift+Enter로 줄을 바꿉니다. 모바일에서는 보내기 버튼을 누릅니다.
2. **분석하기**를 눌러 상담의 자기보고와 영상 근거를 비교합니다. 번들 영상에서 추적 신뢰도가 부족하면 데모는 판정 대신 예시 비교를 표시합니다.
3. 개선 항목 또는 비교 예시를 선택하고 과장 배율을 조절합니다. 연습 영상은 YouTube 검색 링크로 열립니다.
4. 원하는 비교 프레임에서 **스윙 리포트 열기 → 인쇄 / PDF 저장**을 선택합니다. 비교 이미지는 열린 탭에만 보관됩니다.

원본은 로컬에서 처리합니다. 외부 전송에 동의하면 상담 텍스트와 계측 수치 요약을 Gemini에 보냅니다.
서버는 리포트별 상담 요약과 결과를 Git에서 제외된 `tracks/coaching/`에 저장합니다.

회귀 검증은 `python -m unittest discover -s tests` 및 `node --test tests/test_comparison.cjs`로 실행합니다.
Chrome과 Python Playwright를 설치하면 `python tests/shots.py`와 `python tests/mvp_browser.py`로 화면 검증 및 캡처를 재실행할 수 있습니다.

## 트랙 정제와 신뢰도

golf1의 64.31 fps에서 인접 프레임 XY 이동량을 합산한 분포의 95백분위는 0.028이고, 손목의 큰 점프는 약 0.13~0.31입니다. 이 분포를 기준으로 0.12/프레임을 점프 한계로 사용하고 다른 FPS에서는 프레임 간격에 비례해 조정합니다. 이 한계는 golf1에서 고른 휴리스틱입니다. 가시성이 0.5 미만이거나 점프로 판정된 관측은 랜드마크별로 제거합니다. 내부 공백은 양쪽 유효 관측으로 선형 보간하고, 양끝 공백은 가장 가까운 유효 관측을 유지합니다.

2차 Savitzky–Golay 7표본 창을 사용합니다. golf1의 정제된 원본 스윙각과 필터 출력의 공통 내부 구간에서 RMS 잔차는 7표본 창이 1.78°, 9표본 창이 2.39°였습니다. 각도 변형을 줄이고 국소 2차 봉우리를 보존하는 7표본 창을 선택했습니다. 차단 주파수는 Butterworth를 적용할 때 필요한 설정입니다.

새 트랙의 스키마는 `motionguard.swingtrack/2`이며 마지막 채널 `confidence`는 원본 추적의 표본별 신뢰도(0~1)입니다. 보간된 관측이 있으면 0으로 기록합니다. 어깨 폭이 영상 중앙값의 25% 아래로 줄면 신뢰도를 추가로 낮춥니다. 뷰어는 이 채널로 낮은 신뢰도 구간을 반투명으로 표시하며, 이전 9채널 트랙도 읽습니다. CSV 재업로드는 현재 스키마로 계산하고 같은 스키마의 캐시를 재사용합니다.

## 결함 파일과 3D 과장

`samples/golf1_export.csv`를 올리면 뷰어가 `GET /api/findings/golf1`에서 `findings/golf1.json`을 읽습니다. 서버가 응답 헤더로 돌려준 원본 CSV SHA-256이 업로드와 일치할 때만 샘플 결함을 표시합니다. 이 파일은 수동 작성한 예시입니다.

최상위 계약은 `schema: motionguard.findings/1`, `reference: model`, `findings` 배열입니다. 항목마다 고유한 `id`와 화면에 표시할 `label`이 필요합니다. `channel`과 `range` 중 하나라도 생략하면 텍스트 코멘트로만 표시합니다. 3D 항목에는 다음 필드가 필요합니다.

| 필드 | 허용값 |
| --- | --- |
| channel | 자세 채널 9개 중 실제 지적에 사용할 수 있는 8개. `swing`, `torso`, `hips`, `lean`, `shiftX`, `kneeL`, `kneeR`, `heelR`. `wrist`는 영상에서 측정할 수 없어 거부합니다. `confidence`는 자세 채널이 아닙니다. |
| range | 정규화한 트랙 타임라인의 `[start, end]`. `0 ≤ start < end ≤ 1`. |
| measured, reference | 결함 지점의 유한한 도 단위 요약값. `shiftX`와 `heelR`는 각도가 없는 채널이므로 원래 단위에 180/π를 곱한 도 환산값을 사용합니다. |
| direction | `excess`, `deficit` |
| severity | `low`, `medium`, `high` |
| camera | `front`, `dtl`, `high`, `wrist`. `wrist`는 카메라 이름입니다. |
| youtube | 선택 필드. 검색어 문자열 배열에서 검색 링크를 만듭니다. |

잘못된 파일은 HTTP 422와 `{ "ok": false, "reason": "..." }`로 거부됩니다. 예시는 `findings/golf1.json`에 있습니다.

교본형 기준은 `mount(el, trackJson, { findings, reference: "model" })`로 선택합니다. 모델의 다섯 국면을 입력 트랙의 이벤트 위치에 맞춰 보간합니다. 과장 모드는 매 순간 선택한 채널에 `기준 + (실제 - 기준) × 배율`을 적용합니다. 배율은 1~4, 기본 2.5입니다. 양쪽 경계의 최대 0.02 구간에서 smoothstep으로 배율을 1까지 되돌립니다. 화면의 수치는 현재 재생 위치에서 실제 트랙과 교본 트랙을 읽습니다. JSON의 도 단위 요약값은 해당 결함의 기록용입니다. '실제' 버튼으로 과장을 끌 수 있습니다.

## 아바타와 홀

Quaternius Universal Base Characters의 CC0 GLB를 기본으로 사용합니다. 출처와 상업적 사용 조건은 `web/assets/LICENSES.md`에 기록했습니다. 로더, GLB 또는 필수 본 매핑을 읽을 수 없으면 기본 리그로 계속 재생합니다.

캐릭터 교체는 `web/assets/golfer-rig.json`의 GLB 경로, 스케일, Y축 방향, 본 이름 및 손 보정 값을 수정해 적용합니다. 이름은 GLB에서 내보낸 실제 이름과 일치해야 합니다. 팔의 어깨와 팔꿈치, 그립 기준점은 기존 2본 IK 결과를 따릅니다. 홀의 잔디 타일과 지형은 실행 시 생성됩니다.

영상 의존성을 설치한 뒤 Windows에서 `py -3 check.py`로 설치와 포트를 확인하세요. `py -3 server.py`를 실행한 뒤 `samples/golf_swing.mp4`를 업로드하면 네트워크 없이 샘플을 분석할 수 있습니다.
