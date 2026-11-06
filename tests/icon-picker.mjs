import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-editor-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result||{})}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),15000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.RECALL_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof FlagsModel!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const clickText=(sel,text)=>evaluate(`(()=>{const n=[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!n)throw Error('missing '+${JSON.stringify(text)});n.click();return true})()`);
  const select=(needle,length)=>evaluate(`(()=>{const rich=document.querySelector('#editor .rich-text');const walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT);let n,hit;while(n=walker.nextNode()){const i=n.data.indexOf(${JSON.stringify(needle)});if(i>=0){hit=[n,i];break}}if(!hit)throw Error('no text '+rich.textContent);const r=document.createRange();r.setStart(hit[0],hit[1]);r.setEnd(hit[0],hit[1]+${length});const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
  const hotkey=()=>evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyU',key:'u',shiftKey:true,metaKey:true,bubbles:true,cancelable:true}))`);
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`(()=>{window.__picked=[];const input=document.createElement('input');input.id='icon-value';input.value='📁';const dialog=document.createElement('dialog');dialog.id='icon-test';document.body.append(dialog);dialog.append(ProjectIcons.create('📁',v=>window.__picked.push(v),input),input);dialog.showModal()})()`);
  const grid=expr=>evaluate(`(()=>{const g=document.querySelector('#icon-test .icon-choices');return ${expr}})()`);
  const type=(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);

  assert.ok(await grid('g.querySelectorAll("button").length')>=500);                    // a real library, not a handful
  assert.equal(await grid('new Set([...g.querySelectorAll("button")].map(b=>b.textContent)).size===g.querySelectorAll("button").length'),true);   // no duplicates
  assert.equal(await grid('g.querySelector("button.selected")?.textContent'),'📁');

  await type('#icon-test .icon-search','chem');
  assert.deepEqual(JSON.parse(await grid('JSON.stringify([...g.querySelectorAll("button")].map(b=>b.textContent))')),['🧪','⚗️']);
  await type('#icon-test .icon-search','music note');
  assert.ok(await grid('g.querySelectorAll("button").length')>=2);                      // every word must match
  await type('#icon-test .icon-search','zzzz');
  assert.match(await grid('g.textContent'),/No icons match/);

  await type('#icon-test .icon-search','');
  await type('#icon-test select','Arts & creativity');
  const arts=await grid('g.querySelectorAll("button").length');assert.ok(arts>30&&arts<150);
  await type('#icon-test .icon-search','guitar');
  assert.equal(await grid('g.querySelectorAll("button").length'),1);
  await evaluate(`document.querySelector('#icon-test .icon-choices button').click()`);
  assert.equal(await evaluate(`document.querySelector('#icon-value').value`),'🎸');
  assert.deepEqual(JSON.parse(await evaluate(`JSON.stringify(window.__picked)`)),['🎸']);
  await shot('icons');
  console.log('PASS: the icon picker holds a large searchable library, filters by category, and keeps custom emoji.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
