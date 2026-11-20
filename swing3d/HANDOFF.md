# 최신: 이미지 분석 중심 + 작은 골퍼 (2026-11-20)

`VISUAL_ANALYSIS_RESULTS.md`와 MVP_INTEGRATION.md 0-F를 먼저 읽는다. 결과는 잘한 점1/개선점3의 실제 좌표 재구성 이미지·부위 확대·구간 반복. 원본 사진으로 표시하지 않는다. 코스에는 연출용 작은 골퍼가 스윙한 뒤 공이 출발. 기본 PDF는 분석 중심5쪽, 코스 포함은 선택 시9쪽. Python54+하위13/Node13/스타일1 및 모바일·PC/정적 경로 검증.

## PDF 저장 결과 확인 (2026-11-20)

`COURSE_PLAY_RESULTS.md` PDF 절과 `mockups/shots/course-report.pdf` 확인. 코스 실행 시 동일 시나리오의 9홀/클럽 가정/9개 경로·샷 기록을 기존 보고서와 함께 A4 7페이지로 출력한다. 코스 미실행은 추가 데이터를 생성하지 않는다. Node13+스타일1 통과, PDF 예시 기본 시나리오41타/선택 시나리오40타 일치 확인.

# 최신 확장 — 코스 PLAY (2026-11-20)

사용자 승인 시안을 유지한 코스 플레이를 결과·리포트에 연결했다. `COURSE_PLAY_RESULTS.md`와 MVP_INTEGRATION.md 0-E를 먼저 읽는다. 브랜치 `feat/swing3d-course-play`. 현재 밸리 9홀, 가정 기반 샷 모델이며 네이버 자동 수집/정확도/공개 지도 권한은 미완료다. 연구용 원본 이미지는 커밋에서 제외한다.

# MotionGuard — 새 세션 인수인계

## 최신 실행 — 단계 11 (2026-11-19)

시작 1532363, 최종 작업 브랜치 feat/swing3d-visual-tokens.
[VISUAL_TOKEN_RESULTS.md](VISUAL_TOKEN_RESULTS.md)와 MOTIONGUARD_BUILD.md의 단계 11을 먼저 읽는다.
A~D/G/F·E/H 네 PR로 분리, 각 단계별 커밋. 최종 pytest 54개/하위13개 통과지만
D 조작 수, F 좌표 대조·실제 폰/정상 영상, E 회전, G 공개 배포는 미통과/미검증이다.
이를 “전체 통과”라고 바꾸지 않는다. 시연 shim은 제거됐고 정적 빌드는 실제 브라우저 계측이다.
현재 원본 정상 스윙 영상은 없으며 CSV만 있다. main/Pages 설정은 변경하거나 병합하지 않았다.

## 이전 실행 — 2026-11-19 (9cfee75 기준)

[BUILD_COMPLETE_RESULTS.md](BUILD_COMPLETE_RESULTS.md)에 1–9단계 통과 조건 표와 실제 출력 전문을 기록했다. PR #5 구현을 이어 5단계 새 게이트·머리 잘림을 수정하고 6–9단계를 완료했다. 현재 정본 게이트 미통과 0개, 검증 한계는 결과 문서에 별도 명시했다. 새 캡처 m1–m5/d1–d5/g1–g3/h1–h2와 report.pdf가 최신이다. 이전 BUILD_RESULTS.md는 당시 3% 게이트로 중단한 역사 기록이다.

## 먼저 읽을 것

**[MOTIONGUARD_BUILD.md](MOTIONGUARD_BUILD.md) 가 전체 단일 기준이다.**
제품 정의, 현재 상태 실측, 단계 1~9, 통과 조건, 금지 사항이 전부 그 안에 있다.

| 순서 | 파일 | 역할 |
|---|---|---|
| 1 | `MOTIONGUARD_BUILD.md` | **작업 지시. 여기부터 읽는다** |
| 2 | `web/tokens.css` | 디자인 토큰과 규칙 15개. 화면 CSS 는 이 변수만 쓴다 |
| 3 | `mockups/design_system.html` | 그 토큰이 어떻게 생겼는지. 화면 5장 |
| 4 | `MVP_INTEGRATION.md` | 사용자가 확정한 제품 흐름 (배경) |
| — | `superseded/` | 지난 지시서. **작업 기준으로 삼지 마라** |

## 역할

- **사용자** — 제품 방향과 화면 품질 승인
- **검토 AI** — 원인 추적, 지시서 관리, 결과 독립 검증 (직접 실행해 숫자로 확인)
- **Codex** — 구현·테스트·스크린샷·커밋. 미통과는 숨기지 말고 그대로 보고

## 판정 기준 하나

**자동 테스트 통과는 완료가 아니다.** 테스트 18개가 전부 녹색인데
과장이 화면에서 0이었던 적이 있다. 완료 판정은 **스크린샷과 숫자**로 한다.

## 환경·보안

- `.env`, `local-data/`, `.venv/`, `*.mp4`, `*.mov`, `outputs/`, `__pycache__/` 커밋 금지.
  커밋 전 `git diff --cached` 확인
- Gemini 키는 서버/로컬 환경변수만. 코드·문서·PR 본문에 쓰지 않는다
- 원본 영상은 로컬. 저장소에는 **좌표만** 넣는다 (`samples/swing_front_landmarks.csv`)
- 얼굴 11점은 만들지 않는다. 어깨 아래 22점만
- SMPL / SMPL-X / GVHMR 사용 금지 (비영리 라이선스. 이것은 사업이다)
- 로컬 MediaPipe 모델과 vendor 파일은 유지해 오프라인 계측이 가능해야 한다

## 2026-11-19 구현·실측 인계

첨부 단일 기준으로 1~4단계를 수행하고 **5단계 픽셀 조건 미통과에서 중단**했습니다. 자세한 표와 증거는 [BUILD_RESULTS.md](BUILD_RESULTS.md).
- 실제 스윙: 81/118/141/146/172, X-factor 탑 −33.6319° / 임팩트 +12.6589°.
- 얼굴 없는 22점, world 회전, 3상태 안내, 점수 API 30.04/100 구현.
- 390px 캔버스 이동 33.1198px, 픽셀 차이 **2.171846% < 3%**. 머리 상단 잘림도 남음.
- Python 43 tests +13 subtests, JS 4 tests 통과. `python tests/build_browser.py`는 실제 픽셀 기준에서 exit 1.
- **6~9단계 미진행**. tokens/design 전면 이식, 새 리포트/PDF, 프로필/예상 타수/drills/최종 15장 캡처가 완료된 것이 아님.
