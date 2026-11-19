# CODEX WEB 01 — 국면 검출과 카메라 판정

이 문서 하나로 충분하다. 다른 문서를 먼저 읽지 않아도 된다.

- 저장소 `manbal32/motionguard` · 작업 브랜치 `feature/swing3d`
- 대상 파일 `swing3d/swing_track.py` (`_swing_phases`, `build_track`)
- 샘플은 저장소에 들어 있다 — `swing3d/samples/golf_swing.mp4`, `swing3d/samples/golf_swing_portrait.mp4`
- **작업 결과는 `feature/swing3d` 로 PR 을 올린다.**

## 재현 명령 — 먼저 이걸 그대로 돌려라

```bash
cd swing3d && pip install -r requirements.txt
python3 - <<'PY'
import video_pose, swing_track as st
for v in ("samples/golf_swing.mp4", "samples/golf_swing_portrait.mp4"):
    frames, fps = video_pose.extract(v)[:2]
    m = st.build_track(frames, fps)["meta"]
    pf, f = m["phase_frames"], m["fps"]
    print(v)
    print("  camera_facing =", m["camera_facing"],
          "| 어드레스 어깨폭비 =", m["address_shoulder_width_ratio"],
          "| unavailable =", m["unavailable"])
    k = list(pf)
    for a, b in zip(k, k[1:]):
        print(f"  {a:8s}->{b:8s} {pf[a]:4d}->{pf[b]:4d}  {(pf[b]-pf[a])/f:5.2f}s")
PY
```

## 지금 나오는 값 (내가 직접 돌려서 받은 것)

```
samples/golf_swing.mp4
  camera_facing = front | 어드레스 어깨폭비 = 0.7864 | unavailable = []
  address ->top        39->  65   0.87s
  top     ->down       65-> 185   4.00s      ← 결함 1
  down    ->impact    185-> 187   0.07s      ← 결함 1
  impact  ->finish    187-> 206   0.63s

samples/golf_swing_portrait.mp4
  camera_facing = oblique | 어드레스 어깨폭비 = 0.1166 | unavailable = ['torso','hips']
  address ->top        45->  77   1.07s
  top     ->down       77-> 167   3.00s      ← 결함 1
  down    ->impact    167-> 169   0.07s      ← 결함 1
  impact  ->finish    169-> 188   0.63s
```

---

## 결함 1 — `down` 이 임팩트 직전으로 끌려간다

실제 골프 스윙에서 **탑에서 임팩트까지는 0.25~0.35초**다. 지금은 탑에서 4.00초를
머물다가 임팩트 2프레임 전에 `down` 을 찍는다. `down` 은 탑과 임팩트 사이
**다운스윙 중간**이어야 한다.

`_swing_phases` (`swing_track.py:199`) 가 `down` 을 고르는 방식을 고쳐라.
탑을 찾은 뒤 **탑 이후 처음으로 임팩트 방향 속도가 최대가 되는 프레임**을 쓰거나,
탑과 임팩트 사이를 시간으로 잡는 방식 중 무엇이든 좋다. 단, 아래 수치를 만족해야 한다.

**통과 조건**

| 항목 | 두 샘플 모두 |
|---|---|
| `top → impact` | 0.15초 이상 0.60초 이하 |
| `top → down` | 전체 `top→impact` 구간의 25%~75% 사이에 위치 |
| `down → impact` | 0.05초 이상 |
| `address → top` | 0.30초 이상 |
| `impact → finish` | 0.20초 이상 |

## 결함 2 — 카메라 판정이 `unavailable` 에만 의존한다

`swing_track.py:356` 이 이렇게 되어 있다.

```python
"camera_facing": "front" if not unavailable else "oblique",
```

`address_shoulder_width_ratio` 를 바로 위에서 구해 놓고 쓰지 않는다.
그래서 `golf_swing.mp4` 가 어깨폭비 0.7864 인데도 조건이 뒤집혀 `front` 로 나온다.

**이 영상은 정면이 아니다.** `mockups/evidence_golfswing_f39.png` 를 열어 봐라.
타자가 카메라 뒤쪽 비스듬한 각도에 서 있다.

**폭비로 판정하도록 바꿔라.**

| 어드레스 어깨폭비 | `camera_facing` | `unavailable` |
|---|---|---|
| 0.80 이상 | `front` | `[]` |
| 0.45 이상 0.80 미만 | `oblique` | `["hips"]` |
| 0.45 미만 | `down_the_line` | `["torso", "hips"]` |

회전 채널(`torso`, `hips`)은 어깨폭 단축으로 각도를 역산한다. 카메라가 정면이
아니면 그 역산이 성립하지 않는다. **0 을 내지 말고 "측정 불가"로 표시해야 한다.**
이미 `unavailable` 배열이 그 용도로 있으니 거기에 넣으면 된다.

**통과 조건**

| 샘플 | `camera_facing` | `unavailable` |
|---|---|---|
| `golf_swing.mp4` | `front` 가 **아닐 것** | `torso` 또는 `hips` 포함 |
| `golf_swing_portrait.mp4` | `front` 가 **아닐 것** | `torso`, `hips` 포함 |

## 결함 3 — `address` 가 어드레스가 아니다

`golf_swing.mp4` 의 `address` 는 프레임 39 로 나오는데,
`mockups/evidence_golfswing_f39.png` 를 보면 **이미 클럽이 올라가 있다.**
어드레스는 클럽이 지면에 있고 손이 가장 낮은 정지 구간이다.

`_swing_phases` 에서 어드레스를 **손 높이가 가장 낮고 움직임이 가장 작은
구간의 끝**으로 잡아라.

**통과 조건** — 두 샘플 모두에서 `address` 프레임의 손 높이가
`top` 프레임의 손 높이보다 **아래**에 있을 것 (화면 좌표 y 가 더 큼).

---

## 제출

1. 위 재현 명령의 **수정 후 출력 전문**을 PR 본문에 붙인다.
2. 통과 조건 표를 그대로 복사해 각 칸에 실제 값을 채운다.
3. `cd swing3d && python3 -m pytest tests/ -q` 가 통과해야 한다.
4. `feature/swing3d` 로 PR 을 올린다.

**하지 말 것**

- 기존 기능 삭제·퇴행 금지. 33점 계측, 9채널, 과장 공식, 대화/요약, 2D 비교,
  유튜브 링크, PDF 리포트, 보조 3D 는 전부 그대로 둔다.
- `web/` 아래 화면 파일은 이번 작업에서 건드리지 않는다. 별도로 진행 중이다.
- `.env`, `local-data/`, `.venv/`, `outputs/`, `__pycache__/` 커밋 금지.
- "구현했습니다" / "테스트 통과" 만 쓴 보고는 받지 않는다. 위 숫자가 있어야 한다.
