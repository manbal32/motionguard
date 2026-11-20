# 11-H — 색·무게·타입 토큰 및 최종 회귀

앞 단계 커밋을 포함한 후속 브랜치이며 최종 대상은 feature/swing3d다.
선행 PR을 순서대로 병합하면 diff가 각 단계로 줄어든다.

## 통과 조건

| 항목 | 기준 | 390×844 | 1440×900 |
|---|---|---|---|
| 한 화면의 진한 단추 | 1개 | 10상태 모두 1개 | 10상태 모두 1개 |
| tokens.css 밖 색 | 하드코딩 hex 0개 | 앱 코드 0개 | 동일 |
| 글자 크기 하드코딩 | 0개, --t-*만 | 0개 | 동일 |
| 명암비 | 본문 ≥4.5:1 | 최저 4.626698:1 | 최저 4.626698:1 |

처음/업로드/요약/진행/2D/결과/리포트/too_far/tracking_failed/no_swing을 두 폭에서
직접 실행했다. 주 버튼 수는 viewport와 스크롤 부모를 교차해 실제 보이는 단추만 센다.
결과 본문만 스크롤하고 하단 단추는 항상 보인다. 첫 파일 전에는 파일 선택이 주 버튼이다.

주황 글자/흰 바탕은 4.090622:1로 미달이었다. 판정 글자는 잉크로, 주황은 테두리/표시에
사용하여 글자와 색이 함께 뜻을 전달한다. 3D 재질/안내 SVG도 기존 팔레트를 읽는다.
색을 추가하지 않았다. 검사 범위는 앱 자체 CSS/JS/HTML/SVG이며 vendor/모델·텍스처/
참고 시안은 제외한다. 인쇄용 기존 9px/10px와 단위 em도 --t-* 토큰으로 이관했다.
미터는 측정/교본/허용폭에서 계산한 축을 쓰며, 실제 값에 따른 위치와 기준 띠 모두 폭>0이다.

## 최종 검증

- pytest **54 passed, 13 subtests passed**, 의존성 경고 2개.
- 수학 회귀 **4 passed**. JS pageerror 0건. 보조 3D/WebM 저장도 확인.
- 오프라인 새로고침, 실제 CSV 2회, 리포트 왕복, 프로필 요약 저장/삭제/새 UUID 통과.
- 네트워크를 끄고 실제 세로 영상 추출 → no_swing, 코칭 analyze 호출 0건.
- 생성한 비인물 1초 영상 → accepted **0/30**, tracking_failed. 원본 미커밋.
  인물 검출 실패는 API의 정상 품질 안내로 연결하고 일반 오류도 요약에 보이게 보완했다.
  브라우저 MediaRecorder의 fragmented MP4도 demux 샘플 시간으로 읽어 accepted 0/29를 확인했다.
- 최종 PDF A4 세로/18mm/3쪽. 첫쪽에 총점·고민·확인 표가 있고 개선 카드가 쪼개지지 않는다.
  전체 수치표는 마지막 쪽. PDF와 전체 최신 15장 회귀 캡처를 함께 제출한다.
- 첫 회차 차트는 없애도 기록 삭제는 별도 “기록 관리”에서 첫 회차부터 접근 가능하다.

실측 원본: [20상태](mockups/11h-visual.json), [오프라인](mockups/11h-offline.json),
[비인물](mockups/11h-no-person.json), [pytest 전문](mockups/11h-pytest.txt),
[Node 전문](mockups/11h-math.txt), [빈 띠 전문](mockups/11h-pxgap.txt), [PDF](mockups/shots/report.pdf).

```bash
cd swing3d
PYTHONPATH=. CHROMIUM_PATH=/usr/bin/chromium python3 -m pytest tests -q
python3 tests/mvp_browser.py
node --test tests/test_comparison.cjs
BUILD_GUIDANCE_FIXTURES=/tmp/guidance.json MOBILE_URL=http://127.0.0.1:8892 node tests/visual_tokens.cjs
python tools/build_pages.py --out /tmp/site/motionguard
python -m http.server 8891 --directory /tmp/site
node tests/static_offline.cjs
node tests/browser_no_person.cjs
python tools/pxgap.py mockups/shots/11h_*.png
```

안내 fixture는 tests/test_capture_guidance.py의 fixtures()로 생성한다. 품질 화면은 명시적
fixture이며 실제 영상 추출/비인물 테스트와 구분했다. 본문 대비는 SVG 장식과 비활성
컨트롤을 제외한 HTML 본문 전체(스크롤 안 내용 포함)를 배경 합성 후 계산했다.

| 화면 | 모바일 | PC |
|---|---|---|
| 처음 | [첫 화면](mockups/shots/11h_mobile_empty.png) | [첫 화면](mockups/shots/11h_desktop_empty.png) |
| 대화 | [업로드·대화](mockups/shots/11h_mobile_upload.png) | [업로드·대화](mockups/shots/11h_desktop_upload.png) |
| 요약 | [요약](mockups/shots/11h_mobile_summary.png) | [요약](mockups/shots/11h_desktop_summary.png) |
| 2D | [스윙](mockups/shots/11h_mobile_point.png) | [스윙](mockups/shots/11h_desktop_point.png) |
| 결과 | [결과](mockups/shots/11h_mobile_result.png) | [결과](mockups/shots/11h_desktop_result.png) |
| 리포트 | [리포트](mockups/shots/11h_mobile_report.png) | [리포트](mockups/shots/11h_desktop_report.png) |

## 전 단계의 남은 미통과 — 없어지지 않았다

| 단계 | 미통과/미검증 |
|---|---|
| D | 필수 개별 조작 10개 > 6개. 묶어 세거나 기능을 지우지 않았다 |
| G | 공개 URL 404. main workflow 미실행, 실제 폰 미검증 |
| F | 최대 좌표 차이 x .064138/y .037202/z .137570 > .02. 정상 스윙 영상 국면/점수와 실제 중간 폰 성능 미검증 |
| E | 탑 몸통139.340185°/골반105.708307°, 회전 제외2개, 총점31.48→31.48. 네 게이트 미통과 |

정상 스윙 원본 영상이 없어 CSV의 lite world z를 heavy로 재추론하지 못했다.
값을 맞추려고 각도·fps·허용폭·가중치를 바꾸지 않았다. 정적 브라우저 계산부는 같은 CSV에서
Python과 전 채널 차이0, 국면/점수 일치지만 이것을 영상 추론 게이트 통과라고 쓰지 않는다.

**Pages를 켜 주세요.** Settings → Pages → Source = GitHub Actions.
feature PR 병합만으로 게시되지 않으며 main 반영 후 workflow/실제 폰을 검증해야 한다.
main이나 다른 PR을 임의로 병합하지 않았다.
