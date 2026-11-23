/* Keep transcript and composer in normal page flow; scroll only after layout settles. */
window.MotionChatLayout=(()=>{
 let frame=0,lastLine=null;
 function viewport(){const v=window.visualViewport;return{top:v?.offsetTop??0,height:v?.height??window.innerHeight??600};}
 function scroll(delta){if(Number.isFinite(delta)&&Math.abs(delta)>1)window.scrollBy?.({top:delta,left:0,behavior:'auto'});}
 function composer(){return document.getElementById('coach-form');}
 function reveal(line){lastLine=line;if(frame)window.cancelAnimationFrame?.(frame);frame=window.requestAnimationFrame(()=>{frame=0;if(line?.isConnected===false||typeof line?.getBoundingClientRect!=='function')return;const bounds=line.getBoundingClientRect(),form=composer()?.getBoundingClientRect(),view=viewport(),available=Math.max(60,view.height-(form?.height??80)-32);if(bounds.height>available){scroll(bounds.top-view.top-12);return;}const end=Math.max(bounds.bottom,form?.bottom??bounds.bottom);if(end>view.top+view.height-12)scroll(end-(view.top+view.height-12));else if(bounds.top<view.top+12)scroll(bounds.top-view.top-12);});}
 function settle(){fit();if(lastLine?.isConnected!==false)reveal(lastLine);}
 function fit(){const field=document.getElementById('coach-message');if(!field)return;field.style.height='auto';const maximum=Math.max(52,Math.min(160,Math.floor(viewport().height*.35))),height=Math.min(maximum,Math.max(52,field.scrollHeight));field.style.height=height+'px';field.style.overflowY=field.scrollHeight>maximum?'auto':'hidden';}
 function ready(){const field=document.getElementById('coach-message');if(!field)return;const keepInputVisible=()=>{fit();if(document.activeElement!==field)return;window.requestAnimationFrame(()=>{const rect=composer()?.getBoundingClientRect(),view=viewport();if(rect&&rect.bottom>view.top+view.height-12)scroll(rect.bottom-(view.top+view.height-12));});};field.addEventListener('input',keepInputVisible);field.addEventListener('focus',keepInputVisible);window.addEventListener?.('resize',keepInputVisible);window.visualViewport?.addEventListener?.('resize',keepInputVisible);fit();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();return{reveal,settle,fit};
})();
