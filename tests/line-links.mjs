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

  const mouse=(type,x,y,modifiers=0)=>call('Input.dispatchMouseEvent',{type,x,y,modifiers,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1},sessionId);
  const click=async(x,y,modifiers=0)=>{await mouse('mouseMoved',x,y);await wait(40);await mouse('mousePressed',x,y,modifiers);await mouse('mouseReleased',x,y,modifiers);await wait(120)};
  const centre=selector=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('missing '+${JSON.stringify(selector)});const b=n.getBoundingClientRect();return [b.left+Math.min(b.width/2,60),b.top+b.height/2]})()`);
  const shots=process.env.LINK_SHOTS;
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const select=(needle,within='.rich-text')=>evaluate(`(()=>{const rich=document.querySelector('#editor .rich-text');rich.focus();const walker=document.createTreeWalker(document.querySelector('#editor '+${JSON.stringify(within)}),NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const i=n.data.indexOf(${JSON.stringify(needle)});if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+${needle.length});getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));return true}}throw Error('no '+${JSON.stringify(needle)})})()`).then(()=>wait(150));
  const filler=Array.from({length:6},(_,i)=>`<p>Filler paragraph ${i+1} about the derivation.</p>`).join('');
  await open('<h2>Energy</h2><div class="equation display-equation" data-equation="E=mc^2" contenteditable="false">E=mc^2</div>'+filler+'<p>This is why mass and energy trade off.</p><ul><li>Bullet one</li></ul>');
  const links=()=>evaluate(`current().lineLinks?.length||0`);
  const linked=()=>evaluate(`[...document.querySelectorAll('#editor [data-line-link]')].map(s=>s.textContent).join('|')`);
  const savedHTML=()=>evaluate(`current().blocks[0].html`);

  // Choose the words, then "Link to…" in the selection toolbar, then click the equation far above.
  await select('mass and energy');
  assert.equal(await evaluate(`!!document.querySelector('#selection-tools #selection-link')&&!document.querySelector('#selection-tools').hidden`),true,'the selection toolbar offers Link to…');
  await evaluate(`document.querySelector('#selection-link').click()`);await wait(80);
  assert.equal(await evaluate(`document.body.classList.contains('linking-lines')`),true);
  assert.match(await evaluate(`document.querySelector('.line-link-banner').textContent`),/“mass and energy” refers to/);
  assert.equal(await evaluate(`document.querySelector('#editor span.line-link-source')?.textContent`),'mass and energy','the chosen words stay marked while you pick');
  await mouse('mouseMoved',...await centre('.rich-text .display-equation'));await wait(80);
  assert.equal(await evaluate(`document.querySelector('.rich-text .display-equation').classList.contains('line-link-candidate')`),true);
  await shot('picking');
  await click(...await centre('.rich-text .display-equation'));
  assert.equal(await links(),1);
  assert.equal(await linked(),'mass and energy','the words become the link');
  assert.equal(await evaluate(`document.querySelector('.rich-text .display-equation').classList.contains('editing')`),false,'clicking to link does not open the equation');
  assert.match(await savedHTML(),/<span data-line-link="[^"]+">mass and energy<\/span>/,'the linked words are saved');
  assert.match(await savedHTML(),/class="equation display-equation"[^>]*data-passage-id|data-passage-id="[^"]+"[^>]*>E=mc\^2|data-passage-id/,'the equation keeps an id to point at');
  assert.equal(await evaluate(`state.notes[0].nodes.length`),0,'nothing is added to the mind map');

  // Hovering the words previews the equation, typeset, and lights up both ends.
  const wordsAt=await centre('#editor [data-line-link]');
  await mouse('mouseMoved',wordsAt[0]-30,wordsAt[1]-40);await wait(50);
  await mouse('mouseMoved',...wordsAt);await wait(450);
  assert.equal(await evaluate(`!document.querySelector('.line-link-pop').hidden`),true,'a preview appears on hover');
  assert.equal(await evaluate(`!!document.querySelector('.line-link-pop .line-link-math .katex')`),true,'the equation is shown typeset');
  assert.match(await evaluate(`document.querySelector('.line-link-pop .line-link-label').textContent`),/↑ Equation above/);
  assert.equal(await evaluate(`document.querySelector('.rich-text .display-equation').classList.contains('line-link-lit')`),true);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.line-link-curve')).opacity`),'1');
  await shot('hover');
  // Moving onto the preview keeps it; moving away closes it.
  await mouse('mouseMoved',...await centre('.line-link-pop .line-link-unlink'));await wait(350);
  assert.equal(await evaluate(`!document.querySelector('.line-link-pop').hidden`),true,'the preview stays while you move onto it');
  await mouse('mouseMoved',150,850);await wait(350);
  assert.equal(await evaluate(`document.querySelector('.line-link-pop').hidden`),true,'and goes when you move away');

  // A click on the words goes to the equation, with a way back.
  await click(...wordsAt);await wait(80);
  assert.equal(await evaluate(`document.querySelector('.rich-text .display-equation').classList.contains('line-link-pulse')`),true,'the equation flashes when you arrive');
  assert.match(await evaluate(`(()=>{const b=document.querySelector('.line-link-back');return b.hidden?'hidden':b.textContent})()`),/↩ Back to “mass and energy”/);
  await shot('back');
  await evaluate(`document.querySelector('.line-link-back').click()`);await wait(60);
  assert.equal(await evaluate(`document.querySelector('#editor [data-line-link]').classList.contains('line-link-pulse')`),true);

  // ⌥-click puts the caret in the words instead, so they can be edited.
  await wait(700);
  const again=await centre('#editor [data-line-link]');
  await click(again[0],again[1],1);
  assert.equal(await evaluate(`document.querySelector('.line-link-back').hidden`),true,'no jump');
  assert.equal(await evaluate(`!!getSelection().anchorNode?.parentElement?.closest('[data-line-link]')`),true);
  // Typing right after the linked words stays outside the link.
  await evaluate(`(()=>{const t=document.querySelector('#editor [data-line-link]').firstChild;const r=document.createRange();r.setStart(t,t.length);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await call('Input.insertText',{text:' together'},sessionId);await wait(120);
  assert.equal(await linked(),'mass and energy');
  assert.match(await evaluate(`document.querySelector('.rich-text p:nth-last-of-type(1)').textContent`),/mass and energy together trade off/);

  // The equation has a marker leading back to the words; Unlink there removes the link and keeps the words.
  await evaluate(`document.querySelector('article').scrollTop=0`);await wait(120);
  assert.equal(await evaluate(`document.querySelectorAll('.line-link-marker').length`),1,'only the line pointed at gets a marker');
  await click(...await centre('.line-link-marker'));
  assert.match(await evaluate(`document.querySelector('.line-link-pop').textContent`),/Referred to from.*“mass and energy”/);
  await shot('backlinks');
  await evaluate(`document.querySelector('.line-link-pop .line-link-unlink').click()`);await wait(120);
  assert.equal(await links(),0);
  assert.equal(await linked(),'');
  assert.match(await evaluate(`document.querySelector('.rich-text p:nth-last-of-type(1)').textContent`),/This is why mass and energy together trade off\./,'the words are still there');
  assert.doesNotMatch(await savedHTML(),/data-line-link/);

  // ⌘⇧L with just the caret on a line links the whole line; Esc backs out and leaves nothing behind.
  await evaluate(`(()=>{const li=document.querySelector('.rich-text li');li.closest('.rich-text').focus();const r=document.createRange();r.setStart(li.firstChild,3);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyL',key:'l',shiftKey:true,metaKey:true,bubbles:true,cancelable:true}))`);await wait(60);
  assert.equal(await evaluate(`document.querySelector('#editor span.line-link-source')?.textContent`),'Bullet one');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);await wait(60);
  assert.equal(await evaluate(`document.body.classList.contains('linking-lines')`),false);
  assert.equal(await evaluate(`document.querySelectorAll('#editor [data-line-link]').length`),0);
  assert.equal(await evaluate(`document.querySelector('.rich-text li').innerHTML`),'Bullet one');

  // The line handle offers it too.
  const [lx,ly]=await centre('.rich-text li');
  await mouse('mouseMoved',lx,ly);await wait(150);
  await click(...await centre('#block-handle'));
  assert.ok(await evaluate(`[...document.querySelectorAll('.block-menu button')].some(b=>b.textContent.includes('Link this line to'))`));
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);

  // A link made earlier from a whole line (before words could be chosen) still shows and still leads back.
  await open('<div class="equation display-equation" data-equation="x^2" data-passage-id="eq1" contenteditable="false">x^2</div><p data-passage-id="p1">Old style link</p>');
  await evaluate(`current().lineLinks=[{id:'old',from:'p1',to:'eq1',created:1}];window.marginLineLinks.draw()`);await wait(80);
  assert.equal(await evaluate(`document.querySelectorAll('.line-link-marker').length`),1);
  await click(...await centre('.line-link-marker'));
  assert.match(await evaluate(`document.querySelector('.line-link-pop').textContent`),/Old style link/);
  console.log('Line link tests passed');
}finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
