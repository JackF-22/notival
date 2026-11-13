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
  const click=label=>evaluate(`[...document.querySelectorAll('.recall-dialog button')].find(b=>b.textContent.trim().replace(/^\\d/,'').startsWith(${JSON.stringify(label)}))?.click()`);
  await evaluate(`localStorage.clear();(()=>{
    state.projects=[{id:'ru',name:'Russian',icon:'🇷🇺',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[],language:{code:'ru',name:'Russian',locale:'ru-RU'}}];
    state.notes=[];state.items=[];state.reviews={};state.reviewLog=[];state.suspended={};state.recallMood=null;
    state.vocab=[{id:'w1',term:'привет',meaning:'hello',sentence:'Привет, как дела?',projectId:'ru',added:1},{id:'w2',term:'спасибо',meaning:'thank you',projectId:'ru',added:2}];
    active=null;window.marginHome('ru')})()`);await wait(400);
  // 1 · recognition first
  await evaluate(`marginRecall.hub({project:state.projects[0]})`);await wait(150);
  assert.equal(await text('.recall-count'),'2');
  await click('Start');await wait(200);
  assert.match(await text('.recall-source'),/Vocabulary/);
  assert.match(await text('.recall-prompt'),/What does “(привет|спасибо)” mean\?/,'a new word is first asked as a recognition question');
  assert.equal(await count('.recall-card .translit-help'),0);
  const word=(await text('.recall-prompt')).includes('привет')?'hello':'thank you';
  await evaluate(`(()=>{const f=document.querySelector('.recall-card input');f.value=${JSON.stringify('')};f.focus()})()`);
  for(const c of word)await call('Input.dispatchKeyEvent',{type:'keyDown',key:c,text:c},sessionId);
  await click('Check');await wait(120);
  assert.match(await text('.recall-result'),/Correct/);
  await click('Good');await wait(150);
  const keys=await evaluate(`Object.keys(state.reviews)`);assert.equal(keys.length,1,'one review was recorded');assert.ok(keys.every(k=>k.startsWith('vocab:')&&k.endsWith(':know')),'only recognition so far: '+keys);
  await evaluate(`document.querySelector('.recall-dialog').close()`);
  // 2 · once recognition has stuck, saying the word is asked, typed with a Latin keyboard
  await evaluate(`(()=>{state.reviews['vocab:w1:know']={due:Date.now()-1000,interval:5,stability:5,difficulty:5,reps:3,lapses:0,reviewedAt:Date.now()-5*86400000,rating:'Good'};state.reviews['vocab:w2:know']={due:Date.now()+9*86400000,interval:9,stability:9,difficulty:5,reps:3,lapses:0,reviewedAt:Date.now(),rating:'Good'};marginRecall.hub({project:state.projects[0]})})()`);await wait(150);
  await click('Start');await wait(200);
  for(let i=0;i<4&&!(await text('.recall-prompt')).includes('How do you say');i++){await evaluate(`document.querySelector('.recall-card input')?.focus()`);await click('I don');await wait(100);await click('Again');await wait(100)}
  assert.match(await text('.recall-prompt'),/How do you say “hello”\?/,'the word is now asked in the other direction');
  assert.match(await text('.recall-hint'),/Type with Latin letters/);
  await evaluate(`document.querySelector('.recall-card input').focus()`);
  for(const c of 'privet')await call('Input.dispatchKeyEvent',{type:'keyDown',key:c,text:c},sessionId);
  assert.equal(await evaluate(`document.querySelector('.recall-card input').value`),'привет','typed with Latin letters');
  await click('Check');await wait(120);assert.match(await text('.recall-result'),/Correct/);
  await click('Good');await wait(100);
  await evaluate(`document.querySelector('.recall-dialog')?.close()`);
  // 3 · after that sticks, the word is asked inside its example sentence
  await evaluate(`(()=>{const old={due:Date.now()-1000,interval:6,stability:6,difficulty:5,reps:3,lapses:0,reviewedAt:Date.now()-6*86400000,rating:'Good'};state.reviews['vocab:w1:say']={...old};state.reviews['vocab:w1:know']={...old};state.reviews['vocab:w2:know']={...old,due:Date.now()+9*86400000};marginRecall.hub({project:state.projects[0]})})()`);await wait(150);
  await click('Start');await wait(200);
  for(let i=0;i<4&&!(await count('.recall-sentence'));i++){await click('I don');await wait(100);await click('Good');await wait(100)}
  assert.match(await text('.recall-sentence'),/, как дела\?/,'the sentence with the word left out');
  console.log('PASS: vocab in review — recognition first, saying it once that sticks, then the example sentence; Russian typed with a Latin keyboard.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
