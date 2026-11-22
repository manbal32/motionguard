"""Preserve the full app as Worker assets and add server-only text chat."""
from pathlib import Path
import subprocess,shutil,json
root=Path(__file__).resolve().parents[1]
subprocess.run(['python',str(root/'scripts/build_full_demo.py')],check=True)
dist=root/'dist';temp=root/'.client-build'
if temp.exists():shutil.rmtree(temp)
dist.rename(temp);dist.mkdir();temp.rename(dist/'client')
server=dist/'server';server.mkdir()
(server/'index.js').write_text((root/'server/game-weather.mjs').read_text().replace("import courseWeatherLocations from '../data/course-weather.json' with {type:'json'};",'const courseWeatherLocations='+(root/'data/course-weather.json').read_text()+';')+'\n'+(root/'server/gemini-retry.mjs').read_text()+'\n'+(root/'server/course-images.mjs').read_text().replace("import verifiedMapSources from '../data/map-sources.json' with {type:'json'};",'const verifiedMapSources='+(root/'data/map-sources.json').read_text()+';')+'\n'+(root/'server/videos.mjs').read_text().replace("import videoIndex from '../data/youtube-index.json' with {type:'json'};",'const videoIndex='+(root/'data/youtube-index.json').read_text()+';')+'\n'+(root/'server/courses.mjs').read_text().replace("import courseCatalog from '../data/course-catalog.json' with {type:'json'};",'const courseCatalog='+ (root/'data/course-catalog.json').read_text()+';')+'\n'+(root/'server/visual.mjs').read_text().replace("import {geminiFetch,geminiFallback} from './gemini-retry.mjs';",'').replace("import {findVideos} from './videos.mjs';",'')+'\n'+(root/'server/coaching.mjs').read_text().replace("import {geminiFetch,geminiFallback} from './gemini-retry.mjs';",'')+'\n'+(root/'server/course-prediction.mjs').read_text().replace("import {gameWeather} from './game-weather.mjs';",'').replace("import {geminiFetch,geminiFallback} from './gemini-retry.mjs';",'')+'\n'+(root/'server/index.mjs').read_text().replace("import {coaching} from './coaching.mjs';",'').replace("import {visual} from './visual.mjs';",'').replace("import {courses} from './courses.mjs';",'').replace("import {videos} from './videos.mjs';",'').replace("import {courseImages} from './course-images.mjs';",'').replace("import {gameWeather} from './game-weather.mjs';",'').replace("import {coursePrediction} from './course-prediction.mjs';",''))
(server/'wrangler.json').write_text(json.dumps({'name':'motionguard-runtime','main':'index.js','compatibility_date':'2026-11-20','assets':{'directory':'../client','binding':'ASSETS','run_worker_first':['/api/*']}}))
(dist/'.openai').mkdir();shutil.copy2(root/'.openai/hosting.json',dist/'.openai/hosting.json')
print(json.dumps({'runtime':'worker','assets':sum(p.is_file() for p in (dist/'client').rglob('*')),'entry_bytes':(server/'index.js').stat().st_size}))

p=server/'index.js';p.write_text(p.read_text().replace('__MOTIONGUARD_BUILD__',json.loads((dist/'client/build-info.json').read_text())['build']))
