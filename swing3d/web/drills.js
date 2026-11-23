/* Manually selected public instruction; provenance and durations: DRILL_SOURCES.md. */
window.MotionDrills=(()=>{
 const hips={title:'골반 회전 순서 연습',videoId:'BNByYOos_lc',seconds:618};
 const weight={title:'체중 이동 연습',videoId:'g_OgxMZqimo',seconds:541};
 const wrist={title:'손목 힌지 연습',videoId:'ZD8yCcshsqI',seconds:29};
 const catalog={top_hips:hips,down_hips:hips,impact_hips:hips,top_torso:hips,down_torso:hips,top_x_factor:hips,down_x_factor:hips,finish_torso:hips,finish_hips:hips,top_shiftX:weight,impact_shiftX:weight,finish_heelR:weight,top_wrist:wrist,down_wrist:wrist};
 return Object.freeze({catalog,get:item=>{const d=catalog[typeof item==='string'?item:item.id];return d?{...d,url:'https://www.youtube.com/watch?v='+d.videoId,curated:true}:null;}});
})();
