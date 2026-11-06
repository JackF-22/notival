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
import http from 'node:http';
const stamp=d=>new Date(Date.now()+d*86400000).toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
const assignments=[
 {id:'11',course:'101',label:'BIOL 101: Intro to Biology',name:'Lab 3',due:stamp(3)},
 {id:'12',course:'101',label:'BIOL 101: Intro to Biology',name:'Quiz 2',due:stamp(1)},
 {id:'13',course:'101',label:'BIOL 101: Intro to Biology',name:'Essay draft',due:stamp(7)},
 {id:'21',course:'202',label:'CS 210 Data Structures',name:'HW3',due:stamp(2)},
 {id:'31',course:'303',label:'ART 100',name:'Sketchbook check',due:stamp(4)}
];
const feedText=()=>['BEGIN:VCALENDAR','VERSION:2.0',
 ...assignments.flatMap(a=>['BEGIN:VEVENT','UID:event-assignment-'+a.id,'DTSTART:'+a.due,'SUMMARY:'+a.name+' ['+a.label+']','DESCRIPTION:Details\\nhttps://school.test/courses/'+a.course+'/assignments/'+a.id,'URL;VALUE=URI:https://school.test/calendar?include_contexts=course_'+a.course,'END:VEVENT']),
 'BEGIN:VEVENT','UID:event-calendar-event-5','DTSTART:'+stamp(2),'SUMMARY:Office hours [CS 210 Data Structures]','END:VEVENT','END:VCALENDAR',''].join('\r\n');
