# MOTIONGUARD_BUILD 1–9단계 최종 실측

기준은 `feature/swing3d`의 **9cfee75** 정본 전문이다. PR #5의 1–4단계 구현을 이어받고 최신 정본을 병합했다. 원격 PR #5 자체를 임의로 병합하지 않았다. 이 PR은 PR #5의 구현과 이번 5–9단계 완료 변경을 함께 포함하므로 먼저 이 PR을 검토할 수 있다.

머리/모자/클럽까지 실제 그리기 경계로 맞추고, 1배·2.5배에서 같은 좌표 변환을 쓴다. 화면을 하얀 바탕의 5단계로 연결하고 결과·이력·고객용 리포트·PDF·요약 프로필 저장·계산식 타수·수동 선정 연습 영상을 구현했다. 원래 3D와 WebM 저장은 재생 도구 안에 보존했다. 3D에만 넘기는 국면 구간을 0–1로 제한해 피니쉬에서 열리지 않던 오류도 수정했다.

**정본 통과 조건의 현재 실측 미통과: 0개.** 아래 검증 한계를 통과 사실과 구분한다. 이 기록은 자동 테스트와 캡처에 관한 것으로 사용자 화면 승인을 뜻하지 않는다.

- 진짜 스윙의 원본 영상은 저장소에 없으므로 성공 경로는 실제 `swing_front_landmarks.csv`로 검증했다. 원본 영상 토글은 이 경로에서 비활성화하고 이유를 표시한다. 해당 영상의 원본·오버레이 동기화를 새로 촬영해 확인하지는 못했다.
- Gemini 키 없이 외부 전송 동의를 끈 데모로 검증했다. 실서비스 Gemini 응답은 이번 실행에서 확인하지 않았다.
- 연습 영상 3개의 제목·길이는 공개 검색 색인으로 확인했고 14개 결함에 수동 연결했다. 직접 YouTube 재생은 환경의 HTTP 403으로 미검증이다. 출처는 `DRILL_SOURCES.md`.
- 회전의 lite 모델 과대 추정은 보정 계수로 감추지 않았다. 아래 각도와 점수는 그대로다. 타수 영향 상수는 잠정 기준이며 실제 경기 기록으로 검증된 모델은 아니다.

## 단계 1 — 얼굴 좌표 제외, 회전은 3D

| 항목 | 기준 | 실측 / 판정 |
|---|---|---|
| 좌표 개수 | 22점. 얼굴 11점이 어디에도 없을 것 | CSV 242×22, world 242×22. 실제 두 영상 각각 270×22(화면/world). 추출 목록 11–32만 사용. `test_no_face_landmarks` 통과. |
| 오버레이 | 얼굴에 점이 찍히지 않을 것 (스크린샷) | 기존 `build_s1_overlay.png`의 신체 점 22개·머리 점 0개 유지. 이번 추출도 22점 확인. 아바타 머리는 목/몸통에서 생성. 통과. |
| 3D 회전 | 위 CSV 에서 국면별 몸통·골반·X-factor 가 나올 것 | 5국면 모두 세 값 산출. 아래 표. 통과. |
| 각도 패턴 | 탑에서 X-factor 가 음수(어깨가 더 돌아감), 임팩트에서 양수 | 탑 −33.631878°, 임팩트 +12.658930°. 통과. |
| 각도 크기 | 보고할 것. 맞추려고 조정하지 말 것 | 탑 몸통 −139.340185°, 골반 −105.708307°. world yaw/address 차감/unwrap, 크기 보정 없음. 보고 완료. |

| 국면 | 원본 시점 | 몸통 ° | 골반 ° | X-factor ° |
|---|---:|---:|---:|---:|
| address | 81 | 0.000000 | 0.000000 | 0.000000 |
| top | 118 | -139.340185 | -105.708307 | -33.631878 |
| down | 141 | -13.547129 | -12.337386 | -1.209743 |
| impact | 146 | 15.492378 | 2.833448 | 12.658930 |
| finish | 172 | 97.300724 | 72.900973 | 24.399751 |

