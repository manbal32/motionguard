# golf1.MP4 점검 및 사진 코칭 대체 경로 (2026-11-20)

## 파일 실측

사용자 첨부 golf1.MP4는503334bytes,H.264/720x1280,4.011553초,258프레임,평균64.314fps이다. ffmpeg로실제디코딩/대표이미지5개추출확인. Python2passMediaPipe는258프레임을읽고usable=true,accepted258,phase_frames90/188/199/222/230,impact_verified=false였다. 이결과는iOS브라우저처리성공과동일하지않다. 최근서버로그는상담/요약200만있고visual요청이없어사진모델이전막힘으로추정되지만사용자실제단말실패원인은미확정이다.

## 변경

기존은좌표/국면실패시사진추론까지중단했다. client api/video에서좌표추출throw/usablefalse/60초초과때,원본영상을읽을수있으면기기에서시간분산JPEG5장을읽는대체경로를추가했다. 영상길이30.5초/150MB제한,중복사진/읽기불가/취소는명시적으로실패. 좌표추출의별도abort/time limit로무한대기방지. 결과스코어/코스/PDF는기존Gemini공통결과를사용한다.

이경로의사진은실제어드레스/탑/임팩트를검증한것이아니므로phase_unverified=true로모델에전달하고화면에대표장면/국면미확정표시. 30fps값은시간을색인화하기위한대체값이지원본측정fps가아님. meta.usable=false/photo_only=true/accepted_frames0/score.total=null/빈좌표를보존하고2D는제공하지않는다. 실제기기내계측미완료를성공으로조작하지않는다. 원본영상추가외부전송없음.

## 실측 검증

최신배포API에이파일에서ffmpeg로추출한서로다른JPEG5장+테스트고민전송:HTTP200,11.61초,입력6410+출력1333=7743토큰,근거항목5개,unverified표시5개보존,사진평가75점. 모델범위도응답했으나실제타수정확도검증아님. 이테스트는같은사용자파일의사진을사용한실제서버분석검증이며새브라우저대체추출UI의실제iOS검증은아니다.

Node60개통과/실패0,portable hosted빌드/JS문법통과. 새회귀는독립사진5개반환,추적미완료/점수null유지,원본video요소정리,취소시실패검증이다. 실제iOS파일선택→fallback→결과/PDF E2E는지원브라우저도구부재로미검증이다. 모든영상/모든코덱/정확한임팩트인식을보장하지않는다.

개인원본/JPEG/좌표추출/모델원문은 /workspace/artifacts/golf1 에만보관하고Git/공개Siteassets에포함하지않는다.
