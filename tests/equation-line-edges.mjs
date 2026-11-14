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

  // an equation at the start of a line: backspacing in front of it must not push it onto a second line
  await emptyLine();await addEquation('x^2');await type('after');
  for(let i=0;i<14&&(await textBeforeCaret())!=='';i++)await keyEv('ArrowLeft',0,'ArrowLeft',37);
  assert.equal(await textBeforeCaret(),'','the caret reached the start of the line');
  await keyEv('Backspace',0,'Backspace',8);await keyEv('Backspace',0,'Backspace',8);await wait(150);
  assert.equal(await leadingBreak(),false,'Backspace in front of the first equation adds no blank line above it: '+await html());
  await type('Q');
  assert.match(await evaluate(`document.querySelector('.rich-text p').textContent.replace(/[\\u00a0\\u200b]/g,'')`),/^Q/,'typing goes in front of the equation on the same line');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text p').length`),1,'still one line');

  // Delete in front of the line's first equation takes the equation
  await emptyLine();await addEquation('y');await type('tail');
  for(let i=0;i<14&&(await textBeforeCaret())!=='';i++)await keyEv('ArrowLeft',0,'ArrowLeft',37);
  await keyEv('Delete',0,'Delete',46);await wait(150);
  assert.equal(await evaluate(`document.querySelectorAll('.inline-equation').length`),0,'Delete removes the equation ahead of the caret');
  assert.equal(await leadingBreak(),false,'and leaves no blank line');
  await type('Z');
  assert.match(await evaluate(`document.querySelector('.rich-text p').textContent.replace(/[\\u00a0\\u200b]/g,'')`),/^Ztail/,'the caret stays at the start of the line');

  // a bulleted list on the line after an equation line, whatever the invisible space after the equation does
  for(const [name,before] of [['an equation alone on its line',''],['an equation ending a sentence','Hello ']]){
    await emptyLine();if(before)await type(before);await addEquation('m');
    await keyEv('Enter',0,'Enter',13);await type('-');await type(' ');await wait(100);
    assert.equal(await evaluate(`document.querySelectorAll('.rich-text ul').length`),1,name+': "- " makes a bulleted list: '+await html());
    await type('item');
    assert.equal(await evaluate(`document.querySelector('.rich-text ul li').textContent.replace(/[\\u00a0\\u200b]/g,'')`),'item',name+': typing goes into the bullet');
    assert.equal(await evaluate(`document.querySelectorAll('.inline-equation').length`),1,name+': the equation is untouched');
  }
  await emptyLine();await addEquation('m');await keyEv('Enter',0,'Enter',13);await type('1.');await type(' ');await wait(100);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text ol').length`),1,'"1. " makes a numbered list after an equation line');
  console.log('PASS: lists start and Backspace stays on the line beside an inline equation.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
