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
  await call('Emulation.setDeviceMetricsOverride',{width:1100,height:850,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),mouse=(type,p,buttons)=>call('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons,clickCount:1},sessionId);
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(80);
  await evaluate('document.querySelector("#launch-screen")?.remove();state.notes.push({id:"t9",title:"Existing",updated:1,blocks:[{id:"b9",type:"text",text:"hello",html:"hello"}],nodes:[],pinned:false});state.notes.push({id:"t8",title:"Other",updated:2,blocks:[{id:"b8",type:"text",text:"x",html:"x"}],nodes:[],pinned:false});active="t8";mode="write";render();document.querySelector(".rich-text").focus();active="t9";render()');await wait(250);
  assert.equal(await evaluate('document.activeElement.id'),'title','opening a note focuses its title');
  // Enter settles the title and moves the caret into the first text block
  await evaluate('(()=>{const t=document.querySelector("#title");t.focus();t.value="  Cell respiration  ";t.dispatchEvent(new Event("input",{bubbles:true}))})()');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'},sessionId);
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
  await wait(250);
  assert.equal(await evaluate('document.querySelector("#title").value'),'Cell respiration','the title is trimmed and kept');
  assert.equal(await evaluate('current().title'),'Cell respiration');
  assert.equal(await evaluate('!!document.activeElement.closest("#editor .rich-text")'),true,'the caret is in the first text block');
  assert.equal(await evaluate('getSelection().isCollapsed'),true);
  await call('Input.insertText',{text:'First line'},sessionId);await wait(80);
  assert.equal(await evaluate('current().blocks.find(b=>b.type==="text").text.startsWith("First line")'),true,'typing lands at the start of the body');
  assert.equal(await evaluate('document.querySelector("#title").value'),'Cell respiration');
  console.log('PASS: a note opens with the focus on its title, and Enter in the title moves into the body.');
}finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
