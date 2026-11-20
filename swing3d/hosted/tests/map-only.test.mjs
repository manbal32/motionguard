import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const known={course_name:'리베라CC',image_url:'https://blogfiles.naver.net/map.png',source_page:'https://blog.naver.com/map/1',width:1157,height:750,preview_crop:{x:155,y:28,width:760,height:685}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(){
 const nodes=new Map(),calls=[];let failImage=false,found={ok:true,candidates:[]},selection={ok:true,indices:[]};
 class El{constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.attrs={};this.value='';this.textContent='';this.hidden=false;this.naturalWidth=1157;this.naturalHeight=750;}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}setAttribute(k,v){this.attrs[k]=String(v);}removeAttribute(k){delete this.attrs[k];}set src(value){this.url=value;queueMicrotask(()=>failImage?this.onerror?.():this.onload?.());}}
 const get=id=>{if(!nodes.has(id))nodes.set(id,new El());return nodes.get(id);};
 const sandbox={document:{getElementById:get,createElement:tag=>new El(tag)},URL,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:async(url,init)=>{calls.push({url,init});if(url.includes('map-preview-sources'))return Response.json([known]);if(url.includes('/discover?'))return Response.json(found);if(url.endsWith('/select-maps'))return Response.json(selection);throw Error('Unexpected API '+url);}};
 vm.runInNewContext(fs.readFileSync('overrides/map-only.js','utf8'),sandbox);await flush();
 return {get,calls,setFound:d=>found=d,setSelection:d=>selection=d,failImage:()=>failImage=true,submit:async name=>{get('map-query').value=name;await get('map-form').onsubmit({preventDefault(){}});}};
}
test('map opens independently with the real source image and exact display crop',async()=>{
 const t=await setup();assert.equal(t.get('map-name').textContent,'리베라CC');assert.equal(t.get('map-canvas').children.length,1);assert.match(t.get('map-canvas').children[0].url,/api\/courses\/image/);assert.equal(t.get('map-canvas').style.aspectRatio,'760/685');assert.equal(t.calls.length,1);assert.equal(t.get('map-stage').attrs['aria-busy'],'false');
 t.get('crop-toggle').onclick();assert.equal(t.get('map-canvas').style.aspectRatio,'1157/750');for(let i=0;i<9;i++)t.get('zoom-in').onclick();assert.equal(t.get('zoom-value').textContent,'300%');t.get('zoom-reset').onclick();assert.equal(t.get('zoom-value').textContent,'100%');
});
test('failed map classification keeps the displayed map and releases the search button',async()=>{
 const t=await setup();t.setFound({ok:true,candidates:[{...known,verified_map_source:false}]});await t.submit('골드CC');assert.equal(t.get('map-name').textContent,'리베라CC');assert.match(t.get('map-status').textContent,/현재 지도는 그대로/);assert.equal(t.get('map-search').disabled,false);assert.equal(t.get('map-canvas').children.length,1);
});
test('map search selects actual map images without swing analysis or hole inference',async()=>{
 const t=await setup();t.setFound({ok:true,candidates:[known,{...known,image_url:'https://blogfiles.naver.net/second.png'}]});t.setSelection({ok:true,indices:[1]});await t.submit('골드CC');assert.equal(t.get('map-name').textContent,'골드CC');assert.match(t.get('map-canvas').children[0].url,/second.png/);assert.ok(t.calls.some(c=>c.url.endsWith('/select-maps')));assert.ok(t.calls.every(c=>!c.url.includes('/analyze-map')&&!c.url.includes('/coaching/')));
});
test('an unreadable new map never replaces the last successfully displayed image',async()=>{
 const t=await setup(),old=t.get('map-canvas').children[0];t.setFound({ok:true,candidates:[{...known,verified_map_source:true}]});t.failImage();await t.submit('코리아CC');assert.equal(t.get('map-canvas').children[0],old);assert.equal(t.get('map-name').textContent,'리베라CC');assert.match(t.get('map-status').textContent,/불러오지 못했습니다/);
});
