from pathlib import Path
import json,math,argparse,copy
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
from matplotlib.colors import rgb_to_hsv
import contourpy
parser=argparse.ArgumentParser(description='Extract local SVG hole geometry from public hole-guide images')
parser.add_argument('--manifest',type=Path,required=True,help='Public-guide manifest with groupId, number, local, source_page and sha256')
parser.add_argument('--review-dir',type=Path,required=True)
args=parser.parse_args();root=Path(__file__).resolve().parents[1];art=args.review_dir;art.mkdir(parents=True,exist_ok=True);(art/'reviews').mkdir(exist_ok=True);sources=json.loads(args.manifest.read_text());records={(r['groupId'],r['number']):r for r in sources}

def write_course(file,data):
 # Keep the small editable metadata readable without expanding every polygon vertex.
 packed=copy.deepcopy(data);scenes={}
 for group in packed.get('courses',[packed]):
  for index,hole in enumerate(group.get('holes',[])):
   if 'holeScene' not in hole:continue
   key='__SCENE_'+str(len(scenes))+'__';scenes[key]=hole['holeScene'];hole['holeScene']=key
 text=json.dumps(packed,ensure_ascii=False,indent=2)
 for key,scene in scenes.items():text=text.replace(json.dumps(key),json.dumps(scene,ensure_ascii=False,separators=(',',':')))
 file.write_text(text+'\n')
def sync_legacy_rivera():
 # Existing physical ball saves and weather orientation use original guide pixels.
 file=root/'data/rivera-game.json';data=json.loads(file.read_text())
 for group in data['courses']:
  prepared=json.loads((root/('data/prepared-courses/rivera-'+group['id']+'.json')).read_text())
  for hole in group['holes']:
   source=prepared['holes'][hole['number']-1];scene=copy.deepcopy(source['holeScene']);m=source['mapImage'];d=m['display'];angle=float(d['transform'].split('(')[1].split()[0])*math.pi/180
   def inverse(point):
    x=200+(point[0]-200)*math.cos(angle)+(point[1]-350)*math.sin(angle);y=350-(point[0]-200)*math.sin(angle)+(point[1]-350)*math.cos(angle)
    return [round((x-d['x'])/d['width']*m['width'],2),round((y-d['y'])/d['height']*m['height'],2)]
   for feature in scene['features']:feature['points']=[inverse(point)for point in feature['points']]
   scene['trees']=[inverse(point)for point in scene['trees']];scene['tee']=hole['route'][0];scene['target']=hole['route'][-1];scene['coordinateSpace']='original-guide-pixels'
   points=[point for feature in scene['features']for point in feature['points']]+hole['route'];xmin=min(p[0]for p in points);xmax=max(p[0]for p in points);ymin=min(p[1]for p in points);ymax=max(p[1]for p in points);width=max(340,xmax-xmin+50,(ymax-ymin+50)*.625);height=width/.625
   scene['viewBox']=[round((xmin+xmax-width)/2,2),round((ymin+ymax-height)/2,2),round(width,2),round(height,2)];hole['holeScene']=scene
 write_course(file,data)

def polygon_area(p):return abs(sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1]for i in range(len(p)))/2)
def rdp(p,eps):
 if len(p)<3:return p
 a=np.asarray(p[0]);b=np.asarray(p[-1]);pts=np.asarray(p);v=b-a;den=float(v@v);t=np.clip(((pts-a)@v)/den,0,1)if den else np.zeros(len(p));d=np.linalg.norm(pts-(a+t[:,None]*v),axis=1);i=int(np.argmax(d))
 return rdp(p[:i+1],eps)[:-1]+rdp(p[i:],eps)if d[i]>eps else[p[0],p[-1]]
def components(mask,minimum):
 labels,n=ndi.label(mask);objects=ndi.find_objects(labels);out=[]
 for i,sl in enumerate(objects,1):
  if sl is None:continue
  local=labels[sl]==i;area=int(local.sum())
  if area>=minimum:out.append((area,sl,local))
 return sorted(out,reverse=True,key=lambda a:a[0])
def outlines(mask,minimum=12,maxCount=20):
 result=[]
 for area,sl,local in components(mask,minimum)[:maxCount]:
  local=ndi.binary_fill_holes(local);z=np.pad(local.astype(float),1);lines=contourpy.contour_generator(z=z).lines(.5)
  if not lines:continue
  p=max(lines,key=polygon_area);p=[[float(x-1+sl[1].start),float(y-1+sl[0].start)]for x,y in p];p=rdp(p,1.1)
  if len(p)>=4:result.append(p)
 return result
def transform(h,p):
 m=h['mapImage'];d=m['display'];x=d['x']+p[0]/m['width']*d['width'];y=d['y']+p[1]/m['height']*d['height'];angle=float(d['transform'].split('(')[1].split()[0])*math.pi/180;return[round(200+(x-200)*math.cos(angle)-(y-350)*math.sin(angle),2),round(350+(x-200)*math.sin(angle)+(y-350)*math.cos(angle),2)]
