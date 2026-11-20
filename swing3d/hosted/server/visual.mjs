import {findVideos} from './videos.mjs';
const visualPrompt=`한국어 골프 코치입니다. 대표사진은 동일한 업로드 영상에서 추출했습니다. 몸이 회전해서 보이는 방향이 바뀌는 것을 정면/측면 혼합 카메라로 단정하지 마세요. 승인된 상담 요약과 같은 영상의 대표사진 5장만으로 관찰 가능한 자세를 설명하세요. 사진에 제공된 sample_id와실제보이는자세를근거로설명하세요. 사진이마무리자세인데어드레스라고부르지마세요. 준비/탑/임팩트등국면명은사진에서명확히구별되는경우에만쓰고애매하면스윙장면이라고표현하세요. 자동 국면 이름은 후보이지 정답이 아닙니다. phase_unverified=true인 표본은 시간대별 대표 장면이며 어드레스/임팩트 등의 국면을 확정하지 말고 보이는 자세만 관찰하세요. 정면/측면을 구별하고 가림·블러·장면 선택 오류는 status='unassessable'로 따로 기록하세요. 추적/촬영 문제를 스윙 결함으로 분류하지 마세요. 임팩트/클럽페이스/구질/비거리/지면반력/실제 체중 분배/통증 원인은 확정하지 마세요. 명확한 시각적 근거가 있으면 구체적인 관찰과 연습 방향을 설명하고, 없으면 개선점을 채우지 마세요. 숫자 각도와 좌표는 제공되지 않으므로 생성하지 마세요. 텍스트에서 사용자의 추정을 관측 사실로 바꾸지 마세요. 최대 잘한 점2개/개선 후보3개. 모든 항목에 sample_id(1~5), region(torso/hips/lean/wrist/kneeL/kneeR/heelR/swing), kind(positive/improvement), status(observed/tentative/unassessable), title, observation, meaning, drill, confidence(낮음/중간/높음)를 쓰세요. confidence 낮음은 개선 후보로 단정하지 마세요. JSON 형식 {summary:string,items:항목배열,withheld:문자열배열,phase_notes:문자열배열}. 추가 필드 coaching_context:{concern:string,hypothesis:string,practice_goal:string,improvement_focus:string}에 승인된 고민을 정리하고 원인가설과 연습목표를 구체화하세요. 직접 진술하지 않은 가설은 [코치 제안]으로 구분하세요. score_estimate.improved는 개선이 이루어졌을 때의 목표타수 범위입니다. 추가 필드 assessment_score:{value:0~100정수,basis:string,confidence:낮음/중간/높음}, score_estimate:{status:estimated/insufficient,current:{min:number,max:number},improved:같은구조,basis:string,assumptions:문자열배열,confidence:낮음/중간/높음}를 반환하세요. 점수는 사진에서 관찰한 자세에 대한 코치의 참고평가이지 계측점수가 아닙니다. 예상 타수는 대화와 사진으로 추정한 일반적인18홀 참고범위입니다. 퍼팅/숏게임/실전미스는 알 수 없음을 가정에 쓰세요. 사용자는 실제 스코어의 확정 예측이 아니라 이 사진과 고민에 따른 시뮬레이션용 추정 범위를 요청했습니다. 골프 자세가 보이면 assessment_score.value와 현재/개선 후 18홀 범위를 반드시 반환하세요. 퍼팅·숏게임 정보가 없다는 이유만으로 생략하지 말고 보통의 아마추어 퍼팅·숏게임, 보통 난이도의 파72 18홀을 가정에 명시하여 넓은 범위로 추정하세요. 대화에 평균타수가 있으면 이를 자기보고 기준으로 사용하고, 없으면 사진에서 관찰한 자세로 추론한 낮은 신뢰도 범위임을 쓰세요. 고정90타 같은 기본값은 사용하지 마세요. assessment_score.dimensions에 준비 자세/회전/균형 등 사진으로 관찰한 3개 항목의 label,value(0~100),basis를 반환하세요. 연습을 수행하지 않았으므로 연습 완료율을 점수로 만들지 마세요. summary는 핵심 관찰과 우선 개선 방향을 2문장 160자 이내로 작성하세요. 개선후 범위는 관찰한 개선후보가 교정된다는 조건부제안이며 무조건향상을보장하지마세요. 모든 설명은 자연스러운 한글로 작성하세요.`;
const scalar={type:'STRING'},rating={type:'STRING',enum:['낮음','중간','높음']};
const object=(properties,required=Object.keys(properties))=>({type:'OBJECT',properties,required});
const array=items=>({type:'ARRAY',items});
const strokeRange=object({min:{type:'NUMBER'},max:{type:'NUMBER'}});
const visualSchema=object({summary:scalar,items:array(object({sample_id:{type:'INTEGER'},region:scalar,kind:scalar,status:scalar,title:scalar,observation:scalar,meaning:scalar,drill:scalar,confidence:rating})),withheld:array(scalar),phase_notes:array(scalar),coaching_context:object({concern:scalar,hypothesis:scalar,practice_goal:scalar,improvement_focus:scalar}),assessment_score:object({value:{type:'INTEGER'},basis:scalar,confidence:rating,dimensions:array(object({label:scalar,value:{type:'INTEGER'},basis:scalar}))}),score_estimate:object({status:{type:'STRING',enum:['estimated']},current:strokeRange,improved:strokeRange,basis:scalar,assumptions:array(scalar),confidence:rating})});
const completeScores=a=>Number.isInteger(a.assessment_score?.value)&&a.score_estimate?.status==='estimated'&&a.assessment_score?.dimensions?.length>=3;
const vjson=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function validateVisual(data){
 const regions=['torso','hips','lean','wrist','kneeL','kneeR','heelR','swing'];
 if(!data||typeof data.summary!=='string'||data.summary.length>1500||!Array.isArray(data.items)||data.items.length>8||!Array.isArray(data.withheld)||!Array.isArray(data.phase_notes))throw Error('format');
 const str=x=>typeof x==='string'&&x.length<=1500;
 if(!data.withheld.every(str)||!data.phase_notes.every(str))throw Error('format');
 for(const i of data.items)if(!Number.isInteger(i.sample_id)||i.sample_id<1||i.sample_id>5||!regions.includes(i.region)||!['positive','improvement'].includes(i.kind)||!['observed','tentative','unassessable'].includes(i.status)||!['낮음','중간','높음'].includes(i.confidence)||!['title','observation','meaning','drill'].every(k=>str(i[k])))throw Error('format');
 for(const i of data.items){if(/체중|지면\s*반력|비거리|구질|스코어|통증/.test(i.title)){i.status='unassessable';i.confidence='낮음';i.caution='사진만으로 실제 힘·체중·공 궤도 등을 확정할 수 없어 이 항목은 판단을 보류했습니다.';}}
 const context=data.coaching_context;data.coaching_context=context&&['concern','hypothesis','practice_goal','improvement_focus'].every(k=>str(context[k]))?{...context,source:'gemini'}:null;
 const score=data.assessment_score;
 data.assessment_score=score&&((Number.isInteger(score.value)&&score.value>=0&&score.value<=100)||score.value===null)&&str(score.basis)&&['낮음','중간','높음'].includes(score.confidence)?score:{value:null,basis:'사진 기반 평가 점수가 제공되지 않았습니다.',confidence:'낮음'};
 const dims=score?.dimensions;data.assessment_score.dimensions=Array.isArray(dims)?dims.filter(x=>str(x?.label)&&str(x?.basis)&&Number.isInteger(x.value)&&x.value>=0&&x.value<=100).slice(0,4):[];
 const e=data.score_estimate,range=r=>r&&Number.isFinite(r.min)&&Number.isFinite(r.max)&&r.min>=54&&r.max<=200&&r.min<=r.max;
 data.score_estimate=e&&e.status==='estimated'&&range(e.current)&&range(e.improved)&&str(e.basis)&&Array.isArray(e.assumptions)&&e.assumptions.length<=10&&e.assumptions.every(str)&&['낮음','중간','높음'].includes(e.confidence)?{...e,holes:18,source:'gemini'}:{status:'insufficient',holes:18,source:'gemini',current:null,improved:null,basis:typeof e?.basis==='string'?e.basis.slice(0,1500):'타수 추정 근거가 부족하거나 응답 범위를 확인하지 못했습니다.',assumptions:[],confidence:'낮음'};
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
 for(const s of d.samples)parts.push({text:`sample_id=${s.id} frame=${s.frame} time=${s.time} phase_unverified=true`},{inlineData:{mimeType:'image/jpeg',data:s.image}});
 const requestId=typeof d.request_id==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(d.request_id)?d.request_id:crypto.randomUUID();
 const hashes=await Promise.all(d.samples.map(async s=>{const bytes=Uint8Array.from(atob(s.image.replace(/\s/g,'')),c=>c.charCodeAt(0));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}));
 const receipt={request_id:requestId,photo_count:d.samples.length,image_sha256:hashes,samples:d.samples.map(({id,time,frame,phase_unverified})=>({id,time,frame,phase_unverified:phase_unverified===true})),forwarded_images:parts.filter(p=>p.inlineData).length};
 const model=env.GEMINI_MODEL||'gemini-flash-lite-latest';if(!/^[\w.-]+$/.test(model))return vjson({ok:false,reason:'모델 설정 오류'},503);
 const started=Date.now();try{
  let attempts=0,scoreCompletionAttempts=0,modelVersion=model,analysis;const usage={};
  async function generate(extra=[]){
   let r;do{attempts++;r=await send(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},signal:AbortSignal.timeout(extra.length?25000:45000),body:JSON.stringify({contents:[{role:'user',parts:[...parts,...extra]}],generationConfig:{temperature:0,maxOutputTokens:8000,responseMimeType:'application/json',responseSchema:visualSchema}})});if(![502,503].includes(r.status))break;}while(attempts<2);
   if(!r.ok)throw Error('http:'+r.status);
   const result=await r.json(),c=result.candidates?.[0];
   for(const k of ['promptTokenCount','candidatesTokenCount','totalTokenCount','thoughtsTokenCount','cachedContentTokenCount'])if(Number.isInteger(result.usageMetadata?.[k]))usage[k]=(usage[k]??0)+result.usageMetadata[k];
   modelVersion=result.modelVersion??model;
   if(c?.finishReason!=='STOP')throw Error('incomplete:'+String(c?.finishReason??'empty'));
   return validateVisual(JSON.parse(c.content.parts.filter(p=>!p.thought).map(p=>p.text??'').join('')));
  }
  analysis=await generate();
  if(!completeScores(analysis)){
   scoreCompletionAttempts=1;
   analysis=await generate([{text:'이전 응답에서 점수/항목별 그래프/타수 범위가 누락되거나 유효하지 않았습니다. 같은 사진 5장과 승인 상담으로 전체 JSON을 다시 작성하세요. 관찰 가능한 골프 자세를 기준으로 0~100 참고평가, 3개 항목별 점수, 가정을 명시한 현재·개선 후 18홀 시뮬레이션 범위가 필수입니다. 이전 응답: '+JSON.stringify(analysis)}]);
   if(!completeScores(analysis))throw Error('scores-missing');
  }
  if(!analysis.coaching_context)analysis.coaching_context={concern:summary.concern,hypothesis:summary.hypothesis,practice_goal:summary.goal,improvement_focus:summary.improvement,source:'approved-summary'};
  let recommendations=[];try{recommendations=await findVideos(analysis.items,env,send);}catch{}
  return vjson({ok:true,input_receipt:receipt,mode:'gemini-images',analysis,recommendations,usage,elapsed_ms:Date.now()-started,attempts,score_completion_attempts:scoreCompletionAttempts,failed_attempt_usage:attempts>scoreCompletionAttempts+1?'첫 실패 요청의 사용량은 제공되지 않았습니다.':null,model:modelVersion,samples:d.samples.map(({id,frame,time,phase,phase_unverified})=>({id,frame,time,phase,phase_unverified:phase_unverified===true})),input:'사진 5장 + 승인 상담 요약 · 좌표/원본 영상 미전송'});
 }catch(error){const reason=String(error?.message??'');return vjson({ok:false,reason:reason==='scores-missing'?'제미나이에서 점수와 예상 타수를 받지 못했습니다. 다시 분석해 주세요.':reason==='http:429'?'Gemini 요청 한도를 초과했습니다. 잠시 후 다시 분석해 주세요.':reason.startsWith('http:')?'Gemini 분석 요청 실패 ('+reason.slice(5)+'). 다시 시도해 주세요.':reason.startsWith('incomplete:')?'사진 분석 응답이 끝나지 않았습니다 ('+reason.slice(11)+'). 다시 시도해 주세요.':reason==='format'?'사진 분석 응답의 필수 항목을 확인하지 못했습니다. 다시 시도해 주세요.':error?.name==='TimeoutError'?'사진 분석 응답 시간이 초과됐습니다. 다시 시도해 주세요.':'사진 분석 응답을 읽지 못했습니다. 다시 시도해 주세요.'},502);}
}
