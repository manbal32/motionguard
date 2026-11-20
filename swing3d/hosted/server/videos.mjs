import videoIndex from '../data/youtube-index.json' with {type:'json'};
const vrjson=(d,status=200)=>Response.json(d,{status,headers:{'Cache-Control':'no-store'}});
export function videoUrl(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password)return null;let id;if(['www.youtube.com','youtube.com','m.youtube.com'].includes(u.hostname)&&u.pathname==='/watch')id=u.searchParams.get('v');else if(u.hostname==='youtu.be')id=u.pathname.slice(1);return /^[\w-]{11}$/.test(id??'')?'https://www.youtube.com/watch?v='+id:null;}catch{return null;}}
const vnorm=s=>s.toLowerCase().replace(/왼쪽\s*무릎/g,'왼무릎').replace(/오른쪽\s*무릎/g,'오른무릎').replace(/릴리즈/g,'릴리스').replace(/[\s·.,!?\[\]()#_-]/g,'');
export function rankVideos(item,candidates){
 const query=vnorm(item.title+' '+(item.drill??'')),seen=new Set();return candidates.map(v=>{const url=videoUrl(v.url??'https://www.youtube.com/watch?v='+v.id);if(!url||seen.has(url)||!v.title)return null;seen.add(url);const tags=(v.tags??[]).filter(t=>vnorm(t).length>1&&query.includes(vnorm(t)));let score=tags.reduce((n,t)=>n+vnorm(t).length,0);if(!v.tags?.length){const words=(item.title+' '+(item.drill??'')).match(/[가-힣a-zA-Z]{2,}/g)??[];for(const word of words){if(['골프','연습','스윙','자세','동작','유지','하세요','천천히','통해'].includes(word))continue;const w=vnorm(word);for(let i=0;i<w.length-1;i++)if(vnorm(v.title+' '+v.description).includes(w.slice(i,i+2))){score++;tags.push(w.slice(i,i+2));}}}
  if(score<3)return null;return{...v,url,score,reason:`피드백의 ${[...new Set(tags)].slice(0,3).join('·')} 주제와 영상의 공개 제목·설명이 연결됩니다.`,review:v.review??'search_metadata',checked_at:v.checked_at??new Date().toISOString().slice(0,10),full_video_reviewed:false};}).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,2).map(({score,tags,...v})=>v);
}
export function parseYouTubeResults(html){
 const marker=/\bytInitialData\s*=\s*/g.exec(html);if(!marker)return[];let at=marker.index+marker[0].length;while(html[at]&&html[at]!=='{')at++;const start=at;let depth=0,quoted=false,escaped=false,end=-1;for(;at<html.length;at++){const c=html[at];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){end=at+1;break;}}
 if(end<0)return[];let data;try{data=JSON.parse(html.slice(start,end));}catch{return[];}const text=v=>v?.simpleText??v?.runs?.map(r=>r.text??'').join('')??'',found=[];
 const walk=(v,d=0)=>{if(!v||typeof v!=='object'||d>60)return;if(v.videoRenderer){const r=v.videoRenderer,url=videoUrl('https://www.youtube.com/watch?v='+r.videoId);if(url)found.push({id:r.videoId,url,title:text(r.title),channel:text(r.ownerText??r.longBylineText)||'채널 확인 안 됨',description:text(r.descriptionSnippet).slice(0,400),review:'search_metadata'});}for(const[k,c]of Object.entries(v))if(k!=='videoRenderer')walk(c,d+1);};walk(data);return found.slice(0,12);
}
export async function findVideos(items,env={},send=fetch){
 const eligible=items.map((item,index)=>({item,index})).filter(({item})=>item.kind==='improvement'&&item.status!=='unassessable'&&item.confidence!=='낮음').slice(0,3);
 return Promise.all(eligible.map(async({item,index})=>{
  const query=('골프 '+item.title+' 연습').slice(0,100);let candidates=[],source='checked-index',live_error=null;
  try{
   const r=await send('https://www.youtube.com/results?'+new URLSearchParams({search_query:query}),{headers:{'Accept-Language':'ko-KR,ko;q=0.9'},signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error('search');const body=await r.text();if(body.length>3500000)throw Error('large');candidates=parseYouTubeResults(body);if(!candidates.length)throw Error('empty');source='youtube-public-search';
  }catch{live_error='실시간 검색을 확인하지 못해 공개 검색자료에서 확인한 영상 목록을 사용했습니다.';}
  let videos=rankVideos(item,candidates);if(!videos.length){videos=rankVideos(item,videoIndex);source='checked-index';}
  return{item_index:index,sample_id:item.sample_id,query,source,videos,notice:live_error??(source==='checked-index'?'공개 검색자료에서 확인한 영상 목록에서 관련 주제를 찾았습니다.':null),review_notice:'제목·공개 설명에 따른 추천 후보입니다. 영상 전체와 사용자에게 맞는 교정 효과는 검증하지 않았습니다.'};
 }));
}
export async function videos(request,env,send=fetch){
 if(request.method!=='POST')return vrjson({ok:false,reason:'POST 요청이 필요합니다.'},405);if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return vrjson({ok:false,reason:'허용되지 않은 요청'},403);
 let d;try{const raw=await request.text();if(raw.length>12000)throw Error('large');d=JSON.parse(raw);}catch{return vrjson({ok:false,reason:'요청을 확인해 주세요.'},400);}
 if(!Array.isArray(d.items)||d.items.length>8||d.items.some(i=>!i||typeof i.title!=='string'||i.title.length>200||typeof i.drill!=='string'||i.drill.length>1500||!['positive','improvement'].includes(i.kind)||!['observed','tentative','unassessable'].includes(i.status)||!['낮음','중간','높음'].includes(i.confidence)))return vrjson({ok:false,reason:'피드백 목록을 확인해 주세요.'},422);
 return vrjson({ok:true,recommendations:await findVideos(d.items,env,send)});
}