## 단계 2 — 국면 검출

| 항목 | 기준 | 실측 / 판정 |
|---|---|---|
| `swing_front_landmarks.csv` | 국면 5개 확정 | 81 / 118 / 141 / 146 / 172, 자동 검출. 통과. |
| 임팩트 검증 | 통과 | 높이 차이 0.034535 < 0.06, impact_verified=true. 통과. |
| 어드→탑 | 0.30초 이상 | 0.615466598초. 통과. |
| 탑→임팩트 | 0.15 ~ 0.60초 (현재 0.47초) | 0.465758506초. 통과. |
| 다운 위치 | 탑과 임팩트 사이 | 118 < 141 < 146. 통과. |
| 기존 두 샘플 | 스윙 구간을 찾지 못하고 `no_swing` 을 낼 것 | 실제 2패스 추출: 두 파일 각각 270개 표본, usable=false, no_swing, phases={}. 통과. |

## 단계 3 — 촬영 품질 안내

정본 조건: **세 상태 단위 테스트 + 화면 스크린샷 3장.** 통과.

| 상태 | 실측 fixture | LLM analyze 요청 | 캡처 |
|---|---|---:|---|
| too_far | 입력 어깨폭 25.60px < 60px, accepted 242/242 | 0 | g1_too_far.png |
| tracking_failed | accepted 0/242 < 50% | 0 | g2_tracking.png |
| no_swing | accepted 242/242, 국면 미확정 | 0 | g3_no_swing.png |

세 화면은 명시적 품질 fixture로 응답을 주입해 문구·SVG·다시 찍기를 확인했다. 실제 두 영상의 `no_swing`은 별도 재추출 및 pytest로 검증했다. 촬영 각도 자체를 실패 사유로 쓰지 않는다.

## 단계 4 — 점수

| 항목 | 기준 | 실측 / 판정 |
|---|---|---|
| 총점 | 0~100. 값 보고 | 30.04/100, 측정 항목 40개. 통과. |
| 측정 불가 | `excluded` 로 가고 총점에 영향 없을 것 (테스트) | torso 제외 후 4항목 excluded 및 나머지 가중평균 일치, confidence=0.29 제외. 통과. |
| 재현성 | 같은 입력 두 번 돌려 총점 차이 3점 이내 | 같은 CSV 2회 차이 0.00점. 통과. |
| 상수 분리 | 허용폭·가중치가 `reference.js` 에 있을 것 | 허용폭·가중치·타수 기준/영향 상수는 web/reference.js 한 곳. 통과. |

## 단계 5 — 개선 포인트 화면

| 항목 | 기준 | 실측 / 판정 |
|---|---|---|
| 2.5배 최대 관절 이동 | **20px 이상** (390px 폭) | 폭 390×296 CSS px, f118, 22.476296px. 통과. |
| 1.0배 vs 2.5배 | 두 그림 중 **하나에만 칠해진 픽셀이 아바타 면적의 5% 이상**. 캔버스 전체 대비가 아니다 | 1배/2.5배 배타 픽셀 4,917 / 아바타 합집합 면적 32,391 = 15.180143%. 통과. |
| 아바타 전체 | 무대 안에 들어올 것. 맨 위 8줄에 아바타 픽셀 0개 | 상단 8 device px 줄 0개. f81–172 총 92시점의 2.5배에서 사방 8px 경계 아바타 픽셀 최대 0개. 통과. |
| 교본 잔상·각도 호 | 스크린샷에서 구분될 것 | 민트 교본 alpha 0.30 / 나 alpha 0.92, 주황 호. build_s5_point.png와 m4/d4. 통과. |
| 부호 | 과장 방향 = 측정 방향. 교본 초과 반전 없음 | JS 부호·0·채널 국소성·시작 연속성 4개 테스트 통과. |
| 재생 | 누르면 돌아가고 바로 멈춰 이동할 것 | 실제 118→132 재생, 정지 후 직접 이동 141 유지. 통과. |

