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

  const shown=selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e?.getBoundingClientRect();return !!e&&r.width>0&&r.height>0&&getComputedStyle(e).display!=='none'})()`);
  const subjects=`[{id:'ru',name:'Russian',icon:'🇷🇺',color:'#c4483c',description:'',units:[],materials:[],packs:[],assessments:[{id:'a',title:'Test',kind:'test',date:'2026-12-01'}],checklist:[{id:'t',title:'Task',done:false}]}]`;
  await evaluate(`localStorage.removeItem('notival-tucked');localStorage.removeItem('notival-layout');WidgetTuck.clear();(()=>{state.projects=${subjects};state.notes=[];active=null;window.marginHome('ru')})()`);await wait(500);
  const widgetBox=await evaluate(`(()=>{const r=document.querySelector('.subject-widgets').getBoundingClientRect();return [Math.round(r.left),Math.round(r.width)]})()`);
  assert.equal(await shown('.subject-checklist:not(.subject-recall):not(.subject-plan) .widget-tuck, .subject-checklist .widget-tuck'),true,'a box has a tab hanging off its edge');
  assert.equal(await evaluate(`document.querySelectorAll('.subject-widgets .widget-tuck').length>=3`),true,'every box has one');
  assert.equal(await shown('#widget-tabs'),false,'no edge tabs while nothing is tucked');
  // Push the To do box to the side
  await evaluate(`[...document.querySelectorAll('.subject-widgets > section')].find(s=>/To do/.test(s.querySelector('h2')?.textContent)).querySelector('.widget-tuck').click()`);await wait(450);
  assert.equal(await evaluate(`[...document.querySelectorAll('.subject-widgets > section')].find(s=>/To do/.test(s.querySelector('h2')?.textContent)).offsetParent===null`),true,'the To do box is out of view');
  assert.deepEqual(await evaluate(`WidgetTuck.tucked()`),['todo']);
  assert.equal(await shown('#widget-tabs'),true,'a tab is waiting at the edge');
  assert.equal(await evaluate(`document.querySelector('.widget-tab-label').textContent`),'To do');
  await wait(400);
  const spot=await evaluate(`(()=>{const r=document.querySelector('.widget-tab').getBoundingClientRect();return {top:Math.round(r.top),fromRight:Math.round(innerWidth-r.right)}})()`);
  assert.ok(spot.top<100&&spot.top>=72,'the tab sits at the top, just under the header: '+JSON.stringify(spot));
  assert.ok(spot.fromRight<=40&&spot.fromRight>=0,'and at the right: '+JSON.stringify(spot));
  const gap=await evaluate(`(()=>{const tab=document.querySelector('.widget-tab').getBoundingClientRect(),first=[...document.querySelectorAll('.subject-widgets > section')].find(s=>s.offsetParent).getBoundingClientRect();return Math.round(first.top-tab.bottom)})()`);
  assert.ok(gap>=14,'there is a clear gap between the tabs and the boxes still in place: '+gap+'px');
  const handle=await evaluate(`(()=>{const r=document.querySelector('.subject-widgets .widget-tuck').getBoundingClientRect(),o=getComputedStyle(document.querySelector('.subject-widgets .widget-tuck')).opacity;return {w:Math.round(r.width),h:Math.round(r.height),o}})()`);
  assert.ok(handle.w>=26&&handle.h>=60&&handle.o==='1','the push-out tab is big and fully visible: '+JSON.stringify(handle));
  assert.equal(await shown('.subject-widgets'),true,'the other boxes stay');
  // It is remembered, including on another subject page
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('notival-tucked'))`),['todo']);
  await evaluate(`window.marginHome('ru')`);await wait(400);
  assert.equal(await evaluate(`[...document.querySelectorAll('.subject-widgets > section')].find(s=>/To do/.test(s.querySelector('h2')?.textContent)).offsetParent===null`),true,'still tucked after the page is redrawn');
  // Bring it back from the tab
  await evaluate(`document.querySelector('.widget-tab').click()`);await wait(450);
  assert.equal(await shown('#widget-tabs'),false);
  assert.equal(await evaluate(`[...document.querySelectorAll('.subject-widgets > section')].find(s=>/To do/.test(s.querySelector('h2')?.textContent)).offsetParent!==null`),true,'the box is back');
  // Tuck every box: the main column takes the room
  const before=await evaluate(`Math.round(document.querySelector('.student-home-view > .student-tabs').getBoundingClientRect().width)`);
  await evaluate(`document.querySelectorAll('.subject-widgets .widget-tuck').forEach(b=>b.click())`);await wait(500);
  assert.equal(await evaluate(`document.querySelector('.student-home-view').hasAttribute('data-widgets-away')`),true);
  assert.equal(await evaluate(`document.querySelectorAll('.widget-tab').length>=3`),true,'each box has its own tab');
  const after=await evaluate(`Math.round(document.querySelector('.student-home-view > .student-tabs').getBoundingClientRect().width)`);
  assert.ok(after>before+150,'the page widens when the column is empty: '+before+' → '+after);
  // The Everything preset brings every box back
  await evaluate(`Customize.open();[...document.querySelectorAll('.customize-preset')].find(b=>/Everything/.test(b.textContent)).click();document.querySelector('.customize-dialog').close()`);await wait(300);
  assert.deepEqual(await evaluate(`WidgetTuck.tucked()`),[]);assert.equal(await shown('#widget-tabs'),false);
  // The Home page's To do box can be pushed aside too
  await evaluate(`window.marginHome(null)`);await wait(400);
  assert.equal(await evaluate(`!!document.querySelector('.global-todo > .widget-tuck')`),true,'Home\'s To do box has the tab');
  await evaluate(`document.querySelector('.global-todo > .widget-tuck').click()`);await wait(450);
  assert.equal(await evaluate(`document.querySelector('.global-todo').offsetParent===null`),true);
  assert.equal(await evaluate(`document.querySelector('.widget-tab-label')?.textContent`),'To do','and it has its tab');
  // Over a note the tabs stay out of the way
  await evaluate(`document.body.dataset.view='note'`);await wait(100);
  assert.equal(await shown('#widget-tabs'),false,'no edge tabs over a note');
  await evaluate(`document.body.dataset.view='home'`);await wait(100);
  assert.equal(await shown('#widget-tabs'),true,'and they are back on the home page');
  await evaluate(`WidgetTuck.clear()`);
  console.log('PASS: boxes slide out to the right edge, leave a tab to bring them back, are remembered, and the page closes up around them.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
