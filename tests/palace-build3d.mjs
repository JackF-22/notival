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
  const ed=expr=>evaluate(`(()=>{const e=marginPalace.editor();return ${expr}})()`);
  const pal=expr=>ed(`(p=>${expr})(e.palace)`);
  // the page position of a point in the house (metres), for the mouse
  const screen=async(x,z)=>evaluate(`(()=>{const e=marginPalace.editor(),r=e.ctl.canvas.getBoundingClientRect(),s=e.ctl.toScreen(${x},.1,${z});return {x:r.left+s.x,y:r.top+s.y}})()`);
  const pm=(type,p,buttons=1)=>call('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons,clickCount:1},sessionId);
  const tap=async(x,z)=>{const p=await screen(x,z);await pm('mousePressed',p);await pm('mouseReleased',p,0);await wait(80)};
  const drag=async(from,to,steps=6)=>{const a=await screen(...from),b=await screen(...to);await pm('mousePressed',a);for(let i=1;i<=steps;i++)await pm('mouseMoved',{x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps});await pm('mouseReleased',b,0);await wait(120)};
  const press=async(k,extra={})=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:k,code:k.length===1?'Key'+k.toUpperCase():k,windowsVirtualKeyCode:{Delete:46,Escape:27,ArrowUp:38,Backspace:8}[k]||k.toUpperCase().charCodeAt(0),...extra},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',key:k,code:k.length===1?'Key'+k.toUpperCase():k},sessionId);await wait(80)};
  await evaluate(`HTMLCanvasElement.prototype.requestPointerLock=function(){};`);
  await evaluate(`localStorage.clear();(()=>{state.projects=[{id:'ru',name:'Russian',icon:'x',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[]}];state.notes=[];state.vocab=[];state.palaces=[];active=null;const p=marginPalace.create('ru',true);const sh=p.furniture.find(f=>f.type==='bookshelf');for(const level of [0,1])for(let k=0;k<6;k++)PalaceModel.placeProp(p,'book',sh.id,{surface:level,...PalaceModel.bookLike(k+level*6)});marginPalace.open(p.id)})()`);await wait(900);
  const toScreen=(x,y,z)=>evaluate(`(()=>{const e=marginPalace.editor(),s=e.ctl.toScreen(${x},${y},${z}),r=e.ctl.canvas.getBoundingClientRect();return s?{x:s.x+r.left,y:s.y+r.top}:null})()`);
  const look=(x,z,yaw,pitch=-.1)=>ed(`(()=>{const c=e.ctl;c.walk.x=${x};c.walk.z=${z};c.walk.yaw=${yaw};c.walk.pitch=${pitch};c.redraw();return 1})()`);
  const lookAt=async id=>{await ed(`(()=>{const f=e.palace.furniture.find(g=>g.id==='${id}'),v=PalaceModel.viewFrom(e.palace,f),c=e.ctl;c.walk.x=v.x;c.walk.z=v.z;c.walk.yaw=v.yaw;c.walk.pitch=-.12;c.redraw();return 1})()`);await wait(300)};
  const buildTab=()=>evaluate(`[...document.querySelectorAll('.pe-tab')].find(b=>/^Build/.test(b.textContent)).click()`);
  const buttonText=t=>evaluate(`[...document.querySelectorAll('.pe-levels button')].map(b=>b.textContent).join('|')`);
  // 1 · floors: add one, switch between them
  assert.equal(await buttonText(),'Ground|+ Floor');
  await evaluate(`document.querySelector('.pe-addfloor').click()`);await wait(300);
  assert.equal(await buttonText(),'Ground|Floor 1|+ Floor');assert.equal(await pal(`p.level`),1,'you go to the new floor');assert.equal(await pal(`p.rooms.length`),5,'with the same outline');assert.equal(await pal(`p.furniture.length`),0);
  assert.match(await text('.pe-levels [aria-pressed=true]'),/Floor 1/);
  await evaluate(`[...document.querySelectorAll('.pe-levels button')][0].click()`);await wait(200);
  assert.equal(await pal(`p.level`),0);assert(await pal(`p.furniture.length`)>20,'the ground floor is as it was');
  // 2 · a staircase from the catalogue: both ends appear
  await ed(`e.select('room',e.palace.rooms[4].id)`);await ed(`(e.S.tab='build',e.commit(),0)`);
  assert(await evaluate(`!!document.querySelector('.pe-item[data-type="stairs-up"]')`),'the catalogue offers a staircase');assert.equal(await evaluate(`!!document.querySelector('.pe-item[data-type="stairs-down"]')`),false,'but not the stairwell on its own');
  await evaluate(`document.querySelector('.pe-item[data-type="stairs-up"]').click()`);await wait(200);
  const stairs=await pal(`p.furniture.find(f=>f.type==='stairs-up')`);assert(stairs&&stairs.link,'the staircase is placed');
  assert.equal(await pal(`PalaceModel.partnerOf(p,p.furniture.find(f=>f.type==='stairs-up')).level`),1,'its stairwell is upstairs');
  assert.match(await text('.pe-panel'),/Go upstairs/,'the inspector offers to go up');
  // 3 · walking: click the staircase to climb
  await ed(`e.setMode('walk')`);await wait(300);
  assert.deepEqual(await ed(`[e.ctl.walk.x,e.ctl.walk.z,e.ctl.walk.yaw]`),[2.5,.9,0],'the first walk begins at the front door');
  await lookAt(stairs.id);
  const sp=await toScreen(stairs.x,.8,stairs.z);await pm('mousePressed',sp);await pm('mouseReleased',sp,0);await wait(400);
  assert.equal(await pal(`p.level`),1,'clicking the stairs takes you up');assert.equal(await ed(`e.ctl.state.level`),1);
  await wait(1500);assert(await ed(`e.ctl.state.camY`)>2.9,'the view rises to the new floor');
  assert.equal(await pal(`PalaceModel.roomAt(p,e.ctl.walk.x,e.ctl.walk.z)!=null`),true,'you arrive inside a room');
  const wells=await pal(`p.furniture.find(f=>f.type==='stairs-down')`);assert(wells,'standing by the stairwell');
  await lookAt(wells.id);await ed(`(e.ctl.walk.pitch=-.6,e.ctl.redraw(),0)`);await wait(300);const wp=await toScreen(wells.x,.5,wells.z);await pm('mousePressed',wp);await pm('mouseReleased',wp,0);await wait(400);assert.equal(await pal(`p.level`),0,'and back down');await wait(1800);
  // 4 · look by grabbing: the spot under the pointer stays under it
  await look(5,2.5,.4,-.1);await wait(300);
  const world={x:5+Math.sin(.4)*3,y:1.4,z:2.5+Math.cos(.4)*3};
  const a=await toScreen(world.x,world.y,world.z);const from={x:a.x,y:a.y+60};
  await pm('mousePressed',from);for(let i=1;i<=8;i++)await pm('mouseMoved',{x:from.x+i*12,y:from.y+i*4});await pm('mouseReleased',{x:from.x+96,y:from.y+32},0);await wait(250);
  const b=await toScreen(world.x,world.y,world.z);
  assert(Math.abs((b.x-a.x)-96)<8&&Math.abs((b.y-a.y)-32)<8,'the world follows the pointer: moved '+(b.x-a.x).toFixed(0)+','+(b.y-a.y).toFixed(0)+' for a 96,32 drag');
  // 4b · mouse look: with the mouse held, moving it turns your head, and a click acts on what is under the dot
  await ed(`(()=>{const c=e.ctl;c.walk.yaw=0;c.walk.pitch=0;e.S.look=true;document.querySelector('.palace-editor').dataset.look='true';return 1})()`);
  const yaw0=await ed(`e.ctl.walk.yaw`),pitch0=await ed(`e.ctl.walk.pitch`);
  await evaluate(`window.marginMouseLook(100,0)`);assert(await ed(`e.ctl.walk.yaw`)<yaw0-.2,'moving the mouse right turns right');
  await evaluate(`window.marginMouseLook(-100,0)`);assert(Math.abs(await ed(`e.ctl.walk.yaw`)-yaw0)<1e-9,'and back');
  await evaluate(`window.marginMouseLook(0,-100)`);assert(await ed(`e.ctl.walk.pitch`)>pitch0+.2,'moving it up looks up');await evaluate(`window.marginMouseLook(0,100)`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.pe-cross')).display`),'block','a dot marks the middle');
  // a click aims at the middle whatever the pointer says: point the middle at the guide book and click far from it
  const guideId=await pal(`p.props.find(q=>q.pages.length===4).id`);const gw=await pal(`PalaceModel.propWorld(p,p.props.find(q=>q.id==='${guideId}'))`);
  await ed(`(()=>{const c=e.ctl,w=${JSON.stringify(gw)},sh=w.host,v=PalaceModel.viewFrom(e.palace,sh);c.walk.x=v.x;c.walk.z=v.z;const dx=w.x-v.x,dz=w.z-v.z,dy=w.y+w.h/2-1.6,d=Math.hypot(dx,dz);c.walk.yaw=Math.atan2(dx,dz);c.walk.pitch=Math.atan2(dy,d);c.redraw();return 1})()`);await wait(300);
  await evaluate(`window.marginMouseLook(0,0)`);await wait(100);assert.equal(await ed(`e.S.hover.hoverProp`),guideId,'the book under the dot lights up without the pointer moving');
  await pm('mousePressed',{x:30,y:300});await pm('mouseReleased',{x:30,y:300},0);await wait(1000);assert.equal(await count('.pb-scrim'),1,'clicking takes the book under the dot');
  assert.equal(await ed(`e.S.look`),false,'the mouse is let go while you read');
  await press('Escape');await wait(800);assert.equal(await count('.pb-scrim'),0);
  await ed(`(e.S.look=true,0)`);await press('Escape');assert.equal(await ed(`e.S.look`),false,'Escape lets go of the mouse first');assert.equal(await ed(`e.ctl.getMode()`),'walk','and stays in the house');
  // 5 · a book lights up when the pointer is on it
  const shelf=await pal(`p.furniture.find(f=>f.type==='bookshelf')`);await lookAt(shelf.id);
  const bookId=await pal(`p.props.find(q=>q.type==='book'&&q.hostId==='${shelf.id}'&&q.surface===1).id`);
  const bw=await pal(`PalaceModel.propWorld(p,p.props.find(q=>q.id==='${bookId}'))`);const bp=await toScreen(bw.x,bw.y+bw.h/2,bw.z);
  await pm('mouseMoved',bp,0);await wait(200);assert.equal(await ed(`e.S.hover.hoverProp`),bookId,'the book under the pointer is lit');
  assert.equal(await evaluate(`document.querySelector('.pe-canvas').style.cursor`),'pointer','and the cursor says it can be clicked');
  assert.match(await text('.pe-hud'),/Take it down/);
  await pm('mouseMoved',{x:40,y:300},0);await wait(150);assert.equal(await ed(`e.S.hover.hoverProp||null`),null,'it goes out when the pointer leaves');
  // 6 · build while walking
  await evaluate(`[...document.querySelectorAll('.pe-toolbar button')].find(b=>b.textContent==='Build').click()`);await wait(300);
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.pe-side')).display`),'none','the panel is there while walking');
  const plants=await pal(`p.furniture.filter(f=>f.type==='plant').length`);
  await evaluate(`document.querySelector('.pe-item[data-type="plant"]').click()`);await wait(150);assert.equal(await ed(`e.S.placing.type`),'plant');
  await look(2.5,2.2,.3,-.35);await wait(250);
  const floorSpot=await toScreen(2.5+Math.sin(.3)*2.2,0,2.2+Math.cos(.3)*2.2);
  await pm('mouseMoved',floorSpot,0);await wait(250);
  assert.equal(await ed(`!!e.S.aimed`),true);assert.equal(await ed(`e.ctl.state.overlay.ghost3!=null`),true,'a ghost shows where it would go');
  // find a spot that is free: sweep the pointer until the ghost is green
  let placed=false;for(const dy of [0,40,80,-40]){for(const dx of [0,-120,120,-240,240]){await pm('mouseMoved',{x:floorSpot.x+dx,y:floorSpot.y+dy},0);await wait(60);if(await ed(`!!(e.S.aimed&&e.S.aimed.ok)`)){await pm('mousePressed',{x:floorSpot.x+dx,y:floorSpot.y+dy});await pm('mouseReleased',{x:floorSpot.x+dx,y:floorSpot.y+dy},0);placed=true;break}}if(placed)break}
  await wait(250);assert(placed,'a free spot was found');assert.equal(await pal(`p.furniture.filter(f=>f.type==='plant').length`),plants+1,'the plant is placed where you pointed');assert.equal(await ed(`e.S.placing`),null,'one at a time');
  assert.equal(await text('.pe-title'),'Plant','and it is selected');
  // Escape cancels placing, and R turns the ghost
  await buildTab();await evaluate(`document.querySelector('.pe-item[data-type="sofa"]').click()`);await wait(100);await press('r');assert.equal(await ed(`e.S.placing.rot`),90,'R turns what you are placing');await press('Escape');assert.equal(await ed(`e.S.placing`),null,'Escape cancels');assert.equal(await count('.palace-editor'),1);
  // a refused spot places nothing: point at the ceiling
  await buildTab();await evaluate(`document.querySelector('.pe-item[data-type="sofa"]').click()`);await wait(100);const n0=await pal(`p.furniture.length`);
  await pm('mouseMoved',{x:600,y:120},0);await wait(150);await pm('mousePressed',{x:600,y:120});await pm('mouseReleased',{x:600,y:120},0);await wait(150);assert.equal(await pal(`p.furniture.length`),n0,'nothing placed on the ceiling');await press('Escape');
  // 7 · a small thing, placed on a table by pointing at it
  const desk=await pal(`p.furniture.find(f=>f.type==='coffee-table')`);await lookAt(desk.id);await ed(`(e.ctl.walk.pitch=-.5,e.ctl.redraw(),0)`);await wait(250);
  const mugs=await pal(`p.props.filter(q=>q.type==='succulent').length`);
  await buildTab();await evaluate(`document.querySelector('.pe-item[data-prop="succulent"]').click()`);await wait(150);
  const topPoint=await toScreen(desk.x,.42,desk.z);await pm('mouseMoved',topPoint,0);await wait(250);
  assert.equal(await ed(`e.ctl.state.overlay.ghost3!=null`),true,'the ghost sits on the table');
  let put=false;for(const dx of [0,30,-30,60,-60]){const q={x:topPoint.x+dx,y:topPoint.y};await pm('mouseMoved',q,0);await wait(80);if(await ed(`!!(e.S.aimed&&e.S.aimed.ok)`)){await pm('mousePressed',q);await pm('mouseReleased',q,0);put=true;break}}
  await wait(250);assert(put);assert.equal(await pal(`p.props.filter(q=>q.type==='succulent').length`),mugs+1);assert.equal(await pal(`p.props.at(-1).hostId`),desk.id,'on the table');
  // 8 · click a thing to select it, Delete removes it, undo brings it back
  const sel=await ed(`e.S.prop`);assert.equal(typeof sel,'string');
  await press('Delete');await wait(200);assert.equal(await pal(`p.props.some(q=>q.id==='${sel}')`),false,'Delete removes the selected thing');
  await ed(`e.history.undo()`);assert.equal(await pal(`p.props.some(q=>q.id==='${sel}')`),true,'undo');
  // move a thing: pick it up and point somewhere else
  await ed(`(e.ctl.rebuild(),e.selectProp('${sel}'),0)`);await evaluate(`[...document.querySelectorAll('.pe-actions button')].find(b=>b.textContent==='Move').click()`);await wait(100);assert.equal(await ed(`e.S.placing.kind`),'moveP');
  const t2=await pal(`p.furniture.find(f=>f.type==='dining-table')`);await lookAt(t2.id);const tp=await toScreen(t2.x,.77,t2.z);
  let moved=false;for(const dx of [0,40,-40,80,-80]){const q={x:tp.x+dx,y:tp.y};await pm('mouseMoved',q,0);await wait(80);if(await ed(`!!(e.S.aimed&&e.S.aimed.ok)`)){await pm('mousePressed',q);await pm('mouseReleased',q,0);moved=true;break}}
  await wait(250);assert(moved);assert.equal(await pal(`p.props.find(q=>q.id==='${sel}').hostId`),t2.id,'moved to the dining table');
  // 9 · back to exploring: clicking a book opens it again, and the panel hides
  await evaluate(`[...document.querySelectorAll('.pe-toolbar button')].find(b=>b.textContent==='Explore').click()`);await wait(300);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.pe-side')).display`),'none');
  // 10 · a stop upstairs: the recall walk goes there
  await ed(`(()=>{e.goLevel(1);const f=PalaceModel.placeFurniture(e.palace,'sofa',2,2)||PalaceModel.placeFurniture(e.palace,'sofa',3,2.5)||PalaceModel.placeFurniture(e.palace,'sofa',2,6);PalaceModel.addStation(e.palace,f.id,{title:'up there',detail:'x'});e.goLevel(0);e.commit();return 1})()`);
  await ed(`e.startRecall()`);await wait(60);
  const origin=await ed(`e.ctl.state.fly&&e.ctl.state.fly.from`);assert(origin&&Math.abs(origin.x-2.5)<.01&&Math.abs(origin.z-.9)<.01,'the recall walk sets off from the front door');await wait(1100);
  for(let i=0;i<60&&!(await ed(`e.palace.stations[e.S.recall?.i]?.title==='up there'||e.S.recall.list[e.S.recall.i]?.title==='up there'`));i++){await evaluate(`[...document.querySelectorAll('.pe-recall button')].find(b=>b.textContent==='Show me')?.click()`);await wait(40);await evaluate(`[...document.querySelectorAll('.pe-recall button')].find(b=>b.textContent==='I remembered')?.click()`);await wait(1050)}
  assert.equal(await pal(`p.level`),1,'the recall walk climbs to the stop upstairs');assert.match(await text('.pe-recall'),/Stop \d+ of/);
  await ed(`e.S.recall=null`);
  // 11 · saved
  const saved=await evaluate(`JSON.parse(JSON.stringify(state.palaces[0]))`);assert.equal(saved.level,1);assert(saved.floors[0]&&saved.floors[0].furniture.length>20,'the other floor is kept');assert.deepEqual(await pal(`PalaceModel.problems(p)`),[]);
  console.log('PASS: building while walking — floors and staircases, climbing by clicking the stairs, dragging to look (the world follows the pointer), books that light up, and adding, selecting, moving and deleting furniture and things from inside the house.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