픽셀 마스크는 투명 캔버스의 alpha>0, G>1.1R, G>1.05B를 아바타로 센다. 두 그림의 XOR를 OR로 나눈다. 주황 호와 무대 배경을 분모에 넣지 않는다. DPR 2, 동일 시점/카메라/잔상/프레이밍이다. 숫자는 새 머리 경계 맞춤과 최종 화면으로 다시 측정한 값이며 PR #5의 이전 캡처 7.9%와 다른 렌더이다. 보조 배율·교본 토글은 재생 도구 안으로 옮겨 무대 공간을 확보했다.

## 단계 6 — 화면과 디자인

정본 통과 조건 표:

| 화면 | 390×844 | 1440×900 |
|---|---|---|
| 1~5 전부 | 빈 띠 **20% 이하** → 최대 **5.0%**, 통과 | 동일 → 최대 **4.7%**, 통과 |

| 화면 | 모바일 빈 띠 | 데스크톱 빈 띠 | 판정 |
|---|---:|---:|---|
| 1 영상·상담 | 5.0% | 4.7% | 통과 |
| 2 요약 확인 | 2.7% | 2.6% | 통과 |
| 3 결과 | 3.6% | 3.3% | 통과 |
| 4 개선 포인트 | 3.6% | 3.3% | 통과 |
| 5 리포트 | 4.0% | 3.8% | 통과 |

`tools/pxgap.py` 변경 없이 DPR 2 PNG의 실제 픽셀로 측정했다. 폭에 따른 레이아웃 분기 **0개**. 모바일/PC 동일 세로 흐름, 본문 최대 폭 840px. m4/d4에 실제 22점에서 생성한 민트 아바타가 보인다. 앱 코드의 미디어 쿼리 전체:

| 위치 | 쿼리 | 성격 |
|---|---|---|
| web/style.css | prefers-reduced-motion: reduce | 접근성, 스크롤 애니메이션 제거 |
| web/style.css | pointer: coarse | 입력 장치, 키보드 안내 숨김 |
| web/instrument.js | pointer: fine (matchMedia) | 입력 장치, 대화 후 포커스 복원 |
| web/report.css | print | A4 인쇄만 적용 |

## 단계 7 — 리포트

| 항목 | 기준 | 실측 / 판정 |
|---|---|---|
| 1페이지 | 총점·고민·확인한 것이 들어갈 것 | PDF 1/3쪽에 총점 30, 승인 고민 원문, 구체적 측정/교본 결론과 4열 표 포함. 통과. |
| 문자열 검사 | 본문에 `신뢰도`·`프레임`·`정규화`·`채널` 없을 것 | customer-body 검사: 신뢰도/프레임/정규화/채널 각각 0건. 통과. |
| 0 차이 항목 | 피드백에 없을 것 | 개선점 3개, 표시 정밀도로 차이 0인 항목 0개. 통과. |
| PDF | `mockups/shots/report.pdf` 제출 | mockups/shots/report.pdf, 3쪽, 594.96×841.92pt(A4). 통과. |
| 인쇄 | A4 세로, 여백 18mm, 항목이 페이지 경계에서 잘리지 않을 것 | @page A4 portrait/18mm. 개선 카드 3개 모두 1쪽 안에 완결, 타수 카드와 영상 카드도 분할 없음. 전체 40항목은 마지막 3쪽. 통과. |

인쇄된 텍스트의 최소 Y: 1쪽 51.225pt, 2/3쪽 51.375pt (18.07/18.12mm). 첫쪽 한글 글꼴의 상승부가 여백을 넘지 않게 인쇄 머리말 패딩을 둔다. SVG 도해는 항목별 실제/교본 수치에서 계산한 회전선·두 호 또는 발/체중점, 손목/주먹/샤프트 근사 그림이다. 개인 사진은 넣지 않는다. 원본 상담/제외 목록/전체 수치표는 부록에 둔다.

## 단계 8 — 누적과 예상 타수

