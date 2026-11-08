import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-linelinks-');
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

  const mouse=(type,x,y)=>call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1},sessionId);
  const click=async(x,y)=>{await mouse('mouseMoved',x,y);await wait(40);await mouse('mousePressed',x,y);await mouse('mouseReleased',x,y);await wait(120)};
  const centre=selector=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('missing '+${JSON.stringify(selector)});const b=n.getBoundingClientRect();return [b.left+Math.min(b.width/2,60),b.top+b.height/2]})()`);
  const shots=process.env.LINK_SHOTS;
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const filler=Array.from({length:6},(_,i)=>`<p>Filler paragraph ${i+1} about the derivation.</p>`).join('');
  await open('<h2>Energy</h2><div class="equation display-equation" data-equation="E=mc^2" contenteditable="false">E=mc^2</div>'+filler+'<p>This is why mass and energy trade off.</p><ul><li>Bullet one</li></ul>');
  const links=()=>evaluate(`current().lineLinks?.length||0`);
  const markers=()=>evaluate(`document.querySelectorAll('.line-link-marker').length`);

  // From the line's handle menu: "Link to another line…", then click the equation far above.
  const [lx,ly]=await centre('.rich-text p:nth-last-of-type(1)');
  await mouse('mouseMoved',lx,ly);await wait(150);
  assert.equal(await evaluate(`!document.querySelector('#block-handle').hidden`),true,'the line handle shows');
  await click(...await centre('#block-handle'));
  assert.ok(await evaluate(`[...document.querySelectorAll('.block-menu button')].some(b=>b.textContent.includes('Link to another line'))`),'the menu offers linking');
  await evaluate(`[...document.querySelectorAll('.block-menu button')].find(b=>b.textContent.includes('Link to another line')).click()`);await wait(80);
  assert.equal(await evaluate(`document.body.classList.contains('linking-lines')`),true);
  assert.equal(await evaluate(`!document.querySelector('.line-link-banner').hidden`),true,'a banner says what to do');
  await mouse('mouseMoved',...await centre('.rich-text .display-equation'));await wait(80);
  assert.equal(await evaluate(`document.querySelector('.rich-text .display-equation').classList.contains('line-link-candidate')`),true,'hovering shows what would be linked');
  await shot('picking');
  await click(...await centre('.rich-text .display-equation'));
  assert.equal(await links(),1);
  assert.equal(await evaluate(`document.querySelector('.rich-text .display-equation').classList.contains('editing')`),false,'clicking to link does not open the equation');
  assert.equal(await evaluate(`document.body.classList.contains('linking-lines')`),false);
  assert.equal(await evaluate(`state.notes[0].nodes.length`),0,'nothing is added to the mind map');
  await wait(100);
  assert.equal(await markers(),2,'a marker beside each end');
  const html=await evaluate(`current().blocks[0].html`);
  assert.equal((html.match(/data-passage-id=/g)||[]).length,2,'both ends are saved with their ids');

  // Hovering a marker lights up both ends and draws the curve between them.
  const marker=await evaluate(`(()=>{const m=[...document.querySelectorAll('.line-link-marker')].sort((a,b)=>b.getBoundingClientRect().top-a.getBoundingClientRect().top)[0].getBoundingClientRect();return [m.left+m.width/2,m.top+m.height/2]})()`);
  await mouse('mouseMoved',...marker);await wait(80);
  assert.equal(await evaluate(`document.querySelectorAll('#editor .line-link-lit').length`),2);
  assert.equal(await evaluate(`document.querySelectorAll('.line-link-curve path').length`),1);
  await wait(250);await shot('hover');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.line-link-curve')).opacity`),'1','the curve is actually shown');

  // Clicking it lists the other end; choosing it goes there.
  await click(...marker);
  assert.match(await evaluate(`document.querySelector('.line-link-pop').textContent`),/↑EquationE=mc\^2/);
  await shot('pop');
  await evaluate(`document.querySelector('.line-link-go').click()`);await wait(80);
  assert.equal(await evaluate(`document.querySelector('.rich-text .display-equation').classList.contains('line-link-pulse')`),true,'the equation flashes when you arrive');
  assert.equal(await evaluate(`document.querySelector('.line-link-pop').hidden`),true);

  // Enter at the end of a linked line: the new line is not linked.
  await evaluate(`(()=>{const p=[...document.querySelectorAll('.rich-text p')].at(-1);p.closest('.rich-text').focus();const r=document.createRange();r.setStart(p.firstChild,p.firstChild.length);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await press('Enter');await call('Input.insertText',{text:'A new thought'},sessionId);await wait(150);
  assert.equal(await markers(),2,'still exactly two linked lines');
  assert.equal((await evaluate(`current().blocks[0].html`)).match(/data-passage-id=/g).length,2);

  // ⌘⇧L links the line the caret is on; Esc backs out without linking.
  await evaluate(`(()=>{const li=document.querySelector('.rich-text li');li.closest('.rich-text').focus();const r=document.createRange();r.setStart(li.firstChild,3);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyL',key:'l',shiftKey:true,metaKey:true,bubbles:true,cancelable:true}))`);await wait(60);
  assert.equal(await evaluate(`document.querySelector('.rich-text li').classList.contains('line-link-source')`),true);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);await wait(60);
  assert.equal(await evaluate(`document.body.classList.contains('linking-lines')`),false);
  assert.equal(await links(),1);
  // Done again and finished with a click, it links the bullet to the heading.
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyL',key:'l',shiftKey:true,metaKey:true,bubbles:true,cancelable:true}))`);await wait(60);
  await evaluate(`document.querySelector('article').scrollTop=0`);await wait(80);
  await click(...await centre('.rich-text h2'));await wait(100);
  assert.equal(await links(),2);
  // Linking a line to the equation as well gives the equation's marker a count.
  await evaluate(`(()=>{const li=document.querySelector('.rich-text li');li.closest('.rich-text').focus();const r=document.createRange();r.setStart(li.firstChild,3);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyL',key:'l',shiftKey:true,metaKey:true,bubbles:true,cancelable:true}))`);await wait(60);
  await click(...await centre('.rich-text .display-equation'));await wait(100);
  assert.equal(await links(),3);
  assert.ok(await evaluate(`[...document.querySelectorAll('.line-link-marker')].some(m=>m.textContent==='↔ 2')`),'a line with two links shows the count');

  // The links survive reopening the note.
  await evaluate(`render()`);await wait(200);
  assert.ok(await markers()>=3);

  // Unlink from the list.
  const eqMarker=await evaluate(`(()=>{const m=[...document.querySelectorAll('.line-link-marker')].find(m=>m.textContent==='↔ 2').getBoundingClientRect();return [m.left+m.width/2,m.top+m.height/2]})()`);
  await click(...eqMarker);
  assert.equal(await evaluate(`document.querySelectorAll('.line-link-pop .line-link-row').length`),2);
  await evaluate(`document.querySelector('.line-link-unlink').click()`);await wait(100);
  assert.equal(await links(),2);
  assert.equal(await evaluate(`state.notes[0].nodes.length`),0,'the mind map is never touched');
  console.log('Line link tests passed');
}finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
