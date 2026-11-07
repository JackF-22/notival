import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-overlays-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),20000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.OVERLAY_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof marginClass!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  const long=Array.from({length:60},(_,i)=>`<p>Line number ${i+1} of a long note.</p>`).join('');
  await evaluate(`(()=>{localStorage.clear();state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[],materials:[],packs:[],assessments:[],checklist:[]}];
    state.notes=[{id:'n',title:'Long',projectId:'bio',updated:Date.now(),blocks:[{id:'a',type:'text',text:'x',html:${JSON.stringify(long)}}]}];state.focusSessions=[];active='n';render();setMode('write')})()`);
  await wait(400);
  const scroll=top=>evaluate(`(()=>{document.querySelector('article').scrollTop=${top}})()`).then(()=>wait(200));
  // is the thing at the middle of `selector` really that thing (or inside it)?
  const onTop=selector=>evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return 'missing';const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    const top=document.elementsFromPoint(x,y)[0];return node.contains(top)?'ok':'covered by '+top.tagName.toLowerCase()+(top.id?'#'+top.id:'')+'.'+String(top.className).split(' ')[0]})()`);

  // ── The Focus menu stays whole however far down the note you are ──
  for(const top of [0,300,900,1500]){
    await scroll(top);
    await evaluate(`document.querySelector('#focus-menu').click()`);await wait(150);
    for(const [i,name] of ['Quiet page','Start a class…'].entries()){
      assert.equal(await onTop(`.focus-popover .focus-item:nth-child(${i+1})`),'ok',`${name} is reachable when scrolled ${top}px`);
    }
    if(top===900)await shot('focus-menu-scrolled');
    await evaluate(`document.querySelector('#focus-menu').click()`);await wait(80);
  }

  // ── The same holds in class mode: timer strip, park box, welcome-back card, time-up prompt ──
  await scroll(0);
  await evaluate(`marginClass.begin(30,{fullscreen:false})`);await wait(250);
  await evaluate(`window.T0=marginClass.session().startedAt;window.at=s=>window.T0+s*1000;window.run=(from,to,present)=>{marginClass.setProbe(()=>present);for(let s=from+1;s<=to;s++)marginClass.tick(window.at(s))}`);
  await evaluate(`run(0,20,true)`);
  await scroll(1200);
  for(const selector of ['#class-hud .hud-left','#class-hud .hud-end','#class-hud .hud-park'])assert.equal(await onTop(selector),'ok',selector+' is on top of the formatting bar');
  await evaluate(`document.querySelector('#class-hud .hud-park').click()`);await wait(120);
  assert.equal(await onTop('#class-park input'),'ok','the park box is reachable');
  await evaluate(`document.querySelector('#class-park input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await wait(60);
  await evaluate(`run(20,60,false);run(60,64,true)`);await wait(150);
  assert.equal(await onTop('#class-cue button.primary'),'ok','the welcome-back card is reachable');
  await shot('class-scrolled');
  await evaluate(`document.querySelector('#class-cue button.primary').click();marginClass.showTimeUp()`);await wait(120);
  assert.equal(await onTop('#class-timeup button.primary'),'ok','the time-up prompt is reachable');
  await evaluate(`document.querySelector('#class-timeup button.primary').click()`);await wait(250);
  await evaluate(`document.querySelector('.class-summary')?.close()`);

  // ── Drag labels and bars, and the picture frame, outrank the sticky formatting bar ──
  const zOf=cls=>evaluate(`(()=>{const n=document.createElement('div');n.className=${JSON.stringify(cls)};document.body.append(n);const z=Number(getComputedStyle(n).zIndex);n.remove();return z})()`);
  const bar=await evaluate(`Number(getComputedStyle(document.querySelector('#format-bar')).zIndex)`);
  for(const cls of ['line-ghost','line-drop','layout-ghost','layout-drop','image-resizer'])assert(await zOf(cls)>bar,`${cls} is above the format bar (${bar})`);

  console.log('PASS: the Focus menu, class-mode controls, drag labels and picture frames all sit above the sticky formatting bar, however far down the note you are.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
