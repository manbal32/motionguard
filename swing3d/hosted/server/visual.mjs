const visualPrompt=`한국어 골프 코치입니다. 승인된 상담 요약과 같은 영상의 대표사진 5장만으로 관찰 가능한 자세를 설명하세요. 자동 국면 이름은 후보이지 정답이 아닙니다. 정면/측면을 구별하고 가림·블러·장면 선택 오류는 status='unassessable'로 따로 기록하세요. 추적/촬영 문제를 스윙 결함으로 분류하지 마세요. 임팩트/클럽페이스/구질/비거리/타수/지면반력/실제 체중 분배/통증 원인은 확정하지 마세요. 명확한 시각적 근거가 있으면 구체적인 관찰과 연습 방향을 설명하고, 없으면 개선점을 채우지 마세요. 숫자 각도와 좌표는 제공되지 않으므로 생성하지 마세요. 텍스트에서 사용자의 추정을 관측 사실로 바꾸지 마세요. 최대 잘한 점2개/개선 후보3개. 모든 항목에 sample_id(1~5), region(torso/hips/lean/wrist/kneeL/kneeR/heelR/swing), kind(positive/improvement), status(observed/tentative/unassessable), title, observation, meaning, drill, confidence(낮음/중간/높음)를 쓰세요. confidence 낮음은 개선 후보로 단정하지 마세요. JSON 형식 {summary:string,items:항목배열,withheld:문자열배열,phase_notes:문자열배열}. 모든 설명은 자연스러운 한글로 작성하세요.`;
const vjson=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function validateVisual(data){
 const regions=['torso','hips','lean','wrist','kneeL','kneeR','heelR','swing'];
 if(!data||typeof data.summary!=='string'||data.summary.length>1500||!Array.isArray(data.items)||data.items.length>8||!Array.isArray(data.withheld)||!Array.isArray(data.phase_notes))throw Error('format');
 const str=x=>typeof x==='string'&&x.length<=1500;
 if(!data.withheld.every(str)||!data.phase_notes.every(str))throw Error('format');
 for(const i of data.items)if(!Number.isInteger(i.sample_id)||i.sample_id<1||i.sample_id>5||!regions.includes(i.region)||!['positive','improvement'].includes(i.kind)||!['observed','tentative','unassessable'].includes(i.status)||!['낮음','중간','높음'].includes(i.confidence)||!['title','observation','meaning','drill'].every(k=>str(i[k])))throw Error('format');
 for(const i of data.items){if(/체중|지면\s*반력|비거리|구질|스코어|통증/.test(i.title)){i.status='unassessable';i.confidence='낮음';i.caution='사진만으로 실제 힘·체중·공 궤도 등을 확정할 수 없어 이 항목은 판단을 보류했습니다.';}}
 return data;
}
export async function visual(request,env,send=fetch){
 if(request.method!=='POST')return vjson({ok:false,reason:'POST 요청이 필요합니다.'},405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return vjson({ok:false,reason:'허용되지 않은 요청입니다.'},403);
 let d;try{const raw=await request.text();if(raw.length>4500000)return vjson({ok:false,reason:'사진 용량을 줄여 주세요.'},413);d=JSON.parse(raw);}catch{return vjson({ok:false,reason:'요청을 읽지 못했습니다.'},400);}
 if(d.allow_images!==true)return vjson({ok:false,reason:'대표사진 5장 전송에 동의해 주세요.'},403);
 if(!env.GEMINI_API_KEY)return vjson({ok:false,reason:'Gemini 비밀 설정이 없습니다.'},503);
 if(!Array.isArray(d.samples)||d.samples.length!==5||d.samples.some((s,i)=>s.id!==i+1||!Number.isInteger(s.frame)||s.frame<0||!Number.isFinite(s.time)||s.time<0||s.time>31||!['address','top','down','impact','finish'].includes(s.phase)||typeof s.image!=='string'||!/^\/9j\/[A-Za-z0-9+/=\r\n]+$/.test(s.image)||s.image.length>800000))return vjson({ok:false,reason:'대표사진 5장과 시간을 확인해 주세요.'},422);
 const summary={};for(const k of ['concern','improvement','hypothesis','goal'])summary[k]=String(d.summary?.[k]??'').slice(0,500);
 const parts=[{text:visualPrompt},{text:'승인한 사용자 자기보고: '+JSON.stringify(summary)}];
 for(const s of d.samples)parts.push({text:`sample_id=${s.id} frame=${s.frame} time=${s.time} phase_candidate=${s.phase}`},{inlineData:{mimeType:'image/jpeg',data:s.image}});
 const model=env.GEMINI_MODEL||'gemini-flash-lite-latest';if(!/^[\w.-]+$/.test(model))return vjson({ok:false,reason:'모델 설정 오류'},503);
 const started=Date.now();try{
  let attempts=0;let r;do{attempts++;r=await send(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},signal:AbortSignal.timeout(25000),body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{temperature:0,maxOutputTokens:3500,responseMimeType:'application/json'}})});if(![502,503].includes(r.status))break;}while(attempts<2);
  if(!r.ok)return vjson({ok:false,reason:r.status===429?'Gemini 요청 한도를 초과했습니다. 잠시 후 다시 분석해 주세요.':`Gemini 분석 요청 실패 (${r.status}). 다시 시도해 주세요.`},502);
  const result=await r.json(),c=result.candidates?.[0];if(c?.finishReason!=='STOP')throw Error('incomplete');
  const analysis=validateVisual(JSON.parse(c.content.parts.filter(p=>!p.thought).map(p=>p.text??'').join(''))),usage={};for(const k of ['promptTokenCount','candidatesTokenCount','totalTokenCount','thoughtsTokenCount','cachedContentTokenCount'])if(Number.isInteger(result.usageMetadata?.[k]))usage[k]=result.usageMetadata[k];
  return vjson({ok:true,mode:'gemini-images',analysis,usage,elapsed_ms:Date.now()-started,attempts,failed_attempt_usage:attempts>1?'첫 실패 요청의 사용량은 제공되지 않았습니다.':null,model:result.modelVersion??model,samples:d.samples.map(({id,frame,time,phase})=>({id,frame,time,phase})),input:'사진 5장 + 승인 상담 요약 · 좌표/원본 영상 미전송'});
 }catch{return vjson({ok:false,reason:'AI 분석이 완료되지 않았거나 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.'},502);}
}
