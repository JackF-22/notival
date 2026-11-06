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
  const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK0kAAAAASUVORK5CYII=';
  await evaluate(`document.querySelector('#new').click();const rich=document.querySelector('.rich-text');rich.innerHTML='<p>Lecture diagrams</p><p><img src="${pixel}" alt="First diagram"></p><p><img src="${pixel}" alt="Second diagram"></p>';rich.dispatchEvent(new Event('input',{bubbles:true}))`);
  await new Promise(r=>setTimeout(r,80));
  await evaluate(`document.querySelector('.rich-text img').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}))`);
  assert.equal(await evaluate(`document.querySelector('.image-comment-dialog').open`),true);
  await evaluate(`document.querySelector('[aria-label="Image comment"]').value='Why does this pathway branch?';document.querySelector('.image-comment-dialog form').requestSubmit()`);
  assert.equal(await evaluate(`current().blocks[0].imageComments.length`),1);
  assert.match(await evaluate(`current().blocks[0].html`),/data-image-id=/);
  assert.equal(await evaluate(`document.querySelector('.image-comments-actions')`),null);
  assert.equal(await evaluate(`document.querySelector('.rich-text img').title`),'1 comment · Double-click to comment on this image');
  await evaluate(`document.querySelector('.image-comment-row button').click();document.querySelector('[aria-label="Image comment"]').value='<script>bad()</script> Revised explanation';document.querySelector('.image-comment-dialog form').requestSubmit()`);
  assert.equal(await evaluate(`document.querySelector('.image-comment-list script')`),null);
  await evaluate(`document.querySelectorAll('.image-comment-row button')[1].click()`);
  assert.equal(await evaluate(`current().blocks[0].imageComments.length`),0);
  await evaluate(`document.querySelector('#toast button').click();document.querySelector('.image-comment-heading button').click();persist()`);
  await new Promise(r=>setTimeout(r,400));
  await call('Page.reload',{},sessionId);
  for(let i=0;i<100;i++){if(await evaluate(`document.readyState==='complete'&&typeof state!=='undefined'&&!!document.querySelector('.quick-search-trigger')`))break;await new Promise(r=>setTimeout(r,50))}
  await evaluate(`active=state.notes.find(n=>n.blocks.some(b=>b.imageComments?.length)).id;render()`);
  await new Promise(r=>setTimeout(r,80));
  assert.equal(await evaluate(`current().blocks[0].imageComments[0].text`),'<script>bad()</script> Revised explanation');
  await evaluate(`const rich=document.querySelector('.rich-text');rich.querySelector('p').remove();rich.dispatchEvent(new Event('input',{bubbles:true}));render()`);
  await new Promise(r=>setTimeout(r,80));
  await evaluate(`document.querySelector('.rich-text img').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  assert.equal(await evaluate(`document.querySelector('.image-comment-dialog').open`),true);
  assert.equal(await evaluate(`document.querySelectorAll('.image-comment-row').length`),1);
  await evaluate(`document.querySelector('.image-comment-heading button').click();const backup=JSON.parse(JSON.stringify(state));state.notes=[];window.marginImportBackup(backup);active=state.notes.find(n=>n.blocks.some(b=>b.imageComments?.length)).id;render()`);
  assert.equal(await evaluate(`current().blocks[0].imageComments.length`),1);
  assert.match(await evaluate(`current().blocks[0].html`),/data-image-id=/);
  console.log('PASS: image-specific comments, edit/remove/Undo, safe text rendering, persistence, keyboard opening, image identity after text edits, and backup round trip.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
