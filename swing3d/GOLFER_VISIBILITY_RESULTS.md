# 작은 골퍼 표시 복원 — 2026-11-22

공개: https://motionguard-mobile-play.creamhome4.chatgpt.site
지도 체험: https://motionguard-mobile-play.creamhome4.chatgpt.site/courses?course=giheung-east&hole=3

사용자가 지목한 기존의 모자 쓴 작은 골퍼를 유지했다. v85 코드는 남아 있었지만 /courses의 호스트CSS 변수가 없고, 넓은 홀의 고정 .8배 캐릭터는340px 지도에서 약20px까지 작아지는 문제가 있었다. 실제 iPhone에서 사용자가 본 상태의 유일한 원인인지는 확인하지 못했다.

공통 캐릭터에 자체 색상과 흰색 대비를 주고 본체를 화면 기준 약56px로 표시한다. SVG meet 비율과 짧은 모바일 패널의 여백, 퍼팅 확대·resize를 반영한다. 모자/얼굴/상의의 원래 경로, 스윙·퍼팅·공 따라 걷는 동작을 유지한다. 스윙 때 잘리지 않도록 표시 위치를 제한하며 실제 공 위치/물리/경로/날씨/타수는 바꾸지 않는다. 서비스·지도 체험·직접 게임에 같은 모듈을 공급한다. 호스팅 빌드가 원본 web/ 모듈을 덮어쓰지 않도록 명시적 공개 override를 포함했다.

- 공개 자산165/165 SHA·클라이언트/서버 빌드 일치 확인.
- Node271/271 통과. 신규5검사: 독립 색상·189홀 시작/그린 크기/경계·퍼팅 확대/화면 회전·3동작·전체 진입점 동일 모듈.
- 같은 렌더러의 기흥동3·코리아레이크8·리베라밸리1 정적SVG/PNG 검토. 브라우저 스크린샷이 아님.
- 실제 iPhone/Safari 시각·터치는 도구 부재로 미검증. PNG만으로 성공을 단정하지 않음.
- 시각 변경에 불필요한 Gemini 호출/개인 사진 전송 없음. 기존 지도/결과/게임 회귀 검사 유지.

Sitesv86/source8f9ae25d9fbc0b5f7cc5e794d9205af1258ea50b/build5294cc8a16ad8bbb8444. public-validation/golfer-visibility/ 참조.
