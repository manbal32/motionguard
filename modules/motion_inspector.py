"""Automatic four-phase analysis from the complete coordinate series."""
import csv
import io
import cv2
import pandas as pd
import altair as alt
import streamlit as st
from .frame_selector import KeyFrame
from .research_data import build_research_data
from .motion_dynamics import METRICS, motion_window, measured
from .angle_recovery import resolve_event_angles


def render_inspector(frames,poses,automatic,confidence_threshold):
    phases=[('address','어드레스'),('backswing_top','백스윙 탑'),('downswing','다운스윙'),('impact','임팩트')]
    detected={k.event_type:k for k in automatic}
    keys=[]
    for event,label in phases:
        original=detected[event]
        idx=original.frame_idx
        keys.append(KeyFrame(frames[idx],poses[idx],label,event,frames[idx].timestamp,poses[idx].confidence,
                             {'best_idx':idx,'anchor_source':'automatic'}))
    research=build_research_data(frames,poses,keys,confidence_threshold)
    resolved=resolve_event_angles(frames,poses,keys,confidence_threshold)
    research['event_angle_observations']=resolved
    research['event_anchors']=[{'event':k.event_type,'phase':k.phase_label,'automatic_frame':k.frame_idx} for k in keys]
    st.subheader('1. 자동 감지한 4개 국면 · 각도 계산')
    st.caption('전체 좌표 시계열에서 국면을 자동 감지했습니다. 직접 계산 → 짧은 좌표 공백 보간 → 같은 국면 주변 좌표 탐색 순으로 각도를 확보합니다.')
    methods={'direct':'직접 계산','coordinate_interpolation':'좌표 보간',
             'nearby_frame_direct':'인접 프레임 계산','nearby_frame_coordinate_interpolation':'인접 프레임·좌표 보간',
             'low_confidence_geometry':'좌표 계산·저신뢰','nearby_frame_low_confidence_geometry':'인접 좌표 계산·저신뢰'}
    rows=[]
    for row in resolved:
        item={'국면':row['phase'],'자동 감지 프레임':row['frame_idx']}
        for key,label in [('shoulder_angle','어깨'),('wrist_angle','손목'),('spine_angle','몸통')]:
            item[label+'각(°)']=row[key]
            source=row['angle_sources'].get(key)
            item[label+' 산출 근거']=(f"{methods.get(source['method'],source['method'])} / f{source['source_frame']}" if source else '주변 좌표까지 탐색했으나 계산점 부족')
        rows.append(item)
    st.dataframe(rows,hide_index=True,width='stretch')
    if not research['segmentation_valid']:
        st.warning('자동 국면의 순서가 불명확합니다. 해당 결과는 국면별 확정 판정에 사용하지 않습니다.')
    labels=dict(phases)
    index={k.event_type:k.frame_idx for k in keys}
    def jump():st.session_state['motion_cursor']=index[st.session_state['motion_phase']]
    st.selectbox('확인할 자동 국면',[p[0] for p in phases],format_func=lambda e:labels[e],key='motion_phase',on_change=jump)
    event=st.session_state['motion_phase']; reference=index[event]; n=len(frames)
    st.session_state.setdefault('motion_cursor',reference)
    def move(step):st.session_state['motion_cursor']=max(0,min(n-1,st.session_state['motion_cursor']+step))
    st.subheader('2. 자동 국면 전후 확인')
    a,b,c=st.columns(3)
    a.button('◀ 이전 프레임',on_click=move,args=(-1,))
    b.button('다음 프레임 ▶',on_click=move,args=(1,))
    c.button('자동 감지 시점으로 이동',on_click=jump)
    cursor=st.slider('탐색 프레임',0,n-1,key='motion_cursor')
    pose=poses[cursor]
    image=pose.annotated_image if pose.annotated_image is not None else frames[cursor].image_bgr
    image=image.copy()
    show_points=st.checkbox('전체 관절 점 표시',value=True,key='motion_show_points')
    if show_points:
        h,w=image.shape[:2]
        for idx,(name,lm) in enumerate((pose.landmarks or {}).items()):
            if 0<=lm.x<=1 and 0<=lm.y<=1:
                x,y=int(lm.x*w),int(lm.y*h)
                cv2.circle(image,(x,y),3,(0,220,255),-1)
                cv2.putText(image,str(idx),(x+3,y-3),cv2.FONT_HERSHEY_SIMPLEX,.35,(0,220,255),1)
    left,right=st.columns([2,1])
    with left:
        st.image(cv2.cvtColor(image,cv2.COLOR_BGR2RGB),caption=f'프레임 {cursor} · {frames[cursor].timestamp:.3f}s',width='stretch')
    with right:
        st.write(f'선택 기준: {labels[event]} / 프레임 {reference}')
        st.write(f'포즈 신뢰도: {pose.confidence:.3f}')
        coords=research['series'][cursor]['landmarks']
        st.dataframe([{'점':i,'관절':name,**values} for i,(name,values) in enumerate(coords.items())],hide_index=True)
        if not coords: st.info('이 프레임에서는 관절 좌표가 검출되지 않았습니다.')
        st.caption('x·y는 영상 정규화 좌표, z는 모델 상대 깊이값입니다.')

    st.subheader('3. 자동 국면 전후 각도 변화')
    target_time=frames[reference].timestamp
    window=[i for i,f in enumerate(frames) if abs(f.timestamp-target_time)<=.25]
    start,end=min(window),max(window)
    st.caption(f'자동 감지 시점 전후 0.25초를 비교합니다: f{start}~f{end}. 기준점을 수동으로 지정할 필요가 없습니다.')
    st.session_state.setdefault('motion_metric',max(METRICS,key=lambda key:sum(measured(r,key) is not None for r in research['series'][start:end+1])))
    st.selectbox('비교할 관절',list(METRICS),format_func=lambda k:METRICS[k],key='motion_metric')
    metric=st.session_state['motion_metric']
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
        result['reference_source']='direct_event' if actual==ref else 'nearby_frame'
        return result
    phase_index=[k.event_type for k in keys].index(event)
    dynamics=automatic_window(metric,phase_index)
    research['phase_window_analysis']={k.phase_label:[automatic_window(key,i) for key in METRICS] for i,k in enumerate(keys)}
    summary=[]
    for result in research['phase_window_analysis'][labels[event]]:
        summary.append({'관절':result['label'],'기준각(°)':result['reference_angle'],'각도 출처 프레임':result['reference_frame'],
                        '최소(°)':result['min_angle'],'최대(°)':result['max_angle'],
                        '관측 가동범위(°)':result['observed_rom_deg'],'첫·끝 유효 프레임 변화(°)':result['net_change_deg'],
                        '최대 관측 속도(°/s)':result['peak_abs_velocity_deg_s'],'유효 프레임':result['valid_count'],
                        '전체 프레임':result['total_count']})
    st.dataframe(summary,hide_index=True,width='stretch')
    st.caption(dynamics['interpretation']+' 보간된 좌표는 원본 측정과 구분해 JSON에 기록합니다.')
    samples=pd.DataFrame(dynamics['samples'])
    if len(samples) and samples['angle'].notna().any():
        base=alt.Chart(samples).encode(x=alt.X('frame_idx:Q',title='프레임'))
        line=base.mark_line(point=True).encode(y=alt.Y('angle:Q',title='각도(°)'),detail='segment:N',
              tooltip=['frame_idx','timestamp','angle','delta_reference','velocity_deg_s'])
        rules=alt.Chart(pd.DataFrame([{'frame_idx':k.frame_idx,'국면':k.phase_label} for k in keys])).mark_rule(color='#9ca3af').encode(x='frame_idx:Q',tooltip=['국면','frame_idx'])
        cursor_rule=alt.Chart(pd.DataFrame([{'frame_idx':cursor}])).mark_rule(color='#ef4444').encode(x='frame_idx:Q')
        st.altair_chart((line+rules+cursor_rule).interactive(),width='stretch')
        delta=base.mark_line(point=True,color='#0d9488').encode(y=alt.Y('delta_reference:Q',title='기준각 대비 변화(°)'),detail='segment:N')
        if dynamics['reference_angle'] is not None: st.altair_chart(delta,width='stretch')
        speed=base.mark_point(color='#7c3aed').encode(y=alt.Y('velocity_deg_s:Q',title='인접 프레임 변화속도(°/s)'),tooltip=['frame_idx','velocity_deg_s'])
        st.altair_chart(speed,width='stretch')
    else:
        st.info('선택 구간·관절에 유효한 각도가 없습니다. 좌표와 측정 상태를 확인하거나 구간을 옮기세요.')
    st.subheader('확인할 구간')
    if dynamics['review_points']:
        st.dataframe([{'프레임':r['frame_idx'],'시간(s)':r['timestamp'],'발견':r['finding'],
                       '근거':r['evidence'],'확인할 사항':r['suggestion']} for r in dynamics['review_points']],hide_index=True,width='stretch')
    else:
        st.info('현재 구간의 비교 규칙으로 표시된 항목이 없습니다. 통증이나 부상 위험이 없다는 뜻은 아닙니다.')
    st.caption('큰 변화속도는 이 구간의 분포와 비교한 검토 표시입니다. 골프의 정상적인 빠른 동작과 좌표 오류를 영상으로 구분해야 합니다.')
    research['motion_analysis']=dynamics
    research['window_metrics']=summary
    with st.expander('전체 프레임 좌표 기록'):
        rows=[{'frame_idx':r['frame_idx'],'timestamp':r['timestamp'],'phase':r['phase'],
                'low_confidence':r['low_confidence'],'landmark':name,**lm}
              for r in research['series'] for name,lm in r['landmarks'].items()]
        if rows:
            st.dataframe(rows,hide_index=True)
            buffer=io.StringIO()
            writer=csv.DictWriter(buffer,fieldnames=list(rows[0]))
            writer.writeheader(); writer.writerows(rows)
            st.download_button('전체 관절 좌표 CSV 저장',buffer.getvalue().encode('utf-8-sig'),
                               'motionguard_coordinates.csv','text/csv',on_click='ignore')
        else: st.info('검출된 좌표가 없습니다. 미검출 프레임 기록은 전체 JSON에 남습니다.')
    return research,keys,dynamics