const requests=[];
const server=http.createServer((req,res)=>{
 const cors={'access-control-allow-origin':'*'};
 requests.push({method:req.method,url:req.url,auth:req.headers.authorization});
 if(req.url==='/feeds/calendars/user_secret.ics'){res.writeHead(200,{'content-type':'text/calendar',...cors});res.end(feedText());return}
 res.writeHead(404,{'content-type':'text/plain',...cors});res.end('not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,goodLink=base+'/feeds/calendars/user_secret.ics';
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && !!document.querySelector(".quick-search-trigger")'))break;await new Promise(resolve=>setTimeout(resolve,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1100,height:850,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),mouse=(type,p,buttons)=>call('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons,clickCount:1},sessionId);
  await evaluate('document.querySelector("#launch-screen")?.remove();document.querySelector("#new").click()');await wait(80);
  const connect=async(html,a,b,relation)=>{
    await evaluate(`setMode('write');current().nodes=[];current().passageConnections=[];current().blocks=[{id:'b1',type:'text',text:'x',html:${JSON.stringify(html)}}];render()`);await wait(150);
    await evaluate(`document.querySelector('#connect-passages').click()`);await wait(100);
    const pts=await evaluate(`JSON.stringify([${JSON.stringify(a)},${JSON.stringify(b)}].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.left+Math.min(15,r.width/2),y:r.top+r.height/2}}))`).then(JSON.parse);
    await mouse('mousePressed',pts[0],1);await mouse('mouseMoved',pts[1],1);await mouse('mouseReleased',pts[1],0);await wait(120);
    assert.equal(await evaluate(`document.querySelector('#passage-connection-dialog').open`),true);
    await evaluate(`(()=>{const r=document.querySelector('#passage-connection-dialog .rich-text');r.innerHTML=${JSON.stringify(relation)};r.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#passage-connection-dialog form').requestSubmit()})()`);await wait(200);
  };
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`state.projects=[{id:'bio',name:'Biology',icon:'🧬',color:'#4a9d6f',units:[],materials:[],packs:[],assessments:[],checklist:[{id:'mine',title:'My own task',done:false}]},{id:'cs',name:'Computer Science',icon:'💻',color:'#4a6fc7',units:[],materials:[],packs:[],assessments:[],checklist:[]},{id:'hist',name:'History',icon:'🏛️',color:'#b3672a',units:[],materials:[],packs:[],assessments:[],checklist:[]}];window.marginHome(null)`);await wait(300);
  const fill=async(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const until=async(expression,label)=>{for(let i=0;i<60;i++){if(await evaluate(expression))return;await wait(100)}assert.fail('timed out waiting for '+label)};
  // Not connected: the to-do list offers to connect.
  assert.equal(await evaluate(`document.querySelector('.global-todo .canvas-button').textContent`),'Connect Canvas');
  await evaluate(`document.querySelector('.global-todo .canvas-button').click()`);await wait(100);
  assert.equal(await evaluate(`document.querySelector('.canvas-dialog').open`),true);
  // Something that isn't a calendar link, and a link Canvas doesn't know, are each explained; nothing is saved.
  await fill('[aria-label="Canvas calendar feed link"]','https://example.com/hello');
  await evaluate(`document.querySelector('.canvas-dialog form').requestSubmit()`);await wait(150);
  assert.match(await evaluate(`document.querySelector('.canvas-error').textContent`),/Calendar Feed link/);
  await fill('[aria-label="Canvas calendar feed link"]',base+'/feeds/calendars/user_wrong.ics');
  await evaluate(`document.querySelector('.canvas-dialog form').requestSubmit()`);
  await until(`/recognize that calendar link/.test(document.querySelector('.canvas-error').textContent)`,'the unknown-link error');
  assert.equal(await evaluate(`!!state.canvas`),false);
  // The right link connects and offers pairing, with sensible suggestions.
  await fill('[aria-label="Canvas calendar feed link"]',goodLink);
  await evaluate(`document.querySelector('.canvas-dialog form').requestSubmit()`);
  await until(`document.querySelectorAll('.canvas-pair select').length===3`,'the pairing list');
  assert.equal(await evaluate(`state.canvas.base`),base);
  assert.equal(await evaluate(`JSON.stringify([...document.querySelectorAll('.canvas-pair select')].map(s=>s.value))`),JSON.stringify(['101','202','']));
  assert.equal(await evaluate(`document.querySelectorAll('.canvas-pair select')[0].options.length`),4);
  await evaluate(`document.querySelector('.canvas-dialog form').requestSubmit()`);
  await until(`state.projects[0].checklist.length===4&&state.projects[1].checklist.length===1`,'the first sync');
  // Assignments arrive with due dates and links; calendar events that aren't assignments are left out.
  assert.equal(await evaluate(`JSON.stringify(state.projects[0].checklist.map(t=>t.title).sort())`),JSON.stringify(['Essay draft','Lab 3','My own task','Quiz 2']));
  assert.equal(await evaluate(`JSON.stringify(state.projects[1].checklist.map(t=>t.title))`),JSON.stringify(['HW3']));
  assert.match(await evaluate(`state.projects[0].checklist.find(t=>t.title==='Lab 3').date`),/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(await evaluate(`state.projects[0].checklist.find(t=>t.title==='Lab 3').canvas.url`),'https://school.test/courses/101/assignments/11');
  assert.equal(await evaluate(`state.projects[2].checklist.length`),0);
  assert.equal(await evaluate(`state.projects[0].canvas.courseId+','+state.projects[1].canvas.courseId`),'101,202');
  // Connecting on Home carries through to each paired subject's own to-do list.
  await evaluate(`window.marginHome('bio')`);await wait(300);
  assert.equal(await evaluate(`JSON.stringify([...document.querySelectorAll('.subject-checklist .check-label')].map(l=>l.textContent).sort())`),JSON.stringify(['Essay draft','Lab 3','My own task','Quiz 2']));
  assert.equal(await evaluate(`document.querySelector('.subject-checklist .canvas-button').textContent`),'Sync Canvas');
  assert.equal(await evaluate(`document.querySelectorAll('.subject-checklist .task-canvas').length`),3);
  await evaluate(`window.marginHome('cs')`);await wait(300);
  assert.equal(await evaluate(`JSON.stringify([...document.querySelectorAll('.subject-checklist .check-label')].map(l=>l.textContent))`),JSON.stringify(['HW3']));
  // A subject that wasn't paired offers to pair, and has nothing from Canvas.
  await evaluate(`window.marginHome('hist')`);await wait(300);
  assert.equal(await evaluate(`document.querySelector('.subject-checklist .canvas-button').textContent`),'Pair with Canvas');
  assert.equal(await evaluate(`document.querySelectorAll('.subject-checklist .check-label').length`),0);
  await evaluate(`window.marginHome(null)`);await wait(300);
  // The home page shows them with their subject labels and a link back to Canvas.
  await wait(250);
  assert.equal(await evaluate(`[...document.querySelectorAll('.global-task')].filter(r=>/Lab 3|HW3/.test(r.textContent)).map(r=>r.querySelector('.subject-tag').textContent.trim()).sort().join()`),'💻Computer Science,🧬Biology');
  assert.ok(await evaluate(`document.querySelectorAll('.global-task .task-canvas').length`)>=4);
  assert.equal(await evaluate(`document.querySelector('.global-todo .canvas-button').textContent`),'Sync Canvas');
  // Syncing again changes nothing; a change in Canvas flows through; the student's own ticks are kept.
  await evaluate(`state.projects[0].checklist.find(t=>t.title==='Essay draft').done=true`);
  await evaluate(`document.querySelector('.global-todo .canvas-button').click()`);
  await until(`state.canvas.lastSync&&Date.now()-state.canvas.lastSync<3000`,'the second sync');
  assert.equal(await evaluate(`state.projects[0].checklist.length+','+state.projects[1].checklist.length`),'4,1');
  await wait(400);
  assignments[0].name='Lab 3 (revised)';
  await evaluate(`window.marginCanvas.sync()`);
  await until(`state.projects[0].checklist.some(t=>t.title==='Lab 3 (revised)')`,'the renamed assignment');
  assert.equal(await evaluate(`state.projects[0].checklist.length`),4);
  assert.equal(await evaluate(`state.projects[0].checklist.find(t=>t.title==='Essay draft').done`),true);
  // Only read-only GETs of the feed, no credentials in headers, and the secret link is nowhere in saved data.
  assert.ok(requests.length>=4&&requests.every(r=>r.method==='GET'&&r.url.startsWith('/feeds/calendars/')&&r.auth===undefined));
  assert.equal(await evaluate(`JSON.stringify(state).includes('user_secret')||JSON.stringify(localStorage).includes('user_secret')`),false);
  // A reset link (Canvas stops recognizing it) is flagged, and nothing is lost.
  const keep=await evaluate(`state.projects[0].checklist.length`);
  assignments.length=0;
  await wait(400);
  await evaluate(`window.marginCanvas.sync()`);await wait(300);
  assert.equal(await evaluate(`state.projects[0].checklist.length`),keep);
  // Disconnecting keeps the tasks and goes back to offering a connection.
  await evaluate(`window.marginCanvas.disconnect()`);await wait(300);
  assert.equal(await evaluate(`!!state.canvas`),false);
  assert.equal(await evaluate(`state.projects[0].checklist.length`),keep);
  assert.equal(await evaluate(`document.querySelector('.global-todo .canvas-button').textContent`),'Connect Canvas');
  console.log('PASS: Canvas connects with the calendar feed link, pairs subjects with courses, labels assignments in the to-do list, and never duplicates, overrides ticks, or stores the link.');
}finally{server.close();browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