| 항목 | 기준 | 실측 / 판정 |
|---|---|---|
| 2회 분석 | 같은 `profile_id` 로 두 번 돌리면 두 번째에 비교가 나올 것 | 같은 UUID로 실제 API 2회: entries=2, 02회, 비교 +0.0점. h1/h2. 통과. |
| 첫 분석 | 비교 영역이 **없을 것** (빈 칸으로 두지 않는다) | 첫 응답 comparison_history 없음, 비교/변화량 DOM hidden으로 공간도 없음. 통과. |
| 저장 내용 | `profiles/*.json` 에 좌표·영상이 없을 것 (테스트) | profiles JSON whitelist 검사 통과: 점수/항목수치/날짜/비교조건만, 좌표·영상·상담 원문 없음. |
| 예상 타수 | 같은 입력 두 번에 **같은 값**이 나올 것 | 같은 입력의 전체 타수 결과 객체 동일. 현재 75.2–79.2타, 3개 개선 후 74.7–78.7타. 통과. |
| 코스 조건 문구 | 타수 옆에 반드시 있을 것 (테스트) | 정본 3문장 그대로 타수 카드 안에 표시, 브라우저·단위 테스트 통과. |
| 연습 영상 | 고칠 점 3개에 각각 하나. 표에 없으면 검색 링크 | 14개 결함 수동 목록. 실측 개선점 3개 카드 모두 제목/길이/개선점 번호/직접 영상 URL. 목록 밖 검색 fallback. 통과. |

추가 확인: localStorage만 지운 뒤 새 UUID 및 “이전 기록을 찾을 수 없습니다” 안내; 삭제 후 프로필과 연결 리포트 GET 404. 누적은 tracks/profiles, 개별 리포트는 tracks/reports, 이전 tracks/coaching 읽기/쓰기 호환을 유지한다. 저장 시 UUID를 검증하고 잠금 아래 원자적으로 쓴다.

비교는 촬영 방향/원본 크기/FPS/회전 모델이 같은 기록만 대상으로 한다. CSV 등 촬영 정보가 없는 자료는 입력 식별자도 같아야 한다. 항목 구성 차이는 공통 항목만 비교하고 총점 변화와 그래프 연결은 비운다. 원본 크기를 알 수 없는 오래된 캐시도 보수적으로 같은 입력만 비교한다. 타수는 항목별 가중치·점수·영향 계수와 산식 모두 펼쳐 볼 수 있다. 제외 항목은 환산하지 않고 항목당 ±0.25타를 추가해 범위를 넓힌다. 개선 후 값은 선택한 3개 항목만 교본(100점)에 도달한 경우이며 LLM 추정이 아니다.

## 단계 9 — 테스트와 제출

| 테스트 | 내용 | 실측 / 판정 |
|---|---|---|
| `test_no_face_landmarks` | 어디에도 얼굴 11점이 없을 것 | pytest 실제 실행 통과 |
| `test_rotation_3d` | CSV 에서 국면별 X-factor 패턴 | pytest 실제 실행 통과 |
| `test_phases_real_swing` | 국면 5개 + 임팩트 검증 | pytest 실제 실행 통과 |
| `test_no_swing_samples` | 기존 두 샘플이 `no_swing` | pytest 실제 실행 통과 |
| `test_guidance_states` | 세 상태 | pytest 실제 실행 통과 |
| `test_score_range` | 총점 0~100, 제외 처리, 재현성 | pytest 실제 실행 통과 |
| `test_exaggeration_px` | 2.5배 20px 이상 | pytest 실제 실행 통과 |
| `test_report_language` | 금지 문자열 없음, 0 차이 항목 없음 | pytest 실제 실행 통과 |
| `test_profile_accumulate` | 2회 비교, 1회 미생성 | pytest 실제 실행 통과 |
| `test_profile_privacy` | 좌표·영상 없음 | pytest 실제 실행 통과 |
| `test_strokes_deterministic` | 같은 입력 같은 타수 | pytest 실제 실행 통과 |

`tests/mvp_browser.py`는 이전 18점/번들 영상 성공 가정을 제거하고 실제 CSV **22점** 성공 경로 + 명시적 품질 fixture로 갱신했다. IME Enter 방지, Shift+Enter, 실제 2턴 상담, 요약 수정·승인 전 분석 0건, 승인 후 1건, 결과→포인트→리포트, 이력/초기화/삭제, 금지 문구, 수동 영상 카드까지 확인했다. 보조 3D canvas 표시와 실제 WebM 다운로드 **29078 bytes** 확인. 새 원본 영상이나 WebM은 커밋하지 않는다.

