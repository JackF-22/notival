// Active recall: write questions, review what is due, take quizzes. Model in recall-model.js.
(()=>{
 const M=RecallModel,DAY=86400000,$=s=>document.querySelector(s);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n};
 const btn=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.onclick=fn;return b};
 const dialog=el('dialog',undefined,'recall-dialog');document.body.append(dialog);
 const typeNames={qa:'Question',cloze:'Fill in',explain:'Explain',passage:'Passage'};
 let ctx={project:null,notes:null,title:'',unitId:''},sess=null,onKey=null;
 dialog.addEventListener('keydown',e=>onKey?.(e));
 dialog.addEventListener('close',()=>{sess=null;onKey=null});

 const scope=()=>ctx.notes?{notes:ctx.notes}:{projectId:ctx.project?.id||null,unitId:ctx.unitId||null};
 const noteOf=id=>state.notes.find(n=>n.id===id);
 const reviews=()=>state.reviews??={};
 const isMade=item=>item.origin==='made'&&(state.items||[]).some(i=>i.id===item.id);
 function setScope(o={}){ctx={project:o.project||null,notes:o.notes||null,title:o.title||o.project?.name||'All notes',unitId:o.unitId||''}}
 function unitLabel(item){const p=state.projects.find(p=>p.id===item.projectId);return p?.units?.find(u=>u.id===item.unitId)?.name||''}
 function sourceLabel(item){const n=item.noteId&&noteOf(item.noteId);return [n?(n.title||'Untitled'):'',unitLabel(item)].filter(Boolean).join(' · ')}
 function frame(title,subtitle,exit=()=>dialog.close()){
  const x=btn('×',exit,'dialog-close');x.title='Close';x.setAttribute('aria-label','Close');
  dialog.replaceChildren(x,el('small',subtitle||ctx.title,'recall-eyebrow'),el('h2',title));dialog.onkeydown=null;onKey=null;
  if(!dialog.open)dialog.showModal();
 }
 function goTo(noteId,blockId){
  const note=noteOf(noteId);if(!note){toast('That note is no longer here');return}
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  document.body.classList.remove('focus-writing');active=note.id;mode='write';render();
  if(blockId)requestAnimationFrame(()=>$('#editor').children[note.blocks.findIndex(b=>b.id===blockId)]?.scrollIntoView({block:'center'}));
 }
 function when(review,now=Date.now()){
  if(!review)return 'New';const st=M.status(review,now);
  if(st==='weak')return 'Shaky';if(st==='due'||review.due<=now)return 'Due';
  const days=Math.ceil((review.due-now)/DAY);return days<=1?'Tomorrow':'In '+days+'d';
 }
 function nextDue(list,now=Date.now()){
  const dues=list.map(i=>reviews()[i.id]?.due).filter(d=>d>now);if(!dues.length)return '';
  const days=Math.ceil((Math.min(...dues)-now)/DAY);return days<=0?'later today':days===1?'tomorrow':'in '+days+' days';
 }

 // ── Hub ─────────────────────────────────────────────────────────────────────
 function hub(options){
  if(options)setScope(options);
  const list=M.collect(state,scope()),stats=M.stats(list,reviews()),made=list.length;
  frame('Recall');
  const subject=ctx.project&&state.projects.find(p=>p.id===ctx.project.id);
  if(subject?.units?.length&&!ctx.notes){
   const select=el('select',undefined,'recall-unit');select.setAttribute('aria-label','Unit');const all=el('option','All units');all.value='';select.append(all);
   for(const u of subject.units){const o=el('option',u.name);o.value=u.id;select.append(o)}select.value=ctx.unitId;select.onchange=()=>{ctx.unitId=select.value;hub()};dialog.append(select);
  }
  if(!made){
   dialog.append(el('p','Answer questions from memory — it’s the surest way to remember. Start with a few of your own.','recall-lead-text'));
   const row=el('div',undefined,'recall-actions');row.append(btn('Draft questions from my notes',()=>suggestions(),'primary'),btn('Make one',()=>compose({note:ctx.notes?.[0]||null,after:hub})));dialog.append(row);
   dialog.append(el('p','Tip: in a note, select a phrase and press ⌘⇧K. You can also type Q: and A: on two lines, or put {{double braces}} around words to hide.','recall-note'));
   return;
  }
  const session=M.queue(list,reviews(),{mode:'due',limit:15,newLimit:6}).length;
  const lead=el('div',undefined,'recall-lead');
  lead.append(el('strong',String(session),'recall-count'),el('span',session?(session===1?'question ready':'questions ready'):'All caught up'));dialog.append(lead);
  const when=nextDue(list);
  dialog.append(el('p',session?(stats.new?stats.new+' new · ':'')+made+' in total':(when?'Next review '+when+'.':'Nothing is due yet.'),'recall-note'));
  const row=el('div',undefined,'recall-actions');
  row.append(session?btn('Start',()=>start('due',15),'primary'):btn('Practice anyway',()=>start('quiz',10),'primary'));dialog.append(row);
  const links=el('div',undefined,'recall-links');
  links.append(btn('Make a question',()=>compose({note:ctx.notes?.[0]||null,after:hub})),btn('Browse all '+made,()=>bank()));
  dialog.append(links);
 }
 function start(modeName,limit){
  const list=M.collect(state,scope()),picked=M.queue(list,reviews(),{mode:modeName,limit,newLimit:modeName==='due'?6:limit});
  if(!picked.length){toast('Nothing to ask yet');return}
  run({mode:modeName,list:picked,pool:list});
 }

 // ── Session ─────────────────────────────────────────────────────────────────
 function run({mode:modeName,list,pool}){
  sess={mode:modeName,queue:list.slice(),total:list.length,results:[],asked:new Set(),pool:pool||M.collect(state,scope())};
  next();
 }
 function next(){sess.queue.length?card(sess.queue[0]):summary()}
 function chrome(item){
  const done=sess.results.length,bar=el('div',undefined,'recall-progress'),fill=el('span');fill.style.width=Math.round(done/sess.total*100)+'%';bar.append(fill);
  const x=btn('×',()=>dialog.close(),'dialog-close');x.title='Stop · progress is saved';x.setAttribute('aria-label','Stop');
  const top=el('div',undefined,'recall-top');top.append(el('span',(sess.mode==='quiz'?'Practice':sess.mode==='weak'?'Shaky spots':sess.mode==='drill'?'Drill':'Review')+' · '+(Math.min(done+1,sess.total))+' of '+sess.total),el('span',typeNames[item.type]||'Question','recall-badge'));
  dialog.replaceChildren(x,top,bar);
 }
 function card(item){
  const fmt=M.format(item,sess.pool,{quiz:sess.mode==='quiz'||sess.mode==='drill'||(sess.mode==='due'&&!reviews()[item.id])});
  chrome(item);dialog.onkeydown=null;
  const body=el('div',undefined,'recall-card');dialog.append(body);
  const source=sourceLabel(item);if(source)body.append(el('small',source,'recall-source'));
  let field=null,gap=null;
  if(item.type==='cloze'){
   const p=M.clozeParts(item),sentence=el('p',undefined,'recall-sentence');
   if(fmt.kind==='type'){field=el('input',undefined,'recall-blank');field.type='text';field.autocomplete='off';field.spellcheck=false;field.setAttribute('aria-label','Hidden words');field.style.width=Math.max(7,Math.min(30,item.blank.length+3))+'ch';gap=field}
   else gap=el('span','▁▁▁▁▁','recall-gap');
   sentence.append(p.before,gap,p.after);body.append(sentence);
   if(item.hint)body.append(el('small','Hint · '+item.hint,'recall-hint'));
  }else{
   body.append(el('h3',item.prompt,'recall-prompt'));
   if(fmt.kind==='type'){field=el('input');field.type='text';field.autocomplete='off';field.placeholder='Your answer';field.setAttribute('aria-label','Your answer');body.append(field)}
   else if(fmt.kind==='self'){field=el('textarea');field.placeholder=item.type==='explain'||item.type==='passage'?'Explain it in your own words before you check…':'Say it from memory before you check…';field.setAttribute('aria-label','Your answer');body.append(field)}
  }
  const controls=el('div',undefined,'recall-actions');body.append(controls);
  let phase='ask';
  if(fmt.kind==='choice'){
   const list=el('div',undefined,'recall-choices');
   fmt.choices.forEach((choice,i)=>{const b=btn('',()=>choose(choice,b),'recall-choice');b.append(el('kbd',String(i+1)),el('span',choice));b.dataset.choice=choice;list.append(b)});
   body.insertBefore(list,controls);
   controls.append(btn('I don’t know',()=>reveal('',null,true)));
   onKey=e=>{if(phase!=='ask')return;const k=Number(e.key);if(k>=1&&k<=fmt.choices.length&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();list.children[k-1].click()}};
  }else{
   const check=btn('Check',()=>reveal(field?.value||'',M.check(item,field?.value||'')),'primary');
   controls.append(check,btn('I don’t know',()=>reveal('',M.checkable(item)?'wrong':null,true)));
   if(item.origin==='legacy'||item.type==='passage')controls.append(btn('Reword question',()=>reword(item)));
   if(field){field.onkeydown=e=>{if(e.key==='Enter'&&(field.tagName==='INPUT'||e.metaKey||e.ctrlKey)){e.preventDefault();check.click()}}}
  }
  if(!dialog.open)dialog.showModal();
  requestAnimationFrame(()=>field?.focus());

  function choose(choice,button){
   const right=choice===fmt.answer;phase='graded';
   for(const b of body.querySelectorAll('.recall-choice')){b.disabled=true;if(b.dataset.choice===fmt.answer)b.classList.add('is-right')}
   if(!right)button.classList.add('is-wrong');
   if(gap){gap.textContent=item.blank||'';gap.classList.add(right?'is-right':'is-wrong')}
   feedback(right?'correct':'wrong','',{auto:true});
  }
  function reveal(typed,result,skipped=false){
   if(phase!=='ask')return;phase='graded';
   if(field){field.readOnly=true;field.classList.add('is-'+(result||'checked'))}
   controls.remove();
   feedback(result,typed,{skipped});
  }
  function feedback(result,typed,{auto=false,skipped=false}={}){
   const panel=el('div',undefined,'recall-feedback');body.append(panel);
   if(result){panel.append(el('strong',result==='correct'?'Correct':result==='close'?'Close — check the spelling':skipped?'Here it is':'Not quite','recall-result is-'+result))}
   const reference=item.type==='cloze'?item.blank:Knowledge.prose(item.answer||'');
   if(item.type==='cloze'){if(result!=='correct'){const a=el('p',undefined,'recall-answer');a.append('Answer · ',el('b',item.blank));panel.append(a)}}
   else if(reference||typed){
    if(typed.trim()&&result!=='correct'){panel.append(el('small','You wrote','recall-label'),el('blockquote',typed.trim(),'recall-yours'))}
    if(reference){panel.append(el('small',result==='correct'?'Answer':'From your notes','recall-label'),el('blockquote',reference,'recall-reference'))}
    if(!result&&typed.trim().length>12&&reference){
     const cover=M.coverage(reference,typed);
     if(cover.hit.length+cover.missed.length>=3){const row=el('p',undefined,'recall-coverage');if(cover.hit.length){const a=el('span','Covered · '+cover.hit.slice(0,6).join(', '),'is-hit');row.append(a)}if(cover.missed.length){const b=el('span','Not mentioned · '+cover.missed.slice(0,6).join(', '),'is-missed');row.append(b)}panel.append(row)}
    }
    if(!typed.trim()&&!skipped&&!result)panel.append(el('small','Be honest: could you have said this?','recall-label'));
   }
   if(item.noteId&&noteOf(item.noteId))panel.append(btn('Open in note',()=>goTo(item.noteId,item.blockId),'recall-link'));
   const grades=el('div',undefined,'recall-grades');panel.append(grades);
   const prev=reviews()[item.id],forecast=M.preview(prev),suggested=skipped?'Again':M.suggestedGrade(result);
   if(auto){
    const go=btn('Continue',()=>rate(result==='correct'?'Good':'Again'),'primary');grades.append(go);
    if(result==='correct')grades.append(btn('Too easy',()=>rate('Easy')));
    requestAnimationFrame(()=>go.focus());
    onKey=e=>{if(e.key==='Enter'&&document.activeElement!==go){e.preventDefault();go.click()}};
   }else{
    grades.append(el('small','How well did you know it?','recall-label'));
    M.GRADES.forEach((g,i)=>{const b=btn('',()=>rate(g),'recall-grade'+(g===suggested?' is-suggested':''));b.append(el('kbd',String(i+1)),el('span',g),el('small',forecast[g]));grades.append(b)});
    requestAnimationFrame(()=>grades.querySelector('.is-suggested')?.focus());
    onKey=e=>{const k=Number(e.key);if(k>=1&&k<=4&&!e.metaKey&&!e.ctrlKey){e.preventDefault();rate(M.GRADES[k-1])}};
   }
  }
  function rate(grade){
   onKey=null;
   reviews()[item.id]=M.schedule(reviews()[item.id],grade);M.logReview(state,item.id,grade,sess.mode);persist();
   if(!sess.asked.has(item.id)){sess.asked.add(item.id);sess.results.push({item,rating:grade})}
   sess.queue.shift();
   if(grade==='Again'&&!sess.queue.some(q=>q.id===item.id)&&(sess.mode==='due'||sess.mode==='weak'))sess.queue.push(item);
   next();
  }
 }
 function reword(item){
  const field=el('textarea');field.value=item.prompt;field.setAttribute('aria-label','Question');
  const save=btn('Save wording',()=>{if(!field.value.trim())return;state.reviewPrompts??={};state.reviewPrompts[item.id]=field.value.trim();item.prompt=field.value.trim();persist();card(item)},'primary');
  const body=dialog.querySelector('.recall-card');body.replaceChildren(el('small','Reword the question in a way that makes you think','recall-label'),field,el('div',undefined,'recall-actions'));body.lastChild.append(save,btn('Cancel',()=>card(item)));field.focus();
 }
 function summary(){
  const result=M.summarize(sess.results),missed=result.missed,pool=sess.pool;
  const x=btn('×',()=>dialog.close(),'dialog-close');x.setAttribute('aria-label','Close');
  dialog.replaceChildren(x,el('small',ctx.title,'recall-eyebrow'),el('h2','Session complete'));
  const score=el('div',undefined,'recall-score');score.append(el('strong',result.correct+' / '+result.total),el('span',result.pct>=90?'Strong recall.':result.pct>=70?'Solid. A few to firm up.':result.pct>=40?'Getting there. The missed ones will come back soon.':'This is where learning happens. They’ll return tomorrow.'));
  const bar=el('div',undefined,'recall-progress');const fill=el('span');fill.style.width=result.pct+'%';bar.append(fill);dialog.append(score,bar);
  if(missed.length){
   dialog.append(el('h3','To revisit'));
   for(const item of missed){const row=el('div',undefined,'recall-missed');row.append(el('p',M.promptText(item)));const answer=item.type==='cloze'?item.blank:Knowledge.prose(item.answer||'');if(answer)row.append(el('small',answer.length>200?answer.slice(0,200)+'…':answer));if(item.noteId&&noteOf(item.noteId))row.append(btn('Open in note',()=>goTo(item.noteId,item.blockId),'recall-link'));dialog.append(row)}
  }
  const row=el('div',undefined,'recall-actions');
  if(missed.length)row.append(btn('Drill the '+missed.length+' missed',()=>run({mode:'drill',list:missed,pool}),'primary'));
  row.append(btn('Done',()=>dialog.close(),missed.length?'':'primary'));dialog.append(row);
  sess=null;onKey=null;
  if(window.marginSubjectRefresh)window.marginSubjectRefresh();
 }

 // ── Writing questions ───────────────────────────────────────────────────────
 function selectionContext(note){
  const selection=getSelection(),text=selection&&!selection.isCollapsed&&selection.anchorNode&&$('#editor')?.contains(selection.anchorNode)?squashLine(selection.toString()):'';
  if(!text||!note)return {text:'',sentence:'',blockId:null};
  for(const block of note.blocks){
   if(block.type!=='text')continue;const plain=Knowledge.prose(block.text).replace(/\{\{([^{}]*?)(?:::[^{}]*)?\}\}/g,'$1');if(!plain.includes(text))continue;
   return {text,blockId:block.id,sentence:M.sentences(plain).find(s=>s.includes(text))||''};
  }
  return {text,sentence:'',blockId:null};
 }
 const squashLine=s=>s.replace(/\s+/g,' ').trim();
 function compose({note=null,item=null,selection=null,prefill=null,after=null}={}){
  const sel=selection||(prefill?{text:prefill.quote||'',sentence:'',blockId:prefill.blockId||null}:item?{text:'',sentence:'',blockId:null}:selectionContext(note)),editing=!!item;
  const project=note?.projectId??item?.projectId??ctx.project?.id??null;
  let type=item?.type||prefill?.type||(sel.text&&sel.text.length<=60&&sel.sentence?'cloze':'qa');
  frame(editing?'Edit question':'Make a question',note?(note.title||'Untitled'):ctx.title,()=>after?after():dialog.close());
  const form=el('form',undefined,'recall-form');dialog.append(form);
  if(sel.text)form.append(el('blockquote',sel.text.length>220?sel.text.slice(0,220)+'…':sel.text,'recall-quote'));
  const prompt=el('input');prompt.maxLength=500;prompt.setAttribute('aria-label','Question');prompt.value=item?.prompt||prefill?.prompt||'';
  const answer=el('textarea');answer.setAttribute('aria-label','Answer');answer.value=(item?.type==='cloze'?'':item?.answer)||prefill?.answer||(!editing&&!prefill&&type==='qa'?sel.text:'');
  const sentence=el('textarea');sentence.setAttribute('aria-label','Sentence');sentence.value=item?.text||sel.sentence||'';
  const blank=el('input');blank.setAttribute('aria-label','Hidden words');blank.value=item?.blank||(type==='cloze'?sel.text:'');
  const hint=el('input');hint.setAttribute('aria-label','Hint');hint.value=item?.hint||'';hint.placeholder='Optional hint';
  const preview=el('p',undefined,'recall-preview');
  const noteSelect=el('select');noteSelect.setAttribute('aria-label','From note');
  const none=el('option','No source note');none.value='';noteSelect.append(none);
  if(!note){for(const n of state.notes.filter(n=>!project||n.projectId===project).slice(0,80)){const o=el('option',n.title||'Untitled');o.value=n.id;noteSelect.append(o)}noteSelect.value=item?.noteId||''}
  const label=(text,node)=>{const l=el('label',text);l.append(node);return l};
  const panels={
   qa:()=>[label('Question',prompt),label('Answer',answer)],
   cloze:()=>[label('Sentence',sentence),(()=>{const row=el('div',undefined,'recall-inline');row.append(btn('Hide selected words',()=>{const a=sentence.selectionStart,b=sentence.selectionEnd;if(a===b){toast('Select the words to hide first');return}blank.value=sentence.value.slice(a,b).trim();update()}),blank);return row})(),preview,label('Hint',hint)],
   explain:()=>[label('Prompt',prompt),label('Reference answer · optional',answer)]
  };
  const names={qa:'Question & answer',cloze:'Fill in the blank',explain:'Explain in your own words'};
  const area=el('div',undefined,'recall-fields'),switcher=el('p',undefined,'recall-switch');form.append(area);
  if(!note)form.append(label('From note · optional',noteSelect));
  form.append(switcher);
  const save=el('button',editing?'Save changes':'Save question','primary');save.type='submit';
  const row=el('div',undefined,'recall-actions');row.append(save,btn('Cancel',()=>after?after():dialog.close()));form.append(row);
  function update(){const probe=M.newItem({type:'cloze',text:sentence.value,blank:blank.value});preview.textContent=M.validItem(probe)?M.promptText(probe):'Select the words to hide, then press “Hide selected words”.';preview.classList.toggle('is-empty',!M.validItem(probe))}
  function show(next){
   type=next;form.dataset.type=type;area.replaceChildren(...panels[type]());
   switcher.replaceChildren(el('span',editing?names[type]:'Or make it a '),...(editing?[]:Object.keys(names).filter(t=>t!==type).flatMap((t,k)=>[k?el('span',' · '):'',btn(names[t].toLowerCase(),()=>show(t))])));
   if(type==='cloze')update();requestAnimationFrame(()=>(type==='cloze'&&!blank.value?sentence:type==='cloze'?save:prompt).focus());
  }
  sentence.oninput=blank.oninput=update;
  form.onsubmit=e=>{e.preventDefault();submit()};
  function submit(){
   const noteId=note?.id||noteSelect.value||item?.noteId||null,source=noteId?noteOf(noteId):null;
   const fields=type==='cloze'?{type,text:sentence.value,blank:blank.value,hint:hint.value}:{type,prompt:prompt.value,answer:answer.value};
   const draft=M.newItem({...fields,noteId,blockId:note?sel.blockId:item?.blockId&&item.noteId===noteId?item.blockId:null,projectId:source?.projectId??project,unitId:source?.unitId??null});
   if(!M.validItem(draft)){toast(type==='cloze'?'Pick words inside the sentence to hide':type==='explain'?'Add a prompt':'A question needs a question and an answer');return}
   state.items??=[];
   if(editing)Object.assign(item,{...draft,id:item.id,created:item.created,updated:Date.now()});
   else state.items.push(draft);
   persist();toast(editing?'Question updated':'Question saved');window.marginUnderstandingRefresh?.();
   after?after():dialog.close();
  }
  show(type);
 }
 function capture(){
  const note=current();if(!note||document.body.dataset.view!=='note')return;
  compose({note,after:()=>dialog.close()});
 }

 // ── Suggestions ─────────────────────────────────────────────────────────────
 function suggestions(){
  const notes=ctx.notes||state.notes.filter(n=>(!ctx.project||n.projectId===ctx.project.id)&&(!ctx.unitId||n.unitId===ctx.unitId));
  const found=notes.flatMap(n=>M.suggest(n,state).map(s=>({...s,note:n}))).slice(0,40);
  frame('Suggested questions','Drafted from your notes — keep the good ones',()=>hub());
  if(!found.length){dialog.append(el('p','Nothing obvious to ask about yet. Questions are drafted from bold terms, “X is …” definitions, and headings followed by an explanation.','recall-note'),btn('Back',()=>hub()));return}
  dialog.append(el('p','Reword anything you like before adding. Writing the question yourself is half the learning.','recall-note'));
  const list=el('div',undefined,'recall-suggestions'),rows=[];dialog.append(list);
  const add=btn('',()=>{
   let n=0;state.items??=[];
   for(const r of rows){if(!r.check.checked)continue;const s=r.s;const fields=s.type==='cloze'?{type:'cloze',text:s.text,blank:s.blank}:{type:s.type,prompt:r.prompt.value||s.prompt,answer:s.answer};
    state.items.push(M.newItem({...fields,id:s.id,noteId:s.noteId,blockId:s.blockId,projectId:s.projectId,unitId:s.unitId}));n++}
   if(!n)return;persist();toast(n+' question'+(n===1?'':'s')+' added');hub();
  },'primary');
  const recount=()=>{const n=rows.filter(r=>r.check.checked).length;add.textContent='Add '+n+' selected';add.disabled=!n};
  for(const s of found){
   const row=el('label',undefined,'recall-suggestion'),check=el('input');check.type='checkbox';check.checked=true;check.onchange=recount;
   const text=el('div');text.append(el('small',(typeNames[s.type]||'')+' · '+(s.note.title||'Untitled'),'recall-source'));
   let prompt=null;
   if(s.type==='cloze'){const p=M.clozeParts(s);const line=el('p');line.append(p.before,el('b','[ '+s.blank+' ]'),p.after);text.append(line)}
   else{prompt=el('input');prompt.value=s.prompt;prompt.setAttribute('aria-label','Question');prompt.onclick=e=>e.preventDefault();text.append(prompt);const a=Knowledge.prose(s.answer);text.append(el('small',a.length>180?a.slice(0,180)+'…':a,'recall-hint'))}
   row.append(check,text);list.append(row);rows.push({s,check,prompt});
  }
  const actions=el('div',undefined,'recall-actions');actions.append(add,btn('Back',()=>hub()));dialog.append(actions);recount();
 }

 // ── Question bank ───────────────────────────────────────────────────────────
 function bank(options){
  if(options)setScope(options);
  const everything=M.collectAll(state,scope());
  frame('Question bank',ctx.title,()=>hub());
  let filterName='all',query='';
  const bar=el('div',undefined,'recall-bar'),search=el('input');search.type='search';search.placeholder='Search questions';search.setAttribute('aria-label','Search questions');
  const filterSelect=el('select');filterSelect.setAttribute('aria-label','Show');for(const [v,l] of [['all','All'],['due','Ready now'],['new','New'],['weak','Shaky'],['made','Written by me'],['paused','Paused']]){const o=el('option',l);o.value=v;filterSelect.append(o)}
  bar.append(search,filterSelect,btn('Make a question',()=>compose({note:ctx.notes?.[0]||null,after:()=>bank()})),btn('Suggest',()=>suggestions()));
  const list=el('div',undefined,'recall-bank');dialog.append(bar,list);
  function paint(){
   const now=Date.now();
   const rows=everything.filter(i=>{
    const paused=!!state.suspended?.[i.id],st=M.status(reviews()[i.id],now);
    if(filterName==='paused'&&!paused)return false;if(filterName!=='paused'&&paused&&filterName!=='all')return false;
    if(filterName==='due'&&!(st==='due'||st==='new'||st==='weak'))return false;if(filterName==='new'&&st!=='new')return false;if(filterName==='weak'&&st!=='weak'&&st!=='learning')return false;
    if(filterName==='made'&&!isMade(i))return false;
    return !query||(M.promptText(i)+' '+(i.answer||'')).toLowerCase().includes(query);
   });
   list.replaceChildren();
   const single=ctx.notes?.length===1?ctx.notes[0]:null,open=single&&filterName==='all'?(single.questions||[]).filter(q=>!q.explanation?.trim()&&(!query||q.title.toLowerCase().includes(query))):[];
   for(const q of open){
    const row=el('div',undefined,'recall-bank-row'),main=el('div'),side=el('div',undefined,'recall-bank-side');
    main.append(el('small','Unsure · '+q.stage,'recall-source'),el('p',q.title));if(q.excerpt)main.append(el('small',q.excerpt.length>140?q.excerpt.slice(0,140)+'…':q.excerpt,'recall-hint'));
    side.append(el('span','To explore','recall-chip'),btn('Explore',()=>{dialog.close();window.marginExploreQuestion?.(single,q)}));if(q.blockId)side.append(btn('Source',()=>goTo(single.id,q.blockId)));
    row.append(main,side);list.append(row);
   }
   for(const flag of single&&filterName==='all'&&typeof FlagsModel!=='undefined'?(single.flags||[]).filter(f=>FlagsModel.isOpen(f)&&(!query||(f.quote+' '+f.comment).toLowerCase().includes(query))):[]){
    const row=el('div',undefined,'recall-bank-row'),main=el('div'),side=el('div',undefined,'recall-bank-side');
    main.append(el('small','Flagged as unclear','recall-source'),el('p',flag.comment||flag.quote));if(flag.comment)main.append(el('small',flag.quote.length>140?flag.quote.slice(0,140)+'…':flag.quote,'recall-hint'));
    side.append(el('span','To clarify','recall-chip'),btn('Resolve',()=>{dialog.close();window.marginFlags?.list({note:single})}),btn('Go to',()=>window.marginFlags?.goTo(single,flag)));
    row.append(main,side);list.append(row);
   }
   if(!rows.length&&!open.length&&!list.children.length)list.append(el('p',everything.length?'Nothing matches.':'No questions here yet.','recall-note'));
   for(const item of rows.slice(0,150)){
    const paused=!!state.suspended?.[item.id],row=el('div',undefined,'recall-bank-row'+(paused?' is-paused':''));
    const main=el('div');main.append(el('small',(typeNames[item.type]||'')+(sourceLabel(item)?' · '+sourceLabel(item):''),'recall-source'),el('p',M.promptText(item)));
    const answer=item.type==='cloze'?item.blank:Knowledge.prose(item.answer||'');if(answer)main.append(el('small',answer.length>140?answer.slice(0,140)+'…':answer,'recall-hint'));
    const side=el('div',undefined,'recall-bank-side');side.append(el('span',paused?'Paused':when(reviews()[item.id]),'recall-chip'));
    if(item.kind==='authored'){const qid=item.id.match(/:question:([^:]+):/)?.[1],owner=noteOf(item.noteId),q=owner?.questions?.find(x=>x.id===qid);if(q)side.append(btn('Explore',()=>{dialog.close();window.marginExploreQuestion?.(owner,q)}))}
    if(isMade(item))side.append(btn('Edit',()=>compose({item:state.items.find(i=>i.id===item.id),note:item.noteId?noteOf(item.noteId):null,after:()=>bank()})));
    if(item.noteId&&noteOf(item.noteId))side.append(btn('Source',()=>goTo(item.noteId,item.blockId)));
    side.append(btn(paused?'Resume':'Pause',()=>{state.suspended??={};if(paused)delete state.suspended[item.id];else state.suspended[item.id]=true;persist();paint()}));
    if(isMade(item))side.append(btn('Delete',()=>{const index=state.items.findIndex(i=>i.id===item.id),removed=state.items[index];state.items.splice(index,1);persist();everything.splice(everything.indexOf(item),1);paint();offerUndo('Question deleted',()=>{state.items.splice(index,0,removed);persist();bank()})}));
    row.append(main,side);list.append(row);
   }
   if(rows.length>150)list.append(el('p','Showing the first 150. Search to narrow down.','recall-note'));
  }
  search.oninput=()=>{query=search.value.trim().toLowerCase();paint()};filterSelect.onchange=()=>{filterName=filterSelect.value;paint()};
  dialog.append(btn('Back',()=>hub()));paint();
 }

 // ── Entry points ────────────────────────────────────────────────────────────
 function noteQuestions(note){
  bank({notes:[note],title:note.title||'Untitled note'});
  dialog.querySelector('h2').textContent='Questions';
  dialog.querySelector('.recall-bar').append(btn('Practice this note',()=>hub({notes:[note],title:note.title||'Untitled note'})));
 }
 window.marginBrowseNoteQuestions=()=>{const note=current();if(note)noteQuestions(note)};
 window.marginNoteQuestionCount=note=>note?(note.questions||[]).length+(typeof FlagsModel!=='undefined'?FlagsModel.openCount(note):0)+M.collectAll(state,{notes:[note]}).filter(i=>i.origin==='markup'||isMade(i)&&i.kind!=='authored').length:0;
 window.marginReviewProject=project=>hub({project});
 window.marginReviewNotes=(name,notes,subjectId)=>hub({project:subjectId?{id:subjectId,name}:null,notes,title:name});
 window.marginRecallCapture=capture;window.marginAskQuestion=capture;
 window.marginRecall={hub,bank,compose,suggestions,start};
 window.marginRecallSummary=project=>{const stats=M.stats(M.collect(state,{projectId:project.id}),reviews());return stats};
 window.marginRecallWidget=project=>{
  const list=M.collect(state,{projectId:project.id}),stats=M.stats(list,reviews());
  const box=el('section',undefined,'subject-checklist subject-recall'),head=el('div',undefined,'widget-heading');
  head.append(el('h2','Recall'),btn(list.length?'Open':'Set up',()=>hub({project})));box.append(head);
  if(!list.length)box.append(el('p','Turn what you’re learning into questions you answer from memory.','recall-note'));
  else{
   const ready=M.queue(list,reviews(),{mode:'due',limit:15,newLimit:6}).length;
   box.append(el('p',ready?ready+(ready===1?' question ready':' questions ready'):'All caught up'+(nextDue(list)?' · next '+nextDue(list):''),'recall-line'));
   if(ready){const go=btn('Start',()=>{setScope({project});start('due',15)},'primary');box.append(go)}
  }
  return box;
 };
 document.addEventListener('keydown',e=>{
  if(e.code!=='KeyK'||!e.shiftKey||e.altKey||e.isComposing||!(/Mac|iPhone|iPad/.test(navigator.platform)?e.metaKey&&!e.ctrlKey:e.ctrlKey&&!e.metaKey))return;
  if(document.querySelector('dialog[open]')||document.body.dataset.view!=='note'||!current()||mode!=='write')return;
  e.preventDefault();e.stopImmediatePropagation();capture();
 },true);
})();
