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
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),text=t=>call('Input.insertText',{text:t},sessionId);
  const key=async(k,modifiers=0,extra={})=>{const base={key:k,code:extra.code||k,modifiers,windowsVirtualKeyCode:{Enter:13,Tab:9,Backspace:8}[k]||k.toUpperCase().charCodeAt(0),...extra};await call('Input.dispatchKeyEvent',{type:'keyDown',...base},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',...base},sessionId)};
  const enter=()=>key('Enter',0,{text:'\r'}),html=()=>evaluate('document.querySelector(".rich-text").innerHTML');
  const fresh=async()=>{await evaluate('document.querySelector("#new").click();document.querySelector(".rich-text").focus()');await wait(60)};
  await fresh();
  // Tab nests lists: numbers become letters then numerals; bullets become open circles.
  await text('1.');await text(' ');await text('one');await enter();await key('Tab');await text('sub');await enter();await key('Tab');await text('deep');
  assert.equal(await evaluate('[...document.querySelectorAll(".rich-text ol")].map(l=>getComputedStyle(l).listStyleType).join()'),'decimal,lower-alpha,lower-roman');
  assert.equal(await evaluate('current().blocks[0].text'),'1. one\n    1. sub\n        1. deep');
  await key('Tab',8);assert.equal(await evaluate('document.querySelectorAll(".rich-text ol ol ol").length'),0);
  assert.match(await evaluate('RichEditor.fromMarkdown("- a\\n    - b\\n        - c\\n- d")'),/<ul><li>a<ul><li>b<ul><li>c<\/li><\/ul><\/li><\/ul><\/li><li>d<\/li><\/ul>/);
  await fresh();await text('-');await text(' ');await text('a');await enter();await key('Tab');await text('b');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".rich-text ul ul")).listStyleType'),'circle');
  // Toggling italics off at a bare caret, and symbols keep the caret's style.
  await fresh();await text('hello');await key('i',4,{code:'KeyI'});await key('i',4,{code:'KeyI'});await text('x');
  assert.equal(await html(),'<p>hellox</p>');
  await fresh();await text('a ');await key('b',4,{code:'KeyB'});await text('word');await key('b',4,{code:'KeyB'});await text('-');await text('>');await text(' ');
  assert.match(await html(),/<b>word<\/b>→/);
  await evaluate(`document.querySelector('#launch-screen')?.remove();localStorage.removeItem('notival.markdown.open');window.__sent=[];window.__notivalHost=m=>window.__sent.push(m)`);
  await fresh();
  const read=sel=>evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent||''`);
  const many=sel=>evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const sent=()=>evaluate('JSON.stringify(window.__sent)').then(JSON.parse);
  const pane=()=>evaluate(`document.querySelector('#markdown-pane .md-source')?.textContent||''`);
  const setNote=(html,title='My App')=>evaluate(`(()=>{const n=current();n.title=${JSON.stringify(title)};n.blocks[0].html=${JSON.stringify(html)};render()})()`).then(()=>wait(350));
  await setNote('<h2>Usage</h2><p>Run <code>go</code></p>');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#markdown-note')).display!=='none'`),true,'an MD button in the header');
  assert.equal(await evaluate(`document.querySelector('#markdown-pane').hidden`),true,'closed to begin with');
  await evaluate(`document.querySelector('#markdown-note').click()`);await wait(250);
  assert.equal(await evaluate(`document.body.classList.contains('md-open')`),true);
  assert.equal(await pane(),'# My App\n\n## Usage\n\nRun `go`\n','the note as GitHub Markdown');
  const r=await evaluate(`(()=>{const p=document.querySelector('#markdown-pane').getBoundingClientRect(),m=document.querySelector('main').getBoundingClientRect();return {paneLeft:p.left,mainRight:m.right,paneW:p.width}})()`);
  assert.ok(r.mainRight<=r.paneLeft+1,'the note makes room: it does not sit under the pane '+JSON.stringify(r));
  // Live: typing changes it
  await evaluate(`(()=>{const e=document.querySelector('.rich-text');e.innerHTML+='<p>Then <strong>stop</strong>.</p>';e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(400);
  assert.equal(await pane(),'# My App\n\n## Usage\n\nRun `go`\n\nThen **stop**.\n','updates as you write');
  await evaluate(`(()=>{const t=document.querySelector('#title');t.value='Renamed';t.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(400);
  assert.match(await pane(),/^# Renamed\n/,'and as the title changes');
  // Title off
  await evaluate(`(()=>{const c=document.querySelector('#md-title-heading');c.checked=false;c.dispatchEvent(new Event('change'))})()`);await wait(300);
  assert.match(await pane(),/^## Usage\n/);assert.equal(await evaluate(`current().mdTitle`),false);
  await evaluate(`(()=>{const c=document.querySelector('#md-title-heading');c.checked=true;c.dispatchEvent(new Event('change'))})()`);await wait(300);
  // Copy
  await evaluate(`[...document.querySelectorAll('#markdown-pane button')].find(b=>b.textContent==='Copy Markdown').click()`);await wait(100);
  let m=(await sent()).filter(x=>x.type==='copy').at(-1);assert.ok(m&&m.text.startsWith('# Renamed\n'),'copy hands the Markdown to the clipboard');assert.equal(m.message,'Markdown copied');
  // A picture goes with Save as a file beside the Markdown
  const png='data:image/png;base64,iVBORw0KGgo=';
  await setNote('<p>Look <img src="'+png+'" alt="Shot"></p>','Pic');
  assert.match(await pane(),/!\[Shot\]\(images\/shot-[a-z0-9]+\.png\)/);
  assert.match(await read('.md-stats'),/1 picture saved in an “images” folder/);
  await evaluate(`[...document.querySelectorAll('#markdown-pane button')].find(b=>b.textContent==='Save as .md…').click()`);await wait(100);
  m=(await sent()).filter(x=>x.type==='saveMarkdown').at(-1);
  assert.equal(m.title,'Pic');assert.equal(m.imagesDir,'images');assert.equal(m.images.length,1);assert.equal(m.images[0].data,'iVBORw0KGgo=');assert.match(m.images[0].name,/^shot-[a-z0-9]+\.png$/);assert.ok(m.noteId);
  const noteId=m.noteId;
  assert.match(await read('.md-github'),/save it as a \.md file inside your project/,'before it is linked, the pane says how to get a push button');
  // The app saved it: the note is linked to the file
  await evaluate(`marginMarkdownSaved({noteId:${JSON.stringify(noteId)},path:'/Users/me/app/README.md',name:'README.md',images:1})`);await wait(100);
  assert.equal(await evaluate(`current().mdPath`),'/Users/me/app/README.md');
  assert.match(await read('.md-linked'),/Linked to README\.md/);assert.match(await read('.md-note'),/Saved README\.md · .* · 1 picture/);
  assert.equal(await evaluate(`[...document.querySelectorAll('#markdown-pane button')].some(b=>b.textContent==='Save as a new file…')`),true);
  // Keep it updated as I write
  await evaluate(`(()=>{const c=document.querySelector('.md-sync input');c.checked=true;c.dispatchEvent(new Event('change'))})()`);await wait(150);
  let writes=(await sent()).filter(x=>x.type==='writeMarkdown');assert.equal(writes.length,1,'turning it on writes once');assert.equal(writes[0].path,'/Users/me/app/README.md');
  await evaluate(`(()=>{const e=document.querySelector('.rich-text');e.innerHTML+='<p>More.</p>';e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(300);
  assert.equal((await sent()).filter(x=>x.type==='writeMarkdown').length,1,'not on every keystroke…');
  await wait(1300);
  writes=(await sent()).filter(x=>x.type==='writeMarkdown');assert.equal(writes.length,2,'…a moment after you stop typing');assert.match(writes.at(-1).text,/More\./);
  // A file the app will not write: syncing switches itself off and says why
  await evaluate(`marginMarkdownSaved({noteId:${JSON.stringify(noteId)},error:'Save the file again to keep it updated.'})`);await wait(100);
  assert.equal(await evaluate(`current().mdSync`),false);assert.match(await read('.md-note'),/Save the file again/);
  // GitHub: the folder is asked about, then the file is committed and pushed with the Mac's git
  let asked=(await sent()).filter(x=>x.type==='gitStatus');assert.equal(asked.length,1,'the folder is checked once');assert.equal(asked[0].path,'/Users/me/app/README.md');
  assert.match(await read('.md-github'),/Checking the folder/);
  await evaluate(`marginGitResult({noteId:${JSON.stringify(noteId)},kind:'gitStatus',ok:true,info:{repo:false}})`);await wait(100);
  assert.match(await read('.md-github'),/isn't in a git folder/,'not in a repository: it says how to fix that');
  await evaluate(`marginGitResult({noteId:${JSON.stringify(noteId)},kind:'gitStatus',ok:true,info:{repo:true,branch:'main',remote:'git@github.com:me/app.git',changed:true}})`);await wait(100);
  assert.match(await read('.md-github'),/me\/app · main/,'repository and branch are shown');
  assert.equal(await evaluate(`document.querySelector('.md-commit').value`),'Update README.md','a commit message is ready');
  await evaluate(`(()=>{const c=document.querySelector('.md-commit');c.value='Document the API';c.dispatchEvent(new Event('input'))})()`);
  const before=(await sent()).length;
  await evaluate(`document.querySelector('.md-push').click()`);await wait(150);
  const after=(await sent()).slice(before);
  assert.deepEqual(after.map(x=>x.type),['writeMarkdown','gitPublish'],'the file is brought up to date, then pushed');
  assert.equal(after[1].message,'Document the API');assert.equal(after[1].path,'/Users/me/app/README.md');assert.equal(after[1].images.length,1,'with the names of its pictures');
  assert.match(await read('.md-github'),/Working/);
  await evaluate(`marginGitResult({noteId:${JSON.stringify(noteId)},kind:'gitPublish',ok:false,error:'GitHub has newer work on this branch.'})`);await wait(100);
  assert.match(await read('.md-note'),/newer work/,'a failed push says why');assert.equal(await many('.md-push'),1,'and can be tried again');
  await evaluate(`marginGitResult({noteId:${JSON.stringify(noteId)},kind:'gitPublish',ok:true,message:'committed and pushed to main',info:{repo:true,branch:'main',remote:'git@github.com:me/app.git',changed:false}})`);await wait(100);
  assert.match(await read('.md-note'),/committed and pushed to main/);
  // Unlink
  await evaluate(`[...document.querySelectorAll('#markdown-pane button')].find(b=>b.textContent==='Unlink').click()`);await wait(150);
  assert.equal(await evaluate(`current().mdPath`),undefined);assert.equal(await many('.md-linked'),0);
  // Closing gives the room back, and the choice is remembered
  await evaluate(`document.querySelector('.md-close').click()`);await wait(100);
  assert.equal(await evaluate(`document.body.classList.contains('md-open')`),false);assert.equal(await evaluate(`localStorage.getItem('notival.markdown.open')`),'false');
  console.log('PASS: markdown pane — live GitHub Markdown beside the note, copy, save with pictures, link to a file, keep it updated, unlink.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
