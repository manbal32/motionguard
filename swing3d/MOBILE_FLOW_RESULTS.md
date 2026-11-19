# 단계 11-A~D — 흐름·결과·빈 화면·2D

1532363 (`fix/swing3d-mobile-report`)에서 시작했다. 원격 feature/swing3d의
10-A~H 문서도 병합하여 보존했다. 11-A/B/C/D별 커밋을 나눴다.

| 단계 | 통과 조건 | 모바일 390×844 | PC 1440×900 |
|---|---|---|---|
| A | 분석 후 overlay 먼저 | 통과, results 숨김 | 동일 |
| A | 2초 내 재생 | 250ms에 f84→100 | f84→99 |
| A | 2D→결과 한 번 | 통과 | 통과 |
| A | 결과→스윙 다시 보기 한 번 | 통과 | 통과 |
| A | 2D 리포트 링크 0개 | 0 | 0 |
| A | 리포트는 결과 경유 | 링크 결과에만 1개 | 동일 |
| A | 리포트→결과 한 번 | 같은 탭 복원 통과 | 동일 |
| B | current/after 타수 표시 | 74.3–79.3 / 74.2–79.2타 | 동일 |
| B | 타수 가장 큰 글자 | 22px, 결과 내 최대 22px | 동일 |
| B | 국면 5칸/글자 있음 | 다섯 칸 모두 판정 글자 | 동일 |
| B | 점수 t-total 아님 | 15px, t-item | 동일 |
| B | 첫 회차 history 숨김 | hidden, 안내 한 줄 | 동일 |
| B | 빈 띠 20% 이하 | 2.7% | 4.3% |
| C | 파일·대화 전 미리보기 18~26% | 150/754 = 19.89% | 150/810 = 18.52% |
| C | 첫 말/예시 3개 | 표시·입력·실제 전송 | 동일 |
| C | 빈 띠 20% 이하 | 9.5% | 12.1% |
| D | 무대 본문 45% 이상 | 409/669 = 61.14% | 465/725 = 64.14% |
| D | 바로 보이는 조작 6개 이하 | **미통과 10개** | **미통과 10개** |
| D | 0.으로 시작하는 좌표 수치 0개 | 0 | 0 |

**미통과: 11-D 조작 수.** 문서가 요구한 국면 단추 5개 + 이전/다음 2개 +
강조 + 결과만으로 개별 버튼 9개다. 닫힌 재생 도구 summary까지 10개다.
필수 항목을 삭제하거나 조작군으로 세어 통과라고 쓰지 않았다.
이 항목을 남기고 다음 11-G/F/E/H로 진행한다.

10-I 회귀: 실제 세로 영상과 2턴 상담 뒤 보내기/분석하기 겹침 −83.5px,
요약 스크롤/승인 −29px, 네 칸 잘림 0px. 대화 목록 모바일 203.75px,
PC 259.75px. 원본 비율 contain. 측정 아바타 사람 비례 유지.
초기 재생은 한 번 돈 뒤 f172에서 멈춘다. 리포트 복귀는 탭의 좌표·승인 결과로
복원하며 원본 영상을 재보관하지 않는다. 세션 저장이 막힌 경우 재선택을 안내한다.

## 실행 및 결과

```bash
cd swing3d
PYTHONPATH=. CHROMIUM_PATH=/usr/bin/chromium python3 -m pytest tests -q
python3 tests/mvp_browser.py
MOBILE_URL=http://127.0.0.1:8890 node tests/mobile_flow.cjs
MOBILE_URL=http://127.0.0.1:8890 node tests/mobile_empty.cjs
python3 tools/pxgap.py mockups/shots/11{b,c,d}_*.png
```

환경: /workspace/work/venv, OpenCV 라이브러리 경로 /workspace/work/libs/usr/lib/x86_64-linux-gnu.
첨부 명령 그대로의 첫 실행은 Playwright 기본 실행 파일 부재로 49 passed/1 failed였다.
설치된 Chromium을 지정한 결과는 **50 passed, 13 subtests passed, 2 warnings**.
실제 보조 3D 및 WebM **27,208 bytes**, JS pageerror 0건도 확인했다.
Gemini 외부 호출 없이 데모 코칭으로 검증했다. 성공 경로는 실제 CSV이며,
두 번들 영상은 실제 추출에서 no_swing인 음성 테스트 자료로 유지한다.

실측 JSON: [A~D](mockups/11ad-flow.json), [빈 화면/겹침](mockups/11c-empty.json),
[전체 브라우저](mockups/11ad-browser.json), [pytest 전문](mockups/11ad-pytest.txt).
현재 단계 밖인 회전 과대 추정은 11-E에서 조사한다. 수치나 점수를 이 PR에서 조정하지 않았다.

| 화면 | 모바일 | PC |
|---|---|---|
| 첫 화면 | [11c_mobile_empty](mockups/shots/11c_mobile_empty.png) | [11c_desktop_empty](mockups/shots/11c_desktop_empty.png) |
| 2턴 대화 | [11c_mobile_consult](mockups/shots/11c_mobile_consult.png) | [11c_desktop_consult](mockups/shots/11c_desktop_consult.png) |
| 2D | [11d_mobile_point](mockups/shots/11d_mobile_point.png) | [11d_desktop_point](mockups/shots/11d_desktop_point.png) |
| 결과 | [11b_mobile_result](mockups/shots/11b_mobile_result.png) | [11b_desktop_result](mockups/shots/11b_desktop_result.png) |

리포트는 `mockups/shots/report.pdf`, 최신 15장 회귀 캡처 m1~m5/d1~d5/g1~g3/h1~h2도 포함한다.
