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
  const wheel=(x,y,deltaX,deltaY,modifiers=0)=>call('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX,deltaY,modifiers},sessionId);
  await evaluate(`setMode('write');current().nodes=[];current().passageConnections=[];current().blocks=[{id:'b1',type:'text',text:'x',html:'<p>Alpha</p><p>Beta</p>'}];render()`);await wait(150);
  await evaluate(`document.querySelector('#connect-passages').click()`);await wait(80);
  const pts=await evaluate(`JSON.stringify([...document.querySelectorAll('.rich-text p')].map(e=>{const r=e.getBoundingClientRect();return {x:r.left+10,y:r.top+r.height/2}}))`).then(JSON.parse);
  await mouse('mousePressed',pts[0],1);await mouse('mouseMoved',pts[1],1);await mouse('mouseReleased',pts[1],0);await wait(120);
  await evaluate(`(()=>{const r=document.querySelector('#passage-connection-dialog .rich-text');r.innerHTML='<p>leads to</p>';r.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#passage-connection-dialog form').requestSubmit()})()`);await wait(250);
  const canvas=await evaluate(`(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()`);
  const scale=()=>evaluate('window.marginMapView.scale()'),world=()=>evaluate('document.querySelector("#map-world").style.transform');
  assert.ok(await evaluate('document.querySelector(".edge-chip").offsetWidth>40'),'label chip keeps a readable width');
  // Pinch (ctrl+wheel) zooms; two-finger scroll pans.
  const z0=await scale();await wheel(canvas.x+canvas.w/2,canvas.y+canvas.h/2,0,-120,2);await wait(50);
  assert.ok(await scale()>z0,'pinch out zooms in');
  const t0=await world();await wheel(canvas.x+300,canvas.y+200,-80,-40);await wait(50);
  assert.notEqual(await world(),t0);
  // Dragging empty background pans the view.
  const t1=await world();await mouse('mousePressed',{x:canvas.x+canvas.w-60,y:canvas.y+canvas.h-80},1);await mouse('mouseMoved',{x:canvas.x+canvas.w-120,y:canvas.y+canvas.h-130},1);await mouse('mouseReleased',{x:canvas.x+canvas.w-120,y:canvas.y+canvas.h-130},0);
  assert.notEqual(await world(),t1);
  await evaluate('document.querySelector(".map-zoom button[aria-label=\\"Fit everything in view\\"]").click()');
  // Nodes still move correctly while zoomed.
  const before=await evaluate('JSON.stringify(current().nodes.map(n=>[n.x,n.y]))');
  const nodeBox=await evaluate(`(()=>{const r=document.querySelector('.map-node').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await mouse('mousePressed',nodeBox,1);await mouse('mouseMoved',{x:nodeBox.x+30,y:nodeBox.y+90},1);await mouse('mouseReleased',{x:nodeBox.x+30,y:nodeBox.y+90},0);await wait(100);
  assert.notEqual(await evaluate('JSON.stringify(current().nodes.map(n=>[n.x,n.y]))'),before);
  // Dragging a connection label moves it; the offset persists.
  const chip=await evaluate(`(()=>{const r=document.querySelector('.edge-chip').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await mouse('mousePressed',chip,1);await mouse('mouseMoved',{x:chip.x+40,y:chip.y+50},1);await mouse('mouseReleased',{x:chip.x+40,y:chip.y+50},0);await wait(100);
  assert.ok(await evaluate('!!current().passageConnections[0].labelOffset'));
  assert.equal(await evaluate('document.querySelector("#passage-connection-dialog").open'),false);
  // Right-click the label: menu offers delete.
  await evaluate(`document.querySelector('.edge-chip').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:300,clientY:300}))`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.table-menu button')].map(b=>b.textContent)`),['Edit connection…','Reset line shape','Delete connection']);
  await evaluate(`[...document.querySelectorAll('.table-menu button')].find(b=>b.textContent==='Delete connection').click()`);await wait(100);
  assert.equal(await evaluate('current().passageConnections.length'),0);
  assert.equal(await evaluate('document.querySelectorAll(".edge-chip").length'),0);
  // Swiping right (outside the map) returns to the note; swiping left opens the map.
  await wheel(canvas.x+canvas.w/2,60,-140,0);await wait(150);
  assert.equal(await evaluate('mode'),'write');
  await wait(800);await wheel(500,400,150,0);await wait(150);
  assert.equal(await evaluate('mode'),'map');
  // ⌘-click selects several items; Delete removes them together, and ⌘Z brings them back.
  await evaluate(`setMode('write');current().nodes=[];current().passageConnections=[];current().blocks=[{id:'b2',type:'text',text:'x',html:'<p>One</p><p>Two</p><p>Three</p><p>Four</p>'}];render()`);await wait(150);
  for(const [i,j] of [[0,1],[1,2],[2,3]]){
    await evaluate(`setMode('write');render()`);await wait(120);await evaluate(`document.querySelector('#connect-passages').click()`);await wait(80);
    const p=await evaluate(`JSON.stringify([...document.querySelectorAll('.rich-text p')].map(e=>{const r=e.getBoundingClientRect();return {x:r.left+10,y:r.top+r.height/2}}))`).then(JSON.parse);
    await mouse('mousePressed',p[i],1);await mouse('mouseMoved',p[j],1);await mouse('mouseReleased',p[j],0);await wait(120);
    await evaluate(`document.querySelector('#passage-connection-dialog form').requestSubmit()`);await wait(200);
  }
  assert.equal(await evaluate('current().nodes.length+","+current().passageConnections.length'),'5,3');
  const metaClick=async selector=>{const pt=await evaluate(`(()=>{const r=document.querySelectorAll(${JSON.stringify(selector)})[0].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',...pt,button:'left',buttons:1,clickCount:1,modifiers:4},sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',...pt,button:'left',buttons:0,clickCount:1,modifiers:4},sessionId)};
  await metaClick('#nodes .map-node:nth-child(2)');
  await evaluate(`document.querySelectorAll('#nodes .map-node')[4].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,metaKey:true}))`);
  await metaClick('.edge-chip');
  assert.equal(await evaluate('document.querySelectorAll(".marked").length>=3'),true);
  assert.match(await evaluate('document.querySelector(".map-selection").textContent'),/3 items selected/);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Delete',code:'Delete',windowsVirtualKeyCode:46},sessionId);await wait(100);
  assert.equal(await evaluate('current().nodes.length+","+current().passageConnections.length'),'3,1');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:4},sessionId);await wait(100);
  assert.equal(await evaluate('current().nodes.length+","+current().passageConnections.length'),'5,3');
  console.log('PASS: pinch zoom, pan, zoomed node drag, movable connection labels, right-click delete, and swipe between note and map.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
