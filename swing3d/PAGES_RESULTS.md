# 11-G — GitHub Pages

`main` push 시 web 복사 → 상대 경로 처리 → Pages artifact → deploy 워크플로를 추가했다.
브라우저 계측 전 단계이므로 녹화 좌표 시연임을 명확히 표시한다. `demo/recorded.json`과
`sample.csv`는 기존 공개 22점 CSV에서 생성했다. 개인 영상·얼굴·API 키를 넣지 않는다.
기존 Python 서버 앱은 그대로 사용 가능하다. 후속 11-F는 이 시연 어댑터를 실제 브라우저 계측으로 교체한다.

| 항목 | 기준 | 실측 |
|---|---|---|
| main 푸시 후 | workflow 성공 | **미통과: PR만 올림, main 배포 실행 없음** |
| 공개 URL | 폰에서 열림 | **미통과: HTTP 404, 실제 폰 미검증** |
| 콘솔 | 에러 0 | 로컬 정적 빌드 390×844/1440×900 모두 0 |
| 경로 | 404 0, 상대 경로 | /motionguard/ 아래 두 해상도 모두 404 0, 외부 요청 0 |

**Pages를 켜 주세요.** 저장소 Settings → Pages → Source = GitHub Actions.
그리고 이 PR이 main에 반영된 뒤 workflow와 https://manbal32.github.io/motionguard/ 를 확인해야 한다.
이 작업에서는 main 병합이나 강제 푸시를 하지 않았다. 미게시를 그대로 남기고 11-F로 진행한다.

```bash
python swing3d/tools/build_pages.py --out /tmp/site/motionguard
python -m http.server 8891 --directory /tmp/site
PAGES_TEST_URL=http://127.0.0.1:8891/motionguard/ node swing3d/tests/pages_browser.cjs
```

실측 JSON: [11g-pages.json](mockups/11g-pages.json).
캡처: [모바일 2D](mockups/shots/11g_mobile_point.png), [모바일 리포트](mockups/shots/11g_mobile_report.png),
[PC 2D](mockups/shots/11g_desktop_point.png), [PC 리포트](mockups/shots/11g_desktop_report.png).

이 PR은 11-A~D 커밋을 포함한 후속 브랜치이며 최종 base는 feature/swing3d다. 선행 PR 병합 후 diff가 Pages 변경으로 줄어든다.
