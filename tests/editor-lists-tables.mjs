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
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),text=t=>call('Input.insertText',{text:t},sessionId);
  const key=async(k,modifiers=0,extra={})=>{const base={key:k,code:extra.code||k,modifiers,windowsVirtualKeyCode:{Enter:13,Tab:9,Backspace:8}[k]||k.toUpperCase().charCodeAt(0),...extra};await call('Input.dispatchKeyEvent',{type:'keyDown',...base},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',...base},sessionId)};
  const enter=()=>key('Enter',0,{text:'\r'}),html=()=>evaluate('document.querySelector(".rich-text").innerHTML');
  const fresh=async()=>{await evaluate('document.querySelector("#new").click();document.querySelector(".rich-text").focus()');await wait(60)};
  await fresh();
  // Tab nests lists: numbers become letters then numerals; bullets become open circles.
  await text('1.');await text(' ');await text('one');await enter();await key('Tab');await text('sub');await enter();await key('Tab');await text('deep');
  assert.equal(await evaluate('[...document.querySelectorAll(".rich-text ol")].map(l=>getComputedStyle(l).listStyleType).join()'),'decimal,lower-alpha,lower-roman');
  assert.equal(await evaluate('current().blocks[0].text'),'1. one\n    1. sub\n        1. deep');
  await key('Tab',8);assert.equal(await evaluate('document.querySelectorAll(".rich-text ol ol ol").length'),0);
  assert.match(await evaluate('RichEditor.fromMarkdown("- a\\n    - b\\n        - c\\n- d")'),/<ul><li>a<ul><li>b<ul><li>c<\/li><\/ul><\/li><\/ul><\/li><li>d<\/li><\/ul>/);
  await fresh();await text('-');await text(' ');await text('a');await enter();await key('Tab');await text('b');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".rich-text ul ul")).listStyleType'),'circle');
  // Toggling italics off at a bare caret, and symbols keep the caret's style.
  await fresh();await text('hello');await key('i',4,{code:'KeyI'});await key('i',4,{code:'KeyI'});await text('x');
  assert.equal(await html(),'<p>hellox</p>');
  await fresh();await text('a ');await key('b',4,{code:'KeyB'});await text('word');await key('b',4,{code:'KeyB'});await text('-');await text('>');await text(' ');
  assert.match(await html(),/<b>word<\/b>→/);
  // Tables: tab adds rows, columns resize, blank rows and the last row delete, headings stay outside.
  await fresh();await evaluate('RichEditor.command("table",{rows:2,columns:2})');await wait(40);
  await text('A');await key('Tab');await key('Tab');await key('Tab');await key('Tab');
  assert.equal(await evaluate('document.querySelectorAll(".rich-text tr").length'),3);
  await evaluate('(()=>{const p=document.querySelector(".rich-text").lastElementChild,r=document.createRange();r.selectNodeContents(p);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);RichEditor.command("heading","h1")})()');
  assert.equal(await evaluate('document.querySelector(".rich-text").lastElementChild.tagName+document.querySelector(".rich-text table").parentElement.className'),'H1rich-text');
  const edge=await evaluate('(()=>{const t=document.querySelector(".rich-text table");const c=t.rows[0].cells[0].getBoundingClientRect();return {x:c.right,y:c.top+8}})()');
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...edge,button:'left',buttons:1,clickCount:1},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:edge.x+50,y:edge.y,button:'left',buttons:1},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:edge.x+50,y:edge.y,button:'left',clickCount:1},sessionId);
  assert.match(await evaluate('current().blocks[0].html'),/<table data-widths="[\d.]+,[\d.]+">/);
  await fresh();await evaluate('RichEditor.command("table",{rows:1,columns:2})');await wait(40);
  await text('A');await key('Backspace');await key('Backspace');
  assert.equal(await evaluate('document.querySelectorAll(".rich-text table").length'),0);
  // A table lands at the caret, not at the top of the note.
  await fresh();await text('First');await enter();await text('Second');
  await evaluate('RichEditor.command("table")');await wait(80);
  await key('Enter');await wait(60);
  assert.equal(await evaluate('[...document.querySelector(".rich-text").children].map(n=>n.tagName+":"+n.textContent).join()'),'P:First,P:Second,TABLE:,P:');
  // Enter inside a cell: the caret moves to the new line, not back to the start of the cell.
  await fresh();await evaluate('RichEditor.command("table",{rows:1,columns:2})');await wait(40);
  await text('abc');await enter();await wait(150);
  assert.equal(await evaluate('(()=>{const cell=document.querySelector(".rich-text td").getBoundingClientRect(),caret=document.querySelector("#slant-caret").getBoundingClientRect();return caret.top>cell.top+cell.height/2-4})()'),true);
  await text('x');await wait(100);
  assert.equal(await evaluate('document.querySelector(".rich-text td").textContent'),'abcx');
  // After a slash command makes an empty heading, the caret sits inside it, not a line below.
  await fresh();await text('\\heading2');await wait(100);await enter();await wait(200);
  assert.equal(await evaluate('(()=>{const h=document.querySelector(".rich-text h2").getBoundingClientRect(),c=document.querySelector("#slant-caret").getBoundingClientRect();return c.top>=h.top-2&&c.bottom<=h.bottom+2})()'),true);
  // Typing in one cell never squeezes the others: columns stay even.
  await fresh();await evaluate('RichEditor.command("table",{rows:2,columns:3})');await wait(40);
  await text('A fairly long sentence typed into just the first cell of the table to test sizing, with Supercalifragilisticexpialidocious in it');
  assert.equal(await evaluate('(()=>{const w=[...document.querySelector(".rich-text table").rows[0].cells].map(c=>c.getBoundingClientRect().width);return Math.max(...w)-Math.min(...w)<2})()'),true);
  // Right-click menu on a cell.
  await fresh();await evaluate('RichEditor.command("table",{rows:2,columns:2})');await wait(40);
  const menuAction=async(label)=>{const pt=await evaluate('(()=>{const c=document.querySelector(".rich-text td").getBoundingClientRect();return {x:c.left+10,y:c.top+10}})()');await evaluate(`document.querySelector('.rich-text td').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:${pt.x},clientY:${pt.y}}))`);await evaluate(`[...document.querySelectorAll('.table-menu button')].find(b=>b.textContent==${JSON.stringify(label)}).click()`)};
  await menuAction('Insert row below');await menuAction('Insert column right');
  assert.equal(await evaluate('document.querySelectorAll(".rich-text tr").length+"x"+document.querySelectorAll(".rich-text tr:first-child td").length'),'3x3');
  await menuAction('Delete column');await menuAction('Delete row');
  assert.equal(await evaluate('document.querySelectorAll(".rich-text tr").length+"x"+document.querySelectorAll(".rich-text tr:first-child td").length'),'2x2');
  await menuAction('Delete table');
  assert.equal(await evaluate('document.querySelectorAll(".rich-text table").length'),0);
  // Backspace below a table keeps the caret in place; typing continues on that line, not the previous one.
  await fresh();await text('Above');await enter();await evaluate('RichEditor.command("table",{rows:1,columns:2})');await wait(40);
  await evaluate('(()=>{const e=document.querySelector(".rich-text"),p=e.lastElementChild,r=document.createRange();r.selectNodeContents(p);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()');
  await key('Backspace');await text('here');
  assert.equal(await evaluate('[...document.querySelector(".rich-text").children].map(n=>n.tagName+":"+n.textContent).join()'),'P:Above,P:here');
  await fresh();await text('Above');await enter();await evaluate('RichEditor.command("table",{rows:1,columns:2})');await wait(40);
  await text('A');await key('Backspace');await key('Backspace');await text('here');
  assert.equal(await evaluate('[...document.querySelector(".rich-text").children].map(n=>n.tagName+":"+n.textContent).join()'),'P:Above,P:here');
  // Picker: nothing preselected, Tab walks every cell.
  await evaluate('RichEditor.command("table")');await wait(80);
  assert.equal(await evaluate('document.querySelectorAll(".table-size-grid .is-selected").length'),0);
  await key('Tab');await key('Tab');
  assert.equal(await evaluate('document.activeElement.dataset.row+","+document.activeElement.dataset.column'),'1,3');
  await key('Escape');
  console.log('PASS: nested lists, caret styles, table paste/heading safety, resizing, row removal, and picker Tab traversal.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
