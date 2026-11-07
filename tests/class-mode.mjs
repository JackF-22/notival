import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-class-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),15000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.CLASS_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof marginClass!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const text=sel=>evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent||''`);
  const count=sel=>evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`(()=>{
    state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[],materials:[],packs:[],assessments:[],checklist:[]}];
    state.notes=[{id:'n',title:'Cells',projectId:'bio',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'a',type:'text',text:'The mitochondria produce most of the cell’s ATP.',html:'<p>The mitochondria produce most of the cell’s ATP.</p>'}]}];
    state.focusSessions=[];active='n';render();setMode('write');
  })()`);
  await wait(250);

  // The Class and Garden buttons are there in a note
  assert.equal(await evaluate(`!document.querySelector('#class-mode-toggle').hidden&&!document.querySelector('#garden-open').hidden`),true);

  // ── Start a class ──
  await evaluate(`document.querySelector('#class-mode-toggle').click()`);await wait(200);
  assert.equal(await evaluate(`document.body.classList.contains('class-mode')`),true);
  assert.equal(await count('#class-hud'),1);
  assert.equal(await evaluate(`document.body.classList.contains('sidebar-collapsed')`),true,'the sidebar steps back');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.toolbar-actions')).display`),'none','the toolbar clutter is hidden');
  assert.equal(await evaluate(`document.querySelector('#class-mode-toggle').hidden`),true);
  // put the caret at the end of the sentence, so "where you were" has something to show
  await evaluate(`(()=>{const p=document.querySelector('#editor .rich-text');p.focus();const r=document.createRange();r.selectNodeContents(p);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);await wait(150);

  // Drive the clock from the test: seconds since the class began
  await evaluate(`window.T0=marginClass.session().startedAt+0;window.at=s=>window.T0+s*1000;window.run=(from,to,present)=>{marginClass.setProbe(()=>present);for(let s=from+1;s<=to;s++)marginClass.tick(window.at(s))}`);
  await evaluate(`run(0,120,true)`);
  assert.equal(await text('#class-hud .hud-time strong'),'2:00');
  assert.equal(await evaluate(`document.querySelectorAll('#class-hud .hud-tree svg').length`),1,'a tree is growing in the strip');
  await shot('hud');

  // ── Leave, come back: a cue with where you were ──
  await evaluate(`run(120,160,false)`);
  assert.equal(await count('#class-cue'),0,'no cue while away');
  await evaluate(`run(160,162,true)`);await wait(100);
  assert.equal(await count('#class-cue'),1);
  assert.match(await text('#class-cue'),/Welcome back/);assert.match(await text('#class-cue'),/Away 0:40/);
  assert.match(await text('#class-cue q'),/mitochondria produce most of the cell’s ATP\./,'it quotes the last words');
  assert.equal(await evaluate(`document.querySelector('#editor .block').classList.contains('resume-flash')`),true,'the cell you were in pulses');
  await shot('welcome-back');
  assert.match(await text('#class-hud .hud-away'),/Away 1×/);
  // that was a lookup
  await evaluate(`[...document.querySelectorAll('#class-cue button')].find(b=>/lookup/i.test(b.textContent)).click()`);
  assert.equal(await count('#class-cue'),0);
  assert.deepEqual(await evaluate(`(()=>{const s=marginClass.session();return [s.awayMs,s.lookupMs,s.awayCount,s.lookups]})()`),[0,40000,0,1]);
  assert.equal(await text('#class-hud .hud-away'),'1 lookup');

  // ── Say so first: a lookup window ──
  await evaluate(`document.querySelector('#class-hud .hud-lookup').click()`);
  assert.match(await text('#class-hud .hud-lookup'),/Lookup window/);
  await evaluate(`run(162,222,false);run(222,240,true)`);await wait(100);
  assert.equal(await evaluate(`marginClass.session().awayMs`),0,'a declared lookup is neutral');
  assert.equal(await evaluate(`marginClass.session().lookups`),2);
  assert.equal(await evaluate(`(()=>{const q=[...document.querySelectorAll('#class-cue button')].map(b=>b.textContent);return q.some(t=>/lookup/i.test(t))})()`),false,'nothing to reclassify');
  await evaluate(`document.querySelector('#class-cue button.primary').click()`);

  // ── Park a thought: ⌘⇧P, type, and the caret is exactly where it was ──
  await evaluate(`(()=>{const p=document.querySelector('#editor .rich-text');p.focus();const r=document.createRange();r.selectNodeContents(p);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'P',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}))`);await wait(80);
  assert.equal(await count('#class-park'),1);
  assert.equal(await evaluate(`document.activeElement===document.querySelector('#class-park input')`),true,'the field is ready to type in');
  await evaluate(`(()=>{const i=document.querySelector('#class-park input');i.value='look up the ATP synthase diagram';document.querySelector('#class-park').requestSubmit()})()`);await wait(120);
  assert.equal(await count('#class-park'),0);
  assert.equal(await evaluate(`marginClass.session().parked.length`),1);
  assert.equal(await evaluate(`document.activeElement.classList.contains('rich-text')`),true,'back in the note');
  assert.match(await text('#class-hud .hud-park'),/\(1\)/);
  // a thought can also be abandoned with Escape
  await evaluate(`document.querySelector('#class-hud .hud-park').click()`);await wait(60);
  await evaluate(`document.querySelector('#class-park input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await wait(60);
  assert.equal(await count('#class-park'),0);assert.equal(await evaluate(`marginClass.session().parked.length`),1);

  // A real stretch away, left unexplained, counts as away and shrinks the tree's foliage ratio
  await evaluate(`run(240,300,false);run(300,310,true)`);await wait(100);
  assert.equal(await evaluate(`marginClass.session().awayMs`),60000);assert.equal(await evaluate(`marginClass.session().awayCount`),1);
  await evaluate(`document.querySelector('#class-cue button.primary')?.click()`);

  // ── End the class ──
  await evaluate(`document.querySelector('#class-hud .hud-end').click()`);await wait(200);
  assert.equal(await evaluate(`document.body.classList.contains('class-mode')`),false);
  assert.equal(await count('#class-hud'),0);
  assert.equal(await evaluate(`document.body.classList.contains('sidebar-collapsed')`),false,'the sidebar comes back');
  assert.equal(await evaluate(`document.querySelector('.class-summary')?.open`),true);
  assert.match(await text('.class-summary h2'),/focused/);assert.match(await text('.class-summary .summary-top p'),/%/);
  assert.match(await text('.class-summary'),/look up the ATP synthase diagram/);
  assert.equal(await evaluate(`document.querySelector('.class-summary .summary-add input').checked`),true);
  assert.equal(await count('.class-summary .summary-tree svg'),1);
  await shot('summary');
  const record=await evaluate(`state.focusSessions.at(-1)`);
  assert.equal(record.subjectId,'bio');assert.equal(record.awayCount,1);assert.equal(record.lookups,2);assert(record.lookupMs>=100000);assert.equal(record.awayMs,60000);
  assert(record.focusedMs>=120000+18000);assert(record.ratio>.7&&record.ratio<.9,String(record.ratio));
  // Done adds the parked thought to the note
  await evaluate(`[...document.querySelectorAll('.class-summary button')].find(b=>b.textContent==='Done').click()`);await wait(250);
  assert.equal(await evaluate(`document.querySelector('.class-summary')`),null);
  assert.equal(await evaluate(`state.notes[0].blocks.at(-1).text`),'## Parked in class\n\n- look up the ATP synthase diagram');
  assert.equal(await evaluate(`!!document.querySelector('#editor').textContent.match(/ATP synthase diagram/)`),true);

  // ── The garden ──
  await evaluate(`document.querySelector('#garden-open').click()`);await wait(150);
  assert.equal(await evaluate(`document.querySelector('.garden-dialog').open`),true);
  assert.equal(await count('.garden-tile svg'),1);
  assert.match(await text('.garden-week'),/This week: .* focused across 1 class\./);
  assert.match(await text('.garden-dialog'),/Biology/);
  await shot('garden');
  await evaluate(`document.querySelector('.garden-dialog').close()`);

  // ── The desktop app tells the page whether Notival is active ──
  await evaluate(`state.focusSessions=[];document.querySelector('#class-mode-toggle').click()`);await wait(150);
  await evaluate(`window.T1=marginClass.session().startedAt;window.at1=s=>window.T1+s*1000;marginClass.setProbe(null);window.notivalAppActive(true)`);
  await evaluate(`for(let s=1;s<=30;s++)marginClass.tick(at1(s))`);
  assert.equal(await evaluate(`marginClass.session().focusedMs`),30000);
  await evaluate(`window.notivalAppActive(false);for(let s=31;s<=70;s++)marginClass.tick(at1(s))`);
  assert.equal(await evaluate(`marginClass.session().awayMs`),40000,'the app being inactive is time away even if the page still has focus');
  await evaluate(`window.notivalAppActive(true);for(let s=71;s<=75;s++)marginClass.tick(at1(s))`);
  assert.equal(await evaluate(`marginClass.session().focusedMs>=34000`),true);
  await evaluate(`document.querySelector('#class-cue button.primary')?.click();marginClass.end()`);await wait(150);
  await evaluate(`document.querySelector('.class-summary')?.close()`);

  // ── A class interrupted by quitting still counts ──
  await evaluate(`(()=>{const s=FocusModel.start({id:'old',subjectId:'bio',noteId:'n',now:Date.now()-3600000});FocusModel.advance(s,s.startedAt+5000,true);s.focusedMs=7*60000;state.focusSessions=[];state.focusLive=s;marginClass.tick()})()`);
  assert.equal(await evaluate(`state.focusSessions.length`),1,'recovered into the garden');assert.equal(await evaluate(`'focusLive' in state`),false);

  console.log('PASS: class mode — quiet page, growing tree, welcome-back cue, lookups that cost nothing, parked thoughts, summary, garden, app-active signal, recovery.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
