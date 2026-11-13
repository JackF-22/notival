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
  await evaluate(`(()=>{state.projects=[{id:'ru',name:'Russian',icon:'🇷🇺',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[],language:{code:'ru',name:'Russian',locale:'ru-RU'}}];state.notes=[{id:'n1',title:'Lesson',projectId:'ru',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b1',type:'text',text:'x',html:'<p>Hello</p>'}]}];state.vocab=[];state.items=[];active='n1';render();setMode('write')})()`);await wait(300);
  await evaluate(`localStorage.removeItem('notival.stories.direction');localStorage.setItem('notival.stories.style','"steps"')`);
  await evaluate(`window.marginStories.open('ru')`);await wait(150);
  assert.equal(await count('.stories-styles .stories-chip'),2,'two ways to practise');
  assert.equal(await evaluate(`document.querySelector('.stories-styles .stories-chip[aria-pressed=true]').textContent`),'Sentence by sentence');
  await click('Whole story');await wait(100);
  assert.match(await text('.stories-lede'),/Feedback appears as you type/);
  await evaluate(`document.querySelector('.stories-open').click()`);await wait(200);
  assert.equal(await count('.stories-big'),1,'one big box');assert.equal(await count('.stories-src'),7,'the whole story is shown to read');
  assert.match(await text('.stories-live-empty'),/Start typing/);
  // type with the Latin keyboard; words are judged as you go
  const live=()=>evaluate(`JSON.stringify([...document.querySelectorAll('.stories-live .stories-word')].map(w=>w.className.replace('stories-word is-','')))`).then(JSON.parse);
  await evaluate(`document.querySelector('.stories-big').focus()`);
  for(const letter of 'Menya zovut Anna. Ya zhivu v Pitere. ')await type(letter);
  assert.equal(await evaluate(`document.querySelector('.stories-big').value`),'Меня зовут Анна. Я живу в Питере. ');
  assert.deepEqual(await live(),['right','right','right','right','right','right','wrong'],'wrong word marked as soon as it is finished');
  assert.equal(await text('.stories-live .is-wrong .stories-fix'),'Москве','the right word shows beneath');
  assert.equal(await evaluate(`document.querySelectorAll('.stories-seg.is-good').length`),1,'a finished sentence fills the bar');
  await click('Show corrections');assert.equal(await count('.stories-fix'),0,'corrections can be hidden');await click('Show corrections');
  // skip a word, and the word being typed is not judged yet
  for(const letter of 'Kazhdoe utro ya chaj Pot')await type(letter);
  let states=await live();assert.equal(states.at(-1),'typing','the word at the caret waits');assert.ok(states.includes('missed'),'the skipped word shows where it belongs');
  assert.match(await text('.stories-score'),/\d+%/);
  // the draft survives leaving
  await evaluate(`document.querySelector('.stories-back').click()`);await wait(200);
  assert.match(await evaluate(`Object.values(state.storyDrafts)[0]`),/Kazhdoe|Каждое/);
  await evaluate(`document.querySelector('.stories-open').click()`);await wait(200);
  assert.match(await evaluate(`document.querySelector('.stories-big').value`),/Каждое утро/,'the draft comes back');
  // finish: whole story typed out
  await evaluate(`(()=>{const i=document.querySelector('.stories-big');i.value=StoriesData.list.ru[0].sentences.map(s=>s.t).join(' ');i.dispatchEvent(new Event('input'))})()`);await wait(100);
  assert.match(await text('.stories-score'),/100%/);
  await evaluate(`document.querySelector('.stories-big').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,bubbles:true,cancelable:true}))`);await wait(200);
  assert.equal(await count('.stories-done'),1,'⌘Enter finishes and shows the usual summary');
  assert.equal(await evaluate(`document.querySelector('.stories-ring strong').textContent`),'100%');
  assert.equal(await evaluate(`state.storyRuns[0].style`),'whole');assert.equal(await evaluate(`state.storyDrafts['ru-morning:to-target']`),undefined,'the draft is cleared');
  // an unfinished story: what was not reached is missed, and weak sentences go to Recall
  await click('All stories');await wait(100);await evaluate(`document.querySelectorAll('.stories-open')[1].click()`);await wait(200);
  await evaluate(`(()=>{const i=document.querySelector('.stories-big');i.value='У Маши есть кошка. Кошку зовут Мурка. ';i.dispatchEvent(new Event('input'))})()`);await wait(100);
  await click('Finish');await wait(200);
  assert.equal(await count('.stories-weak-row'),6,'the six sentences not written are listed');
  await click('Add the 6 to Recall');assert.equal(await evaluate(`state.items.length`),6);
  console.log('PASS: stories (whole story) — Latin typing, live word marks and corrections, skipped and in-progress words, sentence bar, kept drafts, finish with ⌘Enter, Recall hand-off.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
