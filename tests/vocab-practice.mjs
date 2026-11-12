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
  const click=label=>evaluate(`[...document.querySelectorAll('.recall-dialog button')].find(b=>b.textContent.trim().replace(/^\\d/,'').startsWith(${JSON.stringify(label)}))?.click()`);
  const typeLatin=async s=>{for(const c of s)await call('Input.dispatchKeyEvent',{type:'keyDown',key:c,text:c},sessionId)};
  await evaluate(`localStorage.clear();window.__spoken=[];window.SpeechSynthesisUtterance=class{constructor(t){this.text=t}};Object.defineProperty(window,'speechSynthesis',{value:{speak:u=>window.__spoken.push([u.text,u.lang]),cancel(){},getVoices:()=>[]},configurable:true});(()=>{
    state.projects=[{id:'ru',name:'Russian',icon:'🇷🇺',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[],language:{code:'ru',name:'Russian',locale:'ru-RU'}}];
    state.notes=[];state.items=[];state.reviews={};state.reviewLog=[];state.suspended={};
    state.vocab=[['привет','hello; hi'],['спасибо','thank you'],['дом','house'],['есть','to eat']].map(([t,m],i)=>({id:'w'+i,term:t,meaning:m,projectId:'ru',added:i+1}));
    active=null;window.marginHome('ru')})()`);await wait(400);
  // 1 · a Practise button in the Vocab section, with the Mac's voice on each word
  assert.equal(await evaluate(`document.querySelector('.subject-vocab .vocab-practise').hidden`),false);
  assert.equal(await count('.subject-vocab .vocab-speak'),4,'every word can be heard');
  await evaluate(`document.querySelector('.subject-vocab .vocab-speak').click()`);
  assert.deepEqual(await evaluate(`window.__spoken.at(-1)`),['привет','ru-RU'],'it speaks the word in the language\'s voice');
  // 2 · the screen asks which direction
  await evaluate(`document.querySelector('.subject-vocab .vocab-practise').click()`);await wait(200);
  assert.match(await text('.recall-dialog h2'),/Practice words/);
  const dirs=await evaluate(`[...document.querySelectorAll('.recall-option')].slice(0,4).map(b=>b.querySelector('strong').textContent)`);
  assert.deepEqual(dirs,['Russian → English','English → Russian','Both ways','Listen and type']);
  assert.equal(await evaluate(`document.querySelector('.recall-option[aria-pressed=true]').textContent`).then(t=>t.startsWith('Russian → English')),true,'word → meaning is the default');
  // 3 · Russian → English: see the word, type the meaning (any of its meanings)
  await click('Start');await wait(200);
  assert.match(await text('.recall-top'),/Word practice · 1 of 4/);
  assert.equal(await count('.recall-choice'),0,'you type, you do not pick');
  const meanings={'привет':'hi','спасибо':'thank you','дом':'house','есть':'eat'};const seen=[];
  for(let i=0;i<4;i++){
    const prompt=await text('.recall-prompt');const word=prompt.match(/“(.+)”/)[1];seen.push(word);
    assert.match(prompt,/What does/);
    await evaluate(`document.querySelector('.recall-card input').focus()`);await typeLatin(meanings[word]);
    await click('Check');await wait(100);assert.match(await text('.recall-result'),/Correct/,word+' is accepted');
    await click('Good');await wait(100);
  }
  assert.equal(new Set(seen).size,4,'each word once');
  assert.match(await text('.recall-dialog h2'),/Session complete/);
  assert.equal(await evaluate(`Object.keys(state.reviews).length`),4,'the answers feed the memory model');
  await evaluate(`document.querySelector('.recall-dialog').close()`);
  // 4 · English → Russian, typed with a Latin keyboard
  await evaluate(`localStorage.setItem('notival.vocab.practice',JSON.stringify({dir:'say',which:'all',count:0}));marginRecall.vocabPractice(state.projects[0])`);await wait(150);
  await click('Start');await wait(200);
  const p2=await text('.recall-prompt');assert.match(p2,/How do you say “/);
  const target={'hello; hi':'privet','thank you':'spasibo','house':'dom','to eat':'est`'}[p2.match(/“(.+)”/)[1]];
  await evaluate(`document.querySelector('.recall-card input').focus()`);await typeLatin(target);
  const got=await evaluate(`document.querySelector('.recall-card input').value`);assert.match(got,/^[а-яё\u0301]+$/,'typed in Cyrillic: '+got);
  await click('Check');await wait(100);assert.match(await text('.recall-result'),/Correct/);
  await evaluate(`document.querySelector('.recall-dialog').close()`);
  // 5 · both ways: the two directions are mixed
  await evaluate(`localStorage.setItem('notival.vocab.practice',JSON.stringify({dir:'both',which:'all',count:0}));marginRecall.vocabPractice(state.projects[0])`);await wait(150);
  await click('Start');await wait(200);
  const kinds=new Set();
  for(let i=0;i<8;i++){kinds.add((await text('.recall-prompt')).startsWith('What does')?'know':'say');await click('I don');await wait(80);await click('Again');await wait(80)}
  assert.equal(kinds.size,2,'both directions come up');
  await evaluate(`document.querySelector('.recall-dialog')?.close()`);
  // 6 · listen and type: the word is spoken, and you type what you heard
  await evaluate(`window.__spoken=[];localStorage.setItem('notival.vocab.practice',JSON.stringify({dir:'hear',which:'all',count:0}));marginRecall.vocabPractice(state.projects[0])`);await wait(150);
  await click('Start');await wait(600);
  assert.match(await text('.recall-prompt'),/Listen, then type what you hear/);
  const spoken=await evaluate(`window.__spoken.at(-1)`);assert.equal(spoken[1],'ru-RU');assert.ok(['привет','спасибо','дом','есть'].includes(spoken[0]),'the word was said aloud: '+spoken[0]);
  await click('\ud83d\udd0a Play again');assert.ok((await evaluate(`window.__spoken.length`))>=2,'and can be played again');
  const latin={'привет':'privet','спасибо':'spasibo','дом':'dom','есть':'est\''}[spoken[0]];
  await evaluate(`document.querySelector('.recall-card input').focus()`);await typeLatin(latin==='est\''?'est\'':latin);
  await click('Check');await wait(100);assert.match(await text('.recall-result'),/Correct/,'what you heard, typed');
  console.log('PASS: word practice — choose a direction (word → meaning, meaning → word, both, or listen and type), type your answers, synonyms accepted, spoken aloud, and every answer teaches the memory model.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
