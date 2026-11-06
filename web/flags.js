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
 function refreshCounts(){window.marginEditorRefresh?.();window.marginUnderstandingRefresh?.()}

 // ── Entry points ────────────────────────────────────────────────────────────
 window.marginFlags={list,goTo,count:projectId=>F.count(state.notes,{projectId:projectId||null}),flagSelection};
 window.marginFlagsWidget=project=>{
  const open=F.open(state.notes,{projectId:project.id});if(!open.length)return null;
  const box=el('section',undefined,'subject-checklist subject-flags'),head=el('div',undefined,'widget-heading');
  head.append(el('h2','To clarify · '+open.length),btn('Open',()=>list({project})));box.append(head);
  for(const {note,flag} of open.slice(0,3)){const r=btn('',()=>goTo(note,flag),'flag-mini');r.append(el('span',shorten(flag.comment||flag.quote,70)),el('small',note.title||'Untitled'));box.append(r)}
  return box;
 };
})();
