# 사진·상담 기반 참고 안내 디자인

예상 타수 비교 그래프 아래의 긴 한 문장을 작은 안내 카드로 바꿨다.

- 사진과 대화를 뜻하는 아이콘과 ‘사진과 상담으로 살펴본 예상 변화’ 제목.
- ‘18홀 참고 범위’, ‘연습 반영 가정’ 두 태그로 기준 분리.
- ‘실제 타수 감소를 보장하지 않는 참고 예상이에요.’라는 짧은 안내.

흰색 배경·연한 녹색 테두리와 태그·짙은 제목으로 기존 비교 카드 색상을 맞췄다. 좁은 화면에서는 제목/태그가 자연스럽게 줄바꿈하며 안내는 구분선 아래에 둔다. 인쇄에서는 카드 안에서 페이지가 나뉘지 않도록 설정했다. 숫자·예상 범위·변화량/그래프·접기 내용과 기존 서비스 로직은 변경하지 않았다.

기존 검사 ai-result, result-pipeline, report-navigation, complete-report, report-pdf 총15/15 및 GitHub mirror15/15 통과. 낮은 영향의 표시 변경이므로 새 테스트/추가 모델 요청이나 개인 미디어 전송은 없다. 공개 변경파일 ai-result.js/experience.css의 SHA와 server/client build,메인HTML 새build 연결을 확인했다.

card-design-example.png는 실제 컴포넌트에서 제목/태그/안내/아이콘을 추출해 만든 정적 배치 예시로, 브라우저 스크린샷이 아니다. 실제 iPhone/Safari 시각/터치는 도구 부재로 미검증이다.

Sites v96 / source 26a8470a7ad2c4789c5e1b61ee082c97a7d2808c / build 965fd409e8c937be6230.

https://motionguard-mobile-play.creamhome4.chatgpt.site

공개 근거: public-validation/estimate-note/. 개인 사진·상담·키는 포함하지 않는다.
