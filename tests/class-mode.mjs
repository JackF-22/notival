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
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
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

  // ── A calm header: one Focus menu, no Garden, small icons for Share and Delete ──
  assert.equal(await evaluate(`document.querySelector('#garden-open')`),null,'no Garden button');
  assert.equal(await evaluate(`['#focus-writing-toggle','#class-mode-toggle'].map(s=>getComputedStyle(document.querySelector(s)).display).join()`),'none,none','the old Focus and Class buttons step aside');
  assert.equal(await evaluate(`document.querySelector('#focus-menu').textContent`),'Focus ▾');
  const header=await evaluate(`(()=>{const q=s=>document.querySelector(s).getBoundingClientRect();const visible=[...document.querySelectorAll('main>header button')].filter(b=>b.offsetParent);return {count:visible.length,furthest:Math.max(...visible.map(b=>b.getBoundingClientRect().right)),deleteWidth:Math.round(q('#delete').width),savedHeight:Math.round(q('#saved').height),home:getComputedStyle(document.querySelector('.student-home')).display,deleteName:document.querySelector('#delete').textContent.trim()}})()`);
  assert(header.count<=9,'a short list of controls: '+header.count);assert(header.furthest<=1200,'nothing runs off the edge');
  assert(header.deleteWidth<=40,'Delete is an icon: '+header.deleteWidth);assert(header.savedHeight<=20,'the saved note is one line');
  assert.equal(header.home,'none','Home lives in the sidebar while it is open');assert.equal(header.deleteName,'Delete note','icons keep their names for screen readers');
  await shot('header');
  // the Focus menu offers the quiet page or a class
  await evaluate(`document.querySelector('#focus-menu').click()`);await wait(80);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.focus-popover .focus-item b')].map(b=>b.textContent)`),['Quiet page','Start a class…','Class schedule…']);
  assert.equal(await evaluate(`document.querySelector('#focus-menu').getAttribute('aria-expanded')`),'true');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);await wait(60);
  assert.equal(await count('.focus-popover'),0,'Escape closes it');
  await evaluate(`document.querySelector('#focus-menu').click();[...document.querySelectorAll('.focus-item')].find(b=>/Quiet page/.test(b.textContent)).click()`);await wait(100);
  assert.equal(await evaluate(`document.body.classList.contains('focus-writing')`),true);
  assert.equal(await evaluate(`document.querySelector('#focus-menu').textContent`),'Exit focus','the button turns the quiet page back off');
  await evaluate(`document.querySelector('#focus-menu').click()`);await wait(100);
  assert.equal(await evaluate(`document.body.classList.contains('focus-writing')`),false);

  // ── "Start a class…" opens a start dialog: how long is it? ──
  await evaluate(`document.querySelector('#focus-menu').click();[...document.querySelectorAll('.focus-item')].find(b=>/Start a class/.test(b.textContent)).click()`);await wait(150);
  assert.equal(await evaluate(`document.querySelector('.class-start')?.open`),true);
  assert.equal(await evaluate(`document.body.classList.contains('class-mode')`),false,'nothing starts until you say');
  assert.match(await text('.class-start-sub'),/Biology · Cells/);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.length-chip')].map(c=>c.textContent)`),['30 min','45 min','50 min','60 min','75 min','90 min','No timer']);
  assert.equal(await evaluate(`document.querySelector('.length-chip.on')?.textContent`),'50 min','a sensible default');
  await evaluate(`[...document.querySelectorAll('.length-chip')].find(c=>c.textContent==='45 min').click()`);
  assert.equal(await evaluate(`document.querySelector('.length-chip.on').textContent`),'45 min');
  // a length of your own
  await evaluate(`(()=>{const i=document.querySelector('.length-custom');i.value='40';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  assert.equal(await evaluate(`document.querySelector('.length-chip.on')`),null,'a custom length replaces the chips');
  assert.equal(await evaluate(`document.querySelector('.length-custom').classList.contains('on')`),true);
  assert.equal(await evaluate(`document.querySelector('.class-start-fs input').checked`),true,'full screen is on by default');
  await shot('start');
  await evaluate(`[...document.querySelectorAll('.class-start button')].find(b=>b.textContent==='Start class').click()`);await wait(250);

  // ── The class: full screen, a quiet page, a countdown ──
  assert.equal(await evaluate(`document.body.classList.contains('class-mode')`),true);
  assert.deepEqual(await evaluate(`marginClass.fullscreenLog`),[true],'it asks for the whole screen');
  assert.equal(await evaluate(`marginClass.session().plannedMs`),40*60000);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('notival.class.minutes'))`),40,'it remembers the length for next time');
  assert.equal(await count('#class-hud'),1);
  assert.equal(await evaluate(`document.body.classList.contains('sidebar-collapsed')`),true);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('main>header')).display`),'none','no header, no Delete note');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.toolbar-actions')).display`),'none');
  await evaluate(`(()=>{const p=document.querySelector('#editor .rich-text');p.focus();const r=document.createRange();r.selectNodeContents(p);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);await wait(150);
  await evaluate(`window.T0=marginClass.session().startedAt;window.at=s=>window.T0+s*1000;window.run=(from,to,present)=>{marginClass.setProbe(()=>present);for(let s=from+1;s<=to;s++)marginClass.tick(window.at(s))}`);
  await evaluate(`run(0,120,true)`);
  assert.equal(await text('#class-hud .hud-left'),'38:00','a countdown from the length you chose');
  assert.equal(await text('#class-hud .hud-label'),'left of 40 min');
  assert.equal(await evaluate(`document.querySelector('#class-hud .hud-bar i').style.width`),'5%');
  const stat=key=>text(`#class-hud [data-stat=${key}] b`);
  assert.equal(await stat('here'),'100%');assert.equal(await stat('away'),'0');assert.equal(await stat('lookups'),'0');assert.equal(await stat('words'),'+0');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#class-hud .hud-stat small')].map(s=>s.textContent)`),['here','away','looked up','written']);
  await shot('hud');

  // words written show up as you write
  await evaluate(`(()=>{const b=current().blocks[0];b.text+=' and its inner membrane';b.html='<p>'+b.text+'</p>'})()`);
  await evaluate(`run(120,121,true)`);
  assert.equal(await stat('words'),'+4');

  // ── Leave and come back ──
  await evaluate(`run(121,161,false)`);
  assert.equal(await count('#class-cue'),0,'no cue while away');
  await evaluate(`run(161,163,true)`);await wait(100);
  assert.equal(await count('#class-cue'),1);
  assert.match(await text('#class-cue'),/Welcome back/);assert.match(await text('#class-cue'),/Away 0:40/);
  assert.match(await text('#class-cue q'),/mitochondria produce most of the cell’s ATP\./,'it quotes the last words');
  assert.equal(await evaluate(`document.querySelector('#editor .block').classList.contains('resume-flash')`),true,'the cell you were in pulses');
  await shot('welcome-back');
  assert.equal(await stat('away'),'1× · 0:40');
  const here=await stat('here');assert(parseInt(here)<100&&parseInt(here)>=70,here);
  await evaluate(`[...document.querySelectorAll('#class-cue button')].find(b=>/lookup/i.test(b.textContent)).click()`);
  assert.equal(await count('#class-cue'),0);
  assert.deepEqual(await evaluate(`(()=>{const s=marginClass.session();return [s.awayMs,s.lookupMs,s.awayCount,s.lookups]})()`),[0,40000,0,1]);
  assert.equal(await stat('here'),'100%');assert.equal(await stat('lookups'),'1');assert.equal(await stat('away'),'0');

  // ── A lookup you announce first ──
  await evaluate(`document.querySelector('#class-hud .hud-lookup').click()`);
  assert.match(await text('#class-hud .hud-lookup'),/Lookup window/);
  await evaluate(`run(163,223,false);run(223,240,true)`);await wait(100);
  assert.equal(await evaluate(`marginClass.session().awayMs`),0,'a declared lookup is neutral');
  assert.equal(await evaluate(`marginClass.session().lookups`),2);
  await evaluate(`document.querySelector('#class-cue button.primary')?.click()`);

  // ── Park a thought ──
  await evaluate(`(()=>{const p=document.querySelector('#editor .rich-text');p.focus();const r=document.createRange();r.selectNodeContents(p);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'P',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}))`);await wait(80);
  assert.equal(await count('#class-park'),1);
  assert.equal(await evaluate(`document.activeElement===document.querySelector('#class-park input')`),true);
  await evaluate(`(()=>{const i=document.querySelector('#class-park input');i.value='look up the ATP synthase diagram';document.querySelector('#class-park').requestSubmit()})()`);await wait(120);
  assert.equal(await count('#class-park'),0);assert.equal(await evaluate(`marginClass.session().parked.length`),1);
  assert.equal(await evaluate(`document.activeElement.classList.contains('rich-text')`),true,'back in the note');
  assert.match(await text('#class-hud .hud-park'),/\(1\)/);
  await evaluate(`document.querySelector('#class-hud .hud-park').click()`);await wait(60);
  await evaluate(`document.querySelector('#class-park input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await wait(60);
  assert.equal(await count('#class-park'),0);

  // ── Full screen can be toggled from the strip, and follows what the window really does ──
  // (in a real browser the page genuinely goes full screen; either way the button says what it will do)
  const really=await evaluate(`!!document.fullscreenElement`);
  assert.equal(await text('#class-hud .hud-fullscreen'),really?'Exit full screen':'Full screen');
  await evaluate(`window.notivalFullscreen(false)`);
  assert.equal(await text('#class-hud .hud-fullscreen'),'Full screen');
  await evaluate(`window.notivalFullscreen(true)`);
  assert.equal(await text('#class-hud .hud-fullscreen'),'Exit full screen');
  await evaluate(`document.querySelector('#class-hud .hud-fullscreen').click()`);
  assert.deepEqual(await evaluate(`marginClass.fullscreenLog`),[true,false],'a click on "Exit full screen" asks to leave it');
  await evaluate(`window.notivalFullscreen(false)`);

  // ── A real stretch away, unexplained ──
  await evaluate(`run(240,300,false);run(300,310,true)`);await wait(100);
  assert.equal(await evaluate(`marginClass.session().awayMs`),60000);assert.equal(await evaluate(`marginClass.session().awayCount`),1);
  await evaluate(`document.querySelector('#class-cue button.primary')?.click()`);

  // ── The countdown gets low, then time is up ──
  await evaluate(`run(310,2200,true)`);                       // 36:40 in: 3:20 left
  assert.equal(await evaluate(`document.querySelector('#class-hud .hud-clock').classList.contains('is-low')`),true,'it warns in the last five minutes');
  assert.equal(await count('#class-timeup'),0);
  await evaluate(`run(2200,2400,true)`);await wait(100);
  assert.equal(await count('#class-timeup'),1,'time is up');
  assert.match(await text('#class-timeup'),/Class time is up/);assert.match(await text('#class-timeup'),/40 minutes/);
  await shot('time-up');
  // keep going: the timer counts up past the plan
  await evaluate(`[...document.querySelectorAll('#class-timeup button')].find(b=>b.textContent==='Keep going').click()`);
  await evaluate(`run(2400,2460,true)`);
  assert.equal(await text('#class-hud .hud-left'),'+1:00');assert.match(await text('#class-hud .hud-label'),/past the planned 40 min/);
  assert.equal(await evaluate(`document.querySelector('#class-hud .hud-clock').classList.contains('is-over')`),true);
  assert.equal(await count('#class-timeup'),0,'it does not nag');
  // ten more minutes pushes the end out and the prompt can come again
  await evaluate(`marginClass.showTimeUp();[...document.querySelectorAll('#class-timeup button')].find(b=>b.textContent==='10 more minutes').click()`);
  assert.equal(await evaluate(`marginClass.session().plannedMs`),50*60000);
  assert.equal(await text('#class-hud .hud-left'),'9:00');
  await evaluate(`run(2460,3000,true)`);await wait(100);
  assert.equal(await count('#class-timeup'),1,'time is up again');

  // ── End ──
  await evaluate(`[...document.querySelectorAll('#class-timeup button')].find(b=>b.textContent==='End class').click()`);await wait(250);
  assert.equal(await evaluate(`document.body.classList.contains('class-mode')`),false);
  assert.equal(await count('#class-hud'),0);
  assert.equal(await evaluate(`document.body.classList.contains('sidebar-collapsed')`),false,'the sidebar comes back');
  assert.deepEqual(await evaluate(`marginClass.fullscreenLog`),[true,false,false],'and the window leaves full screen');
  assert.equal(await evaluate(`document.querySelector('.class-summary')?.open`),true);
  assert.equal(await text('.class-summary h2'),'Class finished');
  const summary=await text('.class-summary');
  assert.match(summary,/of 50 min/);assert.match(summary,/\+4 words/);assert.match(summary,/look up the ATP synthase diagram/);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.class-summary .wrap-section h3')].map(h=>h.textContent)`).then(list=>list.slice(0,3)),['Sum it up','Still unclear','Parked during class']);
  assert.equal(await evaluate(`document.activeElement===document.querySelector('.class-summary textarea')`),true,'ready to type the summary');
  await shot('summary');
  const record=await evaluate(`state.focusSessions.at(-1)`);
  assert.equal(record.subjectId,'bio');assert.equal(record.awayCount,1);assert.equal(record.lookups,2);assert.equal(record.awayMs,60000);
  assert.equal(record.plannedMs,50*60000);assert.equal(record.wordsAdded,4);assert(record.ratio>.95,String(record.ratio));assert(record.focusedMs>=2800000);
  await evaluate(`(()=>{const [sum,open]=document.querySelectorAll('.class-summary textarea');sum.value='Mitochondria make ATP.';open.value='why two membranes?'})()`);
  await evaluate(`[...document.querySelectorAll('.class-summary button')].find(b=>b.textContent==='Save to note').click()`);await wait(300);
  assert.match(await evaluate(`state.notes[0].blocks.at(-1).text`),/^## After class · .+\n\n\*\*Summary:\*\* Mitochondria make ATP\.\n\n\*\*Still unclear\*\*\n\n- why two membranes\?\n\n\*\*To look into\*\*\n\n- look up the ATP synthase diagram$/);
  assert.equal(await evaluate(`document.activeElement?.closest?.('.block')===[...document.querySelectorAll('#editor .block')].at(-1)`),true,'the caret is in the new section, to keep writing');

  // ── No timer ──
  await evaluate(`document.querySelector('#focus-menu').click();[...document.querySelectorAll('.focus-item')].find(b=>/Start a class/.test(b.textContent)).click()`);await wait(100);
  assert.equal(await evaluate(`document.querySelector('.length-custom').value`),'40','the last length you used is waiting for you');
  await evaluate(`[...document.querySelectorAll('.length-chip')].find(c=>c.textContent==='No timer').click()`);
  await evaluate(`document.querySelector('.class-start-fs input').click()`);                         // no full screen this time
  await evaluate(`[...document.querySelectorAll('.class-start button')].find(b=>b.textContent==='Start class').click()`);await wait(200);
  assert.deepEqual(await evaluate(`marginClass.fullscreenLog`),[true,false,false],'full screen off means no request');
  await evaluate(`window.T1=marginClass.session().startedAt;window.at1=s=>window.T1+s*1000;marginClass.setProbe(null);window.notivalAppActive(true);for(let s=1;s<=30;s++)marginClass.tick(at1(s))`);
  assert.equal(await text('#class-hud .hud-left'),'0:30');assert.match(await text('#class-hud .hud-label'),/no timer/);
  assert.equal(await evaluate(`document.querySelector('#class-hud .hud-bar').hidden`),true);
  // the desktop app tells the page whether Notival is the active app
  assert.equal(await evaluate(`marginClass.session().focusedMs`),30000);
  await evaluate(`window.notivalAppActive(false);for(let s=31;s<=70;s++)marginClass.tick(at1(s))`);
  assert.equal(await evaluate(`marginClass.session().awayMs`),40000,'the app being inactive is time away even if the page still has focus');
  await evaluate(`window.notivalAppActive(true);for(let s=71;s<=75;s++)marginClass.tick(at1(s))`);
  await evaluate(`document.querySelector('#class-cue button.primary')?.click();marginClass.end()`);await wait(150);
  await evaluate(`document.querySelector('.class-summary')?.close()`);

  // ── A class interrupted by quitting still counts ──
  await evaluate(`(()=>{const s=FocusModel.start({id:'old',subjectId:'bio',noteId:'n',now:Date.now()-3600000});FocusModel.advance(s,s.startedAt+5000,true);s.focusedMs=7*60000;state.focusSessions=[];state.focusLive=s;marginClass.tick()})()`);
  assert.equal(await evaluate(`state.focusSessions.length`),1,'recovered into the garden');assert.equal(await evaluate(`'focusLive' in state`),false);

  // ── Garden ──
  await evaluate(`marginClass.openGarden()`);await wait(150);   // no button for now; the sessions are still kept
  assert.equal(await evaluate(`document.querySelector('.garden-dialog').open`),true);
  assert.equal(await count('.garden-tile svg'),1);
  await shot('garden');

  console.log('PASS: class mode — start dialog with chosen length, full screen, countdown with live stats, time-up, welcome-back, lookups, parked thoughts, summary, garden.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
