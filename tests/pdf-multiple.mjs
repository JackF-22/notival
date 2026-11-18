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
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(150);
  await evaluate(`window.__sent=[];window.native=m=>window.__sent.push(m);Object.assign(current(),{pdfPath:'/x/One.pdf',pdfName:'One.pdf'});render()`);await wait(100);
  const chips=()=>evaluate(`JSON.stringify([...document.querySelectorAll('#pdf-status>span,#pdf-status>.pdf-chip')].map(e=>e.className+':'+e.textContent))`).then(JSON.parse);
  assert.equal((await chips()).length,1);
  // Attaching a second PDF keeps the first and shows the new one.
  await evaluate(`PDFSet.activate(current(),'/x/Two.pdf','Two.pdf');render()`);await wait(100);
  assert.deepEqual(await chips(),['pdf-chip:▧ One.pdf',':▧ Two.pdf']);
  // The pane's cycle buttons call marginPDFCycle; it moves to the other PDF and tells the pane.
  await evaluate(`openPDFPath='/x/Two.pdf';window.marginPDFCycle({step:1})`);await wait(100);
  assert.equal(await evaluate('current().pdfPath'),'/x/One.pdf');
  assert.deepEqual(await evaluate('JSON.stringify(window.__sent.filter(m=>m.type==="showPDF").pop())').then(JSON.parse),{type:'showPDF',path:'/x/One.pdf'});
  assert.deepEqual(await evaluate('JSON.stringify(PDFSet.position(current()))').then(JSON.parse),{index:0,count:2});
  // A chip switches to its PDF.
  await evaluate(`document.querySelector('#pdf-status>.pdf-chip').click()`);await wait(100);
  assert.equal(await evaluate('current().pdfPath'),'/x/Two.pdf');
  console.log('PASS: a note holds several PDFs, the bar lists them, and cycling switches the PDF beside the note.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
