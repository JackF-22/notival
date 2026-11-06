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
  await call('Emulation.setDeviceMetricsOverride',{width:1100,height:850,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),mouse=(type,p,buttons)=>call('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons,clickCount:1},sessionId);
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(80);
  const connect=async(html,a,b,relation)=>{
    await evaluate(`setMode('write');current().nodes=[];current().passageConnections=[];current().blocks=[{id:'b1',type:'text',text:'x',html:${JSON.stringify(html)}}];render()`);await wait(150);
    await evaluate(`document.querySelector('#connect-passages').click()`);await wait(100);
    const pts=await evaluate(`JSON.stringify([${JSON.stringify(a)},${JSON.stringify(b)}].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.left+Math.min(15,r.width/2),y:r.top+r.height/2}}))`).then(JSON.parse);
    await mouse('mousePressed',pts[0],1);await mouse('mouseMoved',pts[1],1);await mouse('mouseReleased',pts[1],0);await wait(120);
    assert.equal(await evaluate(`document.querySelector('#passage-connection-dialog').open`),true);
    await evaluate(`(()=>{const r=document.querySelector('#passage-connection-dialog .rich-text');r.innerHTML=${JSON.stringify(relation)};r.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#passage-connection-dialog form').requestSubmit()})()`);await wait(200);
  };
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click();document.querySelector(".rich-text").focus()');await wait(150);
  const badge=()=>evaluate(`document.querySelector('.block .word-count')?.textContent??null`);
  // Off by default; nothing on screen until you ask for it.
  assert.equal(await badge(),null);
  assert.equal(await evaluate(`!!document.querySelector('.word-count-toggle')`),false,'no button on the boxes themselves');
  assert.equal(await evaluate(`document.querySelector('#insert-word-count').textContent`),'Show word count');
  await call('Input.insertText',{text:'hello brave new world'},sessionId);
  await evaluate(`document.querySelector('#editor-insert').click();document.querySelector('#insert-word-count').click()`);await wait(100);
  assert.equal(await badge(),'4 words');
  assert.equal(await evaluate(`document.querySelector('#insert-word-count').textContent`),'Hide word count');
  // It follows the typing.
  await call('Input.insertText',{text:' again'},sessionId);await wait(80);
  assert.equal(await badge(),'5 words');
  // Selecting part of the block shows how much of it is selected.
  await evaluate(`(()=>{const t=document.querySelector('.rich-text p').firstChild,r=document.createRange();r.setStart(t,6);r.setEnd(t,15);getSelection().removeAllRanges();getSelection().addRange(r)})()`);await wait(120);
  assert.equal(await badge(),'2 of 5 words');
  assert.match(await evaluate(`document.querySelector('.word-count').title`),/5 words · \d+ characters · about 1 min read/);
  // Rendered equations don't inflate the count; punctuation and contractions count sensibly.
  await evaluate(`current().blocks[0].html='<p>It’s a well-known fact — really! <span class="equation inline-equation" data-equation="x^{2}+y^{2}=z^{2}" contenteditable="false"></span> Done.</p><ul><li>one</li><li>two</li></ul>';render()`);await wait(250);
  assert.equal(await badge(),'8 words');
  // The choice belongs to the block and is remembered.
  assert.equal(await evaluate(`current().blocks[0].wordCount`),true);
  await evaluate(`render()`);await wait(200);
  assert.equal(await badge(),'8 words');
  await evaluate(`document.querySelector('.rich-text').focus();document.querySelector('#editor-insert').click();document.querySelector('#insert-word-count').click()`);await wait(100);
  assert.equal(await badge(),null);
  assert.equal(await evaluate(`!!current().blocks[0].wordCount`),false);
  // Other blocks are independent, and code cells don't get one.
  await evaluate(`document.querySelector('[data-add=text]').click()`);await wait(200);
  assert.equal(await evaluate(`document.querySelectorAll('.word-count').length`),0);
  await evaluate(`document.querySelectorAll('.rich-text')[1].focus();RichEditor.command('wordcount')`);await wait(100);
  assert.equal(await evaluate(`document.querySelectorAll('.block')[1].querySelector('.word-count').textContent`),'0 words');
  await evaluate(`document.querySelector('[data-add=code]').click()`);await wait(200);
  assert.equal(await evaluate(`document.querySelectorAll('.block.code .word-count').length`),0);
  // The slash menu offers it too.
  assert.equal(await evaluate(`typeof RichEditor.command`),'function');
  console.log('PASS: the word counter switches on per block, follows typing and selection, ignores equations, and is remembered.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
