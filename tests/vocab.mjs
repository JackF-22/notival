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
  await call('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const mouse=(type,x,y,buttons=1)=>call('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons,clickCount:1},sessionId);
  const keyCodes={Backspace:8,Delete:46,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Enter:13};
  const key=async name=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:keyCodes[name]},sessionId);await wait(50)};
  const type=async text=>{await call('Input.insertText',{text},sessionId);await wait(50)};
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(100);
  const note=async html=>{await evaluate(`current().blocks[0].html=${JSON.stringify(html)};render()`);await wait(250)};
  const rect=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}})()`);
  const html=()=>evaluate(`(()=>{const c=document.querySelector('.rich-text').cloneNode(true);c.querySelectorAll('.equation').forEach(q=>{q.replaceChildren();q.removeAttribute('title')});return c.innerHTML.replace(/ src="data:[^"]*"/g,' src=…')})()`);
  const caret=(selector,offset)=>evaluate(`(()=>{const e=document.querySelector('.rich-text');e.focus();const n=e.querySelector(${JSON.stringify(selector)}),t=n.firstChild.nodeType===3?n.firstChild:n,r=document.createRange();r.setStart(t,${offset});r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);e.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}))})()`);
  const select=(selector,from,to)=>evaluate(`(()=>{const e=document.querySelector('.rich-text');e.focus();const t=e.querySelector(${JSON.stringify(selector)}).firstChild,r=document.createRange();r.setStart(t,${from});r.setEnd(t,${to});getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  const picture=await evaluate(`(()=>{const c=document.createElement('canvas');c.width=300;c.height=300;const x=c.getContext('2d');x.fillStyle='#9bc';x.fillRect(0,0,300,300);return c.toDataURL('image/png')})()`);

  const text=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent||''`);
  const count=selector=>evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  await evaluate(`(()=>{state.projects=[{id:'ru',name:'Russian',icon:'🇷🇺',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[],language:{code:'ru',name:'Russian',locale:'ru-RU'}},{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[]}];state.notes=[{id:'n1',title:'Lesson',projectId:'ru',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b1',type:'text',text:'x',html:'<p>Hello privet world</p>'}]},{id:'n2',title:'Cells',projectId:'bio',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b2',type:'text',text:'x',html:'<p>Cells</p>'}]}];state.vocab=[];state.listening=[];active='n1';render();setMode('write')})()`);await wait(300);
  assert.equal(await count('#note-vocab'),1,'there is a Vocab button in a language subject\'s notes');
  assert.equal(await evaluate(`document.querySelector('#vocab-panel')?.hidden??true`),true,'the drawer starts tucked away');
  await evaluate(`document.querySelector('#note-vocab').click()`);await wait(250);
  assert.equal(await evaluate(`document.querySelector('#vocab-panel').hidden`),false,'the Vocab button opens it');
  // Russian typing: Latin letters become Cyrillic in the Word box
  assert.equal(await evaluate(`document.querySelector('#vocab-panel .vocab-head .vocab-chip').getAttribute('aria-pressed')`),'true','Russian typing is on for a Russian subject');
  await evaluate(`document.querySelector('#vocab-panel .vocab-form input').focus()`);
  for(const c of 'privet')await call('Input.dispatchKeyEvent',{type:'keyDown',key:c,text:c},sessionId);await wait(50);
  assert.equal(await evaluate(`document.querySelector('#vocab-panel .vocab-form input').value`),'привет');
  await key('Enter');await type('hello');await key('Enter');await wait(150);
  assert.deepEqual(await evaluate(`state.vocab.map(w=>[w.term,w.meaning])`),[['привет','hello']],'Enter after the meaning adds the word');
  assert.match(await text('.vocab-row'),/привет.*hello/);
  // Selected words go straight into the Word box
  await evaluate(`(()=>{const e=document.querySelector('.rich-text');e.focus();const t=e.querySelector('p').firstChild,r=document.createRange();r.setStart(t,6);r.setEnd(t,12);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));window.marginVocab.show(true,false)})()`);
  await evaluate(`[...document.querySelectorAll('#selection-tools button')].find(b=>b.textContent==='Add to vocab').click()`);await wait(100);
  assert.equal(await evaluate(`document.querySelector('#vocab-panel .vocab-form input').value`),'privet');
  assert.equal(await evaluate(`document.activeElement===document.querySelectorAll('#vocab-panel .vocab-form input')[1]`),true,'and the caret waits in Meaning');
  // Duplicates are not added twice; removing works from a big button
  await evaluate(`window.marginVocab.add({term:'привет'})`);assert.equal(await evaluate(`state.vocab.length`),1);
  const size=await evaluate(`(()=>{const r=document.querySelector('.vocab-remove').getBoundingClientRect();return [r.width,r.height]})()`);
  assert.ok(size[0]>=30&&size[1]>=30,'the remove button is a comfortable target: '+size);
  // Quiz needs two words with meanings, then walks through them
  await evaluate(`window.marginVocab.add({term:'спасибо',meaning:'thank you'})`);
  await evaluate(`[...document.querySelectorAll('#vocab-panel .vocab-chip')].find(b=>b.textContent==='Quiz').click()`);await wait(100);
  assert.equal(await count('.vocab-card'),1);
  for(let i=0;i<2;i++){await evaluate(`[...document.querySelectorAll('.vocab-quiz button')].find(b=>/Show the word/.test(b.textContent)).click()`);await evaluate(`[...document.querySelectorAll('.vocab-quiz button')].find(b=>b.textContent==='Knew it').click()`)}
  assert.match(await text('.vocab-score'),/2 of 2 known/);
  await evaluate(`[...document.querySelectorAll('.vocab-quiz button')].find(b=>b.textContent==='Done').click()`);
  await evaluate(`document.querySelector('.vocab-remove').click()`);assert.equal(await evaluate(`state.vocab.length`),1,'a word can be removed');
  // Hiding the drawer
  await evaluate(`document.querySelector('.vocab-close').click()`);assert.equal(await evaluate(`document.querySelector('#vocab-panel').hidden`),true);
  console.log('PASS: vocab drawer — opens and hides, types Russian, adds from selection, edits, quizzes, removes.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
