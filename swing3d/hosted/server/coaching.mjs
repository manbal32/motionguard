// Server-only: never import this module in a browser bundle.
const prompt='한국어 골프 코치로 자유롭게 대화하세요. 사용자의 이전 답변을 기억하고 구체적으로 답하며 필요한 질문은 한 번에 하나만 하세요. 아직 영상을 측정하지 않았으므로 스윙 결함이나 구질을 관측 사실로 확정하지 마세요. 같은 목표 입력 안내를 반복하지 마세요.';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function coaching(request,env,send=fetch){
 const path=new URL(request.url).pathname;
 if(path==='/api/coaching/status')return json({mode:env.GEMINI_API_KEY?'gemini':'unavailable',reason:env.GEMINI_API_KEY?'':'Gemini API 키가 설정되지 않아 AI 상담을 연결할 수 없습니다.'});
 const isSummary=path==='/api/coaching/summary';
 if(path!=='/api/coaching/chat'&&!isSummary)return json({ok:false,reason:'지원하지 않는 요청입니다.'},404);
 if(request.method!=='POST')return json({ok:false,reason:'POST 요청이 필요합니다.'},405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json({ok:false,reason:'허용되지 않은 요청입니다.'},403);
 if(Number(request.headers.get('content-length')||0)>32000)return json({ok:false,reason:'상담 내용이 너무 깁니다.'},413);
 let data;try{const raw=await request.text();if(raw.length>32000)return json({ok:false,reason:'상담 내용이 너무 깁니다.'},413);data=JSON.parse(raw);}catch{return json({ok:false,reason:'요청 형식이 올바르지 않습니다.'},400);}
 if(data.allow_external!==true)return json({ok:false,reason:'AI 상담을 이용하려면 상담 텍스트 전송에 동의해 주세요. 원본 영상은 전송하지 않습니다.'},403);
 if(!env.GEMINI_API_KEY)return json({ok:false,reason:'Gemini API 키가 설정되지 않아 AI 상담을 연결할 수 없습니다. 운영자 연결 설정이 필요합니다.'},503);
 const messages=data.messages;
 if(!Array.isArray(messages)||!messages.length||messages.length>(isSummary?20:19)||(!isSummary&&messages.length%2!==1)||messages.some((m,i)=>!m||m.role!==(i%2?'assistant':'user')||typeof m.text!=='string'||!m.text.trim()||m.text.length>(i%2?1600:500)))return json({ok:false,reason:'대화 순서 또는 길이를 확인해 주세요.'},422);
 const model=env.GEMINI_MODEL||'gemini-flash-lite-latest';if(!/^[\w.-]+$/.test(model))return json({ok:false,reason:'상담 모델 설정 오류입니다.'},503);
 try{
  // Explicit allowlist: only role and text leave the server, never file/track fields.
  const response=await send(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},signal:AbortSignal.timeout(30000),body:JSON.stringify({systemInstruction:{parts:[{text:isSummary?'한국어 상담 요약. 사용자 진술만 정리하고 원인 추정은 관측 사실로 확정하지 마세요. JSON {concern,improvement,hypothesis,goal} 네 문자열, 각 500자 이내. 없는 정보는 빈 문자열.':prompt}]},contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.text}]})),generationConfig:{maxOutputTokens:isSummary?1000:500,...(isSummary?{responseMimeType:'application/json'}:{})}})});
  if(!response.ok)return json({ok:false,reason:response.status===429?'AI 상담 요청 한도를 초과했습니다. 잠시 후 다시 보내 주세요.':'AI 상담 연결에 실패했습니다. 운영자 연결 설정을 확인해 주세요.'},502);
  const result=await response.json(),candidate=result.candidates?.[0];const text=candidate?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('').trim();
  if(candidate?.finishReason!=='STOP'||!text||text.length>(isSummary?2400:1600))throw Error('invalid');
  const usage={};for(const k of ['promptTokenCount','candidatesTokenCount','totalTokenCount'])if(Number.isInteger(result.usageMetadata?.[k]))usage[k]=result.usageMetadata[k];
  if(isSummary){const summary=JSON.parse(text);if(!['concern','improvement','hypothesis','goal'].every(k=>typeof summary[k]==='string'&&summary[k].length<=500))throw Error('invalid summary');return json({mode:'gemini',summary,usage});}
  return json({mode:'gemini',text,usage});
 }catch{return json({ok:false,reason:'AI 상담 응답을 받지 못했습니다. 입력한 내용을 다시 보내 주세요.'},502);}
}
