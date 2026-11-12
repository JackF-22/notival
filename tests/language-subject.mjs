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
  const visible=selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e&&!e.hidden&&getComputedStyle(e).display!=='none'})()`);
  const subjects=`[{id:'ru',name:'Russian',icon:'🇷🇺',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[],language:{code:'ru',name:'Russian',locale:'ru-RU'}},{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[]}]`;
  await evaluate(`(()=>{state.projects=${subjects};state.notes=[{id:'n1',title:'Lesson',projectId:'ru',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b1',type:'text',text:'x',html:'<p>privet</p>'}]},{id:'n2',title:'Cells',projectId:'bio',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b2',type:'text',text:'x',html:'<p>Cells</p>'}]}];state.vocab=[];state.listening=[];active='n2';render();setMode('write')})()`);await wait(300);
  // The create box: naming a subject after a language pre-selects it, and it can be chosen by hand
  await evaluate(`openProjectComposer()`);await wait(150);
  assert.equal(await evaluate(`!!document.querySelector('#project-dialog select[aria-label=Language]')`),true,'Create a subject has a Language choice');
  assert.equal(await evaluate(`document.querySelector('#project-dialog select[aria-label=Language]').value`),'','not a language by default');
  await evaluate(`document.querySelector('#project-dialog input[aria-label="Subject name"]').focus()`);
  for(const c of 'Russian')await call('Input.dispatchKeyEvent',{type:'keyDown',key:c,text:c},sessionId);await wait(80);
  assert.equal(await evaluate(`document.querySelector('#project-dialog select[aria-label=Language]').value`),'ru','typing "Russian" pre-selects Russian');
  await evaluate(`[...document.querySelectorAll('#project-dialog button')].find(b=>b.textContent==='Create subject').click()`);await wait(300);
  assert.deepEqual(await evaluate(`state.projects.at(-1).language`),{code:'ru',name:'Russian',locale:'ru-RU'},'the new subject is a language subject');
  await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);await wait(150);
  assert.equal(await count('.subject-vocab'),1,'and its page opens with the language sections');
  // Choosing by hand wins over the name
  await evaluate(`openProjectComposer()`);await wait(150);
  await evaluate(`(()=>{const s=document.querySelector('#project-dialog select[aria-label=Language]');s.value='fr';s.dispatchEvent(new Event('change'))})()`);
  await evaluate(`document.querySelector('#project-dialog input[aria-label="Subject name"]').focus()`);
  for(const c of 'Russian')await call('Input.dispatchKeyEvent',{type:'keyDown',key:c,text:c},sessionId);await wait(80);
  assert.equal(await evaluate(`document.querySelector('#project-dialog select[aria-label=Language]').value`),'fr');
  await evaluate(`document.querySelector('#project-dialog').close()`);
  // Edit box
  await evaluate(`editProject(state.projects.find(p=>p.id==='bio'))`);await wait(150);
  assert.equal(await evaluate(`!!document.querySelector('#project-dialog select[aria-label=Language]')`),true,'Edit subject has it too');
  await evaluate(`document.querySelector('#project-dialog').close()`);
  await evaluate(`window.marginHome('ru')`);await wait(200);
  // A regular subject has none of it: no buttons, no sidebar entry
  assert.equal(await visible('#note-vocab'),false,'no Vocab button in a regular subject\'s note');
  assert.equal(await count('#note-listening'),0,'Listening is not part of any note');
  assert.equal(await count('#open-listening'),0,'and nothing about listening in the sidebar');
  assert.equal(await evaluate(`[...document.querySelectorAll('#selection-tools button')].find(b=>b.textContent==='Add to vocab').hidden`),true);
  // A language subject's note has both
  await evaluate(`active='n1';render();setMode('write')`);await wait(250);
  assert.equal(await visible('#note-vocab'),true);assert.equal(await count('#note-listening'),0,'a language note has Vocab but Listening lives on the subject');
  // The subject pages: sections only on the language subject
  await evaluate(`window.marginHome('bio')`);await wait(300);
  assert.equal(await count('.subject-vocab'),0);assert.equal(await count('.subject-listening'),0);
  await evaluate(`window.marginHome('ru')`);await wait(300);
  await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);await wait(100);
  assert.equal(await count('.subject-vocab'),1,'Vocab section on the language subject\'s page');assert.equal(await count('.subject-listening'),1,'Listening section too');
  // Words are kept with their subject
  await evaluate(`document.querySelector('.subject-vocab .vocab-form input').focus()`);
  for(const c of 'privet')await call('Input.dispatchKeyEvent',{type:'keyDown',key:c,text:c},sessionId);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await type('hello');await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await wait(150);
  assert.deepEqual(await evaluate(`state.vocab.map(w=>[w.term,w.meaning,w.projectId])`),[['привет','hello','ru']]);
  assert.match(await text('.subject-vocab .vocab-row'),/привет/);
  // Make Biology a Spanish subject from its settings
  await evaluate(`window.marginHome('bio')`);await wait(300);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Customize subject').click()`);await wait(250);
  assert.equal(await evaluate(`!!document.querySelector('dialog[open] select[aria-label=Language]')`),true,'the settings have a Language choice');
  await evaluate(`(()=>{const s=document.querySelector('dialog[open] select[aria-label=Language]');s.value='es';s.dispatchEvent(new Event('change'))})()`);
  await evaluate(`[...document.querySelectorAll('dialog[open] button')].find(b=>/^(Save|Done)/.test(b.textContent.trim())).click()`);await wait(300);
  assert.deepEqual(await evaluate(`state.projects.find(p=>p.id==='bio').language`),{code:'es',name:'Spanish',locale:'es-ES'},'the choice is saved on the subject');
  await evaluate(`window.marginHome('bio')`);await wait(300);
  assert.equal(await count('.subject-vocab'),1,'it now has the sections');
  assert.equal(await evaluate(`[...document.querySelectorAll('.subject-vocab .vocab-head .vocab-chip')].some(b=>b.textContent==='РУ')`),false,'and no Russian typing toggle: that is for Russian');
  assert.equal(await count('.subject-vocab .vocab-row'),0,'it does not show the Russian subject\'s words');
  // Listening is kept per subject and uses the subject's language
  await evaluate(`(()=>{window.__sent=[];window.__notivalHost=m=>window.__sent.push(m);document.querySelector('.subject-listening button').click()})()`);await wait(100);
  assert.deepEqual(await evaluate(`window.__sent.map(m=>m.type)`),['chooseAudio']);
  await evaluate(`marginAudioChosen({id:'11111111-2222-3333-4444-555555555555',name:'Clase',duration:5})`);await wait(200);
  assert.equal(await evaluate(`state.listening[0].projectId`),'bio');
  assert.equal(await evaluate(`window.__sent.find(m=>m.type==='transcribeAudio').locale`),'es-ES');
  assert.match(await text('.listening-head h2'),/Spanish/);assert.equal(await evaluate(`document.querySelector('.student-tabs [aria-current=page]').dataset.feature`),'listening','it is a tab of the subject');
  await evaluate(`window.marginHome('ru')`);await wait(300);
  assert.equal(await count('.subject-listening .listening-widget-clip'),0,'the Russian subject has none of the Spanish clips');
  console.log('PASS: language subjects — set from the subject\'s settings, vocab and listening on its page and in its notes only, kept per subject and per language.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
