// Measures equation recognition end to end: render known LaTeX to images, read them back with native/latex_ocr.py,
// and compare what came back with the truth. Needs the model from scripts/setup-latex-ocr.sh, so it is not part of the normal test run.
//   node tests/ocr-bench/bench.mjs --out <dir> [--only N] [--label name] [--script path/to/latex_ocr.py]
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import vm from 'node:vm';

const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback};
const out=arg('out');if(!out){console.error('--out <dir> is required');process.exit(1)}
const only=Number(arg('only',0)),label=arg('label','run');
const script=arg('script',new URL('../../native/latex_ocr.py',import.meta.url).pathname);
const python=homedir()+'/Library/Application Support/Margin/latex-ocr/venv/bin/python';
const cases=JSON.parse(await readFile(new URL('./cases.json',import.meta.url),'utf8')).slice(0,only||undefined);
// clean: a crisp screenshot. small: a small, slightly soft crop. tinted: yellowed paper with grey text.
// dark: light text on a dark page (a dark-themed PDF viewer).
const conditions={
 clean:{size:26,blur:0,color:'#000',background:'#fff'},
 small:{size:15,blur:.45,color:'#222',background:'#fff'},
 tinted:{size:14,blur:.6,color:'#4a4a48',background:'#f1ecdd'},
 dark:{size:20,blur:.3,color:'#e8e8e8',background:'#1d1f24'}
};
const chosen=(arg('conditions','')||'').split(',').filter(Boolean);
if(chosen.length)for(const name of Object.keys(conditions))if(!chosen.includes(name))delete conditions[name];
await mkdir(out,{recursive:true});

// ---- 1. render each case to a PNG (skipped when it already exists) ----
const needed=cases.flatMap((latex,i)=>Object.keys(conditions).map(c=>({i,latex,c,path:`${out}/${String(i).padStart(2,'0')}-${c}.png`}))).filter(x=>!existsSync(x.path));
if(needed.length){
 const profile=await mkdtemp('/private/tmp/ocr-bench-');
 const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--no-first-run','--remote-debugging-pipe','--user-data-dir='+profile,'--allow-file-access-from-files'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let buffer='',id=0;const waiting=new Map();
 browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const k=buffer.indexOf('\0'),raw=buffer.slice(0,k);buffer=buffer.slice(k+1);if(!raw)continue;const m=JSON.parse(raw),p=waiting.get(m.id);if(p){waiting.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}});
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id;waiting.set(key,{resolve,reject});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
 try{
  const web=new URL('../../web/math/',import.meta.url).pathname;
  const page=`${profile}/page.html`;
  await writeFile(page,`<!doctype html><meta charset=utf-8><link rel=stylesheet href="file://${web}katex.min.css"><script src="file://${web}katex.min.js"></script><body style="margin:0;background:#fff"><div id=box style="display:inline-block;padding:18px 24px"></div>`);
  const {targetId}=await call('Target.createTarget',{url:'file://'+page});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId)).result.value;
  for(let k=0;k<100&&!await evaluate('typeof katex!=="undefined"&&document.readyState==="complete"');k++)await new Promise(r=>setTimeout(r,50));
  await call('Emulation.setDeviceMetricsOverride',{width:1400,height:400,deviceScaleFactor:1,mobile:false},sessionId);
  for(const item of needed){
   const cond=conditions[item.c];
   const rect=await evaluate(`(()=>{const b=document.querySelector('#box');b.style.cssText='display:inline-block;padding:18px 24px;font-size:${cond.size}px;color:${cond.color};background:${cond.background};filter:${cond.blur?`blur(${cond.blur}px)`:'none'}';document.body.style.background='${cond.background}';katex.render(${JSON.stringify(item.latex)},b,{displayMode:true,throwOnError:false});const r=b.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height}})()`);
   await new Promise(r=>setTimeout(r,60));
   const {data}=await call('Page.captureScreenshot',{format:'png',clip:{...rect,scale:1}},sessionId);
   await writeFile(item.path,Buffer.from(data,'base64'));
  }
 }finally{browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
}

// ---- 2. read each image with the recognition script ----
const katex=vm.runInNewContext(readFileSync(new URL('../../web/math/katex.min.js',import.meta.url),'utf8')+';katex',{});
const canon=latex=>{try{return katex.renderToString(latex,{output:'mathml',throwOnError:true}).replace(/<annotation[\s\S]*?<\/annotation>/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean)}catch{return null}};
const distance=(a,b)=>{let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(prev[j]+1,row[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row}return prev[b.length]};
const rows=[];
for(let i=0;i<cases.length;i++)for(const c of Object.keys(conditions)){
 const path=`${out}/${String(i).padStart(2,'0')}-${c}.png`,started=Date.now();
 const run=spawnSync(python,[script,path],{encoding:'utf8',timeout:120000});
 const last=run.stdout.trim().split('\n').filter(Boolean).at(-1)||'{}';let result;try{result=JSON.parse(last)}catch{result={ok:false,error:'unparsable'}}
 const truth=canon(cases[i]),got=result.ok?canon(result.latex):null;
 const exact=!!got&&truth.join(' ')===got.join(' ');
 const near=got?1-distance(truth,got)/Math.max(truth.length,got.length,1):0;
 rows.push({case:i,condition:c,truth:cases[i],got:result.latex||null,renders:!!got,exact,similarity:+near.toFixed(3),uncertain:!!result.uncertain,seconds:+((Date.now()-started)/1000).toFixed(1),error:result.error||null});
 process.stderr.write(`${exact?'✓':got?'~':'✗'} ${String(i).padStart(2)} ${c.padEnd(5)} ${rows.at(-1).seconds}s  ${result.latex||result.error||''}\n`);
}
// ---- 3. summary ----
const pct=(n,d)=>(d?Math.round(n/d*1000)/10:0)+'%';
const summary={label,cases:cases.length,images:rows.length,
 exact:pct(rows.filter(r=>r.exact).length,rows.length),
 renders:pct(rows.filter(r=>r.renders).length,rows.length),
 similarity:+(rows.reduce((s,r)=>s+r.similarity,0)/rows.length).toFixed(3),
 meanSeconds:+(rows.reduce((s,r)=>s+r.seconds,0)/rows.length).toFixed(1),
 byCondition:Object.fromEntries(Object.keys(conditions).map(c=>{const r=rows.filter(x=>x.condition===c);return [c,{exact:pct(r.filter(x=>x.exact).length,r.length),similarity:+(r.reduce((s,x)=>s+x.similarity,0)/r.length).toFixed(3)}]}))};
await writeFile(`${out}/result-${label}.json`,JSON.stringify({summary,rows},null,1));
console.log(JSON.stringify(summary,null,1));
