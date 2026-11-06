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
  await call('Emulation.setDeviceMetricsOverride',{width:1100,height:600,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(100);
  const paragraphs=Array.from({length:40},(_,i)=>`<p>Paragraph ${i+1} of the note.</p>`).join('');
  await evaluate(`current().blocks[0].html=${JSON.stringify('PLACEHOLDER')}.replace('PLACEHOLDER',${JSON.stringify(paragraphs)});render()`);await wait(250);
  // Finishing an inline equation leaves the page exactly where it was.
  await evaluate(`(()=>{const a=document.querySelector('article');a.scrollTop=a.scrollHeight;const e=document.querySelector('.rich-text'),p=e.lastElementChild,r=document.createRange();r.selectNodeContents(p);r.collapse(false);e.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(r);e.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}))})()`);await wait(150);
  const before=await evaluate('document.querySelector("article").scrollTop');
  assert.ok(before>200,'the note is scrolled down');
  await evaluate('RichEditor.command("inlineequation")');await wait(100);
  await call('Input.insertText',{text:'x^2'},sessionId);await wait(60);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await wait(250);
  const after=await evaluate('document.querySelector("article").scrollTop');
  assert.ok(Math.abs(after-before)<3,'page position stays put: '+before+' -> '+after);
  // The caret sits right after the equation, on the same line, ready to type.
  await call('Input.insertText',{text:'Z'},sessionId);await wait(80);
  assert.equal(await evaluate(`(()=>{const p=document.querySelector('.rich-text').lastElementChild,eq=p.querySelector('.inline-equation');return eq&&eq.nextSibling.nodeType===3&&eq.nextSibling.textContent.includes('Z')})()`),true);
  // An equation at the end of a line can always be clicked past, and typed after.
  await evaluate(`current().blocks[0].html='<p>Before <span class="equation inline-equation" data-equation="x^2" contenteditable="false">x^2</span></p><p>Next line</p>';render()`);await wait(250);
  assert.equal(await evaluate(`document.querySelector('.inline-equation').nextSibling?.nodeType`),3);
  const right=await evaluate(`(()=>{const r=document.querySelector('.inline-equation').getBoundingClientRect(),e=document.querySelector('.rich-text').getBoundingClientRect();return {x:Math.min(e.right-60,r.right+120),y:r.top+r.height/2}})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...right,button:'left',buttons:1,clickCount:1},sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',...right,button:'left',buttons:0,clickCount:1},sessionId);await wait(80);
  await call('Input.insertText',{text:'Q'},sessionId);await wait(80);
  assert.equal(await evaluate(`(()=>{const eq=document.querySelector('.inline-equation');return eq.nextSibling.textContent.includes('Q')&&!eq.textContent.includes('Q')&&document.querySelector('.rich-text p:nth-child(2)').textContent==='Next line'})()`),true);
  // Arrow keys step over the equation in both directions.
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37},sessionId);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37},sessionId);await wait(60);
  await call('Input.insertText',{text:'B'},sessionId);await wait(60);
  assert.equal(await evaluate(`(()=>{const eq=document.querySelector('.inline-equation');return eq.previousSibling.textContent.endsWith('B')||eq.previousSibling.textContent.includes('B')})()`),true);
  // Backspace in an empty inline equation removes it and typing carries on in the line.
  await evaluate(`current().blocks[0].html='<p>Start</p>';render()`);await wait(200);
  await evaluate(`(()=>{const e=document.querySelector('.rich-text'),p=e.firstElementChild,r=document.createRange();r.selectNodeContents(p);r.collapse(false);e.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(r);e.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}));RichEditor.command('inlineequation')})()`);await wait(120);
  assert.equal(await evaluate(`document.querySelectorAll('.equation.editing').length`),1);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);await wait(150);
  assert.equal(await evaluate(`document.querySelectorAll('.equation').length`),0);
  await call('Input.insertText',{text:' more'},sessionId);await wait(80);
  assert.equal(await evaluate(`document.querySelector('.rich-text p').textContent`),'Start more');
  // The same goes for an existing equation once its source has been cleared.
  await evaluate(`current().blocks[0].html='<p>A <span class="equation inline-equation" data-equation="x^2" contenteditable="false">x^2</span> B</p>';render()`);await wait(250);
  await evaluate(`document.querySelector('.inline-equation').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}))`);await wait(100);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);await wait(60);
  assert.equal(await evaluate(`document.querySelectorAll('.equation.editing').length`),1);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);await wait(150);
  assert.equal(await evaluate(`document.querySelectorAll('.equation').length`),0);
  // A display equation can live inside a list item, shrunk to fit under its text, and survives Markdown.
  await evaluate(`current().blocks[0].html='<ul><li>Item one</li><li>Item two<ul><li>Sub item</li></ul></li></ul>';render()`);await wait(250);
  await evaluate(`(()=>{const e=document.querySelector('.rich-text'),li=e.querySelectorAll('li')[1],r=document.createRange();r.setStart(li.firstChild,li.firstChild.data.length);r.collapse(true);e.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(r);e.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}));RichEditor.command('equation')})()`);await wait(150);
  assert.equal(await evaluate(`!!document.querySelector('li > .display-equation.editing')`),true);
  await call('Input.insertText',{text:'E=mc^2'},sessionId);await wait(60);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await wait(250);
  assert.equal(await evaluate(`(()=>{const items=[...document.querySelectorAll('.rich-text > ul > li')],eq=items[1].querySelector(':scope > .display-equation:not(.editing)');return !!eq&&items[1].children[0]===eq&&items[1].lastElementChild.tagName==='UL'&&items.length===3})()`),true);
  // Shrunk to the list: narrower than the note column, smaller type.
  assert.equal(await evaluate(`(()=>{const eq=document.querySelector('li > .display-equation').getBoundingClientRect(),col=document.querySelector('.rich-text').getBoundingClientRect(),fs=parseFloat(getComputedStyle(document.querySelector('li > .display-equation')).fontSize),body=parseFloat(getComputedStyle(document.querySelector('.rich-text li')).fontSize);return eq.width<col.width-20&&fs<body})()`),true);
  // The caret moved on to a fresh bullet, so typing continues the list.
  await call('Input.insertText',{text:'Next'},sessionId);await wait(80);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text > ul > li')[2].textContent`),'Next');
  const markdown=await evaluate(`current().blocks[0].text`);
  assert.match(markdown,/- Item two\n {4}\$\$\n {4}E=mc\^2\n {4}\$\$\n {4}- Sub item\n- Next/);
  assert.match(await evaluate(`RichEditor.fromMarkdown(${JSON.stringify(markdown)})`),/<li>Item two<div class="equation display-equation" data-equation="E=mc\^2"[^>]*>E=mc\^2<\/div><ul><li>Sub item<\/li><\/ul><\/li>/);
  console.log('PASS: finishing an inline equation keeps the page position, and the caret can always sit before and after it.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
