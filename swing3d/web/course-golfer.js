/* Small decorative golfer. This is animation, not the user's reconstructed swing. */
window.MotionGolfer=(()=>{
 function mount(svg){const ns=svg.namespaceURI;const add=(tag,attrs,parent)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e;};const root=add('g',{'aria-label':'샷을 치는 작은 골퍼 · 연출',role:'img',id:'course-golfer'},svg),character=add('g',{},root);
  add('ellipse',{cx:0,cy:1,rx:15,ry:4,fill:'var(--ink)',opacity:.15},character);
  const legs=add('g',{stroke:'var(--course-action)','stroke-width':7,'stroke-linecap':'round'},character),left=add('line',{x1:-4,y1:-19,x2:-9,y2:-3},legs),right=add('line',{x1:4,y1:-19,x2:9,y2:-3},legs);
  add('path',{d:'M-10 -36 Q0 -43 10 -36 L8 -18 Q0 -13 -8 -18Z',fill:'var(--good)'},character);
  add('circle',{cx:0,cy:-49,r:11,fill:'var(--paper)',stroke:'var(--course-action)','stroke-width':2},character);
  add('path',{d:'M-12 -49 Q-10 -64 5 -60 Q13 -57 12 -49Z',fill:'var(--course-action)'},character);add('rect',{x:0,y:-52,width:18,height:5,rx:2,fill:'var(--course-action)'},character);
  add('circle',{cx:5,cy:-47,r:1.5,fill:'var(--ink)'},character);
  const arms=add('g',{transform:'translate(0 -34)'},character);add('path',{d:'M-8 0 Q1 5 12 11',fill:'none',stroke:'var(--paper)','stroke-width':6,'stroke-linecap':'round'},arms);add('path',{d:'M8 0 L12 11',fill:'none',stroke:'var(--good)','stroke-width':6,'stroke-linecap':'round'},arms);add('path',{d:'M12 11 L31 37 L39 35',fill:'none',stroke:'var(--ink)','stroke-width':3,'stroke-linecap':'round'},arms);
  function pose(point,phase='ready',progress=0){root.dataset.phase=phase;root.dataset.x=point[0];root.dataset.y=point[1];root.setAttribute('transform',`translate(${point[0]-26} ${point[1]-4}) scale(.8)`);let angle=0;if(phase==='swing')angle=progress<.45?-115*Math.sin(progress/.45*Math.PI/2):progress<.7?-115*(1-(progress-.45)/.25):115*(progress-.7)/.3;if(phase==='follow')angle=115;arms.setAttribute('transform',`translate(0 -34) rotate(${angle})`);const stride=phase==='walk'?Math.sin(progress*Math.PI*6)*5:0;left.setAttribute('x2',-9+stride);right.setAttribute('x2',9-stride);}
  return{pose};
 }
 return{mount};
})();
