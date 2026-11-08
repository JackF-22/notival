import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-tab-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),20000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof RichEditor!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  const open=html=>evaluate(`(()=>{state.notes=[{id:'n',title:'Tab',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'a',type:'text',text:'x',html:${JSON.stringify(html)}}]}];active='n';render();setMode('write')})()`).then(()=>wait(250));
  // caret at `offset` inside the text of the element matching `selector`
  const caret=(selector,offset=0)=>evaluate(`(()=>{const node=document.querySelector('.rich-text '+${JSON.stringify(selector)});node.closest('.rich-text').focus();let text=node;while(text.firstChild)text=text.firstChild;const r=document.createRange();r.setStart(text,${offset});r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`).then(()=>wait(60));
  const codes={Tab:9,Backspace:8,Enter:13};
  const press=(key,shift=false)=>call('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code:key,windowsVirtualKeyCode:codes[key],modifiers:shift?8:0},sessionId)
    .then(()=>key==='Enter'?call('Input.dispatchKeyEvent',{type:'char',key,text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13},sessionId):null)
    .then(()=>call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:codes[key],modifiers:shift?8:0},sessionId)).then(()=>wait(100));
  const depths=()=>evaluate(`[...document.querySelector('.rich-text').children].map(line=>line.dataset.indent||'0').join(',')`);
  const saved=()=>evaluate(`current().blocks[0].html`);

  // Tab in the middle of a plain line indents the whole line and keeps the caret in the note.
  await open('<p>First line</p><p>Second line</p>');
  await caret('p:nth-child(2)',3);
  await press('Tab');
  assert.equal(await depths(),'0,1');
  assert.equal(await evaluate(`document.activeElement.classList.contains('rich-text')`),true,'focus stays in the text');
  await press('Tab');
  assert.equal(await depths(),'0,2');
  assert.match(await saved(),/<p data-indent="2">Second line<\/p>/,'the indent is saved with the note');
  const shift=await evaluate(`(()=>{const [a,b]=document.querySelectorAll('.rich-text p');return b.getBoundingClientRect().left-a.getBoundingClientRect().left})()`);
  assert.ok(shift>20,'an indented line sits further right: '+shift);
  assert.equal(await evaluate(`document.querySelector('.rich-text').textContent`),'First lineSecond line','no characters typed');

  // Shift-Tab brings it back, and stops at the margin.
  await press('Tab',true);await press('Tab',true);await press('Tab',true);
  assert.equal(await depths(),'0,0');
  assert.doesNotMatch(await saved(),/data-indent/);

  // Indents never go past six steps.
  for(let i=0;i<9;i++)await press('Tab');
  assert.equal(await depths(),'0,6');

  // Enter on an indented line starts the next one at the same depth.
  await open('<p data-indent="1">Indented</p>');
  await caret('p',8);
  await press('Enter');
  assert.equal(await depths(),'1,1');

  // Backspace at the start of an indented line steps it out first, then joins lines as usual.
  await open('<p>Above</p><p data-indent="2">Below</p>');
  await caret('p:nth-child(2)',0);
  await press('Backspace');
  assert.equal(await depths(),'0,1');
  await press('Backspace');await press('Backspace');
  assert.equal(await evaluate(`document.querySelector('.rich-text').textContent`),'AboveBelow');

  // Several selected lines move together.
  await open('<p>One</p><p>Two</p><p>Three</p>');
  await evaluate(`(()=>{const p=document.querySelectorAll('.rich-text p');p[0].closest('.rich-text').focus();const r=document.createRange();r.setStart(p[0].firstChild,1);r.setEnd(p[1].firstChild,2);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
  await press('Tab');
  assert.equal(await depths(),'1,1,0');

  // Bullets still nest as before.
  await open('<ul><li>Parent</li><li>Child</li></ul>');
  await caret('li:nth-child(2)',0);
  await press('Tab');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text li li').length`),1);

  // In a code block Tab types four spaces.
  await open('<pre><code>x = 1</code></pre>');
  await caret('pre',0);
  await press('Tab');
  assert.equal(await evaluate(`document.querySelector('.rich-text pre').textContent`),'    x = 1');

  // A saved indent survives reopening the note.
  await open('<p data-indent="3">Kept</p><p data-indent="9" style="color:red">Too deep</p>');
  assert.equal(await depths(),'3,0','only depths 1-6 are kept');
  console.log('Tab indent tests passed');
}finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
