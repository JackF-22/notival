import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-procedure-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),20000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.PROCEDURE_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof ProcedureBox!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const text=sel=>evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent||''`);
  const count=sel=>evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  const beam=`Algorithm: Beam Search
Input: Beam width $k$, language model $p_{LM}$, vocabulary $\\Sigma$, max length $L_{\\max}$
Output: Best completed sequence

Initialize beam <- {(ε, 0)}  // start with empty sequence and score 0
Initialize completed <- ∅  // store finished sequences
while True do
  candidates <- ∅
  foreach (x, s) ∈ beam do
    foreach y ∈ Σ do
      xy <- x + y
      s' <- s + log p(y | x)
      candidates <- candidates ∪ {(xy, s')}  // extend each hypothesis
  beam <- top-k(candidates)`;
  const open=md=>evaluate(`(()=>{const md=${JSON.stringify(md)};state.notes=[{id:'n',title:'Procedures',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'a',type:'text',text:md,html:RichEditor.fromMarkdown(md)}]}];active='n';render();setMode('write')})()`).then(()=>wait(300));
  const markdown=()=>evaluate(`RichEditor.toMarkdown(document.querySelector('.rich-text'))`);

  // ── A procedure in the note is drawn like the paper's algorithm box ──
  await open('Before.\n\n```procedure\n'+beam+'\n```\n\nAfter.');
  assert.equal(await count('#editor .procedure'),1);
  assert.equal(await text('.procedure .proc-title'),'Algorithm 1 Beam Search');
  assert.equal(await evaluate(`document.querySelector('.procedure .proc-title b').textContent`),'Algorithm 1');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.procedure .proc-io b')].map(b=>b.textContent)`),['Input:','Output:']);
  assert.equal(await evaluate(`document.querySelectorAll('.procedure .proc-head .katex').length>=3`),true,'maths in the header is typeset');
  assert.equal(await count('.procedure .proc-line'),10);
  assert.equal(await count('.procedure .proc-block'),3,'nested steps get guide lines');
  assert.equal(await evaluate(`[...document.querySelectorAll('.procedure .proc-line')].find(l=>l.textContent.includes('while')).innerHTML.includes('<b>while</b> <i>True</i> <b>do</b>')`),true);
  assert.equal(await evaluate(`document.querySelector('.procedure').textContent.includes('beam ← {(ε, 0)}')`),true,'<- is an arrow');
  assert.equal(await count('.procedure .proc-comment'),3);
  const look=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.procedure')),t=getComputedStyle(document.querySelector('.procedure .proc-title')),b=document.querySelector('.procedure .proc-block'),c=getComputedStyle(b),k=getComputedStyle(document.querySelector('.procedure .proc-comment'));
    return {top:s.borderTopWidth,bg:s.backgroundColor,titleRule:t.borderBottomWidth,guide:c.borderLeftWidth,serif:/Times|STIX|Latin/.test(s.fontFamily),mono:/mono|Menlo|SF/i.test(k.fontFamily),editable:document.querySelector('.procedure').getAttribute('contenteditable')}})()`);
  assert.deepEqual(look,{top:'2px',bg:'rgba(0, 0, 0, 0)',titleRule:'1px',guide:'1px',serif:true,mono:true,editable:'false'});
  assert.equal(await evaluate(`document.querySelectorAll('#editor .rich-text > *')[2]?.tagName`),'P','there is a line after it to keep typing in');
  await shot('box');

  // ── It is saved as a fenced block of the steps, and comes back the same ──
  const saved=await markdown();
  assert.equal(saved,'Before.\n\n```procedure\n'+beam+'\n```\n\nAfter.');
  assert.equal(await evaluate(`RichEditor.toMarkdown(Object.assign(document.createElement('div'),{innerHTML:RichEditor.fromMarkdown(${JSON.stringify(saved)})}))`),saved,'Markdown round trip');
  const cleaned=await evaluate(`RichEditor.cleanHTML(document.querySelector('.rich-text').innerHTML)`);
  assert.equal(cleaned.includes('data-procedure="Algorithm: Beam Search'),true);assert.equal(cleaned.includes('proc-line'),false,'only the steps are stored, not the drawing');
  // columns and other fences are not confused with it
  assert.equal(await evaluate(`RichEditor.fromMarkdown('\`\`\`js\\nlet a;\\n\`\`\`').includes('<pre>')`),true);

  // ── Double-click to edit; the preview follows what you type ──
  await evaluate(`document.querySelector('#editor .procedure').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}))`);await wait(200);
  assert.equal(await evaluate(`document.querySelector('.procedure-dialog')?.open`),true);
  assert.equal(await evaluate(`document.querySelector('.proc-source').value===${JSON.stringify(beam)}`),true,'the steps as written');
  assert.equal(await evaluate(`document.querySelector('.proc-preview .proc-title').textContent`),'Algorithm 1 Beam Search');
  await evaluate(`(()=>{const f=document.querySelector('.proc-source');f.value=f.value.replace('Beam Search','Greedy Search');f.dispatchEvent(new Event('input'))})()`);
  assert.equal(await text('.proc-preview .proc-title'),'Algorithm 1 Greedy Search','live preview');
  await evaluate(`(()=>{const c=document.querySelector('.proc-actions input');c.click()})()`);
  assert.equal(await count('.proc-preview .proc-no'),10,'line numbers on request');
  await shot('editing');
  await evaluate(`[...document.querySelectorAll('.procedure-dialog button')].find(b=>b.textContent==='Done').click()`);await wait(200);
  assert.equal(await text('#editor .procedure .proc-title'),'Algorithm 1 Greedy Search');
  assert.equal(await count('#editor .procedure .proc-no'),10);
  assert.match(await markdown(),/```procedure numbered\nAlgorithm: Greedy Search/);
  assert.equal(await evaluate(`document.querySelector('.procedure-dialog')`),null);
  // Cancel keeps things as they were
  await evaluate(`document.querySelector('#editor .procedure .proc-edit').click()`);await wait(150);
  await evaluate(`(()=>{const f=document.querySelector('.proc-source');f.value='changed';f.dispatchEvent(new Event('input'))})()`);
  await evaluate(`[...document.querySelectorAll('.procedure-dialog button')].find(b=>b.textContent==='Cancel').click()`);await wait(150);
  assert.equal(await text('#editor .procedure .proc-title'),'Algorithm 1 Greedy Search');

  // ── Writing steps: Tab, Shift-Tab and Enter shape the indentation ──
  await open('Notes');
  await evaluate(`document.querySelector('.rich-text').focus();RichEditor.command('procedure')`);await wait(250);
  assert.equal(await evaluate(`document.querySelector('.procedure-dialog')?.open`),true,'Procedure from the command opens the editor');
  assert.equal(await count('#editor .procedure'),1,'an empty box is waiting in the note');
  const key=(k,extra={})=>evaluate(`(()=>{const f=document.querySelector('.proc-source');const e=new KeyboardEvent('keydown',{key:${JSON.stringify(k)},bubbles:true,cancelable:true,...${JSON.stringify(extra)}});f.dispatchEvent(e);return f.value})()`);
  const field=(value,start=value.length,end=start)=>evaluate(`(()=>{const f=document.querySelector('.proc-source');f.value=${JSON.stringify(value)};f.setSelectionRange(${start},${end});f.dispatchEvent(new Event('input'))})()`);
  await field('while x > 0 do');
  assert.equal(await key('Enter'),'while x > 0 do\n  ','Enter after "do" indents');
  await field('while x > 0 do\n  if x > 3 then');
  assert.equal(await key('Enter'),'while x > 0 do\n  if x > 3 then\n    ','…and deeper after "then"');
  await field('  x <- 1');
  assert.equal(await key('Enter'),'  x <- 1\n  ','a plain step keeps the indent');
  await field('step');
  assert.equal(await key('Tab'),'step  ','Tab at the end of a line adds an indent');
  await field('a\nb\nc',0,5);
  assert.equal(await key('Tab'),'  a\n  b\n  c','Tab on several lines nests them all');
  assert.equal(await key('Tab',{shiftKey:true}),'a\nb\nc','Shift-Tab takes it back');
  // Cancel on a new box removes it
  await evaluate(`[...document.querySelectorAll('.procedure-dialog button')].find(b=>b.textContent==='Cancel').click()`);await wait(200);
  assert.equal(await count('#editor .procedure'),0,'cancelling a new procedure leaves nothing behind');

  // ── New box, written and finished with ⌘↵ ──
  await evaluate(`document.querySelector('.rich-text').focus();document.querySelector('#insert-procedure').click()`);await wait(250);
  assert.equal(await evaluate(`document.querySelector('.proc-source').value.startsWith('Algorithm: Name')`),true,'a starting point to edit');
  await field('Algorithm: Sum\nInput: a list\nOutput: its total\n\ntotal <- 0\nforeach x ∈ list do\n  total <- total + x\nreturn total');
  await key('Enter',{metaKey:true});await wait(250);
  assert.equal(await text('#editor .procedure .proc-title'),'Algorithm 1 Sum');
  assert.equal(await evaluate(`document.querySelector('.rich-text').lastElementChild.tagName`),'P');
  assert.match(await markdown(),/```procedure\nAlgorithm: Sum/);

  // ── Several boxes number themselves through the note ──
  await open('```procedure\nAlgorithm: First\nx <- 1\n```\n\ntext\n\n```procedure\nProcedure: Second\ny <- 2\n```\n\n```procedure\nAlgorithm: Third\nz <- 3\n```');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#editor .proc-title')].map(t=>t.textContent)`),['Algorithm 1 First','Procedure 2 Second','Algorithm 3 Third']);
  // deleting one renumbers the rest, from the keyboard
  await evaluate(`document.querySelector('#editor .procedure').focus()`);
  await evaluate(`document.querySelector('#editor .procedure').dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}))`);await wait(250);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#editor .proc-title')].map(t=>t.textContent)`),['Procedure 1 Second','Algorithm 2 Third']);
  // Enter on a focused box opens it
  await evaluate(`document.querySelector('#editor .procedure').focus();document.querySelector('#editor .procedure').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);await wait(200);
  assert.equal(await evaluate(`document.querySelector('.procedure-dialog')?.open`),true,'the box can be opened from the keyboard');
  await evaluate(`[...document.querySelectorAll('.procedure-dialog button')].find(b=>b.textContent==='Delete').click()`);await wait(200);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#editor .proc-title')].map(t=>t.textContent)`),['Algorithm 1 Third'],'Delete removes it and the next one renumbers');

  // ── A procedure inside columns, and an empty one ──
  await open(':::columns\n\n:::col\n\nLeft\n\n:::col\n\n```procedure\nAlgorithm: Side\nx <- 1\n```\n\n:::\n\nAfter');
  assert.equal(await count('.cols .col .procedure'),1);
  assert.match(await markdown(),/:::col\n\n```procedure\nAlgorithm: Side\nx <- 1\n```\n\n:::/);
  await open('```procedure\n\n```');
  assert.equal(await markdown(),'','an empty procedure leaves no trace');

  // ── Export draws it numbered, without the editing controls ──
  await open('Intro\n\n```procedure numbered\nAlgorithm: Export Me\nInput: a\n\nx <- 1\nif x > 0 then\n  y <- 2\n```');
  const exported=await evaluate(`NotivalExport.build(current(),'pdf').html`);
  assert.match(exported,/<b>Algorithm 1<\/b> Export Me/);assert.match(exported,/class="proc-no"/);assert.match(exported,/<b>if<\/b> x &gt; 0 <b>then<\/b>/);
  assert.equal(exported.includes('<button class="proc-edit"'),false,'no edit button on paper');assert.match(exported,/\.procedure\{/,'print styles are included');
  await shot('exported-source');

  // ── Moving lines around it and copying ──
  assert.equal(await evaluate(`(()=>{const rich=document.querySelector('.rich-text');rich.insertAdjacentHTML('beforeend','<ul><li>after</li></ul>');return LineColumns.followers(document.querySelector('.procedure')).length})()`),0,'bullets after a procedure are not its bullets');

  console.log('PASS: procedures — drawn like a paper algorithm, saved as a fenced block, edited with a live preview, smart indentation, numbering across the note, keyboard access, columns, export.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
