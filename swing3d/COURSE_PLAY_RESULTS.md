# Course PLAY integration — 2026-11-20

사용자가 승인한 **원본 홀 안내 이미지 + 초록색 PLAY 화면**을 유지하고, 기존 결과·리포트에서 공 비행 시뮬레이션으로 연결했다. 연결 과정에서 넣었던 선 그림 대체안은 사용자 지적 후 제거했다. 상담/요약 승인/2D·3D 교정/연습 링크/PDF/프로필 기능은 보존했다.

## 실제 측정

| 확인 | 실측 | 결과 |
|---|---|---|
| 이번 분석 연결 | 실제 샘플 CSV, 유효 항목 38개 | 통과 |
| 밸리 9홀 합계 | seed 1: 41타, par 36, 홀별 샷+퍼트의 산술 합계 | 통과 |
| 다른 시나리오 | seed 2: 40타, 복귀/새로고침 후 seed 2·40타 유지 | 통과 |
| 샷 연속성 | 모든 다음 샷 start = 이전 end, 좌·우 편차 모두 존재 | 통과 |
| 기본 검증 | 신규 5개 + 기존 JS 5개 = 10개 통과 | 통과 |
| 기존 Python 회귀 | 54개 + 하위 13개, 의존성 경고 2개 | 통과 |
| 실제 앱 진입/복귀 | 모바일 390×844, PC 1440×900 양쪽에서 결과→플레이→결과→리포트→플레이 | 통과 |
| 비행/정지 | 곡선 비행, 정지 동안 좌표 불변, 밸리 2홀 4착지→4온·2퍼트·6타 | 통과 |
| 단일 샷/홀 전환 | 1샷 실행 후 정지, 다음 홀 자동 재생 | 통과 |
| 모바일 폭 | 320px, 390px 가로 넘침 0 | 통과 |
| 정적 서브경로 | `/motionguard/` 연구용 원본 이미지 빌드, 모바일·PC 오류 0 | 통과 |
| 오프라인 | 실제 CSV 분석 후 오프라인 재로드·동일 seed/합계, session profile 제거 후 IndexedDB 재독해 | 통과 |
| 기존 전체 여정 | CSV 상담/요약 수정/2D·3D/WebM/리포트/기록삭제/영상품질 안내, JS 오류 0, WebM 35,781 bytes | 통과 |
| PDF | 3페이지 A4 유지 | 통과 |
| 실제 비거리·구질 예측 정확도 | 보정/검증 데이터 없음; 현재 모델은 가정 기반 | 미검증 |
| 네이버 지도 자동 수집 | 미구현. 이번 홀 이미지는 2023 공개 게시물에서 발견 | 미구현 |
| 공개 지도 자산 | 최신 공식 대조·상업 재사용 권한 미확인. 원본 이미지 소스는 커밋/공개 기본 빌드에서 제외 | 미완료 |
| 모든 골프장/18홀 | 현재 리베라 밸리 9홀만 지원. 18홀 90–92타로 강제 환산하지 않음 | 미지원 |

기존 단계 11 D/F/E/G의 미통과·미검증은 해결했다고 주장하지 않는다. main/Pages 설정/기존 PR 병합은 변경하지 않았다.

## 모델의 의미

`course-core.js`는 원본 분석을 바꾸지 않는 별도 모듈이다. 이번 분석에서 유효한 measured/reference/score 항목만 고른다. 그 평균으로 **가상** 거리 배율 `0.9 + 0.15 × score/100`, 좌우 편차 `8 + 14 × (1-score/100)m`를 정한다. 이는 검증된 인과 모델/구질 판정이 아니다. 방향의 부호는 대칭 난수이며 샷별 바뀐다. 90–92타나 과거 평균을 입력해 역으로 맞추지 않는다.

드라이버는 티샷에만 사용하고, 이후에는 우드·유틸·아이언·웨지를 남은 거리에 맞춰 고른다. 각 실제 착지점에서 다음 그린 방향을 다시 계산한다. 그린 반경 8m에 도달하면 2퍼트(일부 3퍼트) 가정을 더한다. 12샷에도 도달 못하면 합계 미완성으로 표시한다. OB·해저드 충돌 및 벌타는 계산하지 않는다. 클럽별 가정은 화면의 접힌 설명에 모두 공개한다.

## 지도/디자인

`web/course-images/`는 gitignore한 로컬 조사 자료다. `tools/import_course_research.py`는 공개 페이지의 이미지 alt에서 코스명과 1–9홀 번호를 찾아 자동 수집한다. 네이버 타일/사진 API, 권한, 최신 코스 일치를 검증한 것이 아니다. 네이버 지도 adapter는 향후 작업이다. 다운로드 URL의 만료 쿼리/credential은 저장소나 provenance에 쓰지 않는다.

