import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-eqlist-');
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
  const open=(html,text='x')=>evaluate(`(()=>{state.notes=[{id:'n',title:'Eq list',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'a',type:'text',text:${JSON.stringify(text)},html:${JSON.stringify(html)}}]}];active='n';render();setMode('write')})()`).then(()=>wait(250));
  // caret at `offset` inside the text of the element matching `selector`
  const caret=(selector,offset=0)=>evaluate(`(()=>{const node=document.querySelector('.rich-text '+${JSON.stringify(selector)});node.closest('.rich-text').focus();let text=node;while(text.firstChild)text=text.firstChild;const r=document.createRange();r.setStart(text,${offset});r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`).then(()=>wait(60));
  const codes={Tab:9,Backspace:8,Enter:13};
  const press=(key,shift=false)=>call('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code:key,windowsVirtualKeyCode:codes[key],modifiers:shift?8:0},sessionId)
    .then(()=>key==='Enter'?call('Input.dispatchKeyEvent',{type:'char',key,text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13},sessionId):null)
    .then(()=>call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:codes[key],modifiers:shift?8:0},sessionId)).then(()=>wait(100));
  const depths=()=>evaluate(`[...document.querySelector('.rich-text').children].map(line=>line.dataset.indent||'0').join(',')`);
  const saved=()=>evaluate(`current().blocks[0].html`);

  const type=text=>call('Input.insertText',{text},sessionId).then(()=>wait(120));
  const caretEnd=selector=>evaluate(`(()=>{const node=document.querySelector('.rich-text '+${JSON.stringify(selector)});node.closest('.rich-text').focus();let text=node;while(text.lastChild)text=text.lastChild;const r=document.createRange();if(text.nodeType===3)r.setStart(text,text.length);else{r.selectNodeContents(node);r.collapse(false)}r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`).then(()=>wait(60));
  // The number each item shows, the way the browser counts it, and the text of each.
  const items=()=>evaluate(`[...document.querySelectorAll('.rich-text > ol')].flatMap(list=>[...list.children].map((li,i)=>((list.start||1)+i)+':'+([...li.childNodes].filter(n=>!n.classList?.contains('equation')).map(n=>n.textContent).join('').trim()||'(empty)')+(li.querySelector('.display-equation')?'+eq':''))).join(' ')`);
  const markdown=()=>evaluate(`current().blocks[0].text`);
  const eq='<div class="equation display-equation" data-equation="x^2" contenteditable="false">x^2</div>';

  // Writing an equation on the bullet after item 1 puts it under item 1, so the next line is 2.
  await open('<ol><li>First</li></ol>');
  await caretEnd('li');await press('Enter');
  await type('/equation');await press('Enter');
  await type('x^2');await press('Enter');await wait(150);
  await type('Second');
  assert.equal(await items(),'1:First+eq 2:Second');
  assert.equal(await markdown(),'1. First\n    $$\n    x^2\n    $$\n2. Second');

  // The equation written below the list, then "2. " typed under it: the list carries on instead of restarting at 1.
  await open('<ol><li>First</li></ol>'+eq+'<p>2.</p>');
  await caretEnd('p');await type(' ');await type('Second');
  assert.equal(await items(),'1:First+eq 2:Second');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text > ol').length`),1,'one list');
  // ...and carries on again after a second equation.
  await press('Enter');await type('/equation');await press('Enter');await type('y^2');await press('Enter');await wait(150);await type('Third');
  assert.equal(await items(),'1:First+eq 2:Second+eq 3:Third');

  // Blank lines left around the equation don't stop it either.
  await open('<ol><li>First</li><li>Second</li></ol><p><br></p>'+eq+'<p><br></p><p>3.</p>');
  await caretEnd('p:last-child');await type(' ');await type('Third');
  assert.equal(await items(),'1:First 2:Second+eq 3:Third');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text > p').length`),0,'the blank lines between are tidied away');

  // "1. " under an equation still starts a new list.
  await open('<ol><li>First</li></ol>'+eq+'<p>1.</p>');
  await caretEnd('p');await type(' ');await type('Fresh');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text > ol').length`),2);
  assert.equal(await items(),'1:First 1:Fresh');

  // A list can start at any number, and keeps it when saved and reopened.
  await open('<p>3.</p>');
  await caretEnd('p');await type(' ');await type('Third');
  assert.equal(await items(),'3:Third');
  assert.match(await evaluate(`current().blocks[0].html`),/<ol start="3">/);
  assert.equal(await markdown(),'3. Third');
  await open(await evaluate(`current().blocks[0].html`));
  assert.equal(await items(),'3:Third');

  // Notes kept as text: a list broken by an equation picks its numbering back up.
  await open('', '1. First\n\n$$\nx^2\n$$\n\n2. Second\n3. Third');
  assert.equal(await items(),'1:First 2:Second 3:Third');
  console.log('Equation list tests passed');
}finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
