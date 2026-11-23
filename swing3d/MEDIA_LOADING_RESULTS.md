# 원본 영상 장면 읽기 오류 및 요약 화면 복원

사용자 캡처의 원본 영상을 읽지 못했습니다 문구는 video-evidence.js wait()의 공통 오류였다. 좌표 추출 후 별도 video요소로 대표장면을 읽는 지점에도 적용되므로 0%표시만으로 원본 좌표 디코딩 실패라고 확정할 수 없다. 기존 video는 DOM 미부착,명시적 load 없음,ready state체크 없음,대기5초,loadeddata실패를 swallow했다. 모바일에서 로딩/seek가 지연될 가능성이 있으며 실제 단말 원인 확정은 미완료다.

개선: 작은 비상호작용 인라인 video를 DOM에 부착,리스너를 source 이전 등록,load 명시,readyState처리,20초제한,로드 오류 전파,이벤트 정리 및 clear시 DOM제거. 에러는 loadeddata/seeked 구분. 사용자 영상 외부 업로드 추가 없음. 승인 요약→대표사진5장 payload summary 연결 유지. 최신요청으로 수정가능 요약 화면/이대로 분석 복원.

Node52개 통과. 생성된 video코드를 mock DOM에서 실행해 source 로드 전 부착,loadeddata,frame출력,clear제거를 검증했다. 요약은 사용자 수정/승인 전 분석이 시작되지 않음을 검증했다. mock은 실제 iOS브라우저 검증이 아니다. 실제 사용자 파일의 모바일 성공/사진추론 E2E는 미검증.
