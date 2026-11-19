import json,video_pose,swing_track as st
for v in ('samples/golf_swing.mp4','samples/golf_swing_portrait.mp4'):
 frames,fps=video_pose.extract(v)[:2];t=st.build_track(frames,fps);m=t['meta'];start=m['source_frames'][0]
 print(v)
 print('usable =',m['usable'],'camera =',m['camera_facing'],'폭비 =',m['address_shoulder_width_ratio'])
 print('채택 =',m['accepted_frames'],'/',m['total_frames'],'어깨폭 최대 =',m['shoulder_width_max'],'추론 픽셀 =',m['shoulder_width_pixels'])
 print('crop_box =',m['crop_box'])
 for p,f in m['phase_frames'].items():
  row=t['track'][f-start];angles={c:None if row[t['channels'].index(c)] is None else round(row[t['channels'].index(c)],2) for c in ('torso','hips')}
  print(p,'source frame',f,'track row',f-start,angles)
 print('torso_peak_check =',json.dumps(m['torso_peak_check'],ensure_ascii=False))
