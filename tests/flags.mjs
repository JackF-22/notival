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
    state.notes=[{id:'n1',title:'Respiration',projectId:'bio',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b1',type:'text',text:'x',html:'<p>The Krebs cycle runs <b>twice</b> per glucose molecule, and I do not see why.</p><p>Glycolysis happens in the cytoplasm.</p>'}]}];
    state.items=[];state.reviews={};active='n1';mode='write';render();
  })()`);
  await wait(250);

  // The selection toolbar offers the button, and it works when clicked, not just from the keyboard
  await evaluate(`(()=>{const p=document.querySelector('#editor .rich-text p');const r=document.createRange();r.setStart(p.firstChild,4);r.setEnd(p.firstChild,14);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'))})()`);await wait(150);
  assert.equal(await evaluate(`document.querySelector('#selection-tools').hidden`),false);
  assert.equal(await evaluate(`document.querySelector('#selection-tools #selection-flag')?.textContent`),'Flag as unclear');
  await evaluate(`document.querySelector('#selection-flag').click()`);await wait(100);
  assert.equal(await evaluate(`state.notes[0].flags.length`),1);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));(()=>{const f=state.notes[0].flags[0];for(const s of document.querySelectorAll('#editor [data-flag]'))s.replaceWith(...s.childNodes);document.querySelector('#editor .rich-text').normalize();document.querySelector('#editor .rich-text').dispatchEvent(new Event('input',{bubbles:true}));state.notes[0].flags=[]})()`);

  // Selecting text and pressing ⌘⇧U marks it, even across inline formatting
  await evaluate(`(()=>{const p=document.querySelector('#editor .rich-text p');const r=document.createRange();r.setStart(p.firstChild,4);const b=p.querySelector('b').firstChild;r.setEnd(b,b.length);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
  await hotkey();await wait(120);
  assert.equal(await evaluate(`state.notes[0].flags.length`),1);
  const flag=JSON.parse(await evaluate(`JSON.stringify(state.notes[0].flags[0])`));
  assert.equal(flag.quote,'Krebs cycle runs twice');assert.equal(flag.status,'open');assert.equal(flag.blockId,'b1');
  assert.equal(await evaluate(`document.querySelectorAll('#editor [data-flag]').length`),2);   // one span per text run
  assert.equal(await evaluate(`document.querySelector('#editor [data-flag]').classList.contains('flag-open')`),true);
  assert.match(await evaluate(`current().blocks[0].html`),/data-flag="flag-/);       // survives the sanitiser, so it is saved
  assert.equal(await evaluate(`current().blocks[0].text.includes('Krebs cycle runs')`),true);   // the note's words are untouched
  assert.equal(await evaluate(`document.querySelector('.flag-pop').hidden`),false);
  await shot('flag-new');

  // The optional comment saves as you type
  await evaluate(`(()=>{const i=document.querySelector('.flag-pop input');i.value='why twice?';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  assert.equal(await evaluate(`state.notes[0].flags[0].comment`),'why twice?');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelector('.flag-pop').hidden`),true);

  // Flags survive a re-render and a save round trip
  await evaluate(`render()`);await wait(150);
  assert.equal(await evaluate(`document.querySelectorAll('#editor .flag-open').length`),2);

  // Clicking the highlight reopens it; resolving needs a clarifying comment
  await evaluate(`document.querySelector('#editor [data-flag]').click()`);await wait(60);
  assert.equal(await evaluate(`document.querySelector('.flag-pop').hidden`),false);
  assert.equal(await evaluate(`document.querySelector('.flag-pop .primary').disabled`),true);
  await evaluate(`document.querySelector('.flag-pop .primary').click()`);
  assert.equal(await evaluate(`state.notes[0].flags[0].status`),'open');
  await shot('flag-open');
  await evaluate(`(()=>{const a=document.querySelector('.flag-pop textarea');a.value='   ';a.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  assert.equal(await evaluate(`document.querySelector('.flag-pop .primary').disabled`),true);   // whitespace is not a clarification

  // It shows up where you'd look for it
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelector('#note-questions').textContent`),'Questions · 1');
  await evaluate(`marginHome('bio')`);await wait(250);
  assert.match(await evaluate(`document.querySelector('.subject-flags')?.textContent||''`),/To clarify · 1/);
  await shot('flag-widget');
  await clickText('.subject-flags button','Open');await wait(100);
  assert.match(await evaluate(`document.querySelector('.flag-dialog').textContent`),/Krebs cycle runs twice/);
  await shot('flag-list');

  // Resolve from the list: the button stays off until something is written
  await clickText('.flag-dialog button','Resolve…');
  assert.equal(await evaluate(`document.querySelector('.flag-resolve .primary').disabled`),true);
  await evaluate(`(()=>{const a=document.querySelector('.flag-resolve textarea');a.value='Each glucose makes two pyruvate, so the cycle turns twice.';a.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await clickText('.flag-resolve button','Resolve');await wait(60);
  assert.equal(await evaluate(`state.notes[0].flags[0].status`),'resolved');
  assert.match(await evaluate(`state.notes[0].flags[0].clarification`),/two pyruvate/);
  assert.match(await evaluate(`document.querySelector('.flag-dialog').textContent`),/Everything flagged has been cleared up/);
  assert.equal(await evaluate(`window.marginFlags.count()`),0);
  await shot('flag-resolved');

  // A resolved flag can become a question that carries the clarification
  await evaluate(`document.querySelector('.flag-done').open=true`);
  await clickText('.flag-dialog button','Make a question');await wait(100);
  assert.equal(await evaluate(`document.querySelector('.recall-form').dataset.type`),'qa');
  assert.equal(await evaluate(`document.querySelector('.recall-form [aria-label=Question]').value`),'why twice?');
  assert.match(await evaluate(`document.querySelector('.recall-form [aria-label=Answer]').value`),/two pyruvate/);
  await evaluate(`document.querySelector('.recall-form').requestSubmit()`);await wait(80);
  assert.equal(await evaluate(`state.items.length`),1);assert.equal(await evaluate(`state.items[0].noteId`),'n1');
  await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);

  // Reopen, jump to the text, then remove the flag without touching the note
  await evaluate(`(()=>{active='n1';mode='write';render()})()`);await wait(200);
  assert.equal(await evaluate(`document.querySelectorAll('#editor .flag-resolved').length`),2);
  await evaluate(`document.querySelector('#editor [data-flag]').click()`);await wait(60);
  await clickText('.flag-pop button','Reopen');
  assert.equal(await evaluate(`state.notes[0].flags[0].status`),'open');
  await clickText('.flag-pop button','Remove flag');assert.equal(await evaluate(`state.notes[0].flags.length`),1);   // first click only asks
  await clickText('.flag-pop button','Click again');await wait(80);
  assert.equal(await evaluate(`state.notes[0].flags.length`),0);
  assert.equal(await evaluate(`document.querySelectorAll('#editor [data-flag]').length`),0);
  assert.equal(await evaluate(`current().blocks[0].text.includes('Krebs cycle runs')`),true);
  assert.doesNotMatch(await evaluate(`current().blocks[0].html`),/data-flag/);

  // Flagging with nothing selected explains itself instead of failing silently
  await evaluate(`getSelection().removeAllRanges()`);await hotkey();await wait(40);
  assert.match(await evaluate(`document.querySelector('#toast').textContent`),/Select the text/);
  console.log('PASS: flag a region, comment optionally, resolve only with a clarification, list and jump back, turn into a question, remove.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
