"""Build the real browser-local MotionGuard app, preserving the old tour privately."""
from pathlib import Path
import shutil,subprocess,re,json,hashlib,os
ROOT=Path(__file__).resolve().parents[1];SOURCE=Path(os.environ.get('MOTIONGUARD_SOURCE',str(ROOT.parent if ROOT.parent.name=='swing3d' else Path('/workspace/motionguard-mobile/swing3d'))));DIST=ROOT/'dist'
if not (ROOT/'tour-source').exists():
 (ROOT/'tour-source').mkdir();(ROOT/'tour-source/index.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><a href="../">MotionGuard 전체 앱 열기</a></html>')
if DIST.exists():shutil.rmtree(DIST)
args=['python',str(SOURCE/'tools/build_pages.py'),'--out',str(DIST)];images=Path(os.environ.get('MOTIONGUARD_COURSE_IMAGES','/workspace/artifacts/rivera-valley'))
if images.is_dir():args+=['--research-course-images',str(images)]
subprocess.run(args,check=True)
shutil.copytree(ROOT/'tour-source',DIST/'tour')
index=DIST/'index.html';text=index.read_text().replace('MotionGuard Swing3D','MotionGuard · 내 스윙 분석');text=text.replace('</body>','<script src="./demo-start.js" defer></script></body>');text=text.replace('영상을 먼저 선택하세요.</span>','내 영상을 선택하거나 샘플로 전체 흐름을 체험하세요.</span>');index.write_text(text)
p=DIST/'instrument.js';code=p.read_text();end=code.rfind('})();');assert end>0;code=code[:end]+"window.MotionDemoLoad=async()=>{const r=await fetch(new URL('demo/sample.csv',location.href));if(!r.ok)throw Error('샘플 좌표를 읽지 못했습니다.');const f=new File([await r.text()],'motionguard-demo.csv',{type:'text/csv'});select(f,true);};\n"+code[end:];code=code.replace('"데모 모드"','"기기 내 기준 코칭"');p.write_text(code)
(DIST/'demo-start.js').write_text("""(()=>{function ready(){const choose=document.getElementById('choose-video'),drop=document.getElementById('drop');if(!choose||!drop||document.getElementById('try-sample'))return;choose.textContent='내 영상 올리기';const b=document.createElement('button');b.id='try-sample';b.type='button';b.textContent='샘플로 전체 체험';b.onclick=async()=>{b.disabled=true;const info=document.getElementById('file-info');try{await window.MotionDemoLoad();info.textContent='샘플 좌표 준비 완료 · 고민을 적거나 바로 분석하기를 누르세요. 원본 영상이 없는 예시입니다.';document.getElementById('start').focus();}catch(e){info.textContent=e.message;}finally{b.disabled=false;}};drop.insertBefore(b,choose.nextSibling);const help=document.createElement('p');help.className='full-demo-help';help.textContent='내 영상 또는 샘플 선택 → 고민 입력 → 분석하기 → 요약 확인 → 영상/2D → 코스 플레이 → PDF. 모바일은 5–10초 MP4를 권장하며 첫 분석에는 모델 준비 시간이 필요합니다.';const tour=document.createElement('a');tour.href='./tour/';tour.textContent='이전 화면 시안 둘러보기';tour.className='full-demo-tour';const privacyBox=document.querySelector('.privacy');if(privacyBox){privacyBox.append(help,tour);}const note=document.querySelector('.site-notice');if(note)note.textContent='이 기기에서 영상 분석 · 기준 코칭 · 영상은 외부로 보내지 않습니다.';const privacy=document.querySelector('.privacy p');if(privacy)privacy.textContent='이 웹 시연은 기기 안에서 영상과 좌표를 분석합니다. 상담은 기기 내 기준 코칭이며 외부 AI를 호출하지 않습니다. 분석 기록은 이 브라우저에 보관합니다.';}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();})();""")
css=DIST/'style.css';css.write_text(css.read_text()+"\n#drop{flex-wrap:wrap}#try-sample{font:var(--t-note);min-height:var(--touch);padding:8px}#try-sample:disabled{opacity:.5}.full-demo-help,.full-demo-tour{font:var(--t-note);color:var(--ink-2);flex:none}.full-demo-tour{min-height:var(--touch);display:flex;align-items:center}@media(max-width:600px){.evidence-view-tabs button,.evidence-actions button{min-height:48px}#coach-message{font-size:16px}}\n")
subprocess.run(['python',str(ROOT/'scripts/enable_chat.py')],check=True)
shutil.copy2(ROOT/'overrides/motion-evidence.js',DIST/'motion-evidence.js')
p=DIST/'index.html';p.write_text(p.read_text().replace('스윙 나란히 비교','스윙 동작 보기').replace('두 보기는 같은 순간과 반복 구간을 사용합니다.','내 영상과 2D를 따로 선택해 반복 재생하세요.').replace('같은 프레임 · 개선 포인트 그림','2D · 개선 포인트 그림').replace('오른쪽은 개선 포인트 그림이며 측정값이 아닙니다 · 왼쪽 수치가 실제 측정입니다','2D 교정 그림은 연습 방향을 설명하는 참고 표현입니다.'))
p=DIST/'style.css';p.write_text(p.read_text()+(ROOT/'overrides/separate-views.css').read_text())
subprocess.run(['python',str(ROOT/'scripts/apply_overhaul.py')],check=True)
subprocess.run(['python',str(ROOT/'scripts/apply_courses.py')],check=True)
subprocess.run(['python',str(ROOT/'scripts/apply_full_scenarios.py')],check=True)
subprocess.run(['python',str(ROOT/'scripts/apply_conversation.py')],check=True)
subprocess.run(['python',str(ROOT/'scripts/apply_consultation.py')],check=True)
subprocess.run(['python',str(ROOT/'scripts/apply_replay.py')],check=True)
shutil.copy2(ROOT/'overrides/runtime-health.js',DIST/'runtime-health.js')
for name in ['map-only.html','map-only.js']:
 shutil.copy2(ROOT/'overrides'/name,DIST/('map.html' if name.endswith('.html') else name))
