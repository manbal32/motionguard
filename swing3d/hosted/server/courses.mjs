import courseCatalog from '../data/course-catalog.json' with {type:'json'};
const courseCache=new Map();
const cjson=(d,status=200)=>Response.json(d,{status,headers:{'Cache-Control':'private, max-age=300'}});
function inside(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.lat>p.lat)!==(b.lat>p.lat)&&p.lon<(b.lon-a.lon)*(p.lat-a.lat)/(b.lat-a.lat)+a.lon)hit=!hit;}return hit;}
const meters=(a,b)=>Math.hypot((b.lon-a.lon)*111320*Math.cos((a.lat+b.lat)/2*Math.PI/180),(b.lat-a.lat)*111320);
export function normalizeCourse(raw,entry){
 const boundary=raw.elements.find(e=>e.type+'/'+e.id===entry.id)?.geometry;
 if(!boundary?.length)return{...entry,holes:[],reason:'골프장 경계 자료가 없어 홀을 정확히 연결하지 못했습니다.'};
 const candidates=raw.elements.filter(e=>e.tags?.golf==='hole'&&e.geometry?.length>1&&inside(e.geometry[Math.floor(e.geometry.length/2)],boundary));
 const holes=candidates.map((e,i)=>{const points=e.geometry,origin=points[0],project=p=>[(p.lon-origin.lon)*111320*Math.cos(origin.lat*Math.PI/180),-(p.lat-origin.lat)*111320],xy=points.map(project),xs=xy.map(p=>p[0]),ys=xy.map(p=>p[1]),xmin=Math.min(...xs),ymin=Math.min(...ys),xmax=Math.max(...xs),ymax=Math.max(...ys),scale=Math.min(260/Math.max(1,xmax-xmin),480/Math.max(1,ymax-ymin)),map=p=>{const v=project(p);return[(v[0]-(xmin+xmax)/2)*scale+200,(v[1]-(ymin+ymax)/2)*scale+350];};
 const features=raw.elements.filter(f=>['fairway','green','tee','bunker','water_hazard'].includes(f.tags?.golf)&&f.geometry?.length>2&&f.geometry.some(p=>points.some(q=>meters(p,q)<75))).map(f=>({type:f.tags.golf,points:f.geometry.map(map)}));
 const par=Number(e.tags.par);return{number:i+1,ref:e.tags.ref??String(i+1),name:e.tags.name??'',par:par>=3&&par<=6?par:null,distance:Math.round(points.slice(1).reduce((n,p,i)=>n+meters(points[i],p),0)),route:points.map(map),features,osmId:e.id,distanceSource:'지도 중심 경로 길이 · 티 거리 미확인'};}).filter(h=>h.distance>=30&&h.distance<=900).sort((a,b)=>String(a.name).localeCompare(String(b.name))||Number(a.ref)-Number(b.ref)||a.osmId-b.osmId);
 holes.forEach((h,i)=>h.number=i+1);
 const lon0=entry.lon,lat0=entry.lat,xy=p=>[(p.lon-lon0)*111320*Math.cos(lat0*Math.PI/180),-(p.lat-lat0)*111320],bb=boundary.map(xy),xs=bb.map(p=>p[0]),ys=bb.map(p=>p[1]),xm=(Math.min(...xs)+Math.max(...xs))/2,ym=(Math.min(...ys)+Math.max(...ys))/2,sc=Math.min(350/(Math.max(...xs)-Math.min(...xs)),560/(Math.max(...ys)-Math.min(...ys))),mp=p=>{const a=xy(p);return[(a[0]-xm)*sc+200,(a[1]-ym)*sc+320];},overview=[{type:'boundary',points:boundary.map(mp)},...raw.elements.filter(e=>e.tags?.golf==='fairway'&&e.geometry?.length&&inside(e.geometry[0],boundary)).map(e=>({type:'fairway',points:e.geometry.map(mp)}))];
 return{id:entry.id,name:entry.name,overview,tee:'지도 경로 기준 · 티 미확인',holes,source:'OpenStreetMap contributors · ODbL · '+new Date().toISOString().slice(0,10),sourceUrl:'https://www.openstreetmap.org/'+entry.id,geometrySource:'osm',reason:holes.length?'':'등록된 홀 중심 경로가 없습니다. 골프장 위치를 찾는 것과 홀 지도를 확보하는 것은 다릅니다.',grouping:'원본에 코스명이 없는 홀은 코스 구분 미확인으로 표시합니다.'};
}
function xmlToElements(xml){
 const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m=>[m[1],m[2].replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<')]));const nodes=new Map();for(const m of xml.matchAll(/<node\b([^>]*)>/g)){const a=attrs(m[1]);nodes.set(a.id,{lat:Number(a.lat),lon:Number(a.lon)});}
 const elements=[];for(const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)){const a=attrs(m[1]),tags=Object.fromEntries([...m[2].matchAll(/<tag\b([^>]+)\/>/g)].map(t=>{const x=attrs(t[1]);return[x.k,x.v];}));if(!tags.golf&&tags.leisure!=='golf_course')continue;const geometry=[...m[2].matchAll(/<nd\b([^>]+)\/>/g)].map(n=>nodes.get(attrs(n[1]).ref)).filter(Boolean);elements.push({type:'way',id:Number(a.id),tags,geometry});}return{elements};
}
export async function courses(request,env,send=fetch){
 const u=new URL(request.url);if(request.method!=='GET')return cjson({ok:false,reason:'GET 요청이 필요합니다.'},405);
 if(u.pathname==='/api/courses/search'){const q=(u.searchParams.get('q')??'').trim();if(q.length<2||q.length>60)return cjson({ok:false,reason:'골프장 이름을 두 글자 이상 입력해 주세요.'},422);const norm=s=>s.toLowerCase().replace(/[\s·_-]/g,'');const needle=norm(q);const results=courseCatalog.filter(e=>norm(e.name+' '+e.aliases.join(' ')).includes(needle)).slice(0,15);return cjson({ok:true,results,source:'OpenStreetMap 공개 골프장 목록 · 2026-11-20',notice:results.length?'이름을 선택하면 홀 자료를 자동 조회합니다.':'공개 목록에서 찾지 못했습니다. 모든 골프장·홀 자료가 등록된 것은 아닙니다.'});}
 if(u.pathname!=='/api/courses/load')return cjson({ok:false,reason:'지원하지 않는 요청'},404);
 const id=u.searchParams.get('id'),entry=courseCatalog.find(e=>e.id===id);if(!entry)return cjson({ok:false,reason:'검색 결과에서 골프장을 선택해 주세요.'},422);
 if(courseCache.has(id))return cjson({ok:true,course:courseCache.get(id)});
 try{
  const bbox=[entry.lon-.014,entry.lat-.011,entry.lon+.014,entry.lat+.011].join(',');
  const r=await send('https://api.openstreetmap.org/api/0.6/map?bbox='+bbox,{headers:{'User-Agent':'MotionGuard/1.0 (golf course map viewer)'},signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('source');const raw=xmlToElements(await r.text()),course=normalizeCourse(raw,entry);if(course.holes.length)courseCache.set(id,course);return cjson({ok:true,course});
 }catch{if(env?.ASSETS){try{const fallback=await env.ASSETS.fetch(new Request(new URL('/course-snapshots/'+id.replace('/','-')+'.json',request.url)));if(fallback.ok){const c=await fallback.json();if(c.id===id)return cjson({ok:true,course:c,cached:true});}}catch{}}return cjson({ok:false,reason:'공개 지도 서버에서 홀 자료를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요. 실제 지도 없이 가상 홀을 만들지 않습니다.'},502);}
}