- pytest: **50 passed, 13 subtests passed**, 의존성 deprecation 경고 2개.
- Node 수학 회귀: **4 passed**.
- 브라우저 두 흐름: JS pageerror **0건**.
- 정본 지정 PNG **15/15장**. 모바일/품질/이력 780×1688 실제 픽셀, PC 2880×1800, 모두 DPR 2.
- PDF 1/3쪽 도해 항목 분할 없음, 전체 수치표 마지막 3/3쪽.

### 제출 캡처

| 화면 | 모바일 | 데스크톱 |
|---|---|---|
| 1 upload | [m1_upload](mockups/shots/m1_upload.png) | [d1_upload](mockups/shots/d1_upload.png) |
| 2 summary | [m2_summary](mockups/shots/m2_summary.png) | [d2_summary](mockups/shots/d2_summary.png) |
| 3 result | [m3_result](mockups/shots/m3_result.png) | [d3_result](mockups/shots/d3_result.png) |
| 4 point | [m4_point](mockups/shots/m4_point.png) | [d4_point](mockups/shots/d4_point.png) |
| 5 report | [m5_report](mockups/shots/m5_report.png) | [d5_report](mockups/shots/d5_report.png) |

[too_far](mockups/shots/g1_too_far.png) · [tracking_failed](mockups/shots/g2_tracking.png) · [no_swing](mockups/shots/g3_no_swing.png) · [2회차 이력](mockups/shots/h1_history.png) · [2회차 리포트](mockups/shots/h2_report_compare.png) · [PDF](mockups/shots/report.pdf)

## 재현 명령과 출력 전문

작업 폴더 `swing3d/`. 이 환경은 `/workspace/work/venv/bin`을 PATH 앞에 두고, OpenCV 시스템 라이브러리를 `LD_LIBRARY_PATH=/workspace/work/libs/usr/lib/x86_64-linux-gnu`, `MPLCONFIGDIR=/workspace/work/mpl`로 지정했다. Gemini 키는 제거했다. 샘플 이름·국면 번호로 제품 로직을 분기하지 않는다.

정본의 CSV 재현 명령 그대로:

```bash
python3 -c "
import swing_track as st
frames, fps = st.load_csv('samples/swing_front_landmarks.csv')
t = st.build_track(frames, fps); print(t['meta']['phase_frames'])"
```

```text
{'address': 81, 'top': 118, 'down': 141, 'impact': 146, 'finish': 172}
```

```bash
python -m pytest tests/ -q
node --test tests/test_comparison.cjs
python tests/mvp_browser.py
BUILD_BROWSER_RESULT=mockups/complete-avatar.json python tests/build_browser.py
python tests/measure_build.py > mockups/complete-measure.json
python tools/pxgap.py mockups/shots/{m,d}{1_upload,2_summary,3_result,4_point,5_report}.png
pdfinfo mockups/shots/report.pdf
```

pytest 출력 전문:

```text
..................................................          [100%]
=============================== warnings summary ===============================
tests/test_completion.py::test_no_swing_samples[golf_swing.mp4]
  <frozen importlib._bootstrap>:488: DeprecationWarning: Type google._upb._message.MessageMapContainer uses PyType_Spec with a metaclass that has custom tp_new. This is deprecated and will no longer be allowed in Python 3.14.

tests/test_completion.py::test_no_swing_samples[golf_swing.mp4]
  <frozen importlib._bootstrap>:488: DeprecationWarning: Type google._upb._message.ScalarMapContainer uses PyType_Spec with a metaclass that has custom tp_new. This is deprecated and will no longer be allowed in Python 3.14.

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
50 passed, 2 warnings, 13 subtests passed in 35.89s
```

Node 출력 전문:

