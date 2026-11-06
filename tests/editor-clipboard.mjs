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
  await evaluate(`document.querySelector('#new').click();document.querySelector('.rich-text')?.focus();const rich=document.querySelector('.rich-text');rich.innerHTML='<p>Select this first paragraph.</p><p>Continue into this second paragraph.</p>';rich.dispatchEvent(new Event('input',{bubbles:true}))`);
  const points=await evaluate(`(()=>{const paragraphs=document.querySelectorAll('.rich-text p');return [...paragraphs].map((p,index)=>{const r=document.createRange();r.setStart(p.firstChild,index?12:0);r.setEnd(p.firstChild,index?13:1);const rect=r.getBoundingClientRect();return {x:rect.left+1,y:rect.top+rect.height/2}})})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...points[0],button:'left',clickCount:1},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...points[1],button:'left',buttons:1},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',...points[1],button:'left',clickCount:1},sessionId);
  const selected=await evaluate(`getSelection().toString()`);assert.match(selected,/Select this first paragraph/);
  await evaluate(`document.querySelector('.rich-text').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  assert.equal(await evaluate(`getSelection().toString()`),selected);
  await evaluate(`document.querySelector('.block').dispatchEvent(new MouseEvent('click',{bubbles:true}));focusFirstTextBlock()`);
  await new Promise(r=>setTimeout(r,80));
  assert.equal(await evaluate(`getSelection().toString()`),selected);
  assert.equal(await evaluate(`(()=>{const e=new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:new DataTransfer()});document.querySelector('.rich-text').dispatchEvent(e);return e.defaultPrevented})()`),false);
  assert.equal(await evaluate(`(()=>{const e=new ClipboardEvent('cut',{bubbles:true,cancelable:true,clipboardData:new DataTransfer()});document.querySelector('.rich-text').dispatchEvent(e);return e.defaultPrevented})()`),false);
  await evaluate(`const editor=document.querySelector('.rich-text'),range=document.createRange();range.selectNodeContents(editor);getSelection().removeAllRanges();getSelection().addRange(range);const data=new DataTransfer();data.setData('text/html','<h2><strong>Pasted heading</strong></h2><p style="text-align:center;color:red" onclick="bad()">Pasted paragraph</p><script>window.badPaste=true</script>');data.setData('text/plain','Pasted heading');editor.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))`);
  assert.equal(await evaluate(`document.querySelector('.rich-text h2 strong').textContent`),'Pasted heading');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.rich-text p')).textAlign`),'center');
  assert.equal(await evaluate(`!!document.querySelector('.rich-text [onclick],.rich-text script')`),false);
  assert.equal(await evaluate(`window.badPaste===true`),false);
  await evaluate(`render()`);
  assert.equal(await evaluate(`document.querySelector('.rich-text h2 strong').textContent`),'Pasted heading');
  await evaluate(`const area=document.querySelector('.rich-text'),r=document.createRange();r.selectNodeContents(area);getSelection().removeAllRanges();getSelection().addRange(r);area.focus();const plain=new DataTransfer();plain.setData('text/plain','Plain text replacement');area.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:plain}))`);
  assert.equal(await evaluate(`document.querySelector('.rich-text').textContent`),'Plain text replacement');
  assert.match(await evaluate(`current().blocks[0].text`),/Plain text replacement/);
  console.log('PASS: pointer selection survives clicks and focus, native copy/cut remain unblocked, rich paste preserves safe formatting, and plain-text replacement persists.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
