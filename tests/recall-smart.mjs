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
  const dayKey=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
  const DAY=86400000;await evaluate(`window.DAY=86400000`);
  await evaluate(`localStorage.clear();(()=>{
    state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',description:'',units:[],materials:[],packs:[],assessments:[{id:'m',title:'Midterm',kind:'test',date:'${dayKey(6)}'}],checklist:[]}];
    state.notes=[{id:'n1',title:'Cells',projectId:'bio',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b1',type:'text',text:'x',html:'<p>x</p>'}]}];
    state.items=Array.from({length:30},(_,i)=>({id:'q'+i,type:'qa',prompt:'Question '+i+'?',answer:'answer'+i,noteId:'n1',projectId:'bio',created:Date.now(),origin:'made'}));
    state.reviews={};state.reviewLog=[];state.suspended={};state.recallMood=null;active='n1';render()})()`);
  const openHub=async()=>{await evaluate(`marginRecall.hub({project:state.projects[0]})`);await wait(150)};
  // 1 · a fresh start: no memory panel yet, and the check-in asks how you feel
  await openHub();
  assert.equal(await count('.recall-memory'),0,'nothing to say about your memory before you have reviewed anything');
  assert.equal(await count('.recall-mood-chips .recall-chip'),3);
  assert.equal(await evaluate(`document.querySelector('.recall-chip[aria-pressed=true]').textContent`),'OK','OK unless you say otherwise');
  assert.match(await text('.recall-plan'),/in this session · about \d+ min · 10 new/);
  // 2 · tired: a lighter session with no new questions
  await evaluate(`[...document.querySelectorAll('.recall-chip')].find(b=>b.textContent==='Tired').click()`);await wait(150);
  assert.equal(await evaluate(`state.recallMood.value`),'tired');assert.equal(await evaluate(`state.recallMood.day`),dayKey(0));
  assert.match(await text('.recall-plan'),/light session/i);
  // fresh brings more
  await evaluate(`[...document.querySelectorAll('.recall-chip')].find(b=>b.textContent==='Fresh').click()`);await wait(150);
  assert.match(await text('.recall-plan'),/15 new|\b(1[0-9]|20) new/);
  await evaluate(`[...document.querySelectorAll('.recall-chip')].find(b=>b.textContent==='OK').click()`);await wait(100);
  // 3 · a session: it logs how long you took, the model's prediction and your mood; and the test date shortens the interval
  await evaluate(`[...document.querySelectorAll('.recall-actions button')].find(b=>b.textContent==='Start').click()`);await wait(200);
  assert.equal(await evaluate(`document.querySelector('.recall-card')!==null`),true);
  await evaluate(`document.querySelector('.recall-card input,.recall-card textarea')?.focus()`);
  await evaluate(`[...document.querySelectorAll('.recall-actions button')].find(b=>/know/i.test(b.textContent))?.click()`);await wait(100);
  assert.match(await text('.recall-exam'),/Midterm is in [67] days/,'it says a test is coming and that this will come back sooner');
  await evaluate(`[...document.querySelectorAll('.recall-grade')].find(b=>/Good/.test(b.textContent)).click()`);await wait(100);
  const logged=await evaluate(`JSON.stringify(state.reviewLog.at(-1))`).then(JSON.parse);
  assert.equal(logged.mood,'ok');assert.ok(logged.ms>=0,'the time you took is kept');assert.equal(logged.first,true);
  const first=await evaluate(`JSON.stringify(Object.values(state.reviews)[0])`).then(JSON.parse);
  assert.ok(first.stability>0&&first.difficulty>=1,'the item carries a memory model');
  await evaluate(`document.querySelector('.recall-dialog').close()`);
  // 4 · hesitation: a right answer that took far longer than usual suggests Hard
  await evaluate(`(()=>{state.reviewLog=Array.from({length:30},(_,i)=>({id:'q'+i,t:Date.now()-i*60000,rating:'Good',mode:'due',first:false,ms:3000}));
    state.reviews={};for(let i=0;i<5;i++)state.reviews['q'+i]={due:Date.now()-DAY,interval:3,stability:3,difficulty:5,reps:2,lapses:0,reviewedAt:Date.now()-4*DAY,rating:'Good'};window.__off=0;const real=performance.now.bind(performance);performance.now=()=>real()+window.__off;marginRecall.hub({project:state.projects[0]})})()`.replace('DAY','86400000'));await wait(150);
  await evaluate(`[...document.querySelectorAll('.recall-actions button')].find(b=>b.textContent==='Start').click()`);await wait(200);
  const prompt=await text('.recall-prompt');const idx=Number(prompt.match(/Question (\d+)/)[1]);
  await evaluate(`window.__off=30000`);
  await evaluate(`(()=>{const f=document.querySelector('.recall-card input');f.value='answer'+${idx};})()`);
  await evaluate(`[...document.querySelectorAll('.recall-actions button')].find(b=>b.textContent==='Check').click()`);await wait(120);
  assert.match(await text('.recall-grades > small'),/took a while/i,'it says why');
  assert.match(await evaluate(`document.querySelector('.recall-grade.is-suggested').textContent`),/Hard/,'and suggests Hard');
  await evaluate(`window.__off=0;document.querySelector('.recall-dialog').close()`);
  // 5 · a card that keeps slipping gets a banner, and can be set aside
  await evaluate(`(()=>{state.reviews={q7:{due:Date.now()-86400000,interval:0,stability:.5,difficulty:8,reps:0,lapses:5,reviewedAt:Date.now()-3*86400000,rating:'Again'}};state.reviewLog=[];marginRecall.setScope({project:state.projects[0]});marginRecall.start('quiz',1)})()`);await wait(200);
  const shown=await text('.recall-prompt');
  // answer whatever is first until the leech comes up
  for(let i=0;i<31&&!(await count('.recall-leech'));i++){
    await evaluate(`[...document.querySelectorAll('.recall-actions button')].find(b=>/know/i.test(b.textContent))?.click()`);await wait(60);
    if(await count('.recall-leech'))break;
    await evaluate(`[...document.querySelectorAll('.recall-grade')].find(b=>/Again/.test(b.textContent))?.click()`);await wait(60);
  }
  assert.equal(await count('.recall-leech'),1,'the banner shows for a card missed five times');
  assert.match(await text('.recall-leech'),/missed it 5 times/);
  await evaluate(`[...document.querySelectorAll('.recall-leech button')].find(b=>b.textContent==='Set aside').click()`);await wait(100);
  assert.equal(await evaluate(`state.suspended.q7`),true,'set aside takes it out of the rotation');
  await evaluate(`document.querySelector('.recall-dialog')?.close()`);
  // 6 · the Memory panel: retention, the week ahead, insights and readiness
  const logs=[];for(let i=0;i<60;i++)logs.push({id:'q'+(i%20),t:Date.now()-(i+1)*3600000*5,rating:i%5===0?'Again':'Good',mode:'due',first:false,ms:5000,r:.9,mood:'ok'});
  await evaluate(`(()=>{state.reviewLog=${JSON.stringify(logs)};state.suspended={};state.reviews={};for(let i=0;i<10;i++)state.reviews['q'+i]={due:Date.now()+(i%4)*86400000,interval:3,stability:4,difficulty:5,reps:3,lapses:i===0?4:0,reviewedAt:Date.now()-2*86400000,rating:'Good'};marginRecall.hub({project:state.projects[0]})})()`);await wait(200);
  assert.equal(await count('.recall-memory'),1);assert.match(await text('.recall-memory summary'),/Memory · \d+% recalled lately/);
  await evaluate(`document.querySelector('.recall-memory').open=true`);
  assert.equal(await count('.recall-forecast > div'),7,'seven days ahead');
  assert.equal(await count('.recall-tile'),3);
  assert.match(await text('.recall-exam-line'),/Midterm is in [67] days — if you stopped now you’d remember about \d+% of it/);
  assert.match(await text('.recall-memory'),/question keeps slipping/);
  console.log('PASS: smart review — how-are-you-feeling check-in sizes the session, hesitation and test dates shape the schedule, slipping cards are flagged, and the Memory panel shows retention, forecast and readiness.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
