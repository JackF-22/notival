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
  for(let i=0;i<100;i++){if(await evaluate(`document.readyState==='complete'&&typeof state!=='undefined'&&!!state`))break;await new Promise(r=>setTimeout(r,30))}
  const noteCount=await evaluate(`state.notes.length`);
  await new Promise(r=>setTimeout(r,1450));
  assert.equal(await evaluate(`document.querySelector('#launch-screen')`),null);
  assert.equal(await evaluate(`state.notes.length`),noteCount);
  // Simulate a slow native handoff; do not dismiss the screen before data arrives.
  await call('Page.enable',{},sessionId);
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.launchErrors=[];window.addEventListener('error',e=>window.launchErrors.push(e.message));window.webkit={messageHandlers:{margin:{postMessage(){}}}}`},sessionId);
  await call('Page.reload',{},sessionId);
  for(let i=0;i<100;i++){if(await evaluate(`document.readyState==='complete'&&!!window.launchErrors&&!!document.querySelector('#launch-screen')`))break;await new Promise(r=>setTimeout(r,30))}
  await new Promise(r=>setTimeout(r,700));
  assert.deepEqual(await evaluate(`window.launchErrors`),[]);
  assert.equal(await evaluate(`document.querySelector('#launch-screen').classList.contains('is-leaving')`),false);
  await evaluate(`window.marginLoad({notes:[{id:'launch-note',title:'Saved notebook',updated:1,blocks:[{id:'b',type:'text',text:'Preserved content'}],nodes:[]}],projects:[]})`);
  await new Promise(r=>setTimeout(r,750));
  assert.equal(await evaluate(`document.querySelector('#launch-screen')`),null);
  assert.equal(await evaluate(`state.notes[0].title`),'Saved notebook');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
  await call('Page.reload',{},sessionId);
  for(let i=0;i<100;i++){if(await evaluate(`document.readyState==='complete'&&!!window.launchErrors&&!!document.querySelector('#launch-screen')`))break;await new Promise(r=>setTimeout(r,30))}
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.launch-blue')).animationName`),'none');
  await evaluate(`window.marginLoad({notes:[],projects:[]})`);
  await new Promise(r=>setTimeout(r,50));
  assert.equal(await evaluate(`document.querySelector('#launch-screen')`),null);
  console.log('PASS: launch dismissal, delayed native data readiness, preserved notebook contents, and immediate reduced-motion exit.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
