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
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click();document.querySelector(".rich-text").focus()');await wait(100);
  await call('Input.insertText',{text:'Before the figure.'},sessionId);
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  // A figure traced from a PDF lands in the note at the caret, with a descriptive alt text.
  await evaluate(`window.marginPDFImage({dataURL:'${png}',page:3,name:'Cells.pdf',path:'/x/Cells.pdf'})`);await wait(400);
  assert.equal(await evaluate('document.querySelectorAll(".rich-text img").length'),1);
  assert.equal(await evaluate('document.querySelector(".rich-text img").alt'),'Figure from Cells, page 3');
  assert.match(await evaluate('current().blocks[0].html'),/<img[^>]*alt="Figure from Cells, page 3"/);
  assert.equal(await evaluate('document.querySelector(".rich-text").textContent.includes("Before the figure.")'),true);
  // The caret waits on an empty line right below the picture, so typing continues there.
  await call('Input.insertText',{text:'After it'},sessionId);await wait(100);
  assert.equal(await evaluate(`(()=>{const img=document.querySelector('.rich-text img');let top=img;while(top.parentElement!==document.querySelector('.rich-text'))top=top.parentElement;return top.nextElementSibling.textContent`+'})()'),'After it');
  // The figure goes where the caret was, even if the live selection was reset when focus left the note.
  await evaluate(`current().blocks[0].html='<p>First paragraph</p><p>Second paragraph</p><p>Third paragraph</p>';render()`);await wait(200);
  await evaluate(`(()=>{const e=document.querySelector('.rich-text'),p=e.children[1],r=document.createRange();r.setStart(p.firstChild,6);r.collapse(true);e.focus();getSelection().removeAllRanges();getSelection().addRange(r);e.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}));})()`);
  await evaluate(`(()=>{const e=document.querySelector('.rich-text'),r=document.createRange();r.setStart(e,0);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);document.activeElement.blur()})()`);
  await evaluate(`window.marginPDFImage({dataURL:'${png}',page:1,name:'P.pdf',path:'/x/P.pdf'})`);await wait(400);
  assert.equal(await evaluate(`(()=>{const h=document.querySelector('.rich-text').innerHTML.replace(/<img[^>]*>/,'<IMG>').replace(/<\\/?p>|<br>/g,'|');return h.indexOf('First paragraph')<h.indexOf('Second')&&h.indexOf('Second')<h.indexOf('<IMG>')&&h.indexOf('<IMG>')<h.indexOf('paragraph|',h.indexOf('<IMG>'))&&h.indexOf('<IMG>')<h.indexOf('Third')})()`),true);
  // A traced equation arrives as LaTeX and opens in the live equation editor at the caret, ready to accept.
  await evaluate(`current().blocks[0].html='<p>Before</p><p>After</p>';render()`);await wait(200);
  await evaluate(`(()=>{const e=document.querySelector('.rich-text'),p=e.firstElementChild,r=document.createRange();r.selectNodeContents(p);r.collapse(false);e.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(r);e.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}))})()`);
  await evaluate(`window.marginPDFEquation({latex:'\\\\frac{a}{b}=c',page:2,name:'P.pdf',path:'/x/P.pdf',dataURL:'${png}'})`);await wait(300);
  assert.equal(await evaluate(`document.querySelector('.display-equation.editing .equation-source').value`),'\\frac{a}{b}=c');
  assert.equal(await evaluate(`!!document.querySelector('.display-equation.editing .equation-preview .katex')`),true);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await wait(200);
  assert.equal(await evaluate(`document.querySelector('.rich-text').children[0].textContent+'|'+document.querySelector('.rich-text .display-equation').dataset.equation`),'Before|\\frac{a}{b}=c');
  // Output with stray \right delimiters (as real recognition sometimes gives) is repaired so the preview renders.
  const messy=String.raw`{\mathcal{T}}(\theta)=\mathbb{E}\left[{\frac{1}{G}}\sum_{i=1}^{G}{\frac{1}{\left|y^{(i)}\right|}}\sum_{i=1}^{\left|y^{(i)}\right|}\sum_{i=1}^{\left|y^{(i)}\right|}\operatorname*{min}\left(\rho_{i,i}\right|{\dot{A}}_{i},\ {\frac{\left|\sin\mathrm{e}\right|}{\sin\mathrm{e}\left|\theta_{i}\right|}}\right)\right]`;
  assert.equal(await evaluate(`(()=>{try{katex.renderToString(${JSON.stringify(messy)},{throwOnError:true});return true}catch(e){return false}})()`),false);
  await evaluate(`current().blocks[0].html='<p>Equation below</p>';render()`);await wait(200);
  await evaluate(`(()=>{const e=document.querySelector('.rich-text'),r=document.createRange();r.selectNodeContents(e.firstElementChild);r.collapse(false);e.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(r);e.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}))})()`);
  await evaluate(`window.marginPDFEquation({latex:${JSON.stringify(messy)},page:1,name:'P.pdf',path:'/x/P.pdf',dataURL:'${png}'})`);await wait(300);
  assert.equal(await evaluate(`!!document.querySelector('.display-equation.editing .equation-preview .katex')&&!document.querySelector('.display-equation.editing .equation-preview .katex-error')&&!document.querySelector('.display-equation.editing .equation-preview.invalid')`),true);
  assert.match(await evaluate(`document.querySelector('.display-equation.editing .equation-source').value`),/\\mathbb\{E\}\\left\[/);
  // A better reading among the candidates wins over a broken first one.
  await evaluate(`document.querySelector('.display-equation.editing .equation-source').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await wait(100);
  await evaluate(`window.marginPDFEquation({latex:'\\\\frac{a',candidates:['\\\\frac{a','x^{2}+1'],page:1,name:'P.pdf',path:'/x/P.pdf',dataURL:'${png}'})`);await wait(300);
  assert.equal(await evaluate(`document.querySelector('.display-equation.editing .equation-source').value`),'x^2+1','the better reading wins, tidied (x^{2} is shown as x^2, which draws the same)');
  await evaluate(`document.querySelector('.display-equation.editing .equation-source').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await wait(100);
  // When recognition is unavailable or fails, the traced picture is kept instead.
  await evaluate(`current().blocks[0].html='<p>Keep</p>';render()`);await wait(200);
  await evaluate(`window.marginPDFEquation({error:'setup',page:2,name:'P.pdf',path:'/x/P.pdf',dataURL:'${png}'})`);await wait(400);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text img').length+','+document.querySelectorAll('.equation').length`),'1,0');
  // Anything that is not a PNG data URL is ignored.
  await evaluate(`window.marginPDFImage({dataURL:'https://example.com/x.png'})`);await wait(150);
  assert.equal(await evaluate('document.querySelectorAll(".rich-text img").length'),1);
  await evaluate(`(()=>{const c=document.createElement('canvas');c.width=400;c.height=200;const x=c.getContext('2d');x.fillStyle='#8a7';x.fillRect(0,0,400,200);window.__big=c.toDataURL('image/png')})()`);
  // There is always a place to keep typing after a picture, even if everything below it was deleted.
  await evaluate(`current().blocks[0].html='<p>Text</p><p><img src="'+window.__big+'" alt="Last figure"></p>';render()`);await wait(200);
  assert.equal(await evaluate(`document.querySelector('.rich-text').lastElementChild.textContent+'|'+document.querySelector('.rich-text').lastElementChild.querySelector('img')`),'|null');
  assert.equal(await evaluate(`document.querySelector('.rich-text').lastElementChild.tagName`),'P');
  // Clicking in the blank space below the picture puts the caret on that last line.
  const below=await evaluate(`(()=>{const e=document.querySelector('.rich-text'),r=e.lastElementChild.getBoundingClientRect(),b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:r.bottom+Math.min(10,(b.bottom-r.bottom)/2)}})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...below,button:'left',buttons:1,clickCount:1},sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',...below,button:'left',buttons:0,clickCount:1},sessionId);await wait(80);
  await call('Input.insertText',{text:'typed below'},sessionId);await wait(80);
  assert.equal(await evaluate(`document.querySelector('.rich-text').lastElementChild.textContent`),'typed below');
  // Backspace on that empty line first selects the picture instead of deleting it.
  await evaluate(`current().blocks[0].html='<p>Text</p><p><img src="'+window.__big+'" alt="Last figure"></p>';render()`);await wait(200);
  await evaluate(`(()=>{const e=document.querySelector('.rich-text'),p=e.lastElementChild,r=document.createRange();r.setStart(p,0);r.collapse(true);e.focus();getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);await wait(60);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text img').length+','+!getSelection().isCollapsed`),'1,true');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);await wait(100);
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text img').length`),0);
  assert.equal(await evaluate(`document.querySelector('.rich-text').lastElementChild.tagName`),'P');
  // Pictures resize from a corner handle; the width is saved with the note and survives a re-render.
  await evaluate(`(()=>{const c=document.createElement('canvas');c.width=400;c.height=200;const x=c.getContext('2d');x.fillStyle='#8a7';x.fillRect(0,0,400,200);window.__big=c.toDataURL('image/png')})()`);
  await evaluate(`current().blocks[0].html='<p>Text</p><img src="'+window.__big+'" alt="Test figure"><p><br></p>';render()`);await wait(200);
  const pic=await evaluate(`(()=>{const r=document.querySelector('.rich-text img').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width}})()`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:pic.x,y:pic.y},sessionId);await wait(120);
  assert.equal(await evaluate(`!document.querySelector('.image-resizer').hidden`),true);
  const grip=await evaluate(`(()=>{const r=document.querySelector('.image-handle[data-corner=se]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:grip.x,y:grip.y},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...grip,button:'left',buttons:1,clickCount:1},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:grip.x-Math.round(pic.width/2),y:grip.y,button:'left',buttons:1},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:grip.x-Math.round(pic.width/2),y:grip.y,button:'left',buttons:0,clickCount:1},sessionId);await wait(150);
  const resized=await evaluate(`document.querySelector('.rich-text img').getBoundingClientRect().width`);
  assert.ok(resized<pic.width*0.7&&resized>pic.width*0.3,'picture is about half as wide');
  assert.match(await evaluate('current().blocks[0].html'),/<img[^>]*data-width="[\d.]+"/);
  await evaluate('render()');await wait(200);
  assert.ok(Math.abs(await evaluate(`document.querySelector('.rich-text img').getBoundingClientRect().width`)-resized)<2,'width survives re-render');
  // The sidebar steps aside while a PDF is open, and returns when it closes (unless the user toggled it).
  await evaluate(`setSidebarCollapsed(false)`);
  await evaluate(`window.marginPDFOpened({path:'/tmp/sidebar-test.pdf',name:'sidebar-test.pdf'})`);await wait(100);
  assert.equal(await evaluate(`document.body.classList.contains('sidebar-collapsed')`),true);
  await evaluate(`window.marginPDFClosed()`);
  assert.equal(await evaluate(`document.body.classList.contains('sidebar-collapsed')`),false);
  await evaluate(`window.marginPDFOpened({path:'/tmp/sidebar-test.pdf',name:'sidebar-test.pdf'});document.querySelector('#sidebar-toggle').click();document.querySelector('#sidebar-toggle').click()`);await wait(50);
  await evaluate(`window.marginPDFClosed()`);
  assert.equal(await evaluate(`document.body.classList.contains('sidebar-collapsed')`),true);
  console.log('PASS: traced PDF figures are inserted inline with alt text, and non-PNG data is rejected.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
