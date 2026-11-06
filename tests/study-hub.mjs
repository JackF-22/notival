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
    const P=StudyPlanModel,d=n=>P.addDays(P.key(new Date()),n),now=Date.now(),DAY=864e5;
    state.projects=[
     {id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[{id:'u1',name:'Cells'},{id:'u2',name:'Energy'}],materials:[],assessments:[],checklist:[],overview:{checklist:true,dates:true,recent:true,shortcuts:true},
      packs:[{id:'p1',title:'Midterm',date:d(8),unitIds:['u1','u2'],noteIds:[],materialIds:[],topics:[]}]},
     {id:'chem',name:'Chemistry',icon:'⚗️',color:'#c06030',units:[],materials:[],assessments:[],checklist:[],overview:{checklist:true,dates:true,recent:true,shortcuts:true},
      packs:[{id:'p2',title:'Quiz 1',date:d(3),unitIds:[],noteIds:['n3'],materialIds:[],topics:[]}]}];
    state.projects.push({id:'nlp',name:'NLP',icon:'🗣️',color:'#7669dd',units:[{id:'t1',name:'Tokenization'}],materials:[],packs:[],checklist:[],overview:{checklist:true,dates:true,recent:true,shortcuts:true},
      assessments:[{id:'a1',title:'NLP midterm',kind:'test',date:d(5),done:false},{id:'a2',title:'HW3',kind:'assignment',date:d(2),done:false}]});
    const note=(id,title,projectId,unitId,flags=[])=>({id,title,projectId,unitId,updated:now,pinned:false,nodes:[],flags,blocks:[{id:'b'+id,type:'text',text:'About '+title,html:'<p>About</p>'}]});
    state.notes=[note('n1','Membranes','bio','u1'),note('n2','Respiration','bio','u2',[{id:'f1',quote:'why twice per glucose',status:'open',created:2,comment:'twice?'}]),note('n3','Moles','chem',null),note('n4','Tokens','nlp','t1')];
    state.items=[{id:'i1',type:'qa',prompt:'What is osmosis?',answer:'Water moving.',noteId:'n1',projectId:'bio',unitId:'u1',created:now},{id:'i2',type:'qa',prompt:'Where is the Krebs cycle?',answer:'Matrix.',noteId:'n2',projectId:'bio',unitId:'u2',created:now}];
    state.reviews={i2:{due:now-DAY,interval:1,ease:1.6,reps:2,lapses:3,reviewedAt:now-8*DAY,rating:'Again'}};
    // Only Biology has a plan; Chemistry's quiz does not
    const areas=window.marginStudyPlan.areasOf(state.projects[0],state.projects[0].packs[0]);
    state.projects[0].packs[0].plan={settings:{weekdays:[0,1,2,3,4,5,6],minutes:45,confidence:{}},created:now,sessions:StudyPlanModel.build({from:P.key(new Date()),test:d(8),areas}).sessions};
    active=null;render();
  })()`);
  await wait(250);
  const q=expr=>evaluate(expr);

  // A Study entry sits at the top of the sidebar and opens the hub
  assert.equal(await q(`!!document.querySelector('#study-nav')`),true);
  await q(`document.querySelector('#study-nav').click()`);await wait(250);
  assert.equal(await q(`document.querySelector('#workspace-home').hidden`),false);
  assert.equal(await q(`document.querySelector('#workspace-home').dataset.hub`),'study');
  assert.equal(await q(`document.querySelector('#study-nav').classList.contains('is-here')`),true);
  assert.equal(await q(`document.querySelector('#all').classList.contains('active')`),false);
  assert.equal(await q(`document.querySelector('.study-hub h1').textContent`),'Study');
  await shot('hub');

  // Today shows the Biology plan's session, with its tasks; Chemistry offers a plan
  const today=await q(`[...document.querySelectorAll('.hub-card')].find(c=>c.querySelector('h2').textContent==='Today').textContent`);
  assert.match(today,/Biology · Midterm/);assert.match(today,/Learn & review/);

  // Coming up lists both tests soonest first, with plan state
  const coming=await q(`[...document.querySelectorAll('.hub-card')].find(c=>c.querySelector('h2').textContent==='Coming up').textContent`);
  assert.ok(coming.indexOf('Quiz 1')<coming.indexOf('Midterm'));
  assert.match(coming,/in 3 days · no plan/);assert.match(coming,/in 8 days · 0\/\d+ sessions/);

  // Recall counts questions across subjects
  const recall=await q(`[...document.querySelectorAll('.hub-card')].find(c=>c.querySelector('h2').textContent==='Recall').textContent`);
  assert.match(recall,/2 questions ready/);assert.match(recall,/Biology/);assert.match(recall,/Import from AI/);

  // Flags across notes, and weak spots ranked with reasons
  assert.match(await q(`[...document.querySelectorAll('.hub-card')].find(c=>c.querySelector('h2').textContent==='To clarify').textContent`),/twice\?/);
  const weak=await q(`[...document.querySelectorAll('.hub-card')].find(c=>c.querySelector('h2').textContent==='Weak spots').textContent`);
  assert.match(weak,/Energy/);assert.match(weak,/unclear passage/);

  // Leaving for a subject drops the hub, coming back restores it
  await q(`marginHome('bio')`);await wait(200);
  assert.equal(await q(`document.querySelector('#workspace-home').dataset.hub||''`),'');
  assert.equal(await q(`document.querySelector('#study-nav').classList.contains('is-here')`),false);
  assert.equal(await q(`!document.querySelector('.study-hub')`),true);
  await q(`document.querySelector('#study-nav').click()`);await wait(200);

  // Ticking today's session on the hub saves it and the hub keeps showing it
  await q(`document.querySelector('.hub-card .plan-session input').click()`);await wait(150);
  assert.equal(await q(`state.projects[0].packs[0].plan.sessions.filter(s=>s.done).length`),1);

  // Planning the unplanned test opens the planner
  await q(`[...document.querySelectorAll('.hub-card')].find(c=>c.querySelector('h2').textContent==='Coming up').querySelector('.hub-row button').click()`);await wait(150);
  assert.equal(await q(`document.querySelector('.study-plan-dialog').open`),true);
  // Tests added as plain dates (the NLP case) appear in Coming up too; assignments do not
  await q(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('#study-nav').click()`);await wait(200);
  const comingNow=()=>q(`[...document.querySelectorAll('.hub-card')].find(c=>c.querySelector('h2').textContent==='Coming up').textContent`);
  let c=await comingNow();
  assert.match(c,/NLP midterm/);assert.match(c,/NLP · in 5 days · no plan/);assert.doesNotMatch(c,/HW3/);
  assert.ok(c.indexOf('Quiz 1')<c.indexOf('NLP midterm')&&c.indexOf('NLP midterm')<c.indexOf('Midterm'));

  // Plan it on a bare test opens the planner; cancelling leaves the subject untouched
  const planRow=name=>q(`[...document.querySelectorAll('.hub-row')].find(r=>r.textContent.includes(${JSON.stringify(name)})).querySelector('button').click()`);
  await planRow('NLP midterm');await wait(150);
  assert.equal(await q(`document.querySelector('.study-plan-dialog').open`),true);
  assert.match(await q(`document.querySelector('.study-plan-dialog').textContent`),/Based on everything in NLP/);
  assert.equal(await q(`state.projects.find(p=>p.id==='nlp').packs.length`),0);
  await q(`document.querySelector('.study-plan-dialog').close()`);
  // Saving it creates a linked pack, and the test is no longer listed twice
  await planRow('NLP midterm');await wait(150);
  await q(`document.querySelector('.study-plan-dialog form').requestSubmit()`);await wait(250);
  const nlp=JSON.parse(await q(`JSON.stringify(state.projects.find(p=>p.id==='nlp').packs)`));
  assert.equal(nlp.length,1);assert.equal(nlp[0].fromAssessmentId,'a1');assert.ok(nlp[0].plan.sessions.length>=4);
  await q(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('#study-nav').click()`);await wait(200);
  c=await comingNow();assert.equal(c.split('NLP midterm').length-1,1);assert.match(c,/NLP · in 5 days · 0\/\d+ sessions/);

  // Adding a test is a clear, visible action, not a dropdown item
  assert.equal(await q(`document.querySelector('.hub-add-test').textContent`),'＋ Add a test');
  await q(`document.querySelector('.hub-add-test').click()`);await wait(150);
  assert.equal(await q(`document.querySelector('.add-test-dialog').open`),true);
  assert.equal(await q(`document.querySelector('.add-test-dialog [aria-label=Subject]').options.length`),3);
  await shot('add-test');
  await q(`(()=>{const d=document.querySelector('.add-test-dialog'),set=(sel,v,ev='input')=>{const n=d.querySelector(sel);n.value=v;n.dispatchEvent(new Event(ev,{bubbles:true}))};
    set('[aria-label=Subject]','bio','change');set('[aria-label="Test name"]','Final exam');set('[aria-label="Test date"]',StudyPlanModel.addDays(StudyPlanModel.key(new Date()),20));
    d.querySelector('[data-unit=u2]').click();d.querySelector('.add-test-plan input').checked=false})()`);
  await q(`document.querySelector('.add-test-dialog form').requestSubmit()`);await wait(250);
  const finalPack=JSON.parse(await q(`JSON.stringify(state.projects.find(p=>p.id==='bio').packs.find(p=>p.title==='Final exam'))`));
  assert.deepEqual(finalPack.unitIds,['u1']);assert.equal(finalPack.noteIds.length,0);assert.equal(await q(`document.querySelector('.add-test-dialog').open`),false);
  assert.match(await comingNow(),/Final exam/);

  // The subject page has its own visible button, preselecting that subject
  await q(`marginHome('chem')`);await wait(250);
  assert.equal(await q(`[...document.querySelectorAll('.subject-main-actions button')].some(b=>b.textContent==='＋ Test date')`),true);
  await q(`[...document.querySelectorAll('.subject-main-actions button')].find(b=>b.textContent==='＋ Test date').click()`);await wait(120);
  assert.equal(await q(`document.querySelector('.add-test-dialog [aria-label=Subject]').value`),'chem');
  await q(`document.querySelector('.add-test-dialog').close()`);

  // Home and Study are a matching pair of buttons, and the current one is filled in
  await q(`document.querySelector('#study-nav').click()`);await wait(150);
  assert.equal(await q(`document.querySelector('#study-nav').classList.contains('is-here')`),true);
  assert.equal(await q(`document.querySelector('#home-button').classList.contains('is-here')`),false);
  assert.equal(await q(`getComputedStyle(document.querySelector('#study-nav')).borderTopWidth`),'1px');
  await shot('hub-nav');
  await q(`document.querySelector('#home-button').click()`);await wait(200);
  assert.equal(await q(`document.querySelector('#home-button').classList.contains('is-here')`),true);
  assert.equal(await q(`document.querySelector('#study-nav').classList.contains('is-here')`),false);
  // Subjects can be left out of Study
  await q(`document.querySelector('#study-nav').click()`);await wait(200);
  assert.equal(await q(`document.querySelector('.hub-subjects-button').textContent`),'Subjects');
  await q(`document.querySelector('.hub-subjects-button').click()`);await wait(100);
  assert.equal(await q(`document.querySelector('.hub-chooser').open`),true);
  assert.equal(await q(`document.querySelectorAll('.hub-subject input').length`),3);
  await q(`[...document.querySelectorAll('.hub-subject')].find(r=>r.textContent.includes('Chemistry')).querySelector('input').click()`);await wait(150);
  assert.equal(await q(`state.projects.find(p=>p.id==='chem').excludeFromStudy`),true);
  await q(`document.querySelector('.hub-chooser').close()`);
  assert.equal(await q(`document.querySelector('.hub-subjects-button').textContent`),'Subjects · 2 of 3');
  const page=await q(`document.querySelector('.study-hub').textContent`);
  assert.doesNotMatch(page,/Quiz 1/);assert.doesNotMatch(page,/Chemistry/);assert.doesNotMatch(page,/Moles/);
  assert.match(page,/NLP midterm/);assert.match(page,/Biology/);
  await shot('hub-hidden');
  // Everything-due recall leaves the hidden subject out; its own page still has everything
  await q(`state.items.push({id:'chemq',type:'qa',prompt:'What is a mole?',answer:'6.02e23',noteId:'n3',projectId:'chem',unitId:null,created:Date.now()});render=render;document.querySelector('.hub-chooser')&&0`);
  await q(`marginRecall.setScope({exclude:['chem']});window.__scoped=RecallModel.collect(state,{exclude:new Set(['chem'])}).map(i=>i.id)`);
  assert.equal(await q(`__scoped.includes('chemq')`),false);assert.equal(await q(`RecallModel.collect(state,{projectId:'chem'}).some(i=>i.id==='chemq')`),true);
  // The subject's own settings carry the same switch
  await q(`marginEditProject(state.projects.find(p=>p.id==='chem'))`);await wait(120);
  const label=await q(`[...document.querySelectorAll('.student-dialog[open] label')].find(l=>/Show this subject in Study/.test(l.textContent))?.querySelector('input').checked`);
  assert.equal(label,false);
  await q(`[...document.querySelectorAll('.student-dialog[open] label')].find(l=>/Show this subject in Study/.test(l.textContent)).querySelector('input').click()`);
  await q(`document.querySelector('.student-dialog[open] form').requestSubmit()`);await wait(200);
  assert.equal(await q(`!!state.projects.find(p=>p.id==='chem').excludeFromStudy`),false);
  // Hiding everything says so and offers a way back
  await q(`state.projects.forEach(p=>p.excludeFromStudy=true);document.querySelector('#study-nav').click()`);await wait(200);
  assert.match(await q(`document.querySelector('.study-hub').textContent`),/Every subject is switched off/);
  await q(`state.projects.forEach(p=>delete p.excludeFromStudy)`);
  console.log('PASS: the Study hub gathers today, tests, recall, flags and weak spots across subjects.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
