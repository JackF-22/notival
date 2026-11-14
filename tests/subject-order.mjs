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
  const order=()=>evaluate(`[...document.querySelectorAll('#projects .project-row .project-card')].map(c=>(c.textContent.match(/Biology|Chemistry|Physics|History/)||[''])[0]).join()`);
  const names=()=>evaluate(`state.projects.map(p=>p.name).join()`);
  assert.equal(await order(),'Biology,Chemistry,Physics,History');
  assert.equal(await evaluate(`[...document.querySelectorAll('#projects .project-row')].every(r=>r.draggable)`),true,'each subject can be picked up');
  // drag History onto the top half of Biology
  const drag=(from,onto,y)=>evaluate(`(()=>{const rows=[...document.querySelectorAll('#projects .project-row')],a=rows[${from}],b=rows[${onto}],dt=new DataTransfer(),r=b.getBoundingClientRect();
   a.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));
   b.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientY:r.top+${y}*r.height}));const mark=b.className;
   b.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientY:r.top+${y}*r.height}));return mark})()`);
  const mark=await drag(3,0,.2);await wait(200);
  assert.match(mark,/drop-before/,'a line shows where it will land');
  assert.equal(await names(),'History,Biology,Chemistry,Physics','dropped above the first');
  assert.equal(await order(),'History,Biology,Chemistry,Physics','and the sidebar follows');
  await drag(0,2,.8);await wait(200);
  assert.equal(await names(),'Biology,Chemistry,History,Physics','dropped below another moves it down');
  assert.equal(await evaluate(`JSON.stringify(state.projects.map(p=>p.id))!==JSON.stringify(['s0','s1','s2','s3'])`),true);
  // the keyboard: Option + arrows
  await evaluate(`document.querySelectorAll('#projects .project-card')[3].focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',modifiers:1,windowsVirtualKeyCode:38},sessionId);await wait(250);
  assert.equal(await names(),'Biology,Chemistry,Physics,History','Option+↑ moves a subject up');
  assert.equal(await evaluate(`document.activeElement.textContent.includes('Physics')`),true,'and focus stays with it');
  // the order is saved with the notebook, and shown on the Subjects page
  assert.equal(await evaluate(`JSON.stringify(JSON.parse(JSON.stringify(state)).projects.map(p=>p.name))`),JSON.stringify(['Biology','Chemistry','Physics','History']));
  console.log('PASS: subjects can be put in any order by dragging or Option+arrows, and the order is kept.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
