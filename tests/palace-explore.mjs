import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-editor-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),15000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && !!document.querySelector(".quick-search-trigger")'))break;await new Promise(resolve=>setTimeout(resolve,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const mouse=(type,x,y,buttons=1)=>call('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons,clickCount:1},sessionId);
  const keyCodes={Backspace:8,Delete:46,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Enter:13};
  const key=async name=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:keyCodes[name]},sessionId);await wait(50)};
  const type=async text=>{await call('Input.insertText',{text},sessionId);await wait(50)};
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(100);
  const note=async html=>{await evaluate(`current().blocks[0].html=${JSON.stringify(html)};render()`);await wait(250)};
  const rect=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}})()`);
  const html=()=>evaluate(`(()=>{const c=document.querySelector('.rich-text').cloneNode(true);c.querySelectorAll('.equation').forEach(q=>{q.replaceChildren();q.removeAttribute('title')});return c.innerHTML.replace(/ src="data:[^"]*"/g,' src=…')})()`);
  const caret=(selector,offset)=>evaluate(`(()=>{const e=document.querySelector('.rich-text');e.focus();const n=e.querySelector(${JSON.stringify(selector)}),t=n.firstChild.nodeType===3?n.firstChild:n,r=document.createRange();r.setStart(t,${offset});r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);e.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}))})()`);
  const select=(selector,from,to)=>evaluate(`(()=>{const e=document.querySelector('.rich-text');e.focus();const t=e.querySelector(${JSON.stringify(selector)}).firstChild,r=document.createRange();r.setStart(t,${from});r.setEnd(t,${to});getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  const picture=await evaluate(`(()=>{const c=document.createElement('canvas');c.width=300;c.height=300;const x=c.getContext('2d');x.fillStyle='#9bc';x.fillRect(0,0,300,300);return c.toDataURL('image/png')})()`);

  const text=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent||''`);
  const count=selector=>evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const toScreen2=w=>evaluate(`(()=>{const e=marginPalace.editor(),s=e.ctl.toScreen(${w.x},${w.y+w.h/2},${w.z}),r=e.ctl.canvas.getBoundingClientRect();return {x:s.x+r.left,y:s.y+r.top}})()`);
  const ed=expr=>evaluate(`(()=>{const e=marginPalace.editor();return ${expr}})()`);
  const pal=expr=>ed(`(p=>${expr})(e.palace)`);
  // the page position of a point in the house (metres), for the mouse
  const screen=async(x,z)=>evaluate(`(()=>{const e=marginPalace.editor(),r=e.ctl.canvas.getBoundingClientRect(),s=e.ctl.toScreen(${x},.1,${z});return {x:r.left+s.x,y:r.top+s.y}})()`);
  const pm=(type,p,buttons=1)=>call('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons,clickCount:1},sessionId);
  const tap=async(x,z)=>{const p=await screen(x,z);await pm('mousePressed',p);await pm('mouseReleased',p,0);await wait(80)};
  const drag=async(from,to,steps=6)=>{const a=await screen(...from),b=await screen(...to);await pm('mousePressed',a);for(let i=1;i<=steps;i++)await pm('mouseMoved',{x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps});await pm('mouseReleased',b,0);await wait(120)};
  const press=async(k,extra={})=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:k,code:k.length===1?'Key'+k.toUpperCase():k,windowsVirtualKeyCode:{Delete:46,Escape:27,ArrowUp:38,Backspace:8}[k]||k.toUpperCase().charCodeAt(0),...extra},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',key:k,code:k.length===1?'Key'+k.toUpperCase():k},sessionId);await wait(80)};
  // the app's bridge, faked: every message the page sends the Mac is recorded
  await evaluate(`window.__msgs=[];window.webkit={messageHandlers:{margin:{postMessage:m=>{window.__msgs.push(m)}}}};localStorage.clear();(()=>{state.projects=[{id:'ru',name:'Russian',icon:'x',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[]}];state.notes=[];state.vocab=[];state.palaces=[];active=null;const p=marginPalace.create('ru',true);marginPalace.open(p.id)})()`);await wait(900);
  const looks=()=>evaluate(`window.__msgs.filter(m=>m.type==='mouseLook').map(m=>m.on)`);
  const clickAt=async(x,y)=>{await pm('mousePressed',{x,y});await pm('mouseReleased',{x,y},0);await wait(120)};
  const Pm='PalaceModel';
  const coffee=await pal(`p.furniture.find(f=>f.type==='coffee-table')`);
  const st=await pal(`PalaceModel.addStation(p,${JSON.stringify(coffee.id)},{title:'Gold marker',detail:'meaning here'})`);
  await ed(`e.commit()`);await ed(`e.setMode('walk')`);await wait(300);
  await ed(`(()=>{const c=e.ctl,f=e.palace.furniture.find(g=>g.id===${JSON.stringify(coffee.id)}),v=PalaceModel.viewFrom(e.palace,f),sp=PalaceModel.spec(f.type);c.walk.x=v.x;c.walk.z=v.z;const dx=f.x-v.x,dz=f.z-v.z,dy=(sp.lift||0)+sp.h+.4-1.6;c.walk.yaw=Math.atan2(dx,dz);c.walk.pitch=Math.atan2(dy,Math.hypot(dx,dz));c.redraw();return 1})()`);await wait(200);
  const diamond=await ed(`(()=>{const f=e.palace.furniture.find(g=>g.id===${JSON.stringify(coffee.id)}),sp=PalaceModel.spec(f.type),s=e.ctl.toScreen(f.x,(sp.lift||0)+sp.h+.4,f.z),r=e.ctl.canvas.getBoundingClientRect();return {x:r.left+s.x,y:r.top+s.y}})()`);
  // 1 · with a free cursor, point at a diamond and click it
  await evaluate(`[...document.querySelectorAll('.pe-toolbar button')].find(b=>b.textContent==='Free cursor').click()`);await wait(200);
  assert.equal(await ed(`e.S.look`),false,'a free cursor lets go of the mouse');
  await pm('mouseMoved',{x:diamond.x+4,y:diamond.y+3},0);await wait(150);
  assert.equal(await ed(`e.S.hover.station`),st.id,'pointing at the diamond lights it up');
  assert.equal(await evaluate(`document.querySelector('.pe-canvas').style.cursor`),'pointer','and the cursor becomes a hand');
  await clickAt(diamond.x+4,diamond.y+3);
  assert.equal(await evaluate(`document.querySelector('.pe-card').hidden`),false,'clicking the diamond opens what it holds');
  assert.match(await text('.pe-card h3'),/Gold marker/);
  // 2 · with mouse look, the dot is the guide: the same click works
  await evaluate(`[...document.querySelectorAll('.pe-toolbar button')].find(b=>b.textContent==='Free cursor').click()`);await wait(200);
  assert.equal(await ed(`e.S.look`),true,'turning the free cursor off takes the mouse again');
  await ed(`e.S.look&&(document.querySelector('.pe-card .pe-x').click(),1)`);
  await evaluate(`window.marginMouseLook(0,0)`);await wait(150);
  const dot=await ed(`({x:e.ctl.canvas.clientWidth/2,y:e.ctl.canvas.clientHeight/2})`);
  const view=await ed(`(()=>{const f=e.palace.furniture.find(g=>g.id===${JSON.stringify(coffee.id)}),sp=PalaceModel.spec(f.type),s=e.ctl.toScreen(f.x,(sp.lift||0)+sp.h+.4,f.z);return {dx:s.x-e.ctl.canvas.clientWidth/2,dy:s.y-e.ctl.canvas.clientHeight/2}})()`);
  assert(Math.abs(view.dx)<26&&Math.abs(view.dy)<26,'the diamond is under the dot: '+JSON.stringify(view));
  await clickAt(40,300);
  assert.equal(await evaluate(`document.querySelector('.pe-card').hidden`),false,'a click on the dot opens it too');
  // 3 · the panel for writing things is big
  await ed(`e.setEdit(true)`);await wait(200);
  assert((await rect('.pe-side')).w>=440,'the side panel is wide');
  // 4 · a new thing, once named, returns you to exploring
  const shelf=await pal(`p.furniture.find(f=>PalaceModel.surfacesOf(f).length)`);
  const q=await pal(`PalaceModel.placeProp(p,'vase',${JSON.stringify(shelf.id)},{})||PalaceModel.placeProp(p,'book',${JSON.stringify(shelf.id)},{})`);
  await ed(`(()=>{e.S.fresh=${JSON.stringify(q.id)};e.S.focusFresh=${JSON.stringify(q.id)};e.selectProp(${JSON.stringify(q.id)});return 1})()`);await wait(200);
  assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'What it stands for','the first field is ready to type in');
  assert.equal(await evaluate(`document.querySelectorAll('.pe-side textarea').length>=1`),true,'the meaning has room to write');
  await type('Mitochondria');await key('Enter');await wait(200);
  assert.equal(await ed(`e.S.edit`),false,'Enter on a new thing goes back to exploring');
  assert.equal(await ed(`e.palace.props.find(g=>g.id===${JSON.stringify(q.id)}).title`),'Mitochondria','what you wrote is kept');
  assert.equal(await ed(`e.S.fresh`),null);
  assert.equal(await ed(`e.ctl.getMode()`),'walk');
  console.log('PASS: palace explore — click the diamonds with a free cursor or the dot; a roomy panel; a new thing returns to exploring.');

}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
