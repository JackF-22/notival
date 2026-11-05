import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const profile=await mkdtemp('/private/tmp/margin-check-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const m=JSON.parse(raw),p=waiting.get(m.id);if(p){waiting.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>reject(Error('Timeout '+method)),15000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
try{
const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state'))break;await new Promise(r=>setTimeout(r,50))}

const click=async label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.closest('[hidden]'));if(!b)throw Error('Missing button: '+${JSON.stringify(label)});b.click()})()`);
await evaluate(`state.projects=[{id:'learning',name:'Learning'}];state.notes=[{id:'source',title:'Osmosis',projectId:'learning',updated:1,blocks:[{id:'passage',type:'text',text:'Osmosis is the movement of water across a selectively permeable membrane.'},{id:'experiment',type:'code',language:'javascript',text:'console.log(2+2)'}],nodes:[]}];active='source';render()`);
await click('Question this passage');
await evaluate(`document.querySelector('[aria-label="Question"]').value='Why does water move?';document.querySelector('[aria-label="My explanation"]').value='A concentration difference creates net movement.';document.querySelector('[aria-label="Evidence and reasoning"]').value='The source explains selective permeability.';document.querySelector('[aria-label="Understanding"]').value='Tentative explanation';document.querySelector('.understanding-dialog form').requestSubmit()`);
assert.equal(await evaluate('current().questions[0].blockId'),'passage');
assert.match(await evaluate('current().questions[0].excerpt'),/Osmosis/);
assert.equal(await evaluate('Knowledge.cards(state.notes).find(c=>c.kind==="authored").question'),'Why does water move?');
await evaluate(`document.querySelector('[aria-label="Experiment reflection"]').value='Four is the sum.';document.querySelector('[aria-label="Experiment reflection"]').dispatchEvent(new Event('input'))`);
await new Promise(r=>setTimeout(r,500));await call('Page.reload',{},sessionId);await new Promise(r=>setTimeout(r,600));
assert.equal(await evaluate('state.notes[0].questions.length'),1);
assert.equal(await evaluate('state.notes[0].blocks[1].reflection'),'Four is the sum.');
await evaluate(`active='source';render()`);await click('Focus writing');assert.equal(await evaluate('document.body.classList.contains("focus-writing")'),true);
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);assert.equal(await evaluate('document.body.classList.contains("focus-writing")'),false);
await evaluate(`window.marginShowProject('learning')`);await click('Synthesis');await click('New synthesis');
await evaluate(`document.querySelector('[aria-label="Synthesis title"]').value='Understanding osmosis';document.querySelector('[aria-label="Synthesis title"]').dispatchEvent(new Event('input'));document.querySelector('.source-candidate button').click();document.querySelector('.evidence-card select').value='Challenges';document.querySelector('.evidence-card select').dispatchEvent(new Event('change'));document.querySelector('[aria-label="Working explanation"]').value='My conclusion with evidence.';document.querySelector('[aria-label="Working explanation"]').dispatchEvent(new Event('input'));[...document.querySelectorAll('.synthesis-studio button')].find(b=>b.textContent==='Create / update note').click()`);
assert.equal(await evaluate('current().title'),'Understanding osmosis');
assert.equal(await evaluate('current().blocks[1].sourceNoteId'),'source');
assert.match(await evaluate('current().blocks[1].text'),/Challenges/);
await click('Open original passage');assert.equal(await evaluate('current().id'),'source');
await click('Questions · 1');await click('Tentative explanation · Why does water move?');
await evaluate(`document.querySelector('[aria-label="Understanding"]').value='Understood';document.querySelector('.understanding-dialog form').requestSubmit()`);
assert.equal(await evaluate('current().questions[0].stage'),'Understood');
await new Promise(r=>setTimeout(r,500));await call('Page.reload',{},sessionId);await new Promise(r=>setTimeout(r,600));
assert.equal(await evaluate('state.notes.find(n=>n.id==="source").questions[0].stage'),'Understood');

assert.equal(await evaluate('state.notes.find(n=>n.title==="Understanding osmosis").blocks[1].sourceBlockId'),'passage');
console.log('PASS: passage-linked questions, authored recall, understanding transitions, experiment reflection, focus exit, compact preference, synthesis source navigation, persistence across reload.');
}finally{browser.kill();for(const p of waiting.values()){clearTimeout(p.timer)}await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true})}
