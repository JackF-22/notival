import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-anno-');
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

  const mouse=(type,x,y,modifiers=0)=>call('Input.dispatchMouseEvent',{type,x,y,modifiers,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:type==='mousePressed'?1:0,clickCount:1},sessionId);
  const drag=async(from,to,steps=8)=>{await mouse('mouseMoved',...from);await wait(60);await mouse('mousePressed',...from);for(let i=1;i<=steps;i++){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:from[0]+(to[0]-from[0])*i/steps,y:from[1]+(to[1]-from[1])*i/steps,button:'left',buttons:1},sessionId);await wait(16)}await mouse('mouseReleased',...to);await wait(150)};
  const click=async(x,y)=>{await mouse('mouseMoved',x,y);await wait(40);await mouse('mousePressed',x,y);await mouse('mouseReleased',x,y);await wait(120)};
  const type=text=>call('Input.insertText',{text},sessionId).then(()=>wait(120));
  const resize=width=>call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId).then(()=>wait(300));
  const shots=process.env.ANNO_SHOTS;
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const centre=selector=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('missing '+${JSON.stringify(selector)});const b=n.getBoundingClientRect();return [b.left+Math.min(b.width/2,80),b.top+b.height/2]})()`);
  const annotations=()=>evaluate(`JSON.stringify(current().annotations||[])`).then(JSON.parse);
  // Where the brace is drawn against where the grouped bullets' words are now (screen coordinates).
  const fit=(first=1,last=3)=>evaluate(`(()=>{const items=[...document.querySelectorAll('.rich-text li')],ink=n=>{const r=document.createRange();r.selectNodeContents(n);const rs=[...r.getClientRects()];return {top:Math.min(...rs.map(x=>x.top)),bottom:Math.max(...rs.map(x=>x.bottom)),right:Math.max(...rs.map(x=>x.right))}};
    const a=ink(items[${first-1}]),b=ink(items[${last-1}]),host=document.querySelector('.anno-brace:not(.anno-preview)');if(!host)return null;const h=host.getBoundingClientRect();
    return {topGap:Math.round(h.top-a.top),bottomGap:Math.round(b.bottom-h.bottom),rightOfText:Math.round(h.left-Math.max(...items.slice(${first-1},${last}).map(i=>ink(i).right))),tucked:host.classList.contains('tucked'),label:host.querySelector('.anno-label').innerText}})()`);
  const near=(value,target,slack=4)=>Math.abs(value-target)<=slack;

  await resize(1440);
  await open('<p>Request handling</p><ul><li>Parse the request body as JSON</li><li>Look up the user by the id field</li><li>Run the query string as given</li></ul><p>After the list comes the rest of the note.</p>');

  // ── 1. Hover a bullet: a quiet } appears in the margin. Drag it from the first bullet to the third. ──
  await mouse('mouseMoved',...await centre('.rich-text li'));await wait(120);
  assert.equal(await evaluate(`!document.querySelector('.anno-start').hidden`),true,'the } shows beside the line you are on');
  const startAt=await centre('.anno-start'),thirdY=(await centre('.rich-text li:nth-child(3)'))[1];
  await mouse('mouseMoved',...startAt);await wait(60);await mouse('mousePressed',...startAt);
  for(let i=1;i<=6;i++){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:startAt[0],y:startAt[1]+(thirdY-startAt[1])*i/6,button:'left',buttons:1},sessionId);await wait(20)}
  assert.equal(await evaluate(`document.querySelectorAll('#editor .anno-covered').length`),3,'the lines it will cover are shown while dragging');
  await shot('1-dragging');
  await mouse('mouseReleased',startAt[0],thirdY);await wait(150);
  assert.equal((await annotations()).length,1);
  assert.equal(await evaluate(`document.activeElement.classList.contains('anno-label')`),true,'straight into typing the label');
  await type('All three assume the input is trusted');
  await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await wait(150);
  assert.equal(await evaluate(`document.activeElement.classList.contains('rich-text')`),true,'Enter puts you back in the text');
  const [made]=await annotations();
  assert.equal(made.text,'All three assume the input is trusted');
  assert.equal(made.kind,'brace');
  let f=await fit();
  assert.ok(near(f.topGap,1)&&near(f.bottomGap,1),'the brace spans exactly the three bullets: '+JSON.stringify(f));
  assert.ok(f.rightOfText>=8&&f.rightOfText<=20,'it sits just past the end of the longest bullet: '+JSON.stringify(f));
  assert.equal(f.tucked,false);
  await shot('2-grouped');
  // Back to typing exactly where you were.
  await type('!');
  assert.equal((await annotations())[0].text,'All three assume the input is trusted','typing goes to the note, not the label');
  await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);await wait(80);

  // ── 2. Insert text above the bullets: the brace moves down with them. ──
  const before=await evaluate(`document.querySelector('.anno-brace').getBoundingClientRect().top`);
  await evaluate(`(()=>{const p=document.querySelector('.rich-text p');p.closest('.rich-text').focus();const r=document.createRange();r.setStart(p.firstChild,p.firstChild.length);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await call('Input.dispatchKeyEvent',{type:'char',key:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await wait(80);
  await type('Every handler below reads from the network, so nothing it receives can be taken at face value. This paragraph was added after the brace was drawn, and it wraps onto more than one line.');
  await wait(150);
  f=await fit();
  assert.ok(near(f.topGap,1)&&near(f.bottomGap,1),'still exactly the same three bullets after text above: '+JSON.stringify(f));
  assert.ok(await evaluate(`document.querySelector('.anno-brace').getBoundingClientRect().top`)>before+40,'and it moved down with them');
  await shot('3-text-added-above');

  // A bullet in the group gets longer and wraps: the brace keeps to the text and covers it all.
  await evaluate(`(()=>{const li=document.querySelectorAll('.rich-text li')[1];li.closest('.rich-text').focus();const r=document.createRange();r.setStart(li.firstChild,li.firstChild.length);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await type(', which comes straight from the URL the client sent and is never checked against the session before the lookup runs');
  await wait(150);f=await fit();
  assert.ok(near(f.topGap,1)&&near(f.bottomGap,1),'covers the wrapped bullet too: '+JSON.stringify(f));
  await shot('4-bullet-wraps');

  // ── 3. Narrow the window: no room beside the text, so the label folds into a badge by the brace. ──
  await resize(860);
  f=await fit();
  assert.ok(near(f.topGap,1)&&near(f.bottomGap,1),'narrow: still the same bullets: '+JSON.stringify(f));
  assert.equal(f.tucked,true,'the label is tucked away');
  assert.equal(await evaluate(`document.querySelector('.anno-badge').textContent`),'1');
  await shot('5-narrow');
  await click(...await centre('.anno-badge'));
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.anno-label')).display`),'block','the badge opens the label beside the passage');
  assert.equal(await evaluate(`document.querySelector('.anno-label').innerText`),'All three assume the input is trusted');
  await shot('6-narrow-open');
  await click(150,850);
  await resize(1440);
  f=await fit();assert.equal(f.tucked,false,'wide again: the label is back beside the brace');

  // ── 4. Reopen the note: everything comes back from what was saved. ──
  await evaluate(`(()=>{const saved=JSON.stringify(state.notes);state.notes=[];render();state.notes=JSON.parse(saved);active=state.notes[0].id;render();setMode('write')})()`);await wait(300);
  f=await fit();
  assert.ok(f&&near(f.topGap,1)&&near(f.bottomGap,1),'reopened: same place: '+JSON.stringify(f));
  assert.equal(f.label,'All three assume the input is trusted');
  await shot('7-reopened');

  // ── Moving it, and undo ──
  const braceAt=await evaluate(`(()=>{const b=document.querySelector('.anno-brace').getBoundingClientRect();return [b.left+6,b.top+b.height/2]})()`);
  await drag(braceAt,[braceAt[0]+60,braceAt[1]+10]);
  assert.ok((await annotations())[0].dx>=50,'dragging moves it along the margin');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',metaKey:true,bubbles:true,cancelable:true}))`);await wait(80);
  assert.equal((await annotations())[0].dx,0,'⌘Z puts it back');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}))`);await wait(80);
  assert.ok((await annotations())[0].dx>=50,'⌘⇧Z moves it again');
  // Remove with the ×, then undo.
  await mouse('mouseMoved',...braceAt);await wait(60);
  await evaluate(`document.querySelector('.anno-remove').click()`);await wait(80);
  assert.equal((await annotations()).length,0);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',metaKey:true,bubbles:true,cancelable:true}))`);await wait(120);
  assert.equal((await annotations()).length,1,'undo brings it back');
  assert.equal((await fit()).label,'All three assume the input is trusted');

  // Dragged far out, there's no room left for the label beside it, so it tucks into the badge; drag it back.
  assert.equal((await fit()).tucked,true);
  const outAt=await evaluate(`(()=>{const b=document.querySelector('.anno-brace').getBoundingClientRect();return [b.left+6,b.top+b.height/2]})()`);
  await drag(outAt,[outAt[0]-70,outAt[1]]);
  assert.equal((await fit()).tucked,false);

  // ── Editing the label later: click it, change it ──
  await click(...await centre('.anno-label'));
  assert.equal(await evaluate(`document.activeElement.classList.contains('anno-label')`),true);
  await type(' (it is not)');
  await click(...await centre('.rich-text p:last-of-type'));
  assert.equal((await annotations())[0].text,'All three assume the input is trusted (it is not)');

  // ── Ordinary clicks and selections in the text still just edit ──
  await click(...await centre('.rich-text li:nth-child(3)'));
  assert.equal(await evaluate(`document.activeElement.classList.contains('rich-text')`),true);
  assert.equal((await annotations()).length,1,'a click in the text makes nothing');

  // ── Keyboard: select across lines, ⌘}; Esc on an empty label backs out ──
  await evaluate(`(()=>{const items=document.querySelectorAll('.rich-text li');items[0].closest('.rich-text').focus();const r=document.createRange();r.setStart(items[1].firstChild,3);r.setEnd(items[2].firstChild,5);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'}',code:'BracketRight',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}))`);await wait(120);
  assert.equal((await annotations()).length,2);
  assert.equal(await evaluate(`document.activeElement.classList.contains('anno-label')`),true);
  await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await wait(100);
  assert.equal((await annotations()).length,1,'Esc on a new, empty label cancels it');
  assert.equal(await evaluate(`document.activeElement.classList.contains('rich-text')`),true);

  // ── Enter at the very start of the first grouped bullet adds a bullet above; the brace stays on the words ──
  await evaluate(`(()=>{const li=document.querySelector('.rich-text li');li.closest('.rich-text').focus();const r=document.createRange();r.setStart(li.firstChild,0);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await call('Input.dispatchKeyEvent',{type:'char',key:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await wait(150);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text li').length`),4);
  f=await fit(2,4);
  assert.ok(near(f.topGap,1)&&near(f.bottomGap,1),'the brace still starts at "Parse the request body": '+JSON.stringify(f));
  assert.equal(await evaluate(`state.notes[0].nodes.length`),0,'nothing goes to the mind map');
  // The × stays put as the pointer travels to it
  await mouse('mouseMoved',5,5);await wait(200);
  const braceNow=await evaluate(`(()=>{const r=document.querySelector('.anno-ink').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  await mouse('mouseMoved',...braceNow);await wait(60);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.anno-remove')).visibility`),'visible','hovering the brace shows the ×');
  // walk the pointer from the brace out to the ×, and pause in the gap on the way: it stays visible and a real click removes it
  const xAt=await evaluate(`(()=>{const r=document.querySelector('.anno-remove').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  for(let i=1;i<=6;i++){await mouse('mouseMoved',braceNow[0]+(xAt[0]-braceNow[0])*i/6,braceNow[1]+(xAt[1]-braceNow[1])*i/6);await wait(70);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.anno-remove')).visibility`),'visible','the × stays while the pointer travels to it (step '+i+')')}
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.anno-remove')).visibility`),'visible','and under the pointer');
  await mouse('mousePressed',...xAt);await mouse('mouseReleased',...xAt);await wait(120);
  assert.equal((await annotations()).length,0,'clicking the × removes the brace');
  console.log('Annotation tests passed');
}finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
