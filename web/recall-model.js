// Study items: what a student can be asked, how it is scheduled, and how a quiz is assembled.
// Pure functions over `state`; the UI lives in recall.js. Needs Knowledge (knowledge.js).
const RecallModel=(()=>{
 const DAY=86400000,MINUTE=60000,GRADES=['Again','Hard','Good','Easy'];
 const hash=text=>{let h=5381;for(const c of String(text))h=((h<<5)+h+c.charCodeAt(0))>>>0;return h.toString(36)};
 const squash=text=>String(text).replace(/\s+/g,' ').trim();
 // Signs, decimal points, fractions and percents inside numbers survive (parked in private-use characters while the rest is stripped).
 const NUMBER_MARKS={'':'.','':'/','':'-','':'%'};
 const normalize=text=>squash(String(text).toLowerCase().replace(/[‘’]/g,"'").replace(/[−–—]/g,'-')
  .replace(/(\d),(?=\d{3}(?!\d))/g,'$1').replace(/(\d)\.(?=\d)/g,'$1').replace(/(\d)\/(?=\d)/g,'$1').replace(/(^|[\s(=])-(?=\d)/g,'$1').replace(/(\d)%/g,'$1')
  .replace(/[^\p{L}\p{N}' -]+/gu,' ').replace(/\b(?:the|a|an)\b/g,' ').replace(/[-]/g,c=>NUMBER_MARKS[c]));
 // Answers with no letters or digits (∫, →, +) are compared symbol for symbol.
 const symbols=text=>String(text).toLowerCase().replace(/[−–—]/g,'-').replace(/\s+/g,'');
 const DEFAULT_NEW_PER_DAY=10;
 const sentences=text=>String(text).split(/\n+/).flatMap(line=>squash(line).match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)||[]).map(s=>s.trim()).filter(Boolean);

 // ── Markup written straight into a note ─────────────────────────────────────
 // `Q: …` + `A: …` pairs and `{{hidden words}}` / `{{hidden::hint}}` become items without any dialog.
 function parseMarkup(text){
  const found=[],lines=String(text).replace(/```[\s\S]*?```/g,'').split('\n');
  const strip=line=>line.replace(/^\s*(?:[-*+]\s+)?/,'').replace(/\*\*/g,'');
  for(let i=0;i<lines.length;i++){
   const line=strip(lines[i]);
   const inline=line.match(/^Q(?:uestion)?\s*[:：]\s*(.+?\?)\s+A(?:nswer)?\s*[:：]\s*(.+)$/i);
   if(inline){found.push({type:'qa',prompt:squash(inline[1]),answer:squash(inline[2])});continue}
   const q=line.match(/^Q(?:uestion)?\s*[:：]\s*(.+)$/i);if(!q)continue;
   let prompt=q[1],j=i+1;while(j<lines.length&&lines[j].trim()&&!/^\s*(?:[-*+]\s+)?(?:\*\*)?A(?:nswer)?(?:\*\*)?\s*[:：]/i.test(lines[j])&&!/^\s*(?:[-*+]\s+)?(?:\*\*)?Q(?:uestion)?(?:\*\*)?\s*[:：]/i.test(lines[j]))prompt+=' '+lines[j++].trim();
   if(j>=lines.length)continue;const a=strip(lines[j]).match(/^A(?:nswer)?\s*[:：]\s*(.*)$/i);if(!a)continue;
   let answer=a[1];j++;while(j<lines.length&&lines[j].trim()&&!/^\s*(?:[-*+]\s+)?(?:\*\*)?Q(?:uestion)?(?:\*\*)?\s*[:：]/i.test(lines[j]))answer+='\n'+lines[j++].trim();
   if(squash(prompt)&&squash(answer)){found.push({type:'qa',prompt:squash(prompt),answer:answer.trim()});i=j-1}
  }
  const marked=/\{\{([^{}]{1,120}?)(?:::([^{}]{1,120}))?\}\}/g;
  for(const sentence of sentences(String(text).replace(/```[\s\S]*?```/g,''))){
   const blanks=[...sentence.matchAll(marked)];if(!blanks.length)continue;
   const clean=sentence.replace(marked,(_,word)=>word);
   blanks.forEach(m=>found.push({type:'cloze',text:squash(Knowledge.prose(clean)),blank:squash(m[1]),hint:m[2]?squash(m[2]):''}));
  }
  return found;
 }

 // ── Items ───────────────────────────────────────────────────────────────────
 // type: qa | cloze | explain | passage.  origin: made (by the student) | markup | legacy.
 function noteItems(note){
  const out=[];
  for(const block of note.blocks||[]){
   if(block.type!=='text'||!block.text)continue;
   for(const m of parseMarkup(block.text)){
    const base={noteId:note.id,blockId:block.id,projectId:note.projectId||null,unitId:note.unitId||null,origin:'markup'};
    if(m.type==='qa')out.push({...base,type:'qa',prompt:m.prompt,answer:m.answer,id:note.id+':'+block.id+':qa:'+hash(m.prompt)});
    else{const mask=m.text.replace(m.blank,'\u0000');out.push({...base,type:'cloze',text:m.text,blank:m.blank,hint:m.hint,prompt:'',answer:m.blank,id:note.id+':'+block.id+':cloze:'+hash(mask+'|'+m.blank)})}
   }
  }
  return out;
 }
 function collect(state,{notes,projectId=null,unitId=null,exclude=null}={}){
  const all=state.notes||[],scoped=notes||all.filter(n=>(!projectId||n.projectId===projectId)&&(!unitId||n.unitId===unitId));
  const ids=new Set(scoped.map(n=>n.id)),out=[],seen=new Set(),push=item=>{if(seen.has(item.id))return;seen.add(item.id);out.push(item)};
  const markupBlocks=new Set();
  for(const note of scoped)for(const item of noteItems(note)){markupBlocks.add(item.blockId);push(item)}
  for(const item of state.items||[]){
   const note=item.noteId?all.find(n=>n.id===item.noteId):null,owner=item.projectId??note?.projectId??null;
   if(notes?!(item.noteId&&ids.has(item.noteId)):(projectId&&owner!==projectId))continue;
   if(unitId&&(note?.unitId??item.unitId)!==unitId)continue;
   push({...item,origin:'made',projectId:owner,unitId:note?.unitId??item.unitId??null,answer:item.type==='cloze'?item.blank:item.answer});
  }
  for(const card of Knowledge.cards(scoped)){
   if(markupBlocks.has(card.blockId)&&card.kind!=='authored')continue;
   const note=all.find(n=>n.id===card.noteId);
   push({id:card.id,type:card.kind==='authored'||card.kind==='question'?'qa':'passage',prompt:state.reviewPrompts?.[card.id]||card.question,answer:card.answer,noteId:card.noteId,blockId:card.blockId,projectId:note?.projectId||null,unitId:note?.unitId||null,origin:card.kind==='authored'?'made':'legacy',kind:card.kind});
  }
  return out.filter(item=>!state.suspended?.[item.id]&&!(exclude&&item.projectId&&exclude.has(item.projectId)));
 }
 // Every item, suspended or not, for the question bank.
 function collectAll(state,scope){return collect({...state,suspended:{}},scope)}
 function clozeParts(item){
  const index=item.text.indexOf(item.blank);
  return index<0?{before:item.text+' ',after:''}:{before:item.text.slice(0,index),after:item.text.slice(index+item.blank.length)};
 }
 const promptText=item=>item.type==='cloze'?(()=>{const p=clozeParts(item);return p.before+'[…]'+p.after})():item.prompt;
 function newItem(fields){
  const base={id:'item-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),created:Date.now(),noteId:null,blockId:null,projectId:null,unitId:null};
  const item={...base,...fields};if(item.type==='cloze'){item.blank=squash(item.blank||'');item.text=squash(item.text||'')}else{item.prompt=squash(item.prompt||'');item.answer=String(item.answer||'').trim()}
  return item;
 }
 function validItem(item){
  if(item.type==='cloze')return !!item.blank&&!!item.text&&item.text.includes(item.blank);
  if(item.type==='explain')return !!item.prompt;
  return !!item.prompt&&!!item.answer;
 }

 // ── Suggestions: draft items from a note for the student to accept or edit ──
 function suggest(note,state={}){
  const have=new Set(collectAll(state,{notes:[note]}).map(i=>i.id)),found=[],claimed=new Set();
  let heading='',waiting=false;
  for(const block of note.blocks||[]){
   if(block.type!=='text'||!block.text)continue;
   const base={noteId:note.id,blockId:block.id,projectId:note.projectId||null,unitId:note.unitId||null,origin:'made'};
   const paragraphs=block.text.replace(/```[\s\S]*?```/g,'').split(/\n\s*\n/);
   for(const raw of paragraphs){
    const h=raw.match(/^#{1,6}\s+([^\n]+)/);
    if(h){heading=Knowledge.prose(h[1]);waiting=true}
    const body=Knowledge.prose(raw.replace(/^#{1,6}[^\n]*\n?/,''));
    if(waiting&&heading&&body.length>=70&&body.length<=1200){waiting=false;add({...base,type:'explain',prompt:'Explain '+heading.replace(/[?.:]+$/,'')+' in your own words.',answer:body,id:note.id+':'+block.id+':explain:'+hash(heading)},3)}
    for(const sentence of sentences(raw.replace(/^#{1,6}[^\n]*\n?/,''))){
     if(/^\s*Q(?:uestion)?\s*[:：]/i.test(sentence)||/\{\{/.test(sentence))continue;
     const clean=Knowledge.prose(sentence);if(clean.length<35||clean.length>260)continue;
     const bold=[...sentence.matchAll(/\*\*([^*]{2,60})\*\*/g)].map(m=>squash(m[1])).filter(w=>clean.includes(w));
     const definition=clean.match(/^([\p{L}\d][\p{L}\d ()'-]{2,50}?)\s+(is defined as|refers to|is called|is|are)\s+(.{20,})$/u);
     if(definition&&!/^(?:this|that|it|there|which|these|those|here)\b/i.test(definition[1])&&definition[1].split(' ').length<=6){
      const verb=definition[2]==='are'?'are':'is',answer=definition[3].replace(/[.]+$/,'');
      add({...base,type:'qa',prompt:'What '+verb+' '+definition[1]+'?',answer:definition[1]+' '+definition[2]+' '+answer+'.',id:note.id+':'+block.id+':qa:'+hash('What '+verb+' '+definition[1]+'?')},bold.length?4:2);
     }
     for(const word of bold.slice(0,2))if(!definition||!definition[1].includes(word)){const mask=clean.replace(word,'\u0000');add({...base,type:'cloze',text:clean,blank:word,hint:'',prompt:'',answer:word,id:note.id+':'+block.id+':cloze:'+hash(mask+'|'+word)},3)}
    }
   }
  }
  function add(item,score){if(have.has(item.id)||claimed.has(item.id))return;claimed.add(item.id);found.push({...item,score})}
  return found.sort((a,b)=>b.score-a.score).slice(0,16);
 }

 // ── Scheduling (SM-2 family) ────────────────────────────────────────────────
 // Review state per item: {due, interval (days), ease, reps, lapses, reviewedAt, rating}. Older records lack ease/reps.
 function schedule(previous,rating,now=Date.now()){
  const p=previous||{},interval=p.interval||0,reps=p.reps??(interval?1:0),ease=p.ease||2.5,lapses=p.lapses||0;
  const early=p.due&&now<p.due-DAY/2&&(rating==='Good'||rating==='Easy');
  if(early)return {...p,ease,reps,lapses,reviewedAt:now,rating,practised:(p.practised||0)+1};
  let next,e=ease,r=reps,l=lapses;
  if(rating==='Again'){e=Math.max(1.3,ease-.2);r=0;l++;next=0}
  else if(rating==='Hard'){e=Math.max(1.3,ease-.15);r=Math.max(reps,1);next=reps?Math.max(1,Math.round(interval*1.2)):1}
  else if(rating==='Good'){r=reps+1;next=reps===0?1:reps===1?3:Math.round(Math.max(interval,1)*ease)}
  else{e=ease+.15;r=reps+1;next=reps===0?4:Math.round(Math.max(interval,1)*ease*1.3)}
  next=Math.min(180,next);
  return {due:now+(next?next*DAY:10*MINUTE),interval:next,ease:e,reps:r,lapses:l,reviewedAt:now,rating};
 }
 function preview(previous,now=Date.now()){
  return Object.fromEntries(GRADES.map(g=>{const s=schedule(previous,g,now);return [g,s.interval?s.interval+'d':'10m']}));
 }
 // Chance of recalling right now, 90% at the due date.
 function retrievability(review,now=Date.now()){
  if(!review)return 0;const elapsed=Math.max(0,(now-(review.reviewedAt||now))/DAY),span=Math.max(review.interval||0,.17);
  return Math.pow(.9,elapsed/span);
 }
 function status(review,now=Date.now()){
  if(!review)return 'new';
  if(review.rating==='Again'&&review.due<=now+DAY||review.lapses>=3&&retrievability(review,now)<.9)return 'weak';
  if((review.interval||0)<1)return 'learning';
  return review.due<=now?'due':review.interval>=21?'mature':'young';
 }
 const isDue=(review,now)=>!review||review.due<=now;

 function interleave(list){
  const queue=[],rest=list.slice();
  while(rest.length){const k=rest.findIndex(i=>i.noteId!==queue.at(-1)?.noteId);queue.push(rest.splice(k<0?0:k,1)[0])}
  return queue;
 }
 const priority=item=>item.origin==='legacy'?1:0;
 // modes: due (scheduled reviews + a few new), weak (shakiest first), quiz (due, then weak, then new, then anything)
 function queue(items,reviews={},{mode='due',now=Date.now(),limit=10,newLimit=6,rng=Math.random}={}){
  const r=i=>reviews[i.id],R=i=>retrievability(r(i),now);
  const due=items.filter(i=>r(i)&&r(i).due<=now).sort((a,b)=>R(a)-R(b));
  const fresh=items.filter(i=>!r(i)).sort((a,b)=>priority(a)-priority(b));
  const weak=items.filter(i=>r(i)&&['weak','learning'].includes(status(r(i),now))||r(i)&&R(i)<.8).sort((a,b)=>R(a)-R(b));
  const rest=items.filter(i=>r(i)).sort(()=>rng()-.5);
  let picked;
  if(mode==='weak')picked=weak;
  else if(mode==='quiz')picked=[...due,...weak,...fresh,...rest];
  else picked=[...due,...fresh.slice(0,newLimit)];
  const seen=new Set(),unique=picked.filter(i=>!seen.has(i.id)&&seen.add(i.id)).slice(0,limit);
  return interleave(unique);
 }
 // `allowance` caps how many new items count as ready (today's remaining new-item budget).
 function stats(items,reviews={},now=Date.now(),allowance=Infinity){
  const s={total:items.length,due:0,new:0,weak:0,learning:0,mature:0,ready:0};let fresh=0;
  for(const item of items){const st=status(reviews[item.id],now);if(st==='new'){s.new++;if(fresh<allowance){fresh++;s.ready++}}else if(st==='due'){s.due++;s.ready++}else if(st==='weak'){s.weak++;s.ready++}else if(st==='learning'){s.learning++;if(reviews[item.id].due<=now)s.ready++}else if(st==='mature')s.mature++}
  return s;
 }
 function weakTopics(items,reviews={},now=Date.now(),limit=5){
  const by=new Map();
  for(const item of items){const rev=reviews[item.id];if(!rev||!item.noteId)continue;const t=by.get(item.noteId)||{noteId:item.noteId,count:0,sum:0};t.count++;t.sum+=retrievability(rev,now);by.set(item.noteId,t)}
  return [...by.values()].map(t=>({noteId:t.noteId,count:t.count,strength:t.sum/t.count})).filter(t=>t.strength<.85).sort((a,b)=>a.strength-b.strength).slice(0,limit);
 }
 // `first` marks the review that introduced a new item, which is what the daily new-item limit counts.
 function logReview(state,id,rating,mode,now=Date.now(),first=false){
  state.reviewLog??=[];state.reviewLog.push({id,t:now,rating,mode,first});if(state.reviewLog.length>5000)state.reviewLog.splice(0,state.reviewLog.length-5000);
 }
 function reviewedToday(state,now=Date.now()){
  const start=new Date(now).setHours(0,0,0,0);return (state.reviewLog||[]).filter(e=>e.t>=start).length;
 }
 function newToday(state,now=Date.now()){
  const start=new Date(now).setHours(0,0,0,0);return (state.reviewLog||[]).filter(e=>e.t>=start&&e.first).length;
 }
 // New items still allowed today: the daily limit (default 10, `state.recallNewPerDay`) minus those already started.
 function allowance(state,now=Date.now()){
  return Math.max(0,(Number(state.recallNewPerDay)||DEFAULT_NEW_PER_DAY)-newToday(state,now));
 }
 // What is waiting right now: scheduled reviews that are due, plus new items up to today's allowance.
 function workload(items,reviews={},now=Date.now(),newAllowance=Infinity){
  let due=0,fresh=0;
  for(const item of items){const r=reviews[item.id];if(!r)fresh++;else if(r.due<=now)due++}
  return {due,new:Math.min(fresh,newAllowance),ready:due+Math.min(fresh,newAllowance)};
 }

 // ── Answering ───────────────────────────────────────────────────────────────
 function distance(a,b){
  if(a===b)return 0;if(Math.abs(a.length-b.length)>3)return 4;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(prev[j]+1,row[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row}
  return prev[b.length];
 }
 // Short answers can be checked; long ones need the student's own judgement.
 const checkable=item=>item.type==='cloze'||(item.type==='qa'&&normalize(item.answer).length<=40&&normalize(item.answer).split(' ').length<=6);
 function check(item,typed){
  if(!checkable(item))return null;
  const answer=item.type==='cloze'?item.blank:item.answer,want=normalize(answer),got=normalize(typed);
  if(!want)return symbols(typed)&&symbols(typed)===symbols(answer)?'correct':'wrong';
  if(!got)return 'wrong';if(got===want)return 'correct';
  if(/\d/.test(want))return 'wrong'; // a wrong number, date or formula is not a spelling slip
  const forgiving=Math.max(1,Math.floor(want.length/6));
  return distance(got,want)<=forgiving&&want.length>3?'close':'wrong';
 }
 const suggestedGrade=result=>result==='correct'?'Good':result==='close'?'Hard':result==='wrong'?'Again':'Good';
 // Which key ideas of the reference answer did the student's own words touch?
 function coverage(reference,typed){
  const want=[...new Set(Knowledge.terms(reference))].slice(0,12),got=new Set(Knowledge.terms(typed).map(w=>w.replace(/(?:ing|ed|es|s)$/,'')));
  const stem=w=>w.replace(/(?:ing|ed|es|s)$/,'');
  return {hit:want.filter(w=>got.has(stem(w))),missed:want.filter(w=>!got.has(stem(w)))};
 }
 function distractors(item,pool,count=3,rng=Math.random){
  const answer=item.type==='cloze'?item.blank:item.answer,key=normalize(answer),seen=new Set([key]),shape=w=>/^[\d.,%-]+$/.test(w.trim());
  const candidates=pool.filter(o=>o.id!==item.id&&(o.type==='cloze'||o.type==='qa')&&checkable(o)).map(o=>o.type==='cloze'?o.blank:o.answer)
   .filter(a=>{const k=normalize(a);if(!k||seen.has(k))return false;seen.add(k);return shape(a)===shape(answer)&&!(k.includes(key)||key.includes(k))})
   .sort((a,b)=>Math.abs(a.length-answer.length)-Math.abs(b.length-answer.length)).slice(0,count*3);
  return candidates.sort(()=>rng()-.5).slice(0,count);
 }
 // Decide how to ask: 'choice' (quiz only), 'type' (checkable), or 'self' (compare, then grade honestly).
 function format(item,pool,{quiz=false,rng=Math.random}={}){
  if(quiz&&checkable(item)&&item.type!=='passage'){const wrong=distractors(item,pool,3,rng);if(wrong.length>=2){const right=item.type==='cloze'?item.blank:item.answer;return {kind:'choice',choices:[...wrong,right].sort(()=>rng()-.5),answer:right}}}
  return {kind:checkable(item)?'type':'self'};
 }
 function summarize(results){
  const correct=results.filter(r=>r.rating==='Good'||r.rating==='Easy').length;
  const byNote=new Map();for(const r of results)if(r.item.noteId&&(r.rating==='Again')){byNote.set(r.item.noteId,(byNote.get(r.item.noteId)||0)+1)}
  return {total:results.length,correct,pct:results.length?Math.round(correct/results.length*100):0,missed:results.filter(r=>r.rating==='Again').map(r=>r.item),restudy:[...byNote].map(([noteId,count])=>({noteId,count})).sort((a,b)=>b.count-a.count)};
 }

 return {parseMarkup,noteItems,collect,collectAll,clozeParts,promptText,newItem,validItem,suggest,schedule,preview,retrievability,status,isDue,queue,stats,weakTopics,logReview,reviewedToday,newToday,allowance,workload,DEFAULT_NEW_PER_DAY,check,checkable,suggestedGrade,coverage,distractors,format,summarize,normalize,sentences,GRADES};
})();
