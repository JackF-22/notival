// Evidence-based local discovery. Scores indicate shared vocabulary, not factual agreement.
const Knowledge = (()=>{
 const stop=new Set('the and for that this with from have your you are was were will would could should into about their there these those then than also what when where which how does did has had not but can its our out all one two use using used note notes lecture chapter section example'.split(' '));
 // Math ($…$ and $$…$$) is set aside while markup is stripped, so x_i and 2*3 inside an equation survive.
 function prose(text){const math=[];return String(text).replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g,m=>'\uE010'+(math.push(m)-1)+'\uE011')
  .replace(/```[\s\S]*?```/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,'').replace(/[*_`~]/g,'').replace(/^\s*(?:#{1,6}|>|[-+]\s\[[ xX]\])\s*/gm,'').trim().replace(/\uE010(\d+)\uE011/g,(_,i)=>math[i] ?? '')}
 function terms(text){return (prose(text).toLowerCase().match(/[\p{L}][\p{L}\p{N}-]{2,}/gu)||[]).filter(word=>!stop.has(word))}
 function analyze(notes){
  const docs=notes.map(note=>{const passages=note.blocks.filter(b=>b.type==='text'&&b.text.trim()).map(b=>({noteId:note.id,blockId:b.id,text:b.text}));const counts=new Map();for(const word of terms(note.title+' '+passages.map(p=>p.text).join(' ')))counts.set(word,(counts.get(word)||0)+1);return {note,passages,counts}});
  const frequency=new Map();for(const doc of docs)for(const term of doc.counts.keys())frequency.set(term,(frequency.get(term)||0)+1);
  for(const doc of docs){doc.weights=new Map([...doc.counts].map(([word,count])=>[word,(1+Math.log(count))*(1+Math.log((docs.length+1)/(frequency.get(word)+1)))]));doc.norm=Math.sqrt([...doc.weights.values()].reduce((s,v)=>s+v*v,0))}
  const links=[];for(let i=0;i<docs.length;i++)for(let j=i+1;j<docs.length;j++){const a=docs[i],b=docs[j];if((a.note.projectId||null)!==(b.note.projectId||null))continue;const shared=[...a.weights.keys()].filter(word=>b.weights.has(word)).sort((x,y)=>(a.weights.get(y)*b.weights.get(y))-(a.weights.get(x)*b.weights.get(x)));const score=shared.reduce((s,w)=>s+a.weights.get(w)*b.weights.get(w),0)/(a.norm*b.norm||1);if(shared.length<2||score<.18)continue;const excerpt=doc=>doc.passages.slice().sort((x,y)=>terms(y.text).filter(w=>shared.slice(0,5).includes(w)).length-terms(x.text).filter(w=>shared.slice(0,5).includes(w)).length)[0];if(a.passages.length&&b.passages.length){const evidence=[excerpt(a),excerpt(b)];if(evidence.some(p=>new Set(terms(p.text).filter(w=>shared.includes(w))).size<2))continue;links.push({id:[a.note.id,b.note.id].sort().join('::'),a:a.note.id,b:b.note.id,score,terms:shared.slice(0,5),evidence})}}
  return {links:links.sort((a,b)=>b.score-a.score),concepts:[...frequency].filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]).slice(0,16)};
 }
 function cards(notes){
  const result=[],seen=new Set();
  for(const note of notes)for(const q of note.questions||[]){if(q.explanation?.trim())result.push({id:note.id+':question:'+q.id+':'+q.explanation,noteId:note.id,blockId:q.blockId,question:q.title,answer:q.explanation+(q.evidence?'\n\nEvidence: '+q.evidence:''),kind:'authored'})}
  for(const note of notes)for(const block of note.blocks.filter(b=>b.type==='text')){
   let heading=note.title||'this note';const chunks=block.text.replace(/```[\s\S]*?```/g,'').split(/\n\s*\n/);
   for(const raw of chunks){const h=raw.match(/^#{1,6}\s+([^\n]+)/);if(h)heading=prose(h[1]);const answer=prose(raw);if(answer.length<45||answer.length>2200||!terms(answer).length)continue;
    const canonical=answer.toLowerCase().replace(/\s+/g,' ');if(seen.has(canonical))continue;seen.add(canonical);
    const definition=answer.match(/^([\p{L}\d][\p{L}\d ()-]{2,65}?)\s+(?:is defined as|refers to|is|are)\s+(.{20,})/u);
    const explicit=answer.match(/^(?:Q(?:uestion)?:\s*)?([^\n?]{8,180}\?)[\s\S]{20,}/i);
    const question=explicit?explicit[1]:definition?`How would you explain ${definition[1]}?`:`What are the key ideas about ${heading}? Explain them before checking the source.`;
    // Preserve the original passage for provenance; a content edit gets a new review identity.
    result.push({id:note.id+':'+block.id+':'+raw,noteId:note.id,blockId:block.id,question,answer:raw,kind:explicit?'question':definition?'definition':'passage'});
   }
  }
  return result;
 }
 function reviewQueue(cards,reviews={},now=Date.now(),limit=10){
  const due=cards.filter(c=>!reviews[c.id]||reviews[c.id].due<=now).sort((a,b)=>(reviews[a.id]?.due??Infinity)-(reviews[b.id]?.due??Infinity));
  const queue=[];while(due.length&&queue.length<limit){const different=due.findIndex(c=>c.noteId!==queue.at(-1)?.noteId);queue.push(due.splice(different<0?0:different,1)[0])}return queue;
 }
 function schedule(previous,rating,now=Date.now()){
  const interval=previous?.interval||0;
  const days=rating==='Again'?0:rating==='Hard'?Math.max(1,Math.min(interval,3)):rating==='Good'?Math.max(3,interval*2):Math.max(7,interval*3);
  return {due:now+(days?Math.min(90,days)*86400000:600000),interval:Math.min(90,days),reviewedAt:now,rating};
 }
 return {analyze,cards,prose,terms,reviewQueue,schedule};
})();
