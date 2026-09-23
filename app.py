"""MotionGuard: inspect the full pose series and edit phase anchors."""
import tempfile
import hashlib
import json
import cv2
from pathlib import Path
import streamlit as st
from dotenv import load_dotenv
from modules.video_loader import VideoLoader
from modules.pose_analyzer import PoseAnalyzer
from modules.frame_selector import FrameSelector
from modules.still_overlay import body_still
from modules.gemini_analyzer import GeminiAnalyzer
from modules.motion_report_ui import render_motion_report
from modules.motion_payload import SCHEMA_VERSION
import os
import importlib
from modules import motion_player, motion_inspector, motion_findings
# Refresh display modules on rerun while preserving extracted pose data.
importlib.reload(motion_player)
importlib.reload(motion_findings)
importlib.reload(motion_inspector)
render_inspector = motion_inspector.render_inspector
from modules.angle_recovery import recover_angles
from modules.research_data import build_research_data
from modules.pose_compat import normalize_pose, prepare_session

load_dotenv(Path(__file__).with_name('.env'))
st.set_page_config(page_title='MotionGuard',layout='wide')
st.title('⛳ MotionGuard — 골프 스윙 분석')
if prepare_session(st.session_state):
    st.info('업데이트 전 분석 캐시를 초기화했습니다. 분석 실행을 다시 눌러 주세요.')
st.caption('전체 좌표와 각도를 확인하고, 4개 국면을 자동으로 찾고 전후 각도 변화를 계산합니다.')
PHASES_TO_SHOW=['어드레스','백스윙 탑','다운스윙','임팩트']
with st.sidebar:
    st.header('⚙️ 설정')
    mock_mode=st.toggle('Mock 모드 (API 없이 테스트)',value=True)
    sport=st.selectbox('종목',['golf'])
    confidence_threshold=st.slider('통계·기준 대조 최소 신뢰도',0.,1.,.5,.05)
    st.caption('신뢰도 기준은 연구 검증 전 설정값입니다.')
    st.markdown('1. 영상 분석 실행\n2. 자동 국면별 각도 확인\n3. 전후 변화 그래프 확인')
