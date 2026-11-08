import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-listexit-');
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

  const type=text=>call('Input.insertText',{text},sessionId).then(()=>wait(120));
  // caret at the end of the last bullet matching `selector`, inside whatever it holds
  const caretEnd=(selector='li:last-of-type')=>evaluate(`(()=>{const li=[...document.querySelectorAll('.rich-text '+${JSON.stringify(selector)})].at(-1);document.querySelector('.rich-text').focus();let t=li;while(t.lastChild)t=t.lastChild;const r=document.createRange();if(t.nodeType===3)r.setStart(t,t.length);else r.setStartBefore(t);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`).then(()=>wait(60));
  const typedLine=async()=>{await type('out');return evaluate(`(()=>{const n=[...document.querySelectorAll('.rich-text *')].find(e=>[...e.childNodes].some(c=>c.nodeType===3&&c.data.includes('out')));return n.closest('li')?'in a bullet':'plain line'})()`)};

  // The ordinary case: Enter on a fresh empty bullet ends the list.
  await open('<ul><li>One</li></ul>');
  await caretEnd();await press('Enter');await press('Enter');
  assert.equal(await typedLine(),'plain line');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text li').length`),1);

  // Bullets that look empty but hold something invisible end the list too.
  for(const leftover of ['​','<b><br></b>','<span data-flag="f1"><br></span>',' ','<span data-flag="f1">​</span>']){
    await open('<ul><li>One</li><li>'+leftover+'</li></ul>');
    await caretEnd();await press('Enter');
    assert.equal(await typedLine(),'plain line','Enter leaves the list from a bullet holding '+JSON.stringify(leftover));
    assert.equal(await evaluate(`document.querySelectorAll('.rich-text li').length`),1);
  }

  // An empty bullet in the middle splits the list; the numbers below carry on.
  await open('<ol><li>One</li><li><br></li><li>Two</li></ol>');
  await caretEnd('li:nth-child(2)');await press('Enter');
  assert.equal(await typedLine(),'plain line');
  assert.equal(await evaluate(`[...document.querySelectorAll('.rich-text > ol')].map(o=>(o.start||1)+':'+o.textContent).join(' ')`),'1:One 2:Two');

  // Backspace on an empty bullet turns it into a plain line where it is, instead of jumping back up.
  await open('<ul><li>One</li><li>​</li></ul>');
  await caretEnd();await press('Backspace');
  assert.equal(await typedLine(),'plain line');
  assert.equal(await evaluate(`document.querySelector('.rich-text li').textContent`),'One','the bullet above is untouched');

  // A nested empty bullet still steps out one level at a time.
  await open('<ul><li>One<ul><li>Two</li></ul></li></ul>');
  await caretEnd('li li');await press('Enter');await press('Enter');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text li li').length`),1);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text > ul > li').length`),2,'stepped out to the top level');
  await press('Enter');
  assert.equal(await typedLine(),'plain line');

  // Bullets inside a column end the same way, staying in their column.
  await open('<div class="cols" data-n="2"><div class="col"><ul><li>Left</li><li><br></li></ul></div><div class="col"><p>Right</p></div></div>');
  await caretEnd();await press('Enter');
  assert.equal(await typedLine(),'plain line');
  assert.equal(await evaluate(`!!document.querySelector('.rich-text .col:first-child > p')`),true);
  console.log('List exit tests passed');
}finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
