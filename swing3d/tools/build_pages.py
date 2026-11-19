"""Build the nested-path static site. No server dependency or private runtime data."""
from pathlib import Path
import argparse,json,re,shutil,sys
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
            text=text.replace('<head>','<head><script src="./site-config.js"></script><script src="./static-api.js"></script>',1)
        file.write_text(text)
    (destination/'site-config.js').write_text("window.MotionStaticMode='recorded';\n")
    shutil.copyfile(ROOT/'models/pose_landmarker_lite.task',destination/'pose_landmarker_lite.task')
    (destination/'.nojekyll').touch()
    print('Static site:',destination)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--out',default=str(ROOT.parent/'_site'));args=parser.parse_args();build(args.out)
