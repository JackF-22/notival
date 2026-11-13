import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-schedule-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),20000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.SCHEDULE_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof marginSchedule!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const text=sel=>evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent||''`);
  const count=sel=>evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`(()=>{localStorage.clear();localStorage.setItem('notival.class.fullscreen','false');
    state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[],materials:[],packs:[],assessments:[],checklist:[]},{id:'zh',name:'Chinese',icon:'🀄',color:'#c06a3d',units:[],materials:[],packs:[],assessments:[],checklist:[]}];
    state.notes=[{id:'other',title:'Something else',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'o',type:'text',text:'x',html:'<p>x</p>'}]}];
    state.items=[];state.classSchedule=[];state.classHandled={};state.focusSessions=[];active='other';render();setMode('write')})()`);
  await wait(300);
  // a pretend clock: next Friday, at a time of the test's choosing
  await evaluate(`(()=>{const d=new Date();d.setDate(d.getDate()+(((5-d.getDay())+7)%7||7));d.setHours(0,0,0,0);window.FRIDAY=d.getTime();window.clockAt=(h,m)=>{const t=FRIDAY+(h*60+m)*60000;marginSchedule.setClock(()=>t);marginSchedule.check()}})()`);
  const openFocusMenu=()=>evaluate(`document.querySelector('#focus-menu').click()`).then(()=>wait(100));
  const menuItems=()=>evaluate(`[...document.querySelectorAll('.focus-popover .focus-item')].map(b=>b.querySelector('b').textContent+' | '+b.querySelector('small').textContent)`);

  // ── The timetable lives in the Focus menu ──
  await openFocusMenu();
  assert.deepEqual((await menuItems()).at(-1),'Class schedule… | Set the times your classes happen');
  await evaluate(`[...document.querySelectorAll('.focus-item')].find(b=>/Class schedule/.test(b.textContent)).click()`);await wait(150);
  assert.equal(await evaluate(`document.querySelector('.schedule-dialog')?.open`),true);
  assert.match(await text('.schedule-dialog'),/No classes yet/);
  // add Biology, Mon Wed Fri at 10:00 for 50 minutes
  await evaluate(`[...document.querySelectorAll('.schedule-dialog button')].find(b=>/Add a class/.test(b.textContent)).click()`);await wait(100);
  assert.equal(await count('.schedule-row'),1);
  await evaluate(`(()=>{const t=document.querySelector('.schedule-row input[type=time]');t.value='10:00';t.dispatchEvent(new Event('change'))})()`);
  assert.deepEqual(await evaluate(`JSON.parse(JSON.stringify(state.classSchedule.map(({subjectId,days,start,minutes})=>({subjectId,days,start,minutes}))))`),[{subjectId:'bio',days:[1,3,5],start:'10:00',minutes:50}]);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.schedule-row .schedule-day')].map(b=>b.textContent+(b.getAttribute('aria-pressed')==='true'?'*':'')).join(' ')`),'Mo* Tu We* Th Fr* Sa Su');
  // and Chinese on Tuesday and Friday at 1:30 for 75 minutes
  await evaluate(`[...document.querySelectorAll('.schedule-dialog button')].find(b=>/Add a class/.test(b.textContent)).click()`);await wait(100);
  await evaluate(`(()=>{const r=document.querySelectorAll('.schedule-row')[1];const s=r.querySelector('select');s.value='zh';s.dispatchEvent(new Event('change'));
    const days=[...r.querySelectorAll('.schedule-day')];days.find(b=>b.textContent==='Mo').click();days.find(b=>b.textContent==='We').click();days.find(b=>b.textContent==='Tu').click();
    const t=r.querySelector('input[type=time]');t.value='13:30';t.dispatchEvent(new Event('change'));const m=r.querySelector('input[type=number]');m.value='75';m.dispatchEvent(new Event('change'))})()`);
  assert.deepEqual(await evaluate(`JSON.parse(JSON.stringify(state.classSchedule[1]))`).then(e=>({subjectId:e.subjectId,days:e.days.sort(),start:e.start,minutes:e.minutes})),{subjectId:'zh',days:[2,5],start:'13:30',minutes:75});
  // a row that can't work is marked
  await evaluate(`(()=>{const m=document.querySelectorAll('.schedule-row')[1].querySelector('input[type=number]');m.value='1';m.dispatchEvent(new Event('change'))})()`);
  assert.equal(await evaluate(`document.querySelectorAll('.schedule-row')[1].classList.contains('is-invalid')`),true);
  await evaluate(`(()=>{const m=document.querySelectorAll('.schedule-row')[1].querySelector('input[type=number]');m.value='75';m.dispatchEvent(new Event('change'))})()`);
  assert.match(await text('.schedule-next'),/^Next: /);
  await shot('schedule');
  await evaluate(`[...document.querySelectorAll('.schedule-dialog button')].find(b=>b.textContent==='Done').click()`);await wait(100);

  // ── Nothing is offered until a class is near ──
  await evaluate(`clockAt(9,40)`);
  assert.equal(await count('#class-due'),0);
  await evaluate(`document.querySelector('#focus-menu').click();document.querySelector('#focus-menu').click()`);await wait(80);
  await openFocusMenu();
  assert.match((await menuItems()).at(-1),/Class schedule… \| Next: Biology, today 10am/);
  await evaluate(`document.querySelector('#focus-menu').click()`);await wait(60);

  // ── Five minutes before: "Biology starts at 10am" ──
  await evaluate(`clockAt(9,57)`);await wait(80);
  assert.equal(await count('#class-due'),1);
  assert.match(await text('#class-due strong'),/Biology starts at 10am/);
  assert.match(await text('#class-due small'),/10am–10:50am · opens today's Biology note/);
  await shot('due');
  await evaluate(`[...document.querySelectorAll('#class-due button')].find(b=>b.textContent==='Start class').click()`);await wait(300);
  // today's Biology note was made and opened, and class mode is running for the length of the class
  const made=await evaluate(`(()=>{const n=current();return {projectId:n.projectId,title:n.title,classDate:n.classDate,live:marginClass.isLive(),planned:marginClass.session()?.plannedMs/60000,banner:!!document.querySelector('#class-due')}})()`);
  assert.equal(made.projectId,'bio');assert.match(made.title,/^Biology · /);assert.match(made.classDate,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(made.live,true);assert.equal(made.planned,50,'starting before 10:00 gives the whole 50 minutes');assert.equal(made.banner,false);
  assert.equal(await evaluate(`Object.values(state.classHandled).join()`),'started');
  // write something worth asking about, then end the class
  await evaluate(`(()=>{const n=current(),b=n.blocks[0];b.text='The **mitochondrion** is the organelle that produces most of the cell\\'s ATP.\\n\\nOsmosis is the movement of water across a selectively permeable membrane.';b.html=RichEditor.fromMarkdown(b.text);render();setMode('write')})()`);await wait(150);
  await evaluate(`marginClass.end()`);await wait(250);

  // ── The wrap-up: sum it up, what's unclear, and questions to keep for Recall ──
  assert.equal(await evaluate(`document.querySelector('.class-summary')?.open`),true);
  const headings=await evaluate(`[...document.querySelectorAll('.class-summary .wrap-section h3')].map(h=>h.textContent)`);
  assert.deepEqual(headings,['Sum it up','Still unclear','Questions to keep']);
  const offered=await evaluate(`[...document.querySelectorAll('.class-summary .wrap-section:last-of-type .wrap-pick span')].map(s=>s.textContent)`);
  assert(offered.some(q=>/mitochondrion|Osmosis/i.test(q)),'questions come from what was written: '+offered);
  await evaluate(`(()=>{const [sum,open]=document.querySelectorAll('.class-summary textarea');sum.value='Organelles and moving water.';open.value='what does selectively permeable mean exactly?'})()`);
  await shot('wrap-up');
  const before=await evaluate(`state.items.length`);
  // keep all but the last question
  await evaluate(`(()=>{const boxes=[...document.querySelectorAll('.class-summary .wrap-section:last-of-type input')];boxes.at(-1).checked=false})()`);
  await evaluate(`document.querySelector('.class-summary').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,bubbles:true,cancelable:true}))`);await wait(300);
  assert.equal(await evaluate(`state.items.length`),before+offered.length-1,'the ticked questions went to Recall');
  assert.equal(await evaluate(`state.items.every(i=>i.noteId===current().id)`),true);
  assert.match(await evaluate(`current().blocks.at(-1).text`),/^## After class · .+\n\n\*\*Summary:\*\* Organelles and moving water\.\n\n\*\*Still unclear\*\*\n\n- what does selectively permeable mean exactly\?$/);
  assert.equal(await evaluate(`document.activeElement?.closest?.('.block')===[...document.querySelectorAll('#editor .block')].at(-1)`),true,'ready to flesh it out');
  await shot('after-class');

  // ── Once started, a class isn't offered again; waving one off works too ──
  await evaluate(`clockAt(10,5)`);
  assert.equal(await count('#class-due'),0);
  await evaluate(`clockAt(13,28)`);await wait(60);
  assert.match(await text('#class-due strong'),/Chinese starts at 1:30pm/);
  await evaluate(`[...document.querySelectorAll('#class-due button')].find(b=>b.textContent==='Not today').click()`);await wait(80);
  assert.equal(await count('#class-due'),0);
  await evaluate(`clockAt(13,40)`);
  assert.equal(await count('#class-due'),0,'not offered again today');
  assert.equal(await evaluate(`Object.values(state.classHandled).sort().join()`),'skipped,started');

  // ── A second Biology class the same day reuses today's note; the Focus menu offers it too ──
  await evaluate(`state.classSchedule.push({id:'later',subjectId:'bio',days:[5],start:'15:00',minutes:30});active='other';render();setMode('write')`);await wait(150);
  await evaluate(`clockAt(15,10)`);await wait(60);
  assert.match(await text('#class-due strong'),/Biology is on now/);
  await openFocusMenu();
  assert.match((await menuItems())[2],/^Start Biology now \| 3pm–3:30pm/);
  const notesBefore=await evaluate(`state.notes.length`);
  await evaluate(`[...document.querySelectorAll('.focus-item')].find(b=>/Start Biology now/.test(b.textContent)).click()`);await wait(250);
  assert.equal(await evaluate(`state.notes.length`),notesBefore,'no second note for the same subject and day');
  assert.equal(await evaluate(`current().projectId`),'bio');
  assert.equal(await evaluate(`marginClass.session().plannedMs/60000`),20,'starting ten minutes in leaves twenty');
  // skipping the wrap-up adds nothing
  const blocks=await evaluate(`current().blocks.length`);
  await evaluate(`marginClass.end()`);await wait(200);
  await evaluate(`[...document.querySelectorAll('.class-summary button')].find(b=>b.textContent==='Skip').click()`);await wait(150);
  assert.equal(await evaluate(`current().blocks.length`),blocks);

  // A meeting: its own note title each week, and just the note (no timer) when it's time.
  await evaluate(`(()=>{state.classSchedule=[{id:'m1',subjectId:'bio',days:[5],start:'16:00',minutes:60,title:'{iso} - CoStaff Meeting',timer:false}];state.classHandled={};state.notes=state.notes.filter(n=>!n.classDate);render()})()`);
  await evaluate(`clockAt(15,56)`);await wait(100);
  assert.equal(await text('#class-due .primary'),'Open note');
  await evaluate(`document.querySelector('#class-due .primary').click()`);await wait(250);
  assert.match(await evaluate(`current().title`),/^\d{4}-\d\d-\d\d - CoStaff Meeting$/);
  assert.equal(await evaluate(`marginClass.session()`),null,'no class timer for an item with the timer off');

  // The subject's own page is where meetings are set.
  await evaluate(`(()=>{state.classSchedule=[];window.marginHome('bio')})()`);await wait(300);
  assert.equal(await count('.subject-schedule'),1,'the subject page has a Schedule section');
  await evaluate(`[...document.querySelectorAll('.subject-schedule button')].find(b=>b.textContent==='+ Add').click()`);await wait(150);
  await evaluate(`(()=>{const t=document.querySelector('.subject-schedule .schedule-title');t.value='CoStaff Meeting';t.dispatchEvent(new Event('change'))})()`);
  assert.deepEqual(await evaluate(`state.classSchedule.map(e=>[e.subjectId,e.title])`),[['bio','{date} - CoStaff Meeting']],'the item belongs to this subject, and Date puts the date in front of its name');

  console.log('PASS: scheduled classes — timetable in the Focus menu, offered from just before the start, opens today\'s note and runs class mode for the rest of the class, once a day, and an after-class wrap-up that writes the note and keeps questions for Recall.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
