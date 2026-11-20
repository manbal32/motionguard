import {findVideos} from './videos.mjs';
const visualPrompt=`한국어 골프 코치입니다. 대표사진은 동일한 업로드 영상에서 추출했습니다. 몸이 회전해서 보이는 방향이 바뀌는 것을 정면/측면 혼합 카메라로 단정하지 마세요. 승인된 상담 요약과 같은 영상의 대표사진 5장만으로 관찰 가능한 자세를 설명하세요. 자동 국면 이름은 후보이지 정답이 아닙니다. 정면/측면을 구별하고 가림·블러·장면 선택 오류는 status='unassessable'로 따로 기록하세요. 추적/촬영 문제를 스윙 결함으로 분류하지 마세요. 임팩트/클럽페이스/구질/비거리/지면반력/실제 체중 분배/통증 원인은 확정하지 마세요. 명확한 시각적 근거가 있으면 구체적인 관찰과 연습 방향을 설명하고, 없으면 개선점을 채우지 마세요. 숫자 각도와 좌표는 제공되지 않으므로 생성하지 마세요. 텍스트에서 사용자의 추정을 관측 사실로 바꾸지 마세요. 최대 잘한 점2개/개선 후보3개. 모든 항목에 sample_id(1~5), region(torso/hips/lean/wrist/kneeL/kneeR/heelR/swing), kind(positive/improvement), status(observed/tentative/unassessable), title, observation, meaning, drill, confidence(낮음/중간/높음)를 쓰세요. confidence 낮음은 개선 후보로 단정하지 마세요. JSON 형식 {summary:string,items:항목배열,withheld:문자열배열,phase_notes:문자열배열}. 추가 필드 assessment_score:{value:0~100정수또는null,basis:string,confidence:낮음/중간/높음}, score_estimate:{status:estimated/insufficient,current:{min:number,max:number}또는null,improved:같은구조또는null,basis:string,assumptions:문자열배열,confidence:낮음/중간/높음}를 반환하세요. 점수는 사진에서 관찰한 자세에 대한 코치의 참고평가이지 계측점수가 아닙니다. 예상 타수는 대화와 사진으로 추정한 일반적인18홀 참고범위입니다. 퍼팅/숏게임/실전미스는 알 수 없음을 가정에 쓰세요. 근거가 충분하지 않으면 status=insufficient, current/improved=null과 이유를 쓰세요. 고정된90타대 등 기본값을 채우지 마세요. 개선후 범위는 관찰한 개선후보가 교정된다는 조건부제안이며 무조건향상을보장하지마세요. 모든 설명은 자연스러운 한글로 작성하세요.`;
const vjson=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function validateVisual(data){
 const regions=['torso','hips','lean','wrist','kneeL','kneeR','heelR','swing'];
 if(!data||typeof data.summary!=='string'||data.summary.length>1500||!Array.isArray(data.items)||data.items.length>8||!Array.isArray(data.withheld)||!Array.isArray(data.phase_notes))throw Error('format');
 const str=x=>typeof x==='string'&&x.length<=1500;
 if(!data.withheld.every(str)||!data.phase_notes.every(str))throw Error('format');
 for(const i of data.items)if(!Number.isInteger(i.sample_id)||i.sample_id<1||i.sample_id>5||!regions.includes(i.region)||!['positive','improvement'].includes(i.kind)||!['observed','tentative','unassessable'].includes(i.status)||!['낮음','중간','높음'].includes(i.confidence)||!['title','observation','meaning','drill'].every(k=>str(i[k])))throw Error('format');
 for(const i of data.items){if(/체중|지면\s*반력|비거리|구질|스코어|통증/.test(i.title)){i.status='unassessable';i.confidence='낮음';i.caution='사진만으로 실제 힘·체중·공 궤도 등을 확정할 수 없어 이 항목은 판단을 보류했습니다.';}}
 const score=data.assessment_score;
 data.assessment_score=score&&((Number.isInteger(score.value)&&score.value>=0&&score.value<=100)||score.value===null)&&str(score.basis)&&['낮음','중간','높음'].includes(score.confidence)?score:{value:null,basis:'사진 기반 평가 점수가 제공되지 않았습니다.',confidence:'낮음'};
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
 for(const s of d.samples)parts.push({text:`sample_id=${s.id} frame=${s.frame} time=${s.time} phase_candidate=${s.phase}`},{inlineData:{mimeType:'image/jpeg',data:s.image}});
 const model=env.GEMINI_MODEL||'gemini-flash-lite-latest';if(!/^[\w.-]+$/.test(model))return vjson({ok:false,reason:'모델 설정 오류'},503);
 const started=Date.now();try{
  let attempts=0;let r;do{attempts++;r=await send(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},signal:AbortSignal.timeout(45000),body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{temperature:0,maxOutputTokens:8000,responseMimeType:'application/json'}})});if(![502,503].includes(r.status))break;}while(attempts<2);
  if(!r.ok)return vjson({ok:false,reason:r.status===429?'Gemini 요청 한도를 초과했습니다. 잠시 후 다시 분석해 주세요.':`Gemini 분석 요청 실패 (${r.status}). 다시 시도해 주세요.`},502);
  const result=await r.json(),c=result.candidates?.[0];if(c?.finishReason!=='STOP')throw Error('incomplete:'+String(c?.finishReason??'empty'));
  const analysis=validateVisual(JSON.parse(c.content.parts.filter(p=>!p.thought).map(p=>p.text??'').join(''))),usage={};for(const k of ['promptTokenCount','candidatesTokenCount','totalTokenCount','thoughtsTokenCount','cachedContentTokenCount'])if(Number.isInteger(result.usageMetadata?.[k]))usage[k]=result.usageMetadata[k];
  let recommendations=[];try{recommendations=await findVideos(analysis.items,env,send);}catch{}
  return vjson({ok:true,mode:'gemini-images',analysis,recommendations,usage,elapsed_ms:Date.now()-started,attempts,failed_attempt_usage:attempts>1?'첫 실패 요청의 사용량은 제공되지 않았습니다.':null,model:result.modelVersion??model,samples:d.samples.map(({id,frame,time,phase})=>({id,frame,time,phase})),input:'사진 5장 + 승인 상담 요약 · 좌표/원본 영상 미전송'});
 }catch(error){const reason=String(error?.message??'');return vjson({ok:false,reason:reason.startsWith('incomplete:')?'사진 분석 응답이 끝나지 않았습니다 ('+reason.slice(11)+'). 다시 시도해 주세요.':reason==='format'?'사진 분석 응답의 필수 항목을 확인하지 못했습니다. 다시 시도해 주세요.':error?.name==='TimeoutError'?'사진 분석 응답 시간이 초과됐습니다. 다시 시도해 주세요.':'사진 분석 응답을 읽지 못했습니다. 다시 시도해 주세요.'},502);}
}
