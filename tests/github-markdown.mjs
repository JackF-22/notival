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
  await evaluate(`document.querySelector('#launch-screen')?.remove()`);
  const md=(html,extra={})=>evaluate(`(()=>{const r=GithubMarkdown.fromNote(Object.assign({title:'',blocks:[{type:'text',html:${JSON.stringify(html)}}]},${JSON.stringify(extra)}));return {md:r.markdown,images:r.images.map(i=>i.name)}})()`);
  const same=async(html,expected,message,extra)=>assert.equal((await md(html,extra)).md,expected+'\n',message);
  await same('<h2>Install</h2><p>Run <code>npm i</code> then <strong>go</strong> and <em>relax</em>.</p>','## Install\n\nRun `npm i` then **go** and *relax*.','headings, inline code, bold, italic');
  await same('<p>Strike <s>this</s>, <mark>highlight</mark>, <u>under</u>.</p>','Strike ~~this~~, <mark>highlight</mark>, <ins>under</ins>.','strike, highlight, underline');
  await same('<p>a <strong> spaced </strong> b</p>','a **spaced** b','spaces move outside the marks');
  await same('<p>snake_case_name and _lead and * star and a|b and $5 and `tick` and 1 &lt; 2 and &lt;div&gt;</p>','snake_case_name and \\_lead and \\* star and a|b and \\$5 and \\`tick\\` and 1 < 2 and \\<div>','only what would be read as formatting is escaped');
  await same('<p># not a heading</p><p>- not a list</p><p>1. nor this</p><p>&gt; nor a quote</p>','\\# not a heading\n\n\\- not a list\n\n1\\. nor this\n\n\\> nor a quote','lines that look like Markdown stay text');
  await same('<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul><ol start="3"><li>c</li><li>d</li></ol>','- one\n  - nested\n- two\n\n3. c\n4. d','nested and numbered lists');
  await same('<div class="task-row"><input type="checkbox" checked><span>Done</span></div><div class="task-row"><input type="checkbox"><span>To do</span></div>','- [x] Done\n- [ ] To do','task lists');
  await same('<blockquote><p>quoted</p><p>twice</p></blockquote><hr><pre>a\n```\nb</pre>','> quoted\n>\n> twice\n\n---\n\n````\na\n```\nb\n````','quotes, rule, and a code fence longer than any backticks inside');
  await same('<p><a href="https://github.com/x/y">repo</a> and <a href="javascript:alert(1)">bad</a></p>','[repo](https://github.com/x/y) and bad','links; unsafe ones become plain text');
  await same('<table><tbody><tr><th>Name</th><th>Qty</th></tr><tr><td>apple</td><td>3 | 4</td></tr></tbody></table>','| Name  | Qty    |\n| ----- | ------ |\n| apple | 3 \\| 4 |','tables, padded, pipes escaped');
  await same('<p>Inline <span class="equation inline-equation" data-equation="x^2"></span></p><div class="equation display-equation" data-equation="E=mc^2"></div>','Inline $x^2$\n\n$$\nE=mc^2\n$$','maths');
  await same('<div class="procedure" data-procedure="Mix\nBake" data-numbered="1"></div>','1. Mix\n2. Bake','a procedure box becomes a numbered list');
  await same('<p>line one<br>line two</p>','line one\\\nline two','a line break');
  // Titles and headings
  await same('<h1>Mine</h1><p>text</p>','# Title\n\n## Mine\n\ntext','a note heading steps down under the title',{title:'Title'});
  await same('<h2>Sub</h2>','# Title\n\n## Sub','no step-down when there is no h1',{title:'Title'});
  assert.equal((await md('<p>x</p>',{title:'T'})).md.startsWith('# T'),true);
  assert.equal((await evaluate(`GithubMarkdown.fromNote({title:'Skip',blocks:[{type:'text',html:'<p>x</p>'}]},{title:false}).markdown`)),'x\n','title can be left off');
  // Code cells carry their language
  assert.equal(await evaluate(`GithubMarkdown.fromNote({title:'',blocks:[{type:'text',html:'<p>Use it</p>'},{type:'code',language:'python',text:'print(1)\\n'},{type:'code',language:'text',text:'plain'}]}).markdown`),'Use it\n\n```python\nprint(1)\n```\n\n```\nplain\n```\n','code cells keep their language');
  // Pictures become files beside the Markdown
  const png='data:image/png;base64,iVBORw0KGgo=';
  let r=await md('<p><img src="'+png+'" alt="Screen shot"> and <img src="'+png+'" alt="Screen shot"></p><p><img src="https://example.com/a.png" alt="web"></p><p><img src="'+png+'" alt="small" data-width="40"></p>');
  assert.match(r.md,/^!\[Screen shot\]\(images\/screen-shot-[a-z0-9]{1,6}\.png\) and !\[Screen shot\]\(images\/screen-shot-[a-z0-9]{1,6}\.png\)\n\n!\[web\]\(https:\/\/example.com\/a.png\)\n\n<img src="images\/screen-shot-[a-z0-9]+\.png" alt="small" width="40%">\n$/);
  assert.equal(r.images.length,1,'the same picture used three times is saved once, and a web picture is not a file: '+JSON.stringify(r.images));
  assert.equal((await md('<p><img src="'+png+'" alt="x"></p>',{})).images[0],(await md('<p><img src="'+png+'" alt="x"></p>',{})).images[0],'names are stable between runs');
  // A whole note
  r=await evaluate(`(()=>{const x=GithubMarkdown.fromNote({title:'My App',blocks:[{type:'text',html:'<h2>Usage</h2><p>One two three.</p>'},{type:'code',language:'js',text:'run()'}]});return x})()`);
  assert.equal(r.markdown,'# My App\n\n## Usage\n\nOne two three.\n\n```js\nrun()\n```\n');assert.equal(r.words,6,'headings count, code does not');
  console.log('PASS: GitHub Markdown — headings, emphasis, escaping, lists, tasks, tables, maths, code with language, links, pictures as files, title handling.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
