/* Filing changes membership only: IDs, sources, file paths, and content remain stable. */
(()=>{
 const $=s=>document.querySelector(s),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n},button=(label,fn,cls)=>{const n=el('button',label,cls);n.type='button';n.onclick=fn;return n};
 const mime='application/x-notival-items',selection=new Map();let dragging=null,lastView='',hoverTimer=null;
 const dialog=el('dialog',undefined,'student-dialog filing-dialog'),status=el('div',undefined,'filing-status');status.setAttribute('role','status');status.hidden=true;document.body.append(dialog,status);
 const toolbar=el('div',undefined,'filing-selection');toolbar.hidden=true;
 const capture=el('div',undefined,'capture-destination'),captureLabel=button('',()=>chooseDestination(null),'capture-target');capture.append(el('small','CAPTURE TO'),captureLabel);$('#new').after(capture);
 function context(){const note=current();return note?{projectId:note.projectId||null,unitId:note.unitId||null}:window.marginCurrentStudyLocation?.()||{projectId:null,unitId:null}}
 function valid(value){return FilingModel.destination(state,value)}
 function label(value){const s=state.projects.find(s=>s.id===value?.projectId);return s?s.name+(value.unitId?' / '+(s.units||[]).find(u=>u.id===value.unitId)?.name:''):'Personal notes'}
 window.marginCaptureDestination=()=>{if(!state)return {projectId:null,unitId:null};return (state.captureTarget&&valid(state.captureTarget))||valid(context())||{projectId:null,unitId:null}};
 function repaintCapture(){if(!state)return;const target=window.marginCaptureDestination();captureLabel.textContent=label(target);captureLabel.title=(state.captureTarget?'Pinned destination: ':'Follows your location: ')+label(target);capture.classList.toggle('capture-pinned',!!state.captureTarget)}
 function selected(){return [...selection.values()]}
 // Materials of one subject can be assigned to a unit straight from the selection bar, with no dialog.
 function unitPicker(){
  const items=selected();if(!items.length||!items.every(i=>i.kind==='material'))return [];
  const owners=new Set(items.map(i=>state.projects.find(s=>(s.materials||[]).some(m=>m.id===i.id))?.id));
  const subject=owners.size===1?state.projects.find(s=>s.id===[...owners][0]):null;if(!subject?.units?.length)return [];
  const pick=el('select');pick.setAttribute('aria-label','Assign selected materials to a unit');
  const first=el('option','Assign to unit…');first.value='__';pick.append(first);
  const none=el('option','Unsorted');none.value='';pick.append(none);
  for(const u of subject.units){const o=el('option',u.name);o.value=u.id;pick.append(o)}
  pick.onchange=()=>{if(pick.value==='__')return;move(items,{projectId:subject.id,unitId:pick.value||null})};
  return [pick];
 }
 function updateSelection(){toolbar.replaceChildren(el('strong',selection.size+' selected'),button('Move to…',()=>chooseDestination(selected())),...unitPicker(),...(selected().every(i=>i.kind==='note')?[button('Archive',()=>removeNotes(selected(),'archive')),Object.assign(button('Delete',()=>removeNotes(selected(),'trash')),{className:'filing-danger'})]:[]),button('Clear',()=>{selection.clear();refresh()}));toolbar.hidden=!selection.size;for(const n of document.querySelectorAll('[data-filing-kind][data-filing-id]')){const active=selection.has(n.dataset.filingKind+':'+n.dataset.filingId);n.classList.toggle('filing-selected',active);const check=n.querySelector('.filing-select');if(check)check.checked=active}}
 // Archive or delete the selected notes together; one Undo restores them to where they were.
 function removeNotes(items,kind){
  const ids=new Set(items.filter(i=>i.kind==='note').map(i=>i.id)),notes=state.notes.filter(n=>ids.has(n.id));
  if(!notes.length)return;
  const bucket=kind==='archive'?'archive':'trash',stamp=kind==='archive'?'archivedAt':'deletedAt',positions=notes.map(n=>({n,i:state.notes.indexOf(n)}));
  state[bucket]??=[];
  for(const n of notes){n[stamp]=Date.now();state[bucket].unshift(n);state.notes.splice(state.notes.indexOf(n),1)}
  if(!state.notes.some(n=>n.id===active))active=null;
  persist();updateArchiveCount();updateTrashCount();refreshView();
  const count=notes.length,noun=count===1?'note':'notes';
  offerUndo(count+' '+noun+(kind==='archive'?' archived':' moved to Trash'),()=>{
   state[bucket]=state[bucket].filter(n=>!notes.includes(n));
   for(const {n,i} of positions.sort((a,b)=>a.i-b.i)){delete n[stamp];state.notes.splice(Math.min(i,state.notes.length),0,n)}
   persist();updateArchiveCount();updateTrashCount();refreshView();
  });
 }
 function refreshView(){if(dialog.open)dialog.close();selection.clear();if(current())render();else window.marginHome(window.marginCurrentStudyLocation?.().projectId||null);refresh()}
 function move(items,target){try{const result=FilingModel.move(state,items,target);if(!result.count){toast('Already in '+label(target));return}persist();refreshView();offerUndo('Moved '+result.count+' item'+(result.count===1?'':'s')+' to '+label(target),()=>{result.undo();persist();refreshView()})}catch(error){toast(error.message)}}
 window.marginMoveItemsTo=move;
 window.marginSelectAll=kind=>{for(const n of document.querySelectorAll('[data-filing-kind="'+kind+'"][data-filing-id]'))selection.set(kind+':'+n.dataset.filingId,{kind,id:n.dataset.filingId});updateSelection()};
 function chooseDestination(items){dialog.replaceChildren(el('h2',items?'Move '+items.length+' item'+(items.length===1?'':'s'):'Where should new captures go?'),el('p',items?'Move notes or materials without changing their contents or source links.':'Global New note, newly opened PDFs, and external captures use this destination. Subject-specific actions still use the subject you choose.'));
  const form=el('form'),subject=el('select'),unit=el('select');subject.setAttribute('aria-label','Destination subject');unit.setAttribute('aria-label','Destination unit');const personal=el('option','Personal notes');personal.value='';if(!items||items.every(i=>i.kind==='note'))subject.append(personal);for(const s of state.projects){const option=el('option',s.name);option.value=s.id;subject.append(option)}const initial=window.marginCaptureDestination();subject.value=initial.projectId||'';if(!subject.value&&items?.some(i=>i.kind==='material'))subject.value=state.projects[0]?.id||'';
  function units(){unit.replaceChildren();const unsorted=el('option','Subject overview · no unit');unsorted.value='';unit.append(unsorted);for(const u of state.projects.find(s=>s.id===subject.value)?.units||[]){const option=el('option',u.name);option.value=u.id;unit.append(option)}unit.disabled=!subject.value}subject.onchange=units;units();unit.value=initial.unitId||'';
  const subjectLabel=el('label','Subject'),unitLabel=el('label','Unit');subjectLabel.append(subject);unitLabel.append(unit);form.append(subjectLabel,unitLabel);const actions=el('div',undefined,'student-actions');actions.append(button('Cancel',()=>dialog.close()));if(!items)actions.append(button('Follow current location',()=>{state.captureTarget=null;persist();dialog.close();repaintCapture();toast('Captures now follow your current subject and unit')}));const save=el('button',items?'Move items':'Pin capture destination','primary');save.type='submit';actions.append(save);form.append(actions);form.onsubmit=e=>{e.preventDefault();const target=valid({projectId:subject.value||null,unitId:unit.value||null});if(!target){toast('Choose an available subject and unit');return}if(items)move(items,target);else{state.captureTarget=target;persist();dialog.close();repaintCapture();toast('Capture destination: '+label(target))}};dialog.append(form);if(!dialog.open)dialog.showModal()
 }
 // A trash can that appears at the bottom right while notes are being dragged.
 const trashDrop=el('div',undefined,'trash-drop');trashDrop.id='trash-drop';trashDrop.setAttribute('role','button');trashDrop.setAttribute('aria-label','Drop notes here to move them to Trash');trashDrop.setAttribute('aria-hidden','true');
 trashDrop.innerHTML='<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg><span>Trash</span>';
 document.body.append(trashDrop);
 trashDrop.addEventListener('dragover',e=>{if(!dragging?.some(entry=>entry.kind==='note'))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';trashDrop.classList.add('over')});
 trashDrop.addEventListener('dragleave',()=>trashDrop.classList.remove('over'));
 trashDrop.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();const notes=(dragging||[]).filter(entry=>entry.kind==='note');trashDrop.classList.remove('over');dragging=null;clearDrop();if(notes.length)removeNotes(notes,'trash')});
 function makeFilable(node,item){if(!node||node.dataset.filingBound)return;node.dataset.filingBound='true';node.draggable=true;node.dataset.filingKind=item.kind;node.dataset.filingId=item.id;
  const title=node.querySelector('.resource-title')?.textContent||node.querySelector('strong')?.textContent||'item';
  if(!node.classList.contains('note-item')){const check=el('input',undefined,'filing-select');check.type='checkbox';check.setAttribute('aria-label','Select '+title);check.onchange=()=>{const key=item.kind+':'+item.id;check.checked?selection.set(key,item):selection.delete(key);updateSelection()};const wrapper=el('label',undefined,'filing-select-label');wrapper.append(check);const head=node.querySelector('.note-card-top');(head||node).append(wrapper);const action=button('Move',()=>chooseDestination(selection.has(item.kind+':'+item.id)?selected():[item]),'filing-move');action.setAttribute('aria-label','Move '+title);(node.querySelector('.note-card-footer')||node).append(action)}
  node.addEventListener('dragstart',e=>{if(e.target.closest?.('input,select')){e.preventDefault();return}dragging=selection.has(item.kind+':'+item.id)?selected():[item];e.dataTransfer.setData(mime,JSON.stringify({version:1,items:dragging}));e.dataTransfer.effectAllowed='move';node.classList.add('filing-dragging');document.body.classList.add('filing-in-progress');trashDrop.classList.toggle('available',dragging.some(entry=>entry.kind==='note'))});node.addEventListener('dragend',()=>{dragging=null;node.classList.remove('filing-dragging');clearDrop()});
 }
 window.marginMakeFilable=makeFilable;
 function supported(e){const types=Array.from(e.dataTransfer?.types||[]);return types.includes(mime)||types.includes('Files')}
 function clearDrop(){trashDrop.classList.remove('available','over');clearTimeout(hoverTimer);hoverTimer=null;status.hidden=true;document.body.classList.remove('filing-in-progress');for(const n of document.querySelectorAll('.filing-hover'))n.classList.remove('filing-hover')}
 function target(node,destination){if(!node)return;node._filingDestination=destination;node.classList.add('filing-target');node.setAttribute('aria-description','Drop notes or files here: '+label(destination));if(node.dataset.dropBound)return;node.dataset.dropBound='true';
  node.addEventListener('dragover',e=>{if(!supported(e))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect=Array.from(e.dataTransfer.types).includes('Files')?'copy':'move';node.classList.add('filing-hover');if(node.classList.contains('project-card')&&!hoverTimer){const s=state.projects.find(s=>s.id===node._filingDestination.projectId);if(s&&!s.sidebarExpanded)hoverTimer=setTimeout(()=>{s.sidebarExpanded=true;persist();window.marginFilingExpandSubjects?.();hoverTimer=null},550)}status.textContent=(e.dataTransfer.dropEffect==='copy'?'Copy files to ':'Move to ')+label(node._filingDestination);status.hidden=false});node.addEventListener('dragleave',e=>{if(!node.contains(e.relatedTarget)){clearTimeout(hoverTimer);hoverTimer=null;node.classList.remove('filing-hover');status.hidden=true}});
  node.addEventListener('drop',e=>{if(!supported(e))return;e.preventDefault();e.stopPropagation();clearDrop();const to=valid(node._filingDestination);if(!to){toast('That destination is no longer available');return}const raw=e.dataTransfer.getData(mime);if(raw){try{const payload=JSON.parse(raw);if(payload.version!==1||!Array.isArray(payload.items))throw Error('Unsupported drag');move(payload.items,to)}catch{toast('Could not read the dragged items. Use Move instead.')}}else if(to.projectId&&bridge){native({type:'importDroppedFiles',subjectID:to.projectId,unitID:to.unitId||''})}else toast(to.projectId?'Attach files in the macOS application':'Drop files onto a subject or unit')});
 }
 window.marginMakeDropTarget=target;
 const attached=window.marginMaterialsAttached;window.marginMaterialsAttached=data=>{attached(data);const s=state.projects.find(s=>s.id===data?.subjectID);if(!s||!data.files?.length)return;const paths=new Set(data.files.map(f=>f.path)),added=s.materials.filter(m=>paths.has(m.path));offerUndo('Added '+added.length+' file'+(added.length===1?'':'s')+' to '+label({projectId:s.id,unitId:s.units.some(u=>u.id===data.unitID)?data.unitID:null}),()=>{s.materials=s.materials.filter(m=>!added.some(a=>a.id===m.id));persist();window.marginHome(s.id)})};
 function refresh(){if(!state)return;const loc=window.marginCurrentStudyLocation?.()||{},view=[active||'',loc.projectId||'',loc.unitId||'',document.querySelector('.student-tabs [aria-current=page]')?.textContent||''].join(':');if(view!==lastView){selection.clear();lastView=view}repaintCapture();for(const node of document.querySelectorAll('[data-filing-kind][data-filing-id]'))makeFilable(node,{kind:node.dataset.filingKind,id:node.dataset.filingId});const home=$('#workspace-home');if(home&&!home.hidden){if(loc.projectId)target(home,{projectId:loc.projectId,unitId:loc.unitId||null});else{home.classList.remove('filing-target');home._filingDestination={projectId:null,unitId:null}}if(loc.projectId&&home.querySelector('.student-tabs [aria-current=page]')?.textContent==='Materials'&&!home.querySelector('.filing-drop-hint')){const hint=el('div','Drop files here, or onto a subject or unit in the sidebar.','filing-drop-hint');home.querySelector('.feature-heading')?.after(hint)}const grid=home.querySelector('.note-card-grid,.student-resource');if(grid)grid.before(toolbar)}updateSelection()}
 window.marginFilingRefresh=refresh;
 const renderBefore=render;render=function(){renderBefore();refresh()};
 document.addEventListener('dragover',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files'))e.preventDefault()});document.addEventListener('drop',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files')&&!e.defaultPrevented){e.preventDefault();clearDrop();toast('Drop files onto a subject or unit')}});document.addEventListener('dragend',clearDrop);
 if(state)window.marginHome(window.marginCurrentStudyLocation?.().projectId||null);
})();
