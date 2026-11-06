import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const profile=await mkdtemp('/private/tmp/margin-export-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),entry=waiting.get(message.id);if(entry){clearTimeout(entry.timer);waiting.delete(message.id);message.error?entry.reject(Error(JSON.stringify(message.error))):entry.resolve(message.result||{})}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),15000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && !!window.NotivalExport'))break;await new Promise(r=>setTimeout(r,100))}
  const html=await evaluate(`(()=>{document.querySelector('#launch-screen')?.remove();
   const note={id:'e1',title:'Cell biology: week 3',updated:Date.now(),blocks:[
    {id:'a',type:'text',text:'',html:'<h2>Mitochondria</h2><p>The <b>powerhouse</b> of the cell, with <span class="equation" data-equation="E=mc^2"></span> as a joke.</p><ul><li>Outer membrane</li><li>Inner membrane<ul><li>Cristae</li></ul></li></ul>'},
    {id:'b',type:'text',text:'',html:'<table><tbody><tr><td>Organelle</td><td>Job</td></tr><tr><td>Nucleus</td><td>DNA</td></tr></tbody></table><div class="task-row" data-task="done"><input type="checkbox" checked><span>Read chapter 4</span></div>'},
    {id:'c',type:'code',text:'print("hi")',language:'python'}],nodes:[],pinned:false};
   return JSON.stringify({pdf:NotivalExport.build(note,'pdf').html,docx:NotivalExport.build(note,'docx').html})})()`);
  const built=JSON.parse(html);
  for(const kind of ['pdf','docx']){
    assert.ok(built[kind].includes('Cell biology: week 3'),kind+' has the title');
    assert.ok(built[kind].includes('Mitochondria')&&built[kind].includes('Cristae'),kind+' has the content');
    assert.ok(built[kind].includes('☑ ')&&!built[kind].includes('<input'),kind+' turns checkboxes into marks');
    assert.ok(built[kind].includes('print("hi")'),kind+' has code');
  }
  assert.ok(built.pdf.includes('class="katex"'),'PDF renders equations');
  assert.ok(built.docx.includes('E=mc^2')&&!built.docx.includes('class="katex"'),'Word gets the equation as text');
  await writeFile(process.argv[2]||'/private/tmp/margin-export.html',built.pdf);
  await writeFile((process.argv[2]||'/private/tmp/margin-export.html')+'.docx.html',built.docx);
  console.log('PASS: a note becomes a clean export document with headings, lists, tables, tasks, code and equations.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
