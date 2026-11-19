"""Build the nested-path static site. No server dependency or private runtime data."""
from pathlib import Path
import argparse,hashlib,json,re,shutil,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

def build(destination):
    destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
    shutil.copytree(ROOT/'web',destination,dirs_exist_ok=True)
    # Only application source is rewritten. Third-party bundles are immutable.
    for file in destination.iterdir():
        if file.suffix not in ('.html','.js','.css'):continue
        text=file.read_text()
        text=re.sub(r'''(["'])/(?=[A-Za-z])''',r'\1./',text)
        text=text.replace('href="/"','href="./"')
        if file.name in ('index.html','report.html'):
            text=text.replace('<head>','<head><script src="./site-config.js"></script><script src="./client-api.js"></script>',1)
        file.write_text(text)
    (destination/'site-config.js').write_text("window.MotionStaticMode='browser';\n")
    shutil.copyfile(ROOT/'models/pose_landmarker_lite.task',destination/'pose_landmarker_lite.task')
    (destination/'.nojekyll').touch()
    for obsolete in ('static-api.js','demo/recorded.json'):(destination/obsolete).unlink(missing_ok=True)
    assets=sorted('./'+str(f.relative_to(destination)) for f in destination.rglob('*') if f.is_file() and f.name!='sw.js')
    digest=hashlib.sha256(b''.join((destination/a[2:]).read_bytes() for a in assets)).hexdigest()[:16]
    worker="const CACHE='motionguard-"+digest+"',ASSETS="+json.dumps(assets)+";\n"
    worker+="self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));\n"
    worker+="self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('motionguard-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));\n"
    worker+="self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(caches.match(new URL(e.request.url).pathname.endsWith('/')?new URL('index.html',e.request.url).href:e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));});\n"
    (destination/'sw.js').write_text(worker)
    print('Static site:',destination)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--out',default=str(ROOT.parent/'_site'));args=parser.parse_args();build(args.out)
