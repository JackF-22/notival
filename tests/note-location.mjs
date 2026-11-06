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
    state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[{id:'u1',name:'Unit 1 · Cells'},{id:'u2',name:'Unit 2 · Energy'}],materials:[],packs:[],assessments:[],checklist:[]},{id:'chem',name:'Chemistry',icon:'⚗️',color:'#c06030',units:[],materials:[],packs:[],assessments:[],checklist:[]}];
    state.notes=[{id:'n1',title:'Lecture 4',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b1',type:'text',text:'x',html:'<p>x</p>'}]}];
    state.items=[];state.reviews={};active='n1';mode='write';render();
  })()`);
  await wait(250);
  const chip=()=>evaluate(`document.querySelector('#note-location').textContent.replace(/\\s+/g,' ').trim()`);
  const pop=expr=>evaluate(`(()=>{const p=document.querySelector('.note-location-pop');return ${expr}})()`);
  const pick=text=>evaluate(`(()=>{const b=[...document.querySelectorAll('.note-location-pop button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('missing '+${JSON.stringify(text)});b.click()})()`);

  assert.match(await chip(),/Add to a subject or unit/);                    // an unfiled note says so, inside the note
  await evaluate(`document.querySelector('#note-location').click()`);await wait(80);
  assert.equal(await pop('p.hidden'),false);
  assert.equal(await pop('p.querySelectorAll("[aria-label=Subject] .note-location-row").length'),3);   // Personal notes + two subjects
  assert.equal(await pop('!!p.querySelector("[aria-label=Unit]")'),false);   // units only once there is a subject
  await shot('location-open');

  await pick('Biology');await wait(150);                                    // choosing a subject keeps the picker open for the unit
  assert.equal(await evaluate(`state.notes[0].projectId`),'bio');
  assert.equal(await pop('p.hidden'),false);
  assert.equal(await pop('p.querySelectorAll("[aria-label=Unit] .note-location-row").length'),3);
  assert.match(await chip(),/Biology.*No unit/);
  await pick('Unit 2');await wait(150);
  assert.equal(await evaluate(`state.notes[0].unitId`),'u2');
  assert.equal(await pop('p.hidden'),true);
  assert.match(await chip(),/Biology.*Unit 2 · Energy/);
  assert.equal(await evaluate(`document.querySelector('#note-location').style.getPropertyValue('--subject-color')`),'#4a9d6f');
  await shot('location-set');

  // Moving to a subject without units says so, and clears the old unit
  await evaluate(`document.querySelector('#note-location').click()`);await wait(80);
  await pick('Chemistry');await wait(150);
  assert.equal(await evaluate(`state.notes[0].unitId`),null);assert.equal(await evaluate(`state.notes[0].projectId`),'chem');
  assert.match(await pop('p.textContent'),/no units yet/);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await pop('p.hidden'),true);

  // The right-click menu hands off to the same picker
  await evaluate(`(()=>{const n=document.querySelector('.note-item');n.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:60,clientY:60}))})()`);await wait(60);
  assert.equal(await evaluate(`[...document.querySelectorAll('#note-menu button')].some(b=>/Move to Biology/.test(b.textContent))`),false);
  await evaluate(`[...document.querySelectorAll('#note-menu button')].find(b=>b.textContent.startsWith('Move to subject')).click()`);await wait(150);
  assert.equal(await pop('p.hidden'),false);
  console.log('PASS: a note can be filed under a subject and unit from inside the note and from its menu.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