for name in ['rivera-game.html','rivera-game.css','rivera-game.js','rivera-game-engine.js','rivera-game-sound.js']:
 shutil.copy2(ROOT/'overrides'/name,DIST/('game.html' if name.endswith('.html') else name))
# Unlisted tester entry; the service exposes play only from the final simulation.
game=(DIST/'game.html').read_text()
(DIST/'play.html').write_text(game.replace('<body>','<body data-quick-play="true"><aside class="game-test-notice">게임 기능 테스트 · 서비스에서는 분석 후 시뮬레이션에서 플레이합니다.</aside>'))
(DIST/'round.html').write_text(game.replace('<body>','<body data-embedded-round="true">').replace('<a class="game-brand" href="./game.html">MotionGuard <span>PLAY</span></a>','<span class="game-brand">MotionGuard <span>PLAY</span></span>'))
shutil.copy2(ROOT/'overrides/simulation-round.js',DIST/'simulation-round.js')
shutil.copy2(ROOT/'overrides/service-access.js',DIST/'service-access.js')
p=DIST/'index.html';text=p.read_text();marker='  <nav class="stepper"';assert marker in text;text=text.replace(marker,'  <section id="returning-service" class="returning-service" hidden></section>\n'+marker,1);text=text.replace('<script src="./simulation-entry.js">','<script src="./simulation-round.js"></script><script src="./service-access.js"></script><script src="./simulation-entry.js">');p.write_text(text)
p=DIST/'overhaul.css';p.write_text(p.read_text()+'\n.simulation-round-actions{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.simulation-round-actions button{min-height:48px;font-size:16px}.simulation-round-frame{display:block;width:100%;height:1050px;border:0;border-radius:18px;background:#f0f5f1}.simulation-round-status{font-size:14px;color:var(--ink-2)}\n')
p=DIST/'overhaul.css';p.write_text(p.read_text()+'\n.direct-estimate{margin:12px 0 18px;padding:16px;border:1px solid #cfe3d7;border-radius:16px;background:#f2f8f4}.direct-estimate h3{font-size:16px;margin:0 0 12px}.direct-estimate-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.direct-estimate-grid>div{padding:12px;border:1px solid #d8e7dd;border-radius:12px;background:#fff;min-width:0}.direct-estimate-grid span{display:block;font-size:14px;color:#567463}.direct-estimate-grid strong{display:block;font-size:clamp(19px,5vw,28px);margin-top:6px;color:#195b3e;overflow-wrap:anywhere}.direct-estimate-grid>div[data-active=true]{border-color:#287851;background:#e5f2e9}.direct-estimate>p{font-size:14px;line-height:1.6;margin:12px 0 0;color:#567463}\n')
p=DIST/'overhaul.css';p.write_text(p.read_text()+'\n.returning-service,.after-prediction-game{margin:16px 0;padding:18px;border:1px solid #cfe3d7;border-radius:18px;background:#f0f7f2}.returning-service h2,.after-prediction-game h3{font-size:20px;line-height:1.5;margin:8px 0 12px}.returning-service>span{font-size:14px;color:#527361}.returning-service-links{display:flex;gap:10px;flex-wrap:wrap}.returning-service-links a{display:flex;align-items:center;justify-content:center;min-height:48px;padding:10px 14px;border:1px solid #bcd6c5;border-radius:12px;text-decoration:none;background:#fff;color:#195d3e;font-size:16px;font-weight:650}.after-prediction-game p{font-size:16px;line-height:1.6}.after-prediction-game button{width:100%;min-height:52px}.returning-service[hidden],.after-prediction-game[hidden]{display:none!important}\n')
p=DIST/'overhaul.css';p.write_text(p.read_text()+'\n.service-game-card{display:block!important;background:linear-gradient(145deg,#eef7f1,#fff)}.service-game-state{display:inline-flex;font-size:14px;padding:5px 9px;border-radius:8px;background:#e3ebe6;color:#536f5e;font-weight:650}.service-game-card[data-state=ready] .service-game-state{background:#d9eee1;color:#1a6a45}.service-game-card button:disabled{background:#e2e8e4!important;border-color:#d4ddd7!important;color:#607268!important;opacity:1;cursor:default}.returning-service-links .returning-game-primary{background:#176b49;color:#fff;border-color:#176b49;min-height:54px;flex:1 1 100%;font-size:18px}.returning-service-links a{flex:1 1 auto}\n')
shutil.copy2(ROOT/'data/rivera-game.json',DIST/'rivera-game.json')
shutil.copytree(ROOT/'assets/rivera-game',DIST/'rivera-game')
map_sources=json.loads((ROOT/'data/map-sources.json').read_text())
map_previews=[]
for source in map_sources:
 entry={k:source[k] for k in ['course_name','image_url','source_page','width','height']}
 if source['course_name']=='리베라CC' and (source['width'],source['height'])==(1157,750):
  entry.update(preview_crop={'x':155,'y':28,'width':760,'height':685},preview_label='레이크 · 밸리 · 파인힐 · 체리힐 전체 배치도')
 map_previews.append(entry)
