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
  const seed=`state.projects=[
{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[{id:'u1',name:'Cells'}],materials:[],packs:[],assessments:[{id:'a1',title:'Midterm',date:'2026-12-10',kind:'test'}],checklist:[{id:'t1',title:'Read chapter 4',done:false},{id:'t2',title:'Lab report',date:'2026-11-08',time:'17:00',done:false}]},
{id:'cs',name:'Computer Science',icon:'💻',color:'#4a6fc7',units:[],materials:[],packs:[],assessments:[],checklist:[{id:'t4',title:'HW3',date:'2026-11-07',time:'23:59',done:false},{id:'t5',title:'Review recursion',done:true}]}];
state.notes=[1,2,3,4].map(i=>({id:'n'+i,projectId:i%2?'bio':'cs',title:'Note number '+i,updated:i,blocks:[{id:'b'+i,type:'text',text:'Some content for note '+i}],nodes:[]}));`;
  await evaluate(seed+`window.marginHome(null)`);await wait(300);
  // Every task and dated test, from all subjects: open ones in due order, finished ones last, each labelled with its subject.
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.global-task')].map(r=>r.querySelector('.check-label').textContent+'|'+r.querySelector('.subject-tag').textContent.trim())`),['HW3|💻Computer Science','Lab report|🧬Biology','Midterm|🧬Biology','Read chapter 4|🧬Biology','Review recursion|💻Computer Science']);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.global-todo')).gridColumnStart`),'2');
  // Ticking a task updates its subject; adding one files it under the chosen subject.
  await evaluate(`document.querySelector('.global-task input').click()`);
  assert.equal(await evaluate(`state.projects[1].checklist[0].done`),true);
  await wait(750);
  // Finished tasks drop into a Completed group at the bottom of the list.
  assert.equal(await evaluate(`document.querySelectorAll('.global-todo .completed-list .global-task').length`),2);
  assert.equal(await evaluate(`document.querySelectorAll('.global-todo .active-items .global-task').length`),3);
  assert.equal(await evaluate(`(()=>{const l=document.querySelector('.global-todo-list');return l.querySelector('.active-items').compareDocumentPosition(l.querySelector('.completed-items'))&Node.DOCUMENT_POSITION_FOLLOWING})()`)>0,true);
  await evaluate(`(()=>{document.querySelector('.global-add select').value='cs';const i=document.querySelector('.global-add input');i.value='Read paper';i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.global-add').requestSubmit()})()`);await wait(200);
  assert.equal(await evaluate(`state.projects[1].checklist.some(t=>t.title==='Read paper')`),true);
  assert.equal(await evaluate(`[...document.querySelectorAll('.global-task')].some(r=>/Read paper/.test(r.textContent)&&/Computer Science/.test(r.textContent))`),true);
  // Selected notes can be archived or deleted together, and Undo restores them.
  await evaluate(`window.marginHome(null)`);await wait(250);
  const before=await evaluate('state.notes.length');
  await evaluate(`[...document.querySelectorAll('.note-card .filing-select')].slice(0,2).forEach(c=>c.click())`);await wait(100);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.filing-selection button')].map(b=>b.textContent)`),['Move to…','Archive','Delete','Clear']);
  await evaluate(`[...document.querySelectorAll('.filing-selection button')].find(b=>b.textContent==='Archive').click()`);await wait(200);
  assert.equal(await evaluate(`state.notes.length+','+state.archive.length`),(before-2)+',2');
  await evaluate(`document.querySelector('#toast button').click()`);await wait(200);
  assert.equal(await evaluate(`state.notes.length+','+state.archive.length`),before+',0');
  await evaluate(`[...document.querySelectorAll('.note-card .filing-select')].slice(0,1).forEach(c=>c.click())`);await wait(100);
  await evaluate(`[...document.querySelectorAll('.filing-selection button')].find(b=>b.textContent==='Delete').click()`);await wait(200);
  assert.equal(await evaluate(`state.notes.length+','+state.trash.length`),(before-1)+',1');
  await evaluate(`document.querySelector('#toast button').click()`);await wait(200);
  assert.equal(await evaluate(`state.notes.length+','+state.trash.length`),before+',0');
  // A subject's own home keeps the to-do list beside the content, with notes before units.
  await evaluate(`window.marginShowProject('bio')`);await wait(250);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.subject-widgets')).gridColumnStart`),'2');
  assert.equal(await evaluate(`(()=>{const r=document.querySelector('.subject-recents'),u=document.querySelector('.subject-units');return !!(r.compareDocumentPosition(u)&Node.DOCUMENT_POSITION_FOLLOWING)})()`),true);
  console.log('PASS: global to-do lists every subject with labels, stays in sync, and the subject home leads with notes.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
