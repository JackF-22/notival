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
  await fresh();
  const long=Array.from({length:60},(_,i)=>'<p>Line '+i+' of a long note with some text to scroll through.</p>').join('');
  await evaluate(`current().blocks[0].html='<h1>A heading</h1>'+${JSON.stringify(long)};render()`);await wait(300);
  const bar=()=>evaluate(`(()=>{const f=document.querySelector('#format-bar'),c=getComputedStyle(f);return {shadow:c.boxShadow,opacity:c.opacity,bg:c.backgroundColor,pos:c.position}})()`);
  let b=await bar();
  assert.equal(b.shadow,'none','no soft shadow washing out the text beneath the bar');assert.equal(b.opacity,'1');assert.equal(b.pos,'sticky','it still sticks to the top');
  assert.doesNotMatch(b.bg,/rgba\(0, 0, 0, 0\)|transparent/,'and is solid');
  await evaluate(`document.querySelector('article').scrollTop=400`);await wait(200);
  b=await bar();assert.equal(b.shadow,'none','still none after scrolling');assert.equal(b.opacity,'1');
  // text just under the bar is at full strength, not faded
  assert.equal(await evaluate(`(()=>{const f=document.querySelector('#format-bar').getBoundingClientRect(),el=document.elementFromPoint(f.left+60,f.bottom+4);return getComputedStyle(el).opacity+'|'+(getComputedStyle(el.closest('.rich-text')||el).maskImage)})()`),'1|none');
  console.log('PASS: the formatting bar is solid while scrolling: no fade shadow, full opacity, still sticky.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