uploaded=st.file_uploader('골프 스윙 영상을 업로드하세요',type=['mp4','mov','MOV','avi'])
if uploaded:
    data=uploaded.getvalue()
    digest=hashlib.sha256(data+b'auto-recovery-v4').hexdigest()
    if st.session_state.get('source_digest')!=digest:
        for key in list(st.session_state):
            if key.startswith('motion_') or key in ('analysis_data','analysis_report','report_signature'):
                del st.session_state[key]
        st.session_state['source_digest']=digest
    with st.container(width=850):
        preview_column, summary_column = st.columns([160, 670], gap='small')
    with preview_column:
        with st.container(key='upload_preview'):
            st.markdown("<style>.st-key-upload_preview video{max-height:240px;width:auto!important;max-width:100%;object-fit:contain;border-radius:8px}</style>", unsafe_allow_html=True)
            st.video(data)
            analysis_clicked=st.button('🔍 분석 실행',type='primary')
    summary_area = summary_column.container()
    if analysis_clicked:
        with st.spinner('전체 프레임 좌표·각도 추출 중...'):
            video_path=None
            try:
                with tempfile.NamedTemporaryFile(delete=False,suffix=Path(uploaded.name).suffix) as tmp:
                    tmp.write(data)
                    video_path=tmp.name
                frames=VideoLoader(video_path,sport=sport).load_frames()
                if len(frames)<5: raise ValueError('최소 5프레임 이상의 영상이 필요합니다.')
                analyzer=PoseAnalyzer(sport=sport)
                try: poses=[normalize_pose(p) for p in analyzer.analyze_frames(frames)]
                finally: analyzer.close()
                automatic=[k for k in FrameSelector(sport=sport).select(frames,poses) if k.event_type!='finish']
                for key in list(st.session_state):
                    if key.startswith('motion_') or key in ('analysis_report','report_signature'):
                        del st.session_state[key]
                st.session_state['analysis_data']={'frames':frames,'raw_poses':poses,'automatic':automatic}
            except Exception as exc:
                st.error(f'분석 오류: {exc}')
                st.stop()
            finally:
                if video_path: Path(video_path).unlink(missing_ok=True)
    if 'analysis_data' not in st.session_state:
        st.info('분석 실행을 누르면 전체 프레임을 한 번 추출합니다. 이후 프레임 이동에는 다시 추출하지 않습니다.')
        st.stop()
    saved=st.session_state['analysis_data']
    frames=saved['frames']
    if saved.get('recovery_threshold')!=confidence_threshold:
        saved['poses']=recover_angles(frames,saved['raw_poses'],confidence_threshold)
        saved['recovery_threshold']=confidence_threshold
    poses=saved['poses']
    research_data,key_frames,dynamics=render_inspector(frames,poses,saved['automatic'],confidence_threshold,summary_area=summary_area)
    research_data['raw_series']=build_research_data(frames,saved['raw_poses'],saved['automatic'],confidence_threshold)['series']
    pose_data=research_data['event_angle_observations']
    signature=json.dumps({'payload_schema':SCHEMA_VERSION, 'model':os.getenv('GEMINI_MODEL', 'gemini-3.5-flash-lite'), 'anchors':[k.frame_idx for k in key_frames], 'threshold':confidence_threshold,
                          'mock':mock_mode,'metric':dynamics['metric'],'range':[dynamics['start_frame'],dynamics['end_frame']],
                          'reference':dynamics['reference_frame']},sort_keys=True)
    run_report=mock_mode
    if not mock_mode:
        st.caption('Gemini에는 기준·변화 구간 최대 40프레임의 좌표·각도·각속도를 전송합니다. 입력 50,000토큰 이하에서만 생성하며, 아래 버튼으로 실행합니다.')
        run_report=st.button('자동 분석 결과로 AI 보고서 갱신',disabled=not research_data['segmentation_valid']) or run_report
    if run_report:
        result=GeminiAnalyzer(mock=mock_mode).analyze(key_frames,pose_data,sport,
                 user_context={'research_data':research_data, 'reference_frame':dynamics['reference_frame']})
        st.session_state['analysis_report']=result
        st.session_state['report_signature']=signature
    if st.session_state.get('report_signature')==signature:
        gemini_result=st.session_state['analysis_report']
    else:
        # Keep current measurement tables available without displaying stale model output.
        gemini_result=GeminiAnalyzer(mock=True).analyze(key_frames,pose_data,sport)
        gemini_result['summary']='선택한 자동 국면의 현재 측정표입니다. AI 보고서는 갱신 버튼으로 다시 생성할 수 있습니다.'

    st.subheader("국면별 관절각 통계")
    if not research_data["segmentation_valid"]:
        st.warning("이벤트 순서가 불명확하여 프레임을 미분류로 보존했습니다.")
    st.caption(research_data["segmentation_method"])
    statistic_rows = []
    for phase in research_data["phase_statistics"]:
        for key, stats in phase["angles"].items():
            if stats["valid_count"] > 0:
                statistic_rows.append({"국면": phase["phase"], "관절각": key, **stats})
    if statistic_rows:
        with st.expander("유효 측정값의 국면별 통계"):
            st.dataframe(statistic_rows, use_container_width=True)
    else:
        st.info("통계를 낼 수 있는 유효한 관절각이 없습니다. 아래 측정 상태를 확인하세요.")
    st.download_button("전체 좌표·각도 시계열 및 통계 JSON 저장",
        json.dumps(research_data, ensure_ascii=False, allow_nan=False, indent=2),
        "motionguard_research.json", "application/json", on_click="ignore")

    # 스틸컷 표시
    st.subheader("📸 추출된 핵심 스틸컷")
    show_frames = [kf for kf in key_frames if kf.phase_label in PHASES_TO_SHOW]
    cols = st.columns(len(show_frames))

    for col, kf in zip(cols, show_frames):
        with col:
            if kf.image_bgr is not None:
                still = body_still(kf.frame_data.image_bgr, kf.pose_result.landmarks)
                img_rgb = cv2.cvtColor(still, cv2.COLOR_BGR2RGB)
                st.image(img_rgb, caption=kf.phase_label, use_container_width=True)
            st.markdown(f"**{kf.phase_label}**")
            st.write(f"Frame: {kf.debug.get('best_idx', '-')}")
            st.write(f"Time: {kf.timestamp:.2f}s")
            st.write(f"국면 감지용 손목 Y: {(kf.debug or {}).get('wrist_y', '-')}")
            st.caption("화면 위쪽 0 · 아래쪽 1. 결측 보완·평활화한 국면 감지용 값이며 관절각이 아닙니다.")

            shown_angles = 0
            observation=next(r for r in pose_data if r['phase']==kf.phase_label)
            for key,label in [('shoulder_angle','어깨각'),('wrist_angle','손목 편위각'),('spine_angle','몸통 기울기')]:
                angle=observation.get(key)
                if angle is not None:
                    source=observation['angle_sources'][key]
                    st.write(f"{label}: {angle:.1f}° / f{source['source_frame']}")
                    if key in observation.get('excluded_angles',[]):
                        st.caption('좌표 계산값·저신뢰: 판정 제외')
                    shown_angles += 1
            if shown_angles < 3:
                st.caption(f'산출 각도 {shown_angles}/3 — 주변 탐색 결과는 측정 상태 표 참고')

    # Gemini 분석 결과
    st.divider()
    st.subheader("🤖 AI 분석 결과")

    mode_label = gemini_result.get('mode', 'unknown')
    st.info(f"분석 모드: {mode_label}")
    diagnostics = gemini_result.get('api_diagnostics') or {}
    api_failed = diagnostics.get('outcome') in ('failed', 'blocked')
    if api_failed:
        st.error('Gemini 생성을 중단했거나 요청에 실패했습니다. 아래 표는 로컬 측정 결과이며 AI 해석이 아닙니다.')
        st.caption('연속 재시도 대신 아래 요청 진단에서 제한 항목과 재시도 대기시간을 확인하세요.')
    if diagnostics:
        with st.expander('Gemini 요청 진단 · 입력 토큰과 제한 사유', expanded=api_failed):
            st.caption('영상·이미지는 보내지 않습니다. 좌표·각도 텍스트만 전송하며 키와 좌표 원문은 진단 로그에 저장하지 않습니다.')
            st.json(diagnostics)
            st.caption('로컬 기록: outputs/gemini_requests.jsonl. input_tokens는 사전 토큰 계산값, usage는 성공 응답의 사용량입니다. 계산 실패 시 토큰 수는 알 수 없습니다.')
    elif mode_label.startswith('mock_fallback:') and mode_label != 'mock_fallback:mock_mode_enabled':
        st.warning('이전 실패 결과에는 진단 기록이 없습니다. 앱 재시작 후 AI 보고서를 한 번 갱신하면 원인을 기록합니다.')

    render_motion_report(gemini_result)

    if gemini_result.get("risk_assessment"):
        st.caption("RULA·REBA 부위별 기본 구간 참고값입니다. 2D 운동면 가정과 보정 전 값이며 최종 위험 등급이 아닙니다.")
        with st.expander("관절각·RULA/REBA 기준 구간·출처"):
            st.json(gemini_result["risk_assessment"])

    st.markdown(f"**요약:** {gemini_result.get('summary', '')}")

    if gemini_result.get("phase_feedback"):
        st.subheader("로컬 측정 기반 단계별 피드백")
        st.dataframe([
            {"국면": fb.get("phase", ""), "항목": fb.get("joint", ""),
             "발견": fb.get("finding", ""), "근거": fb.get("evidence", ""),
             "제안": fb.get("suggestion", "")}
            for fb in gemini_result["phase_feedback"]
        ], hide_index=True, use_container_width=True)

    if gemini_result.get("measurement_quality"):
        st.subheader("측정 상태 · 분석에서 제외한 항목")
        st.caption("이 항목은 통증·부상 추론에 사용하지 않습니다. 신뢰도 저하만으로 가림이나 흔들림이 원인이라고 확정하지 않습니다.")
        st.dataframe([
            {"국면": row["phase"], "항목": row["joint"], "확인된 실패 사유": row["reason"],
             "다음 조치": row["suggestion"]}
            for row in gemini_result["measurement_quality"]
        ], hide_index=True, use_container_width=True)

    if gemini_result.get("raw_response"):
        with st.expander("모델 원문 · 검증 전 연구 기록"):
            st.text(gemini_result["raw_response"])
