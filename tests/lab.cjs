const {Worker:Thread}=require('node:worker_threads');
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const blobs=new Map();let next=0;
const context=vm.createContext({window:{},console,setTimeout,clearTimeout,Blob:class{constructor(parts){this.source=parts.join('')}},URL:{createObjectURL(blob){const id=String(++next);blobs.set(id,blob.source);return id},revokeObjectURL(id){blobs.delete(id)}},Worker:class{
 constructor(url){this.thread=new Thread('const {parentPort}=require("node:worker_threads");global.postMessage=x=>parentPort.postMessage(x);'+blobs.get(url),{eval:true});this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.({message:error.message,preventDefault(){}}))}
 terminate(){this.thread.terminate()}
},$:()=>({textContent:''}),document:{querySelectorAll:()=>[]},persist(){},current:()=>null});
vm.runInContext(fs.readFileSync('web/lab.js','utf8'),context);
const run=code=>vm.runInContext(code,context);
const wait=async()=>{for(let i=0;i<100;i++){if(run('experiment===null'))return;await new Promise(r=>setTimeout(r,50))}throw Error('Execution did not finish')};
(async()=>{
run(`var note={blocks:[{id:'a',type:'code',language:'javascript',text:'const n = 6; console.log(n * 2)'},{id:'b',type:'code',language:'javascript',text:'console.log(n + 1)'}]};runLab(note)`);await wait();
assert.equal(run('note.blocks[0].result.text'),'12');assert.equal(run('note.blocks[1].result.text'),'7');
run(`note.blocks[0].text='const n = 10;';`);assert.equal(run(`note.blocks[1].result.signature===labSignature(note,'b')`),false);
run('runLab(note)');await wait();assert.equal(run('note.blocks[1].result.text'),'11');
run(`note.blocks[1].text='throw new Error("Try again")';runLab(note)`);await wait();assert.match(run('note.blocks[1].result.text'),/Try again/);
run(`note.blocks[1].text='while(true){}';runLab(note)`);await wait();assert.match(run('note.blocks[1].result.text'),/Stopped after 3 seconds/);
run(`note.blocks[1].text='console.log(n)';runLab(note)`);await wait();assert.equal(run('note.blocks[1].result.text'),'10');
run('runLab(note);runLab(note)');assert.equal(run('experiment'),null);
run(`note.blocks[0].text='const =';runLab(note)`);await wait();assert.equal(run('note.blocks[0].result.error'),true);
assert.equal(blobs.size,0);
console.log('PASS: ordered cells, fresh state, stale signatures, errors, timeout, recovery, stop, syntax errors, worker cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1});
