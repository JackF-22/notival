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
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  const long='word '.repeat(60);
  const under=()=>evaluate(`(()=>{
   const out=[],editor=document.querySelector('#editor');
   for(const block of editor.querySelectorAll(':scope>.block')){
    const tools=block.querySelector('.block-tools');if(!tools)continue;const t=tools.getBoundingClientRect(),range=document.createRange();let hits=0;
    for(const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);walker.nextNode();){const n=walker.currentNode;if(!n.data.trim()||n.parentElement.closest('.block-tools'))continue;range.selectNodeContents(n);for(const r of range.getClientRects())if(r.width>0&&r.left<t.right&&r.right>t.left&&r.top<t.bottom&&r.bottom>t.top)hits++}
    out.push(hits)}
   return out})()`);
  for(const first of [`<p>${long}</p>`,`<h1>${long}</h1>`,`<ul><li>${long}</li></ul>`,`<blockquote>${long}</blockquote>`]){
    for(const width of [1100,720]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false},sessionId);
      await evaluate(`state.projects=[];state.notes=[{id:'n0',title:'T',updated:1,projectId:null,pinned:false,nodes:[],blocks:[{id:'b0',type:'text',html:${JSON.stringify(first)},text:''},{id:'b1',type:'code',language:'javascript',text:'const x = 1;',code:'const x = 1;'},{id:'b2',type:'text',html:'<p>${long}</p>',text:''}]}];active='n0';mode='write';render()`);await wait(450);
      const hits=await under();
      assert.deepEqual(hits.map(h=>h>0),hits.map(()=>false),'the Move, Copy and Delete buttons sit over no text ('+first.slice(0,12)+', '+width+'px): '+hits);
    }
  }
  console.log('PASS: the Move, Copy and Delete buttons never sit over text in any block.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
