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
  await evaluate(`state.projects=[{id:'bio',name:'Biology',units:[{id:'u',name:'Cells'}],materials:[],packs:[],assessments:[{id:'exam',title:'Midterm',date:'2026-12-10'}],checklist:[]}];state.notes=[{id:'n',projectId:'bio',title:'Cell notes',updated:1,blocks:[{id:'b',type:'text',text:'Membranes'}],nodes:[]}];window.marginShowProject('bio')`);
  assert.equal(await evaluate(`document.querySelectorAll('.feature-launcher').length`),0);
  assert.equal(await evaluate(`[...document.querySelectorAll('.subject-disclosure')].every(d=>d.open)`),true);
  assert.equal(await evaluate(`[...document.querySelectorAll('.subject-main-actions>button')].map(b=>b.textContent).slice(0,3).join('|')`),'＋ Note|＋ Test date|Attach materials');
  const fill=async(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await fill('[aria-label="New checklist item"]','HW3 due Friday at 11:59pm');
  assert.equal(await evaluate(`document.querySelector('.recognized-date').hidden`),false);
  assert.match(await evaluate(`document.querySelector('.recognized-date').textContent`),/11:59/);
  await evaluate(`document.querySelector('.checklist-add').requestSubmit()`);
  const parsed=await evaluate(`state.projects[0].checklist[0]`);
  assert.equal(parsed.title,'HW3');assert.equal(parsed.time,'23:59');assert.match(parsed.date,/^\d{4}-\d{2}-\d{2}$/);
  await evaluate(`document.querySelector('.subject-task input').click()`);
  assert.equal(await evaluate(`state.projects[0].checklist[0].done`),true);
  assert.equal(await evaluate(`document.querySelector('.student-check').classList.contains('just-completed')`),true);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.student-check input')).animationName`),'task-complete');
  await new Promise(r=>setTimeout(r,650));
  assert.equal(await evaluate(`document.querySelector('.subject-task').closest('.completed-list')!==null`),true);
  assert.equal(await evaluate(`document.querySelector('.completed-items').hidden`),false);
  await evaluate(`document.querySelector('.completed-items').open=true;document.querySelector('.clear-completed').click()`);
  assert.equal(await evaluate(`state.projects[0].checklist.length`),0);
  await evaluate(`document.querySelector('#toast button').click()`);
  assert.equal(await evaluate(`state.projects[0].checklist[0].done`),true);

  await evaluate(`document.querySelector('.subject-task input').click()`);
  assert.equal(await evaluate(`state.projects[0].checklist[0].done`),false);
  assert.equal(await evaluate(`document.querySelector('.student-check').classList.contains('just-completed')`),false);
  await new Promise(r=>setTimeout(r,30));
  await fill('[aria-label="New checklist item"]','Read Friday');
  await evaluate(`document.querySelector('[aria-label="Keep date phrase as text"]').click();document.querySelector('.checklist-add').requestSubmit()`);
  assert.equal(await evaluate(`state.projects[0].checklist[1].title`),'Read Friday');
  assert.equal(await evaluate(`state.projects[0].checklist[1].date`),'');
  await evaluate(`document.querySelector('[aria-label="Edit task: HW3"]').click()`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Due time · optional"]').value`),'23:59');
  await fill('[aria-label="Due time · optional"]','22:00');
  await evaluate(`document.querySelector('.student-dialog form').requestSubmit()`);
  assert.equal(await evaluate(`state.projects[0].checklist[0].time`),'22:00');
  await evaluate(`document.querySelector('.subject-add-menu').open=true;[...document.querySelectorAll('.subject-add-options button')].find(b=>b.textContent==='Test or assignment').click()`);
  await fill('[aria-label="Title"]','Essay due tomorrow at noon');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Due time · optional"]').value`),'12:00');
  await fill('[aria-label="Due time · optional"]','15:30');
  await evaluate(`document.querySelector('.student-dialog form').requestSubmit()`);
  assert.equal(await evaluate(`state.projects[0].assessments[1].title`),'Essay');
  assert.equal(await evaluate(`state.projects[0].assessments[1].time`),'15:30');
  // Editing an ordinary title must preserve an existing manual date.
  await evaluate(`document.querySelectorAll('.date-copy')[0].click()`);
  const existingDate=await evaluate(`document.querySelector('[aria-label="Due date"]').value`);
  await fill('[aria-label="Title"]','Revised title');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Due date"]').value`),existingDate);
  await evaluate(`document.querySelector('.student-dialog form').requestSubmit();persist()`);
  await new Promise(r=>setTimeout(r,400));await call('Page.reload',{},sessionId);
  for(let i=0;i<100;i++){if(await evaluate(`document.readyState==='complete'&&typeof state!=='undefined'&&!!window.marginShowProject`))break;await new Promise(r=>setTimeout(r,50))}
  assert.equal(await evaluate(`state.projects[0].checklist[0].time`),'22:00');
  await evaluate(`window.marginShowProject('bio')`);
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
  await evaluate(`document.querySelector('.subject-task input').click()`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.student-check input')).animationName`),'none');
  await call('Emulation.setDeviceMetricsOverride',{width:900,height:800,deviceScaleFactor:1,mobile:false},sessionId);
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  await evaluate(`document.querySelector('.subject-dates .active-items input').click()`);
  await new Promise(r=>setTimeout(r,40));
  assert.equal(await evaluate(`document.querySelector('.subject-dates .completed-list input').checked`),true);
  const beforeDates=await evaluate(`state.projects[0].assessments.length`);
  await evaluate(`document.querySelector('.subject-dates .completed-items').open=true;document.querySelector('.subject-dates .clear-completed').click()`);
  assert.equal(await evaluate(`state.projects[0].assessments.length`),beforeDates-1);
  assert.equal(await evaluate(`state.projects[0].checklist.length`),2);
  await evaluate(`document.querySelector('#toast button').click()`);
  assert.equal(await evaluate(`state.projects[0].assessments.length`),beforeDates);
  await evaluate(`state.projects[0].packs.push({id:'practice',title:'Practice pack',topics:[{id:'one',title:'Explain cells',done:false},{id:'two',title:'Explain membranes',done:false}],unitIds:[],noteIds:[],materialIds:[]});document.querySelector('[data-feature="tests"]').click();document.querySelector('.test-tile').click()`);
  await evaluate(`document.querySelector('.pack-checklist input').click()`);
  await new Promise(r=>setTimeout(r,40));
  assert.equal(await evaluate(`document.querySelector('.pack-checklist .completed-list input').checked`),true);
  await evaluate(`document.querySelector('.pack-checklist .completed-items').open=true;document.querySelector('.pack-checklist .clear-completed').click()`);
  assert.equal(await evaluate(`state.projects[0].packs[0].topics.length`),1);
  assert.equal(await evaluate(`state.projects[0].packs[0].topics[0].title`),'Explain membranes');
  console.log('PASS: balanced overview, completed grouping and clear/Undo, date recognition and opt-out, manual edits, checklist animation/reversal, reduced motion, persistence, and narrow layout.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
