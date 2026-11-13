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
  await call('Emulation.setDeviceMetricsOverride',{width:1300,height:800,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(100);
  await evaluate(`current().blocks[0].html='<p>Alpha</p><ul><li>One</li><li>Two</li><li>Three</li></ul>';render()`);await wait(250);
  const hover=async selector=>{const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+Math.min(30,r.width/2),y:r.top+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mouseMoved',...p},sessionId);await wait(120)};
  const choose=async name=>{await evaluate(`document.querySelector('#block-handle').click()`);await wait(60);await evaluate(`[...document.querySelectorAll('.block-menu button')].find(b=>b.textContent.endsWith(${JSON.stringify(name)})).click()`);await wait(120)};
  const outline=()=>evaluate(`[...document.querySelector('.rich-text').children].map(c=>c.tagName+':'+c.textContent).join(' / ')`);
  // Hovering a line shows a handle that names it.
  await hover('.rich-text p');
  assert.equal(await evaluate(`(()=>{const h=document.querySelector('#block-handle');return !h.hidden&&h.textContent})()`),'¶');
  assert.equal(await evaluate(`(()=>{const h=document.querySelector('#block-handle').getBoundingClientRect(),e=document.querySelector('.rich-text').getBoundingClientRect();return h.right<=e.left})()`),true);
  await evaluate(`document.querySelector('#block-handle').click()`);await wait(60);
  assert.equal(await evaluate(`document.querySelectorAll('.block-menu button[role=menuitemradio]').length`),9);
  assert.equal(await evaluate(`[...document.querySelectorAll('.block-menu button[role=menuitem]')].map(b=>b.textContent).join('|')`),'↔Link this line to…|“Side note|}Brace this line');
  await evaluate(`document.querySelector('.block-menu button.current').click()`);await wait(60);
  assert.equal(await outline(),'P:Alpha / UL:OneTwoThree');
  // Turn a paragraph into a heading; typing continues in it.
  await hover('.rich-text p');await choose('Heading 2');
  assert.equal(await outline(),'H2:Alpha / UL:OneTwoThree');
  await call('Input.insertText',{text:'!'},sessionId);
  assert.equal(await evaluate(`document.querySelector('.rich-text h2').textContent`),'Alpha!');
  assert.match(await evaluate('current().blocks[0].html'),/<h2>Alpha!<\/h2>/);
  // One bullet becomes a heading; the list around it splits.
  await hover('.rich-text li:nth-child(2)');
  assert.equal(await evaluate(`document.querySelector('#block-handle').textContent`),'•');
  await choose('Heading 1');
  assert.equal(await outline(),'H2:Alpha! / UL:One / H1:Two / UL:Three');
  // Changing a bullet to numbered switches the whole list.
  await hover('.rich-text ul li');await choose('Numbered list');
  assert.equal(await evaluate(`document.querySelector('.rich-text').children[1].tagName`),'OL');
  // Back to plain text, a quote, a checklist item, and a code block.
  await hover('.rich-text h1');await choose('Quote');
  assert.equal(await evaluate(`document.querySelector('.rich-text blockquote').textContent`),'Two');
  await hover('.rich-text blockquote');await choose('Checklist');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text .task-row').length`),1);
  await hover('.rich-text .task-row');await choose('Code block');
  assert.equal(await evaluate(`document.querySelector('.rich-text pre').textContent`),'Two');
  await hover('.rich-text pre');await choose('Text');
  assert.equal(await evaluate(`document.querySelector('.rich-text').children[2].tagName+':'+document.querySelector('.rich-text').children[2].textContent`),'P:Two');
  console.log('PASS: every line has a handle that names it and turns it into a heading, list, checklist, quote, code, or text.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
