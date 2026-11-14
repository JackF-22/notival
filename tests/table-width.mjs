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
  const mouse=(type,x,y,buttons=1)=>call('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons,clickCount:1},sessionId);
  const hover=(x,y)=>call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'none',buttons:0},sessionId);
  const widthOf=()=>evaluate('(()=>{const t=document.querySelector(".rich-text table"),e=document.querySelector(".rich-text"),s=getComputedStyle(e);return {t:t.getBoundingClientRect().width,room:e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)}})()');
  const rightEdge=()=>evaluate('(()=>{const t=document.querySelector(".rich-text table"),c=t.rows[0].cells[t.rows[0].cells.length-1].getBoundingClientRect();return {x:c.right-2,y:c.top+8}})()');
  const saved=()=>evaluate('current().blocks[0].html');
  await fresh();await evaluate('RichEditor.command("table",{rows:2,columns:3})');await wait(60);
  let w=await widthOf();assert.ok(Math.abs(w.t-w.room)<2,'a new table still fills the note');
  // Drag the right edge in: the table gets narrower, its columns share what is left
  let edge=await rightEdge();
  await hover(edge.x,edge.y);await wait(30);
  assert.equal(await evaluate('document.querySelector(".rich-text").classList.contains("col-resize")'),true,'the resize cursor shows at the right edge');
  const cols=()=>evaluate('[...document.querySelector(".rich-text table").rows[0].cells].map(c=>c.getBoundingClientRect().width)');
  const before=await cols();
  // A short drag: only the last column gives way; the others keep their width exactly
  await hover(edge.x,edge.y);await mouse('mousePressed',edge.x,edge.y);await mouse('mouseMoved',edge.x-100,edge.y);await mouse('mouseReleased',edge.x-100,edge.y,0);await wait(60);
  let now=await cols();w=await widthOf();
  assert.ok(Math.abs(now[0]-before[0])<2&&Math.abs(now[1]-before[1])<2,'the columns before the last one are not touched: '+JSON.stringify([before,now]));
  assert.ok(Math.abs((before[2]-now[2])-100)<3,'the last column took the whole 100px');
  assert.ok(Math.abs(w.t-(w.room-100))<3,'the table is 100px narrower');
  assert.match(await saved(),/<table data-widths="[\d.,]+" data-span="[\d.]+"/,'the width is saved with the note');
  // Dragging further than the last column can give: it stops at a small minimum and only then does the next one shrink
  edge=await rightEdge();
  await hover(edge.x,edge.y);await mouse('mousePressed',edge.x,edge.y);await mouse('mouseMoved',edge.x-200,edge.y);await mouse('mouseReleased',edge.x-200,edge.y,0);await wait(60);
  const squeezed=await cols();
  assert.ok(squeezed[2]>=40&&squeezed[2]<=56,'the last column stops at its minimum: '+JSON.stringify(squeezed));
  assert.ok(Math.abs(squeezed[0]-before[0])<2,'the first column is still untouched');assert.ok(squeezed[1]<before[1]-10,'the middle column squeezes only when it has to');
  assert.equal(await evaluate('document.querySelectorAll(".rich-text table td").length'),6);
  // It survives a reload of the note's HTML
  await evaluate('(()=>{const b=current().blocks[0];render()})()');await wait(150);
  w=await widthOf();assert.ok(w.t<w.room-200,'still narrow after the note is redrawn');
  // Drag past the full width and it snaps back to filling the note
  edge=await rightEdge();
  await hover(edge.x,edge.y);await mouse('mousePressed',edge.x,edge.y);await mouse('mouseMoved',edge.x+800,edge.y);await mouse('mouseReleased',edge.x+800,edge.y,0);await wait(60);
  w=await widthOf();assert.ok(Math.abs(w.t-w.room)<2,'dragging out to the edge makes it full width again');
  assert.doesNotMatch(await saved(),/data-span/,'full width stores nothing extra');
  // Narrow again, then double-click the edge to reset
  edge=await rightEdge();
  await hover(edge.x,edge.y);await mouse('mousePressed',edge.x,edge.y);await mouse('mouseMoved',edge.x-200,edge.y);await mouse('mouseReleased',edge.x-200,edge.y,0);await wait(60);
  assert.ok((await widthOf()).t<w.room-100);
  edge=await rightEdge();
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:edge.x,y:edge.y,button:'left',buttons:1,clickCount:2},sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:edge.x,y:edge.y,button:'left',clickCount:2},sessionId);
  await evaluate(`document.querySelector('.rich-text').dispatchEvent(new MouseEvent('dblclick',{clientX:${edge.x},clientY:${edge.y},bubbles:true,cancelable:true}))`);await wait(60);
  assert.ok(Math.abs((await widthOf()).t-w.room)<2,'double-clicking the edge restores full width');
  // Fit to content, from the right-click menu
  await evaluate(`(()=>{const c=document.querySelector('.rich-text td'),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('contextmenu',{clientX:r.left+5,clientY:r.top+5,bubbles:true,cancelable:true}))})()`);await wait(60);
  assert.equal(await evaluate(`[...document.querySelectorAll('.table-menu button')].map(b=>b.textContent).filter(t=>/width|Fit/.test(t)).join('|')`),'Fit table to content|Full width table');
  await evaluate(`[...document.querySelectorAll('.table-menu button')].find(b=>b.textContent==='Fit table to content').click()`);await wait(80);
  w=await widthOf();assert.ok(w.t<w.room*0.6,'an empty table fit to its content is small: '+JSON.stringify(w));
  assert.match(await saved(),/<table data-fit="content"/);
  await evaluate(`document.querySelector('.rich-text td').textContent='A fairly long cell of text that makes this column wide'`);await wait(60);
  const grown=(await widthOf()).t;assert.ok(grown>w.t,'typing makes a fitted table grow with its content');
  await evaluate(`(()=>{const c=document.querySelector('.rich-text td'),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('contextmenu',{clientX:r.left+5,clientY:r.top+5,bubbles:true,cancelable:true}))})()`);await wait(60);
  await evaluate(`[...document.querySelectorAll('.table-menu button')].find(b=>b.textContent==='Full width table').click()`);await wait(80);
  assert.ok(Math.abs((await widthOf()).t-w.room)<2,'Full width table fills the note again');assert.doesNotMatch(await saved(),/data-fit/);
  // Hostile values are ignored when a note is loaded
  await evaluate(`(()=>{current().blocks[0].html='<table data-span="5000" data-fit="evil"><tbody><tr><td>x</td></tr></tbody></table>';render()})()`);await wait(150);
  w=await widthOf();assert.ok(Math.abs(w.t-w.room)<2,'out-of-range widths are dropped');
  console.log('PASS: table width — drag the right edge to narrow it, snap back to full, double-click to reset, fit to content and full width from the menu, saved with the note.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
