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
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const keyEv=async(code,modifiers,k,vk)=>{await call('Input.dispatchKeyEvent',{type:'keyDown',code,key:k,modifiers,windowsVirtualKeyCode:vk||0,...(k==='Enter'&&!modifiers?{text:'\r'}:{})},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',code,key:k,modifiers},sessionId);await wait(80)};
  const type=text=>call('Input.insertText',{text},sessionId);
  const html=()=>evaluate(`document.querySelector('.rich-text').innerHTML`);
  await evaluate(`document.querySelector('#launch-screen')?.remove();document.querySelector('#new').click();document.querySelector('.rich-text').focus()`);await wait(100);
  // an empty line with the caret where a click puts it: at the start of the paragraph
  const emptyLine=async()=>{await evaluate(`(()=>{const e=document.querySelector('.rich-text');e.innerHTML='<p><br></p>';e.focus();const r=document.createRange();r.setStart(e.firstElementChild,0);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);await wait(100)};
  const addEquation=async source=>{await keyEv('KeyE',12,'E',69);await type(source);await keyEv('Enter',0,'Enter',13)};
  const textBeforeCaret=()=>evaluate(`(()=>{const s=getSelection(),e=document.querySelector('.rich-text'),r=document.createRange();r.selectNodeContents(e);r.setEnd(s.anchorNode,s.anchorOffset);return r.cloneContents().querySelector('.equation')?'eq':r.toString().replace(/[\\u00a0\\u200b]/g,'')})()`);
  const leadingBreak=()=>evaluate(`document.querySelector('.rich-text p').firstChild?.nodeName==='BR'`);

  const fresh=async()=>{await evaluate(`(()=>{const e=document.querySelector('.rich-text');e.innerHTML='<p><br></p>';e.focus();const r=document.createRange();r.setStart(e.firstElementChild,0);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);await wait(100)};
  const blank=async()=>{await evaluate(`(()=>{const e=document.querySelector('.rich-text');e.innerHTML='';e.focus()})()`);await wait(100)};
  const enter=()=>keyEv('Enter',0,'Enter',13),soft=async()=>{await evaluate(`document.execCommand('insertLineBreak')`);await wait(50)};
  const heading=()=>keyEv('Digit1',5,'1',49);
  const eq=async()=>{await keyEv('KeyE',12,'E',69);await type('x^2');await enter()};
  // the note's blocks as tag:text, with equations shown as [eq]
  const shape=()=>evaluate(`[...document.querySelector('.rich-text').children].map(b=>b.tagName.toLowerCase()+':'+[...b.childNodes].map(n=>n.nodeType===3?n.textContent:n.classList?.contains('equation')?'[eq]':n.tagName==='BR'?'':n.tagName==='UL'||n.tagName==='OL'?'('+n.textContent+')':n.textContent).join('').replace(/[\u00a0\u200b]/g,'').trim()).join('|')`);
  const lines=async(...texts)=>{for(const [i,t] of texts.entries()){if(i)await enter();await type(t)}};

  // A heading acts on its own line, even in a new note whose first line is bare text.
  await blank();await lines('one','two','three');await heading();assert.equal(await shape(),'p:one|p:two|h1:three','heading in a new note');
  await blank();await lines('one','two');await enter();await type('/heading1');await enter();await type('title');assert.equal(await shape(),'p:one|p:two|h1:title','heading from the slash menu in a new note');
  await fresh();await type('one');await soft();await type('two');await soft();await type('three');await heading();assert.equal(await shape(),'p:one|p:two|h1:three','heading on a line after Shift-Enter breaks');
  await fresh();await type('one');await soft();await type('two');await evaluate(`(()=>{const e=document.querySelector('.rich-text'),r=document.createRange();r.setStart(e.firstChild.childNodes[0],1);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);await heading();assert.equal(await shape(),'h1:one|p:two','heading on the first of two soft-break lines');
  await fresh();await lines('one','two','three');await heading();await enter();await type('after');assert.equal((await shape()).startsWith('p:one|p:two|h1:three|'),true,'the line below a heading stays separate');

  // A line that ends with (or is) an inline equation: the next line starts a list.
  const listAfter=async(setup,marker,expect,label)=>{await setup();await enter();await type(marker[0]);await type(' ');await type('item');assert.equal(await shape(),expect,label)};
  await listAfter(async()=>{await fresh();await type('see ');await eq()},'-','p:see[eq]|ul:item','bullet after text ending in an equation');
  await listAfter(async()=>{await blank();await type('see ');await eq()},'-','p:see[eq]|ul:item','bullet after a first line ending in an equation');
  await listAfter(async()=>{await fresh();await eq()},'-','p:[eq]|ul:item','bullet after a line that is only an equation');
  await listAfter(async()=>{await blank();await lines('a');await enter();await type('b ');await eq()},'*','p:a|p:b[eq]|ul:item','bullet after the second line');
  await fresh();await eq();await enter();await type('1');await type('.');await type(' ');await type('item');assert.equal(await shape(),'p:[eq]|ol:item','numbered list after an equation line');
  // Enter in front of an equation keeps it, and text after the caret moves down with it.
  await fresh();await type('a ');await eq();await type('tail');await evaluate(`(()=>{const e=document.querySelector('.rich-text'),t=e.firstChild,r=document.createRange();r.setStart(t,1);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);await enter();
  assert.equal(await shape(),'p:a|p:[eq]tail','Enter inside a line with an equation splits it');
  console.log('PASS: headings stay on their own line and lists start after lines that end with an equation.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
