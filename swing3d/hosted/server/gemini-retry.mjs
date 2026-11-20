/* Bounded transient-service retries. Never retries quotas, auth errors, or invalid output. */
export async function geminiFetch(send,url,init,{deadline,timeoutMs=30000,wait=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,onAttempt=()=>{},onRetry=()=>{},resolveAlternate,alternateOnFirstTimeout=false}={}){
 let response,currentUrl=url;
 for(let attempt=1;attempt<=3;attempt++){
  const remaining=deadline-now();if(remaining<1000)throw new DOMException('Request deadline exceeded','TimeoutError');
  onAttempt(attempt,currentUrl);let networkError;
  try{response=await send(currentUrl,{...init,signal:AbortSignal.timeout(Math.min(timeoutMs,remaining))});}catch(error){if(error?.name!=='TypeError'&&error?.name!=='TimeoutError')throw error;networkError=error;}
  if(!networkError&&![502,503,504].includes(response.status))return response;
  if(attempt===3){if(networkError)throw networkError;return response;}
  const raw=response?.headers?.get('Retry-After'),seconds=raw&&/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):raw&&Number.isFinite(Date.parse(raw))?Math.max(0,(Date.parse(raw)-now())/1000):null;
  const delay=Math.max(attempt===1?1000:3000,seconds===null?0:Math.ceil(seconds*1000));
  // Do not retry earlier than requested, and leave time to complete the next request.
  if(delay>8000||deadline-now()<delay+1000){if(networkError)throw networkError;return response;}
  if(resolveAlternate&&((attempt===2&&!networkError)||(attempt===1&&alternateOnFirstTimeout&&networkError?.name==='TimeoutError'))){try{const alternate=await resolveAlternate(currentUrl,response?.status??null);if(alternate)currentUrl=alternate;}catch{/* The bounded original route remains available. */}}
  if(!networkError)await response.body?.cancel().catch(()=>{});
  onRetry({attempt,status:networkError?null:response.status,delay_ms:delay});
  response=undefined;await wait(delay);
 }
}

// Discover a different, currently available Flash model instead of assuming retired IDs work.
const geminiCatalog=new Map();
export async function geminiFallback(primary,env,send,{deadline,now=Date.now}={}){
 const key=env.GEMINI_API_KEY;if(!key||deadline-now()<2500)return null;
 let entry=geminiCatalog.get(key);
 if(!entry||entry.expires<now()){
  const models=[];let next='';const catalogDeadline=Math.min(deadline,now()+4000);
  for(let page=0;page<3;page++){
   if(catalogDeadline-now()<1000)return null;
   const url=new URL('https://generativelanguage.googleapis.com/v1beta/models');url.searchParams.set('pageSize','1000');if(next)url.searchParams.set('pageToken',next);
   const r=await send(url.href,{method:'GET',headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(Math.min(3000,catalogDeadline-now()))});if(!r.ok)return null;
   const d=await r.json();models.push(...(d.models??[]));next=d.nextPageToken??'';if(!next)break;
  }
  entry={models,expires:now()+600000};if(geminiCatalog.size>8)geminiCatalog.clear();geminiCatalog.set(key,entry);
 }
 const configured=env.GEMINI_VISUAL_FALLBACK_MODEL;
 const choices=entry.models.filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>m.name?.replace(/^models\//,'')).filter(n=>typeof n==='string'&&/^gemini-[\w.-]+$/.test(n)&&n!==primary&&/flash/.test(n)&&!/image|tts|audio|live|embedding|exp|preview|latest/i.test(n));
 // Leave the saturated Lite family, when possible. Never switch because of a quota error.
 const different=choices.filter(n=>primary.includes('flash-lite')?!n.includes('flash-lite'):primary.includes('flash')?n.includes('flash-lite'):true);
 const ordered=different.sort((a,b)=>{if(a===configured)return-1;if(b===configured)return 1;if(a==='gemini-2.5-flash')return-1;if(b==='gemini-2.5-flash')return 1;return b.localeCompare(a,undefined,{numeric:true});});
 return ordered[0]??null;
}
