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
  await evaluate(`document.querySelector('#new').click()`);
  await call('Input.insertText',{text:'Bold me'},sessionId);
  await evaluate(`const rich=document.querySelector('.rich-text'),range=document.createRange();range.selectNodeContents(rich);getSelection().removeAllRanges();getSelection().addRange(range)`);
  await new Promise(r=>setTimeout(r,30));
  await call('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyB',key:'b',modifiers:4,windowsVirtualKeyCode:66},sessionId);
  assert.equal(await evaluate(`!!document.querySelector('.rich-text b,.rich-text strong')`),true);
  await evaluate(`document.querySelector('[data-add="text"]').click()`);
  await call('Input.insertText',{text:'Delete this'},sessionId);
  await call('Input.dispatchKeyEvent',{type:'keyDown',code:'Backspace',key:'Backspace',modifiers:4,windowsVirtualKeyCode:8},sessionId);
  assert.equal(await evaluate(`current().blocks.length`),1);
  assert.equal(await evaluate(`document.activeElement===document.querySelector('.rich-text')`),true);
  await call('Input.insertText',{text:' appended'},sessionId);
  assert.equal(await evaluate(`document.querySelector('.rich-text').textContent`),'Bold me appended');
  await evaluate(`const r=document.querySelector('.rich-text');r.innerHTML+=Array.from({length:70},(_,i)=>'<p>Paragraph '+i+'</p>').join('');r.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('article').scrollTop=600`);
  await new Promise(r=>setTimeout(r,60));
  const rect=await evaluate(`({bar:document.querySelector('#format-bar').getBoundingClientRect().top,article:document.querySelector('article').getBoundingClientRect().top})`);
  assert.ok(Math.abs(rect.bar-rect.article)<2,JSON.stringify(rect));assert.ok(await evaluate(`document.querySelector('article').scrollTop>0`));
  await new Promise(r=>setTimeout(r,1450));
  await evaluate(`window.notivalReplayLaunch()`);
  assert.equal(await evaluate(`!!document.querySelector('#launch-screen')`),true);
  await new Promise(r=>setTimeout(r,1450));
  assert.equal(await evaluate(`!!document.querySelector('#launch-screen')`),false);
  await evaluate(`const text=document.querySelector('.rich-text');text.innerHTML='<h1>Overview</h1><p>Notes</p><h2>Details</h2>';text.dispatchEvent(new Event('input',{bubbles:true}));renderNoteRail()`);
  assert.equal(await evaluate(`document.querySelector('#note-rail').hidden`),false);
  assert.equal(await evaluate(`document.querySelectorAll('.rail-heading').length`),2);
  assert.equal(await evaluate(`!!document.querySelector('#note-rail .rail-context')`),false);
  await evaluate(`document.querySelector('.rich-text').innerHTML='<p>No headings</p>';renderNoteRail()`);
  assert.equal(await evaluate(`document.querySelector('#note-rail').hidden`),true);
  console.log('PASS: bold shortcut, deletion focuses the previous block end, typing resumes there, sticky formatting, and replayable launch.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