```text
✔ deficits approach zero continuously without reversing either direction (13.125042ms)
✔ address offsets and actual phase indices anchor all measured channels (0.339191ms)
✔ zero stays zero and the sign and slope are continuous at the start of exaggeration (41.635805ms)
✔ exaggeration is exact at 1×, eases at the range and alters only its channel (0.574415ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 149.312917
```

아바타 실제 측정 출력 전문:

```json
{
  "canvasCSS": [
    358,
    296
  ],
  "landmarks": 22,
  "frame": 118,
  "maxJointPx": 22.476295832780945,
  "exclusivePixels": 4917,
  "avatarUnionPixels": 32391,
  "exclusiveRatio": 0.1518014263221265,
  "top8AvatarPixels": 0,
  "playFrames": [
    118,
    132
  ],
  "seekFrame": 141,
  "exact390": {
    "canvasCSS": [
      390,
      296
    ],
    "landmarks": 22,
    "frame": 118,
    "maxJointPx": 22.476295832780945,
    "exclusivePixels": 4917,
    "avatarUnionPixels": 32391,
    "exclusiveRatio": 0.1518014263221265,
    "top8AvatarPixels": 0
  },
  "allFrames": {
    "frames": 92,
    "maximumAvatarPixelsInOuter8": 0
  },
  "errors": []
}
```

브라우저 실제 측정 출력 전문:

```json
{
  "screens": {
    "m1_upload": [
      390,
      844,
      2
    ],
    "m2_summary": [
      390,
      844,
      2
    ],
    "m3_result": [
      390,
      844,
      2
    ],
    "m4_point": [
      390,
      844,
      2
    ],
    "m5_report": [
      390,
      844,
      2
    ],
    "h1_history": [
      390,
      844,
      2
    ],
    "h2_report_compare": [
      390,
      844,
      2
    ],
    "d1_upload": [
      1440,
      900,
      2
    ],
    "d2_summary": [
      1440,
      900,
      2
    ],
    "d3_result": [
      1440,
      900,
      2
    ],
    "d4_point": [
      1440,
      900,
      2
    ],
    "d5_report": [
      1440,
      900,
      2
    ],
    "g1": [
      390,
      844,
      2
    ],
    "g2": [
      390,
      844,
      2
    ],
    "g3": [
      390,
      844,
      2
    ]
  },
  "errors": [],
  "mpoint": {
    "css": [
      358,
      296
    ],
    "frame": 118,
    "points": 22
  },
  "report": {
    "zeroDifferences": 0,
    "curated": 3,
    "forbidden": []
  },
  "history": {
    "session": "02회",
    "delta": "+0.0점",
    "comparison": "같은 촬영 조건과 같은 항목으로 지난 기록과 비교했습니다."
  },
  "profileEntries": 2,
  "resetMessage": "이전 기록을 찾을 수 없습니다. 새 프로필로 시작합니다.",
  "dpoint": {
    "css": [
      840,
      352
    ],
    "frame": 118,
    "points": 22
  },
  "webmBytes": 29078
}
```

픽셀 빈 띠 출력 전문:

```text
m1_upload.png      빈 띠   42px ( 5.0%)  y=289
m2_summary.png     빈 띠   22px ( 2.7%)  y=368
m3_result.png      빈 띠   30px ( 3.6%)  y=116
m4_point.png       빈 띠   30px ( 3.6%)  y=667
m5_report.png      빈 띠   34px ( 4.0%)  y=83
d1_upload.png      빈 띠   42px ( 4.7%)  y=317
d2_summary.png     빈 띠   23px ( 2.6%)  y=586
d3_result.png      빈 띠   30px ( 3.3%)  y=116
d4_point.png       빈 띠   30px ( 3.3%)  y=723
d5_report.png      빈 띠   34px ( 3.8%)  y=83
```

전체 좌표/국면/점수/영상 재측정 JSON 출력은 [complete-measure.json](mockups/complete-measure.json), PDF 메타데이터 전문은 [complete-pdfinfo.txt](mockups/complete-pdfinfo.txt)에 보존했다. `tools/pxgap.py`와 정본·토큰은 수정하지 않았다.
