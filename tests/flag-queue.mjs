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
    state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[],materials:[],packs:[],assessments:[],checklist:[]}];
    state.notes=[{id:'n1',title:'Respiration',projectId:'bio',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b1',type:'text',text:'x',html:'<p>The Krebs cycle runs twice. Glycolysis happens in the cytoplasm.</p>'}]}];
    state.items=[];state.reviews={};active='n1';mode='write';render();
  })()`);
  await wait(250);
  const q=expr=>evaluate(`(()=>{const b=document.querySelector('.flag-queue');return ${expr}})()`);
  assert.equal(await q('b.hidden'),true);   // nothing flagged, nothing docked

  const flagText=(needle,length)=>evaluate(`(()=>{const w=document.createTreeWalker(document.querySelector('#editor .rich-text p'),NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const i=n.data.indexOf(${JSON.stringify(needle)});if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+${length});const s=getSelection();s.removeAllRanges();s.addRange(r);return}}throw Error('no '+${JSON.stringify(needle)})})()`);
  await flagText('Krebs',15);await hotkey();await wait(100);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await flagText('Glycolysis',10);await hotkey();await wait(100);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await q('b.hidden'),false);
  assert.match(await q('b.textContent'),/1 of 2/);
  assert.match(await q('b.textContent'),/Krebs cycle/);
  await shot('queue');

  // Step through
  await q(`b.querySelector('[aria-label="Next flag"]').click()`);
  assert.match(await q('b.textContent'),/2 of 2/);assert.match(await q('b.textContent'),/Glycolysis/);
  await q(`b.querySelector('[aria-label="Next flag"]').click()`);
  assert.match(await q('b.textContent'),/1 of 2/);

  // Resolving needs words, and typing is not lost to a re-render
  assert.equal(await q(`b.querySelector('.primary').disabled`),true);
  await evaluate(`(()=>{const a=document.querySelector('.flag-queue textarea');a.focus();a.value='Two pyruvate per glucose.';a.dispatchEvent(new Event('input',{bubbles:true}));render()})()`);
  assert.equal(await q(`b.querySelector('textarea').value`),'Two pyruvate per glucose.');
  await q(`b.querySelector('.primary').click()`);await wait(60);
  assert.equal(await evaluate(`state.notes[0].flags.filter(f=>f.status==='resolved').length`),1);
  assert.match(await q('b.textContent'),/1 of 1/);assert.match(await q('b.textContent'),/Glycolysis/);

  // Minimise to a pill, then restore
  await q(`b.querySelector('[aria-label=Minimise]').click()`);
  assert.match(await q('b.textContent'),/To clarify · 1/);assert.equal(await q(`!!b.querySelector('textarea')`),false);
  await q(`b.querySelector('.flag-queue-pill').click()`);
  assert.equal(await q(`!!b.querySelector('textarea')`),true);

  // Last one cleared: the queue goes away
  await evaluate(`(()=>{const a=document.querySelector('.flag-queue textarea');a.value='Cytoplasm, before the mitochondria.';a.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await q(`b.querySelector('.primary').click()`);await wait(60);
  assert.equal(await q('b.hidden'),true);
  console.log('PASS: the to-clarify queue docks bottom right, steps through open flags, resolves inline and minimises.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
