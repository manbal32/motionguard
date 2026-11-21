# 11-F · 11-E — 브라우저 계측과 회전 검토

이 PR은 11-G 커밋을 포함한 브라우저 계측/회전 후속 브랜치다. 최종 base는
feature/swing3d이며 선행 PR 병합 후 해당 단계 diff로 줄어든다. F와 E는 별도 커밋이다.

## 실제 구현

- MediaPipe Tasks Vision 0.10.21 JS/WASM을 Apache-2.0 원문 라이선스와 함께 vendor에 보관했다.
  기존 lite 모델 사용. 런타임 CDN 요청 없음.
- VIDEO 모드 stride 3 → 25% 여유 고정 정사각 크롭 → 640px 이상 확대 → 전 표본 2패스 →
  원본 역변환. world 동시 추출, 애플리케이션에는 11–32 신체 22점만 복사한다.
- native JS 필터/원본 시점 보존/국면/점수/타수 구현. 교본과 점수 상수는 reference.js 단일 출처.
  실제 CSV에서 Python 대비 **전체 채널 차이 0**, 국면 정확히 일치, 점수 **31.48 / 31.48**.
- MP4Box 0.5.4(BSD-3-Clause) + WebCodecs로 순차 디코딩. 지원하지 않으면 HTML video fallback.
  반복 seek 시 가로/세로 84.777/40.528초였고 최종 WebCodecs 벽시계 **14.174/12.376초**였다.
- 녹화 시연 shim/recorded.json 제거. 정적 앱은 실제 업로드한 파일을 읽는다.
  상담은 외부 AI 없는 기준 코칭임을 표시한다. 기존 Python/Gemini 동의 경로는 로컬 서버에서 보존한다.
- IndexedDB tracks/reports/profiles 분리, profile은 요약만 저장. 원본 영상은 전송/저장하지 않는다.
  서비스 워커는 공개 앱/모델만 캐시. 두 번째 실제 추출은 네트워크를 끈 상태에서도 완료했다.

## 11-F 통과 조건과 미통과

| 항목 | 기준 | 실제 값/판정 |
|---|---|---|
| 같은 영상·프레임 | 정규화 차이 ≤0.02 | **미통과**: 아래 전수 최대값 참조 |
| 국면 | Python ±2프레임 | 두 음성 영상은 양쪽 no_swing/국면 없음. **정상 스윙 영상은 미검증**. CSV 계산부는 5국면 정확히 일치 |
| 총점 | Python ±3점 | CSV 양쪽 31.48(차이 0). 두 음성 영상 null. **정상 스윙 영상은 미검증** |
| 외부 요청 | 분석 중 0건 | 실제 두 영상 0건, pageerror 0건. 통과 |
| 9초 영상 | 중간 폰 60초 안 | 데스크톱 14.174/12.376초. **실제 중간 폰은 미검증** |

두 영상 각각 **270개 공통 시점 × 22점 × xyz** 전수 비교, 원본 정규화 공간:

| 영상 | x 최대 / RMS | y 최대 / RMS | z 최대 / RMS |
|---|---|---|---|
| 가로 | .039821 / .004728 | .037202 / .003847 | .107585 / .011199 |
| 세로 | .064138 / .007795 | .027290 / .001860 | .137570 / .018767 |

RMS를 최대값 게이트 대신 쓰지 않았다. 서로 다른 1패스 크롭과 모델/디코더 추론 차이가 남는다.
동일한 좌표를 입력한 계산부가 완전히 일치하는 것과 실제 영상 추론의 차이를 구분했다.
정상 스윙 원본은 첨부/저장소에 없고 CSV만 있으므로 실제 정상 영상의 국면/점수를 검증하지 못했다.
두 번들 영상이 성공 사례인 것처럼 만들지 않았다. 모델 수치에 보정 배율이나 샘플 예외는 없다.

## 11-E 통과 조건과 원인

