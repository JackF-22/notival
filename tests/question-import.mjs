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
    state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[{id:'u1',name:'Cells'},{id:'u2',name:'Energy'}],materials:[],packs:[],assessments:[],checklist:[]}];
    state.notes=[{id:'n1',title:'Membranes',projectId:'bio',unitId:'u1',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b1',type:'text',text:'x',html:'<p>x</p>'}]}];
    state.items=[{id:'old',type:'qa',prompt:'What is osmosis?',answer:'Water moving.',noteId:null,projectId:'bio',unitId:'u1',created:1}];
    state.reviews={};active=null;render();
  })()`);
  await wait(200);
  const q=expr=>evaluate(expr);
  const paste=text=>q(`(()=>{const t=document.querySelector('.qimport-dialog textarea');t.value=${JSON.stringify(text)};t.dispatchEvent(new Event('input',{bubbles:true}))})()`);

  // Reachable from the Recall hub for a subject
  await q(`marginRecall.hub({project:state.projects[0]})`);await wait(150);
  assert.equal(await q(`[...document.querySelectorAll('.recall-dialog button')].some(b=>b.textContent==='Import from AI')`),true);
  await q(`[...document.querySelectorAll('.recall-dialog button')].find(b=>b.textContent==='Import from AI').click()`);await wait(150);
  assert.equal(await q(`document.querySelector('.qimport-dialog').open`),true);
  assert.equal(await q(`document.querySelector('.qimport-dialog [aria-label=Subject]').value`),'bio');   // the subject you came from is preselected
  assert.equal(await q(`document.querySelector('.qimport-dialog .primary').disabled`),true);

  // Junk gives guidance, not a silent nothing
  await paste('Sure! I would be happy to help.');
  assert.match(await q(`document.querySelector('.qimport-list').textContent`),/couldn’t find any questions/);

  // A realistic reply: pairs, a fill-in-the-blank, and one question you already have
  await paste('Here are your questions:\n\n1. **Q:** Why does the Krebs cycle run twice per glucose?\n**A:** Two pyruvate come from each glucose.\n\nQ: What is osmosis?\nA: Water crossing a membrane.\n\nThe {{mitochondrion}} makes most of a cell’s ATP.\n\nQ: Where does glycolysis happen?\nA: The cytoplasm.');
  assert.equal(await q(`document.querySelectorAll('.qimport-row').length`),4);
  assert.match(await q(`document.querySelector('.qimport-summary').textContent`),/4 questions found · 1 you already have/);
  assert.equal(await q(`document.querySelectorAll('.qimport-row input:checked').length`),3);      // the duplicate starts unchecked
  assert.match(await q(`document.querySelector('.qimport-dialog .primary').textContent`),/Add 3 questions/);
  await shot('import');

  // Deselect one, aim at a unit and a note, then add
  await q(`document.querySelectorAll('.qimport-row input')[3].click()`);
  assert.match(await q(`document.querySelector('.qimport-dialog .primary').textContent`),/Add 2 questions/);
  await q(`(()=>{const u=document.querySelector('.qimport-dialog [aria-label=Unit]');u.value='u1';u.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  assert.equal(await q(`[...document.querySelector('.qimport-dialog [aria-label="Attach to a note"]').options].map(o=>o.textContent).join('|')`),'Not attached to a note|Membranes');
  await q(`(()=>{const n=document.querySelector('.qimport-dialog [aria-label="Attach to a note"]');n.value='n1';n.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await q(`document.querySelector('.qimport-dialog form').requestSubmit()`);await wait(150);
  assert.equal(await q(`state.items.length`),3);
  const added=JSON.parse(await q(`JSON.stringify(state.items.slice(1))`));
  assert.equal(added[0].type,'qa');assert.equal(added[0].noteId,'n1');assert.equal(added[0].unitId,'u1');assert.equal(added[0].projectId,'bio');assert.match(added[0].answer,/two pyruvate/i);
  assert.equal(added[1].type,'cloze');assert.equal(added[1].blank,'mitochondrion');assert.ok(added[1].text.includes('mitochondrion'));
  assert.ok(added.every(i=>i.imported&&i.id!=='old'));
  assert.equal(await q(`document.querySelector('.qimport-dialog').open`),false);

  // Imported questions are real recall items: they count, and importing the same reply again finds only duplicates
  assert.equal(await q(`RecallModel.collect(state,{projectId:'bio'}).length`),3);
  await q(`marginImportQuestions({project:state.projects[0]})`);await wait(100);
  await paste('Q: Why does the Krebs cycle run twice per glucose?\nA: x');
  assert.match(await q(`document.querySelector('.qimport-summary').textContent`),/1 you already have/);
  assert.equal(await q(`document.querySelector('.qimport-dialog .primary').disabled`),true);
  console.log('PASS: pasted AI questions preview, skip duplicates, and land in the chosen subject, unit and note.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
