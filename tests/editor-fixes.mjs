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
  await call('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const mouse=(type,x,y,buttons=1)=>call('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons,clickCount:1},sessionId);
  const keyCodes={Backspace:8,Delete:46,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Enter:13};
  const key=async name=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:keyCodes[name]},sessionId);await wait(50)};
  const type=async text=>{await call('Input.insertText',{text},sessionId);await wait(50)};
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(100);
  const note=async html=>{await evaluate(`current().blocks[0].html=${JSON.stringify(html)};render()`);await wait(250)};
  const rect=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}})()`);
  const html=()=>evaluate(`(()=>{const c=document.querySelector('.rich-text').cloneNode(true);c.querySelectorAll('.equation').forEach(q=>{q.replaceChildren();q.removeAttribute('title')});return c.innerHTML.replace(/ src="data:[^"]*"/g,' src=…')})()`);
  const caret=(selector,offset)=>evaluate(`(()=>{const e=document.querySelector('.rich-text');e.focus();const n=e.querySelector(${JSON.stringify(selector)}),t=n.firstChild.nodeType===3?n.firstChild:n,r=document.createRange();r.setStart(t,${offset});r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);e.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}))})()`);
  const select=(selector,from,to)=>evaluate(`(()=>{const e=document.querySelector('.rich-text');e.focus();const t=e.querySelector(${JSON.stringify(selector)}).firstChild,r=document.createRange();r.setStart(t,${from});r.setEnd(t,${to});getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  const picture=await evaluate(`(()=>{const c=document.createElement('canvas');c.width=300;c.height=300;const x=c.getContext('2d');x.fillStyle='#9bc';x.fillRect(0,0,300,300);return c.toDataURL('image/png')})()`);
  const eq='<div class="equation display-equation" data-equation="E=mc^2" contenteditable="false">E=mc^2</div>';

  // Bullets beside a picture are never hidden by it, and what follows a blank line starts below the picture.
  await note(`<p><img src="${picture}" data-align="left" data-width="35"></p><p>Short.</p><ul><li>First bullet</li></ul><p><br></p><p>Below it.</p>${eq}`);
  const side=await evaluate(`(()=>{const i=document.querySelector('.rich-text img').getBoundingClientRect(),li=document.querySelector('li').getBoundingClientRect(),below=[...document.querySelectorAll('.rich-text p')].find(p=>p.textContent==='Below it.').getBoundingClientRect();return {imageRight:i.right,imageBottom:i.bottom,bullet:li.left,below:below.top}})()`);
  assert.ok(side.bullet>=side.imageRight,'the bullet and its marker sit clear of the picture: '+JSON.stringify(side));
  assert.ok(side.below>=side.imageBottom-1,'text after a blank line starts below the picture: '+JSON.stringify(side));

  // Clicking a display equation selects it without making a new line, and typing carries on beneath it.
  await note(`<p>Top</p>${eq}<p>Bottom</p>`);
  const target=await rect('.display-equation');
  await mouse('mousePressed',target.l+target.w/2,target.t+target.h/2);await mouse('mouseReleased',target.l+target.w/2,target.t+target.h/2,0);await wait(80);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text p').length`),2,'clicking an equation adds no empty line');
  assert.equal(await evaluate(`document.querySelector('.display-equation').classList.contains('selected')`),true);
  await key('Enter');await type('N');
  assert.match(await html(),/<p>N<\/p><p>Bottom<\/p>/,'Enter after a selected equation opens a line below it');

  // Arrows step through equations that sit side by side without making blank lines between them.
  await note(`<p>Top</p>${eq}${eq}<p>Bottom</p>`);
  await caret('p',3);await key('ArrowRight');await key('ArrowRight');await key('ArrowRight');await type('M');
  assert.equal((await html()).includes('<p><br></p>'),false,'no blank line appears between equations');
  assert.match(await html(),/<p>MBottom<\/p>/,'the third arrow lands after both equations');

  // Backspace at the start of a bullet right after an equation selects it first, then removes it, and keeps both bullets.
  await note(`<ol><li>Step${eq}</li><li>Next</li></ol>`);
  await caret('li:last-child',0);await key('Backspace');
  assert.equal(await evaluate(`document.querySelectorAll('.display-equation').length`),1,'the first Backspace only selects the equation');
  await key('Backspace');await type('!');
  assert.match(await html(),/<li>Step!<\/li><li>Next<\/li>/,'the equation is gone and both bullets remain');

  // Clicking an equation inside a bullet no longer adds an empty bullet.
  await note(`<ol><li>Step${eq}</li></ol>`);
  const inList=await rect('.display-equation');await mouse('mousePressed',inList.l+inList.w/2,inList.t+inList.h/2);await mouse('mouseReleased',inList.l+inList.w/2,inList.t+inList.h/2,0);await wait(80);
  assert.equal(await evaluate(`document.querySelectorAll('li').length`),1,'no stray bullet');

  // Highlighting: a colour marks the selection, the same colour again takes it off, another colour changes it.
  await note('<p>Hello brave world</p>');
  await select('p',6,11);await evaluate(`RichEditor.command('highlight','yellow')`);
  assert.match(await html(),/Hello <mark data-hl="yellow">brave<\/mark> world/);
  assert.match(await evaluate(`current().blocks[0].html`),/<mark data-hl="yellow">brave<\/mark>/,'the highlight is saved');
  assert.match(await evaluate(`current().blocks[0].text`),/==brave==/,'and written in the text form');
  await evaluate(`RichEditor.command('highlight','green')`);assert.match(await html(),/<mark data-hl="green">brave<\/mark>/);
  await evaluate(`RichEditor.command('highlight','green')`);assert.equal((await html()).includes('<mark'),false,'choosing the same colour removes it');

  // A display equation can be picked up and put down elsewhere; a plain click moves nothing.
  await note(`<p>One</p><p>Two</p>${eq}<p>Three</p>`);
  const first=await rect('.rich-text p'),from=await rect('.display-equation'),fx=from.l+from.w/2,fy=from.t+from.h/2;
  await mouse('mousePressed',fx,fy);for(let i=1;i<=6;i++)await mouse('mouseMoved',fx,fy+(first.t+2-fy)*i/6);await mouse('mouseReleased',fx,first.t+2,0);await wait(120);
  assert.match(await html(),/^<div class="equation display-equation[^>]*><\/div><p>One<\/p><p>Two<\/p><p>Three<\/p>$/,'the equation moved to the top');

  // A picture dropped on the right side of the note sits there with the text wrapping, lifted out of its sentence.
  await note(`<p>One</p><p>Two <img src="${picture}" data-width="30"> words</p>`);
  const pic=await rect('.rich-text img'),box=await rect('.rich-text'),line=await rect('.rich-text p');
  const px=pic.l+pic.w/2,py=pic.t+pic.h/2;
  await mouse('mousePressed',px,py);for(let i=1;i<=6;i++)await mouse('mouseMoved',px+(box.r-30-px)*i/6,py+(line.t+2-py)*i/6);await mouse('mouseReleased',box.r-30,line.t+2,0);await wait(120);
  assert.equal(await evaluate(`document.querySelector('.rich-text img').dataset.align`),'right','dropped at the right edge it floats right');
  assert.equal(await evaluate(`document.querySelector('.rich-text').firstElementChild.querySelector('img')!==null`),true,'it now sits above the text it wraps');
  console.log('PASS: bullets clear pictures, equations select and delete without stray lines, highlighting toggles, pictures and equations can be dragged into place.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
