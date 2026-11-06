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
  await call('Emulation.setDeviceMetricsOverride',{width:1300,height:850,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`state.projects=[];state.notes=['Alpha','Beta','Gamma'].map((t,i)=>({id:'n'+i,projectId:null,title:t,updated:Date.now()-i*1000,blocks:[{id:'b'+i,type:'text',text:'Text '+t}],nodes:[]}));state.trash=[];state.archive=[];active='n0';render()`);await wait(300);
  const view=()=>evaluate('document.body.dataset.view');
  // Deleting the open note goes Home, not to another note.
  assert.equal(await view(),'note');
  await evaluate(`document.querySelector('#delete').click()`);await wait(300);
  assert.equal(await view(),'home');
  assert.equal(await evaluate('current()?.id??null'),null);
  assert.equal(await evaluate('state.notes.length+","+state.trash.length'),'2,1');
  // Undo puts it back and reopens it, because that is where you were.
  await evaluate(`document.querySelector('#toast button').click()`);await wait(300);
  assert.equal(await evaluate('state.notes.length+","+state.trash.length'),'3,0');
  assert.equal(await evaluate('current()?.id'),'n0');
  assert.equal(await view(),'note');
  // Archiving the open note also goes Home.
  await evaluate(`archiveNote(current())`);await wait(300);
  assert.equal(await view(),'home');
  await evaluate(`document.querySelector('#toast button').click()`);await wait(300);
  // On Home, drag a note card: the trash can appears, and dropping on it moves the note to Trash.
  await evaluate(`window.marginHome(null)`);await wait(300);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#trash-drop')).opacity`),'0');
  await evaluate(`(()=>{window.__dt=new DataTransfer();const card=document.querySelector('.note-card[data-filing-id]');window.__dragged=card.dataset.filingId;card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:window.__dt}))})()`);await wait(300);
  assert.equal(await evaluate(`document.querySelector('#trash-drop').classList.contains('available')`),true);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#trash-drop')).opacity`),'1');
  assert.equal(await evaluate(`(()=>{const r=document.querySelector('#trash-drop').getBoundingClientRect();return r.right>innerWidth-120&&r.bottom>innerHeight-160})()`),true);
  await evaluate(`document.querySelector('#trash-drop').dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:window.__dt}))`);
  assert.equal(await evaluate(`document.querySelector('#trash-drop').classList.contains('over')`),true);
  await evaluate(`document.querySelector('#trash-drop').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.__dt}))`);await wait(400);
  assert.equal(await evaluate('state.trash.map(n=>n.id).join()'),await evaluate('window.__dragged'));
  assert.equal(await evaluate('state.notes.length'),2);
  assert.equal(await evaluate(`document.querySelector('#trash-drop').classList.contains('available')`),false);
  assert.equal(await view(),'home');
  assert.match(await evaluate(`document.querySelector('#toast').textContent`),/Trash/);
  // Undo restores it.
  await evaluate(`document.querySelector('#toast button').click()`);await wait(300);
  assert.equal(await evaluate('state.notes.length+","+state.trash.length'),'3,0');
  // Dragging something that isn't a note never offers the trash.
  await evaluate(`(()=>{const dt=new DataTransfer();const fake=document.createElement('div');document.body.append(fake);window.marginMakeFilable(fake,{kind:'material',id:'m1'});fake.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}))})()`);await wait(200);
  assert.equal(await evaluate(`document.querySelector('#trash-drop').classList.contains('available')`),false);
  console.log('PASS: deleting or archiving the open note returns Home, and notes can be dragged onto a trash can at the bottom right.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
