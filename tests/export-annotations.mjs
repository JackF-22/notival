import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-exportanno-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),20000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof RichEditor!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  const open=html=>evaluate(`(()=>{state.notes=[{id:'n',title:'Tab',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'a',type:'text',text:'x',html:${JSON.stringify(html)}}]}];active='n';render();setMode('write')})()`).then(()=>wait(250));
  // caret at `offset` inside the text of the element matching `selector`
  const caret=(selector,offset=0)=>evaluate(`(()=>{const node=document.querySelector('.rich-text '+${JSON.stringify(selector)});node.closest('.rich-text').focus();let text=node;while(text.firstChild)text=text.firstChild;const r=document.createRange();r.setStart(text,${offset});r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`).then(()=>wait(60));
  const codes={Tab:9,Backspace:8,Enter:13};
  const press=(key,shift=false)=>call('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code:key,windowsVirtualKeyCode:codes[key],modifiers:shift?8:0},sessionId)
    .then(()=>key==='Enter'?call('Input.dispatchKeyEvent',{type:'char',key,text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13},sessionId):null)
    .then(()=>call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:codes[key],modifiers:shift?8:0},sessionId)).then(()=>wait(100));
  const depths=()=>evaluate(`[...document.querySelector('.rich-text').children].map(line=>line.dataset.indent||'0').join(',')`);
  const saved=()=>evaluate(`current().blocks[0].html`);

  // A note with a brace over three bullets, a side note, a red-and-blue square and a triangle holding an equation.
  await evaluate(`(async()=>{${String.raw`const wait = ms => new Promise(r => setTimeout(r, ms));
document.querySelector('#launch-screen')?.remove();
const html = '<h2 data-passage-id="h">Request handling</h2>' +
  '<p data-passage-id="p1">Every handler reads from the network, so nothing it receives can be taken at face value.</p>' +
  '<ul><li data-passage-id="b1">Parse the request body as JSON</li><li data-passage-id="b2">Look up the user by the id field</li><li data-passage-id="b3">Run the query string as given</li></ul>' +
  '<p data-passage-id="p2">The fix is to validate at the edge and keep the core trusting nothing.</p>' +
  '<p data-passage-id="p3">Energy and mass trade off at the speed of light.</p>' +
  '<div class="equation display-equation" data-equation="E=mc^2" contenteditable="false">E=mc^2</div>' +
  '<p data-passage-id="p4">After that, the rest of the note continues as ordinary text so we can see how the page flows around the drawings.</p>';
state.notes = [{id: 'n', title: 'Security notes', updated: Date.now(), pinned: false, nodes: [], blocks: [{id: 'a', type: 'text', text: 'x', html}],
  annotations: [
    {id: 'br', kind: 'brace', from: 'b1', to: 'b3', text: 'All three assume the input is trusted', dx: 0, dy: 0},
    {id: 'bu', kind: 'bubble', from: 'p1', side: 'right', x: 40, dy: 0, text: 'Ask about this in office hours'},
    {id: 'sq', kind: 'shape', form: 'rect', from: 'p2', side: 'right', x: 20, dy: 0, w: 150, h: 70, text: 'Validate first', line: 'red', color: 'blue'},
    {id: 'tr', kind: 'shape', form: 'triangle', from: 'p3', side: 'right', x: 20, dy: 0, w: 130, h: 110, text: 'Units: $E=mc^2$', line: 'green'}
  ]}];
active = 'n'; render(); setMode('write'); await wait(400);

`}})()`);
  const parse=format=>evaluate(`(()=>{const html=NotivalExport.build(current(),${JSON.stringify(format)}).html;const d=new DOMParser().parseFromString(html,'text/html');window.exported=d;return d.body.innerHTML.length})()`);

  // ── PDF ──
  await parse('pdf');
  const q=js=>evaluate(`(()=>{const d=window.exported;return ${js}})()`);
  assert.equal(await q(`[...d.querySelectorAll('.pdf-brace .pdf-brace-lines li')].map(l=>l.textContent).join('|')`),'Parse the request body as JSON|Look up the user by the id field|Run the query string as given','the brace holds exactly its three bullets');
  assert.equal(await q(`d.querySelector('.pdf-brace .pdf-brace-label').textContent`),'All three assume the input is trusted');
  assert.equal(await q(`!!d.querySelector('.pdf-brace .pdf-brace-mark svg path')`),true,'with a } drawn beside them');
  assert.equal(await q(`d.querySelector('.pdf-anno-bubble').nextElementSibling.dataset.passageId`),'p1','the side note goes beside its paragraph');
  assert.equal(await q(`d.querySelector('.pdf-anno-bubble').textContent`),'Ask about this in office hours');
  const square=await q(`(()=>{const s=[...d.querySelectorAll('.pdf-anno-shape')].find(x=>x.textContent.includes('Validate'));return {next:s.nextElementSibling.dataset.passageId,stroke:s.querySelector('path').getAttribute('stroke'),text:s.querySelector('.pdf-anno-text').style.color,straight:/^M [\\d.]+ 0 H/.test(s.querySelector('path').getAttribute('d'))}})()`);
  assert.equal(square.next,'p2');assert.equal(square.stroke,'rgb(212, 72, 59)','red outline');assert.equal(square.text,'rgb(59, 111, 216)','blue writing');assert.equal(square.straight,true,'a straight-sided rectangle');
  assert.equal(await q(`!![...d.querySelectorAll('.pdf-anno-shape')].find(x=>x.textContent.includes('Units'))?.querySelector('.katex')`),true,'maths in a shape is typeset');
  assert.match(await q(`d.head.querySelector('style').textContent`),/\.pdf-anno\{float:right/,'the page knows how to place them');
  assert.equal(await q(`d.querySelectorAll('.anno,.anno-layer,[contenteditable]').length`),0,'nothing from the editor leaks into the page');
  // The editor itself is untouched by exporting.
  assert.equal(await evaluate(`document.querySelectorAll('#editor .pdf-anno,#editor .pdf-brace').length`),0);

  // ── Word: no drawings, but every note is kept as an aside under its line ──
  await parse('docx');
  assert.equal(await q(`d.querySelectorAll('.pdf-anno,.pdf-brace').length`),0);
  assert.equal(await q(`[...d.querySelectorAll('.pdf-aside')].map(p=>p.textContent).join('|')`),'— Ask about this in office hours|} All three assume the input is trusted|— Validate first|— Units: $E=mc^2$');
  console.log('Export annotation tests passed');
}finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
