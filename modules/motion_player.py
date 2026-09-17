"""Compact browser-side playback with frame-synchronised landmark coordinates."""
import base64
import json
import cv2


def encode_frames(frames):
    images = []
    for frame in frames:
        image = frame.image_bgr
        height, width = image.shape[:2]
        scale = min(720 / width, 420 / height, 1)
        image = cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))))
        ok, encoded = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if not ok:
            raise ValueError('재생 프레임을 준비하지 못했습니다.')
        images.append(base64.b64encode(encoded).decode('ascii'))
    return images


def player_html(images, series, confidence, reference, label):
    payload = json.dumps(dict(images=images, series=series, confidence=confidence,
                              reference=reference, label=label), ensure_ascii=False, allow_nan=False).replace('<', '\\u003c')
    return _HTML.replace('__PAYLOAD__', payload)


_HTML = '''<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif;color:#263245}
.layout{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:20px}
.viewport{height:420px;display:flex;align-items:center;justify-content:center;background:#f3f5f7;border-radius:12px;overflow:hidden}
canvas{max-width:100%;max-height:420px;object-fit:contain} .details{height:420px;display:flex;flex-direction:column;gap:8px}
.meta{font-weight:600}.coords{overflow:auto;flex:1;border:1px solid #e2e8f0;border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}th,td{padding:5px 8px;text-align:right;white-space:nowrap;border-bottom:1px solid #edf0f3}th{position:sticky;top:0;background:#f1f5f9}td:nth-child(2){text-align:left}
.controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0 8px}button,select{border:1px solid #cbd5e1;border-radius:8px;padding:7px 12px;background:white;color:#263245;cursor:pointer}button{background:#146c55;color:white;border:0;min-width:100px}input[type=range]{width:100%;accent-color:#146c55}.caption{font-size:12px;color:#64748b;margin:5px 0}label{display:flex;gap:6px;align-items:center}
@media(max-width:560px){.layout{gap:8px;grid-template-columns:1fr 1fr}th,td{padding:4px}.meta{font-size:12px}}
</style></head><body>
<div class="layout"><div class="viewport"><canvas id="video" aria-label="관절 좌표가 표시된 분석 영상"></canvas></div><div class="details"><div class="meta" id="reference"></div><div id="confidence"></div><div class="coords"><table><thead><tr><th>점</th><th>관절</th><th>x</th><th>y</th><th>z</th></tr></thead><tbody id="coordinates"></tbody></table></div><div class="caption">x·y: 정규화 좌표 / z: 상대 깊이</div></div></div>
<div class="controls"><button id="play">▶ 재생</button><label>속도 <select id="speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option></select></label><label><input id="points" type="checkbox" checked>골격 표시</label><label><input id="all-points" type="checkbox">전체 관절 보기</label><span id="status" aria-live="off"></span></div>
<input id="seek" type="range" min="0" step="1" aria-label="재생 프레임"><div class="caption">선택한 국면부터 재생합니다. 탐색 막대로 전체 영상을 확인할 수 있습니다.</div>
<script>
const data=__PAYLOAD__;
const byId=id=>document.getElementById(id), canvas=byId('video'), ctx=canvas.getContext('2d');
let current=data.reference, playing=false, origin=0, startTime=0, animation=0, generation=0;
const cache=new Map();
const joints=['LEFT_SHOULDER','RIGHT_SHOULDER','LEFT_ELBOW','RIGHT_ELBOW','LEFT_WRIST','RIGHT_WRIST','LEFT_HIP','RIGHT_HIP','LEFT_KNEE','RIGHT_KNEE','LEFT_ANKLE','RIGHT_ANKLE'];
const edges=[['LEFT_SHOULDER','RIGHT_SHOULDER'],['LEFT_SHOULDER','LEFT_ELBOW'],['LEFT_ELBOW','LEFT_WRIST'],['RIGHT_SHOULDER','RIGHT_ELBOW'],['RIGHT_ELBOW','RIGHT_WRIST'],['LEFT_SHOULDER','LEFT_HIP'],['RIGHT_SHOULDER','RIGHT_HIP'],['LEFT_HIP','RIGHT_HIP'],['LEFT_HIP','LEFT_KNEE'],['LEFT_KNEE','LEFT_ANKLE'],['RIGHT_HIP','RIGHT_KNEE'],['RIGHT_KNEE','RIGHT_ANKLE']];
const names={'LEFT_SHOULDER':'왼쪽 어깨','RIGHT_SHOULDER':'오른쪽 어깨','LEFT_ELBOW':'왼쪽 팔꿈치','RIGHT_ELBOW':'오른쪽 팔꿈치','LEFT_WRIST':'왼쪽 손목','RIGHT_WRIST':'오른쪽 손목','LEFT_HIP':'왼쪽 골반','RIGHT_HIP':'오른쪽 골반','LEFT_KNEE':'왼쪽 무릎','RIGHT_KNEE':'오른쪽 무릎','LEFT_ANKLE':'왼쪽 발목','RIGHT_ANKLE':'오른쪽 발목'};
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
byId('seek').max=data.series.length-1;
byId('reference').textContent=`선택 기준: ${data.label} / 프레임 ${data.reference}`;
function getImage(i){if(!cache.has(i)){const im=new Image();im.src='data:image/jpeg;base64,'+data.images[i];cache.set(i,im)}return cache.get(i)}
function render(i){
 current=i; const ticket=++generation; const im=getImage(i);
 function draw(){if(ticket!==generation)return;
 canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;ctx.drawImage(im,0,0);
 const landmarks=data.series[i].landmarks||{};
 const coords=Object.entries(landmarks).filter(([name])=>byId('all-points').checked||joints.includes(name));
 if(byId('points').checked){
 ctx.strokeStyle='#42e6b1';ctx.lineWidth=3;ctx.lineCap='round';
 edges.forEach(([a,b])=>{const p=landmarks[a],q=landmarks[b];if(valid(p)&&valid(q)){ctx.beginPath();ctx.moveTo(p.x*canvas.width,p.y*canvas.height);ctx.lineTo(q.x*canvas.width,q.y*canvas.height);ctx.stroke()}});
 ctx.fillStyle='#ffe342';coords.forEach(([name,p])=>{if(valid(p)){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,3.5,0,Math.PI*2);ctx.fill()}});
 }
 const body=byId('coordinates');body.replaceChildren();
 const format=v=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(3):'—';
 coords.forEach(([name,p],j)=>{const tr=document.createElement('tr');[j+1,names[name]||name,format(p.x),format(p.y),format(p.z)].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td)});body.appendChild(tr)});
 if(!coords.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='이 프레임에서는 관절 좌표가 검출되지 않았습니다.';tr.appendChild(td);body.appendChild(tr)}
 byId('confidence').textContent=`포즈 신뢰도: ${format(data.confidence[i])}`;
 byId('status').textContent=`프레임 ${i} / ${(data.series[i].timestamp).toFixed(3)}s`;
 byId('seek').value=i;
 }
 if(im.complete&&im.naturalWidth)draw();else im.onload=draw;
 for(let j=i+1;j<Math.min(i+8,data.images.length);j++)getImage(j);
 for(const j of cache.keys())if(j<i-2||j>i+12)cache.delete(j);
}
function pause(){playing=false;cancelAnimationFrame(animation);byId('play').textContent='▶ 재생'}
function tick(now){if(!playing)return;const t=origin+(now-startTime)/1000*Number(byId('speed').value);let i=current;while(i<data.series.length-1&&data.series[i+1].timestamp<=t)i++;if(i!==current)render(i);if(i===data.series.length-1){pause();return}animation=requestAnimationFrame(tick)}
byId('play').onclick=()=>{if(playing){pause();return}if(current===data.series.length-1)render(0);origin=data.series[current].timestamp;startTime=performance.now();playing=true;byId('play').textContent='Ⅱ 일시정지';animation=requestAnimationFrame(tick)};
byId('seek').oninput=()=>{pause();render(Number(byId('seek').value))};
byId('points').onchange=()=>render(current);
byId('all-points').onchange=()=>render(current);
byId('speed').onchange=()=>{origin=data.series[current].timestamp;startTime=performance.now()};
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
render(current);
</script></body></html>'''
