/* Public hourly forecast for one fixed course. No visitor location or API credentials. */
const RIVERA_WEATHER_POINT={latitude:37.1902272,longitude:127.1077407};
let gameWeatherCache;
const weatherJSON=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function normalizeGameWeather(raw,now=Date.now()){
 const properties=raw?.properties,u=properties?.meta?.units,rows=properties?.timeseries;
 if(u?.wind_speed!=='m/s'||u?.wind_from_direction!=='degrees'||u?.air_temperature!=='celsius'||u?.precipitation_amount!=='mm'||!Array.isArray(rows))throw Error('날씨 형식을 확인하지 못했습니다.');
 const available=rows.map(row=>({row,time:Date.parse(row.time)})).filter(x=>Number.isFinite(x.time)&&x.time>=now-3*3600000&&x.time<=now+3600000).sort((a,b)=>a.time-b.time),past=available.filter(x=>x.time<=now),selected=past.at(-1)??available[0];
 const updated=Date.parse(properties.meta.updated_at);if(!selected||!Number.isFinite(updated)||updated<now-86400000||updated>now+1800000)throw Error('현재 시간대의 예보 자료가 아닙니다.');
 const c=selected.row.data?.instant?.details,next=selected.row.data?.next_1_hours,precipitation=next?.details?.precipitation_amount,gust=c?.wind_speed_of_gust;
 if(!c||[[c.air_temperature,-60,60],[c.wind_speed,0,75],[c.wind_from_direction,0,360],...(precipitation===undefined?[]:[[precipitation,0,200]]),...(gust===undefined?[]:[[gust,0,100]])].some(([n,min,max])=>!Number.isFinite(n)||n<min||n>max))throw Error('날씨 값이 올바르지 않습니다.');
 const symbol=next?.summary?.symbol_code??'',code=symbol.includes('thunder')?95:symbol.includes('snow')?73:symbol.includes('sleet')?67:symbol.includes('rain')?61:symbol.includes('fog')?45:symbol.includes('partlycloudy')?2:symbol.includes('cloudy')?3:symbol.includes('fair')?1:0;
 return{revision:1,mode:'live',reference:'screen-north',temperature:c.air_temperature,windSpeed:c.wind_speed,windFrom:c.wind_from_direction%360,gust:gust===undefined?c.wind_speed:Math.max(c.wind_speed,gust),gustAvailable:gust!==undefined,precipitation:precipitation??0,precipitationAvailable:precipitation!==undefined,precipitationPeriod:'next-hour',code,providerSymbol:symbol,weatherTime:new Date(selected.time).toISOString(),modelUpdatedAt:new Date(updated).toISOString(),retrievedAt:new Date(now).toISOString(),source:'MET Norway',sourceUrl:'https://api.met.no/',dataKind:'hourly-forecast',basis:'현재 시간대 모델 예보 · 게임 화면 위쪽을 북쪽으로 가정',point:RIVERA_WEATHER_POINT};
}
export async function gameWeather(request,env,send=fetch,{now=Date.now}={}){
 if(request.method!=='GET')return weatherJSON({ok:false,reason:'GET 요청이 필요합니다.'},405);
 const time=now();if(gameWeatherCache&&time>=gameWeatherCache.at&&time-gameWeatherCache.at<600000)return weatherJSON({ok:true,weather:gameWeatherCache.weather,cached:true});
 try{
  const url=new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact');url.searchParams.set('lat',RIVERA_WEATHER_POINT.latitude.toFixed(4));url.searchParams.set('lon',RIVERA_WEATHER_POINT.longitude.toFixed(4));
  const response=await send(url.href,{headers:{'User-Agent':'MotionGuardGolf/1.0 https://motionguard-mobile-play.creamhome4.chatgpt.site/','Accept':'application/json'},signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('날씨 서버 응답 실패 ('+response.status+')');const weather=normalizeGameWeather(await response.json(),time);gameWeatherCache={at:time,weather};return weatherJSON({ok:true,weather});
 }catch(error){
  console.error(JSON.stringify({event:'game_weather_failure',name:error.name,reason:error.message?.slice(0,180)}));
  if(gameWeatherCache&&time>=gameWeatherCache.at&&time-gameWeatherCache.at<3600000)return weatherJSON({ok:true,weather:gameWeatherCache.weather,stale:true,reason:'최신 조회가 지연되어 이전 예보를 유지합니다.'});
  return weatherJSON({ok:false,code:'weather_unavailable',reason:'현재 시간대 예보를 불러오지 못했습니다. 기본 조건으로 플레이할 수 있습니다.'},503);
 }
}
