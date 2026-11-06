/* User-authored questions preserve their source passage and travel with note backups. */
(()=>{
 const $=s=>document.querySelector(s),el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n},button=(label,fn)=>{const n=el('button',label);n.type='button';n.onclick=fn;return n};
 const dialog=el('dialog',undefined,'understanding-dialog');document.body.append(dialog);
 const stages=['Question','Tentative explanation','Evidence gathered','Understood','Revisit'];
 function source(note,block){document.body.classList.remove('focus-writing');active=note.id;mode='write';render();if(block)requestAnimationFrame(()=>$('#editor').children[note.blocks.findIndex(b=>b.id===block)]?.scrollIntoView({block:'center'}))}
 function field(form,label,value='',multiline=false){const l=el('label',label),input=el(multiline?'textarea':'input');input.value=value;input.setAttribute('aria-label',label);l.append(input);form.append(l);return input}
 function questions(projectId){return state.notes.filter(n=>!projectId||n.projectId===projectId).flatMap(n=>(n.questions||[]).map(q=>({note:n,q})))}
 function compose(note,q=null,context={}){
  dialog.replaceChildren(el('h2',q?'Explore your question':'What is still unclear?'));
  const form=el('form'),title=field(form,'Question',q?.title),explanation=field(form,'My explanation',q?.explanation,true),evidence=field(form,'Evidence and reasoning',q?.evidence,true);
  title.required=true;title.maxLength=500;
  const stage=el('select');stage.setAttribute('aria-label','Understanding');for(const value of stages){const o=el('option',value);stage.append(o)}stage.value=q?.stage||stages[0];form.append(el('label','Understanding'),stage);
  const selection=window.getSelection();const selected=selection?.anchorNode&&$('#editor').contains(selection.anchorNode)?selection.toString().trim():'';
  const excerpt=q?.excerpt||context.excerpt||selected;const selectedBlock=selection?.anchorNode?.parentElement?.closest('.block');const block=q?.blockId||context.blockId||note.blocks[[...$('#editor').children].indexOf(selectedBlock)]?.id;
  if(excerpt)form.append(el('blockquote',excerpt));
  const actions=el('div',undefined,'understanding-actions');actions.append(button('Cancel',()=>dialog.close()));if(q)actions.append(button('Remove question',()=>{const index=note.questions.indexOf(q);note.questions.splice(index,1);persist();dialog.close();refresh();offerUndo('Question removed',()=>{note.questions.splice(index,0,q);persist();refresh()})}));
  const save=el('button','Save question');save.type='submit';save.className='primary';actions.append(save);form.append(actions);
  form.onsubmit=e=>{e.preventDefault();if(!title.value.trim())return;note.questions??=[];const entry=q||{id:uid(),excerpt,blockId:block,created:Date.now()};Object.assign(entry,{title:title.value.trim(),explanation:explanation.value,evidence:evidence.value,stage:stage.value,updated:Date.now()});if(!q)note.questions.push(entry);persist();dialog.close();refresh();toast('Question saved')};dialog.append(form);if(!dialog.open)dialog.showModal();title.focus();
 }
 function browse(projectId){dialog.replaceChildren(el('h2','Questions to explore'),el('p','Return to an unfinished thought, or revisit an explanation.'));const items=questions(projectId);if(!items.length)dialog.append(el('p','Open a note and choose “Ask a question”. Select a passage first to keep it as context.'));for(const {note,q} of items){const row=el('section',undefined,'understanding-row');row.append(el('small',q.stage+' · '+(note.title||'Untitled')),button(q.title,()=>compose(note,q)),button('Open note',()=>{dialog.close();source(note,q.blockId)}));dialog.append(row)}dialog.append(button('Done',()=>dialog.close()));if(!dialog.open)dialog.showModal()}
 function synthesize(projectId){window.marginSynthesis(projectId)}
 function refresh(){
  const home=$('#workspace-home');if(!home||!state)return;
  const projectId=filter.startsWith('project:')?filter.slice(8):null;
  if(!home.hidden)document.body.classList.remove('focus-writing');
  if(!home.hidden&&!home.querySelector('.session-panel')){
   const panel=el('section',undefined,'session-panel');panel.append(el('h2','Pick up a thought'));
   const recent=state.notes.filter(n=>(!projectId||n.projectId===projectId)&&(filter!=='pinned'||n.pinned)).slice().sort((a,b)=>b.updated-a.updated).slice(0,3);
   for(const note of recent)panel.append(button('Continue · '+(note.title||'Untitled'),()=>source(note)));
   const project=state.projects.find(p=>p.id===projectId);if(project){const scoped=state.notes.filter(n=>n.projectId===projectId);const ready=RecallModel.stats(RecallModel.collect(state,{projectId}),state.reviews||{}).ready;panel.append(button(ready+' ready to recall',()=>window.marginReviewProject(project)));const flagged=window.marginFlags?.count(projectId);if(flagged)panel.append(button(flagged+' to clarify',()=>window.marginFlags.list({project})))}
   const open=questions(projectId).filter(({q})=>q.stage!=='Understood');panel.append(button(open.length+' open question'+(open.length===1?'':'s'),()=>browse(projectId)),button('Build an explanation',()=>synthesize(projectId)));
   if(open[0])panel.append(button('Explore · '+open[0].q.title,()=>compose(open[0].note,open[0].q)));
   home.insertBefore(panel,home.querySelector('.workspace-grid'));
   const toggle=button(state.compactNotes?'Card view':'Compact list',()=>{document.body.classList.toggle('compact-notes');state.compactNotes=document.body.classList.contains('compact-notes');persist();toggle.textContent=state.compactNotes?'Card view':'Compact list'});toggle.className='view-toggle';panel.append(toggle);
  }
  document.body.classList.toggle('compact-notes',!!state.compactNotes);
  for(const old of document.querySelectorAll('.question-summary'))old.remove();
  const note=current();if(note&&!home.hidden)return;
  window.marginEditorRefresh?.();
  if(note){
   note.blocks.forEach((b,i)=>{if(b.type==='code'){const cell=$('#editor').children[i];if(cell&&!cell.querySelector('.experiment-reflection')){const details=el('details',undefined,'experiment-reflection');details.append(el('summary','What happened, and why?'));const response=el('textarea');response.value=b.reflection||'';response.placeholder='Explain the result. What changed your understanding?';response.setAttribute('aria-label','Experiment reflection');response.oninput=()=>{b.reflection=response.value;persist()};details.append(response);cell.append(details)}}if(!b.sourceNoteId)return;const node=$('#editor').children[i];if(!node||node.querySelector('.synthesis-source'))return;const link=button('Open original passage',()=>{const origin=state.notes.find(n=>n.id===b.sourceNoteId);if(origin)source(origin,b.sourceBlockId);else toast('Source note is in Trash or unavailable')});link.className='synthesis-source';node.append(link)})
  }
 }
 function browseNote(note){dialog.replaceChildren(el('h2','Questions · '+note.title));for(const q of note.questions||[])dialog.append(button(q.stage+' · '+q.title,()=>compose(note,q)));dialog.append(button('New question',()=>compose(note)),button('Done',()=>dialog.close()));if(!dialog.open)dialog.showModal()}
 window.marginAskQuestion=()=>{const note=current();if(note)compose(note)};
 window.marginExploreQuestion=(note,q)=>compose(note,q);
 window.marginUnsureQuestion=()=>{const note=current();if(note)compose(note)};
 window.marginBrowseNoteQuestions=()=>{const note=current();if(note)browseNote(note)};
 const originalRender=render;render=function(){originalRender();refresh()};window.marginUnderstandingRefresh=refresh;
 const globalQuestions=button('Questions',()=>browse());globalQuestions.className='nav';$('#all').after(globalQuestions);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('focus-writing')){document.body.classList.remove('focus-writing');const focus=$('.question-summary button:nth-child(3)');if(focus)focus.textContent='Focus writing'}});
 refresh();
})();
