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
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`state.projects=[{id:'p0',name:'7.012 Biology',icon:'📘',color:'#4a9d6f',description:'Notes',units:[],materials:[],packs:[],assessments:[],checklist:Array.from({length:14},(_,i)=>({id:'t'+i,title:'Assignment '+i,done:false,due:Date.now()+i*86400000}))}];state.notes=[{id:'n0',title:'Recitation',projectId:'p0',updated:Date.now(),blocks:[{id:'b',type:'text',text:'hello',html:'hello'}],nodes:[],pinned:false}];active=null;window.marginHome('p0')`);await wait(400);
  const gaps=await evaluate(`(()=>{const v=document.querySelector('.student-home-view'),kids=[...v.children].filter(c=>c.offsetParent&&!c.classList.contains('subject-widgets')&&getComputedStyle(c).gridColumnStart==='1'),out=[];for(let i=1;i<kids.length;i++)out.push(Math.round(kids[i].getBoundingClientRect().top-kids[i-1].getBoundingClientRect().bottom));return out})()`);
  assert.ok(gaps.every(g=>g>=0),'nothing on a busy subject page overlaps the item above it: '+gaps);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#share-note')).display`),'none','there is no Share button on a page that is not a note');
  await evaluate(`active='n0';mode='write';render()`);await wait(300);
  const share=await evaluate(`(()=>{const b=document.querySelector('#share-note'),r=b?.getBoundingClientRect();return !!r&&r.width>0&&r.right<=innerWidth})()`);
  assert.equal(share,true,'the Share button is visible on a note');
  console.log('PASS: a subject page with a long to-do list keeps its spacing, and a note shows the Share button.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
