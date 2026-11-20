import {coaching} from './coaching.mjs';
import {courses} from './courses.mjs';
import {visual} from './visual.mjs';
import {videos} from './videos.mjs';
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/coaching/videos')return videos(request,env);
  if(path.startsWith('/api/courses/'))return courses(request,env);
  if(path==='/api/coaching/visual')return visual(request,env);
  if(path.startsWith('/api/')){
   if(path==='/api/coaching/status'||path==='/api/coaching/chat'||path==='/api/coaching/summary')return coaching(request,env);
   return Response.json({ok:false,reason:'이 분석은 브라우저에서 처리합니다.'},{status:404});
  }
  return env.ASSETS.fetch(request);
 }
};
