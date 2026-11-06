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
  await call('Emulation.setDeviceMetricsOverride',{width:1300,height:800,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(100);
  // A note with a PDF attached keeps its note map while the PDF is not open, and gives the space up while it is.
  await evaluate(`Object.assign(current(),{pdfPath:'/x/Paper.pdf',pdfName:'Paper.pdf'});current().blocks[0].html='<h1>Intro</h1><p>Text</p><h2>Methods</h2><p>More</p>';render()`);await wait(300);
  assert.equal(await evaluate('document.querySelector("#note-rail").hidden'),false);
  assert.match(await evaluate('document.querySelector("#note-rail").textContent'),/Intro.*Methods/);
  await evaluate(`openPDFPath='/x/Paper.pdf';renderNoteRail()`);await wait(100);
  assert.equal(await evaluate('document.querySelector("#note-rail").hidden'),true);
  await evaluate(`window.marginPDFClosed()`);await wait(150);
  assert.equal(await evaluate('document.querySelector("#note-rail").hidden'),false);
  // The left margin offers the attached PDF as one big click target while it is not open.
  await evaluate(`openPDFPath=null;render()`);await wait(200);
  assert.equal(await evaluate('!document.querySelector("#pdf-edge").hidden'),true);
  assert.equal(await evaluate(`(()=>{const e=document.querySelector('#pdf-edge').getBoundingClientRect(),c=document.querySelector('#note-column').getBoundingClientRect(),a=document.querySelector('article').getBoundingClientRect();return e.right<=c.left&&e.left>=a.left-1&&e.height>=a.height-2})()`),true);
  assert.equal(await evaluate('document.querySelector("#pdf-edge").title'),'Open Paper.pdf beside this note');
  const spot=await evaluate(`(()=>{const r=document.querySelector('#pdf-edge').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height*0.8}})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...spot,button:'left',buttons:1,clickCount:1},sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',...spot,button:'left',buttons:0,clickCount:1},sessionId);await wait(150);
  assert.equal(await evaluate('openPDFPath'),'/x/Paper.pdf');
  assert.equal(await evaluate('document.querySelector("#pdf-edge").hidden'),true);
  await evaluate(`window.marginPDFClosed()`);await wait(150);
  assert.equal(await evaluate('document.querySelector("#pdf-edge").hidden'),false);
  await evaluate(`current().pdfPath=null;render()`);await wait(150);
  assert.equal(await evaluate('document.querySelector("#pdf-edge").hidden'),true);
  // With the PDF open, the header is exactly as tall as the PDF bar (56px) so the lines meet; closed, it returns to normal.
  await evaluate(`Object.assign(current(),{pdfPath:'/x/Paper.pdf',pdfName:'Paper.pdf'});render();openPDFPath='/x/Paper.pdf';renderNoteRail()`);await wait(200);
  assert.equal(await evaluate('Math.round(document.querySelector("header").getBoundingClientRect().height)'),56);
  await evaluate(`window.marginPDFClosed()`);await wait(150);
  assert.ok(await evaluate('document.querySelector("header").getBoundingClientRect().height')>=72);
  console.log('PASS: the note map stays for attached PDFs that are not open, hides while the PDF is open, and returns when it closes.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
