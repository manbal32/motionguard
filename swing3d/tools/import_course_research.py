"""Download discovered public hole images for a LOCAL research preview.

Not a commercial-use permission grant or a Naver map adapter. No credentials saved.
"""
from html.parser import HTMLParser
from urllib.request import Request,urlopen
from urllib.parse import quote,urlsplit,urlunsplit
from pathlib import Path
import argparse,re,json,hashlib

def read(url):
    parts=urlsplit(url);url=urlunsplit((parts.scheme,parts.netloc,quote(parts.path,safe='/%'),parts.query,''))
    with urlopen(Request(url,headers={'User-Agent':'MotionGuard-course-research/1.0'}),timeout=30) as response:
        return response.read(),response.headers.get_content_type()
class Discover(HTMLParser):
    def __init__(self):super().__init__();self.images={}
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs);match=re.fullmatch(r'리베라CC 밸리코스 ([1-9])번 홀',attrs.get('alt',''))
        if tag=='img' and match:self.images[int(match[1])]=attrs.get('src')
def collect(source,out):
    raw,_=read(source);page=Discover();page.feed(raw.decode('utf-8'))
    if sorted(page.images)!=list(range(1,10)):raise ValueError('Expected all nine distinct Valley hole labels; no partial replacement')
    out=Path(out);out.mkdir(parents=True,exist_ok=True);records=[]
    for number,url in sorted(page.images.items()):
        data,mime=read(url)
        if mime!='image/png' or not data.startswith(b'\x89PNG'):raise ValueError('Expected a PNG hole image')
        file=out/f'valley-{number:02}.png';file.write_bytes(data)
        records.append({'hole':number,'file':file.name,'sha256':hashlib.sha256(data).hexdigest()})
    (out/'provenance.json').write_text(json.dumps({'source':source,'source_published':'2023-08-24','latest_verified':False,'commercial_permission_verified':False,'holes':records},ensure_ascii=False,indent=2))
    print('Discovered and downloaded',len(records),'hole images to',out)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',default='https://kaypen.tistory.com/entry/리베라CC-골프코스-소개-및-공략법');p.add_argument('--out',default=str(Path(__file__).resolve().parents[1]/'web/course-images'));a=p.parse_args();collect(a.source,a.out)
