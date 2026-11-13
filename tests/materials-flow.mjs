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
  await call('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const mouse=(type,x,y,buttons=1)=>call('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons,clickCount:1},sessionId);
  const keyCodes={Backspace:8,Delete:46,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Enter:13};
  const key=async name=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:keyCodes[name]},sessionId);await wait(50)};
  const type=async text=>{await call('Input.insertText',{text},sessionId);await wait(50)};
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(100);
  const note=async html=>{await evaluate(`current().blocks[0].html=${JSON.stringify(html)};render()`);await wait(250)};
  const rect=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}})()`);
  const html=()=>evaluate(`(()=>{const c=document.querySelector('.rich-text').cloneNode(true);c.querySelectorAll('.equation').forEach(q=>{q.replaceChildren();q.removeAttribute('title')});return c.innerHTML.replace(/ src="data:[^"]*"/g,' src=…')})()`);
  const caret=(selector,offset)=>evaluate(`(()=>{const e=document.querySelector('.rich-text');e.focus();const n=e.querySelector(${JSON.stringify(selector)}),t=n.firstChild.nodeType===3?n.firstChild:n,r=document.createRange();r.setStart(t,${offset});r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);e.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}))})()`);
  const select=(selector,from,to)=>evaluate(`(()=>{const e=document.querySelector('.rich-text');e.focus();const t=e.querySelector(${JSON.stringify(selector)}).firstChild,r=document.createRange();r.setStart(t,${from});r.setEnd(t,${to});getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  const picture=await evaluate(`(()=>{const c=document.createElement('canvas');c.width=300;c.height=300;const x=c.getContext('2d');x.fillStyle='#9bc';x.fillRect(0,0,300,300);return c.toDataURL('image/png')})()`);

  const text=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent||''`);
  const count=selector=>evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const click=label=>evaluate(`[...document.querySelectorAll('.stories-page button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)}))?.click()`);
  const sent=()=>evaluate(`JSON.stringify(window.__sent)`).then(JSON.parse);
  // A stand-in for the native side: remember what the page asks for.
  await evaluate(`document.querySelector('#launch-screen')?.remove();(()=>{state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',description:'',units:[{id:'u1',name:'Cells'},{id:'u2',name:'Genetics'}],packs:[],assessments:[],checklist:[],materials:['A','B','C'].map((n,i)=>({id:'m'+i,name:n+'.pdf',path:'/x/'+n+'.pdf',unitId:null,added:1}))}];state.notes=[];state.items=[];render()})()`);await wait(200);
  await evaluate(`window.marginSubjectTab('bio','materials')`);await wait(200);
  assert.equal(await count('.material-select-all'),1);
  // Select all, then one pick in the bar moves every file
  await evaluate(`document.querySelector('.material-select-all').click()`);await wait(100);
  assert.equal(await text('.filing-selection strong'),'3 selected');
  assert.equal(await count('.filing-selection select'),1,'a unit picker sits in the selection bar');
  await evaluate(`(()=>{const s=document.querySelector('.filing-selection select');s.value='u2';s.dispatchEvent(new Event('change'))})()`);await wait(200);
  assert.equal(await evaluate(`state.projects[0].materials.map(m=>m.unitId).join(',')`),'u2,u2,u2','all three files moved in one step');
  // Files attached from the subject ask which unit, once
  await evaluate(`window.marginMaterialsAttached({subjectID:'bio',unitID:'',files:[{name:'D.pdf',path:'/x/D.pdf'},{name:'E.pdf',path:'/x/E.pdf'}]})`);await wait(200);
  assert.equal(await count('.unit-choice'),2);
  await evaluate(`document.querySelectorAll('.unit-choice')[0].click()`);await wait(200);
  assert.equal(await evaluate(`state.projects[0].materials.slice(3).map(m=>m.unitId).join(',')`),'u1,u1','both new files go to the chosen unit');
  // Attaching inside a unit needs no question
  await evaluate(`window.marginMaterialsAttached({subjectID:'bio',unitID:'u1',files:[{name:'F.pdf',path:'/x/F.pdf'}]})`);await wait(200);
  assert.equal(await evaluate(`!!document.querySelector('.unit-choice')?.closest('dialog')?.open`),false,'no question when you are already inside a unit');assert.equal(await evaluate(`state.projects[0].materials[5].unitId`),'u1');
  // Remove a unit from its own Add menu, with Undo
  await evaluate(`window.marginSubjectTab('bio','overview')`);await wait(150);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Cells'))?.click()`);await wait(250);
  await evaluate(`[...document.querySelectorAll('.subject-add-options button')].find(b=>b.textContent==='Remove unit').click()`);await wait(200);
  assert.deepEqual(await evaluate(`state.projects[0].units.map(u=>u.id)`),['u2']);
  assert.equal(await evaluate(`state.projects[0].materials.filter(m=>m.unitId==='u1').length`),0,'its materials are kept, unsorted');
  console.log('PASS: materials — select all, assign a whole selection to a unit in one step, which-unit prompt after attaching, remove a unit from the Add menu.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
