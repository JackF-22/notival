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
  await call('Emulation.setDeviceMetricsOverride',{width:1300,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`(()=>{
    const day=n=>{const t=new Date();t.setDate(t.getDate()+n);const p=x=>String(x).padStart(2,'0');return t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate())};
    state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[],materials:[],packs:[],assessments:[],checklist:[
      {id:'1',title:'Late lab',date:day(-1),time:'09:00',done:false},
      {id:'2',title:'Tonight',date:day(0),time:'23:59',done:false},
      {id:'3',title:'Tomorrow quiz',date:day(1),done:false},
      {id:'4',title:'Friday reading',date:day(4),done:false},
      {id:'5',title:'Next week essay',date:day(9),done:false},
      {id:'6',title:'Far away project',date:day(30),done:false},
      {id:'7',title:'Someday tidy up',done:false},
      {id:'8',title:'Already finished',date:day(2),done:true},
      {id:'9',title:'Earlier this week',date:day(3),done:false}
    ]}];window.marginHome(null)})()`);await wait(300);
  const sections=scope=>evaluate(`JSON.stringify([...document.querySelectorAll(${JSON.stringify(scope)}+' .todo-group')].filter(g=>!g.hidden).map(g=>[g.dataset.group,g.querySelector('summary').textContent,g.open,[...g.querySelectorAll('.check-label')].map(l=>l.textContent)]))`).then(JSON.parse);
  let groups=await sections('.global-todo');
  // Open tasks fall into sections by due date, in order, and each is sorted soonest first.
  assert.deepEqual(groups.map(g=>g[0]),['overdue','today','tomorrow','week','next','later','none']);
  assert.deepEqual(groups.map(g=>g[1]),['Overdue · 1','Today · 1','Tomorrow · 1','This week · 2','Next week · 1','Later · 1','No date · 1']);
  assert.deepEqual(groups.find(g=>g[0]==='week')[3],['Earlier this week','Friday reading']);
  // The near term is open; further-off sections start folded away.
  assert.deepEqual(groups.map(g=>g[2]),[true,true,true,true,false,false,true]);
  // Finished tasks stay out of the sections and wait in Completed.
  assert.equal(await evaluate(`document.querySelectorAll('.global-todo .completed-list .global-task').length`),1);
  // Folding a section is remembered, and so is unfolding one.
  await evaluate(`document.querySelector('.global-todo .todo-group[data-group=week] summary').click();document.querySelector('.global-todo .todo-group[data-group=later] summary').click()`);await wait(100);
  await evaluate(`window.marginHome(null)`);await wait(300);
  groups=await sections('.global-todo');
  assert.equal(groups.find(g=>g[0]==='week')[2],false);
  assert.equal(groups.find(g=>g[0]==='later')[2],true);
  // Ticking a task moves it to Completed and the section's count follows.
  await evaluate(`document.querySelector('.global-todo .todo-group[data-group=tomorrow] input[type=checkbox]').click()`);await wait(900);
  groups=await sections('.global-todo');
  assert.equal(groups.some(g=>g[0]==='tomorrow'),false,'an emptied section disappears');
  assert.equal(await evaluate(`document.querySelectorAll('.global-todo .completed-list .global-task').length`),2);
  // The subject's own list is grouped the same way, with its own remembered state.
  await evaluate(`window.marginHome('bio')`);await wait(300);
  const subject=await sections('.subject-checklist');
  assert.deepEqual(subject.map(g=>g[0]),['overdue','today','week','next','later','none']);
  assert.equal(subject.find(g=>g[0]==='next')[2],false);
  console.log('PASS: to-do lists are split by due date into sections that fold away, remember their state, and keep tasks moving as they are ticked.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