def extract(group,h):
 r=records[(group,h['number'])];im=Image.open(r['local']).convert('RGBA');bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);rgb=np.asarray(bg.convert('RGB'));height,width=rgb.shape[:2];hsv=rgb_to_hsv(rgb/255.);H,S,V=hsv[:,:,0],hsv[:,:,1],hsv[:,:,2];ys,xs=np.mgrid[:height,:width];route=np.asarray(h['sourceRoute'])*[width,height];end=route[-1];tee=route[0];length=float(np.linalg.norm(end-tee));scale=max(1,min(width,height)/350)
 annotations=np.zeros((height,width),bool)
 if group.startswith('rivera'):
  for area,sl2,local in components((S<.16)&(V>.79),25):
   hh,ww=local.shape;rect=ndi.binary_fill_holes(local).sum()/(hh*ww)
   if area<width*height*.01 and ww/hh>2 and rect>.85:
    annotations[max(0,sl2[0].start-2):min(height,sl2[0].stop+2),max(0,sl2[1].start-2):min(width,sl2[1].stop+2)]=True
 turf=(H>.105)&(H<.47)&(S>.18)&(V>.22)
 # A guide's main hole is the colored component associated with its traced route, not inset greens or legends.
 if group.startswith('88-'):turf&=V<.965
 turf=ndi.binary_closing(turf,iterations=max(2,round(scale*2)));turf&=~annotations;candidates=components(turf,60);best=None;score=-1
 for area,sl,part in candidates:
  px=np.clip(np.round(route[:,0]).astype(int)-sl[1].start,0,part.shape[1]-1);py=np.clip(np.round(route[:,1]).astype(int)-sl[0].start,0,part.shape[0]-1);hits=sum(bool(part[y,x])and sl[1].start<=q[0]<sl[1].stop and sl[0].start<=q[1]<sl[0].stop for(x,y),q in zip(zip(px,py),route));value=hits*100000+min(area,99999)
  if value>score:score=value;best=(area,sl,part)
 if best is None:raise RuntimeError('No colored hole outline: '+group+str(h['number']))
 _,sl,part=best;envelope=np.zeros((height,width),bool);envelope[sl]=ndi.binary_fill_holes(part);near=ndi.distance_transform_edt(~envelope);interior=ndi.binary_erosion(envelope,iterations=max(1,round(scale)))
 # Some fairways are yellow in the guide; colors are restyled only after their actual outlines have been read.
 if group.startswith('giheung'):
  fair=(H>.105)&(H<.20)&(S>.45)&(V>.62)
 elif group.startswith('namseoul'):
  fair=(H>.23)&(H<.43)&(S>.52)&(V>.58)
 elif group.startswith('88-'):
  fair=(H>.17)&(H<.38)&(S>.3)&(V>.5)&(V<.965)
 elif group.startswith('rivera'):
  fair=(H>.17)&(H<.315)&(S>.45)&(V>.57)
 else:
  fair=(H>.12)&(H<.38)&(S>.19)&(S<.88)&(V>.52)
 fair=ndi.binary_closing(fair&envelope,iterations=max(1,round(scale*2)));fair=ndi.binary_fill_holes(fair)&envelope
 # White inset labels/cart paths are excluded by topology and rectangular/long-strip shape checks.
 white=(S<.16)&(V>.79)&interior&~annotations;white=ndi.binary_closing(white,iterations=max(1,round(scale)));bunker=np.zeros_like(white)
 for area,sl2,local in components(white,max(8,round(scale*scale*8))):
  hh,ww=local.shape;filled=ndi.binary_fill_holes(local);rect=filled.sum()/(hh*ww)
  if area>envelope.sum()*.055 or max(hh/ww,ww/hh)>4 or rect>.82:continue
  if min(hh,ww)<3*scale:continue
  boundary=int((filled&~ndi.binary_erosion(filled)).sum());compactness=4*math.pi*int(filled.sum())/max(1,boundary*boundary)
  if compactness<.20 or ndi.distance_transform_edt(filled).max()<max(3,scale*2.3):continue
  bunker[sl2]|=local
 water=(H>.46)&(H<.72)&(S>.16)&(V>.43);wat=np.zeros_like(water)
 for area,sl2,local in components(water,max(15,round(scale*scale*10))):
  hh,ww=local.shape
  distance=float(np.min(near[sl2][local]))
  if area/(hh*ww)<.25 or distance>max(12,length*.07):continue
  if area<width*height*.0006 and distance>2:continue
  wat[sl2]|=local
 # Select observed green pigment near the traced target. No inferred hazards are added.
 radius=max(16,length*.14);targetROI=(xs-end[0])**2+(ys-end[1])**2<radius**2
 if group.startswith('giheung'):green=(H>.235)&(H<.39)&(S>.3)&(V>.4)&(V<.85)
 elif group.startswith('88-'):green=(H>.20)&(H<.26)&(S>.58)&(V>.48)&(V<.96)
 elif group.startswith('rivera'):green=(H>.20)&(H<.43)&(S>.22)&(S<.67)&(V>.63)
 else:green=(H>.27)&(H<.47)&(S>.25)&(V>.3)&(V<.9)
 green=ndi.binary_closing(green&envelope&targetROI,iterations=max(1,round(scale)));greens=np.zeros_like(green)
 greenCandidates=[]
 for area,sl2,local in components(green,max(12,round(scale*scale*12))):
  if area>envelope.sum()*.15:continue
  yy,xx=np.nonzero(local);cx=float(xx.mean()+sl2[1].start);cy=float(yy.mean()+sl2[0].start)
  if np.hypot(cx-end[0],cy-end[1])>radius*.85:continue
  greenCandidates.append((float(np.hypot(cx-end[0],cy-end[1]))/max(1,math.sqrt(area)),sl2,local))
 for _,sl2,local in sorted(greenCandidates,key=lambda r:r[0])[:2]:greens[sl2]|=local
 features=[]
 for kind,mask,minArea in [('rough',envelope,40),('water',wat,12),('fairway',fair,25),('bunker',bunker,8),('green',greens,10)]:
  for points in outlines(mask,minArea,20):features.append({'type':kind,'points':[transform(h,p)for p in points]})
 fairFeatures=[f for f in features if f['type']=='fairway']
 if not fairFeatures:raise RuntimeError('No fairway pigment: '+group+str(h['number']))
 # Trees are visual hints from dark-green guide texture, not surveyed individual trees.
 forest=(H>.21)&(H<.46)&(S>.35)&(V>.18)&(V<.58)&envelope&(ndi.distance_transform_edt(~fair)>4*scale);trees=[]
 spacing=max(10,int(length/18));offset=spacing//2
 for y in range(offset,height,spacing):
  for x in range(offset,width,spacing):
   if forest[y,x]:
    p=transform(h,[x,y]);
    if -50<p[0]<450 and 0<p[1]<660 and all(np.hypot(p[0]-q[0],p[1]-q[1])>21 for q in trees):trees.append(p)
 trees=trees[:32]
 visible=[p for f in features for p in f['points']]+h['route'];xmin=min(p[0]for p in visible);xmax=max(p[0]for p in visible);ymin=min(p[1]for p in visible);ymax=max(p[1]for p in visible);vw=max(340,xmax-xmin+50,(ymax-ymin+50)*.625);vh=vw/0.625;view=[round((xmin+xmax-vw)/2,2),round((ymin+ymax-vh)/2,2),round(vw,2),round(vh,2)]
 scene={'revision':'guide-scene-v1','method':'public-guide-color-contours','sourceSha256':r['sha256'],'sourcePage':r['source_page'],'features':features,'trees':trees,'tee':h['route'][0],'target':h['route'][-1],'viewBox':view,'notice':'홀 안내도의 형태를 읽어 다시 그린 참고 화면 · 지형 측량/OB 판정 자료가 아닙니다.'}
 if (group,h['number']) in [('korea-lake',3),('korea-challenge',2)]:scene['sourceAmbiguity']='공식 안내도에서 레이크 3번과 챌린지 2번에 같은 그림을 사용하고 있어 홀 형상 확인이 필요합니다.'
 return scene,rgb,{'rough':envelope,'fairway':fair,'water':wat,'bunker':bunker,'green':greens}
