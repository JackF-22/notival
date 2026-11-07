import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-eqdel-');
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
  const eq='<div class="equation display-equation" data-equation="x^2+y^2=z^2" contenteditable="false">x^2+y^2=z^2</div>';
  const open=html=>evaluate(`(()=>{state.notes=[{id:'n',title:'Eq',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'a',type:'text',text:'x',html:${JSON.stringify(html)}}]}];active='n';render();setMode('write')})()`).then(()=>wait(250));
  // put the caret at the start (or end) of the first element matching `selector`, the way a click would
  const caret=(selector,atEnd=false)=>evaluate(`(()=>{const node=document.querySelector('.rich-text '+${JSON.stringify(selector)});const rich=node.closest('.rich-text');rich.focus();
    let target=node;while(target.firstChild&&target.firstChild.nodeType===1&&!target.firstChild.matches('br'))target=${atEnd?'target.lastChild':'target.firstChild'};
    const r=document.createRange();if(target.firstChild?.nodeType===3){r.setStart(target.firstChild,${atEnd?'target.firstChild.length':'0'})}else{r.selectNodeContents(target);r.collapse(${atEnd?'false':'true'})}
    const s=getSelection();s.removeAllRanges();s.addRange(r)})()`).then(()=>wait(60));
  const press=key=>call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='Backspace'?8:46},sessionId).then(()=>call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='Backspace'?8:46},sessionId)).then(()=>wait(120));
  const state=()=>evaluate(`(()=>{const rich=document.querySelector('.rich-text');return {equations:rich.querySelectorAll('.display-equation').length,selected:rich.querySelectorAll('.display-equation.selected').length,text:rich.textContent.replace(/x\\^2\\+y\\^2=z\\^2|[\\s\\u00a0]+/g,' ').trim(),bullets:rich.querySelectorAll('li').length}})()`);

  // ── The bug: Backspace at the start of a bullet under a display equation took the equation with it ──
  await open(eq+'<ul><li>first point</li></ul>');
  await caret('li');
  await press('Backspace');
  let now=await state();
  assert.equal(now.equations,1,'the equation stays');
  assert.match(now.text,/first point/,'the bullet text stays');
  assert.equal(now.bullets,0,'Backspace at the start of the bullet un-bullets it, as in any editor');
  // a second bullet's Backspace is about that bullet too
  await open(eq+'<ul><li>one</li><li>two</li></ul>');
  await caret('li:nth-child(2)');
  await press('Backspace');
  now=await state();assert.equal(now.equations,1);assert.match(now.text,/one\s*two|onetwo/);
  // Delete at the end of the last bullet, with an equation after the list, leaves the equation alone
  await open('<ul><li>last point</li></ul>'+eq+'<p>after</p>');
  await caret('li',true);
  await press('Delete');
  now=await state();assert.equal(now.equations,1,'Delete at the end of a bullet keeps the equation below');

  // ── A line right under an equation: first press selects the equation, the second removes it ──
  await open(eq+'<p>Hello</p>');
  await caret('p');
  await press('Backspace');
  now=await state();assert.deepEqual([now.equations,now.selected],[1,1],'selected, not deleted');
  assert.match(now.text,/Hello/);
  await press('Backspace');
  now=await state();assert.equal(now.equations,0,'the second press removes it');assert.match(now.text,/Hello/,'the line itself is untouched');

  // ── An empty line under an equation just goes, and the equation is selected, not deleted ──
  await open(eq+'<p><br></p><p>more</p>');
  await caret('p');
  await press('Backspace');
  now=await state();
  assert.deepEqual([now.equations,now.selected],[1,1]);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text > p').length`),1,'the empty line is gone');

  // ── Inside one line, an inline equation right before the caret still goes in one press ──
  await open('<p>Area <span class="equation inline-equation" data-equation="\\\\pi r^2" contenteditable="false">\\pi r^2</span> then</p>');
  await evaluate(`(()=>{const p=document.querySelector('.rich-text p'),t=[...p.childNodes].find(n=>n.nodeType===3&&/then/.test(n.textContent));const rich=p.closest('.rich-text');rich.focus();const r=document.createRange();r.setStart(t,1);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);await wait(60);
  await press('Backspace');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text .inline-equation').length`),0,'inline equations behave as before');

  console.log('PASS: equations and Backspace/Delete — a bullet under a display equation un-bullets without touching it, a line below selects it first, empty lines just go, inline equations unchanged.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
