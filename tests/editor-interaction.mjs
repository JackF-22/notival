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
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state'))break;await new Promise(resolve=>setTimeout(resolve,50))}
  await evaluate('document.querySelector("#new").click();document.querySelector(".rich-text").focus()');
  await call('Input.insertText',{text:'\\heading1'},sessionId);
  assert.equal(await evaluate('!!document.querySelector(".slash-menu:not([hidden])")'),true);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  assert.equal(await evaluate('document.querySelector(".rich-text").firstElementChild.tagName'),'H1');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".rich-text h1"),"::before").content'),'"Heading 1"');
  await call('Input.insertText',{text:'My heading'},sessionId);
  assert.equal(await evaluate('current().blocks[0].text'),'# My heading');
  await evaluate('render()');
  assert.equal(await evaluate('document.querySelector(".rich-text h1").textContent'),'My heading');
  await evaluate('document.querySelector("#new").click()');
  await call('Input.insertText',{text:'-'},sessionId);
  await call('Input.insertText',{text:' '},sessionId);
  assert.equal(await evaluate('document.querySelector(".rich-text").firstElementChild.tagName'),'UL');
  await call('Input.insertText',{text:'Bullet item'},sessionId);
  assert.equal(await evaluate('current().blocks[0].text'),'- Bullet item');
  await evaluate('document.querySelector("#new").click()');
  await call('Input.insertText',{text:'1.'},sessionId);
  await call('Input.insertText',{text:' '},sessionId);
  assert.equal(await evaluate('document.querySelector(".rich-text").firstElementChild.tagName'),'OL');
  await call('Input.insertText',{text:'Numbered item'},sessionId);
  assert.equal(await evaluate('current().blocks[0].text'),'1. Numbered item');
  await evaluate('document.querySelector("#new").click()');
  const point=await evaluate('(()=>{const rect=document.querySelector(".block:not(.code)").getBoundingClientRect();return {x:rect.right-8,y:rect.bottom-8}})()');
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1},sessionId);
  assert.equal(await evaluate('document.activeElement.className'),'rich-text');
  await call('Input.insertText',{text:'Writing from the card'},sessionId);
  assert.equal(await evaluate('current().blocks[0].text'),'Writing from the card');
  await evaluate('document.querySelector("[data-add=code]").click()');
  assert.equal(await evaluate('current().blocks.length'),2);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8,modifiers:12},sessionId);
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8,modifiers:12},sessionId);
  assert.equal(await evaluate('current().blocks.length'),1);
  const activeId=await evaluate('current().id');
  await evaluate('window.confirm=()=>true;document.querySelectorAll(".note-item")[1].dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:120,clientY:180}))');
  assert.equal(await evaluate('document.querySelector("#note-menu").hidden'),false);
  await evaluate('document.querySelector("#note-menu .danger").click()');
  assert.equal(await evaluate('current().id'),activeId);
  assert.equal(await evaluate('state.trash.length>0'),true);
  await evaluate('document.querySelector("#toast button").click()');
  assert.equal(await evaluate('state.trash.length'),0);
  console.log('PASS: heading, text card focus, cell delete shortcut, and sidebar note menu.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true})}
