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

  const count=selector=>evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const shown=selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e&&e.offsetParent!==null&&getComputedStyle(e).display!=='none'})()`);
  const subjects=`[{id:'ru',name:'Russian',icon:'🇷🇺',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[{id:'a',title:'Test',kind:'test',date:'2026-12-01'}],checklist:[{id:'t',title:'Task',done:false}],language:{code:'ru',name:'Russian',locale:'ru-RU'}}]`;
  await evaluate(`localStorage.removeItem('notival-layout');(()=>{state.projects=${subjects};state.notes=[{id:'n1',title:'Lesson',projectId:'ru',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'b1',type:'text',text:'x',html:'<p>hello</p>'}]}];active='n1';render();setMode('write');Customize.apply()})()`);await wait(300);
  // By default everything shows
  for(const s of ['#study-nav','#pinned','#trash','#archive','#note-questions','#open-pdf','#connect-passages','#map-tab'])assert.equal(await shown(s),true,s+' shows by default');
  // A button in the top bar, easy to see, opens it
  assert.equal(await shown('#customize-open'),true,'there is a button for it in the top bar');
  await evaluate(`document.querySelector('#customize-open').click()`);await wait(150);
  assert.equal(await evaluate(`document.querySelector('.customize-dialog').open`),true,'and it opens the panel');
  await evaluate(`document.querySelector('.customize-dialog').close()`);
  // Home and Study are as tall as New note
  const heights=await evaluate(`['#home-button','#study-nav','#new'].map(s=>Math.round(document.querySelector(s).getBoundingClientRect().height))`);
  assert.ok(heights[0]>=38&&heights[1]>=38&&Math.abs(heights[0]-heights[2])<=3,'Home and Study match New note in height: '+heights);
  // The panel opens from Appearance, and with the keyboard shortcut
  await evaluate(`document.querySelector('.appearance-trigger').click()`);await wait(150);
  assert.equal(await evaluate(`[...document.querySelectorAll('.appearance-dialog button')].some(b=>/Show and hide/.test(b.textContent))`),true,'Appearance has a way in');
  await evaluate(`[...document.querySelectorAll('.appearance-dialog button')].find(b=>/Show and hide/.test(b.textContent)).click()`);await wait(150);
  assert.equal(await evaluate(`document.querySelector('.customize-dialog').open`),true);
  await evaluate(`document.querySelector('.customize-dialog').close()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:',',code:'Comma',modifiers:4,windowsVirtualKeyCode:188},sessionId);await wait(150);
  assert.equal(await evaluate(`document.querySelector('.customize-dialog')?.open`),true,'⌘, opens it too');
  // A single switch hides a single thing
  const flip=id=>evaluate(`document.querySelector('.customize-dialog input[data-item=${id}]').click()`);
  await flip('pinned');await flip('note-questions');await wait(100);
  assert.equal(await shown('#pinned'),false,'Pinned is hidden');assert.equal(await shown('#note-questions'),false,'the Questions button above a note is hidden');
  assert.equal(await shown('#trash'),true,'and nothing else is');
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('notival-layout')).hidden`),['pinned','note-questions'],'the choice is remembered');
  // It stays hidden when the screen is redrawn
  await evaluate(`render()`);await wait(200);assert.equal(await shown('#pinned'),false,'still hidden after a redraw');
  // A switch turns it back
  await flip('pinned');await wait(80);assert.equal(await shown('#pinned'),true);
  // Presets
  await evaluate(`[...document.querySelectorAll('.customize-preset')].find(b=>/Simple/.test(b.textContent)).click()`);await wait(150);
  for(const s of ['#archive','#open-pdf','#connect-passages','#map-tab'])assert.equal(await shown(s),false,s+' is hidden by Simple');
  for(const s of ['#study-nav','#home-button','#all','#trash','#new','.appearance-trigger','#heading-style'])assert.equal(await shown(s),true,s+' stays with Simple');
  await evaluate(`[...document.querySelectorAll('.customize-preset')].find(b=>/Just writing/.test(b.textContent)).click()`);await wait(150);
  assert.equal(await shown('.appearance-trigger'),true,'the way back to this panel is never hidden');
  assert.equal(await shown('#customize-open'),true,'including the top-bar button');
  assert.equal(await shown('#new'),true,'new note is never hidden');
  assert.equal(await shown('#study-nav'),true,'Study is never hidden, so Home is never alone');
  assert.equal(await evaluate(`[...document.querySelectorAll('.section-label')].find(n=>n.textContent==='WORKSPACE').offsetParent===null`),true,'the heading goes when everything under it does');
  assert.equal(await evaluate(`(()=>{const v=[...document.querySelectorAll('#format-bar > *')].filter(c=>c.offsetParent!==null),gap=c=>c.classList.contains('format-gap');return !gap(v[0])&&!gap(v.at(-1))&&v.every((c,i)=>!(gap(c)&&v[i+1]&&gap(v[i+1])))})()`),true,'no stray dividers at the ends or in a row');
  // Subject page tabs and sections
  await evaluate(`document.querySelector('.customize-dialog').close();window.marginHome('ru')`);await wait(400);
  assert.equal(await shown('.student-tabs [data-feature=notes]'),true);assert.equal(await shown('.student-tabs [data-feature=tests]'),false,'Just writing hides the Test packs tab');
  assert.equal(await shown('.subject-vocab'),true,'but a language subject keeps its Vocab');
  await evaluate(`[...document.querySelectorAll('.customize-preset')].find(b=>/Everything/.test(b.textContent))||0`);
  await evaluate(`Customize.open();[...document.querySelectorAll('.customize-preset')].find(b=>/Everything/.test(b.textContent)).click()`);await wait(150);
  assert.deepEqual(await evaluate(`Customize.hidden()`),[]);
  await evaluate(`document.querySelector('.customize-dialog').close()`);await wait(200);
  assert.equal(await shown('.student-tabs [data-feature=tests]'),true,'Everything brings it all back');
  console.log('PASS: show and hide — switches, presets, ⌘, and Appearance open it; hidden parts stay hidden when redrawn; the way back is never hidden.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
