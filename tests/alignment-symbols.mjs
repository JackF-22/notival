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
  await evaluate(`document.querySelector('#new').click();document.querySelector('.rich-text')?.focus();const rich=document.querySelector('.rich-text');rich.innerHTML='<p>First paragraph</p><p>Second paragraph</p>';rich.dispatchEvent(new Event('input',{bubbles:true}));const r=document.createRange();r.selectNodeContents(rich.firstElementChild);getSelection().removeAllRanges();getSelection().addRange(r)`);
  await new Promise(r=>setTimeout(r,40));
  await evaluate(`document.querySelector('#editor-alignment').click();document.querySelector('#align-center').click()`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.rich-text p')).textAlign`),'center');
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelectorAll('.rich-text p')[1]).textAlign`),'center');
  assert.match(await evaluate(`current().blocks[0].html`),/text-align: center/);
  await evaluate(`render()`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.rich-text p')).textAlign`),'center');
  assert.equal(await evaluate(`RichEditor.cleanHTML('<p style="text-align:right;background:red" onclick="bad()">Safe</p>')`),'<p style="text-align: right;">Safe</p>');
  await evaluate(`const backup=JSON.parse(JSON.stringify(state));state.notes=[];window.marginImportBackup(backup);active=state.notes[0].id;render()`);
  assert.match(await evaluate(`current().blocks[0].html`),/text-align: center/);
  const examples=[['x ->','x → '],['A =>','A ⇒ '],['a <=>','a ⇔ '],['x +/-','x ± '],['x <=','x ≤ '],['x >=','x ≥ '],['x !=','x ≠ '],['x ~=','x ≈ '],['https://example.com/->','https://example.com/-> ']];
  for(const [text,expected] of examples){await evaluate(`document.querySelector('#new').click();document.querySelector('.rich-text')?.focus()`);await call('Input.insertText',{text},sessionId);await call('Input.insertText',{text:' '},sessionId);assert.equal(await evaluate(`document.querySelector('.rich-text').textContent.replaceAll('\u00a0',' ')`),expected,text)}
  await evaluate(`document.querySelector('#new').click();document.querySelector('.rich-text')?.focus();document.querySelector('[data-add=code]').click()`);
  await call('Input.insertText',{text:'x =>'},sessionId);await evaluate(`const code=document.querySelector('.code-editor textarea');code.focus();code.setSelectionRange(code.value.length,code.value.length)`);await call('Input.insertText',{text:' '},sessionId);
  assert.equal(await evaluate(`current().blocks[1].text`),'x => ');
  await evaluate(`document.querySelector('#new').click();document.querySelector('.rich-text')?.focus();const literalEditor=document.querySelector('.rich-text');literalEditor.innerHTML='<pre>literal -&gt;</pre>';literalEditor.focus();const literalRange=document.createRange();literalRange.selectNodeContents(literalEditor.firstChild);literalRange.collapse(false);getSelection().removeAllRanges();getSelection().addRange(literalRange)`);
  await call('Input.insertText',{text:' '},sessionId);
  assert.equal(await evaluate(`document.querySelector('.rich-text pre').textContent.replaceAll('\u00a0',' ')`),'literal -> ');
  const spacing=await evaluate(`(()=>{const r=document.querySelector('.rich-text'),s=getComputedStyle(r);return {left:s.paddingLeft,right:s.paddingRight,line:s.lineHeight}})()`);
  assert.equal(spacing.left,spacing.right);
  console.log('PASS: paragraph alignment, sanitizer restrictions, render/backup persistence, prose symbols, literal code/URLs, and equal text gutters.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
