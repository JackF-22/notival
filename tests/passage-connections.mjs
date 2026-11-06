import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
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
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state'))break;await new Promise(resolve=>setTimeout(resolve,50))}
  for(let i=0;i<100;i++){if(await evaluate('!document.querySelector("#launch-screen")'))break;await new Promise(resolve=>setTimeout(resolve,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate(`const note={id:uid(),title:'Gesture test',nodes:[],blocks:[],updated:Date.now()};state.notes.unshift(note);active=note.id;mode='write';current().blocks=[{id:'gesture-block',type:'text',text:'First thought\\nSecond thought',html:'<p>First thought</p><p>Second thought</p>'}];render();document.querySelector('#connect-passages').click()`);
  await evaluate(`document.querySelector('#editor').scrollIntoView({block:'center'})`);
  const points=await evaluate(`Array.from(document.querySelectorAll('#editor .rich-text p')).map(el=>{const r=el.getBoundingClientRect();return {x:r.left+15,y:r.top+r.height/2}})`);
  async function gesture(){
    for(let i=0;i<100;i++){if(await evaluate('!document.querySelector("#launch-screen")'))break;await new Promise(resolve=>setTimeout(resolve,50))}
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...points[0],button:'left',clickCount:1},sessionId);
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:points[0].x+70,y:points[0].y+8,button:'left',buttons:1},sessionId);
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...points[1],button:'left',buttons:1},sessionId);
    assert.equal(await evaluate(`(()=>{const canvas=document.querySelector('.connection-trail-canvas'),box=canvas.getBoundingClientRect(),r=devicePixelRatio||1;return canvas.getContext('2d').getImageData(Math.round((${points[1].x}-box.left)*r),Math.round((${points[1].y}-box.top)*r),1,1).data[3]>0})()`),true);
    assert.match(await evaluate(`document.querySelector('.connection-input-status').textContent`),/From: (First|Revised) thought.*Second thought/);
    const shot=await call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('/private/tmp/notival-connection-drag.png',Buffer.from(shot.data,'base64'));
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...points[1],button:'left',clickCount:1},sessionId);
  }
  await gesture();
  assert.equal(await evaluate(`document.querySelector('#passage-connection-dialog').open`),true);
  await evaluate(`const r=document.querySelector('#passage-connection-dialog .rich-text');r.innerHTML='<p>supports</p>';r.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#passage-connection-dialog form').requestSubmit()`);
  assert.equal(await evaluate('current().nodes.length'),3);
  // The note's own idea is the center, and both passages are tied to it.
  assert.equal(await evaluate('(()=>{const root=current().nodes.find(n=>!n.parent&&!n.source);return !!root&&current().nodes.filter(n=>n.source).every(n=>n.parent===root.id)})()'),true);
  assert.equal(await evaluate('current().passageConnections[0].label'),'supports');
  assert.equal(await evaluate('mode'),'map');
  await evaluate(`const p=document.querySelector('#editor .rich-text p');p.textContent='Revised thought';p.closest('.rich-text').dispatchEvent(new Event('input',{bubbles:true}));setMode('map')`);
  assert.equal(await evaluate('current().nodes.find(n=>n.source).label'),'Revised thought');
  assert.equal(await evaluate(`document.querySelectorAll('.passage-edge').length`),1);
  await evaluate(`localStorage.setItem('margin',JSON.stringify(state))`);
  await call('Page.reload',{},sessionId);
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!document.querySelector("#connect-passages")'))break;await new Promise(resolve=>setTimeout(resolve,50))}
  assert.equal(await evaluate(`state.notes.find(n=>n.blocks.some(b=>b.id==='gesture-block')).passageConnections[0].label`),'supports');
  await evaluate(`active=state.notes.find(n=>n.blocks.some(b=>b.id==='gesture-block')).id;render();setMode('write');document.querySelector('#connect-passages').click()`);
  await gesture();
  await evaluate(`document.querySelector('#passage-connection-dialog button[type=button]').click()`);
  assert.equal(await evaluate('current().passageConnections.length'),1);
  await evaluate(`document.querySelector('#editor .rich-text p').remove();document.querySelector('#editor .rich-text').dispatchEvent(new Event('input',{bubbles:true}));setMode('map')`);
  assert.equal(await evaluate('current().nodes.find(n=>n.source).sourceMissing'),true);
  await evaluate(`setMode('write');current().blocks=[{id:'long',type:'text',text:'Long note',html:Array.from({length:70},(_,i)=>'<p>Passage '+i+'</p>').join('')}];render();document.querySelector('#connect-passages').click();document.querySelector('.rich-text p').scrollIntoView({block:'center'})`);
  assert.equal(await evaluate(`document.querySelector('.rich-text').contentEditable`),'false');
  async function clickPassage(selector){const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+20,y:r.top+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1},sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1},sessionId)}
  await clickPassage('.rich-text p');
  await evaluate(`document.querySelector('.rich-text p:last-child').scrollIntoView({block:'center'})`);
  await clickPassage('.rich-text p:last-child');
  assert.equal(await evaluate(`document.querySelector('#passage-connection-dialog').open`),true);
  assert.equal(await evaluate(`document.querySelector('.connection-from').textContent`),'Text line: Passage 0');
  assert.equal(await evaluate(`document.querySelector('.connection-to').textContent`),'Text line: Passage 69');
  await evaluate(`document.querySelector('#passage-connection-dialog button[type=button]').click();document.querySelector('#connect-passages').click()`);
  assert.equal(await evaluate(`document.querySelector('.rich-text').contentEditable`),'true');
  await evaluate(`setMode('write');current().blocks=[{id:'line-test',type:'text',text:'Line one and two',html:'<p>Line one<br>Line two</p>'}];render()`);
  const togglePoint=await evaluate(`(()=>{const b=document.querySelector('#connect-passages');b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...togglePoint,button:'left',clickCount:1},sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',...togglePoint,button:'left',clickCount:1},sessionId);
  assert.equal(await evaluate(`document.querySelector('.rich-text').contentEditable`),'false');
  assert.equal(await evaluate(`document.querySelector('.rich-text').innerHTML`),'<p>Line one<br>Line two</p>');
  // With the context rail open, the drawing surface stops at the writing column.
  await evaluate(`document.body.classList.add('context-open');window.dispatchEvent(new Event('resize'))`);await new Promise(r=>setTimeout(r,120));
  assert.equal(await evaluate(`(()=>{const s=document.querySelector('#connection-surface').getBoundingClientRect(),c=document.querySelector('#note-column').getBoundingClientRect();return s.right<=c.right+1&&s.left>=c.left-1})()`),true);
  await evaluate(`document.body.classList.remove('context-open')`);
  await evaluate(`document.querySelector('#connect-passages').click();document.querySelector('#map-tab').click()`);
  assert.equal(await evaluate(`document.querySelector('#map').hidden`),false);
  assert.match(await evaluate(`document.querySelector('#note-map-heading').textContent`),/Mind map/);
  await evaluate(`setMode('write');document.querySelector('.rich-text').focus();document.querySelector('[data-command="rule"]').click()`);
  assert.equal(await evaluate(`!!document.querySelector('.rich-text hr')`),true);

  // Connect two distinct rendered lines within one wrapping paragraph without altering its HTML.
  await evaluate(`current().blocks=[{id:'wrapped',type:'text',text:'',html:'<p>'+('A long line of lecture notes with concepts and examples. '.repeat(8))+'</p>'}];render();document.querySelector('#connect-passages').click();document.querySelector('.rich-text p').scrollIntoView({block:'center'})`);
  await new Promise(r=>setTimeout(r,200));
  const wrapped=await evaluate(`(()=>{const el=document.querySelector('.rich-text p'),n=el.firstChild,range=document.createRange(),lines=[];for(let i=0;i<n.length;i++){range.setStart(n,i);range.setEnd(n,i+1);const r=range.getBoundingClientRect();if(r.width&&!lines.some(l=>Math.abs(l.y-r.top-r.height/2)<2))lines.push({x:r.left+2,y:r.top+r.height/2})}return lines})()`);
  assert.ok(wrapped.length>=3);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...wrapped[0],button:'left',clickCount:1},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...wrapped[2],buttons:1},sessionId);
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',...wrapped[2],button:'left',clickCount:1},sessionId);
  await new Promise(r=>setTimeout(r,80));
  assert.equal(await evaluate(`document.querySelector('#passage-connection-dialog').open`),true);
  await evaluate(`document.querySelector('#passage-connection-dialog form').requestSubmit()`);
  const anchors=await evaluate(`current().nodes.filter(n=>n.source?.blockId==='wrapped').map(n=>n.source)`);
  assert.equal(anchors.length,2);assert.equal(anchors[0].passageId,anchors[1].passageId);assert.notEqual(anchors[0].textStart,anchors[1].textStart);
  assert.equal(await evaluate(`document.querySelector('#connection-surface').hidden`),true);

  // Feature targets: an image, a rendered equation and a table cell survive save/reload.
  await evaluate(`setMode('write');const fixtureCanvas=document.createElement('canvas');fixtureCanvas.width=180;fixtureCanvas.height=70;fixtureCanvas.getContext('2d').fillRect(0,0,180,70);current().blocks=[{id:'features',type:'text',text:'Feature note',html:'<p><img alt="Lecture diagram" src="'+fixtureCanvas.toDataURL()+'"></p><div class="equation display-equation" data-equation="E=mc^2">E=mc^2</div><table><tbody><tr><td>Cell concept</td><td>Cell explanation</td></tr></tbody></table>'}];render();document.querySelector('#connect-passages').click();document.querySelector('.rich-text img').scrollIntoView({block:'center'})`);
  async function pointFor(selector){return evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+Math.min(r.width/2,20),y:r.top+r.height/2}})()`)}
  const imgPoint=await pointFor('.rich-text img');
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...imgPoint},sessionId);
  assert.equal(await evaluate(`document.querySelector('.connection-input-status').textContent`),'Image: Lecture diagram');
  await clickPassage('.rich-text img');
  await evaluate(`document.querySelector('.rich-text .equation').scrollIntoView({block:'center'})`);
  await clickPassage('.rich-text .equation');
  assert.equal(await evaluate(`document.querySelector('.connection-to').textContent`),'Equation: E=mc^2');
  await evaluate(`document.querySelector('#passage-connection-dialog form').requestSubmit()`);
  assert.deepEqual(await evaluate(`current().nodes.filter(n=>n.source?.blockId==='features').map(n=>[n.label,n.sourceMissing])`),[['Lecture diagram',false],['E=mc^2',false]]);
  await evaluate(`setMode('write');render();document.querySelector('#connect-passages').click();document.querySelector('.rich-text td').scrollIntoView({block:'center'})`);
  const cellPoint=await pointFor('.rich-text td');await call('Input.dispatchMouseEvent',{type:'mouseMoved',...cellPoint},sessionId);
  assert.match(await evaluate(`document.querySelector('.connection-input-status').textContent`),/^Table cell: Cell concept/);
  const idle=await call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('/private/tmp/notival-connection-features.png',Buffer.from(idle.data,'base64'));
  // Leaving the note restores editing and removes the input shield.
  await evaluate(`window.marginHome()`);
  assert.equal(await evaluate(`document.querySelector('#connection-surface').hidden`),true);
  assert.equal(await evaluate(`document.querySelector('.rich-text').contentEditable`),'true');
  console.log('PASS: visible drawing, exact wrapped-line anchors, image/equation/cell targets, scrolling, persistence, map and clean exit.');

}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
