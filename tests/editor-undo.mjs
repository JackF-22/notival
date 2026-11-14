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
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const key=async(code,modifiers,k)=>{await call('Input.dispatchKeyEvent',{type:'keyDown',code,key:k,modifiers,windowsVirtualKeyCode:code==='KeyZ'?90:code==='KeyY'?89:0},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',code,key:k,modifiers},sessionId);await wait(80)};
  const text=()=>evaluate(`document.querySelector('.rich-text').textContent.replace(/​/g,'')`);
  const saved=()=>evaluate(`current().blocks[0].text`);
  await evaluate(`document.querySelector('#launch-screen')?.remove();document.querySelector('#new').click();document.querySelector('.rich-text').focus()`);await wait(100);
  assert.equal(await evaluate(`!!document.querySelector('#format-bar [data-command=undo]')&&!!document.querySelector('#format-bar [data-command=redo]')`),true,'the toolbar has Undo and Redo');
  // typing in bursts: each pause is a step
  await call('Input.insertText',{text:'First line'},sessionId);await wait(1150);
  await call('Input.insertText',{text:' and more'},sessionId);await wait(1150);
  await call('Input.insertText',{text:' plus the end'},sessionId);await wait(200);
  assert.equal(await text(),'First line and more plus the end');
  await key('KeyZ',4,'z');assert.equal(await text(),'First line and more','⌘Z takes back the last burst of typing');
  assert.equal(await saved(),'First line and more','and the saved note follows');
  await key('KeyZ',4,'z');assert.equal(await text(),'First line');
  await key('KeyZ',12,'Z');assert.equal(await text(),'First line and more','⌘⇧Z puts it back');
  await key('KeyY',2,'y');assert.equal(await text(),'First line and more plus the end','Ctrl+Y redoes too');
  // changes the page makes itself, which the browser's own undo loses track of
  await evaluate(`document.querySelector('#heading-style').value='h2';document.querySelector('#heading-style').dispatchEvent(new Event('change',{bubbles:true}))`);await wait(150);
  assert.equal(await evaluate(`!!document.querySelector('.rich-text h2')`),true);
  await evaluate(`document.querySelector('#format-bar [data-command=task]').click()`);await wait(150);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text .task-row').length`),1);
  await evaluate(`document.querySelector('#format-bar [data-command=undo]').click()`);await wait(150);
  assert.equal(await evaluate(`document.querySelector('.rich-text h2')!=null`),true,'the Undo button steps back one change');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text .task-row').length`),0,'and the checklist is gone');
  for(let i=0;i<1;i++){await evaluate(`document.querySelector('#format-bar [data-command=undo]').click()`);await wait(120)}
  assert.equal(await evaluate(`document.querySelector('.rich-text h2')`),null,'and again, back past the heading');
  assert.match(await text(),/First line and more plus the end/);
  // an equation inside the note: ⌘Z in its own field is left alone
  await evaluate(`document.querySelector('.rich-text').focus()`);await key('KeyE',12,'E');
  await call('Input.insertText',{text:'x^2'},sessionId);
  await key('KeyZ',4,'z');
  assert.equal(await evaluate(`document.querySelectorAll('.inline-equation.editing').length`),1,'⌘Z inside an equation field does not jump the note back');
  console.log('PASS: undo and redo — a toolbar Undo/Redo, ⌘Z / ⌘⇧Z / Ctrl+Y, typing in bursts, page-made changes, and equation fields left alone.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
