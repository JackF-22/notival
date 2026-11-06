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
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(150);
  await evaluate(`current().blocks[0].html='<h2>Osmosis</h2><p>Water moves <strong>toward</strong> the lower potential.</p><ul><li>First point<ul><li>Nested point</li></ul></li><li>Second point</li></ul><p>See <span class="equation inline-equation" data-equation="x^2" contenteditable="false"></span> and more.</p>';render()`);await wait(300);
  // Watch what the copy puts on the clipboard (a real click gives the browser the user gesture it needs).
  await evaluate(`window.__copied=null;window.addEventListener('copy',e=>{window.__copied={plain:e.clipboardData.getData('text/plain'),html:e.clipboardData.getData('text/html')}})`);
  const point=await evaluate(`(()=>{const b=document.querySelector('.block:not(.code) .cell-copy');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  assert.ok(point,'text cells have a Copy button');
  const block=await evaluate(`(()=>{const r=document.querySelector('.block').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+30}})()`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...block},sessionId);await wait(120);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1},sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1},sessionId);await wait(150);
  const copied=await evaluate(`window.__copied`);
  assert.ok(copied,'the cell was copied');
  // Rich: formatting travels. Plain: clean lines, bullets, and the equation as LaTeX.
  assert.match(copied.html,/<h2>Osmosis<\/h2>/);assert.match(copied.html,/<strong>toward<\/strong>/);assert.match(copied.html,/<li>First point/);
  assert.equal(copied.plain,'Osmosis\nWater moves toward the lower potential.\n• First point\n  • Nested point\n• Second point\nSee $x^2$ and more.');
  assert.equal(await evaluate(`document.querySelector('.cell-copy').title`),'Copied');
  await wait(1500);
  assert.ok(await evaluate(`!!document.querySelector('.cell-copy svg')`),'copy button uses the two-rectangle icon');
  // Copying leaves the caret and the note exactly as they were.
  assert.equal(await evaluate(`current().blocks[0].html.includes('Osmosis')&&getSelection().isCollapsed`),true);
  // Each text cell has its own; code cells keep their own Copy and don't get a second one.
  await evaluate(`document.querySelector('[data-add=text]').click()`);await wait(200);
  assert.equal(await evaluate(`document.querySelectorAll('.block:not(.code) .cell-copy').length`),2);
  await evaluate(`document.querySelector('[data-add=code]').click()`);await wait(200);
  assert.equal(await evaluate(`document.querySelectorAll('.block.code .cell-copy').length`),0);
  console.log('PASS: text cells have a Copy button that copies with formatting and clean plain text, and leaves the note untouched.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
