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
  const keyEv=async(code,modifiers,k,vk)=>{await call('Input.dispatchKeyEvent',{type:'keyDown',code,key:k,modifiers,windowsVirtualKeyCode:vk||0},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',code,key:k,modifiers},sessionId);await wait(80)};
  const beforeCaret=()=>evaluate(`(()=>{const s=getSelection();if(!s.rangeCount)return null;const e=document.querySelector('.rich-text'),r=document.createRange();r.selectNodeContents(e);r.setEnd(s.anchorNode,s.anchorOffset);return r.toString().split(String.fromCharCode(160)).join(' ')})()`);
  await evaluate(`document.querySelector('#launch-screen')?.remove();document.querySelector('#new').click();document.querySelector('.rich-text').focus()`);await wait(100);
  // an inline equation made and then deleted leaves the caret where it was in the line, never at the start of it
  for(const [name,tail,back] of [['at the end of a line','',0],['in the middle of a line',' and more',9]]){
    await evaluate(`document.querySelector('.rich-text').innerHTML='<p><br></p>';document.querySelector('.rich-text').focus()`);await wait(100);
    await call('Input.insertText',{text:'Hello there '},sessionId);
    await keyEv('KeyE',12,'E',69);await call('Input.insertText',{text:'x^2'},sessionId);await keyEv('Enter',0,'Enter',13);
    if(tail){await call('Input.insertText',{text:tail},sessionId);for(let i=0;i<back;i++)await keyEv('ArrowLeft',0,'ArrowLeft',37)}
    await keyEv('Backspace',0,'Backspace',8);
    assert.equal(await evaluate(`document.querySelectorAll('.inline-equation').length`),0,name+': the equation is gone');
    assert.equal((await beforeCaret()).trim(),'Hello there',name+': the caret is still after "Hello there", not at the start of the line');
    await wait(150);
    assert.equal((await beforeCaret()).trim(),'Hello there',name+': and it stays there');
    await call('Input.insertText',{text:'Z'},sessionId);
    assert.match(await evaluate(`document.querySelector('.rich-text').textContent`),/^Hello there\s*Z/,name+': typing carries on from there');
  }
  console.log('PASS: deleting an inline equation leaves the caret where it was in the line.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
