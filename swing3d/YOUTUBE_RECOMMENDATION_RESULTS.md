# Gemini 피드백별 유튜브 추천 (2026-11-20)

개선 후보의 실제 제목·연습 목적별로 최대 2개 영상을 찾는다. 부위별 고정 피드백이 아니며 잘한 점/낮은 확신/판단 보류에는 교정 영상을 붙이지 않는다. 제목·채널·추천 이유·확인 범위를 결과와 PDF에 같은 값으로 보존한다. 기존 결과도 ‘관련 영상 찾기’로 조회·저장한다. URL은 실제 검색/확인 자료의 ID만 사용하며 모델이 생성하지 않는다.

공개 YouTube 검색 메타데이터 조회 실패나 관련 자료 부재에는 공개 검색에서 확인한 영상 9개 인덱스를 사용한다. 이 제한된 목록은 무제한 최신 검색이 아니다. 제목만 확인한 영상과 설명까지 확인한 영상을 구분한다. 전체 영상 시청·자막 검토·개인별 효과 검증을 완료했다고 표시하지 않는다. 영상/사진/좌표/개인 상담은 추가로 보내지 않는다.

| 확인 항목 | 실측/상태 |
|---|---|
| 테스트 | Node25개 통과 (기존18 + 신규7) |
| 구문 | 생성 클라이언트 JS 전체 및 Worker 통과 |
| 실시간 YouTube 조회 | 이 환경에서 직접 연결403. 성공 미검증 |
| Gemini Google Search 대안 | 실제 호출429. 새 키/결제를 임의 생성하지 않음 |
| 공개 확인 자료 | 실제 영상9개, 설명 확인7개/제목만 확인2개 |
| 무릎 피드백 | 확인 인덱스에서 강유정프로/문서율 영상2개 연결 |
| 백스윙 회전 피드백 | 확인 인덱스에서 KyuProTV/JTBC GOLF 영상2개 연결 |
| 사진 API 통합 | 모의 Gemini 결과 이후 검색 실패에도 분석 성공과 실제 인덱스 링크 보존 |
| 관련성 부족 | 무관한 주제는0개. 긍정/보류 외부 검색0회 |
| 전체 영상 시청/자막 | 미실시. 공개 제목/설명 확인과 구분 |
| 모바일 화면/PDF 실제 출력 | 브라우저 QA 도구 부재로 이번 변경 후 미검증 |

공개 자료 URL과 제목/채널은 hosted/data/youtube-index.json에 보존한다. 확인한 원본 링크:

- https://www.youtube.com/watch?v=1R77tfKRLjg
- https://www.youtube.com/watch?v=cvJILvn2wZE
- https://www.youtube.com/watch?v=AXjN5kKgqik
- https://www.youtube.com/watch?v=TqNGQcna5xI
- https://www.youtube.com/watch?v=P3VcytCUhM0
- https://www.youtube.com/watch?v=KkH11rEPTYU
- https://www.youtube.com/watch?v=gllK4e2XgX4
- https://www.youtube.com/watch?v=6TMVkM5rEyY
- https://www.youtube.com/watch?v=OLfMOPKGQzA
