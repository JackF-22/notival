import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-equation-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),15000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.EQUATION_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof RichEditor!=="undefined" && typeof katex!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`(()=>{
    const md='The quadratic formula gives both roots of the equation.\\n\\n$$x=\\\\frac{-b\\\\pm\\\\sqrt{b^2-4ac}}{2a}$$\\n\\nIt follows that the discriminant decides how many real roots there are.';
    state.notes=[{id:'n',title:'Equations',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'a',type:'text',text:md,html:RichEditor.fromMarkdown(md)}]}];
    active='n';render();setMode('write');
  })()`);
  await wait(300);
  assert.equal(await evaluate(`document.querySelectorAll('.display-equation').length`),1);

  const style=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.display-equation'));return {bg:s.backgroundColor,border:s.borderTopWidth,pad:s.paddingTop,mt:s.marginTop}})()`);
  assert.equal(style.bg,'rgba(0, 0, 0, 0)','display equation has no background');
  assert.equal(style.border,'0px','display equation has no border');
  assert(parseFloat(style.pad)<=2,'tight padding: '+style.pad);

  // The visible gap between the line above, the equation, and the line below
  const gaps=await evaluate(`(()=>{
    const rich=document.querySelector('.rich-text'),eq=rich.querySelector('.display-equation .katex'),box=eq.getBoundingClientRect();
    const kids=[...rich.children],at=kids.indexOf(rich.querySelector('.display-equation')),above=kids[at-1].getBoundingClientRect(),below=kids[at+1].getBoundingClientRect();
    return {above:Math.round(box.top-above.bottom),below:Math.round(below.top-box.bottom),height:Math.round(box.height)}
  })()`);
  assert(gaps.above<=14&&gaps.below<=14,'equation sits close to its neighbours: '+JSON.stringify(gaps));
  await shot('display-equation');

  // Every common way of writing math in Markdown becomes the right kind of equation
  await evaluate(`(()=>{
    const md=[
      'Ticket costs $5 and the deluxe one $10, but $a<b$ and $\\\\begin{pmatrix}a&b\\\\end{pmatrix}$ are math.',
      '',
      '$$E=mc^2$$',
      '',
      '\\\\[ \\\\int_0^1 x\\\\,dx = \\\\tfrac12 \\\\]',
      '',
      '\\\\begin{align}a&=b\\\\\\\\c&=d\\\\end{align}',
      '',
      '\\\\begin{multline}p\\\\\\\\q\\\\end{multline}',
      '',
      'Done.'
    ].join('\\n');
    current().blocks=[{id:'a',type:'text',text:md,html:RichEditor.fromMarkdown(md)}];render();setMode('write');
  })()`);
  await wait(300);
  assert.equal(await evaluate(`document.querySelectorAll('.display-equation').length`),4,'four display equations');
  assert.equal(await evaluate(`[...document.querySelectorAll('.inline-equation')].map(e=>e.dataset.equation).join('|')`),'a<b|\\begin{pmatrix}a&b\\end{pmatrix}','formula text is not double-escaped; prices are not math');
  assert.match(await evaluate(`document.querySelector('.rich-text p').textContent`),/costs \$5 and the deluxe one \$10/);
  assert.equal(await evaluate(`document.querySelectorAll('.katex-error').length`),0,'every environment renders');
  assert.equal(await evaluate(`RichEditor.toMarkdown(document.querySelector('.rich-text')).includes('$$\\nE=mc^2\\n$$')`),true,'saved back as ordinary Markdown');

  // A traced equation arrives tidied, and the first reading that actually renders wins
  await evaluate(`(()=>{const md='Intro line.';current().blocks=[{id:'a',type:'text',text:md,html:RichEditor.fromMarkdown(md)}];render();setMode('write');document.querySelector('.rich-text').focus();const r=document.createRange();const p=document.querySelector('.rich-text');r.selectNodeContents(p);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
  // (the traced equation opens in the live editor; Enter accepts it, as a person would)
  const accept=async()=>{await evaluate(`document.querySelector('.equation.editing .equation-source')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);await wait(150)};
  const caretAtEnd=()=>evaluate(`(()=>{const p=document.querySelector('.rich-text');p.focus();const r=document.createRange();r.selectNodeContents(p);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
  await evaluate(`marginPDFEquation({latex:'x ^ { 2 } + y ^ { 2 } = z ^ { 2 }'})`);await wait(200);
  assert.equal(await evaluate(`[...document.querySelectorAll('.display-equation')].at(-1)?.dataset.equation`),'x^2+y^2=z^2','spacing from recognition is closed up');
  await accept();await caretAtEnd();
  await evaluate(`marginPDFEquation({latex:'\\\\frac { a } { b ',candidates:['\\\\frac { a } { b }']})`);await wait(200);
  assert.equal(await evaluate(`[...document.querySelectorAll('.display-equation')].at(-1)?.dataset.equation`),'\\frac{a}{b}','a reading that cannot render is skipped for one that can');
  await accept();await caretAtEnd();
  await evaluate(`marginPDFEquation({latex:'\\\\alpha + \\\\beta',inline:true})`);await wait(200);
  assert.equal(await evaluate(`[...document.querySelectorAll('.inline-equation')].at(-1)?.dataset.equation`),'\\alpha+\\beta');
  await accept();

  // Hovering gives a faint cue, but only on hover
  await evaluate(`document.querySelector('.display-equation').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`);
  // Still looks like a box while it is being edited, so it is clear what is live
  await evaluate(`document.querySelector('.display-equation').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}))`);await wait(200);
  assert.equal(await evaluate(`!!document.querySelector('.display-equation.editing')`),true);
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.display-equation.editing')).backgroundColor`),'rgba(0, 0, 0, 0)');
  await shot('display-equation-editing');

  console.log('PASS: display equations are borderless and sit close to the text, still boxed while editing; every Markdown form of math parses (prices stay prices); traced equations arrive tidied and the first one that renders wins.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
