import {coaching} from './coaching.mjs';
import {courses} from './courses.mjs';
import {visual} from './visual.mjs';
import {videos} from './videos.mjs';
import {courseImages} from './course-images.mjs';
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/build')return Response.json({build:'__MOTIONGUARD_BUILD__'},{headers:{'Cache-Control':'no-store'}});
  if(path==='/api/coaching/videos')return videos(request,env);
  if(['/api/courses/discover','/api/courses/select-maps','/api/courses/analyze-map','/api/courses/image'].includes(path))return courseImages(request,env);
  if(path.startsWith('/api/courses/'))return courses(request,env);
  if(path==='/api/coaching/visual')return visual(request,env);
  if(path.startsWith('/api/')){
   if(path==='/api/coaching/status'||path==='/api/coaching/chat'||path==='/api/coaching/summary')return coaching(request,env);
   return Response.json({ok:false,reason:'이 분석은 브라우저에서 처리합니다.'},{status:404});
  }
  const asset=await env.ASSETS.fetch(request);if(path==='/'||asset.headers.get('Content-Type')?.includes('text/html')||/\.(html|js|css|json)$/.test(path)){const headers=new Headers(asset.headers);headers.set('Cache-Control','no-store');headers.set('X-MotionGuard-Build','__MOTIONGUARD_BUILD__');return new Response(asset.body,{status:asset.status,headers});}return asset;
 }
};
