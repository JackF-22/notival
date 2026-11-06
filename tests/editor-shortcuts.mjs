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
  await evaluate(`document.querySelector('#new').click();document.querySelector('.rich-text')?.focus();const rich=document.querySelector('.rich-text');rich.innerHTML='<h1><strong>Important heading</strong></h1><p>Body stays here.</p>';rich.dispatchEvent(new Event('input',{bubbles:true}));rich.focus();const range=document.createRange();range.selectNodeContents(rich.firstElementChild);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);window.prompt=()=> 'x^2'`);
  await new Promise(r=>setTimeout(r,40));
  assert.equal(await evaluate(`document.querySelector('#heading-style').value`),'h1');
  await evaluate(`document.querySelector('#heading-style').value='h2';document.querySelector('#heading-style').dispatchEvent(new Event('change',{bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelector('.rich-text h2 strong').textContent`),'Important heading');
  assert.equal(await evaluate(`document.querySelector('.rich-text p').textContent`),'Body stays here.');
  const key=async(code,modifiers,key)=>{await call('Input.dispatchKeyEvent',{type:'keyDown',code,key,modifiers,windowsVirtualKeyCode:({Enter:13,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40}[code]||0)},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',code,key,modifiers:0},sessionId)};
  await key('Digit3',5,'3');
  assert.equal(await evaluate(`!!document.querySelector('.rich-text h3 strong')`),true);
  await evaluate(`document.querySelector('#new').click();document.querySelector('.rich-text')?.focus()`);
  await key('KeyE',12,'E');
  assert.equal(await evaluate(`document.querySelectorAll('.inline-equation.editing').length`),1);
  await call('Input.insertText',{text:'x^2'},sessionId);
  assert.equal(await evaluate(`!!document.querySelector('.inline-equation.editing .equation-preview .katex')`),true);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  assert.equal(await evaluate(`document.querySelectorAll('.inline-equation:not(.editing)').length`),1);
  assert.equal(await evaluate(`current().blocks[0].text`).then(t=>/\$x\^2\$/.test(t)),true);
  await key('KeyE',5,'e');
  assert.equal(await evaluate(`document.querySelectorAll('.display-equation.editing').length`),1);
  await call('Input.insertText',{text:'y=1'},sessionId);
  // ⌘↵ adds a line inside a display equation; plain ↵ finishes it.
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',modifiers:4,windowsVirtualKeyCode:13},sessionId);
  assert.equal(await evaluate(`document.querySelectorAll('.display-equation.editing').length`),1);
  await call('Input.insertText',{text:'z=2'},sessionId);
  assert.equal(await evaluate(`document.querySelector('.display-equation.editing .equation-source').value`),'y=1\nz=2');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  assert.equal(await evaluate(`document.querySelectorAll('.display-equation:not(.editing)').length`),1);
  assert.equal(await evaluate(`document.querySelector('[data-command="inlineequation"] kbd').textContent`),'⌘⇧E');
  await evaluate(`document.querySelector('#new').click();document.querySelector('.rich-text')?.focus()`);
  await call('Input.insertText',{text:'Keep this passage.'},sessionId);
  await key('KeyT',5,'t');
  assert.equal(await evaluate(`document.querySelector('.table-picker').open`),true);
  assert.equal(await evaluate(`document.querySelectorAll('.table-size-grid button').length`),64);
  const point=async selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  const start=await point('.table-size-grid [data-row="1"][data-column="1"]'),end=await point('.table-size-grid [data-row="3"][data-column="4"]');
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1},sessionId);
  assert.equal(await evaluate(`document.querySelector('.table-picker output').textContent`),'4 × 3');
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1},sessionId);
  assert.equal(await evaluate(`document.querySelector('.table-picker').open`),false);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text table tr').length`),3);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text table tr:first-child td').length`),4);
  assert.match(await evaluate(`current().blocks[0].text`),/Keep this passage/);
  assert.equal(await evaluate(`(getSelection().anchorNode.nodeType===1?getSelection().anchorNode:getSelection().anchorNode.parentElement).closest('td')===document.querySelector('.rich-text td')`),true);
  await evaluate(`render();document.querySelector('.rich-text').focus()`);await key('KeyT',5,'t');
  await key('Escape',0,'Escape');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text table').length`),1);
  await evaluate(`document.querySelector('.rich-text').focus()`);await key('KeyT',5,'t');await key('ArrowRight',0,'ArrowRight');await key('ArrowDown',0,'ArrowDown');await key('Enter',0,'Enter');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text table').length`),2);
  await evaluate(`document.querySelector('#title').focus()`);await key('KeyE',12,'E');
  assert.equal(await evaluate(`document.querySelectorAll('.inline-equation').length`),0);
  await evaluate(`document.querySelector('#new').click();document.querySelector('.rich-text')?.focus();document.querySelector('[data-add="code"]').click()`);await key('KeyT',5,'t');
  assert.equal(await evaluate(`document.querySelector('.table-picker').open`),false);
  console.log('PASS: heading conversion preserves text/formatting, equation and heading hotkeys, visible hints, table drag sizing, caret placement, keyboard sizing, cancellation, and shortcut scope.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
