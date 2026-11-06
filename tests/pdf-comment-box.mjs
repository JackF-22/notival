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
  await call('Emulation.setDeviceMetricsOverride',{width:700,height:760,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(150);
  await evaluate(`Object.assign(current(),{pdfPath:'/x/Paper.pdf',pdfName:'Paper.pdf'});openPDFPath='/x/Paper.pdf';setSidebarCollapsed(true);render();window.marginPDFSelection({text:'Water moves across the cell membrane.',page:2,path:'/x/Paper.pdf',name:'Paper.pdf',bounds:{x:10,y:10,width:100,height:20}})`);await wait(500);
  // The comment box fills its row, and what you type starts at its left edge.
  assert.equal(await evaluate(`(()=>{const w=document.querySelector('.pdf-comment-editor').getBoundingClientRect(),e=document.querySelector('.pdf-comment-editor .rich-text').getBoundingClientRect();return e.width>w.width*0.85&&e.left-w.left<24})()`),true);
  await call('Input.insertText',{text:'My comment here'},sessionId);await wait(150);
  assert.equal(await evaluate(`(()=>{const e=document.querySelector('.pdf-comment-editor .rich-text'),r=document.createRange();r.selectNodeContents(e);return r.getBoundingClientRect().left-e.getBoundingClientRect().left<4})()`),true);
  // The buttons stay on the right.
  assert.equal(await evaluate(`(()=>{const a=document.querySelector('#pdf-selection>div:last-child').getBoundingClientRect(),p=document.querySelector('#pdf-selection').getBoundingClientRect();return a.right>p.right-30})()`),true);
  console.log('PASS: the PDF comment box fills its row and text starts at its left edge.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
