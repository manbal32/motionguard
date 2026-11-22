import {readRecentRoundScore} from './round-score.mjs';
import {geminiFetch,geminiFallback} from './gemini-retry.mjs';
// Server-only: never import this module in a browser bundle.
const prompt='한국어 골프 코치 모션가드입니다. 현재는 사진 분석 전, 사용자의 경험을 정리하는 상담 단계입니다. 원인 진단·동작 교정·연습법·도구/횟수 지시를 하지 마세요. 골반을 열어보세요 같은 기술 답을 먼저 주지 마세요. 전체 대화의 조건·수치·요청을 기억하고 긴 사용자 입력을 자르거나 짧게 다시 쓰라 요구하지 마세요. 답변은 보통 한 문장20~60자, 필요할 때만2문장100자 안팎입니다. 고민에 맞춰 아직 빠진 정보 하나만 물으세요. 동작이 불편하다면 구체적 시점, 그때의 부위나 느낌 순서로 확인하세요. 공이 휘는 고민이라면 출발 방향과 이후 휘는 방향 중 아직 모르는 것 하나를 확인하세요. 구체적인 동작 시점과 느낌 또는 구질이 이미 설명되었으면 사진 분석으로 안내하세요. 예를 들어 손이 허리 높이에 오르면 어깨가 막히고 팔에 힘이 들어간다고 했다면 가슴/어깨 회전이 어떻게 느껴지는지 다시 묻지 마세요. 팔에 힘이 든다고 했다면 손과 팔 중 어디가 더 힘든지 되묻거나 그립 같은 새 주제로 옮기지 말고 아직 빠진 시점만 물으세요. 이미 답한 내용을 표현만 바꿔 다시 묻지 말고 한 번에 여러 질문이나 선택지 목록을 주지 마세요. 예: 어깨 회전이 막혀요 → 백스윙의 어느 지점에서 막히는 느낌인가요? 이전 코치 답변이 교정법을 줬어도 추가 교정으로 이어가지 말고 경험 확인으로 돌아오세요. 직접 교정법을 요청해도 맞는 방법은 사진 분석 후 안내한다고 짧게 설명하고 필요한 경험을 확인하세요. 고민과 핵심 장면/느낌이 충분히 파악되면 질문을 늘리지 말고 그 내용을 사진에서 함께 확인하겠다며 분석하기로 안내하세요. 긴 공감·인사·원인 가능성 나열·스윙 결함 단정은 생략하세요.';
const summaryPrompt=`골프 스윙 사진 분석 전의 상담 확인 화면입니다. 사용자 대화를 바탕으로 concern, improvement, hypothesis, goal 네 문자열을 작성하세요. 각 필드는 모바일에서 읽기 쉽게 핵심 한 문장, 60자 안팎으로 쓰고 필요한 조건과 수치는 보존하세요. 같은 내용을 네 칸에 반복하지 마세요.

사용자가 나중에 구체화하거나 정정한 스윙 시점, 부위, 느낌, 클럽, 공의 출발 방향과 휘는 방향을 우선하세요. 앞서 고른 넓은 주제나 코치 질문 속 예시는 사용자가 직접 확인한 정보로 취급하지 마세요.

- concern: 사용자가 말한 증상과 핵심 조건만 자기보고로 요약하세요.
- improvement: 사용자의 설명에서 가장 구체적인 단서를 골라, 먼저 살펴볼 한 가지를 쓰세요.
  동작을 설명했다면 그 시점과 부위, 어떻게 움직이는지를 살리세요. 사용자가 말하지 않은 부위나 기술 용어를 추가하지 마세요. 시작 때 팔이 들리는 느낌은 시작 구간의 팔 높이, 톱에서 어깨가 막히는 느낌은 톱에서의 어깨 위치가 중심입니다.
  공의 구질만 설명했다면 점검의 대상은 공의 움직임입니다. 첫 방향이 이미 휘는 쪽이라면 첫 방향부터, 반대편으로 출발했다가 휜다면 방향이 바뀌는 구간부터 살펴보세요. 정보가 적으면 아직 모르는 구질 단서 하나를 확인한다고 쓰세요. 구질을 클럽 페이스, 스윙 궤도, 셋업, 체중 이동 등으로 바꿔 쓰지 마세요. 정지 사진만으로 공의 비행을 확인한다고 약속하지 마세요.
  점검 항목 한 문장으로 끝내세요. 원인 추측과 교정법은 이 칸에 쓰지 마세요.
- hypothesis: 사용자가 직접 원인이라고 추측한 내용만 추측으로 정리하세요. 증상을 원인처럼 반복하지 말고, 사용자 추측이 없으면 '사진에서 원인 단서를 찾아볼게요.'라고 쓰세요.
- goal: 사용자가 말한 목표를 보존하세요. 목표가 없으면 그 고민과 연결되는 개선 후 동작이나 샷 상태를 제안하세요. 도구·횟수·시간을 비롯한 훈련 지시와 [코치 제안] 접두어는 넣지 마세요.

별도 입력된 최근 라운드 타수는 내부 참고값으로 사용하세요. 네 칸에 그 숫자나 기록을 다시 적지 마세요. 대화에서만 알려준 최근 타수와 다른 핵심 수치는 concern에 한 번 보존하세요.`;
const summaryRequest='사용자가 구체화한 시점·동작·구질을 기준으로 네 칸을 작성해 주세요. 구질만 말한 경우 개선 방향에는 공의 움직임 중 우선 확인할 구간 하나만 쓰세요.';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function coaching(request,env,send=fetch,retryOptions={}){
 const path=new URL(request.url).pathname;
 if(path==='/api/coaching/status')return json({mode:env.GEMINI_API_KEY?'gemini':'unavailable',reason:env.GEMINI_API_KEY?'':'Gemini API 키가 설정되지 않아 AI 상담을 연결할 수 없습니다.'});
 const isSummary=path==='/api/coaching/summary';
 if(path!=='/api/coaching/chat'&&!isSummary)return json({ok:false,reason:'지원하지 않는 요청입니다.'},404);
 if(request.method!=='POST')return json({ok:false,reason:'POST 요청이 필요합니다.'},405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json({ok:false,reason:'허용되지 않은 요청입니다.'},403);
 if(Number(request.headers.get('content-length')||0)>256000)return json({ok:false,reason:'상담 내용이 너무 깁니다.'},413);
 let data;try{const raw=await request.text();if(raw.length>256000)return json({ok:false,reason:'상담 내용이 너무 깁니다.'},413);data=JSON.parse(raw);}catch{return json({ok:false,reason:'요청 형식이 올바르지 않습니다.'},400);}
 if(data.allow_external!==true)return json({ok:false,reason:'AI 상담을 이용하려면 상담 텍스트 전송에 동의해 주세요. 원본 영상은 전송하지 않습니다.'},403);
 if(!env.GEMINI_API_KEY)return json({ok:false,reason:'Gemini API 키가 설정되지 않아 AI 상담을 연결할 수 없습니다. 운영자 연결 설정이 필요합니다.'},503);
 let recentScore;try{recentScore=readRecentRoundScore(data.recent_round_score);}catch(error){return json({ok:false,reason:error.message},422);}
 const messages=data.messages;
 if(!Array.isArray(messages)||!messages.length||messages.length>(isSummary?20:19)||(!isSummary&&messages.length%2!==1)||messages.some((m,i)=>!m||m.role!==(i%2?'assistant':'user')||typeof m.text!=='string'||!m.text.trim()||m.text.length>(i%2?1600:6000)))return json({ok:false,reason:'대화 순서 또는 길이를 확인해 주세요.'},422);
 const model=env.GEMINI_MODEL||'gemini-flash-lite-latest';if(!/^[\w.-]+$/.test(model))return json({ok:false,reason:'상담 모델 설정 오류입니다.'},503);
 const requestId=crypto.randomUUID(),budget=Number(data.client_timeout_ms)>=80000?65000:28000;const started=Date.now();let attempts=0,selectedModel=model,modelRoutes=[];
 try{
  // Explicit allowlist: only role and text leave the server, never file/track fields.
  const response=await geminiFetch(send,`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:(isSummary?summaryPrompt:prompt)+(recentScore===undefined?'':' 사용자가 직접 입력한 최근18홀 라운드 기록: '+recentScore+'타. 평균이나 측정값으로 단정하지 말고 상담과 목표의 참고 기준으로 사용하세요. 기록만으로 스윙 원인을 단정하지 마세요. 이 입력 기록은 내부 참고값으로만 쓰고 상담 답변/요약/연습 목표에 그 숫자나 최근 기록을 다시 인용하지 마세요. 사용자가 대화에서 직접 제시한 별개의 목표 타수는 보존하세요. 사진만으로 타수가 크게 줄 것이라 말하지 마세요.')}]},contents:[...messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.text}]})),...(isSummary?[{role:'user',parts:[{text:summaryRequest}]}]:[])],generationConfig:{maxOutputTokens:isSummary?1000:256,...(isSummary?{responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:Object.fromEntries(['concern','improvement','hypothesis','goal'].map(k=>[k,{type:'STRING'}])),required:['concern','improvement','hypothesis','goal']}}:{})}})},{deadline:started+budget,timeoutMs:budget===65000?30000:20000,...retryOptions,alternateOnFirstTimeout:true,resolveAlternate:async()=>{if(selectedModel!==model)return null;const alternate=await geminiFallback(model,env,send,{deadline:started+budget});if(!alternate)return null;selectedModel=alternate;console.warn(JSON.stringify({event:'coaching_model_fallback',route:isSummary?'summary':'chat',request_id:requestId,from:model,to:alternate}));return 'https://generativelanguage.googleapis.com/v1beta/models/'+alternate+':generateContent';},onAttempt:(n,url)=>{attempts++;const name=new URL(url).pathname.split('/models/')[1]?.split(':')[0];if(name&&!modelRoutes.includes(name))modelRoutes.push(name);},onRetry:entry=>console.warn(JSON.stringify({event:'coaching_retry',route:isSummary?'summary':'chat',request_id:requestId,...entry}))});
  if(!response.ok){const transient=[502,503,504].includes(response.status),code=transient?'gemini_unavailable':response.status===429?'gemini_quota':'gemini_http';console.error(JSON.stringify({event:'coaching_failure',route:isSummary?'summary':'chat',request_id:requestId,code,upstream_status:response.status,attempts,elapsed_ms:Date.now()-started,model_route:modelRoutes}));return json({ok:false,error_code:code,request_id:requestId,upstream_status:response.status,retry_after_seconds:transient?8:null,attempts,reason:transient?'코치 연결이 잠시 혼잡합니다. 입력한 대화는 유지됩니다. 잠시 후 다시 시도해 주세요.':response.status===429?'코칭 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.':'코치 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.'},transient?503:response.status===429?429:502);}
  const result=await response.json(),candidate=result.candidates?.[0];const text=candidate?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('').trim();
  if(candidate?.finishReason!=='STOP'||!text||text.length>(isSummary?2400:1600))throw Object.assign(Error('invalid'),{finishReason:candidate?.finishReason??'empty'});
  const usage={};for(const k of ['promptTokenCount','candidatesTokenCount','totalTokenCount','thoughtsTokenCount','cachedContentTokenCount'])if(Number.isInteger(result.usageMetadata?.[k]))usage[k]=result.usageMetadata[k];
  const provenance={request_id:requestId,model:result.modelVersion??selectedModel,model_route:modelRoutes,fallback_used:modelRoutes.length>1,elapsed_ms:Date.now()-started};
  if(isSummary){const summary=JSON.parse(text);if(!['concern','improvement','hypothesis','goal'].every(k=>typeof summary[k]==='string'&&summary[k].length<=500))throw Error('invalid summary');return json({mode:'gemini',summary,usage,attempts,...provenance});}
  return json({mode:'gemini',text,usage,attempts,...provenance});
 }catch(error){const code=error?.name==='TimeoutError'?'gemini_timeout':'coaching_response';console.error(JSON.stringify({event:'coaching_failure',route:isSummary?'summary':'chat',request_id:requestId,code,attempts,elapsed_ms:Date.now()-started,model_route:modelRoutes,finish_reason:error.finishReason??null}));return json({ok:false,request_id:requestId,error_code:code,attempts,reason:code==='gemini_timeout'?'코치 응답이 지연되고 있습니다. 입력한 대화는 유지됩니다. 잠시 후 다시 시도해 주세요.':'코치 응답을 받지 못했습니다. 입력한 내용을 다시 보내 주세요.'},502);}
}
