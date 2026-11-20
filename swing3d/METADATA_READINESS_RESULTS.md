# 원본 영상 길이 로딩 순서 결함

2026-11-20. 사용자 캡처는 원본 영상 길이를 읽지 못했습니다. 이는 Gemini 요청 전 MotionStills.extract의 길이검사에서발생한다. register가새video를load한직후선택기가동기info.duration을읽어NaN이면즉시거절하던실제코드결함을확인했다.

## 수정

- MotionVideo.ready(id,{signal})는등록된loadeddata Promise를기다린다. 수신후유한양수duration확인,media값이Infinity/NaN이면원본컨테이너프레임수/fps값을사용한다.
- MotionStills.extract는ready를await한뒤후보시점을만들고사진을읽는다. 기다리는동안signal취소를즉시처리한다.
- instrument는원본전체total_frames/fps길이를등록한다. 잘린스윙국면구간의dur를원본길이로쓰지않는다.
- 영상frame의seek상한도같은유한길이로제한해Infinity/NaN이currentTime에전달되지않게한다.
- 사진다양성/국면후보/수신해시/AI응답보완/리포트이동은유지한다.

| 재현 | 실측 |
|---|---|
| 등록직후duration NaN | 실제모듈통합재현 |
| loadeddata지연동안 | 실패하지않고대기,캔버스draw0회 |
| loadeddata도착후 | 실제선택기에서서로다른5장선택완료 |
| media duration Infinity | 컨테이너4초,5장선택,모든시점유한 |
| 대기중취소 | AbortError,캔버스draw0회 |
| 전체회귀 | 90/90통과 |
| 실제Safari업로드조작 | 미검증 |

가짜video의이벤트/픽셀입력으로현재실제MotionVideo/MotionStills모듈을연결한회귀검증이다. 실제Safari기기검증과혼동하지않는다. 이전사진주입API검증만으로브라우저영상등록수명주기를확인했다고보고하면안된다. 개인파일/사진/상담은Git과공개자산에없다.

## 배포 확인

Site버전41/source `faf04584330c82e7a85153c1c7e21ff267b05bc7`, build `388a3f978443fee7323a`. 배포succeeded, 공개파일88/88 SHA256 및서버build일치. 이번수정은모델요청이전의브라우저로딩순서이므로추가Gemini토큰소모없이메타데이터재현·사진선택통합테스트와배포코드일치를검증했다. 실제사용자Safari성공을확인한것은아니다.
