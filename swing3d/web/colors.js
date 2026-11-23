/* Read the existing CSS palette for canvas, Three.js and inline guidance. */
window.MotionColors=Object.freeze({
 css:name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
 number:name=>parseInt(getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace('#',''),16),
});
(()=>{
 const source=new URL('assets/capture-guide.svg',document.currentScript.src);
 if(!document.querySelector('.capture-illustration'))return;
 fetch(source).then(r=>{if(!r.ok)throw Error('guide');return r.text();}).then(text=>{
  const parsed=new DOMParser().parseFromString(text,'image/svg+xml');if(parsed.documentElement.localName!=='svg')throw Error('guide');
  document.querySelectorAll('.capture-illustration').forEach((host,i)=>{const svg=document.importNode(parsed.documentElement,true);for(const node of svg.querySelectorAll('[id]'))node.id='capture-'+i+'-'+node.id;svg.removeAttribute('aria-labelledby');svg.setAttribute('aria-hidden','true');host.replaceChildren(svg);});
 }).catch(()=>{for(const host of document.querySelectorAll('.capture-illustration'))host.textContent='전신이 보이도록 카메라를 고정하고 촬영해 주세요.';});
})();
