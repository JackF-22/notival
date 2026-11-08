import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-annofree-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),20000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof RichEditor!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  const open=html=>evaluate(`(()=>{state.notes=[{id:'n',title:'Tab',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'a',type:'text',text:'x',html:${JSON.stringify(html)}}]}];active='n';render();setMode('write')})()`).then(()=>wait(250));
  // caret at `offset` inside the text of the element matching `selector`
  const caret=(selector,offset=0)=>evaluate(`(()=>{const node=document.querySelector('.rich-text '+${JSON.stringify(selector)});node.closest('.rich-text').focus();let text=node;while(text.firstChild)text=text.firstChild;const r=document.createRange();r.setStart(text,${offset});r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`).then(()=>wait(60));
  const codes={Tab:9,Backspace:8,Enter:13};
  const press=(key,shift=false)=>call('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code:key,windowsVirtualKeyCode:codes[key],modifiers:shift?8:0},sessionId)
    .then(()=>key==='Enter'?call('Input.dispatchKeyEvent',{type:'char',key,text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13},sessionId):null)
    .then(()=>call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:codes[key],modifiers:shift?8:0},sessionId)).then(()=>wait(100));
  const depths=()=>evaluate(`[...document.querySelector('.rich-text').children].map(line=>line.dataset.indent||'0').join(',')`);
  const saved=()=>evaluate(`current().blocks[0].html`);

  const mouse=(type,x,y)=>call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:type==='mousePressed'?1:0,clickCount:1},sessionId);
  const drag=async(from,to,steps=8)=>{await mouse('mouseMoved',...from);await wait(50);await mouse('mousePressed',...from);for(let i=1;i<=steps;i++){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:from[0]+(to[0]-from[0])*i/steps,y:from[1]+(to[1]-from[1])*i/steps,button:'left',buttons:1},sessionId);await wait(16)}await mouse('mouseReleased',...to);await wait(150)};
  const click=async(x,y)=>{await mouse('mouseMoved',x,y);await wait(40);await mouse('mousePressed',x,y);await mouse('mouseReleased',x,y);await wait(150)};
  const type=text=>call('Input.insertText',{text},sessionId).then(()=>wait(120));
  const key=async(k,code,vk,mods=0)=>{await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:k,code,windowsVirtualKeyCode:vk,modifiers:mods},sessionId);if(k==='Enter'&&!mods)await call('Input.dispatchKeyEvent',{type:'char',key:k,text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:vk,modifiers:mods},sessionId);await wait(120)};
  const shortcut=(code,k,shift=false)=>evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(k)},code:${JSON.stringify(code)},metaKey:true,shiftKey:${shift},bubbles:true,cancelable:true}))`).then(()=>wait(120));
  const resize=width=>call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId).then(()=>wait(300));
  const shots=process.env.ANNO_SHOTS;
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const rect=selector=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)return null;const b=n.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}})()`);
  const centreOf=r=>[r.left+r.width/2,r.top+r.height/2];
  const annotations=()=>evaluate(`JSON.stringify(current().annotations||[])`).then(JSON.parse);
  // Paragraphs by their opening words, so lines added above don't shift which one is meant.
  const opening=['TCP','The window','Congestion control'];
  const pick=n=>`[...document.querySelectorAll('.rich-text > *')].find(l=>l.textContent.startsWith(${JSON.stringify(opening[n]??'')}))`;
  const inkTop=n=>evaluate(`(()=>{const l=${pick(n)};const r=document.createRange();r.selectNodeContents(l);return r.getClientRects()[0].top})()`);
  const inkRight=n=>evaluate(`(()=>{const l=${pick(n)};const r=document.createRange();r.selectNodeContents(l);return Math.max(...[...r.getClientRects()].map(x=>x.right))})()`);
  const active=()=>evaluate(`document.activeElement.className`);

  await resize(1440);
  await open('<h2>Transport layer</h2><p>TCP retransmits lost segments.</p><p>The window shrinks when the receiver is slow.</p><p>Congestion control is separate from flow control.</p><ul><li>Slow start</li><li>Congestion avoidance</li></ul>');
  const block=await rect('#editor > .block');

  // ── A side note: click in the blank margin beside a paragraph and type ──
  const pY=(await inkTop(1))+10;
  await mouse('mouseMoved',block.right+70,pY);await wait(80);
  assert.equal(await evaluate(`document.querySelector('article').classList.contains('anno-margin')`),true,'the margin beside text shows a text cursor');
  await click(block.right+70,pY);
  assert.equal((await annotations()).length,1);
  assert.match(await active(),/anno-label/,'straight into typing');
  await type('Ask about this in office hours');
  await key('Enter','Enter',13);
  assert.match(await active(),/rich-text/,'Enter goes back to the note');
  let [bubble]=await annotations();
  assert.equal(bubble.kind,'bubble');assert.equal(bubble.text,'Ask about this in office hours');
  let b=await rect('.anno-bubble .anno-frame');
  assert.ok(b.left>(await inkRight(1))+8,'the note sits beside the paragraph, clear of its words');
  assert.ok(Math.abs(b.top-(pY-10))<6,'where it was clicked');
  assert.equal(await evaluate(`document.querySelectorAll('.anno-bubble .anno-leader path').length`),1,'a faint lead line joins it to the line');
  await shot('1-side-note');

  // A stray click in the margin leaves nothing behind.
  await click(block.right+60,(await inkTop(2))+8);
  assert.equal((await annotations()).length,2);
  await click(...centreOf(await rect('.rich-text > p:last-of-type')));
  assert.equal((await annotations()).length,1,'an empty side note goes away');

  // ── Text above: the note moves down with its paragraph ──
  const gap=b.top-(await inkTop(1));
  await evaluate(`(()=>{const h=document.querySelector('.rich-text h2');h.closest('.rich-text').focus();const r=document.createRange();r.setStart(h.firstChild,h.firstChild.length);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await key('Enter','Enter',13);
  await type('Added later: the transport layer sits between the application and the network, and this sentence is long enough to wrap onto a second line.');
  await wait(120);
  b=await rect('.anno-bubble .anno-frame');
  assert.ok(Math.abs((b.top-(await inkTop(1)))-gap)<3,'same place beside the same paragraph');

  // ── Drag it next to another paragraph: it pins itself there ──
  const before=(await annotations())[0].from;
  const target=(await inkTop(2))+4;
  await drag(centreOf(b),[b.left+b.width/2+20,target+b.height/2]);
  assert.notEqual((await annotations())[0].from,before,'pinned to the paragraph it was moved beside');
  await shortcut('KeyZ','z');
  assert.equal((await annotations())[0].from,before,'⌘Z moves it back');

  // ── Click the note later to edit it ──
  await click(...centreOf(await rect('.anno-bubble .anno-label')));
  assert.match(await active(),/anno-label/);
  await type(' (Tue 2pm)');await key('Escape','Escape',27);
  assert.equal((await annotations())[0].text,'Ask about this in office hours (Tue 2pm)');

  // ── A box in the top right of the page: ⌘⇧B, drag it out beside the heading, type a reminder with an equation ──
  // (With a heading, the outline takes the right margin at this width, so the box goes on the page itself.)
  await shortcut('KeyB','B',true);
  assert.equal(await evaluate(`document.body.classList.contains('anno-drawing')`),true);
  const top=(await rect('.rich-text h2')).top,right=(await rect('.rich-text')).right;
  await drag([right-200,top-6],[right-50,top+36]);
  assert.equal(await evaluate(`document.body.classList.contains('anno-drawing')`),false,'one box, then back to normal');
  let all=await annotations();
  assert.equal(all.length,2);const box=all[1];
  assert.equal(box.kind,'box');assert.ok(box.w>=140&&box.h>=32,'drawn at the size dragged: '+JSON.stringify(box));
  assert.match(await active(),/anno-label/);
  await type('Remember $E=mc^2$ units');await key('Enter','Enter',13);
  assert.equal((await annotations())[1].text,'Remember $E=mc^2$ units');
  assert.equal(await evaluate(`!!document.querySelector('.anno-box .anno-label .katex')`),true,'the equation is typeset');
  await shot('2-box');

  // Resize it by its corner.
  const corner=await evaluate(`(()=>{const c=document.querySelector('.anno-box .anno-corner').getBoundingClientRect();return [c.left+5,c.top+5]})()`);
  await mouse('mouseMoved',...centreOf(await rect('.anno-box .anno-frame')));await wait(50);
  await drag(corner,[corner[0]+30,corner[1]+20]);
  assert.ok((await annotations())[1].w>=box.w+25,'wider');

  // ── A plain drag across blank page (here, below the note) draws a box too ──
  const below=(await rect('#add-bar'))?.bottom||(await rect('#editor')).bottom;
  await drag([block.left+40,below+30],[block.left+220,below+80]);
  all=await annotations();assert.equal(all.length,3);assert.equal(all[2].kind,'box');
  await type('Two phases');await key('Enter','Enter',13);
  // A plain drag over text still selects text.
  const para=await rect('.rich-text > p:last-of-type');
  await drag([para.left+5,para.top+8],[para.left+120,para.top+8]);
  assert.ok((await evaluate(`getSelection().toString()`)).length>5,'dragging over text selects it');
  assert.equal((await annotations()).length,3);
  await shot('3-boxes');

  // ── ⌘' puts a side note beside the line the caret is on ──
  await evaluate(`(()=>{const p=${pick(2)};p.closest('.rich-text').focus();const r=document.createRange();r.setStart(p.firstChild,4);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await shortcut('Quote',"'");
  assert.equal((await annotations()).length,4);assert.match(await active(),/anno-label/);
  await type('Flow ≠ congestion');await key('Enter','Enter',13);

  // ── Narrow window: side notes without room fold into badges you can open ──
  await resize(860);
  const tucked=await evaluate(`[...document.querySelectorAll('.anno')].map(a=>a.className.replace('anno ','')).join('|')`);
  assert.match(tucked,/anno-bubble tucked/,'side notes fold away: '+tucked);
  await shot('4-narrow');
  await click(...centreOf(await rect('.anno-bubble.tucked .anno-badge')));
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.anno-bubble.tucked.open .anno-frame')).display`),'block');
  assert.match(await evaluate(`document.querySelector('.anno-bubble.open .anno-label').innerText`),/office hours|Flow/);
  await shot('5-narrow-open');
  await click(20,880);
  // Nothing that's shown sits on the words.
  const overlaps=await evaluate(`(()=>{const words=[...document.querySelectorAll('.rich-text > p, .rich-text li, .rich-text h2')].flatMap(l=>{const r=document.createRange();r.selectNodeContents(l);return [...r.getClientRects()]});
    return [...document.querySelectorAll('.anno-bubble:not(.tucked) .anno-frame')].filter(f=>{const b=f.getBoundingClientRect();return words.some(w=>w.right>b.left&&w.left<b.right&&w.bottom>b.top&&w.top<b.bottom)}).length})()`);
  assert.equal(overlaps,0,'no side note covers text when narrow');
  await resize(1440);
  assert.equal(await evaluate(`document.querySelectorAll('.anno.tucked').length`),0,'wide again: all back in place');

  // ── Reopen ──
  await evaluate(`(()=>{const saved=JSON.stringify(state.notes);state.notes=[];render();state.notes=JSON.parse(saved);active=state.notes[0].id;render();setMode('write')})()`);await wait(300);
  assert.equal(await evaluate(`document.querySelectorAll('.anno:not([hidden])').length`),4,'all four come back');
  assert.equal(await evaluate(`!!document.querySelector('.anno-box .katex')`),true);
  await shot('6-reopened');

  // ── Remove a box, undo ──
  await mouse('mouseMoved',...centreOf(await rect('.anno-box .anno-frame')));await wait(60);
  await evaluate(`document.querySelector('.anno-box .anno-remove').click()`);await wait(80);
  assert.equal((await annotations()).length,3);
  await shortcut('KeyZ','z');
  assert.equal((await annotations()).length,4);

  // ── "Mark up" in the format bar lists all three ──
  await evaluate(`document.querySelector('.format-markup').click()`);await wait(60);
  assert.equal(await evaluate(`[...document.querySelectorAll('.block-menu button')].map(b=>b.textContent.replace(/⌘.*/,'')).join('|')`),'}Brace the selected lines|“Side note beside this line|▢Draw a box');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await evaluate(`state.notes[0].nodes.length`),0,'nothing goes to the mind map');
  console.log('Side note and box tests passed');
}finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
