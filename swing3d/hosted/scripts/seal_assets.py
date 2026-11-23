"""Version the complete browser bundle and reject missing local entry dependencies."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parents[1];dist=root/'dist'
if not (dist/'runtime-health.js').is_file():raise RuntimeError('Missing runtime health module')
inputs=sorted(p for p in dist.rglob('*') if p.is_file() and p.suffix in ('.js','.css','.html','.mjs'))+sorted((root/'server').glob('*.mjs'))
inputs+=sorted((dist/'prepared-courses').glob('*.json'))+([dist/'prepared-courses.json'] if (dist/'prepared-courses.json').is_file() else [])
build=hashlib.sha256(b''.join(p.read_bytes() for p in inputs)).hexdigest()[:20]
for p in dist.glob('*.html'):
 s=p.read_text()
 for path in re.findall(r'(?:src|href)="\./([^"?#]+)(?:[?#][^"]*)?"',s):
  if path.endswith(('.js','.css')) and not (dist/path).is_file():raise RuntimeError('Missing entry dependency: '+path)
 s=re.sub(r'((?:src|href)="\./[^"?#]+\.(?:js|css))"',lambda m:m[1]+'?v='+build+'"',s)
 s=s.replace('<head>','<head><script>window.MotionBuild='+json.dumps(build)+';</script><script src="./runtime-health.js?v='+build+'"></script>',1)
 p.write_text(s)
files={str(p.relative_to(dist)):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in sorted(dist.rglob('*')) if p.is_file() and (p.suffix in ('.html','.js','.mjs','.css','.task','.wasm','.png') or (p.suffix=='.json' and (p.name=='prepared-courses.json' or p.parent.name=='prepared-courses'))) and p.name!='sw.js'}
(dist/'build-info.json').write_text(json.dumps({'build':build,'files':files},ensure_ascii=False))
print(json.dumps({'build':build,'verified_assets':len(files)}))
