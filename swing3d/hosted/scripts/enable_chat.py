"""Enable server chat transport; static builds report configuration errors honestly."""
from pathlib import Path
root=Path(__file__).resolve().parents[1];d=root/'dist'
p=d/'client-api.js';s=p.read_text()
s=s.replace("if(c){c.checked=false;c.disabled=true;c.closest('label').hidden=true;}","if(c){c.checked=false;c.disabled=false;c.closest('label').hidden=false;}")
s=s.replace("if(route==='api/coaching/status')return reply({mode:'demo'});","if(route==='api/coaching/status')return nativeFetch(input,{...options,cache:'no-store'}).then(async r=>{if(!r.ok||!r.headers.get('Content-Type')?.includes('application/json'))return reply({mode:'unavailable'});return r;}).catch(()=>reply({mode:'unavailable'}));")
start=s.index("   if(route==='api/coaching/chat')");end=s.index('\n',start)
s=s[:start]+"   if(route==='api/coaching/chat'){const payload=JSON.parse(options.body||'{}');if(payload.allow_external!==true)return reply({ok:false,reason:'AI 상담은 상담 텍스트 전송 동의가 필요합니다. 원본 영상은 보내지 않습니다.'},403);try{const r=await nativeFetch(input,options);if(!r.headers.get('Content-Type')?.includes('application/json'))return reply({ok:false,reason:'AI 상담 서버가 연결되지 않았습니다. 운영자의 Gemini API 키 설정이 필요합니다.'},503);return r;}catch(e){if(e.name==='AbortError')throw e;return reply({ok:false,reason:'AI 상담 서버에 연결할 수 없습니다. 다시 시도해 주세요.'},503);}}"+s[end:]
p.write_text(s)
p=d/'instrument.js';s=p.read_text();s=s.replace('consent.checked && providerMode === "gemini" ? "Gemini 연결 설정됨" : "기기 내 기준 코칭"','providerMode === "gemini" ? (consent.checked ? "Gemini 상담 연결" : "텍스트 전송 동의 후 AI 상담") : "AI 상담 연결 필요"');s=s.replace('"데모 응답"','"상담 응답"');p.write_text(s)
p=d/'demo-start.js';s=p.read_text().replace('상담은 기기 내 기준 코칭이며 외부 AI를 호출하지 않습니다.','AI 상담은 연결 설정과 동의가 필요하며 상담 텍스트만 전송합니다. 영상 분석과 결과 생성은 기기 안에서 처리합니다.').replace('이 기기에서 영상 분석 · 기준 코칭 · 영상은 외부로 보내지 않습니다.','영상은 기기 안에서 분석 · AI 상담은 별도 연결 필요');s=s.replace('AI 상담은 별도 연결 필요','동의 후 Gemini AI 상담');p.write_text(s)
p=d/'index.html';s=p.read_text().replace('Gemini에 상담 텍스트와 계측 수치 전송 동의','Gemini에 상담 텍스트 전송 동의 (원본 영상 제외)');p.write_text(s)
