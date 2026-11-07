import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-updates-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),20000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.UPDATE_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof notivalUpdateAvailable!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const text=sel=>evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent||''`);
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  // the desktop app is pretended: messages it would receive are recorded
  await evaluate(`window.sent=[];window.webkit={messageHandlers:{margin:{postMessage:m=>sent.push(m)}}}`);

  // The app found a newer release: a card offers it, with what's new
  await evaluate(`notivalUpdateAvailable({version:'1.1.0',current:'1.0.0',notes:'## What changed\\n- Faster Recall\\n- <b>Class</b> schedule fixes\\n\\n'})`);
  assert.match(await text('#update-card strong'),/Notival 1\.1\.0 is ready/);
  assert.match(await text('#update-card small'),/You have 1\.0\.0\. Your notes stay exactly as they are/);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#update-card .update-notes li')].map(l=>l.textContent)`),['What changed','Faster Recall','<b>Class</b> schedule fixes'],'notes shown as text, never as markup');
  if(shots){const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/update-card.png',Buffer.from(data,'base64'))}
  // Later puts it away
  await evaluate(`[...document.querySelectorAll('#update-card button')].find(b=>b.textContent==='Later').click()`);
  assert.equal(await evaluate(`!!document.querySelector('#update-card')`),false);
  // Update and restart asks the app to install, and shows progress
  await evaluate(`notivalUpdateAvailable({version:'1.1.0',current:'1.0.0',notes:''})`);
  assert.equal(await evaluate(`!!document.querySelector('#update-card .update-notes')`),false,'no empty What is new section');
  await evaluate(`[...document.querySelectorAll('#update-card button')].find(b=>/Update and restart/.test(b.textContent)).click()`);
  assert.deepEqual(await evaluate(`sent.map(m=>m.type)`),['installUpdate']);
  assert.equal(await evaluate(`document.querySelector('#update-card .primary').disabled`),true);
  await evaluate(`notivalUpdateProgress('Downloading Notival 1.1.0…')`);
  assert.equal(await text('#update-card .update-status'),'Downloading Notival 1.1.0…');
  // If it fails, the message says so and the download page is one click away
  await evaluate(`notivalUpdateFailed('The download didn\\'t finish. Try again in a moment.')`);
  assert.match(await text('#update-card .update-status'),/didn't finish/);
  assert.equal(await evaluate(`document.querySelector('#update-card .update-status').classList.contains('is-error')`),true);
  await evaluate(`[...document.querySelectorAll('#update-card button')].find(b=>/download page/.test(b.textContent)).click()`);
  assert.deepEqual(await evaluate(`sent.map(m=>m.type)`),['installUpdate','openUpdatePage']);
  // It stays out of the way during a class
  await evaluate(`document.body.classList.add('class-mode')`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#update-card')).display`),'none');

  console.log('PASS: updates — the card offers a newer version with its notes (as text), installs or opens the download page, reports progress and failures, and hides during class.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