| 항목 | 기준 | 실제 값/판정 |
|---|---|---|
| 탑 몸통 | 절대값 ≤120° | **미통과: 139.340185°** |
| 탑 골반 | 절대값 ≤90° | **미통과: 105.708307°** |
| 회전 excluded | 0개 | **미통과: 2개** (top_torso/top_hips) |
| 총점 | 현재보다 상승 | **미통과: 31.48→31.48**, 변화 0 |

어깨 raw yaw 170.030058° → 30.689892°, 골반 175.745381° → 70.037088°다.
차이가 이미 ±180° 안이므로 unwrap의 360° 오류가 아니다. 상대각 되감기를 구현해도
이 스윙은 변하지 않는다. CSV의 lite world를 heavy로 다시 추론하려면 원본 영상이 필요하다.
**각도·fps·허용폭·가중치를 바꿔 맞추지 않았다.**

| 국면 | 몸통 전→후 ° | 골반 전→후 ° | X-factor 전→후 ° |
|---|---|---|---|
| 어드레스 | 0→0 | 0→0 | 0→0 |
| 탑 | −139.3402→−139.3402 | −105.7083→−105.7083 | −33.6319→−33.6319 |
| 다운 | −13.5471→−13.5471 | −12.3374→−12.3374 | −1.2097→−1.2097 |
| 임팩트 | +15.4924→+15.4924 | +2.8335→+2.8334 | +12.6589→+12.6589 |
| 피니쉬 | +97.3007→+97.3007 | +72.9010→+72.9010 | +24.3998→+24.3998 |

직접 소수 반올림 차이까지 포함한 전/후는 11e-rotation.json에 보존했다.
추가로 excluded 수치가 coach 후보에 남아 고객에게 나오던 경로를 같은 plausible 상수로 막았다.
이전 리포트 조회도 새 규칙으로 갱신하며 계산 revision이 다른 이력은 비교하지 않는다.
안전한 확정 항목만 비교하므로 기본 그림은 이제 피니쉬 국면이다. 픽셀 검사는 이전 탑 고정값이
아닌 현재 UI의 선택 항목 국면에서 한다: f172, 폭 390px 이동 **82.936199px**, 면적 차이 **21.090192%**,
상단 8줄 **0개**, 92시점 사방 경계 최대 **0개**. 양의 크기만 숨긴 채 통과시키지 않는다.

## 재현과 증거

```bash
cd swing3d
PYTHONPATH=. CHROMIUM_PATH=/usr/bin/chromium python3 -m pytest tests -q
node tests/test_browser_core.cjs
python tools/build_pages.py --out /tmp/site/motionguard
python -m http.server 8891 --directory /tmp/site
PAGES_TEST_URL=http://127.0.0.1:8891/motionguard/ node tests/pages_browser.cjs
POSE_OUTPUT=/tmp/pose node tests/browser_pose.cjs
python tests/compare_browser_pose.py /tmp/pose
python tests/measure_rotation_review.py
```

Python 테스트 **53 passed, 13 subtests passed**, 경고 2개. 실제 보조 3D/WebM **29,011 bytes**.
새 미통과를 남기고 마지막 11-H로 진행한다. 공개 Pages 배포/실제 폰 확인은 여전히 미검증이다.

- [계산기 대조](mockups/11f-core.json), [실제 영상 전수 대조](mockups/11f-video-comparison.json), [추출 출력 전문](mockups/11f-runtime.txt)
- [정적 브라우저](mockups/11f-pages.json), [회전 전/후](mockups/11e-rotation.json), [pytest 전문](mockups/11e-pytest.txt), [픽셀 검증](mockups/11e-avatar.json)
- [모바일 2D](mockups/shots/11e_mobile_point.png), [모바일 리포트](mockups/shots/11e_mobile_report.png), [PC 2D](mockups/shots/11e_desktop_point.png), [PC 리포트](mockups/shots/11e_desktop_report.png)
