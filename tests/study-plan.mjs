import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-editor-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result||{})}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),15000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.RECALL_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof FlagsModel!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const clickText=(sel,text)=>evaluate(`(()=>{const n=[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!n)throw Error('missing '+${JSON.stringify(text)});n.click();return true})()`);
  const select=(needle,length)=>evaluate(`(()=>{const rich=document.querySelector('#editor .rich-text');const walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT);let n,hit;while(n=walker.nextNode()){const i=n.data.indexOf(${JSON.stringify(needle)});if(i>=0){hit=[n,i];break}}if(!hit)throw Error('no text '+rich.textContent);const r=document.createRange();r.setStart(hit[0],hit[1]);r.setEnd(hit[0],hit[1]+${length});const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
  const hotkey=()=>evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyU',key:'u',shiftKey:true,metaKey:true,bubbles:true,cancelable:true}))`);
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`(()=>{
    const P=StudyPlanModel,d=n=>P.addDays(P.key(new Date()),n);
    state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[{id:'u1',name:'Unit 1 · Cells'},{id:'u2',name:'Unit 2 · Energy'}],materials:[],assessments:[],checklist:[],overview:{checklist:true,dates:true,recent:true,shortcuts:true},
      packs:[{id:'p1',title:'Midterm',date:d(9),unitIds:['u1','u2'],noteIds:[],materialIds:[],topics:[]}]}];
    const note=(id,title,unitId,flags=[])=>({id,title,projectId:'bio',unitId,updated:Date.now(),pinned:false,nodes:[],flags,blocks:[{id:'b'+id,type:'text',text:'Words about '+title,html:'<p>Words</p>'}]});
    state.notes=[note('n1','Membranes','u1'),note('n2','Respiration','u2',[{id:'f1',quote:'why twice',status:'open',created:1}])];
    state.items=[];state.reviews={};active=null;render();
    window.__s=state.projects[0];window.__p=__s.packs[0];
    marginShowPack(__s,__p);
  })()`);
  await wait(200);
  const q=expr=>evaluate(expr);

  // A pack with a date and no plan offers one
  assert.match(await q(`document.querySelector('.study-plan-empty').textContent`),/Your test is in 9 days/);
  await q(`[...document.querySelectorAll('.study-plan-empty button')].find(b=>b.textContent==='Plan my studying').click()`);await wait(120);
  assert.equal(await q(`document.querySelector('.study-plan-dialog').open`),true);
  assert.equal(await q(`document.querySelectorAll('.plan-area').length`),2);
  assert.match(await q(`document.querySelector('.plan-area:nth-child(2)').textContent`),/1 unclear passage/);   // open flags are surfaced
  assert.equal(await q(`document.querySelector('.study-plan-dialog input[type=date]').value`),await q(`__p.date`));
  const before=await q(`document.querySelectorAll('.plan-line').length`);assert.equal(before,9);
  await shot('plan-setup');

  // Fewer study days, shakier unit: the preview follows
  await q(`document.querySelectorAll('.plan-day')[0].click();document.querySelectorAll('.plan-day')[6].click()`);   // drop weekends
  assert.ok(await q(`document.querySelectorAll('.plan-line').length`)<=9);
  await q(`document.querySelector('.plan-area [data-value="1"]').click()`);
  assert.equal(await q(`document.querySelector('.plan-area [data-value="1"]').getAttribute('aria-pressed')`),'true');
  await q(`document.querySelector('.study-plan-dialog form').requestSubmit()`);await wait(250);
  assert.equal(await q(`__p.plan.sessions.length>=5`),true);
  assert.equal(await q(`__p.plan.settings.confidence['unit:u1']`),1);
  assert.equal(await q(`__p.plan.sessions.at(-1).kind`),'final');
  assert.equal(await q(`document.querySelector('.study-plan-dialog').open`),false);
  assert.match(await q(`document.querySelector('.study-plan').textContent`),/Study plan · 0 of \d+ sessions/);
  await shot('plan-pack');

  // The subject page shows today's work and lets you tick it off
  await q(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.marginHome('bio')`);await wait(250);
  const widget=await q(`document.querySelector('.subject-plan')?.textContent||''`);
  assert.match(widget,/Midterm · in 9 days/);
  await shot('plan-widget');

  // Falling behind offers a catch-up that rebuilds from today
  await q(`(()=>{const P=StudyPlanModel;__p.plan.sessions.forEach((s,i)=>{if(i<2)s.date=P.addDays(P.key(new Date()),-5+i)});marginShowPack(__s,__p)})()`);await wait(150);
  assert.match(await q(`document.querySelector('.plan-behind')?.textContent||''`),/2 sessions behind/);
  await q(`document.querySelector('.plan-behind button').click()`);await wait(200);
  assert.equal(await q(`document.querySelector('.plan-behind')`),null);
  assert.equal(await q(`__p.plan.sessions.every(s=>s.date>=StudyPlanModel.key(new Date()))`),true);
  await shot('plan-caught-up');

  // Ticking a session marks it done and updates the count
  await q(`document.querySelector('.study-plan .plan-session input').click()`);await wait(200);
  assert.equal(await q(`__p.plan.sessions.filter(s=>s.done).length`),1);
  assert.match(await q(`document.querySelector('.study-plan h3').textContent`),/1 of \d+ sessions/);

  // Starting today's session opens practice on just that area's notes
  await q(`(()=>{window.__started=null;window.marginReviewNotes=(name,notes)=>{window.__started={name,ids:notes.map(n=>n.id)}};__p.plan.sessions.find(s=>!s.done).date=StudyPlanModel.key(new Date());marginShowPack(__s,__p)})()`);await wait(150);
  await q(`document.querySelector('.study-plan .plan-session button.primary').click()`);
  assert.match(await q(`__started.name`),/Midterm · /);assert.ok(await q(`__started.ids.length>=1`));
  console.log('PASS: the study planner asks, schedules back from the test date, shows today on the subject page, catches up and starts a session.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
