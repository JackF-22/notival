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
  await call("Emulation.setDeviceMetricsOverride",{width:1300,height:800,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const key=(k,extra={})=>call('Input.dispatchKeyEvent',{type:'keyDown',key:k,code:k==='Enter'?'Enter':undefined,windowsVirtualKeyCode:k==='Enter'?13:0,text:k==='Enter'?'\r':undefined,...extra},sessionId).then(()=>call('Input.dispatchKeyEvent',{type:'keyUp',key:k,windowsVirtualKeyCode:k==='Enter'?13:0},sessionId));
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(100);
  await evaluate(`current().blocks[0].html='<p>Alpha</p><p><br></p>';render()`);await wait(250);
  await evaluate(`(()=>{const p=document.querySelector('.rich-text').children[1];p.closest('.rich-text').focus();const r=document.createRange();r.setStart(p,0);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await call('Input.insertText',{text:'/code'},sessionId);await wait(150);
  await key('Enter');await wait(250);
  const where=`(()=>{const s=getSelection(),n=s.anchorNode,e=n&&(n.nodeType===1?n:n.parentElement);return JSON.stringify({pre:!!e?.closest('pre'),active:document.activeElement.className,count:document.querySelectorAll('.rich-text pre').length})})()`;
  assert.deepEqual(JSON.parse(await evaluate(where)),{pre:true,active:'rich-text',count:1});
  await call('Input.insertText',{text:'x'},sessionId);await wait(80);
  assert.equal(await evaluate(`document.querySelector('.rich-text pre').textContent`),'x');
  await evaluate(`(()=>{const ed=document.querySelector('.rich-text'),d=new DataTransfer();d.setData('text/plain','a\\nb\\nc');d.setData('text/html','<div>a</div><div>b</div><div>c</div>');ed.dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}))})()`);await wait(150);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text pre').length+':'+document.querySelector('.rich-text pre').textContent`),'1:xa\nb\nc');
  await key('Enter',{modifiers:8});await wait(100);
  await call('Input.insertText',{text:'d'},sessionId);await wait(80);
  await key('Enter',{modifiers:8});await wait(100);
  await key('Enter',{modifiers:8});await wait(100);
  await call('Input.insertText',{text:'e'},sessionId);await wait(80);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text pre').length+':'+JSON.stringify(document.querySelector('.rich-text pre').textContent)`),'1:"xa\\nb\\nc\\nd\\n\\ne"');
  const caretTop=`(()=>{const r=getSelection().getRangeAt(0).cloneRange();const rects=r.getClientRects();if(rects.length)return rects[0].top;const s=document.createElement('span');s.textContent='\\u200b';r.insertNode(s);const t=s.getBoundingClientRect().top;s.remove();return t})()`;
  const top1=await evaluate(caretTop);
  await key('Enter',{modifiers:8});await wait(100);
  const top2=await evaluate(caretTop);
  assert.ok(top2>top1+10,'caret moves down a line: '+top1+' -> '+top2);
  await call('Input.insertText',{text:'if (a) {'},sessionId);
  await key('Enter',{modifiers:8});await wait(100);
  await call('Input.insertText',{text:'y'},sessionId);
  await key('Enter',{modifiers:8});await wait(100);
  await call('Input.insertText',{text:'z'},sessionId);
  assert.ok((await evaluate(`document.querySelector('.rich-text pre').textContent`)).replace(/\n$/,'').endsWith('if (a) {\n  y\n  z'),'keeps and deepens indentation');
  await key('Enter');await wait(150);
  assert.equal(await evaluate(`document.querySelector('.rich-text').lastElementChild.tagName`),'P');
  console.log('PASS: /code puts the caret in the code block, multi-line paste stays in one block, Enter leaves it.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
