// Study items: what a student can be asked, how it is scheduled, and how a quiz is assembled.
// Pure functions over `state`; the UI lives in recall.js. Needs Knowledge (knowledge.js).
const RecallModel=(()=>{
 const DAY=86400000,MINUTE=60000,GRADES=['Again','Hard','Good','Easy'];
 const hash=text=>{let h=5381;for(const c of String(text))h=((h<<5)+h+c.charCodeAt(0))>>>0;return h.toString(36)};
 const squash=text=>String(text).replace(/\s+/g,' ').trim();
 // Signs, decimal points, fractions and percents inside numbers survive (parked in private-use characters while the rest is stripped).
 const NUMBER_MARKS={'\uE000':'.','\uE001':'/','\uE002':'-','\uE003':'%'};
 const normalize=text=>squash(String(text).normalize('NFC').replace(/[\u0300\u0301]/g,'').toLowerCase().replace(/ё/g,'е').replace(/[‘’]/g,"'").replace(/[−–—]/g,'-')
  .replace(/(\d),(?=\d{3}(?!\d))/g,'$1').replace(/(\d)\.(?=\d)/g,'$1\uE000').replace(/(\d)\/(?=\d)/g,'$1\uE001').replace(/(^|[\s(=])-(?=\d)/g,'$1\uE002').replace(/(\d)%/g,'$1\uE003')
  .replace(/[^\p{L}\p{N}' \uE000-\uE003]+/gu,' ').replace(/\b(?:the|a|an)\b/g,' ').replace(/[\uE000-\uE003]/g,c=>NUMBER_MARKS[c]));
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
   // Only questions a person wrote. Cards auto-made from every paragraph were mostly noise, so they are no longer asked.
   if(card.kind!=='authored'&&card.kind!=='question')continue;
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
 // Precision over volume: a suggestion must stand on its own, read like a real question, and add something
 // the student doesn't already have. One question per fact, however many ways the notes state it.
 const OPENERS=/^(?:this|that|it|its|they|their|he|she|we|there|these|those|here|which|some|such|each|both|another|other|many|most|all|however|also|thus|therefore|so|but|and|or|then|for (?:example|instance)|in addition|moreover|finally|because|although|while|since|as|if|when)\b/i;
 const CHORES=/\b(?:remember to|don'?t forget|todo|to-do|homework|assignment|deadline|due (?:on|by|date)|read (?:chapter|ch\.?|pages?)|office hours|e-?mail|submit|sign up)\b/i;
 const GENERIC_HEADINGS=/^(?:notes?|summary|overview|intro(?:duction)?|review|key (?:terms|points|ideas|takeaways)|terms|vocab(?:ulary)?|questions?|examples?|agenda|todo|to-?do|homework|reading|references?|links?|misc(?:ellaneous)?|conclusion|recap|lecture \d+|week \d+|day \d+|untitled)$/i;
 const SUBJECT_JUNK=/\b(?:that|which|who|because|when|if|why|how|what)\b|^(?:reason|way|fact|idea|result|main|key|first|second|third|number|type|kind|part|one|thing|point)\b/i;
 // "X is made mostly in Y" states a fact about X; it doesn't define it.
 const PREDICATE_JUNK=/^(?:\p{L}+(?:ed|ing)|not|also|often|usually|always|never|just|only|very|now|then|still|more|less|able|likely|made|done|seen|given|taken|known|shown|built|held|set|put|run|found)\b/iu;
 const stem=w=>w.replace(/(?:ing|ed|es|s)$/,'');
 const termSet=text=>new Set(Knowledge.terms(text).map(stem));
 const dropArticle=t=>t.replace(/^(?:the|a|an)\s+/i,'');
 // Is the shorter of two texts mostly contained in the other? (A sentence vs. the paragraph it came from.)
 function overlaps(a,b){
  if(!a.size||!b.size)return false;let shared=0;for(const w of a)if(b.has(w))shared++;
  return shared/Math.min(a.size,b.size)>=.7&&shared>=2;
 }
 const sourceText=item=>item.type==='cloze'?item.text:item.type==='qa'?item.prompt+' '+item.answer:(item.answer||item.prompt);
 const subjectKey=item=>item.type==='cloze'?normalize(item.blank):item.type==='explain'?normalize(item.prompt.replace(/^Explain\s+|\s+in your own words\.?$/gi,'')):normalize(dropArticle(item.prompt.replace(/^What (?:is|are)\s+|\?$/gi,'')));

 function candidates(note){
  const found=[];let heading='',waiting=false;
  for(const block of note.blocks||[]){
   if(block.type!=='text'||!block.text)continue;
   const base={noteId:note.id,blockId:block.id,projectId:note.projectId||null,unitId:note.unitId||null,origin:'made'};
   for(const raw of block.text.replace(/```[\s\S]*?```/g,'').split(/\n\s*\n/)){
    const h=raw.match(/^#{1,6}\s+([^\n]+)/);
    if(h){heading=Knowledge.prose(h[1]);waiting=true}
    const rest=raw.replace(/^#{1,6}[^\n]*\n?/,''),body=Knowledge.prose(rest);
    let covered=false;
    if(!/^\s*(?:[-*+]\s+)?\[[ xX]\]/.test(rest))for(const sentence of sentences(rest)){
     if(/^\s*(?:[-*+]\s+)?(?:\*\*)?Q(?:uestion)?(?:\*\*)?\s*[:：]/i.test(sentence)||/\{\{/.test(sentence))continue;
     const clean=Knowledge.prose(sentence);
     if(clean.length<35||clean.length>260||clean.split(' ').length<6||OPENERS.test(clean)||CHORES.test(clean))continue;
     const bold=[...sentence.matchAll(/\*\*([^*]{3,60})\*\*/g)].map(m=>squash(m[1])).filter(w=>clean.includes(w)&&clean.split(w).length===2&&Knowledge.terms(w).length);
     const m=clean.match(/^([\p{L}\d][\p{L}\d ()'-]{2,50}?)\s+(is defined as|refers to|is called|is|are)\s+(.{20,})$/u);
     const subject=m&&dropArticle(m[1].trim()),usable=m&&subject.split(' ').length<=5&&Knowledge.terms(subject).length&&!SUBJECT_JUNK.test(subject)&&!OPENERS.test(subject)&&!PREDICATE_JUNK.test(m[3]);
     if(usable){
      const verb=m[2]==='are'?'are':'is',shown=/^(?:the|a|an)\s/i.test(m[1])?m[1].replace(/^(\w)/,c=>c.toLowerCase()):m[1],prompt='What '+verb+' '+shown+'?';
      found.push({...base,type:'qa',prompt,answer:clean.replace(/[.]+$/,'')+'.',id:note.id+':'+block.id+':qa:'+hash(prompt),score:bold.length?5:4});covered=true;
     }else if(bold.length){
      const word=bold[0],mask=clean.replace(word,'\u0000');
      found.push({...base,type:'cloze',text:clean,blank:word,hint:'',prompt:'',answer:word,id:note.id+':'+block.id+':cloze:'+hash(mask+'|'+word),score:3});covered=true;
     }
    }
    // A heading and its first paragraph make a good "explain it" prompt, unless a sharper question already covers that paragraph.
    if(waiting&&heading&&body.length>=70&&body.length<=1200){
     waiting=false;
     const topic=heading.replace(/[?.:]+$/,'');
     if(!covered&&!GENERIC_HEADINGS.test(topic)&&Knowledge.terms(topic).length&&!/^\s*(?:[-*+]|\d+[.)])\s/.test(rest)&&sentences(rest).length>=2){
      found.push({...base,type:'explain',prompt:/\?$/.test(heading)?heading:'Explain '+topic+' in your own words.',answer:body,id:note.id+':'+block.id+':explain:'+hash(heading),score:2});
     }
    }
   }
  }
  return found;
 }
 // Best-first; a candidate is dropped when it repeats an earlier pick or something the student already has.
 function pick(list,existing,limit){
  const kept=[],seenKeys=new Set(existing.map(subjectKey)),seenText=existing.map(i=>termSet(sourceText(i)));
  for(const item of list.slice().sort((a,b)=>b.score-a.score)){
   const key=subjectKey(item),text=termSet(sourceText(item));
   if(seenKeys.has(key)||seenText.some(t=>overlaps(t,text)))continue;
   seenKeys.add(key);seenText.push(text);kept.push(item);if(kept.length>=limit)break;
  }
  return kept;
 }
 function suggestAll(notes,state={},limit=24){
  const existing=collectAll(state,{notes}),have=new Set(existing.map(i=>i.id));
  return pick(notes.flatMap(candidates).filter(c=>!have.has(c.id)),existing,limit);
 }
 const suggest=(note,state={},limit=8)=>suggestAll([note],state,limit);

 // ── Scheduling: a memory model (FSRS-4.5) ────────────────────────────────────
 // Each item keeps two numbers about how well you know it: stability (how many days until you'd have a 90% chance of
 // remembering it) and difficulty (1 easy … 10 hard). Reviewing at the right moment grows stability most. The weights
 // are the published defaults, fitted on hundreds of millions of reviews; calibration() nudges them toward you.
 // Review state: {due, interval (days), stability, difficulty, reps, lapses, reviewedAt, rating} (+ ease for older code).
 const W=[0.4872,1.4003,3.7145,13.8206,5.1618,1.2298,0.8975,0.031,1.6474,0.1367,1.0461,2.1072,0.0793,0.3246,1.587,0.2272,2.8755];
 const DECAY=-0.5,FACTOR=19/81,MAX_INTERVAL=180,clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
 const LEVEL={Again:1,Hard:2,Good:3,Easy:4};
 // Chance of remembering after t days when stability is S; 90% at t = S.
 const forget=(t,S)=>Math.pow(1+FACTOR*t/S,DECAY);
 // Days until the chance of remembering falls to r.
 const daysFor=(S,r=.9)=>S/FACTOR*(Math.pow(r,1/DECAY)-1);
 // What we know about an item. Older records only had an interval and an ease factor: the interval was the time to 90%.
 function memory(p){
  if(p.stability>0)return {S:p.stability,D:clamp(p.difficulty||W[4],1,10)};
  const S=p.interval>0?p.interval:0,ease=p.ease||2.5;
  return {S,D:clamp(W[4]+(2.5-ease)*4,1,10)};
 }
 const easeFrom=D=>clamp(2.5-(D-W[4])/4,1.3,3);
 // `retention` is the chance of remembering you aim for at each review (0.9 by default). `examDays` is how long until a
 // test these items are for, and `factor` is your calibration: intervals shrink toward an exam so nothing is left to
 // fade right before it.
 function schedule(previous,rating,now=Date.now(),{retention=.9,examDays=null,factor=1}={}){
  const p=previous||{},G=LEVEL[rating],lapses=p.lapses||0,reps=p.reps??(p.interval?1:0);
  const early=p.due&&now<p.due-DAY/2&&(rating==='Good'||rating==='Easy');
  if(early)return {...p,reps,lapses,reviewedAt:now,rating,practised:(p.practised||0)+1};
  const known=memory(p),elapsed=p.reviewedAt?Math.max(0,(now-p.reviewedAt)/DAY):(p.interval||0);
  let S,D,days;
  const learning=known.S===0||reps===0;
  if(known.S===0){
   // The first time: Again comes back in ten minutes; the rest are checked again after a day (Easy after four).
   S=W[G-1];D=clamp(W[4]-(G-3)*W[5],1,10);days=G===1?0:G===4?4:1;
  }else{
   const R=forget(elapsed,known.S);
   D=clamp(W[7]*W[4]+(1-W[7])*(known.D-W[6]*(G-3)),1,10);
   if(G===1){
    S=clamp(Math.min(known.S,W[11]*Math.pow(known.D,-W[12])*(Math.pow(known.S+1,W[13])-1)*Math.exp(W[14]*(1-R))),.1,known.S);days=0;
   }else{
    const hard=G===2?W[15]:1,easy=G===4?W[16]:1;
    // One good review can't more than eightfold what you knew.
    S=Math.min(known.S*8,known.S*(1+Math.exp(W[8])*(11-known.D)*Math.pow(known.S,-W[9])*(Math.exp(W[10]*(1-R))-1)*hard*easy));
    // Just back from a lapse: confirm tomorrow before trusting the new stability.
    days=reps===0?(G===4?3:1):Math.max(G===2?1:2,daysFor(S,retention)*factor);
   }
  }
  days=days?Math.min(MAX_INTERVAL,Math.max(1,Math.round(days))):0;
  if(days&&examDays!=null&&examDays>=0&&examDays<=60)days=Math.min(days,Math.max(1,Math.floor(examDays/2)));
  return {due:now+(days?days*DAY:10*MINUTE),interval:days,stability:S,difficulty:D,ease:easeFrom(D),reps:G===1?0:reps+1,lapses:G===1?lapses+1:lapses,reviewedAt:now,rating};
 }
 function preview(previous,now=Date.now(),options){
  return Object.fromEntries(GRADES.map(g=>{const s=schedule(previous,g,now,options);return [g,s.interval?s.interval+'d':'10m']}));
 }
 // Chance of recalling right now.
 function retrievability(review,now=Date.now()){
  if(!review)return 0;
  const elapsed=Math.max(0,(now-(review.reviewedAt||now))/DAY),known=memory(review);
  return forget(elapsed,Math.max(known.S,.17));
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
 // `first` marks the review that introduced a new item, which is what the daily new-item limit counts. `extra` carries what
 // we learn about the moment: ms (how long you took), r (the chance the model gave you of remembering), mood.
 function logReview(state,id,rating,mode,now=Date.now(),first=false,extra={}){
  state.reviewLog??=[];state.reviewLog.push({id,t:now,rating,mode,first,...extra});if(state.reviewLog.length>5000)state.reviewLog.splice(0,state.reviewLog.length-5000);
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


 // ── Knowing you: how the system learns from what happens ──────────────────────
 const median=list=>{const sorted=[...list].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length?(sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2):null};
 const logOf=(state,now,days)=>(state.reviewLog||[]).filter(e=>!e.first&&(days==null||e.t>=now-days*DAY));
 const right=e=>e.rating!=='Again';
 // The share of repeat reviews you got right lately (null until there are enough to say).
 function accuracy(state,now=Date.now(),{n=50}={}){
  const list=logOf(state,now).slice(-n);return list.length>=10?list.filter(right).length/list.length:null;
 }
 // Retention over the last `days`, as a share and a count.
 function retention(state,now=Date.now(),days=30){
  const list=logOf(state,now,days);return {pct:list.length?Math.round(list.filter(right).length/list.length*100):null,count:list.length};
 }
 // The model predicts a chance of remembering at each review. If you do better or worse than that, stretch or shrink
 // intervals to match: forgetting follows p^(t/S), so the factor is ln(predicted)/ln(actual).
 function calibration(state,now=Date.now()){
  const list=logOf(state,now).filter(e=>typeof e.r==='number').slice(-300);
  if(list.length<40)return {factor:1,n:list.length,predicted:null,actual:null};
  const predicted=list.reduce((sum,e)=>sum+e.r,0)/list.length,actual=list.filter(right).length/list.length;
  if(predicted>=.99||predicted<=.3||actual<=.3||actual>=.999)return {factor:1,n:list.length,predicted,actual};
  return {factor:clamp(Math.log(predicted)/Math.log(actual),.6,1.4),n:list.length,predicted,actual};
 }
 // Seconds a review takes you, so a session can be sized to the time you have.
 function paceSeconds(state){
  const times=(state.reviewLog||[]).slice(-100).map(e=>e.ms).filter(ms=>ms>500&&ms<120000);
  return times.length>=8?clamp(median(times)/1000,5,60):12;
 }
 // How long a card usually takes when you do know it (for noticing a hesitant "Good").
 const usualMs=state=>{const times=(state.reviewLog||[]).slice(-200).filter(e=>right(e)&&e.ms>500&&e.ms<120000).map(e=>e.ms);return times.length>=15?median(times):null};
 // The soonest test, quiz or deadline these items are for: {days, title, ts} or null.
 function examFor(state,projectId,now=Date.now()){
  const project=(state.projects||[]).find(p=>p.id===projectId);if(!project)return null;
  const dated=[...(project.assessments||[]),...(project.packs||[])].filter(x=>x.date&&!x.done).map(x=>({title:x.title||'Test',ts:new Date(x.date+'T12:00:00').getTime()}))
   .filter(x=>x.ts>=now-DAY/2).sort((a,b)=>a.ts-b.ts);
  return dated.length?{...dated[0],days:Math.max(0,Math.ceil((dated[0].ts-now)/DAY))}:null;
 }
 // The scheduling options for one item right now: your calibration and how close its test is.
 function optionsFor(state,item,now=Date.now()){
  const exam=item.projectId?examFor(state,item.projectId,now):null;
  return {retention:Number(state.recallRetention)||.9,examDays:exam?exam.days:null,factor:calibration(state,now).factor};
 }
 // If you stopped studying today, how much would you remember on test day?
 function readiness(items,reviews={},ts,now=Date.now()){
  const seen=items.filter(i=>reviews[i.id]),at=i=>{const known=memory(reviews[i.id]);return forget(Math.max(0,(ts-(reviews[i.id].reviewedAt||now))/DAY),Math.max(known.S,.17))};
  const chances=seen.map(i=>({item:i,chance:at(i)}));
  return {pct:chances.length?Math.round(chances.reduce((sum,c)=>sum+c.chance,0)/chances.length*100):null,shaky:chances.filter(c=>c.chance<.8).sort((a,b)=>a.chance-b.chance).map(c=>c.item),unseen:items.length-seen.length};
 }
 // Reviews coming due each day, today first (anything overdue counts today).
 function forecast(items,reviews={},now=Date.now(),days=7){
  const start=new Date(now).setHours(0,0,0,0),counts=new Array(days).fill(0);
  for(const item of items){const r=reviews[item.id];if(!r)continue;const index=Math.max(0,Math.floor((r.due-start)/DAY));if(index<days)counts[index]++}
  return counts;
 }
 // Items that keep slipping: missed several times.
 function leeches(items,reviews={},limit=5){
  return items.filter(i=>(reviews[i.id]?.lapses||0)>=4).sort((a,b)=>reviews[b.id].lapses-reviews[a.id].lapses).slice(0,limit);
 }
 const PARTS=[['morning',5,12],['afternoon',12,17],['evening',17,22],['night',22,29]];
 const partOf=t=>{let h=new Date(t).getHours();if(h<5)h+=24;return PARTS.find(([,from,to])=>h>=from&&h<to)[0]};
 // When you remember best, once there is enough to tell (two times of day, 15+ reviews each, 10+ points apart).
 function bestTime(state,now=Date.now()){
  const by={};for(const e of logOf(state,now,90)){const k=partOf(e.t);(by[k]??=[]).push(e)}
  const rows=Object.entries(by).filter(([,l])=>l.length>=15).map(([name,l])=>({name,pct:Math.round(l.filter(right).length/l.length*100),count:l.length})).sort((a,b)=>b.pct-a.pct);
  return rows.length>=2&&rows[0].pct-rows.at(-1).pct>=10?{best:rows[0],worst:rows.at(-1)}:null;
 }
 // Do you remember less on tired days? Said only when it shows.
 function byMood(state,now=Date.now()){
  const rate=mood=>{const l=logOf(state,now,90).filter(e=>e.mood===mood);return l.length>=15?{pct:Math.round(l.filter(right).length/l.length*100),count:l.length}:null};
  const fresh=rate('fresh'),tired=rate('tired');return fresh&&tired&&fresh.pct-tired.pct>=10?{fresh,tired}:null;
 }
 const MOODS={fresh:{label:'Fresh',limit:20,newScale:1.5},ok:{label:'OK',limit:15,newScale:1},tired:{label:'Tired',limit:8,newScale:0}};
 // Build today's session: the ones you're most likely to have forgotten first, sized to how you feel, how much is
 // waiting, how well recall has been going, and (if you give it) how many minutes you have.
 function plan(items,reviews={},state={},{now=Date.now(),mood='ok',minutes=null}={}){
  const due=items.filter(i=>reviews[i.id]&&reviews[i.id].due<=now).length,recent=accuracy(state,now),pace=paceSeconds(state),feel=MOODS[mood]||MOODS.ok;
  let scale=feel.newScale,note='';
  if(mood==='tired')note='A light session: no new questions today.';
  if(due>40){scale=0;note='Catching up first: new questions are paused until the backlog is smaller.'}
  else if(due>20){scale=Math.min(scale,.5);note=note||'A lot is due, so fewer new questions today.'}
  if(recent!=null&&recent<.7&&scale>.5){scale=.5;note=note||'Recall has been shaky lately, so fewer new questions.'}
  const limit=minutes?Math.max(3,Math.floor(minutes*60/pace)):feel.limit;
  const newLimit=Math.round(allowance(state,now)*scale);
  const picked=queue(items,reviews,{mode:'due',now,limit,newLimit});
  const fresh=picked.filter(i=>!reviews[i.id]).length;
  return {queue:picked,reviews:picked.length-fresh,new:fresh,seconds:Math.round(picked.length*pace),backlog:due,note,mood};
 }

 // ── Answering ───────────────────────────────────────────────────────────────
 function distance(a,b){
  if(a===b)return 0;if(Math.abs(a.length-b.length)>3)return 4;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(prev[j]+1,row[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row}
  return prev[b.length];
 }
 // Short answers can be checked; long ones need the student's own judgement. So do equations: nobody should have to type LaTeX to answer.
 const hasMath=text=>/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/.test(String(text||''));
 const checkable=item=>!hasMath(item.type==='cloze'?item.blank:item.answer)&&(item.type==='cloze'||(item.type==='qa'&&normalize(item.answer).length<=40&&normalize(item.answer).split(' ').length<=6));
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

 return {parseMarkup,noteItems,collect,collectAll,clozeParts,promptText,newItem,validItem,suggest,suggestAll,schedule,preview,retrievability,status,isDue,queue,stats,weakTopics,logReview,plan,accuracy,retention,calibration,paceSeconds,usualMs,examFor,optionsFor,readiness,forecast,leeches,bestTime,byMood,MOODS,forget,daysFor,memory,reviewedToday,newToday,allowance,workload,DEFAULT_NEW_PER_DAY,hasMath,check,checkable,suggestedGrade,coverage,distractors,format,summarize,normalize,sentences,GRADES};
})();
