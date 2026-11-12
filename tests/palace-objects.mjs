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
  await evaluate(`HTMLCanvasElement.prototype.requestPointerLock=function(){};`);
  await evaluate(`localStorage.clear();(()=>{state.projects=[{id:'ru',name:'Russian',icon:'x',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[]}];state.notes=[{id:'n1',projectId:'ru',title:'Greetings',updated:1,pinned:false,blocks:[{id:'b1',type:'text',text:'Hello is privet.\\n\\nThank you is spasibo.'}]}];state.vocab=[['привет','hello'],['спасибо','thank you']].map(([t,m],i)=>({id:'w'+i,term:t,meaning:m,projectId:'ru',added:i}));state.palaces=[];active=null;const p=marginPalace.create('ru',true);const sh=p.furniture.find(f=>f.type==='bookshelf');for(const level of [0,1])for(let k=0;k<6;k++)PalaceModel.placeProp(p,'book',sh.id,{surface:level,...PalaceModel.bookLike(k+level*6)});marginPalace.open(p.id)})()`);await wait(900);
  assert.equal(await count('.palace-editor'),1);
  const kinds=await evaluate(`Object.keys(PalaceModel.PROPS).length`);
  // 1 · the catalogue offers things to put on furniture
  assert.equal(await count('.pe-item[data-prop]'),kinds,'every kind of thing is offered');
  await evaluate(`document.querySelector('.pe-item[data-prop="mug"]').click()`);await wait(100);
  assert.equal(await count('.pe-title'),0,'nothing happens without a piece of furniture selected');
  // 2 · select the desk, then add a mug from the catalogue: it stands on the desk and is selected
  const deskId=await pal(`p.furniture.find(f=>f.type==='desk').id`);const before=await pal(`p.props.length`);
  await ed(`e.select('furniture','${deskId}')`);await ed(`(e.S.tab='build',e.commit(),0)`);
  await evaluate(`document.querySelector('.pe-item[data-prop="succulent"]').click()`);await wait(150);
  assert.equal(await pal(`p.props.length`),before+1);assert.equal(await text('.pe-title'),'Small plant');
  const plantId=await pal(`p.props.at(-1).id`);assert.equal(await ed(`e.S.prop`),plantId);
  // 3 · give it a meaning, and put it on the route
  await evaluate(`(()=>{const i=document.querySelector('.pe-input[aria-label="What it stands for"]');i.value='Cactus = patience';i.dispatchEvent(new Event('change'))})()`);await wait(100);
  assert.equal(await pal(`p.props.find(q=>q.id==='${plantId}').title`),'Cactus = patience');
  await evaluate(`(()=>{const c=document.querySelector('.pe-check input');c.checked=true;c.dispatchEvent(new Event('change'))})()`);await wait(150);
  assert.equal(await pal(`p.stations.filter(s=>s.propId==='${plantId}').length`),1,'on the route');
  assert.equal(await pal(`p.stations.find(s=>s.propId==='${plantId}').title`),'Cactus = patience');
  assert.match(await text('.pe-check'),/stop 1/);
  assert.match(await text('.pe-tabs'),/Route · 1/);
  // 4 · undo takes the stop away, and redo brings it back
  await ed(`e.history.undo()`);await ed(`(e.ctl.rebuild(),0)`);assert.equal(await pal(`p.stations.length`),0);await ed(`e.history.redo()`);assert.equal(await pal(`p.stations.length`),1);
  // 5 · a book on a desk lies flat; levels on a shelf
  const shelfId=await pal(`p.furniture.find(f=>f.type==='bookshelf').id`);await ed(`e.select('furniture','${shelfId}')`);
  const chips=await count('.pe-chip');assert(chips>=7,'the shelf lists what is on it: '+chips);
  await evaluate(`document.querySelector('.pe-chip').click()`);await wait(100);
  const firstBook=await ed(`e.S.prop`);assert.match(await text('.pe-title'),/Book/);
  const level=await pal(`p.props.find(q=>q.id==='${firstBook}').surface`);
  await evaluate(`[...document.querySelectorAll('.pe-actions button')].find(b=>b.textContent==='Up a level').click()`);await wait(100);
  assert.equal(await pal(`p.props.find(q=>q.id==='${firstBook}').surface`),level+1,'up a level');
  await evaluate(`[...document.querySelectorAll('.pe-actions button')].find(b=>b.textContent==='Down a level').click()`);await wait(100);
  assert.equal(await pal(`p.props.find(q=>q.id==='${firstBook}').surface`),level,'and back down');
  // 6 · plan view: with a shelf selected a click on a book selects the book; dragging it to a table moves it there
  const tableId=await pal(`p.furniture.find(f=>f.type==='coffee-table').id`);
  await ed(`e.setMode('plan')`);await ed(`e.select('furniture','${shelfId}')`);
  const bw=await pal(`PalaceModel.propWorld(p,p.props.find(q=>q.id==='${firstBook}'))`);const tbl=await pal(`p.furniture.find(f=>f.id==='${tableId}')`);
  await ed(`e.ctl.frame()`);await wait(200);
  await drag([bw.x,bw.z],[tbl.x,tbl.z]);await wait(200);
  assert.equal(await pal(`p.props.find(q=>q.id==='${firstBook}').hostId`),tableId,'dragged onto the coffee table');
  await ed(`e.history.undo()`);await ed(`(e.ctl.rebuild(),0)`);assert.equal(await pal(`p.props.find(q=>q.id==='${firstBook}').hostId`),shelfId,'undo puts it back on the shelf');
  // 7 · drag one from the catalogue onto the desk
  await ed(`(e.S.tab='build',e.select(null),0)`);await ed(`e.S.tab='build';e.commit();0`);
  const desk=await pal(`p.furniture.find(f=>f.id==='${deskId}')`);const dp=await screen(desk.x+.3,desk.z);const count0=await pal(`p.props.length`);
  await evaluate(`(()=>{const dt=new DataTransfer();dt.setData('text/palace-prop','candle');const c=marginPalace.editor().ctl.canvas;c.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,clientX:${dp.x},clientY:${dp.y},bubbles:true,cancelable:true}))})()`);await wait(150);
  assert.equal(await pal(`p.props.length`),count0+1,'a candle dropped on the desk');assert.equal(await pal(`p.props.at(-1).type`),'candle');
  await evaluate(`(()=>{const dt=new DataTransfer();dt.setData('text/palace-prop','candle');const c=marginPalace.editor().ctl.canvas;c.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,clientX:5,clientY:400,bubbles:true,cancelable:true}))})()`);await wait(100);
  assert.equal(await pal(`p.props.length`),count0+1,'dropped on nothing: refused');
  // 8 · fill a notebook from a note, and from vocab
  const nb=await pal(`p.props.find(q=>q.type==='notebook').id`);await ed(`e.selectProp('${nb}')`);
  await evaluate(`[...document.querySelectorAll('.pe-picker summary')].find(s=>/from a note/i.test(s.textContent)).click()`);await wait(80);
  await evaluate(`document.querySelector('.pe-pickitem').click()`);await wait(150);
  assert.match(await pal(`p.props.find(q=>q.id==='${nb}').pages.map(g=>g.text).join(' ')`),/Hello is privet/);assert.equal(await pal(`p.props.find(q=>q.id==='${nb}').title`),'My notebook','a title already there stays');
  await evaluate(`[...document.querySelectorAll('.pe-picker summary')].find(s=>/from my vocab/i.test(s.textContent)).click()`);await wait(80);
  await evaluate(`[...document.querySelectorAll('.pe-pickitem')].find(b=>/All 2 words/.test(b.textContent)).click()`);await wait(150);
  assert.match(await pal(`p.props.find(q=>q.id==='${nb}').pages[0].text`),/привет — hello\nспасибо — thank you/);
  // 9 · walking: click the guide book and it comes off the shelf
  await ed(`e.setMode('walk')`);
  const guide=await pal(`p.props.find(q=>q.pages.length===4).id`);
  const view=await ed(`(()=>{const w=PalaceModel.propWorld(e.palace,e.palace.props.find(q=>q.id==='${guide}'));const v=PalaceModel.viewFrom(e.palace,w.host),c=e.ctl;c.walk.x=v.x;c.walk.z=v.z;c.walk.yaw=v.yaw;c.walk.pitch=-.05;c.redraw();return 1})()`);await wait(400);
  const at=await evaluate(`(()=>{const e=marginPalace.editor(),q=e.palace.props.find(q=>q.id==='${guide}'),w=PalaceModel.propWorld(e.palace,q),s=e.ctl.toScreen(w.x,w.y+w.h/2,w.z),r=e.ctl.canvas.getBoundingClientRect();return {x:s.x+r.left,y:s.y+r.top}})()`);
  await pm('mousePressed',at);await pm('mouseReleased',at,0);await wait(1000);
  assert.equal(await count('.pb-scrim'),1,'the book opens');assert.equal(await ed(`e.ctl.state.hidden`),guide,'it has left the shelf');
  assert.equal(await text('.pb-counter'),'Cover');assert.match(await text('.pb-cover-title'),/How this house works/);
  await press('ArrowRight');await wait(900);assert.match(await text('.pb-counter'),/Pages 1–2 of 4/);assert.match(await text('.pb-left .pb-text'),/Welcome/);assert.match(await text('.pb-right .pb-text'),/Put each thing/);
  await evaluate(`document.querySelector('.pb-next').click()`);await wait(900);assert.match(await text('.pb-counter'),/Pages 3–4 of 4/);assert.match(await text('.pb-right .pb-text'),/The odder the picture/);
  assert.equal(await evaluate(`document.querySelector('.pb-next').disabled`),true,'the end of the book');
  await press('ArrowLeft');await wait(900);assert.match(await text('.pb-counter'),/Pages 1–2 of 4/,'and back');
  await evaluate(`document.querySelector('.pb-right').click()`);await wait(900);assert.match(await text('.pb-counter'),/Pages 3–4/,'a click on the right page turns it');
  await press('Escape');await wait(800);
  assert.equal(await count('.pb-scrim'),0,'put back');assert.equal(await ed(`e.ctl.state.hidden`),null,'it is on the shelf again');assert.equal(await count('.palace-editor'),1,'Escape closed the book, not the palace');
  // 10 · something that cannot be read shows what it stands for
  const mug=await pal(`p.props.find(q=>q.type==='mug').id`);
  await ed(`(()=>{const q=e.palace.props.find(q=>q.id==='${mug}');q.title='Mug of tea';q.detail='чай';e.commit();return 1})()`);
  await ed(`(()=>{const w=PalaceModel.propWorld(e.palace,e.palace.props.find(q=>q.id==='${mug}')),v=PalaceModel.viewFrom(e.palace,w.host),c=e.ctl;c.walk.x=v.x;c.walk.z=v.z;c.walk.yaw=v.yaw;c.walk.pitch=-.5;c.redraw();return 1})()`);await wait(400);
  const mp=await evaluate(`(()=>{const e=marginPalace.editor(),q=e.palace.props.find(q=>q.id==='${mug}'),w=PalaceModel.propWorld(e.palace,q),s=e.ctl.toScreen(w.x,w.y+w.h/2,w.z),r=e.ctl.canvas.getBoundingClientRect();return {x:s.x+r.left,y:s.y+r.top}})()`);
  await pm('mousePressed',mp);await pm('mouseReleased',mp,0);await wait(250);
  assert.equal(await evaluate(`document.querySelector('.pe-card').hidden`),false);assert.match(await text('.pe-card'),/Mug of tea/);assert.match(await text('.pe-card'),/чай/);
  // 11 · the recall walk stops at a thing, and offers to open it
  await ed(`(()=>{const g=e.palace.props.find(q=>q.id==='${guide}');PalaceModel.toggleRoute(e.palace,g.id);e.commit();return 1})()`);
  await ed(`e.startRecall()`);await wait(1300);
  const list=await ed(`e.S.recall.list.map(s=>!!s.propId)`);assert(list.includes(true));
  for(let i=0;i<10&&!(await ed(`e.S.recall.list[e.S.recall.i]?.propId===('${guide}')`));i++){await evaluate(`[...document.querySelectorAll('.pe-recall button')].find(b=>b.textContent==='Show me')?.click()`);await wait(100);await evaluate(`[...document.querySelectorAll('.pe-recall button')].find(b=>b.textContent==='I remembered')?.click()`);await wait(1100)}
  await evaluate(`[...document.querySelectorAll('.pe-recall button')].find(b=>b.textContent==='Show me').click()`);await wait(100);
  assert.match(await text('.pe-recall'),/How this house works/);
  await evaluate(`[...document.querySelectorAll('.pe-recall button')].find(b=>b.textContent==='Open it').click()`);await wait(1000);assert.equal(await count('.pb-scrim'),1,'the recall walk opens the book');
  await press('Escape');await wait(800);await ed(`(e.S.recall=null,0)`);
  // 12 · deleting a prop that is a stop asks twice; the stop goes with it
  await evaluate(`document.querySelector('.pe-recall')&&(document.querySelector('.pe-recall').hidden=true)`);await ed(`e.setMode('plan')`);await ed(`e.selectProp('${guide}')`);
  await ed(`e.deleteSelected()`);assert.equal(await pal(`p.props.some(q=>q.id==='${guide}')`),true,'asked first');
  await ed(`e.deleteSelected()`);assert.equal(await pal(`p.props.some(q=>q.id==='${guide}')`),false);assert.equal(await pal(`p.stations.some(s=>s.propId==='${guide}')`),false,'its stop is gone');
  // 12b · LaTeX in anything you write: previews while typing, typeset in cards, pages and the route
  await ed(`e.setMode('plan')`);
  const mugId=await pal(`p.props.find(q=>q.type==='mug').id`);await ed(`e.selectProp('${mugId}')`);
  await evaluate(`(()=>{const i=document.querySelector('.pe-input[aria-label="What it stands for"]');i.value='Area is $\\pi r^2$';i.dispatchEvent(new Event('input'));i.dispatchEvent(new Event('change'))})()`);await wait(150);
  assert(await count('.pe-math-preview:not([hidden]) .katex')>=1,'the equation is drawn under the field while you type');
  assert(await count('.pe-route .katex')===0);
  const nbId=await pal(`p.props.find(q=>q.type==='notebook').id`);await ed(`(()=>{const q=e.palace.props.find(g=>g.id==='${nbId}');q.pages=[{text:'Energy: $$E=mc^2$$ and so on'},{text:'plain'}];e.commit();return 1})()`);
  await ed(`e.readProp(e.palace.props.find(g=>g.id==='${nbId}'),false)`);await wait(900);await press('ArrowRight');await wait(900);
  assert(await count('.pb-text .katex')>=1,'a page of a book shows typeset equations');assert.match(await text('.pb-left .pb-text'),/Energy/);
  await press('Escape');await wait(800);
  await ed(`e.setMode('walk')`);await wait(300);
  const mw=await pal(`PalaceModel.propWorld(p,p.props.find(q=>q.id==='${mugId}'))`);
  await ed(`(()=>{const w=${JSON.stringify(mw)},v=PalaceModel.viewFrom(e.palace,w.host),c=e.ctl;c.walk.x=v.x;c.walk.z=v.z;c.walk.yaw=v.yaw;c.walk.pitch=-.5;c.redraw();return 1})()`);await wait(400);
  const mpt=await toScreen2(mw);await pm('mousePressed',mpt);await pm('mouseReleased',mpt,0);await wait(250);
  assert(await count('.pe-card .katex')>=1,'the card shows the equation typeset');
  // 12c · writing in a book: pages with big live equations, snippets, more pages, a title on the cover
  await ed(`e.setMode('plan')`);await wait(200);
  const nb2=await pal(`p.props.find(q=>q.type==='notebook').id`);await ed(`(()=>{const q=e.palace.props.find(g=>g.id==='${nb2}');q.pages=[{text:''}];e.commit();e.selectProp('${nb2}');return 1})()`);
  assert.match(await text('.pe-panel'),/Write in it/);
  await evaluate(`[...document.querySelectorAll('.pe-actions button')].find(x=>/Write in it/.test(x.textContent)).click()`);await wait(1300);
  assert.equal(await count('.pb-scrim.is-editing'),1,'the book opens ready for writing');assert.equal(await count('.pb-input'),1,'a page to write on');
  await evaluate(`(()=>{const ta=document.querySelector('.pb-input');ta.focus();ta.value='Area $A=\\\\pi r^2$';ta.dispatchEvent(new Event('input'))})()`);await wait(100);
  assert(await count('.pb-live .katex')>=1,'the equation is drawn big under what you type');
  const size=await evaluate(`parseFloat(getComputedStyle(document.querySelector('.pb-live .katex')).fontSize)`);assert(size>=20,'and it is large enough to read: '+size+'px');
  await evaluate(`(()=>{const b=[...document.querySelectorAll('.pb-snip')].find(x=>x.textContent==='a⁄b');b.click()})()`);await wait(100);
  assert.match(await evaluate(`document.querySelector('.pb-input').value`),/\$\\frac\{a\}\{b\}\$/,'a snippet puts an equation at the cursor');
  await wait(700);assert.match(await pal(`p.props.find(q=>q.id==='${nb2}').pages[0].text`),/frac/,'what you write is saved as you go');
  await evaluate(`[...document.querySelectorAll('.pb-tool')].find(x=>x.textContent==='+ Page').click()`);await wait(1400);
  assert.equal(await pal(`p.props.find(q=>q.id==='${nb2}').pages.length`),2,'a page is added');assert(await count('.pb-input')>=1);
  await evaluate(`(()=>{const ta=document.querySelector('.pb-right .pb-input')||document.querySelector('.pb-input');ta.value='Second page';ta.dispatchEvent(new Event('input'))})()`);await wait(600);
  assert.equal(await pal(`p.props.find(q=>q.id==='${nb2}').pages[1].text`),'Second page');
  await evaluate(`document.querySelector('.pb-turn.pb-prev').click()`);await wait(900);await evaluate(`document.querySelector('.pb-turn.pb-prev').click()`);await wait(900);
  assert.equal(await text('.pb-counter'),'Cover');
  await evaluate(`(()=>{const t=document.querySelector('.pb-cover-input.pb-cover-title');t.value='Maths $\\\\pi$';t.dispatchEvent(new Event('input'))})()`);await wait(700);
  assert.equal(await pal(`p.props.find(q=>q.id==='${nb2}').title`),'Maths $\\pi$','the title of the book can be written on its cover');
  await press('Escape');await wait(800);assert.equal(await count('.pb-scrim'),0);
  assert(await ed(`e.ctl.labelCount()`)>=1,'a titled book has its title drawn on its binding');
  // 13 · it is all saved
  const saved=await evaluate(`JSON.parse(JSON.stringify(state.palaces[0]))`);assert(saved.props.length>15);assert(saved.props.every(q=>q.hostId&&saved.furniture.some(f=>f.id===q.hostId)),'every thing stands on something');
  assert.deepEqual(await pal(`PalaceModel.problems(p)`),[]);
  console.log('PASS: palace objects — a catalogue of small things, placed on furniture by click or drag, given a meaning and a place on the route, moved between shelves and tables, filled with pages from notes and vocab, taken off the shelf in the walk-through and read page by page, and offered during the recall walk.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
