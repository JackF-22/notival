import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-linecols-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),20000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.LINE_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof LineColumns!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  const mouse=(type,x,y)=>call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:1},sessionId);
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  const open=html=>evaluate(`(()=>{state.notes=[{id:'n',title:'Lines',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'a',type:'text',text:'',html:${JSON.stringify(html)}}]}];active='n';render();setMode('write')})()`).then(()=>wait(250));
  const lines=()=>evaluate(`[...document.querySelectorAll('.rich-text')[0].querySelectorAll('p,h2')].map(p=>p.textContent)`);
  // where the columns are right now, as "A | B / C"
  const shape=()=>evaluate(`(()=>{const rich=document.querySelector('.rich-text');return [...rich.children].map(c=>c.classList.contains('cols')?[...c.children].map(col=>[...col.children].map(x=>x.textContent).join('+')).join(' | '):c.textContent).filter(Boolean).join(' / ')})()`);
  const point=(selector,index,fx,fy)=>evaluate(`(()=>{const r=[...document.querySelectorAll(${JSON.stringify(selector)})][${index}].getBoundingClientRect();return [r.left+r.width*${fx},r.top+r.height*${fy}]})()`);
  // hover a line so its handle shows, then grab the handle
  const grab=async(selector,index)=>{
    const [x,y]=await point(selector,index,.15,.5);await mouse('mouseMoved',x,y);await wait(150);
    assert.equal(await evaluate(`!document.querySelector('#block-handle').hidden`),true,'the handle is showing for the hovered line');
    const [hx,hy]=await evaluate(`(()=>{const r=document.querySelector('#block-handle').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    await mouse('mouseMoved',hx,hy);await wait(60);await mouse('mousePressed',hx,hy);return [hx,hy];
  };
  const dragTo=async(from,tx,ty,{release=true}={})=>{
    const [hx,hy]=from;
    for(let i=1;i<=8;i++)await mouse('mouseMoved',hx+(tx-hx)*i/8,hy+(ty-hy)*i/8);
    await wait(80);
    if(release){await mouse('mouseReleased',tx,ty);await wait(150)}
  };
  const dragLine=async(selector,index,targetSelector,targetIndex,fx,fy,opts)=>{const from=await grab(selector,index);const [tx,ty]=await point(targetSelector,targetIndex,fx,fy);await dragTo(from,tx,ty,opts)};

  await open('<p>Top line</p><p>Bottom line</p><p>Third line</p>');
  assert.equal(await shape(),'Top line / Bottom line / Third line');

  // ── Drag the bottom line to the right of the top line: columns, on the spot ──
  const from=await grab('.rich-text p',1);
  const [tx,ty]=await point('.rich-text p',0,.93,.5);
  await dragTo(from,tx,ty,{release:false});
  assert.equal(await evaluate(`!document.querySelector('.line-drop').hidden`),true,'a drop bar shows where it will land');
  assert.equal(await evaluate(`(()=>{const m=document.querySelector('.line-drop').getBoundingClientRect(),p=document.querySelectorAll('.rich-text p')[0].getBoundingClientRect();return m.height>=p.height-1&&m.left>=p.right-1})()`),true,'a vertical bar on the right edge');
  assert.equal(await evaluate(`document.querySelectorAll('.rich-text p')[1].classList.contains('line-moving')`),true,'the line being moved fades');
  await shot('dragging');
  await mouse('mouseReleased',tx,ty);await wait(200);
  assert.equal(await shape(),'Top line | Bottom line / Third line');
  assert.equal(await evaluate(`document.querySelector('.cols').dataset.n`),'2');
  assert.equal(await evaluate(`document.querySelector('.line-ghost')||document.querySelector('.line-drop')||document.body.classList.contains('line-dragging')`),false,'drag state is cleaned up');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.cols')).gridTemplateColumns.split(' ').length`),2,'laid out as two columns');
  const tops=await evaluate(`[...document.querySelectorAll('.cols .col p')].map(p=>Math.round(p.getBoundingClientRect().top)).join()`);
  assert.equal(new Set(tops.split(',')).size,1,'the two lines share a top edge: '+tops);
  await shot('two-columns');

  // ── It is saved as plain text and comes back the same ──
  const md=await evaluate(`current().blocks[0].text`);
  assert.equal(md,':::columns\n\n:::col\n\nTop line\n\n:::col\n\nBottom line\n\n:::\n\nThird line');
  assert.equal(await evaluate(`RichEditor.toMarkdown(Object.assign(document.createElement('div'),{innerHTML:RichEditor.fromMarkdown(${JSON.stringify(md)})}))`),md,'Markdown round trip');
  assert.equal(await evaluate(`(()=>{const html=current().blocks[0].html;return html.includes('class="cols"')&&html.includes('data-n="2"')})()`),true);
  await evaluate(`render();setMode('write')`);await wait(250);
  assert.equal(await shape(),'Top line | Bottom line / Third line','still columns after the cell is rebuilt');

  // ── A third column, then a fourth is refused ──
  await dragLine('.rich-text p',2,'.rich-text .col p',1,.93,.5);
  assert.equal(await shape(),'Top line | Bottom line | Third line');
  assert.equal(await evaluate(`document.querySelector('.cols').dataset.n`),'3');
  await evaluate(`(()=>{const rich=document.querySelector('.rich-text');rich.insertAdjacentHTML('beforeend','<p>Fourth line</p>');rich.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(150);
  const before=await shape();
  const fromFourth=await grab('.rich-text > p',0);
  const [rx,ry]=await point('.rich-text .col p',2,.93,.5);
  await dragTo(fromFourth,rx,ry,{release:false});
  assert.equal(await evaluate(`document.querySelector('.line-drop').classList.contains('is-refused')`),true,'a full row says no');
  await mouse('mouseReleased',rx,ry);await wait(150);
  assert.equal(await shape(),before,'nothing moved');

  // ── Stack inside a column: top half of a line in another column ──
  await dragLine('.rich-text .col p',0,'.rich-text .col p',1,.5,.8);
  assert.match(await shape(),/Bottom line\+Top line/);
  assert.match(await shape(),/^Bottom line\+Top line \| Third line \/ Fourth line$/,'the emptied column went away');

  // ── Menu: move out, put beside, stack all ──
  const openMenu=async text=>{
    const [x,y]=await evaluate(`(()=>{const r=[...document.querySelectorAll('.rich-text p')].find(p=>p.textContent===${JSON.stringify(text)}).getBoundingClientRect();return [r.left+r.width*.15,r.top+r.height/2]})()`);
    await mouse('mouseMoved',x,y);await wait(150);await evaluate(`document.querySelector('#block-handle').click()`);await wait(100);
  };
  const choose=text=>evaluate(`[...document.querySelectorAll('.block-menu button')].find(b=>b.textContent.includes(${JSON.stringify(text)})).click()`).then(()=>wait(150));
  await openMenu('Top line');
  assert.equal(await evaluate(`[...document.querySelectorAll('.block-menu button')].some(b=>/Move out of the columns/.test(b.textContent))`),true);
  await choose('Move out of the columns');
  assert.equal(await shape(),'Bottom line | Third line / Top line / Fourth line');
  await openMenu('Fourth line');
  await choose('Put beside the line above');
  assert.equal(await shape(),'Bottom line | Third line / Top line | Fourth line');
  await openMenu('Bottom line');
  await choose('Stack all the columns');
  assert.equal((await shape()).includes('|'),true,'only that group was stacked');
  assert.equal(await shape(),'Bottom line / Third line / Top line | Fourth line');
  await openMenu('Top line');
  await choose('Stack all the columns');
  assert.equal(await shape(),'Bottom line / Third line / Top line / Fourth line');
  assert.equal(await evaluate(`document.querySelectorAll('.cols').length`),0);

  // ── Columns come and go cleanly as you edit ──
  await open('<p>Left</p><p>Right</p>');
  await dragLine('.rich-text p',1,'.rich-text p',0,.93,.5);
  assert.equal(await shape(),'Left | Right');
  assert.equal(await evaluate(`document.querySelector('.rich-text').lastElementChild.tagName`),'P','there is always somewhere to click below the columns');
  // emptying a column dissolves the group
  await evaluate(`(()=>{const rich=document.querySelector('.rich-text');rich.querySelectorAll('.col')[1].innerHTML='<p><br></p>';rich.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(150);
  assert.equal(await evaluate(`document.querySelectorAll('.cols').length`),0,'one column left is just text again');
  assert.equal((await lines()).includes('Left'),true);

  // ── Backspace at the edge of a column doesn't pull text across ──
  await open('<div class="cols" data-n="2"><div class="col"><p>Alpha</p></div><div class="col"><p>Beta</p></div></div><p><br></p>');
  const guarded=await evaluate(`(()=>{const p=document.querySelectorAll('.rich-text .col p')[1];const range=document.createRange();range.setStart(p.firstChild,0);range.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(range);p.closest('.rich-text').focus();
    const event=new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true});p.dispatchEvent(event);return {prevented:event.defaultPrevented,alpha:document.querySelectorAll('.rich-text .col p')[0].textContent,beta:p.textContent}})()`);
  assert.deepEqual(guarded,{prevented:true,alpha:'Alpha',beta:'Beta'});
  const inMiddle=await evaluate(`(()=>{const p=document.querySelectorAll('.rich-text .col p')[1];const range=document.createRange();range.setStart(p.firstChild,2);range.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(range);const event=new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true});p.dispatchEvent(event);return event.defaultPrevented})()`);
  assert.equal(inMiddle,false,'ordinary Backspace is left alone');

  // ── A list item can go into a column on its own ──
  await open('<ul><li>One</li><li>Two</li></ul><p>Side note</p>');
  await dragLine('.rich-text li',1,'.rich-text p',0,.93,.5);
  assert.equal(await evaluate(`(()=>{const rich=document.querySelector('.rich-text');return rich.querySelector('ul li')?.textContent+' | '+[...rich.querySelectorAll('.cols .col')].map(c=>c.textContent).join(' | ')})()`),'One | Side note | Two');

  // ── Bullets belong to the line above them, and travel with it ──
  const sections='<p>Alpha</p><ul><li>a1</li><li>a2</li></ul><p>Beta</p><ul><li>b1</li></ul>';
  await open(sections);
  // pointing at a line's handle shows what comes along
  {const [x,y]=await point('.rich-text p',0,.15,.5);await mouse('mouseMoved',x,y);await wait(150);
   const [hx,hy]=await evaluate(`(()=>{const r=document.querySelector('#block-handle').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
   await mouse('mouseMoved',hx,hy);await wait(100);
   assert.equal(await evaluate(`[...document.querySelectorAll('.line-with')].map(n=>n.tagName).join()`),'P,UL','the line and its bullets are lit together');}
  // the drag label counts the bullets that come along, and the drop bar spans line and bullets
  {const from=await grab('.rich-text > p',1);                       // Beta, with one bullet
   const [tx,ty]=await point('.rich-text > p',0,.93,.5);              // right edge of Alpha
   await dragTo(from,tx,ty,{release:false});
   assert.match(await evaluate(`document.querySelector('.line-ghost').textContent`),/Beta\s+·\s+\+1 bullet$/);
   assert.equal(await evaluate(`(()=>{const m=document.querySelector('.line-drop').getBoundingClientRect(),p=document.querySelector('.rich-text > p').getBoundingClientRect(),u=document.querySelector('.rich-text > ul').getBoundingClientRect();return Math.abs(m.height-(u.bottom-p.top))<2})()`),true,'the bar is as tall as Alpha and its bullets together');
   assert.equal(await evaluate(`[...document.querySelectorAll('.line-moving')].map(n=>n.tagName).join()`),'P,UL','the bullets fade with their line');
   await shot('section-drag');await mouse('mouseReleased',tx,ty);await wait(200);}
  assert.equal(await shape(),'Alpha+a1a2 | Beta+b1','each line took its bullets into its column');await shot('section-columns');
  // Alpha onto the bullet under Beta: it lands after Beta's bullets, never between Beta and them, and brings its own
  await open(sections);
  await dragLine('.rich-text > p',0,'.rich-text li',2,.5,.5);
  assert.equal(await shape(),'Beta / b1 / Alpha / a1a2');
  assert.equal(await evaluate(`[...document.querySelectorAll('.rich-text > p')].map(p=>p.nextElementSibling?.tagName).join()`),'UL,UL','each line still has its own list directly under it');
  // a plain line dropped on someone's bullets can't wedge itself between them and their header
  await open('<p>Alpha</p><ul><li>a1</li><li>a2</li></ul><p>Gamma</p>');
  await dragLine('.rich-text > p',1,'.rich-text li',0,.5,.2);
  assert.equal(await evaluate(`document.querySelector('.rich-text > p + ul')?.previousElementSibling.textContent`),'Alpha','Alpha and its bullets are still together');
  // a blank line ends the belonging
  await open('<p>Head</p><p><br></p><ul><li>x</li></ul><p>Side</p>');
  await dragLine('.rich-text > p',2,'.rich-text > p',0,.93,.5);
  assert.equal(await evaluate(`document.querySelector('.cols').textContent`),'HeadSide','only the line moved with its neighbour');
  assert.equal(await evaluate(`!!document.querySelector('.rich-text > ul')&&!document.querySelector('.cols ul')`),true,'the list after a blank line is not Head\'s');
  // the menu action carries bullets too, and a list above answers to its header
  await open('<p>Alpha</p><ul><li>a1</li></ul><p>Beta</p><ul><li>b1</li></ul>');
  await openMenu('Beta');
  await choose('Put beside the line above');
  assert.equal(await shape(),'Alpha+a1 | Beta+b1');
  // moving a line out of a column takes its bullets with it
  await openMenu('Alpha');
  await choose('Move out of the columns');
  assert.equal(await shape(),'Beta / b1 / Alpha / a1','Alpha left the columns with its bullets');

  // ── Export and copy see columns in reading order ──
  await open('<div class="cols" data-n="2"><div class="col"><p>First</p></div><div class="col"><p>Second</p></div></div><p>After</p>');
  assert.equal(await evaluate(`RichEditor.cleanHTML(document.querySelector('.rich-text').innerHTML).includes('<div class="cols" data-n="2"><div class="col"><p>First</p></div><div class="col"><p>Second</p></div></div>')`),true,'columns survive cleaning');
  assert.equal(await evaluate(`RichEditor.cleanHTML('<div class="cols"><div class="col"><p>a</p></div><script>x</script><div class="col onclick"><p>b</p></div></div>').includes('script')`),false);

  console.log('PASS: lines in columns — drag a line onto another line\'s edge to make columns, drop bars, three-column limit, stacking, menu actions, tidy-up as you edit, safe Backspace, Markdown round trip.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
