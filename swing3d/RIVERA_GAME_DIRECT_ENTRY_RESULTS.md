# 게임 전용 진입 검증

- 요청: 전체 앱은 유지하면서 영상 업로드·분석을 처음부터 반복하지 않고 게임만 열기.
- 전용 주소: https://motionguard-mobile-play.creamhome4.chatgpt.site/play
- 기존 코스 선택 주소: https://motionguard-mobile-play.creamhome4.chatgpt.site/game
- `play.html`은 같은 원본 게임 HTML에서 `data-quick-play`만 지정해 빌드한다. 게임 로직/날씨/저장은 공유한다.
- 저장된 진행 중 라운드는 자동 이어하기. 저장 없음/손상/완료 시 밸리+레이크 1홀. 코스 선택 버튼으로 조합 변경 가능.
- 전체 앱 첫 화면에도 같은 바로가기를 제공한다. 기존 분석/PDF 동작은 보존한다.
- Node 테스트 161/161: 직접 진입, 실제 샷 핸들러의 공 이동/타수 저장, 재접속 후 동일한 위치와 샷 수, 손상 저장 처리, 기존 선택 화면 유지. 기존 18홀 완주/날씨/전체 앱 회귀 포함.
- 가상 DOM 핸들러 검증은 실기기 클릭 검증과 다르다. 현재 환경에 브라우저 조작 도구가 없어 실제 모바일 UI/터치는 미검증.
- 공개 Sites v62 배포 성공. 소스 SHA `22cf9c7d483653c53de253db616d099a0ed80b6c`, build `1f9d727ce5b2ec12cc78`.
- 배포 후 iPhone Safari User-Agent로 `/play`, `/play.html`, `/game`, `/` 모두 HTTP 200 확인. `/play`만 자동 시작 표식을 가지며 업로드/상담 입력 UI가 없다. 전체 앱 `/`는 게임 바로가기를 포함한다.
- 공개 배포 136개 자산의 SHA256이 빌드와 모두 일치한다. 게임 데이터 4코스/36홀과 필수 JS/CSS 응답 정상, 날씨 API HTTP 200/MET Norway 확인. HTTP 검증은 실제 모바일 화면 검증을 대체하지 않는다.
