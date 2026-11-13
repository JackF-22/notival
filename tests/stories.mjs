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
  const click=label=>evaluate(`[...document.querySelectorAll('.stories-page button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)}))?.click()`);
  const sent=()=>evaluate(`JSON.stringify(window.__sent)`).then(JSON.parse);
  // A stand-in for the native side: remember what the page asks for.
  await evaluate(`(()=>{state.projects=[{id:'ru',name:'Russian',icon:'🇷🇺',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[],language:{code:'ru',name:'Russian',locale:'ru-RU'}},{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[]}];state.notes=[{id:'n1',title:'Lesson',projectId:'ru',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b1',type:'text',text:'x',html:'<p>Hello</p>'}]}];state.vocab=[];state.items=[];active='n1';render();setMode('write')})()`);await wait(300);
  await evaluate(`localStorage.removeItem('notival.stories.direction')`);
  await evaluate(`window.marginStories.open('ru')`);await wait(150);
  assert.equal(await count('.stories-page'),1,'Stories is a tab of the language subject');
  assert.equal(await evaluate(`document.querySelector('.student-tabs [aria-current=page]').dataset.feature`),'stories');
  assert.equal(await count('.stories-card'),3,'three starter Russian stories');
  assert.match(await text('.stories-go'),/Start · Моё утро/);
  // A subject that is not a language has no Stories tab
  assert.equal(await evaluate(`(()=>{window.marginSubjectTab('bio','overview');return document.querySelectorAll('.student-tabs [data-feature=stories]').length})()`),0);
  await evaluate(`window.marginStories.open('ru')`);await wait(150);
  // Play the first story, English to Russian
  await click('Start ·');await wait(150);
  assert.equal(await count('.stories-seg'),7);
  assert.equal(await text('.stories-prompt'),'My name is Anna.');
  // Latin typing becomes Cyrillic in the box
  await evaluate(`document.querySelector('.stories-input').focus()`);
  for(const letter of 'Menya')await type(letter);
  assert.equal(await evaluate(`document.querySelector('.stories-input').value`),'Меня','typing Latin letters writes Cyrillic');
  await evaluate(`(()=>{const i=document.querySelector('.stories-input');i.value=Translit.convert('Menya zovut Anna');i.dispatchEvent(new Event('input'))})()`);
  await evaluate(`document.querySelector('.stories-check').click()`);await wait(150);
  assert.equal(await count('.stories-result.is-good'),1);assert.equal(await evaluate(`document.querySelector('.stories-percent').dataset.value`),'100');
  assert.equal(await count('.stories-seg.is-good'),1,'the progress bar fills in');
  // Second sentence: a wrong word is shown against the answer
  await evaluate(`document.querySelector('.stories-next').click()`);await wait(100);
  assert.equal(await text('.stories-prompt'),'I live in Moscow.');
  await evaluate(`(()=>{const i=document.querySelector('.stories-input');i.value='Я живу в Питере';i.dispatchEvent(new Event('input'))})()`);
  await evaluate(`document.querySelector('.stories-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);await wait(150);
  assert.equal(await count('.stories-word.is-wrong'),1);assert.equal(await text('.stories-word.is-wrong'),'МосквеПитере','the wrong word shows what you wrote beneath it');
  assert.equal(await count('.stories-result.is-near'),1,'three of four words is close, not passed');
  await evaluate(`document.querySelector('.stories-next').click()`);await wait(100);
  // Show answer scores zero for that sentence; "also correct" accepts another wording
  await click('Show answer');await wait(100);
  assert.equal(await count('.stories-result.is-empty'),1);
  await evaluate(`document.querySelector('.stories-next').click()`);await wait(100);
  await evaluate(`(()=>{const i=document.querySelector('.stories-input');i.value='Потом я иду на службу';i.dispatchEvent(new Event('input'))})()`);
  await evaluate(`document.querySelector('.stories-check').click()`);await wait(100);
  await click('That’s also correct');await wait(100);
  assert.equal(await evaluate(`document.querySelector('.stories-percent').dataset.value`),'100');assert.equal(await evaluate(`Object.values(state.storyAccepted)[0][0]`),'Потом я иду на службу');
  // Finish the rest with the reference answers
  for(let i=0;i<3;i++){
    await evaluate(`document.querySelector('.stories-next').click()`);await wait(80);
    await evaluate(`(()=>{const idx=document.querySelectorAll('.stories-seg').length;const i=document.querySelector('.stories-input');i.value=StoriesData.list.ru[0].sentences[${4}+${i}].t;i.dispatchEvent(new Event('input'));document.querySelector('.stories-check').click()})()`);await wait(80);
  }
  await evaluate(`document.querySelector('.stories-next').click()`);await wait(150);
  assert.equal(await count('.stories-done'),1,'the story ends on a summary');
  assert.equal(await evaluate(`state.storyRuns.length`),1);
  assert.equal(await count('.stories-weak-row'),2,'the two weak sentences are listed');
  await click('Add the 2 to Recall');
  assert.equal(await evaluate(`state.items.length`),2);assert.match(await evaluate(`state.items[0].prompt`),/How do you say/);assert.equal(await evaluate(`state.items[0].projectId`),'ru');
  await click('Add the');await wait(50);
  assert.ok(await evaluate(`state.vocab.some(w=>w.term==='москве')`),'missed words go to Vocab');
  // Another run in reverse: Russian shown, English written, with "Next" offered
  await click('All stories');await wait(100);
  await click('Russian → English');await wait(100);
  assert.match(await text('.stories-go'),/Start · Кошка/,'the next untried story is offered');
  await evaluate(`document.querySelector('.stories-open').click()`);await wait(150);
  assert.match(await text('.stories-prompt'),/Меня зовут Анна/);
  await evaluate(`(()=>{const i=document.querySelector('.stories-input');i.value="I'm Anna";i.dispatchEvent(new Event('input'));document.querySelector('.stories-check').click()})()`);await wait(100);
  assert.equal(await evaluate(`document.querySelector('.stories-percent').dataset.value`),'100','an alternate English wording is accepted');
  // Adding your own story: counts must line up
  await evaluate(`document.querySelector('.stories-back').click()`);await wait(100);
  await click('+ Add a story');await wait(100);
  const fill=(sel,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input'))})()`);
  await fill('.stories-title','Мой тест');
  const area=n=>`.stories-compose textarea:nth-of-type(${n})`;
  await fill(area(1),'Привет. Пока.');await fill(area(2),'Hello.');
  assert.equal(await evaluate(`document.querySelector('.stories-compose button[type=submit]').disabled`),true,'mismatched counts cannot be saved');
  await fill(area(2),'Hello. Bye.');
  assert.equal(await evaluate(`document.querySelector('.stories-compose button[type=submit]').disabled`),false);
  await evaluate(`document.querySelector('.stories-compose').requestSubmit()`);await wait(150);
  assert.equal(await evaluate(`state.stories.length`),1);assert.equal(await count('.stories-card'),4);
  // It appears on the subject's overview
  await evaluate(`window.marginSubjectTab('ru','overview')`);await wait(150);
  assert.equal(await count('.subject-stories'),1,'a Stories section on the language subject\'s page');
  console.log('PASS: stories — library, English→Russian with Latin typing, word-by-word verdict, show answer, also-correct, summary, Recall and Vocab hand-off, reverse direction, adding your own story.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
