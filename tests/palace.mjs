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
  const clickText=label=>evaluate(`[...document.querySelectorAll('.palace-editor button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)}))?.click()`);
  await evaluate(`HTMLCanvasElement.prototype.requestPointerLock=function(){};`);
  await evaluate(`localStorage.clear();(()=>{
    state.projects=[{id:'ru',name:'Russian',icon:'🇷🇺',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[],language:{code:'ru',name:'Russian',locale:'ru-RU'}}];
    state.notes=[];state.palaces=[];state.items=[];state.reviews={};
    state.vocab=[['привет','hello'],['спасибо','thank you'],['дом','house'],['есть','to eat'],['вода','water']].map(([t,m],i)=>({id:'w'+i,term:t,meaning:m,projectId:'ru',added:i}));
    active=null;window.marginSubjectTab('ru','palace')})()`);await wait(400);
  // 1 · the Palace tab, and making one from the starter house
  assert.equal(await evaluate(`!!document.querySelector('.student-tabs [data-feature=palace]')`),true,'every subject has a Memory palace tab');
  assert.match(await text('.palace-page'),/No palaces yet/);
  await evaluate(`[...document.querySelectorAll('.palace-new button')].find(b=>/New palace/.test(b.textContent)).click()`);await wait(900);
  assert.equal(await count('.palace-editor'),1,'the editor opens');
  assert.equal(await pal(`p.rooms.length`),5);assert.equal(await evaluate(`state.palaces.length`),1,'and the palace is kept');
  const painted=await evaluate(`(()=>{const c=marginPalace.editor().ctl.canvas,t=document.createElement('canvas');t.width=64;t.height=64;const x=t.getContext('2d');x.drawImage(c,0,0,64,64);const d=x.getImageData(0,0,64,64).data,seen=new Set();for(let i=0;i<d.length;i+=4)seen.add(d[i]+','+d[i+1]+','+d[i+2]);return seen.size})()`);
  assert.ok(painted>8,'the house is actually drawn: '+painted+' colours');
  // 2 · select a piece by clicking it; rotate, delete and undo
  const sofa=await pal(`p.furniture.find(f=>f.type==='sofa')`);
  await tap(sofa.x,sofa.z);
  assert.equal(await ed(`e.S.furniture`),sofa.id,'clicking the sofa selects it');assert.match(await text('.pe-title'),/Sofa/);
  const before=await pal(`p.furniture.find(f=>f.type==='sofa').rot`);
  await press('r');assert.notEqual(await pal(`p.furniture.find(f=>f.type==='sofa').rot`),before,'R turns it');
  assert.deepEqual(await pal(`(()=>{const f=p.furniture.find(g=>g.type==='sofa');return [f.rot%90]})()`),[0]);
  await press('Delete');assert.equal(await pal(`p.furniture.some(f=>f.type==='sofa')`),false,'Delete removes it');
  await clickText('↶');await wait(100);assert.equal(await pal(`p.furniture.some(f=>f.type==='sofa')`),true,'undo brings it back');
  await clickText('↶');await wait(100);assert.equal(await pal(`p.furniture.find(f=>f.type==='sofa').rot`),before,'a second undo turns it back');
  // 3 · drag a piece to somewhere free; onto another piece is refused
  const plant=await pal(`p.furniture.find(f=>f.type==='plant')`);
  await drag([plant.x,plant.z],[3.5,1.25]);
  const moved=await pal(`p.furniture.find(f=>f.id===${JSON.stringify(plant.id)})`);assert.deepEqual([moved.x,moved.z],[3.5,1.25],'dragging moves it, snapped to the grid');
  // an obstructed spot refuses it (the armchair is there)
  await drag([3.5,1.25],[1.25,1.5]);assert.deepEqual(await pal(`(()=>{const f=p.furniture.find(g=>g.id===${JSON.stringify(plant.id)});return [f.x,f.z]})()`),[3.5,1.25],'dropping it on another piece changes nothing');
  const lamp=await pal(`p.furniture.find(f=>f.type==='floor-lamp')`),tvUnit=await pal(`p.furniture.find(f=>f.type==='tv-unit')`);
  await drag([lamp.x,lamp.z],[tvUnit.x,tvUnit.z]);
  const lamp2=await pal(`p.furniture.find(f=>f.type==='floor-lamp')`);assert.deepEqual([lamp2.x,lamp2.z],[lamp.x,lamp.z],'dropping it on another piece changes nothing');
  // 4 · draw a new room next to the kitchen, and one on top of another that is refused
  await ed(`(e.ctl.plan.cx=7.5,e.ctl.plan.cz=4.5,e.ctl.plan.scale=36,e.ctl.redraw(),0)`);await wait(150);
  await clickText('Room');await wait(60);
  await drag([10.5,0.5],[14,4]);
  assert.equal(await pal(`p.rooms.length`),6,'a room is drawn by dragging');assert.deepEqual(await pal(`(()=>{const r=p.rooms.at(-1);return [r.x,r.z,r.w,r.d]})()`),[10.5,0.5,3.5,3.5]);
  await clickText('Room');await drag([2,2],[4,4]);assert.equal(await pal(`p.rooms.length`),6,'but not over an existing room');
  // 5 · doors and windows: click a wall to add one, click it again to take it away
  await clickText('Door');await wait(60);
  const wallBefore=await pal(`p.openings.length`);
  await tap(12,0.5);assert.equal(await pal(`p.openings.length`),wallBefore+1,'a door appears where you click the wall');
  await tap(12,0.5);assert.equal(await pal(`p.openings.length`),wallBefore,'and goes when you click it again');
  await clickText('Select');
  // 6 · adding furniture from the catalogue into the selected room
  const newRoom=await pal(`p.rooms.at(-1).id`);await tap(12,2);assert.equal(await ed(`e.S.room`),newRoom,'clicking a room selects it');
  await clickText('Build');const n0=await pal(`p.furniture.length`);
  await evaluate(`document.querySelector('.pe-item[data-type=desk]').click()`);await wait(120);
  assert.equal(await pal(`p.furniture.length`),n0+1,'a catalogue piece is added');assert.equal(await pal(`P_room(p.furniture.at(-1)).id`.replace('P_room','PalaceModel.roomOf.bind(null,p)')),newRoom,'into the selected room');
  // 7 · resizing a room by its edge
  await tap(12.5,3.2);assert.equal(await ed(`e.S.room`),newRoom);
  const w0=await pal(`p.rooms.at(-1).w`);await drag([14,2.5],[15.5,2.5]);assert.equal(await pal(`p.rooms.at(-1).w`),w0+1.5,'dragging an edge resizes the room');
  // 8 · something to remember, written by hand
  const sofa3=await pal(`p.furniture.find(f=>f.type==='sofa')`);await tap(sofa3.x,sofa3.z);
  await clickText('+ Write something');await wait(100);
  assert.equal(await pal(`p.stations.length`),1);
  await evaluate(`(()=>{const i=document.querySelector('.pe-station input');i.value='привет';i.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(80);
  assert.equal(await pal(`p.stations[0].title`),'привет','what you write is kept');
  // from the subject's own vocab, and filling the whole house in one go
  await clickText('Route');await clickText('Fill the house');await wait(150);
  await evaluate(`document.querySelector('.pe-dialog select').value='vocab';document.querySelector('.pe-dialog select').dispatchEvent(new Event('change'))`);await wait(60);
  assert.match(await text('.pe-dialog'),/5 will be placed/);
  await evaluate(`[...document.querySelectorAll('.pe-dialog button')].find(b=>b.textContent==='Place them').click()`);await wait(150);
  assert.equal(await pal(`p.stations.length`),6,'five vocab words were placed around the house');
  assert.deepEqual(await pal(`p.stations.slice(1).every(s=>s.link&&s.link.kind==='vocab')`),true);
  assert.equal(await count('.pe-route'),6);
  const rooms=await pal(`PalaceModel.route(p).slice(1).map(s=>PalaceModel.roomOf(p,p.furniture.find(f=>f.id===s.furnitureId))?.name)`);
  assert.equal(rooms[0],'Living room','placed in walking order, starting by the front door');
  // 9 · walking
  await clickText('Walk');await wait(300);
  assert.equal(await ed(`e.ctl.getMode()`),'walk');assert.equal(await evaluate(`document.querySelector('.palace-editor').dataset.mode`),'walk');
  const w1=await ed(`({x:e.ctl.walk.x,z:e.ctl.walk.z,yaw:e.ctl.walk.yaw})`);
  await evaluate(`(()=>{const e=marginPalace.editor();e.ctl.walk.x=2.5;e.ctl.walk.z=1.2;e.ctl.walk.yaw=0})()`);
  await press('w',{});await ed(`(e.ctl.setKey('w',true),0)`);await wait(900);await ed(`(e.ctl.setKey('w',false),0)`);
  const w2=await ed(`({x:e.ctl.walk.x,z:e.ctl.walk.z})`);assert.ok(w2.z>1.9,'W walks forward: '+JSON.stringify(w2));
  // walls stop you: keep walking into the south wall of the living room (a wall except at the door)
  await evaluate(`(()=>{const e=marginPalace.editor();e.ctl.walk.x=3.5;e.ctl.walk.z=4.3;e.ctl.walk.yaw=0;e.ctl.setKey('w',true)})()`);await wait(1500);await ed(`(e.ctl.setKey('w',false),0)`);
  const w3=await ed(`({z:e.ctl.walk.z})`);assert.ok(w3.z<4.8,'you cannot walk through a wall: '+w3.z);
  // click to go there
  await evaluate(`(()=>{const e=marginPalace.editor();e.ctl.walk.x=2.5;e.ctl.walk.z=1.2;e.ctl.walk.yaw=0;e.ctl.walk.pitch=-.5})()`);await wait(200);
  const cp=await evaluate(`(()=>{const c=marginPalace.editor().ctl.canvas.getBoundingClientRect();return {x:c.left+c.width/2,y:c.top+c.height*.85}})()`);
  await pm('mousePressed',cp);await pm('mouseReleased',cp,0);await wait(1200);
  const w4=await ed(`({x:e.ctl.walk.x,z:e.ctl.walk.z})`);assert.ok(Math.hypot(w4.x-2.5,w4.z-1.2)>.5,'clicking the floor walks there: '+JSON.stringify(w4));
  await press('Escape');assert.equal(await ed(`e.ctl.getMode()`),'plan','Esc goes back to the plan');
  // 10 · the recall walk
  await clickText('Recall walk');await wait(1500);
  assert.equal(await ed(`e.ctl.getMode()`),'walk');assert.match(await text('.pe-recall'),/Stop 1 of 6/);assert.match(await text('.pe-recall'),/What did you leave here/);
  assert.equal(await evaluate(`document.querySelector('.pe-recall .pe-answer')`),null,'the answer is hidden until you ask');
  await evaluate(`[...document.querySelectorAll('.pe-recall button')].find(b=>b.textContent==='Show me').click()`);await wait(100);
  assert.ok((await text('.pe-answer')).length>0,'then shown');
  for(let i=0;i<6;i++){
    if(!(await text('.pe-answer')))await evaluate(`[...document.querySelectorAll('.pe-recall button')].find(b=>b.textContent==='Show me')?.click()`);
    await evaluate(`[...document.querySelectorAll('.pe-recall button')].find(b=>b.textContent===${JSON.stringify(i===5?'Not yet':'I remembered')})?.click()`);await wait(80);
  }
  assert.match(await text('.pe-recall'),/5 of 6 remembered/);
  assert.deepEqual(await pal(`[p.walks[0].ok,p.walks[0].total]`),[5,6],'the walk is recorded');
  assert.equal(await pal(`p.stations.reduce((n,s)=>n+(s.stats?.ok||0),0)`),5,'and each stop knows how it went');
  await evaluate(`[...document.querySelectorAll('.pe-recall button')].find(b=>b.textContent==='Done').click()`);
  await press('Escape');assert.equal(await ed(`e.ctl.getMode()`),'plan');
  // 11 · it is all saved, and the tab shows it
  const saved=await evaluate(`JSON.parse(JSON.stringify(state.palaces[0]))`);assert.equal(saved.rooms.length,6);assert.equal(saved.stations.length,6);
  await evaluate(`marginPalace.editor().close()`);await wait(300);
  assert.equal(await count('.palace-editor'),0,'closing returns to the subject');
  assert.match(await text('.palace-card'),/6 rooms · 6 things to remember/);assert.match(await text('.palace-card'),/Last walked today/);
  console.log('PASS: memory palace — the Palace tab, the editor, selecting/moving/rotating/deleting furniture with undo, drawing and resizing rooms, doors and windows, catalogue, stations written or filled from vocab, walking with walls and click-to-move, the recall walk, and saving.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
