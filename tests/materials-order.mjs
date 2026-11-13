import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-matorder-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),20000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value};
  const mouse=(type,x,y)=>call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:1},sessionId);
  const key=async name=>{const code={ArrowUp:38,ArrowDown:40}[name];for(const type of ['rawKeyDown','keyUp'])await call('Input.dispatchKeyEvent',{type,key:name,code:name,windowsVirtualKeyCode:code},sessionId)};
  for(let i=0;i<100&&!await evaluate('typeof marginSubjectOverview!=="undefined"');i++)await wait(50);
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate(`document.querySelector('#launch-screen')?.remove();state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[],packs:[],assessments:[],checklist:[],materials:['Lecture 1.pdf','Lecture 2.pdf','Lecture 3.pdf','Lecture 4.pdf'].map((n,i)=>({id:'m'+i,name:n,path:'/x/'+n}))}];state.notes=[];render()`);
  await wait(150);
  const showMaterials=async()=>{await evaluate(`marginSubjectOverview('bio')`);await wait(200);await evaluate(`[...document.querySelectorAll('button')].find(b=>/^Materials/.test(b.textContent.trim())).click()`);await wait(200)};
  await showMaterials();
  const page=()=>evaluate(`[...document.querySelectorAll('.material-list .resource-title')].map(b=>b.textContent.replace(/\\.pdf$/,'')).join(',')`);
  const saved=()=>evaluate(`state.projects[0].materials.map(m=>m.name.replace(/\\.pdf$/,'')).join(',')`);
  const numbers=()=>evaluate(`[...document.querySelectorAll('.material-list .material-order')].map(n=>n.textContent).join(',')`);
  const grips=()=>evaluate(`[...document.querySelectorAll('.material-grip')].map(g=>{const b=g.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})`);
  const rows=()=>evaluate(`[...document.querySelectorAll('.material-list .student-resource')].map(r=>{const b=r.getBoundingClientRect();return [b.top,b.bottom]})`);
  const drag=async(from,toY)=>{const [x,y]=(await grips())[from];await mouse('mouseMoved',x,y);await mouse('mousePressed',x,y);for(let i=1;i<=10;i++)await mouse('mouseMoved',x,y+(toY-y)*i/10);await mouse('mouseReleased',x,toY);await wait(150)};

  assert.equal(await page(),'Lecture 1,Lecture 2,Lecture 3,Lecture 4');
  assert.equal(await numbers(),'1,2,3,4','each lecture shows its place in the order');

  // Drag the third lecture above the first one: it lands at the very top, past the selection bar that also lives in the list.
  await drag(2,(await rows())[0][0]+3);
  assert.equal(await page(),'Lecture 3,Lecture 1,Lecture 2,Lecture 4');
  assert.equal(await saved(),'Lecture 3,Lecture 1,Lecture 2,Lecture 4','the new order is saved');
  assert.equal(await numbers(),'1,2,3,4');
  assert.equal(await evaluate(`document.querySelector('.material-reordering')`),null,'the row does not stay lifted');
  assert.equal(await evaluate(`[...document.querySelectorAll('.material-list .student-resource')].every(r=>r.draggable)`),true,'rows can still be dragged onto units afterwards');

  // Drag the top one below the last row.
  await drag(0,(await rows()).at(-1)[1]+20);
  assert.equal(await saved(),'Lecture 1,Lecture 2,Lecture 4,Lecture 3');

  // Keyboard: focus a grip and move it with the arrow keys.
  await evaluate(`document.querySelectorAll('.material-grip')[3].focus()`);
  await key('ArrowUp');await key('ArrowUp');
  assert.equal(await saved(),'Lecture 1,Lecture 3,Lecture 2,Lecture 4');
  assert.equal(await evaluate(`document.activeElement.closest('.student-resource').querySelector('.resource-title').textContent`),'Lecture 3.pdf','focus stays on the moved lecture');
  await key('ArrowUp');await key('ArrowUp');
  assert.equal(await saved(),'Lecture 3,Lecture 1,Lecture 2,Lecture 4','moving past the top does nothing');

  // The order is kept when the view is opened again.
  await evaluate(`marginHome(null)`);await wait(150);await showMaterials();
  assert.equal(await page(),'Lecture 3,Lecture 1,Lecture 2,Lecture 4');
  console.log('Materials order tests passed');
}finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
