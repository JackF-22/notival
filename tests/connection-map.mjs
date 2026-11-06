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
  // List items used to throw while the map drew (an <li>'s .value is a number), leaving the map blank.
  await connect('<ul><li>One item</li><li>Two item</li></ul>','li:nth-child(1)','li:nth-child(2)','<p>causes</p>');
  assert.equal(await evaluate('mode'),'map');
  assert.equal(await evaluate('document.querySelectorAll(".map-node").length'),3);
  assert.equal(await evaluate('document.querySelectorAll(".passage-edge").length'),1);
  // Relationships keep rich text and appear in full beneath the map.
  await connect('<p>Alpha</p><p>Beta</p>','p:nth-child(1)','p:nth-child(2)','<p><strong>Because</strong> of this:</p><ul><li>first reason</li><li>second reason</li></ul>');
  assert.equal(await evaluate('current().passageConnections[0].label'),'Because of this: first reason second reason');
  assert.match(await evaluate('current().passageConnections[0].html'),/<strong>Because<\/strong>.*<ul><li>first reason<\/li>/);
  assert.equal(await evaluate('document.querySelectorAll("#connection-list .connection-card-body li").length'),2);
  // Clicking a connection reopens it for editing, and it can be deleted.
  await evaluate('document.querySelector("#connection-list .connection-card").click()');await wait(100);
  assert.equal(await evaluate('document.querySelector("#passage-connection-dialog").open&&document.querySelectorAll("#passage-connection-dialog .rich-text li").length'),2);
  await evaluate('document.querySelector("#passage-connection-dialog .connection-delete").click()');await wait(100);
  assert.equal(await evaluate('current().passageConnections.length'),0);
  // Boxes never sit on top of each other, even when many connections are made.
  await connect('<p>One</p><p>Two</p><p>Three</p><p>Four</p>','p:nth-child(1)','p:nth-child(2)','<p>a</p>');
  for(const [i,j] of [[2,3],[0,2],[1,3]]){
    await evaluate(`setMode('write');render()`);await wait(120);await evaluate(`document.querySelector('#connect-passages').click()`);await wait(80);
    const pts=await evaluate(`JSON.stringify([...document.querySelectorAll('.rich-text p')].map(e=>{const r=e.getBoundingClientRect();return {x:r.left+10,y:r.top+r.height/2}}))`).then(JSON.parse);
    await mouse('mousePressed',pts[i],1);await mouse('mouseMoved',pts[j],1);await mouse('mouseReleased',pts[j],0);await wait(120);
    await evaluate(`document.querySelector('#passage-connection-dialog form').requestSubmit()`);await wait(200);
  }
  assert.equal(await evaluate(`(()=>{const r=[...document.querySelectorAll('.map-node')].map(e=>e.getBoundingClientRect());for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++)if(r[i].left<r[j].right&&r[j].left<r[i].right&&r[i].top<r[j].bottom&&r[j].top<r[i].bottom)return false;return r.length===5})()`),true);
  console.log('PASS: list-item connections draw the map, rich relationships persist, display in full, reopen for editing, and delete.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
