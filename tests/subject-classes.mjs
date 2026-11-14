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
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`state.notes=[];active=null;state.projects=['Biology','Chemistry','Physics','History'].map((name,i)=>({id:'s'+i,name,icon:'📘',color:'#4a9d6f',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[]}));persist();render();window.marginHome()`);await wait(300);
  await evaluate(`state.projects[0].name='NROTC';state.projects[1].name='NS.41';state.projects[1].parentId='s0';render();window.marginHome(null)`);await wait(300);
  const tiles=()=>evaluate(`[...document.querySelectorAll('.subject-grid .subject-tile')].map(t=>t.querySelector('h2').textContent).join()`);
  assert.equal(await tiles(),'NROTC,Physics,History','a class does not clutter the home page');
  assert.match(await evaluate(`document.querySelector('.subject-grid .subject-tile').textContent`),/1 class/);
  assert.equal(await evaluate(`[...document.querySelectorAll('#projects .project-row')].map(r=>r.textContent.match(/NROTC|NS\\.41|Physics|History/)[0]+(r.classList.contains('subproject')?'*':'')).join()`),'NROTC,NS.41*,Physics,History','sidebar nests it under its parent');
  await evaluate(`window.marginHome('s0')`);await wait(300);
  assert.equal(await evaluate(`[...document.querySelectorAll('.class-tile h3')].map(h=>h.textContent).join()`),'NS.41','parent page lists its classes');
  await evaluate(`document.querySelector('.subject-classes .unit-add').click()`);await wait(200);
  assert.equal(await evaluate(`document.querySelector('#project-dialog select').value`),'s0','New class starts inside the parent');
  await evaluate(`document.querySelector('#project-dialog input').value='NS.42';document.querySelector('#project-dialog .primary').click()`);await wait(300);
  assert.equal(await evaluate(`state.projects.find(p=>p.name==='NS.42').parentId`),'s0');
  console.log('PASS: subjects can contain classes, which stay off the home page.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
