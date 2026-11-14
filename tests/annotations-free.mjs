import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-annofree-');
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
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
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

  const mouse=(type,x,y)=>call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:type==='mousePressed'?1:0,clickCount:1},sessionId);
  const drag=async(from,to,steps=8)=>{await mouse('mouseMoved',...from);await wait(50);await mouse('mousePressed',...from);for(let i=1;i<=steps;i++){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:from[0]+(to[0]-from[0])*i/steps,y:from[1]+(to[1]-from[1])*i/steps,button:'left',buttons:1},sessionId);await wait(16)}await mouse('mouseReleased',...to);await wait(150)};
  const click=async(x,y)=>{await mouse('mouseMoved',x,y);await wait(40);await mouse('mousePressed',x,y);await mouse('mouseReleased',x,y);await wait(150)};
  const type=text=>call('Input.insertText',{text},sessionId).then(()=>wait(120));
  const key=async(k,code,vk,mods=0)=>{await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:k,code,windowsVirtualKeyCode:vk,modifiers:mods},sessionId);if(k==='Enter'&&!mods)await call('Input.dispatchKeyEvent',{type:'char',key:k,text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:vk,modifiers:mods},sessionId);await wait(120)};
  const shortcut=(code,k,shift=false)=>evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(k)},code:${JSON.stringify(code)},metaKey:true,shiftKey:${shift},bubbles:true,cancelable:true}))`).then(()=>wait(120));
  const resize=width=>call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},sessionId).then(()=>wait(300));
  const shots=process.env.ANNO_SHOTS;
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const rect=selector=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)return null;const b=n.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}})()`);
  const centreOf=r=>[r.left+r.width/2,r.top+r.height/2];
  const annotations=()=>evaluate(`JSON.stringify(current().annotations||[])`).then(JSON.parse);
  // Paragraphs by their opening words, so lines added above don't shift which one is meant.
  const opening=['TCP','The window','Congestion control'];
  const pick=n=>`[...document.querySelectorAll('.rich-text > *')].find(l=>l.textContent.startsWith(${JSON.stringify(opening[n]??'')}))`;
  const inkTop=n=>evaluate(`(()=>{const l=${pick(n)};const r=document.createRange();r.selectNodeContents(l);return r.getClientRects()[0].top})()`);
  const inkRight=n=>evaluate(`(()=>{const l=${pick(n)};const r=document.createRange();r.selectNodeContents(l);return Math.max(...[...r.getClientRects()].map(x=>x.right))})()`);
  const active=()=>evaluate(`document.activeElement.className`);

  await resize(1440);
  await open('<h2>Transport layer</h2><p>TCP retransmits lost segments.</p><p>The window shrinks when the receiver is slow.</p><p>Congestion control is separate from flow control.</p><ul><li>Slow start</li><li>Congestion avoidance</li></ul>');
  const block=await rect('#editor > .block');

  // ── A side note: click in the blank margin beside a paragraph and type ──
  const pY=(await inkTop(1))+10;
  await mouse('mouseMoved',block.right+70,pY);await wait(80);
  assert.equal(await evaluate(`document.querySelector('article').classList.contains('anno-margin')`),true,'the margin beside text shows a text cursor');
  await click(block.right+70,pY);
  assert.equal((await annotations()).length,1);
  assert.match(await active(),/anno-label/,'straight into typing');
  await type('Ask about this in office hours');
  await key('Enter','Enter',13);
  assert.match(await active(),/rich-text/,'Enter goes back to the note');
  let [bubble]=await annotations();
  assert.equal(bubble.kind,'bubble');assert.equal(bubble.text,'Ask about this in office hours');
  let b=await rect('.anno-bubble .anno-frame');
  assert.ok(b.left>(await inkRight(1))+8,'the note sits beside the paragraph, clear of its words');
  assert.ok(Math.abs(b.top-(pY-10))<6,'where it was clicked');
  assert.equal(await evaluate(`document.querySelectorAll('.anno-bubble .anno-leader path').length`),1,'a faint lead line joins it to the line');
  await shot('1-side-note');

  // A stray click in the margin leaves nothing behind.
  await click(block.right+60,(await inkTop(2))+8);
  assert.equal((await annotations()).length,2);
  await click(...centreOf(await rect('.rich-text > p:last-of-type')));
  assert.equal((await annotations()).length,1,'an empty side note goes away');

  // ── Text above: the note moves down with its paragraph ──
  const gap=b.top-(await inkTop(1));
  await evaluate(`(()=>{const h=document.querySelector('.rich-text h2');h.closest('.rich-text').focus();const r=document.createRange();r.setStart(h.firstChild,h.firstChild.length);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await key('Enter','Enter',13);
  await type('Added later: the transport layer sits between the application and the network, and this sentence is long enough to wrap onto a second line.');
  await wait(120);
  b=await rect('.anno-bubble .anno-frame');
  assert.ok(Math.abs((b.top-(await inkTop(1)))-gap)<3,'same place beside the same paragraph');

  // ── Drag it next to another paragraph: it pins itself there ──
  const before=(await annotations())[0].from;
  const target=(await inkTop(2))+4;
  await drag(centreOf(b),[b.left+b.width/2+20,target+b.height/2]);
  assert.notEqual((await annotations())[0].from,before,'pinned to the paragraph it was moved beside');
  await shortcut('KeyZ','z');
  assert.equal((await annotations())[0].from,before,'⌘Z moves it back');

  // ── Click the note later to edit it ──
  await click(...centreOf(await rect('.anno-bubble .anno-label')));
  assert.match(await active(),/anno-label/);
  await type(' (Tue 2pm)');await key('Escape','Escape',27);
  assert.equal((await annotations())[0].text,'Ask about this in office hours (Tue 2pm)');

  // Sketch a loop with the pointer: an oval (or a lopsided one) around a centre, ⌘ held if asked.
  const META=4;
  const sketch=async(cx,cy,rx,ry,{meta=false,wobble=0,turns=1}={})=>{
    const steps=36,mods=meta?META:0,point=i=>{const t=i/steps*Math.PI*2*turns;return [cx+rx*Math.cos(t)*(1+wobble*Math.sin(3*t)),cy+ry*Math.sin(t)]};
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:point(0)[0],y:point(0)[1],button:'none',modifiers:mods},sessionId);await wait(30);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x:point(0)[0],y:point(0)[1],button:'left',buttons:1,clickCount:1,modifiers:mods},sessionId);
    for(let i=1;i<=steps;i++){const [x,y]=point(i);await call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'left',buttons:1,modifiers:mods},sessionId);await wait(8)}
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point(steps)[0],y:point(steps)[1],button:'left',buttons:0,clickCount:1,modifiers:mods},sessionId);await wait(150);
  };
  const metaDown=()=>call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Meta',code:'MetaLeft',windowsVirtualKeyCode:91,modifiers:META},sessionId);
  const metaUp=()=>call('Input.dispatchKeyEvent',{type:'keyUp',key:'Meta',code:'MetaLeft',windowsVirtualKeyCode:91,modifiers:0},sessionId);
  const drawing=()=>evaluate(`document.body.classList.contains('anno-drawing')`);

  // ── ⌘ pressed with another key is a shortcut, not drawing ──
  await metaDown();await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'c',code:'KeyC',windowsVirtualKeyCode:67,modifiers:META},sessionId);await wait(400);
  assert.equal(await drawing(),false,'⌘C never switches drawing on');
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'c',code:'KeyC',windowsVirtualKeyCode:67,modifiers:META},sessionId);await metaUp();await wait(50);

  // ── Hold ⌘: drawing comes on. Sketch an oval beside the heading; it becomes a bubble of that shape ──
  await metaDown();await wait(400);
  assert.equal(await drawing(),true,'holding ⌘ turns drawing on');
  assert.match(await evaluate(`document.querySelector('.anno-sketch-hint').textContent`),/let go of ⌘/);
  const top=(await rect('.rich-text h2')).top,right=(await rect('.rich-text')).right;
  await sketch(right-130,top+20,95,34,{meta:true});
  await shot('2-sketching');
  let all=await annotations();
  assert.equal(all.length,2);const shape=all[1];
  assert.equal(shape.kind,'shape');assert.equal(shape.form,'ellipse','a rough oval becomes a true oval');assert.ok(shape.w>=180&&shape.h>=60,'the size it was drawn: '+JSON.stringify(shape));
  assert.match(await active(),/anno-label/,'straight into writing inside it');
  await metaUp();await wait(50);
  assert.equal(await drawing(),false,'letting go of ⌘ stops drawing');
  await type('Remember $E=mc^2$ units');await key('Enter','Enter',13);
  assert.equal((await annotations())[1].text,'Remember $E=mc^2$ units');
  assert.equal(await evaluate(`!!document.querySelector('.anno-shape .anno-label .katex')`),true,'the equation is typeset');
  // The writing sits inside the outline.
  const fits=await evaluate(`(()=>{const f=document.querySelector('.anno-shape .anno-frame').getBoundingClientRect(),s=document.querySelector('.anno-shape-ink').getBoundingClientRect();return f.left>=s.left&&f.right<=s.right&&f.top>=s.top&&f.bottom<=s.bottom})()`);
  assert.equal(fits,true,'the text is inside the shape');
  await shot('3-shape');

  // More words than room: the shape grows taller to hold them.
  const small=await rect('.anno-shape-ink'),area=small.width*small.height;
  await click(...centreOf(await rect('.anno-shape .anno-label')));
  await type(' and check the dimensions on both sides of every equation before moving on');await key('Enter','Enter',13);
  const after=await rect('.anno-shape-ink');assert.ok(after.width*after.height>area*1.2&&after.width>=small.width,'grew to fit, keeping its proportions: '+JSON.stringify([small.width,small.height,after.width,after.height]));

  // Resize it by its corner.
  await mouse('mouseMoved',...centreOf(await rect('.anno-shape .anno-frame')));await wait(50);
  const corner=await evaluate(`(()=>{const c=document.querySelector('.anno-shape .anno-corner').getBoundingClientRect();return [c.left+5,c.top+5]})()`);
  await drag(corner,[corner[0]+30,corner[1]+20]);
  assert.ok((await annotations())[1].w>=shape.w+25,'wider');

  // ── A drag round a loop in blank page (below the note) draws a shape too, no key needed ──
  const below=(await rect('#add-bar'))?.bottom||(await rect('#editor')).bottom;
  await sketch(block.left+140,below+60,100,36,{wobble:.15});
  all=await annotations();assert.equal(all.length,3);assert.equal(all[2].kind,'shape');
  await type('Two phases');await key('Enter','Enter',13);
  // A stray scribble that doesn't go round anything is let go.
  await metaDown();await wait(350);
  await drag([block.left+60,below+140],[block.left+260,below+150]);
  assert.equal((await annotations()).length,3,'a line is not a shape');
  // A rough, wobbly square (still holding ⌘) becomes a stock square: straight sides, equal width and height.
  const corners=(points,jitter)=>{const out=[];for(let i=0;i<points.length;i++){const [ax,ay]=points[i],[bx,by]=points[(i+1)%points.length];for(let t=0;t<1;t+=1/12)out.push([ax+(bx-ax)*t+jitter*Math.sin(out.length*1.7),ay+(by-ay)*t+jitter*Math.cos(out.length*2.3)])}out.push(points[0]);return out};
  const trace=async(path)=>{
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x:path[0][0],y:path[0][1],button:'left',buttons:1,clickCount:1,modifiers:META},sessionId);
    for(const [x,y] of path.slice(1)){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'left',buttons:1,modifiers:META},sessionId);await wait(6)}
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:path.at(-1)[0],y:path.at(-1)[1],button:'left',buttons:0,clickCount:1,modifiers:META},sessionId);await wait(150);
  };
  const sx=block.left+420,sy=below+40;
  await trace(corners([[sx,sy],[sx+92,sy+4],[sx+88,sy+86],[sx-3,sy+90]],3));
  let square=(await annotations()).at(-1);
  assert.equal(square.form,'rect','a rough square becomes a rectangle');
  assert.equal(square.w,square.h,'and a true square: '+JSON.stringify(square));
  assert.match(await evaluate(`document.querySelector('.anno[data-id="${square.id}"] .anno-shape-line').getAttribute('d')`),/ H .* V .* H .* V /,'drawn with straight sides');
  await key('Escape','Escape',27);
  assert.equal((await annotations()).length,3,'Esc on an empty new shape takes it away again');
  await trace(corners([[sx,sy],[sx+92,sy+4],[sx+88,sy+86],[sx-3,sy+90]],3));
  await type('Square');await key('Enter','Enter',13);
  // A rough triangle becomes a triangle.
  await trace(corners([[sx+200,sy+90],[sx+252,sy-4],[sx+300,sy+88]],2.5));
  assert.equal((await annotations()).at(-1).form,'triangle');
  await type('Tri');await key('Enter','Enter',13);
  await metaUp();await wait(50);
  await shot('4b-stock-shapes');

  // ── ⋯ chooses the shape, the outline colour and the text colour, separately ──
  square=(await annotations()).find(a=>a.text==='Square');
  const host=`.anno[data-id="${square.id}"]`;
  await mouse('mouseMoved',...centreOf(await rect(host+' .anno-frame')));await wait(60);
  await evaluate(`document.querySelector('${host} .anno-more').click()`);await wait(60);
  assert.equal(await evaluate(`[...document.querySelectorAll('.anno-style-menu .anno-style-title')].map(t=>t.textContent).join('|')`),'Shape|Outline|Text');
  await evaluate(`document.querySelector('.anno-style-menu [data-field=line][data-value=red]').click()`);await wait(60);
  await evaluate(`document.querySelector('.anno-style-menu [data-field=color][data-value=blue]').click()`);await wait(80);
  await shot('4c-colours');
  square=(await annotations()).find(a=>a.id===square.id);
  assert.equal(square.line,'red');assert.equal(square.color,'blue');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${host} .anno-shape-line')).stroke`),'rgb(212, 72, 59)','the outline is red');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${host} .anno-label')).color`),'rgb(59, 111, 216)','the writing is blue');
  assert.equal(await evaluate(`document.querySelector('.anno-style-menu [data-field=line][data-value=red]').classList.contains('current')`),true,'the choice is marked');
  // Change the shape from the menu; ⌘Z puts it back.
  await evaluate(`document.querySelector('.anno-style-menu [data-field=form][data-value=diamond]').click()`);await wait(80);
  assert.equal((await annotations()).find(a=>a.id===square.id).form,'diamond');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await wait(40);
  assert.equal(await evaluate(`!!document.querySelector('.anno-style-menu')`),false,'Esc closes the menu');
  await shortcut('KeyZ','z');
  assert.equal((await annotations()).find(a=>a.id===square.id).form,'rect','⌘Z undoes the change of shape');
  // Back to the pencil default.
  await evaluate(`document.querySelector('${host} .anno-more').click()`);await wait(60);
  await evaluate(`document.querySelector('.anno-style-menu [data-field=line][data-value=pencil]').click()`);await wait(60);
  assert.equal((await annotations()).find(a=>a.id===square.id).line,undefined);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  // Tidy up: these two aren't part of the narrow-window and reopening checks below.
  await evaluate(`(()=>{const n=current();n.annotations=n.annotations.filter(a=>!['Square','Tri'].includes(a.text));persist();window.marginAnnotations.draw()})()`);
  // A plain drag over text still selects text.
  const para=await rect('.rich-text > p:last-of-type');
  await drag([para.left+5,para.top+8],[para.left+120,para.top+8]);
  assert.ok((await evaluate(`getSelection().toString()`)).length>5,'dragging over text selects it');
  assert.equal((await annotations()).length,3);
  await shot('4-shapes');

  // ── ⌘' puts a side note beside the line the caret is on ──
  await evaluate(`(()=>{const p=${pick(2)};p.closest('.rich-text').focus();const r=document.createRange();r.setStart(p.firstChild,4);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await shortcut('Quote',"'");
  assert.equal((await annotations()).length,4);assert.match(await active(),/anno-label/);
  await type('Flow ≠ congestion');await key('Enter','Enter',13);

  // ── Narrow window: side notes without room fold into badges you can open ──
  await resize(860);
  const tucked=await evaluate(`[...document.querySelectorAll('.anno')].map(a=>a.className.replace('anno ','')).join('|')`);
  assert.match(tucked,/anno-bubble tucked/,'side notes fold away: '+tucked);
  await shot('5-narrow');
  await click(...centreOf(await rect('.anno-bubble.tucked .anno-badge')));
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.anno-bubble.tucked.open .anno-frame')).display`),'block');
  assert.match(await evaluate(`document.querySelector('.anno-bubble.open .anno-label').innerText`),/office hours|Flow/);
  await shot('6-narrow-open');
  await click(20,880);
  // Nothing that's shown sits on the words.
  const overlaps=await evaluate(`(()=>{const words=[...document.querySelectorAll('.rich-text > p, .rich-text li, .rich-text h2')].flatMap(l=>{const r=document.createRange();r.selectNodeContents(l);return [...r.getClientRects()]});
    return [...document.querySelectorAll('.anno-bubble:not(.tucked) .anno-frame')].filter(f=>{const b=f.getBoundingClientRect();return words.some(w=>w.right>b.left&&w.left<b.right&&w.bottom>b.top&&w.top<b.bottom)}).length})()`);
  assert.equal(overlaps,0,'no side note covers text when narrow');
  await resize(1440);
  assert.equal(await evaluate(`document.querySelectorAll('.anno.tucked').length`),0,'wide again: all back in place');

  // ── Reopen ──
  await evaluate(`(()=>{const saved=JSON.stringify(state.notes);state.notes=[];render();state.notes=JSON.parse(saved);active=state.notes[0].id;render();setMode('write')})()`);await wait(300);
  assert.equal(await evaluate(`document.querySelectorAll('.anno:not([hidden])').length`),4,'all four come back');
  assert.equal(await evaluate(`!!document.querySelector('.anno-shape .katex')`),true);
  await shot('7-reopened');

  // ── Remove a shape, undo ──
  await mouse('mouseMoved',...centreOf(await rect('.anno-shape .anno-frame')));await wait(60);
  await evaluate(`document.querySelector('.anno-shape .anno-remove').click()`);await wait(80);
  assert.equal((await annotations()).length,3);
  await shortcut('KeyZ','z');
  assert.equal((await annotations()).length,4);

  // ── "Mark up" in the format bar lists all three ──
  await evaluate(`document.querySelector('.format-markup').click()`);await wait(60);
  assert.equal(await evaluate(`[...document.querySelectorAll('.block-menu button')].map(b=>[...b.childNodes].filter(n=>!n.classList?.contains('anno-keys')).map(n=>n.textContent).join('')).join('|')`),'◯Draw a shape to write in|}Brace the selected lines|“Side note beside this line');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await evaluate(`state.notes[0].nodes.length`),0,'nothing goes to the mind map');
  console.log('Side note and box tests passed');
}finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
