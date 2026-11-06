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
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`state.projects=['Biology','Computer Science','History','Chemistry','Art','Music'].map((n,i)=>({id:'p'+i,name:n,icon:'📘',color:'#4a9d6f',description:'About '+n,units:[],materials:[],packs:[],assessments:[],checklist:[{id:'t'+i,title:'Task '+n,date:'2099-01-0'+(i+1),done:false}]}));state.notes=Array.from({length:14},(_,i)=>({id:'n'+i,projectId:'p'+(i%6),title:'Note '+(i+1),updated:Date.now()-i*60000,blocks:[{id:'b'+i,type:'text',text:'Some text for note '+(i+1)}],nodes:[]}));window.marginHome(null)`);
  const measure=async width=>{await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await wait(350);return evaluate(`(()=>{const main=document.querySelector('main').getBoundingClientRect(),home=document.querySelector('.student-home-view').getBoundingClientRect(),todo=document.querySelector('.global-todo').getBoundingClientRect(),grid=document.querySelector('.subject-grid'),tiles=[...grid.children],firstTop=tiles[0].getBoundingClientRect().top,perRow=tiles.filter(t=>Math.abs(t.getBoundingClientRect().top-firstTop)<2).length,cards=[...document.querySelectorAll('.home-layout .note-card-grid .note-card')],shown=cards.filter(c=>c.getBoundingClientRect().height>0&&c.getBoundingClientRect().bottom<=c.parentElement.getBoundingClientRect().bottom+1).length,left=Math.max(...tiles.map(t=>t.getBoundingClientRect().right));return JSON.stringify({main:Math.round(main.width),home:Math.round(home.width),todoRight:Math.round(main.right-todo.right),todoWidth:Math.round(todo.width),gap:Math.round(todo.left-left),perRow,shown,overflow:document.documentElement.scrollWidth>innerWidth})})()`).then(JSON.parse)};
  const big=await measure(2400);
  // On a big screen the content uses the width instead of sitting in a centered column.
  assert.ok(big.home>big.main-8,'the home view spans the window: '+JSON.stringify(big));
  assert.ok(big.todoRight>=24&&big.todoRight<=70,'the to-do list rides the right edge with padding: '+JSON.stringify(big));
  assert.ok(big.perRow>=4,'subject tiles spread across the left: '+JSON.stringify(big));
  assert.ok(big.gap>=24&&big.gap<=110,'a sensible gap before the to-do list: '+JSON.stringify(big));
  assert.ok(big.shown>=10,'more recent notes fit the extra width: '+JSON.stringify(big));
  assert.equal(big.overflow,false);
  const medium=await measure(1400);
  assert.ok(medium.todoRight>=24&&medium.todoRight<=70&&medium.perRow>=2&&!medium.overflow,'a normal screen still works: '+JSON.stringify(medium));
  const small=await measure(900);
  assert.equal(small.overflow,false);
  console.log('PASS: on big screens the home page spreads subjects and recent notes across the space and pushes the to-do list to the right edge.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
