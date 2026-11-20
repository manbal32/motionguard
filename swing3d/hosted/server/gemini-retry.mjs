/* Bounded transient-service retries. Never retries quotas, auth errors, or invalid output. */
export async function geminiFetch(send,url,init,{deadline,timeoutMs=30000,wait=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,onAttempt=()=>{},onRetry=()=>{}}={}){
 let response;
 for(let attempt=1;attempt<=3;attempt++){
  const remaining=deadline-now();if(remaining<1000)throw new DOMException('Request deadline exceeded','TimeoutError');
  onAttempt(attempt);let networkError;
  try{response=await send(url,{...init,signal:AbortSignal.timeout(Math.min(timeoutMs,remaining))});}catch(error){if(error?.name!=='TypeError'&&error?.name!=='TimeoutError')throw error;networkError=error;}
  if(!networkError&&![502,503,504].includes(response.status))return response;
  if(attempt===3){if(networkError)throw networkError;return response;}
  const raw=response?.headers?.get('Retry-After'),seconds=raw&&/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):raw&&Number.isFinite(Date.parse(raw))?Math.max(0,(Date.parse(raw)-now())/1000):null;
  const delay=Math.max(attempt===1?1000:3000,seconds===null?0:Math.ceil(seconds*1000));
  // Do not retry earlier than requested, and leave time to complete the next request.
  if(delay>8000||deadline-now()<delay+1000){if(networkError)throw networkError;return response;}
  if(!networkError)await response.body?.cancel().catch(()=>{});
  onRetry({attempt,status:networkError?null:response.status,delay_ms:delay});
  response=undefined;await wait(delay);
 }
}
