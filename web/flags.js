// Flag a region as unclear while you're taking notes; resolving it later takes a clarifying comment.
(()=>{
 const F=FlagsModel,$=s=>document.querySelector(s),mac=/Mac|iPhone|iPad/.test(navigator.platform);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n};
 const btn=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.onclick=fn;return b};
 const dialog=el('dialog',undefined,'recall-dialog flag-dialog');document.body.append(dialog);
 const pop=el('div',undefined,'flag-pop');pop.hidden=true;pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Flagged passage');document.body.append(pop);
 const noteOf=id=>state.notes.find(n=>n.id===id);
 const shorten=(text,n=160)=>text.length>n?text.slice(0,n)+'…':text;
 const spans=id=>[...document.querySelectorAll('#editor [data-flag]')].filter(s=>s.dataset.flag===id);

 // ── Marking text ────────────────────────────────────────────────────────────
 function textNodes(range){
  const root=range.commonAncestorContainer.nodeType===Node.TEXT_NODE?range.commonAncestorContainer.parentNode:range.commonAncestorContainer;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),found=[];
  for(let n=walker.nextNode();n;n=walker.nextNode()){
   if(!range.intersectsNode(n)||!n.nodeValue.trim()||n.parentElement.closest('.equation'))continue;
   found.push(n);
  }
  if(!found.length&&range.commonAncestorContainer.nodeType===Node.TEXT_NODE)found.push(range.commonAncestorContainer);
  return found;
 }
 function wrap(range,id){
  for(const node of textNodes(range)){
   const start=node===range.startContainer?range.startOffset:0,end=node===range.endContainer?range.endOffset:node.length;
   if(end<=start)continue;
   let target=node;if(start>0)target=node.splitText(start);if(end-start<target.length)target.splitText(end-start);
   const span=document.createElement('span');span.dataset.flag=id;target.replaceWith(span);span.append(target);
  }
 }
 function unwrap(id){
  const parents=new Set();
  for(const s of spans(id)){parents.add(s.closest('.rich-text'));s.replaceWith(...s.childNodes)}
  for(const rich of parents)if(rich){rich.normalize();rich.dispatchEvent(new Event('input',{bubbles:true}))}
 }
 // A flag (or linked words, see line-links.js) covers exactly what was chosen. Typing at either edge of it, or pressing
 // Enter there, would let the browser carry it on into the new text or the next bullet; whatever is written there is
 // moved back outside.
 let edge=null;
 const textBefore=(span,node,offset)=>{const r=document.createRange();r.selectNodeContents(span);r.setEnd(node,offset);return r.toString().length};
 function pointAt(span,chars){
  const walker=document.createTreeWalker(span,NodeFilter.SHOW_TEXT);let last=null;
  for(let n=walker.nextNode();n;n=walker.nextNode()){if(chars<=n.length)return [n,chars];chars-=n.length;last=n}
  return last?[last,last.length]:[span,span.childNodes.length];
 }
 document.addEventListener('beforeinput',e=>{
  edge=null;
  if(!e.inputType.startsWith('insert')||!e.target.closest?.('#editor .rich-text'))return;
  const selection=getSelection();if(!selection?.rangeCount||!selection.isCollapsed)return;
  let node=selection.anchorNode,offset=selection.anchorOffset,span=(node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement)?.closest('[data-flag],[data-line-link]');
  if(!span&&node?.nodeType===Node.ELEMENT_NODE){const before=node.childNodes[offset-1];if(before?.matches?.('[data-flag],[data-line-link]')){span=before;node=span;offset=span.childNodes.length}}
  if(!span||!e.target.contains(span))return;
  const text=span.textContent,at=textBefore(span,node,offset);
  const kind=span.dataset.flag?'flag':'line-link',id=span.getAttribute('data-'+kind);
  if(at===text.length)edge={span,kind,id,text,side:'end'};else if(at===0)edge={span,kind,id,text,side:'start'};
 },true);
 document.addEventListener('input',e=>{
  const was=edge;edge=null;if(!was||!e.target.closest?.('#editor .rich-text'))return;
  // Enter: the copy of the flag the browser put on the new line is dropped; it keeps whatever text it held.
  const all=[...document.querySelectorAll('#editor [data-'+was.kind+']')].filter(s=>s.getAttribute('data-'+was.kind)===was.id),copies=all.filter(s=>!s.textContent.trim()&&!s.querySelector('img'));
  if(copies.length&&copies.length<all.length)for(const s of copies)s.replaceWith(...s.childNodes);
  const span=was.span;if(!span.isConnected)return;
  const now=span.textContent;if(now===was.text)return;
  const range=document.createRange();let moved;
  if(was.side==='end'&&now.startsWith(was.text)){range.setStart(...pointAt(span,was.text.length));range.setEnd(span,span.childNodes.length);moved=range.extractContents();const last=moved.lastChild;span.after(moved);if(last){const caret=document.createRange();caret.setStartAfter(last);if(last.nodeType===Node.TEXT_NODE)caret.setStart(last,last.length);caret.collapse(true);getSelection().removeAllRanges();getSelection().addRange(caret)}}
  else if(was.side==='start'&&now.endsWith(was.text)){range.setStart(span,0);range.setEnd(...pointAt(span,now.length-was.text.length));moved=range.extractContents();const last=moved.lastChild;span.before(moved);if(last){const caret=document.createRange();if(last.nodeType===Node.TEXT_NODE)caret.setStart(last,last.length);else caret.setStartAfter(last);caret.collapse(true);getSelection().removeAllRanges();getSelection().addRange(caret)}}
 },true);
 function paint(){
  const note=current();
  for(const s of document.querySelectorAll('#editor [data-flag]')){
   const flag=note?.flags?.find(f=>f.id===s.dataset.flag);
   s.classList.toggle('flag-open',!!flag&&F.isOpen(flag));s.classList.toggle('flag-resolved',!!flag&&!F.isOpen(flag));
  }
 }
 let queued=false;
 new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;paint()})}).observe($('#editor'),{childList:true,subtree:true});
 const baseRender=render;render=function(){baseRender();paint()};

 function flagSelection(){
  const note=current();if(!note||document.body.dataset.view!=='note'||mode!=='write')return;
  const selection=getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount){toast('Select the text that’s unclear first');return}
  const range=selection.getRangeAt(0),host=range.commonAncestorContainer.nodeType===Node.ELEMENT_NODE?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
  const rich=host?.closest('#editor .rich-text');if(!rich){toast('Flags work on text in a note');return}
  const index=[...$('#editor').children].findIndex(w=>w.contains(rich)),block=note.blocks[index];
  const flag=F.create(note,{blockId:block?.id||null,quote:selection.toString()});if(!flag)return;
  wrap(range,flag.id);selection.removeAllRanges();rich.dispatchEvent(new Event('input',{bubbles:true}));
  persist();paint();refreshCounts();showPop(flag,{fresh:true});
 }

 // ── Popover on the text ─────────────────────────────────────────────────────
 function place(anchor){
  const rect=anchor?.getBoundingClientRect?.()||{left:innerWidth/2-170,right:innerWidth/2,top:innerHeight/3,bottom:innerHeight/3};
  pop.style.left=Math.max(12,Math.min(rect.left,innerWidth-pop.offsetWidth-12))+'px';
  const below=rect.bottom+8,fits=below+pop.offsetHeight<innerHeight-12;
  pop.style.top=Math.max(12,fits?below:rect.top-pop.offsetHeight-8)+'px';
 }
 function closePop(){pop.hidden=true;pop.replaceChildren()}
 function showPop(flag,{fresh=false}={}){
  const note=current();if(!note)return;
  pop.replaceChildren();pop.hidden=false;
  const open=F.isOpen(flag);
  pop.append(el('small',fresh?'Flagged as unclear':open?'To clarify':'Clarified','flag-label'),el('blockquote',shorten(flag.quote,200),'flag-quote'));
  const comment=el('input');comment.type='text';comment.placeholder='What’s unclear? (optional)';comment.value=flag.comment||'';comment.setAttribute('aria-label','What is unclear');comment.maxLength=300;
  comment.oninput=()=>{flag.comment=comment.value.trim();persist()};
  comment.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();closePop()}};
  if(open)pop.append(comment);else if(flag.comment)pop.append(el('p',flag.comment,'flag-comment'));
  if(fresh){pop.append(el('small','Keep taking notes. Resolve it later from “To clarify”.','flag-hint'))}
  else if(open){
   const area=el('textarea');area.placeholder='When it clicks: what cleared it up?';area.setAttribute('aria-label','What cleared it up');
   const resolve=btn('Resolve',()=>{if(!F.resolve(flag,area.value)){toast('Write what cleared it up first');area.focus();return}persist();paint();refreshCounts();showPop(flag)},'primary');resolve.disabled=true;
   area.oninput=()=>{resolve.disabled=!area.value.trim()};
   pop.append(el('small','Resolve','flag-label'),area);
   const row=el('div',undefined,'flag-actions');row.append(resolve,unflagButton(note,flag));pop.append(row);
  }else{
   pop.append(el('small','What cleared it up','flag-label'),el('p',flag.clarification,'flag-clarification'));
   const row=el('div',undefined,'flag-actions');
   row.append(btn('Make a question from this',()=>{closePop();questionFrom(note,flag)},'primary'),btn('Reopen',()=>{F.reopen(flag);persist();paint();refreshCounts();showPop(flag)}),unflagButton(note,flag));pop.append(row);
  }
  place(spans(flag.id)[0]);
  requestAnimationFrame(()=>{place(spans(flag.id)[0]);(fresh?comment:pop.querySelector('textarea')||pop.querySelector('button'))?.focus()});
 }
 function unflagButton(note,flag){
  const b=btn('Remove flag',()=>{if(!b.dataset.sure){b.dataset.sure='1';b.textContent='Click again to remove';return}unwrap(flag.id);F.remove(note,flag);persist();paint();closePop();refreshCounts()},'flag-quiet');
  return b;
 }
 function questionFrom(note,flag){
  window.marginRecall?.compose({note,prefill:F.draftQuestion(flag),after:()=>dialog.open?list(listScope):document.querySelector('.recall-dialog[open]')?.close()});
 }
 document.addEventListener('click',e=>{
  const span=e.target.closest?.('#editor [data-flag]');
  if(span){const note=current(),flag=note?.flags?.find(f=>f.id===span.dataset.flag);if(flag){e.preventDefault();showPop(flag);return}}
  if(!pop.hidden&&!pop.contains(e.target))closePop();
 },true);
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!pop.hidden){closePop();return}
  if(e.code!=='KeyU'||!e.shiftKey||e.altKey||e.isComposing||!(mac?e.metaKey&&!e.ctrlKey:e.ctrlKey&&!e.metaKey))return;
  if(document.querySelector('dialog[open]')||!current())return;
  e.preventDefault();e.stopImmediatePropagation();flagSelection();
 },true);
 // The selection toolbar is built by a script that loads after this one, so attach once it exists.
 function addToolbarButton(){
  const tools=$('#selection-tools');if(!tools)return false;
  if(!$('#selection-flag')){const b=el('button','Flag as unclear');b.type='button';b.id='selection-flag';b.title='Mark this as unclear and come back to it ('+(mac?'⌘⇧U':'Ctrl+Shift+U')+')';b.onmousedown=e=>e.preventDefault();b.onclick=flagSelection;tools.append(b)}
  return true;
 }
 if(!addToolbarButton()){const watcher=new MutationObserver(()=>{if(addToolbarButton())watcher.disconnect()});watcher.observe(document.body,{childList:true})}

 // ── Going back to a flag ────────────────────────────────────────────────────
 function goTo(note,flag){
  for(const d of document.querySelectorAll('dialog[open]'))d.close();closePop();
  document.body.classList.remove('focus-writing');active=note.id;mode='write';render();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const found=spans(flag.id),target=found[0]||$('#editor').children[note.blocks.findIndex(b=>b.id===flag.blockId)];
   target?.scrollIntoView({block:'center'});for(const s of found){s.classList.add('flag-pulse');setTimeout(()=>s.classList.remove('flag-pulse'),1800)}
   if(found[0])showPop(flag);else toast('The flagged text was edited away. You can still resolve it.');
  }));
 }
 let listScope={};
 function list(scope={}){
  listScope=scope;
  const notes=scope.note?[scope.note]:state.notes,filter={projectId:scope.project?.id||null};
  const title=scope.note?(scope.note.title||'Untitled'):scope.project?.name||'All notes';
  const x=btn('×',()=>dialog.close(),'dialog-close');x.title='Close';x.setAttribute('aria-label','Close');
  dialog.replaceChildren(x,el('small',title,'recall-eyebrow'),el('h2','To clarify'));
  const open=F.open(notes,filter),done=F.resolved(notes,filter);
  if(!open.length)dialog.append(el('p',done.length?'Everything flagged has been cleared up.':'Nothing flagged. When something doesn’t click in a lecture, select it and press '+(mac?'⌘⇧U':'Ctrl+Shift+U')+'. You’ll resolve it here once you understand.','recall-note'));
  const rows=el('div',undefined,'recall-bank');dialog.append(rows);
  for(const {note,flag} of open)rows.append(row(note,flag,scope));
  if(done.length){
   const details=el('details',undefined,'flag-done');details.append(el('summary','Resolved · '+done.length));
   const inner=el('div',undefined,'recall-bank');for(const {note,flag} of done)inner.append(row(note,flag,scope));details.append(inner);dialog.append(details);
  }
  dialog.append(btn('Done',()=>dialog.close()));
  if(!dialog.open)dialog.showModal();
 }
 function row(note,flag,scope){
  const open=F.isOpen(flag),wrapper=el('div',undefined,'recall-bank-row flag-row'),main=el('div'),side=el('div',undefined,'recall-bank-side');
  main.append(el('small',(note.title||'Untitled')+' · '+new Date(flag.created).toLocaleDateString(undefined,{month:'short',day:'numeric'}),'recall-source'),el('blockquote',shorten(flag.quote),'flag-quote'));
  if(flag.comment)main.append(el('p',flag.comment));
  if(!open)main.append(el('small','Cleared up: ','flag-label'),el('p',flag.clarification,'flag-clarification'));
  const slot=el('div',undefined,'flag-resolve');main.append(slot);
  side.append(btn('Go to',()=>goTo(note,flag)));
  if(open)side.append(btn('Resolve…',()=>resolveInline(slot,note,flag,scope)));
  else side.append(btn('Make a question',()=>{dialog.close();questionFrom(note,flag)}),btn('Reopen',()=>{F.reopen(flag);persist();paint();refreshCounts();list(scope)}));
  wrapper.append(main,side);return wrapper;
 }
 function resolveInline(slot,note,flag,scope){
  if(slot.firstChild){slot.replaceChildren();return}
  const area=el('textarea');area.placeholder='What cleared it up?';area.setAttribute('aria-label','What cleared it up');
  const go=btn('Resolve',()=>{if(!F.resolve(flag,area.value)){toast('Write what cleared it up first');return}persist();paint();refreshCounts();list(scope)},'primary');go.disabled=true;
  area.oninput=()=>{go.disabled=!area.value.trim()};
  slot.append(area,go);area.focus();
 }
 function refreshCounts(){window.marginEditorRefresh?.();window.marginUnderstandingRefresh?.();queue(true)}

 // ── Queue: this note's open flags, docked bottom right, to step through and resolve ─────────
 const box=el('aside',undefined,'flag-queue');box.hidden=true;box.setAttribute('aria-label','To clarify');document.body.append(box);
 let at=0,shown=null,collapsed=false;const drafts={};
 try{collapsed=localStorage.getItem('margin-flag-queue')==='collapsed'}catch{}
 const fold=value=>{collapsed=value;try{localStorage.setItem('margin-flag-queue',value?'collapsed':'open')}catch{}queue(true)};
 function reveal(flag){
  const found=spans(flag.id);found[0]?.scrollIntoView({block:'center',behavior:'smooth'});
  for(const s of found){s.classList.add('flag-pulse');setTimeout(()=>s.classList.remove('flag-pulse'),1800)}
  if(!found.length)toast('The flagged text was edited away. You can still resolve it.');
 }
 function queue(force){
  const note=current(),open=note&&document.body.dataset.view==='note'?(note.flags||[]).filter(F.isOpen).sort((a,b)=>a.created-b.created):[];
  if(!open.length){box.hidden=true;box.replaceChildren();shown=null;return}
  if(!force&&box.contains(document.activeElement)&&document.activeElement.tagName==='TEXTAREA')return;
  if(shown&&shown.id!==open[Math.min(at,open.length-1)]?.id){const i=open.findIndex(f=>f.id===shown.id);if(i>=0)at=i}
  at=Math.max(0,Math.min(at,open.length-1));const flag=open[at];shown=flag;
  box.hidden=false;box.classList.toggle('collapsed',collapsed);box.replaceChildren();
  const step=delta=>{at=(at+delta+open.length)%open.length;shown=open[at];queue(true);reveal(open[at])};
  if(collapsed){const pill=btn('To clarify · '+open.length,()=>fold(false),'flag-queue-pill');pill.title='Show the queue';box.append(pill);return}
  const head=el('div',undefined,'flag-queue-head');
  const prev=btn('‹',()=>step(-1),'flag-quiet'),next=btn('›',()=>step(1),'flag-quiet'),min=btn('–',()=>fold(true),'flag-quiet');
  prev.setAttribute('aria-label','Previous flag');next.setAttribute('aria-label','Next flag');min.setAttribute('aria-label','Minimise');min.title='Minimise';
  prev.disabled=next.disabled=open.length<2;
  head.append(el('small','To clarify · '+(at+1)+' of '+open.length,'flag-label'),prev,next,min);
  const quote=btn(shorten(flag.quote,140),()=>reveal(flag),'flag-queue-quote');quote.title='Show in the note';
  box.append(head,quote);
  if(flag.comment)box.append(el('p',flag.comment,'flag-comment'));
  const area=el('textarea');area.placeholder='When it clicks: what cleared it up?';area.setAttribute('aria-label','What cleared it up');area.value=drafts[flag.id]||'';
  const done=btn('Resolve',()=>{
   if(!F.resolve(flag,area.value)){toast('Write what cleared it up first');area.focus();return}
   delete drafts[flag.id];persist();paint();
   const left=open.filter(f=>f!==flag);at=Math.min(at,Math.max(0,left.length-1));refreshCounts();
   if(!left.length)toast('Everything flagged is cleared up');
  },'primary');
  done.disabled=!area.value.trim();
  area.oninput=()=>{drafts[flag.id]=area.value;done.disabled=!area.value.trim()};
  area.onkeydown=e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!done.disabled){e.preventDefault();done.click()}};
  const skip=open.length>1?btn('Skip',()=>step(1),'flag-quiet'):null;
  const row=el('div',undefined,'flag-actions');row.append(done);if(skip)row.append(skip);
  box.append(area,row);
 }
 const baseRenderQueue=render;render=function(){baseRenderQueue();queue()};
 new MutationObserver(()=>queue()).observe(document.body,{attributes:true,attributeFilter:['data-view']});
 window.addEventListener('load',()=>queue());

 // ── Entry points ────────────────────────────────────────────────────────────
 window.marginFlags={list,goTo,queue,count:projectId=>F.count(state.notes,{projectId:projectId||null}),flagSelection};
 window.marginFlagsWidget=project=>{
  const open=F.open(state.notes,{projectId:project.id});if(!open.length)return null;
  const box=el('section',undefined,'subject-checklist subject-flags'),head=el('div',undefined,'widget-heading');
  head.append(el('h2','To clarify · '+open.length),btn('Open',()=>list({project})));box.append(head);
  for(const {note,flag} of open.slice(0,3)){const r=btn('',()=>goTo(note,flag),'flag-mini');r.append(el('span',shorten(flag.comment||flag.quote,70)),el('small',note.title||'Untitled'));box.append(r)}
  return box;
 };
})();
