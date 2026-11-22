/* Compare a frozen aiming line with the same shot's actual landing. No physics changes. */
window.MotionShotWindView = (() => {
  const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  function describe(shot) {
    if (shot?.putt || shot?.weather?.mode !== 'live' || shot.weather.windSpeed < .3 || ![shot.start, shot.end, shot.aimEnd].every(point)) return null;
    const dx = shot.aimEnd.x - shot.start.x, dy = shot.aimEnd.y - shot.start.y, length = Math.hypot(dx, dy);
    if (length < .01) return null;
    const offset = ((shot.end.x - shot.aimEnd.x) * dy - (shot.end.y - shot.aimEnd.y) * dx) / length;
    const magnitude = Math.abs(offset), side = offset < 0 ? '왼쪽' : '오른쪽';
    const note = magnitude < .5 ? '조준선 가까이에 착지' : '조준선보다 ' + side + ' ' + (magnitude < 10 ? magnitude.toFixed(1) : Math.round(magnitude)) + 'm';
    const wind = shot.wind?.cross > .3 ? '오른쪽 옆바람' : shot.wind?.cross < -.3 ? '왼쪽 옆바람' : shot.wind?.along < -.3 ? '맞바람' : shot.wind?.along > .3 ? '뒷바람' : '약한 바람';
    return {offset, side, note, wind, compensated: shot.windCompensated === true};
  }
  function mount(svg, shot, project) {
    const info = describe(shot); if (!info) return null;
    const ns = 'http://www.w3.org/2000/svg';
    const add = (tag, attrs = {}, parent = root, text) => { const e = document.createElementNS(ns, tag); for (const [k,v] of Object.entries(attrs)) e.setAttribute(k,v); if (text) e.textContent=text; parent.append(e); return e; };
    const root = document.createElementNS(ns,'g'); root.setAttribute('class','shot-wind-comparison'); root.setAttribute('pointer-events','none'); root.setAttribute('aria-label',info.wind+' · '+info.note); svg.append(root);
    const a=project(shot.start), aim=project(shot.aimEnd), b=project(shot.end), c=project(shot.control??{x:(shot.start.x+shot.end.x)/2,y:(shot.start.y+shot.end.y)/2});
    const stroke = {'vector-effect':'non-scaling-stroke',fill:'none','stroke-linecap':'round'};
    add('path',{...stroke,d:`M${a} L${aim}`,stroke:'#ac700a','stroke-width':3,'stroke-dasharray':'7 5','data-wind-part':'aim'});
    const trace=add('path',{...stroke,d:`M${a} Q${c} ${b}`,stroke:'#08775c','stroke-width':4,pathLength:1,'stroke-dasharray':1,'stroke-dashoffset':1,'data-wind-part':'flight'});
    const aimRing=add('circle',{cx:aim[0],cy:aim[1],fill:'#fff7df',stroke:'#ac700a','stroke-width':2,'vector-effect':'non-scaling-stroke','data-wind-part':'aim-point'});
    const landing=add('g',{'data-wind-part':'landing'});add('path',{...stroke,d:`M${aim} L${b}`,stroke:'#d3672a','stroke-width':2,'stroke-dasharray':'3 3'},landing);
    const landingRing=add('circle',{cx:b[0],cy:b[1],fill:'#08775c',stroke:'#fff','stroke-width':2,'vector-effect':'non-scaling-stroke'},landing);
    const badge=add('g',{'data-wind-part':'readout'});add('rect',{width:236,height:88,rx:13,fill:'#fff','fill-opacity':.96,stroke:'#c5d9cb','stroke-width':1},badge);
    add('text',{x:12,y:22,'font-size':14,'font-weight':700,fill:'#173c2c'},badge,info.note);
    add('text',{x:12,y:41,'font-size':12,fill:'#597061'},badge,info.compensated?'착지 차이 확대 · 바람 보정 조준':'착지 차이 확대 · '+info.wind);
    const targetX=118+clamp(info.offset*6,-90,90);add('line',{x1:28,y1:57,x2:208,y2:57,stroke:'#d6e3d9','stroke-width':3},badge);
    add('line',{x1:118,y1:57,x2:targetX,y2:57,stroke:'#d3672a','stroke-width':3},badge);
    add('circle',{cx:118,cy:57,r:5,fill:'#fff7df',stroke:'#ac700a','stroke-width':2},badge);add('circle',{cx:targetX,cy:57,r:5,fill:'#08775c',stroke:'#fff','stroke-width':1},badge);
    add('text',{x:12,y:78,'font-size':12,fill:'#8c5c08'},badge,'금색: 조준');add('text',{x:110,y:78,'font-size':12,fill:'#08775c'},badge,'초록: 실제 착지');
    let lastProgress=0;
    function reflow() {
      const box=(svg.getAttribute('viewBox')??'0 0 400 640').trim().split(/[ ,]+/).map(Number),rect=svg.getBoundingClientRect?.(),width=rect?.width||340,height=rect?.height||480,scale=Math.min(width/box[2],height/box[3])||1;
      const padX=(width-box[2]*scale)/2,padY=(height-box[3]*scale)/2,badgeScale=Math.min(1,(width-16)/236),compact=height<220,badgeHeight=compact?46:88;
      badge.setAttribute('transform',`translate(${box[0]+(width-8-236*badgeScale-padX)/scale} ${box[1]+(height-8-badgeHeight*badgeScale-padY)/scale}) scale(${badgeScale/scale})`);
      for(let i=3;i<badge.children.length;i++)badge.children[i].setAttribute('visibility',compact?'hidden':'visible');badge.children[0].setAttribute('height',badgeHeight);
      aimRing.setAttribute('r',6/scale);landingRing.setAttribute('r',6/scale);
    }
    function progress(value) { lastProgress=clamp(value,0,1); trace.setAttribute('stroke-dashoffset',1-lastProgress);landing.setAttribute('visibility',lastProgress>=1?'visible':'hidden');badge.setAttribute('visibility',lastProgress>=1?'visible':'hidden');landing.setAttribute('display',lastProgress>=1?'inline':'none');badge.setAttribute('display',lastProgress>=1?'inline':'none');root.dataset.phase=lastProgress>=1?'landed':'flight'; }
    reflow();progress(0);return {root,info,reflow,progress,remove:()=>root.remove?.()};
  }
  return {describe,mount};
})();
