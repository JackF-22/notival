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
  const click=label=>evaluate(`[...document.querySelectorAll('.listening-dialog button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)}))?.click()`);
  const sent=()=>evaluate(`JSON.stringify(window.__sent)`).then(JSON.parse);
  // A stand-in for the native side: remember what the page asks for.
  await evaluate(`window.__sent=[];window.__notivalHost=m=>window.__sent.push(m)`);
  await evaluate(`(()=>{state.projects=[{id:'ru',name:'Russian',icon:'🇷🇺',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[],language:{code:'ru',name:'Russian',locale:'ru-RU'}},{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',description:'',units:[],materials:[],packs:[],assessments:[],checklist:[]}];state.notes=[{id:'n1',title:'Lesson',projectId:'ru',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b1',type:'text',text:'x',html:'<p>Hello privet world</p>'}]},{id:'n2',title:'Cells',projectId:'bio',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b2',type:'text',text:'x',html:'<p>Cells</p>'}]}];state.vocab=[];state.listening=[];active='n1';render();setMode('write')})()`);await wait(300);
  await evaluate(`document.querySelector('#note-listening').click()`);await wait(150);
  assert.equal(await evaluate(`document.querySelector('.listening-dialog').open`),true,'the Listening button opens the screen');
  assert.match(await text('.listening-empty'),/Add a voice message/);
  await click('+ Add a voice message');
  assert.deepEqual((await sent()).map(m=>m.type),['chooseAudio']);
  // The app picked a file: the page lists it, asks for its audio and for a draft of the words.
  const id='11111111-2222-3333-4444-555555555555';
  await evaluate(`marginAudioChosen({id:'${id}',name:'Voice message',duration:6})`);await wait(150);
  assert.deepEqual((await sent()).map(m=>m.type),['chooseAudio','loadAudio','transcribeAudio']);
  assert.equal(await count('.listening-clip'),1);
  // A silent half-second WAV stands in for the audio
  await evaluate(`(()=>{const n=4000,b=new ArrayBuffer(44+n*2),v=new DataView(b),w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);marginAudioData({id:'${id}',data:btoa(String.fromCharCode(...new Uint8Array(b))),mime:'audio/wav'})})()`);await wait(200);
  assert.equal(await evaluate(`document.querySelector('.listening-play').disabled`),false,'the player is ready once the audio arrives');
  // Without a draft there is nothing to check against yet
  await click('Check my answer');await wait(100);
  assert.match(await text('.listening-step:nth-of-type(3)'),/No words to check against/);
  await click('Back');
  // The draft arrives
  await evaluate(`marginTranscript({id:'${id}',text:'Привет! Как дела? Я хочу сказать тебе спасибо.',words:${JSON.stringify(['Привет','Как','дела','Я','хочу','сказать','тебе','спасибо'].map((t,i)=>({text:t,start:i*.5,duration:.4,confidence:.9})))},onDevice:true})`);await wait(150);
  assert.match(await text('.listening-reference'),/Drafted on this Mac/);
  // Typing Russian with a Latin keyboard
  await evaluate(`document.querySelector('.listening-text[lang=ru]').focus()`);
  for(const c of "privet kak dela ya hochu skazat' tebe")await call('Input.dispatchKeyEvent',{type:'keyDown',key:c,text:c},sessionId);await wait(80);
  assert.equal(await evaluate(`document.querySelector('.listening-text[lang=ru]').value`),'привет как дела я хочу сказать тебе');
  assert.equal(await evaluate(`state.listening[0].work.ru`),'привет как дела я хочу сказать тебе','what you write is kept');
  await click('Check my answer');await wait(150);
  assert.equal(await text('.listening-score'),'88%','seven of eight words right');
  assert.equal(await count('.listening-word.is-right'),7);assert.equal(await count('.listening-word.is-missed'),1);
  assert.equal(await evaluate(`state.listening[0].attempts.length`),1,'the attempt is saved');
  // The word you missed goes to the vocab drawer
  await click('Add the 1 to learn');await wait(100);
  assert.deepEqual(await evaluate(`state.vocab.map(w=>w.term)`),['спасибо']);
  // Her own words win over the draft
  await click('Try again');
  await evaluate(`(()=>{const t=document.querySelector('.listening-reference textarea');t.value='Привет, как дела? Я хочу тебе сказать спасибо.';t.dispatchEvent(new Event('change'))})()`);await wait(100);
  await click('Check my answer');await wait(100);
  assert.match(await text('.listening-hint'),/Compared with her words/);
  // A Mac without offline Russian says so and offers Apple's servers only on request
  await evaluate(`(()=>{state.listening[0].draft=null;marginTranscript({id:'${id}',error:'This Mac has no offline speech recognition for this language.',code:11})})()`);await wait(100);
  assert.match(await text('.listening-reference'),/System Settings → Keyboard → Dictation/);
  await click('Use Apple');
  const last=(await sent()).at(-1);assert.deepEqual([last.type,last.allowServer],['transcribeAudio',true]);
  // A second click on delete confirms, then removes the message and its audio file
  await click('🗑');await click('Delete?');await wait(100);
  assert.equal(await evaluate(`state.listening.length`),0);assert.ok((await sent()).some(m=>m.type==='deleteAudio'&&m.id==='11111111-2222-3333-4444-555555555555'));
  console.log('PASS: listening — add a voice message, play it, write Russian (Latin typing) and English, check against the draft or her words, learn missed words, offline-draft fallback, delete.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
