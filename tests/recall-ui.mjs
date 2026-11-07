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
const shots=process.env.RECALL_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof RecallModel!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const key=(k,target='.recall-dialog')=>evaluate(`document.querySelector(${JSON.stringify(target)}).dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(k)},bubbles:true}))`);
  const click=sel=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(sel)});if(!n)throw Error('missing '+${JSON.stringify(sel)});n.click();return true})()`);
  const clickText=(sel,text)=>evaluate(`(()=>{const n=[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!n)throw Error('missing '+${JSON.stringify(text)});n.click();return true})()`);
  const text=sel=>evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent||''`);
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`(()=>{
    state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[{id:'u1',name:'Cells'}],materials:[],packs:[],assessments:[],checklist:[]}];
    const note=(id,title,text,unitId)=>({id,title,projectId:'bio',unitId,updated:Date.now(),pinned:false,nodes:[],blocks:[{id:id+'b',type:'text',text}]});
    state.notes=[
     note('n1','Organelles','Q: What organelle makes most of the cell’s ATP?\\nA: The mitochondrion\\n\\nThe {{nucleus::control centre}} stores the cell’s DNA.\\n\\nThe {{ribosome}} builds proteins from amino acids.','u1'),
     note('n2','Membranes','# Osmosis\\n\\nOsmosis is the movement of water across a selectively permeable membrane from low to high solute concentration, which evens out the concentration on both sides.\\n\\nThe **phospholipid bilayer** forms the basic structure of every cell membrane.\\n\\nDiffusion is the net movement of particles from a region of high concentration to a region of low concentration.','u1'),
     note('n3','Energy','Q: Where does glycolysis happen?\\nA: The cytoplasm\\n\\nQ: Which molecule carries energy in the cell?\\nA: ATP',null)];
    state.items=[];state.reviews={};active='n1';render();
    for(const i of RecallModel.collect(state,{projectId:'bio'}))state.reviews[i.id]={due:1,interval:1,reviewedAt:1,rating:'Good',reps:1,ease:2.5};
  })()`);
  await wait(200);

  // Hub counts every item written in note markup; plain paragraphs (the Membranes note) are not turned into questions on their own
  await evaluate(`marginRecall.hub({project:state.projects[0]})`);await wait(120);
  assert.equal(await text('.recall-count'),'5');
  assert.match(await text('.recall-dialog'),/5 in total/);
  await shot('hub');
  assert.equal(await evaluate(`!!document.querySelector('.recall-dialog select[aria-label=Unit]')`),true);

  // Review: type a cloze answer, get checked, grade with the keyboard
  await clickText('.recall-actions button','Start');await wait(100);
  assert.match(await text('.recall-top'),/Review · 1 of/);
  await shot('card');
  const first=await evaluate(`(()=>{const c=document.querySelector('.recall-card');return {cloze:!!c.querySelector('.recall-blank'),prompt:c.textContent}})()`);
  const answers={nucleus:'nucleus',ribosome:'ribsome'};   // second answer is a typo and should read as close
  let answered=0;
  for(let i=0;i<8;i++){
    const info=JSON.parse(await evaluate(`JSON.stringify((()=>{const c=document.querySelector('.recall-card');if(!c)return null;const input=c.querySelector('input.recall-blank, input[aria-label="Your answer"]');return {cloze:!!c.querySelector('.recall-blank'),text:c.querySelector('.recall-sentence, .recall-prompt')?.textContent||'',typed:!!input}})())`));
    if(!info)break;
    if(info.typed){
      const want=/ATP/.test(info.text)?'the mitochondrion':/Where/.test(info.text)?'cytoplasm':/molecule/.test(info.text)?'ATP':/control|stores/.test(info.text)?'nucleus':/builds/.test(info.text)?'ribsome':'zzz';
      await evaluate(`(()=>{const i=document.querySelector('.recall-card input');i.value=${JSON.stringify(want)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
      await clickText('.recall-actions button','Check');
    }else await clickText('.recall-actions button','Check');
    await wait(60);
    if(i===0)await shot('feedback');
    const grade=await evaluate(`document.querySelector('.recall-grade.is-suggested span')?.textContent||''`);
    if(info.text.includes('builds'))assert.equal(grade,'Hard');   // typo -> "close" -> suggests Hard
    else if(info.typed)assert.equal(grade,'Good');
    await key('3');await wait(60);answered++;
  }
  assert.match(await text('.recall-dialog h2'),/Session complete/);
  await shot('summary');
  const saved=await evaluate(`JSON.stringify(Object.keys(state.reviews).length)`);assert.equal(Number(saved),5);
  assert.equal(await evaluate(`state.reviewLog.length`),5);
  assert.equal(await evaluate(`state.reviews[Object.keys(state.reviews)[0]].interval`),3);

  // Hub now says everything is caught up; a quiz still works and offers multiple choice
  await evaluate(`marginRecall.hub({project:state.projects[0]})`);await wait(80);
  assert.equal(await text('.recall-count'),'0');
  assert.equal(await evaluate(`[...document.querySelectorAll('.recall-actions button')].some(b=>b.textContent==='Start')`),false);
  await clickText('.recall-actions button','Practice anyway');await wait(100);
  assert.match(await text('.recall-top'),/Practice · 1 of 5/);
  let choices=0;
  for(let i=0;i<5;i++){
    const hasChoices=await evaluate(`document.querySelectorAll('.recall-choice').length`);
    if(hasChoices){choices++;if(i===0)await shot('quiz');await click('.recall-choice');await wait(40);if(i===0)await shot('quiz-feedback');await click('.recall-grades .primary')}
    else{await clickText('.recall-actions button','know');await wait(40);await key('1')}
    await wait(60);
  }
  assert(choices>=1,'quiz offered multiple choice');
  assert.match(await text('.recall-dialog h2'),/Session complete/);
  assert.equal(await evaluate(`document.querySelectorAll('.recall-missed').length>0`),true);
  await clickText('.recall-actions button','Drill');await wait(80);
  assert.match(await text('.recall-top'),/Drill/);
  await evaluate(`document.querySelector('.recall-dialog').close()`);

  // Questions you have never seen arrive as multiple choice; later reviews ask you to type
  await evaluate(`state.reviews={};marginRecall.hub({project:state.projects[0]})`);await wait(80);
  await clickText('.recall-actions button','Start');await wait(100);
  assert.equal(await evaluate(`document.querySelectorAll('.recall-choice').length>=3`),true);
  await evaluate(`document.querySelector('.recall-dialog').close()`);

  // ⌘⇧K on a selection drafts a fill-in-the-blank from its sentence
  await evaluate(`(()=>{active='n1';mode='write';render();})()`);await wait(250);
  await evaluate(`(()=>{const rich=document.querySelector('#editor .rich-text');const walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT);let n,hit;while(n=walker.nextNode()){const i=n.data.indexOf('amino acids');if(i>=0){hit=[n,i];break}}if(!hit)throw Error('no text '+rich.textContent);const r=document.createRange();r.setStart(hit[0],hit[1]);r.setEnd(hit[0],hit[1]+11);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyK',key:'k',shiftKey:true,metaKey:true,ctrlKey:false,bubbles:true,cancelable:true}))`);await wait(100);
  assert.equal(await evaluate(`document.querySelector('.recall-dialog').open`),true);
  assert.equal(await evaluate(`document.querySelector('.recall-form').dataset.type`),'cloze');
  assert.equal(await evaluate(`document.querySelectorAll('.recall-tabs').length`),0);
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Hidden words"]').value`),'amino acids');
  assert.match(await text('.recall-preview'),/builds proteins from \[…\]\./);
  await shot('compose');
  await click('.recall-actions .primary');await wait(80);
  assert.equal(await evaluate(`state.items.length`),1);
  assert.equal(await evaluate(`state.items[0].noteId`),'n1');assert.equal(await evaluate(`state.items[0].blank`),'amino acids');
  assert.equal(await evaluate(`state.items[0].projectId`),'bio');

  // The form switches type from a link under it, and a flag on the same note appears in the note's list
  await evaluate(`(()=>{const rich=document.querySelector('#editor .rich-text');const walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT);let n,hit;while(n=walker.nextNode()){const i=n.data.indexOf('stores');if(i>=0){hit=[n,i];break}}const r=document.createRange();r.setStart(hit[0],hit[1]);r.setEnd(hit[0],hit[1]+6);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
  await evaluate(`marginAskQuestion()`);await wait(80);
  assert.equal(await evaluate(`document.querySelector('.recall-form').dataset.type`),'cloze');
  await evaluate(`document.querySelector('.recall-switch button').click()`);await wait(40);
  assert.equal(await evaluate(`document.querySelector('.recall-form').dataset.type`),'qa');
  await evaluate(`(()=>{const f=document.querySelector('.recall-form');f.querySelector('[aria-label=Question]').value='What does the nucleus do?';f.querySelector('[aria-label=Answer]').value='Stores DNA';f.requestSubmit()})()`);await wait(80);
  assert.equal(await evaluate(`state.items.at(-1).prompt`),'What does the nucleus do?');
  assert.equal(await evaluate(`document.querySelectorAll('.recall-check').length`),0);
  await evaluate(`current().flags=[{id:'f1',blockId:'n1b',quote:'ribosome',comment:'how does it read RNA?',status:'open',created:Date.now()}];marginEditorRefresh()`);
  await evaluate(`marginBrowseNoteQuestions()`);await wait(80);
  assert.match(await text('.recall-bank'),/Flagged as unclear/);assert.match(await text('.recall-bank'),/how does it read RNA\?/);
  await shot('note-questions');
  await evaluate(`document.querySelector('.recall-dialog').close()`);

  // Suggestions are drafts the student keeps or rejects
  await evaluate(`marginRecall.hub({project:state.projects[0]})`);await wait(60);
  await clickText('.recall-links button','Browse all');await wait(60);await clickText('.recall-bar button','Suggest');await wait(80);
  await shot('suggest');
  const suggested=await evaluate(`document.querySelectorAll('.recall-suggestion').length`);assert(suggested>=3,'suggestions '+suggested);
  await evaluate(`document.querySelector('.recall-suggestion input[type=checkbox]').click()`);
  const before=await evaluate(`state.items.length`);
  await clickText('.recall-actions button','Add');await wait(80);
  assert.equal(await evaluate(`state.items.length`),before+suggested-1);

  // Bank: pause, resume, search, delete (with undo)
  await clickText('.recall-links button','Browse all');await wait(80);
  await shot('bank');
  const total=await evaluate(`document.querySelectorAll('.recall-bank-row').length`);assert(total>=8);
  await clickText('.recall-bank-side button','Pause');await wait(40);
  assert.equal(await evaluate(`Object.keys(state.suspended).length`),1);
  await clickText('.recall-bank-side button','Resume');assert.equal(await evaluate(`Object.keys(state.suspended).length`),0);
  await evaluate(`(()=>{const s=document.querySelector('.recall-bar input[type=search]');s.value='glycolysis';s.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  assert.equal(await evaluate(`document.querySelectorAll('.recall-bank-row').length`),1);
  await evaluate(`(()=>{const s=document.querySelector('.recall-bar input[type=search]');s.value='amino';s.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const items=await evaluate(`state.items.length`);
  await clickText('.recall-bank-side button','Delete');assert.equal(await evaluate(`state.items.length`),items-1);

  // The subject overview carries a Recall card
  await evaluate(`document.querySelector('.recall-dialog').close();window.marginSubjectOverview('bio')`);await wait(300);
  assert.equal(await evaluate(`!!document.querySelector('.subject-recall')`),true);
  await shot('overview');
  console.log('PASS: recall hub, review with typed checking and grading, quiz with choices, drill, selection capture, suggestions, question bank, subject card.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
