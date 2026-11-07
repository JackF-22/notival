import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-layout-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),15000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.LAYOUT_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof RichEditor!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`(()=>{
    const text=(id,t)=>({id,type:'text',text:t,html:'<p>'+t+'</p>'});
    state.notes=[{id:'n',title:'Layout',updated:Date.now(),pinned:false,nodes:[],blocks:[text('a','First cell'),text('b','Second cell'),text('c','Third cell'),text('d','Fourth cell')]}];
    active='n';render();setMode('write');
  })()`);
  await wait(200);
  const count=sel=>evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const side=index=>evaluate(`document.querySelectorAll('#editor .block')[${index}].querySelector('.beside').click()`);

  // Cells start stacked; the first has nothing above it to sit beside
  assert.equal(await count('.block-row'),0);
  assert.equal(await evaluate(`document.querySelectorAll('#editor .block')[0].querySelector('.beside').disabled`),true);

  // Put the second cell beside the first, then the third: one row of three, in order
  await side(1);await wait(80);
  assert.equal(await count('.block-row'),1);assert.equal(await count('.block-row > .block'),2);
  await side(2);await wait(80);
  assert.equal(await count('.block-row > .block'),3);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.block-row')).gridTemplateColumns.split(' ').length`),3);
  const tops=await evaluate(`[...document.querySelectorAll('.block-row > .block')].map(b=>Math.round(b.getBoundingClientRect().top)).join()`);
  assert.equal(new Set(tops.split(',')).size,1,'cells in a row share a top edge: '+tops);
  await shot('three-columns');

  // A fourth cell is refused: a row holds three
  await side(3);await wait(60);
  assert.equal(await count('.block-row > .block'),3);
  assert.equal(await evaluate(`current().blocks[3].row||null`),null);

  // Cell order in the note is unchanged, so anything reading blocks in order still works
  assert.equal(await evaluate(`current().blocks.map(b=>b.id).join('')`),'abcd');
  // Passage tools still pair each cell with its own note block
  assert.equal(await evaluate(`[...document.querySelectorAll('#editor .block')].map(w=>w.querySelector('.rich-text').textContent).join('|')`),'First cell|Second cell|Third cell|Fourth cell');

  // Stacking the middle cell out drops it below the row; the others keep sharing it
  await evaluate(`document.querySelectorAll('#editor .block')[1].querySelector('.beside').click()`);await wait(80);
  assert.equal(await evaluate(`current().blocks.map(b=>b.id+(b.row?'*':'')).join('')`),'a*c*bd');

  // Narrow windows stack the row
  await call('Emulation.setDeviceMetricsOverride',{width:600,height:900,deviceScaleFactor:1,mobile:false},sessionId);await wait(120);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.block-row')).gridTemplateColumns.split(' ').length`),1);
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);

  // A row with a single cell left dissolves
  const stacked=await evaluate(`(()=>{const n=current();n.blocks.forEach(b=>delete b.row);n.blocks[0].row='r';n.blocks[1].row='r';render();document.querySelectorAll('#editor .block')[1].querySelector('.beside').click();return document.querySelectorAll('.block-row').length+','+n.blocks.some(b=>b.row)})()`);
  assert.equal(stacked,'0,false');

  // Dragging: grab a cell by its grip and drop it on another cell's edge
  const mouse=(type,x,y)=>call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:1},sessionId);
  const grip=index=>evaluate(`(()=>{const r=document.querySelectorAll('#editor .block')[${index}].querySelector('.grip').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  const edge=(index,fx,fy)=>evaluate(`(()=>{const r=document.querySelectorAll('#editor .block')[${index}].getBoundingClientRect();return [r.left+r.width*${fx},r.top+r.height*${fy}]})()`);
  const dragCell=async(from,to,fx,fy,{release=true}={})=>{
    const [gx,gy]=await grip(from),[tx,ty]=await edge(to,fx,fy);
    await mouse('mousePressed',gx,gy);
    for(let i=1;i<=8;i++)await mouse('mouseMoved',gx+(tx-gx)*i/8,gy+(ty-gy)*i/8);
    await wait(60);
    if(release){await mouse('mouseReleased',tx,ty);await wait(120)}
    return [tx,ty];
  };
  const layout=()=>evaluate(`LayoutModel.rows(current().blocks).map(r=>r.cells.map(c=>c.id).join('+')).join(' / ')`);
  await evaluate(`(()=>{const n=current();n.blocks.forEach(b=>delete b.row);n.blocks=n.blocks.slice(0,4).sort((x,y)=>x.id<y.id?-1:1);render()})()`);await wait(120);
  assert.equal(await layout(),'a / b / c / d');
  // While dragging, an indicator shows where it will land and the cell being moved is dimmed
  await dragCell(2,0,0.95,0.5,{release:false});
  assert.equal(await evaluate(`!document.querySelector('.layout-drop').hidden`),true,'drop indicator visible');
  assert.equal(await evaluate(`document.querySelectorAll('#editor .block')[2].classList.contains('is-dragging')`),true);
  const bar=await evaluate(`(()=>{const m=document.querySelector('.layout-drop').getBoundingClientRect(),c=document.querySelectorAll('#editor .block')[0].getBoundingClientRect();return m.height>=c.height-1&&m.left>=c.right-1})()`);
  assert.equal(bar,true,'right-edge drop shows a vertical bar to the right of the target');
  await shot('dragging');
  await mouse('mouseReleased',0,0);await wait(150);
  assert.equal(await layout(),'a+c / b / d');
  assert.equal(await evaluate(`document.querySelector('.layout-ghost')||document.querySelector('.layout-drop')||document.body.classList.contains('cell-dragging')`),false,'drag state cleaned up');
  // Drop on the left edge of another row's cell joins that row, ahead of it
  await dragCell(3,0,0.04,0.5);
  assert.equal(await layout(),'d+a+c / b');
  // Full row refuses a fourth cell and says so
  await dragCell(3,0,0.95,0.5,{release:false});
  assert.equal(await evaluate(`document.querySelector('.layout-drop').classList.contains('is-refused')`),true);
  await mouse('mouseReleased',0,0);await wait(120);
  assert.equal(await layout(),'d+a+c / b');
  // Top/bottom edges stack outside the row
  await dragCell(3,0,0.5,0.9);
  assert.equal(await layout(),'d+a+c / b');   // dropping onto its own row's bottom: nothing to do beyond staying put
  await dragCell(3,0,0.5,0.1);                   // b above the row
  assert.equal(await layout(),'b / d+a+c');
  // Escape cancels
  await dragCell(0,2,0.5,0.9,{release:false});await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
  await mouse('mouseReleased',0,0);await wait(100);
  assert.equal(await layout(),'b / d+a+c');
  // Keyboard: the grip takes arrow keys and focus stays with the cell
  await evaluate(`document.querySelectorAll('#editor .block')[0].querySelector('.grip').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40},sessionId);await wait(150);
  assert.equal(await layout(),'d+a+c / b');
  assert.equal(await evaluate(`document.activeElement.classList.contains('grip')&&document.activeElement.closest('.block')===document.querySelectorAll('#editor .block')[3]`),true,'focus follows the moved cell');
  // Everything is saved with the note and reloads the same way
  assert.equal(await evaluate(`JSON.stringify(JSON.parse(JSON.stringify(current().blocks)).map(b=>b.row?1:0))`),'[1,1,1,0]');

  // Pictures: position buttons float the image, and the choice survives the sanitiser and a re-render
  await evaluate(`(()=>{const n=current();n.blocks.forEach(b=>delete b.row);n.blocks[0]={id:'a',type:'text',text:'Words that should flow beside the picture. '.repeat(12),html:'<p><img src="${pixel}" alt="dot" data-width="30"> '+${JSON.stringify('Words that should flow beside the picture. '.repeat(12))}+'</p>'};render()})()`);
  await wait(150);
  await evaluate(`(()=>{const img=document.querySelector('#editor img');img.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));const r=document.querySelector('.image-resizer');return !!r})()`);
  await evaluate(`document.querySelector('#editor img').dispatchEvent(new MouseEvent('mousemove',{bubbles:true}))`);
  await evaluate(`(()=>{const img=document.querySelector('#editor img');img.click();})()`);await wait(100);
  assert.equal(await evaluate(`!!document.querySelector('.image-align')`),true,'position bar exists');
  await evaluate(`document.querySelector('.image-align button[data-align=left]').click()`);await wait(100);
  assert.equal(await evaluate(`document.querySelector('#editor img').dataset.align`),'left');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#editor img')).float`),'left');
  assert.match(await evaluate(`current().blocks[0].html`),/data-align="left"/);
  await shot('picture-left');
  await evaluate(`render()`);await wait(100);
  assert.equal(await evaluate(`document.querySelector('#editor img').dataset.align`),'left');
  await evaluate(`document.querySelector('#editor img').dispatchEvent(new MouseEvent('mousemove',{bubbles:true}))`);await wait(60);
  await evaluate(`document.querySelector('.image-align button[data-align=right]').click()`);await wait(80);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#editor img')).float`),'right');
  await evaluate(`document.querySelector('.image-align button[data-align=""]').click()`);await wait(80);
  assert.equal(await evaluate(`document.querySelector('#editor img').hasAttribute('data-align')`),false);
  assert.equal(await evaluate(`RichEditor.cleanHTML('<p><img src="${pixel}" data-align="sideways"></p>').includes('data-align')`),false);

  console.log('PASS: cells sit side by side (max three, stack on narrow windows, order kept), pictures float beside text and keep their position.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