(DIST/'map-preview-sources.json').write_text(json.dumps(map_previews,ensure_ascii=False))
subprocess.run(['python',str(ROOT/'scripts/seal_assets.py')],check=True)
# App shell only at install. Heavy model/3D/tour assets are cached as used.
assets=sorted('./'+str(f.relative_to(DIST)) for f in DIST.iterdir() if f.is_file() and f.suffix in ('.html','.js','.css') and f.name!='sw.js')
digest=hashlib.sha256(b''.join((DIST/a[2:]).read_bytes() for a in assets)).hexdigest()[:16]
worker="const CACHE='motionguard-full-"+digest+"',SHELL="+json.dumps(assets)+";\n"
worker+="self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));\n"
worker+="self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('motionguard-full-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));\n"
worker+="self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||e.request.headers.has('range')||u.pathname.includes('/api/'))return;const shell=e.request.mode==='navigate'||/\\.(html|js|css)$/.test(u.pathname);const request=u.pathname.endsWith('/')?new URL('index.html',u).href:e.request;async function network(){const r=await fetch(e.request,shell?{cache:'no-store'}:{});if(!r.ok)throw Error('HTTP '+r.status);if(/\\.(html|js|css|wasm|task|woff2|glb|csv|png|jpg)$/.test(u.pathname)||e.request.mode==='navigate'){const c=r.clone();e.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,c)));}return r;}e.respondWith(shell?network().catch(async()=>{const c=await caches.match(request);return c||Response.error();}):caches.match(request).then(c=>c||network()));});\n"

(DIST/'sw.js').write_text(worker)
(DIST/'_headers').write_text('/sw.js\n  Cache-Control: no-cache\n  Service-Worker-Allowed: /\n/*.html\n  Cache-Control: no-store\n/*.js\n  Cache-Control: no-store\n/*.css\n  Cache-Control: no-store\n')
print(json.dumps({'files':sum(f.is_file() for f in DIST.rglob('*')),'model_bytes':(DIST/'pose_landmarker_lite.task').stat().st_size,'shell_files':len(assets),'shell_bytes':sum((DIST/a[2:]).stat().st_size for a in assets),'existing_tour':(DIST/'tour/index.html').exists()}))
