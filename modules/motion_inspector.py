"""Automatic four-phase analysis from the complete coordinate series."""
import csv
import io
import cv2
import pandas as pd
import altair as alt
import streamlit as st
import streamlit.components.v1 as components
from .motion_findings import graph_findings
from .motion_player import encode_frames, player_html
from .frame_selector import KeyFrame
from .research_data import build_research_data
from .motion_dynamics import METRICS, motion_window, measured
from .angle_recovery import resolve_event_angles


def render_inspector(frames,poses,automatic,confidence_threshold,summary_area=None):
    phases=[('address','어드레스'),('backswing_top','백스윙 탑'),('downswing','다운스윙'),('impact','임팩트')]
    detected={k.event_type:k for k in automatic}
    keys=[]
    for event,label in phases:
        original=detected[event]
        idx=original.frame_idx
        keys.append(KeyFrame(frames[idx],poses[idx],label,event,frames[idx].timestamp,poses[idx].confidence,
                             {**(original.debug or {}),'best_idx':idx,'anchor_source':'automatic'}))
    research=build_research_data(frames,poses,keys,confidence_threshold)
    resolved=resolve_event_angles(frames,poses,keys,confidence_threshold)
    research['event_angle_observations']=resolved
    research['event_anchors']=[{'event':k.event_type,'phase':k.phase_label,'automatic_frame':k.frame_idx} for k in keys]
    with summary_area if summary_area is not None else st.container():
        st.subheader('1. 자동 감지한 4개 국면 · 각도 계산')
        st.caption('전체 좌표 시계열에서 자동 감지한 국면별 각도입니다.')
        rows=[]
        for row in resolved:
            rows.append({'국면':row['phase'],'프레임':row['frame_idx'],
                         '어깨각(°)':row['shoulder_angle'], '손목각(°)':row['wrist_angle'],
                         '몸통각(°)':row['spine_angle']})
        st.dataframe(rows,hide_index=True,width=600,height=176,
                     column_config={name:st.column_config.NumberColumn(format='%.2f') for name in ('어깨각(°)','손목각(°)','몸통각(°)')})
        if not research['segmentation_valid']:
            st.warning('자동 국면의 순서가 불명확합니다. 해당 결과는 국면별 확정 판정에 사용하지 않습니다.')
    labels=dict(phases)
    index={k.event_type:k.frame_idx for k in keys}
    st.subheader('2. 자동 국면 전후 확인')
    event=st.segmented_control('자동 국면',list(labels),format_func=labels.get,
                               default='address',key='motion_phase',label_visibility='collapsed')
    event=event or 'address'
    reference=index[event]
    cursor=reference
    n=len(frames)
    if 'motion_player_images_v2' not in st.session_state:
        st.session_state['motion_player_images_v2']=encode_frames(frames)
    components.html(player_html(st.session_state['motion_player_images_v2'],research['series'],
                                [p.confidence for p in poses],reference,labels[event],
                                aspect_ratio=frames[0].image_bgr.shape[1]/frames[0].image_bgr.shape[0]),
                    height=570,scrolling=False)

    st.subheader('3. 자동 국면 전후 각도 변화')
    target_time=frames[reference].timestamp
    window=[i for i,f in enumerate(frames) if abs(f.timestamp-target_time)<=.25]
    start,end=min(window),max(window)
    st.caption(f'자동 감지 시점 전후 0.25초를 비교합니다: f{start}~f{end}. 기준점을 수동으로 지정할 필요가 없습니다.')
    st.session_state.setdefault('motion_metric',max(METRICS,key=lambda key:sum(measured(r,key) is not None for r in research['series'][start:end+1])))
    def automatic_window(key,phase_index):
        ref=keys[phase_index].frame_idx; t=frames[ref].timestamp
        win=[i for i,f in enumerate(frames) if abs(f.timestamp-t)<=.25]
        low=(keys[phase_index-1].frame_idx+ref)//2+1 if phase_index else 0
        high=(keys[phase_index+1].frame_idx+ref)//2 if phase_index+1<len(keys) else n-1
        neighbors=[i for i in range(max(0,low),min(n-1,high)+1)
                   if abs(frames[i].timestamp-t)<=.15 and measured(research['series'][i],key) is not None]
        actual=min(neighbors,key=lambda i:(abs(frames[i].timestamp-t),i)) if neighbors else ref
        result=motion_window(research['series'],key,min(win),max(win),actual)
        result['event_frame']=ref
        result['reference_source']=('missing' if result['reference_angle'] is None else 'direct_event' if actual==ref else 'nearby_frame')
        result['reference_angle_source']=research['series'][actual].get('angle_sources',{}).get(key,{}) if result['reference_angle'] is not None else {}
        return result
    phase_index=[k.event_type for k in keys].index(event)
    research['phase_window_analysis']={k.phase_label:[automatic_window(key,i) for key in METRICS] for i,k in enumerate(keys)}
    summary=[]
    for result in research['phase_window_analysis'][labels[event]]:
        summary.append({'관절':result['label'],'기준각(°)':result['reference_angle'],'기준각 출처 프레임':f"f{result['reference_frame']}" if result['reference_angle'] is not None else '측정 불가',
                        '기준각 출처':{'missing':'측정 불가','direct_event':'자동 국면 시점','nearby_frame':'인접 프레임'}[result['reference_source']]+(' · 좌표 보간' if 'interpolation' in result['reference_angle_source'].get('method','') else ''),
                        '최소(°)':result['min_angle'],'최대(°)':result['max_angle'],
                        '관측 가동범위(°)':result['observed_rom_deg'],'첫·끝 유효 프레임 변화(°)':result['net_change_deg'],
                        '최대 관측 속도(°/s)':result['peak_abs_velocity_deg_s'],'유효 프레임':result['valid_count'],
                        '전체 프레임':result['total_count']})
    st.dataframe(summary,hide_index=True,use_container_width=True)
    st.caption('기준각 출처 프레임의 f0은 영상의 첫 프레임입니다. 측정 불가이면 출처도 표시하지 않습니다. 표는 선택 국면의 전체 관절이며, 아래 관절 선택은 그래프와 해석에만 적용됩니다.')
    st.caption('영상상 2D 움직임 범위이며 최대 신체 유연성·임상 ROM·부상 확률이 아닙니다. 보간 출처는 JSON에 기록합니다.')
    st.selectbox('비교할 관절',list(METRICS),format_func=lambda k:METRICS[k],key='motion_metric')
    metric=st.session_state['motion_metric']
    dynamics=automatic_window(metric,phase_index)
    samples=pd.DataFrame(dynamics['samples'])
    findings=[{'비교할 관절':METRICS[metric],**row} for row in graph_findings(dynamics)]
    dynamics['graph_findings']=findings
    st.markdown(f"#### {METRICS[metric]} · 움직임과 해석")
    st.caption(f"{labels[event]} · f{start}~f{end} · 유효 프레임 {dynamics['valid_count']}/{dynamics['total_count']} · 유효 비율은 측정 정확도가 아닙니다.")
    if len(samples) and samples['angle'].notna().any():
        base=alt.Chart(samples).encode(x=alt.X('frame_idx:Q',title='프레임',axis=alt.Axis(format='d',tickMinStep=1),scale=alt.Scale(domain=[start,end],nice=False)))
        charts={
            '각도':base.mark_line(point=True,color='#2563eb').encode(y=alt.Y('angle:Q',title='각도(°)',scale=alt.Scale(zero=False)),detail='segment:N',tooltip=['frame_idx','angle']),
            '기준각 대비 변화':base.mark_line(point=True,color='#0d9488').encode(y=alt.Y('delta_reference:Q',title='변화량(°)'),detail='segment:N',tooltip=['frame_idx','delta_reference']),
            '인접 프레임 변화속도':base.mark_point(color='#7c3aed').encode(y=alt.Y('velocity_deg_s:Q',title='변화속도(°/s)'),tooltip=['frame_idx','velocity_deg_s']),
        }
        marker=alt.Chart(pd.DataFrame([{'frame_idx':reference}])).mark_rule(color='#ef4444',strokeDash=[4,4]).encode(x='frame_idx:Q')
        charts['각도']=charts['각도']+marker
        titles={'각도':'프레임별 관절각','기준각 대비 변화':'기준 시점의 각도와 비교','인접 프레임 변화속도':'바로 앞 프레임과의 변화속도'}
        for row in findings:
            kind=row['그래프']
            if kind not in charts: continue
            with st.container(border=True):
                st.markdown(f"**{titles[kind]}**")
                graph_area, interpretation_area=st.columns([1.4,1],gap='medium')
                with graph_area:
                    if kind=='기준각 대비 변화' and dynamics['reference_angle'] is None:
                        st.info('기준각이 없어 비교 그래프를 표시할 수 없습니다.')
                    else:
                        st.altair_chart(charts[kind].properties(height=150),use_container_width=True)
                with interpretation_area:
                    st.caption('관측 결과')
                    st.markdown(row['관측 결과'])
                    st.caption('읽는 방법 · 확인할 사항')
                    st.markdown(row['읽는 방법·확인할 사항'])
    else:
        st.info(findings[0]['관측 결과']+' — '+findings[0]['읽는 방법·확인할 사항'])
    st.subheader('확인할 구간')
    if dynamics['review_points']:
        st.dataframe([{'프레임':r['frame_idx'],'시간(s)':r['timestamp'],'발견':r['finding'],
                       '근거':r['evidence'],'확인할 사항':r['suggestion']} for r in dynamics['review_points']],hide_index=True,use_container_width=True)
    else:
        st.info('현재 구간의 비교 규칙으로 표시된 항목이 없습니다. 통증이나 부상 위험이 없다는 뜻은 아닙니다.')
    st.caption('큰 변화속도는 이 구간의 분포와 비교한 검토 표시입니다. 골프의 정상적인 빠른 동작과 좌표 오류를 영상으로 구분해야 합니다.')
    research['motion_analysis']=dynamics
    research['window_metrics']=summary
    with st.expander('전체 프레임 좌표 기록'):
        st.caption('눈·귀·코·손가락은 이 표와 CSV에서 제외합니다. 손목각 계산에 필요한 검지를 포함한 원본 좌표는 전체 JSON에 보존합니다.')
        excluded_landmarks={'NOSE'} | {f'{side}_{part}' for side in ('LEFT','RIGHT') for part in ('EYE_INNER','EYE','EYE_OUTER','EAR','THUMB','INDEX','PINKY')}
        rows=[{'frame_idx':r['frame_idx'],'timestamp':r['timestamp'],'phase':r['phase'],
                'low_confidence':r['low_confidence'],'landmark':name,**lm}
              for r in research['series'] for name,lm in r['landmarks'].items() if name not in excluded_landmarks]
        if rows:
            st.dataframe(rows,hide_index=True)
            buffer=io.StringIO()
            writer=csv.DictWriter(buffer,fieldnames=list(rows[0]))
            writer.writeheader(); writer.writerows(rows)
            st.download_button('전체 관절 좌표 CSV 저장',buffer.getvalue().encode('utf-8-sig'),
                               'motionguard_coordinates.csv','text/csv',on_click='ignore')
        else: st.info('검출된 좌표가 없습니다. 미검출 프레임 기록은 전체 JSON에 남습니다.')
    return research,keys,dynamics
