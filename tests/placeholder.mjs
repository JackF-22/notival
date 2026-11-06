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
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(120);await evaluate('document.querySelector(".rich-text").focus()');await wait(60);
  const placeholder=()=>evaluate(`getComputedStyle(document.querySelector('.rich-text').firstElementChild,'::before').content`);
  const flagged=()=>evaluate(`document.querySelector('.rich-text').hasAttribute('data-empty')`);
  // An empty note shows the placeholder until you click in; it cannot be selected or clicked.
  await evaluate(`document.querySelector('.rich-text').blur()`);await wait(60);
  assert.equal(await placeholder(),'"Click here to write…"');
  assert.equal(await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.rich-text').firstElementChild,'::before');return s.pointerEvents+'|'+(s.userSelect||s.webkitUserSelect)})()`),'none|none');
  // Typing removes it.
  await call('Input.insertText',{text:'hello'},sessionId);await wait(60);
  assert.equal(await flagged(),false);
  assert.notEqual(await placeholder(),'"Click here to write…"');
  // Deleting everything brings it back.
  await evaluate(`(()=>{const e=document.querySelector('.rich-text');e.innerHTML='<p><br></p>'})()`);await wait(60);
  assert.equal(await flagged(),true);
  // Stray bare text beside the empty line (which the old rule ignored) removes it.
  await evaluate(`(()=>{const e=document.querySelector('.rich-text');e.append(document.createTextNode('stray words'))})()`);await wait(60);
  assert.equal(await flagged(),false);
  assert.notEqual(await placeholder(),'"Click here to write…"');
  // Other content counts too: a list, a table, a picture.
  await evaluate(`document.querySelector('.rich-text').innerHTML='<p><br></p><ul><li><br></li></ul>'`);await wait(60);
  assert.equal(await flagged(),false);
  await evaluate(`document.querySelector('.rich-text').innerHTML='<p><br></p>'`);await wait(60);
  assert.equal(await flagged(),true);
  // The placeholder text is never part of the note's own content or its saved text.
  assert.equal(await evaluate(`document.querySelector('.rich-text').textContent.includes('Click here')`),false);
  assert.equal(await evaluate(`current().blocks[0].text.includes('Click here')`),false);
  // Clicking in clears the placeholder, and the caret starts at the very left of the line, not after the hint.
  await evaluate(`(()=>{const e=document.querySelector('.rich-text');e.innerHTML='<p><br></p>';e.blur()})()`);await wait(80);
  assert.equal(await placeholder(),'"Click here to write…"');
  const spot=await evaluate(`(()=>{const r=document.querySelector('.rich-text').getBoundingClientRect();return {x:r.left+60,y:r.top+14}})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...spot,button:'left',buttons:1,clickCount:1},sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',...spot,button:'left',buttons:0,clickCount:1},sessionId);await wait(150);
  assert.equal(await placeholder(),'none');
  const left=()=>evaluate(`(()=>{const c=document.querySelector('#slant-caret').getBoundingClientRect(),p=document.querySelector('.rich-text').firstElementChild.getBoundingClientRect();return Math.round(c.left-p.left)})()`);
  assert.ok(Math.abs(await left())<=3,'caret sits at the start of the line');
  // The hint also takes no room, so a heading's caret starts at its left edge too.
  await evaluate(`(()=>{const e=document.querySelector('.rich-text');e.innerHTML='<h2><br></h2>';const r=document.createRange();r.setStart(e.firstElementChild,0);r.collapse(true);e.focus();getSelection().removeAllRanges();getSelection().addRange(r)})()`);await wait(150);
  assert.equal(await placeholder(),'"Heading 2"');
  assert.ok(Math.abs(await left())<=3,'a heading caret also starts at the left edge');
  await call('Input.insertText',{text:'Typed'},sessionId);await wait(80);
  assert.equal(await evaluate(`document.querySelector('.rich-text h2').textContent`),'Typed');
  console.log('PASS: the writing placeholder shows only in an empty note, and can never be selected or become text.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
