// Each experiment gets a fresh worker. Notebook code never runs in the editor.
let experiment=null;
const labSignature=(note,id)=>JSON.stringify(note.blocks.slice(0,note.blocks.findIndex(b=>b.id===id)+1).filter(b=>b.type==='code'&&['javascript','c','python'].includes(b.language)).map(b=>[b.id,b.language,b.text]));
const nativeRuns=new Map();
function highlightSource(source,language){const escape=value=>String(value).replace(/[&<>]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[char]));const words=language==='c'?'auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|include|define':language==='python'?'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield':language==='javascript'?'async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|get|if|import|in|instanceof|let|new|of|return|set|static|super|switch|this|throw|try|typeof|var|void|while|with|yield|true|false|null|undefined':'';const token=new RegExp(`(//[^\\n]*|/\\*[\\s\\S]*?\\*/|#[^\\n]*|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\\b(?:${words||'(?!)'})\\b|\\b(?:0x[\\da-f]+|\\d+(?:\\.\\d+)?)\\b)`,'gi');let result='',last=0;for(const match of String(source).matchAll(token)){result+=escape(source.slice(last,match.index));const value=match[0],kind=/^\/\//.test(value)||/^\/\*/.test(value)||/^#/.test(value)?'comment':/^["']/.test(value)?'string':/^\d|^0x/i.test(value)?'number':'keyword';result+=`<span class="token-${kind}">${escape(value)}</span>`;last=match.index+value.length}return result+escape(source.slice(last))}
function labTools(tools,block,note){
 if(['javascript','c','python'].includes(block.language)){
  const run=document.createElement('button');run.textContent='▶ Run';run.title='Run this cell · ⌘R or ⌘Enter';run.onclick=()=>runLab(note,block.id);tools.append(run);
 }
 const duplicate=document.createElement('button');duplicate.textContent='Duplicate';duplicate.title='Try a variation';duplicate.onclick=()=>{const copy={...block,id:uid()};delete copy.result;note.blocks.splice(note.blocks.indexOf(block)+1,0,copy);persist();render();document.querySelectorAll('#editor textarea')[note.blocks.indexOf(copy)].focus()};tools.append(duplicate);
}
function labResult(wrap,block,note){
 if(!['javascript','c','python'].includes(block.language))return;
 const prediction=document.createElement('details');prediction.className='prediction';prediction.open=!!block.prediction;
 const summary=document.createElement('summary');summary.textContent='Before you run: what do you expect?';
 const input=document.createElement('textarea');input.placeholder='An optional prediction…';input.value=block.prediction||'';input.setAttribute('aria-label','Prediction');input.oninput=()=>{block.prediction=input.value;persist()};prediction.append(summary,input);wrap.append(prediction);
 const result=document.createElement('div');result.className='result';result.dataset.block=block.id;result.setAttribute('role','status');wrap.append(result);paintResult(result,block,note);
}
function paintResult(el,block,note){
 const result=block.result;el.replaceChildren();el.hidden=!result;if(!result)return;
 const label=document.createElement('div');label.className='result-label';label.textContent=(result.signature!==labSignature(note,block.id)?'Code changed · run again':result.error?'Something to investigate':'Result');
 const output=document.createElement('pre');output.textContent=result.text||'Finished with no output. Use console.log(value) to see a value.';el.classList.toggle('error',!!result.error);el.append(label,output);
}
function refreshResults(){if(!current())return;document.querySelectorAll('.result').forEach(el=>{const block=current().blocks.find(b=>b.id===el.dataset.block);if(block)paintResult(el,block,current())})}
function runLab(note,lastId){
 const requested=lastId?note.blocks.find(block=>block.id===lastId):[...note.blocks].reverse().find(block=>block.type==='code'&&['c','python'].includes(block.language));
 if(['c','python'].includes(requested?.language)){const requestID=crypto.randomUUID();requested.result={text:requested.language==='c'?'Compiling with Clang…':'Starting Python…',running:true,signature:labSignature(note,requested.id)};nativeRuns.set(requestID,{note,block:requested});persist();refreshResults();native({type:'runCode',requestID,language:requested.language,code:requested.text});return}
 if(experiment){const previous=experiment;previous.stop('Stopped');if(previous.note===note&&previous.lastId===lastId)return;}
 const cells=note.blocks.slice(0,lastId?note.blocks.findIndex(b=>b.id===lastId)+1:undefined).filter(b=>b.type==='code'&&b.language==='javascript');if(!cells.length)return;
 const signatures=new Map(cells.map(b=>[b.id,labSignature(note,b.id)]));
 const prelude=`let cell;let count=0;const format=v=>{if(typeof v==='string')return v;try{return JSON.stringify(v,null,2)??String(v)}catch{return String(v)}};console.log=console.info=console.warn=console.error=(...v)=>{if(count++<200)postMessage({cell,text:v.map(format).join(' ').slice(0,12000)})};`;
 const source=prelude+'(async()=>{try{'+cells.map(b=>'cell='+JSON.stringify(b.id)+';postMessage({cell,start:true});\n'+b.text+'\n;postMessage({cell,done:true});\n').join('')+'}catch(e){postMessage({cell,error:true,text:e.name+": "+e.message})}finally{postMessage({finished:true})}})()';
 let worker,url,timer,finished=false;
 const job={note,lastId,stop(message){finish(message)}};
 function finish(message){if(finished)return;finished=true;clearTimeout(timer);worker?.terminate();if(url)URL.revokeObjectURL(url);if(experiment===job)experiment=null;$('#run-all').textContent='Run all';if(message){const b=cells.find(b=>b.result?.running)||cells[0];b.result={...b.result,text:message,error:true,signature:signatures.get(b.id)}}cells.forEach(b=>{if(b.result?.text==='Waiting…')b.result.text='Not run. Run again after checking the earlier cells.';if(b.result)delete b.result.running});persist();refreshResults()}
 try{
  url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new Worker(url);experiment=job;
  cells.forEach(b=>b.result={text:'Waiting…',signature:signatures.get(b.id)});refreshResults();$('#run-all').textContent='Stop';
  worker.onmessage=({data})=>{if(data.finished){finish();return}const b=cells.find(b=>b.id===data.cell);if(!b)return;if(data.start)b.result={text:'',running:true,signature:signatures.get(b.id)};if(data.text!==undefined){b.result.text+=(b.result.text?'\n':'')+data.text;b.result.text=b.result.text.slice(0,24000);b.result.error=!!data.error}if(data.done)delete b.result.running;refreshResults()};
  worker.onerror=e=>{e.preventDefault();finish(e.message||'Could not run this code. Check its syntax and try again.')};
  timer=setTimeout(()=>finish('Stopped after 3 seconds. Check for a loop that never finishes, then try again.'),3000);
 }catch(e){finish('Could not start the experiment: '+e.message)}
}
window.marginNativeRunResult=data=>{const job=nativeRuns.get(data?.requestID);if(!job)return;nativeRuns.delete(data.requestID);job.block.result={text:data.text||'Finished with no output.',error:!!data.error,signature:labSignature(job.note,job.block.id)};persist();refreshResults()};
