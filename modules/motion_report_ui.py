"""Display model hypotheses separately from measured tables."""
import streamlit as st


def render_motion_report(result):
    findings = result.get('motion_findings') or []
    if not findings:
        if result.get('mode', '').startswith('real_gemini'):
            st.info('구조화된 움직임 해석 항목이 없습니다. 모델 원문을 확인하세요.')
        return
    st.subheader('Gemini 움직임 해석')
    st.caption('수치 대조는 인용값의 일치만 확인합니다. 부상 관련 해석은 검증 전 가설이며 위험도 점수가 아닙니다.')
    labels = {'concern': '부담 검토', 'positive': '긍정적 특징', 'uncertain': '판단 보류'}
    for item in findings:
        matched = item['evidence_status'] == 'matched'
        title = f"{labels[item['category']]} · {item['body_region']} · " + ('근거 수치 일치' if matched else '근거 확인 필요')
        with st.expander(title, expanded=matched):
            if not matched:
                st.warning('인용한 프레임·수치가 전송 데이터와 맞지 않거나 근거가 없습니다. 이 항목을 분석 결론으로 사용하지 마세요.')
            st.write('관찰: ' + item['observation'])
            st.write('해석: ' + item['interpretation'])
            st.write('추가 확인: ' + item['next_check'])
            if item['evidence']:
                st.dataframe(item['evidence'], hide_index=True, use_container_width=True)