def review(group,h,scene,rgb,masks):
 original=Image.fromarray(rgb);overlay=original.copy();draw=ImageDraw.Draw(overlay,'RGBA');palette={'rough':(42,99,57,90),'water':(40,149,215,210),'fairway':(98,190,80,190),'bunker':(235,192,125,240),'green':(52,172,114,220)}
 for kind,mask in masks.items():
  for p in outlines(mask,10):draw.polygon([tuple(pt)for pt in p],fill=palette[kind])
 original.thumbnail((340,330));overlay.thumbnail((340,330));canvas=Image.new('RGB',(700,370),'#f7faf8');d=ImageDraw.Draw(canvas);d.text((10,8),group+' / '+str(h['number'])+' source and detected areas',fill='black');canvas.paste(original,(10,35));canvas.paste(overlay,(360,35));canvas.save(art/'reviews'/(group+'-'+str(h['number']).zfill(2)+'.jpg'))
if __name__=='__main__':
 summary=[]
 for file in sorted((root/'data/prepared-courses').glob('*.json')):
  course=json.loads(file.read_text());group=course['id']
  for h in course['holes']:
   scene,rgb,masks=extract(group,h);h['holeScene']=scene;summary.append({'group':group,'number':h['number'],'features':{k:sum(f['type']==k for f in scene['features'])for k in ['rough','fairway','green','water','bunker']},'points':sum(len(f['points'])for f in scene['features'])})
   if h['number'] in [1,2,3,8,18]:review(group,h,scene,rgb,masks)
  write_course(file,course)
 sync_legacy_rivera()
 (art/'extraction-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps({'holes':len(summary),'features':{k:sum(r['features'][k]for r in summary)for k in ['rough','fairway','green','water','bunker']},'points':sum(r['points']for r in summary)}))
