import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-class-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),20000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.CLASS_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof marginClass!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const text=sel=>evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent||''`);
  const count=sel=>evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`(()=>{
    localStorage.clear();
    state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[],materials:[],packs:[],assessments:[],checklist:[]}];
    state.notes=[{id:'n',title:'Cells',projectId:'bio',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'a',type:'text',text:'The mitochondria produce most of the cell’s ATP.',html:'<p>The mitochondria produce most of the cell’s ATP.</p>'}]}];
    state.focusSessions=[];active='n';render();setMode('write');
  })()`);
  await wait(250);

  const rect=sel=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width}})()`);
  const resize=width=>call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId).then(()=>wait(150));
  await evaluate(`localStorage.removeItem('notival.class.hideTimer');marginClass.begin(40,{fullscreen:false})`);await wait(300);
  await evaluate(`window.T0=marginClass.session().startedAt;window.at=s=>window.T0+s*1000;window.run=(from,to,present)=>{marginClass.setProbe(()=>present);for(let s=from+1;s<=to;s++)marginClass.tick(window.at(s))}`);
  await evaluate(`run(0,120,true)`);
  // Wide window: the panel sits in the empty column to the right of the note
  let hud=await rect('#class-hud'),note=await rect('#editor');
  assert.ok(hud.l>note.r+20,'the panel is to the right of the note, not over it: '+JSON.stringify({hud,note}));
  assert.ok(hud.t<120&&hud.w<300,'a narrow panel near the top');
  assert.ok(await evaluate(`document.querySelector('#class-hud .hud-actions').getBoundingClientRect().top>document.querySelector('#class-hud .hud-stats').getBoundingClientRect().bottom`),'stats, then buttons, stacked');
  // Hide the timer
  assert.equal(await text('#class-hud .hud-toggle'),'Hide timer');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#class-hud .hud-left')).display`),'block');
  await evaluate(`document.querySelector('#class-hud .hud-toggle').click()`);await wait(60);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#class-hud .hud-left')).display`),'none','the countdown is gone');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#class-hud .hud-bar')).display`),'none');
  assert.equal(await text('#class-hud .hud-toggle'),'Show timer');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#class-hud [data-stat=here]')).display`),'flex','the stats stay');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#class-hud .hud-end')).display`),'block','and the buttons');
  await evaluate(`run(120,180,true)`);assert.equal(await evaluate(`document.querySelector('#class-hud .hud-left').textContent`),'37:00','time keeps running underneath');
  assert.equal(await evaluate(`localStorage.getItem('notival.class.hideTimer')`),'true','the choice is remembered');
  // The time-up prompt still appears
  await evaluate(`run(180,2400,true)`);await wait(100);
  assert.equal(await count('#class-timeup'),1,'time-up still appears with the timer hidden');
  await evaluate(`[...document.querySelectorAll('#class-timeup button')].find(b=>b.textContent==='Keep going').click()`);
  // Parked thoughts show in the panel
  await evaluate(`marginClass.session().parked.push({t:Date.now(),text:'Ask about the Krebs cycle'});run(2400,2401,true)`);
  assert.match(await text('#class-hud .hud-parked'),/Ask about the Krebs cycle/);
  // A narrower window falls back to the strip across the top
  await resize(1000);hud=await rect('#class-hud');
  assert.ok(hud.t<30&&hud.w>=400&&Math.abs((hud.l+hud.r)/2-500)<20,'the strip returns on a narrow window: '+JSON.stringify(hud));
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#class-hud .hud-parked')).display`),'none');
  await resize(1440);
  // The choice survives the next class
  await evaluate(`marginClass.end?.()`);await wait(100);
  await evaluate(`document.querySelectorAll('#class-wrap-up, .class-dialog').forEach(d=>d.remove?.())`);
  await evaluate(`marginClass.begin(40,{fullscreen:false})`);await wait(300);
  assert.equal(await text('#class-hud .hud-toggle'),'Show timer','the next class starts with the timer still hidden');
  await evaluate(`document.querySelector('#class-hud .hud-toggle').click()`);await wait(60);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#class-hud .hud-left')).display`),'block','and it comes back');
  console.log('PASS: class view — timer panel beside the note on wide windows, strip on narrow, Hide/Show timer remembered, time-up still appears, parked thoughts listed.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