- 지도 없는 상태에서 임의 선 그림으로 바꾸지 않는다. 이미지 로드 실패 안내와 재생 비활성화.
- 사용자 승인 PLAY 팔레트는 `tokens.css`의 `.course-app`에만 한정. 기존 스윙 앱 팔레트 불변.
- 결과에 남아 있는 기존 ‘기본 조건 타수’와 신규 ‘선택 코스 9홀 합계’는 별도 계산으로 표시한다.
- 퍼블릭 Pages 기본 빌드는 연구용 이미지를 포함하지 않는다. 지도 권한/연결 완료 전에는 해당 배포의 지도 플레이가 준비 완료가 아니다.

## 재현

```sh
node --test tests/test_course_core.cjs tests/test_browser_core.cjs tests/test_comparison.cjs
python -m pytest -q
# local server를 띄운 뒤 (코스 이미지 연구자료가 있는 로컬 환경)
COURSE_TEST_URL=http://127.0.0.1:8892/ node tests/course_browser.cjs
python tools/import_course_research.py --out web/course-images
COURSE_TEST_URL=http://127.0.0.1:8893/motionguard/ node tests/course_offline.cjs
# LOCAL RESEARCH ONLY. Public Pages workflow does not set this option.
python tools/build_pages.py --out /tmp/mg-course/motionguard --research-course-images web/course-images
python tools/build_course_preview.py --report-json /path/to/local/report.json --out /tmp/course-preview.html --research-images web/course-images
```

`mockups/course-*.txt/json`, `mockups/shots/course_*`에 측정 출력과 모바일·PC 10장 캡처를 보관한다. 원본 사용자 영상/상담 원문/키/지도 다운로드 원본은 커밋하지 않는다. 내보내는 조사용 HTML은 샘플 CSV의 수치 중 score/measured/reference만 포함하고 사용자 식별자·대화·영상은 제외한다.

최종 추가 확인: 승인한 원본 이미지/초록색 PLAY를 유지한 모바일·PC 10장 재캡처. 공개 기본 빌드에서 이미지가 없을 때 로드 실패 안내/재생 비활성화 확인. 원본 안내 이미지 자동 수집 9/9 성공, 스타일 토큰 회귀 1/1 통과.

## PDF 저장 결과 확장 (2026-11-20)

기존 스윙 분석 PDF에 코스 결과를 실제 출력하도록 연결했다. 코스 미실행이면 이 절을 만들지 않고 기존 3페이지를 유지한다. 실행한 경우 같은 분석 수치와 저장된 seed로 재계산하며 합계가 저장된 시나리오와 다르면 출력하지 않는다.

실제 Chromium PDF: A4 세로 **7페이지**. 1–2페이지 기존 스윙 분석/연습, 3페이지 코스·티·9홀 표·11클럽 거리 가정, 4–6페이지 각 3홀씩 원본 안내도 일부+곡선 경로/샷 번호/클럽/거리/방향/온·퍼트·타수, 7페이지 기존 전체 계측 부록. 텍스트 추출로 7페이지와 각 홀 묶음을 확인했고 3·4페이지를 PNG로 렌더해 잘림·가독성을 확인했다.

- 실제 CSV 38항목, 첫 시나리오 **41타**, 다른 플레이 선택 시 **40타**가 각각 화면과 PDF에 동일하게 반영됨. 전달 PDF는 기존 미리보기 기본 시나리오와 같은 **41타**.
- 코스 미실행 숨김 확인. 원본 안내도/경로 9개, 9홀 행, 11클럽 가정 확인. PDF 브라우저 JS 오류 **0**.
- Node **13개 통과** (기존 10+PDF 시나리오 정합 3). 스타일 토큰 회귀 **1개 통과**.
- PDF에는 실측/가정 구분, OB·해저드 벌타 미반영, 과거 기록 미사용, 수동 경로, 2023년 출처/최신 대조 미확인을 함께 기록.
- 지도 이미지가 없으면 새 지형을 만들지 않고 지도 미연결 안내와 샷 기록을 출력. 공개 기본 빌드의 지도 자산 제약은 그대로 남음.

산출물: `mockups/shots/course-report.pdf`, `course_pdf_summary.png`, `course_pdf_holes.png`, `mockups/course-pdf-*`. `tests/course_pdf_browser.cjs`에서 실제 CSV를 분석하고 재생한 시나리오의 PDF를 생성한다.

```sh
COURSE_PDF_SCENARIO=1 COURSE_PDF_OUT=/tmp/course-report.pdf node tests/course_pdf_browser.cjs
node --test tests/test_course_core.cjs tests/test_course_pdf.cjs tests/test_browser_core.cjs tests/test_comparison.cjs
```
