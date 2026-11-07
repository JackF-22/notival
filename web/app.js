const $=s=>document.querySelector(s),uid=()=>crypto.randomUUID(),bridge=window.webkit?.messageHandlers?.margin;
let state,active,mode='write',filter='',selectedNode=null,saveTimer,openPDFPath=null,pendingPDFSelection=null,pendingPDFCommentDraft=null;
const pdfSelectionPanel=document.createElement('section');pdfSelectionPanel.id='pdf-selection';pdfSelectionPanel.hidden=true;document.querySelector('#pdf-status').after(pdfSelectionPanel);
const sidebar=document.querySelector('aside'),sidebarHandle=document.createElement('div');sidebarHandle.id='sidebar-resizer';document.body.append(sidebarHandle);
const sidebarToggle=document.createElement('button');sidebarToggle.id='sidebar-toggle';sidebarToggle.title='Show or hide sidebar';sidebarToggle.setAttribute('aria-label','Show or hide sidebar');document.querySelector('header').prepend(sidebarToggle);
function setSidebarCollapsed(collapsed){document.body.classList.toggle('sidebar-collapsed',collapsed);sidebarToggle.innerHTML='<svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="1.5" y="1.5" width="17" height="13" rx="3"/><path d="M7.5 2v12"/>'+(collapsed?'':'<rect x="2.3" y="2.3" width="4.4" height="11.4" rx="1.6" fill="currentColor" stroke="none"/>')+'</svg>';sidebarToggle.title=collapsed?'Show sidebar':'Hide sidebar';sidebarToggle.setAttribute('aria-label',sidebarToggle.title);sidebarToggle.setAttribute('aria-expanded',String(!collapsed))}
// Showing a PDF beside a note gives the page its width back; closing it restores the sidebar unless the user changed it meanwhile.
let sidebarAutoCollapsed=false;
function collapseSidebarForPDF(){if(!document.body.classList.contains('sidebar-collapsed')){setSidebarCollapsed(true);sidebarAutoCollapsed=true}}
sidebarToggle.onclick=()=>{sidebarAutoCollapsed=false;setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'))};
sidebarHandle.onpointerdown=event=>{if(document.body.classList.contains('sidebar-collapsed'))return;event.preventDefault();document.body.classList.add('resizing-sidebar');sidebarHandle.setPointerCapture(event.pointerId);const start=event.clientX,width=sidebar.getBoundingClientRect().width,finish=()=>{document.body.classList.remove('resizing-sidebar');sidebarHandle.onpointermove=null;sidebarHandle.onpointerup=null};sidebarHandle.onpointermove=move=>{move.preventDefault();const raw=width+move.clientX-start;if(raw<90){finish();setSidebarCollapsed(true);return}document.documentElement.style.setProperty('--sidebar-width',Math.min(420,raw)+'px')};sidebarHandle.onpointerup=finish};
sidebarHandle.ondblclick=()=>setSidebarCollapsed(true);
const projectSection=document.createElement('div');projectSection.className='section-label project-heading';projectSection.textContent='PROJECTS';
const projectActions=document.createElement('div');projectActions.id='project-actions';const newProject=document.createElement('button'),connectProject=document.createElement('button');newProject.textContent='＋ New project';newProject.className='create-project';connectProject.textContent='Connect Finder folder…';projectActions.append(newProject);
const projectList=document.createElement('div');projectList.id='projects';document.querySelector('.search').after(projectSection,projectActions,projectList);
const noteRail=document.createElement('aside');noteRail.id='note-rail';document.querySelector('article').prepend(noteRail);
const noteColumn=document.createElement('div');noteColumn.id='note-column';const article=document.querySelector('article');for(const child of [...article.children])if(child!==noteRail)noteColumn.append(child);article.append(noteColumn,noteRail);
const toolbarActions=document.createElement('div');toolbarActions.className='toolbar-actions';for(const id of ['run-all','open-pdf','capture']){const item=document.querySelector('#'+id);if(item)toolbarActions.append(item)}document.querySelector('.toolbar').append(toolbarActions);
function renderNoteRail(){
 const note=current(),headings=[...document.querySelectorAll('#editor .rich-text h1,#editor .rich-text h2,#editor .rich-text h3')],contextOpen=document.body.classList.contains('context-open'),pdfActive=!!note?.pdfPath&&openPDFPath===note.pdfPath;document.body.classList.toggle('pdf-workspace',pdfActive);document.body.classList.toggle('note-outline-visible',!!note&&!pdfActive&&headings.length>0);noteRail.replaceChildren();noteRail.hidden=!note||pdfActive||(!contextOpen&&!headings.length);if(noteRail.hidden)return;
 const heading=document.createElement('div');heading.className='rail-title';heading.textContent='NOTE MAP';noteRail.append(heading);
 const outline=document.createElement('div');outline.className='rail-section';const outlineLabel=document.createElement('small');outlineLabel.textContent='ON THIS PAGE';outline.append(outlineLabel);

 if(headings.length){for(const item of headings){const button=document.createElement('button');button.textContent=item.textContent||'Untitled section';button.className='rail-heading '+item.tagName.toLowerCase();button.onclick=()=>item.scrollIntoView({behavior:'smooth',block:'center'});outline.append(button)}}if(headings.length)noteRail.append(outline);
 if(!contextOpen)return;
 const context=document.createElement('div');context.className='rail-section';const contextLabel=document.createElement('small');contextLabel.textContent='CONTEXT';context.append(contextLabel);const project=state.projects?.find(item=>item.id===note.projectId);const projectButton=document.createElement('button');projectButton.className='rail-context';projectButton.textContent=project?`▤ ${project.name}`:'＋ Add to a subject';projectButton.onclick=()=>{if(project){if(window.marginShowProject)window.marginShowProject(project.id);else{filter=`project:${project.id}`;list()}}else if(state.projects?.length){note.projectId=state.projects[0].id;persist();render()}else newProject.click()};context.append(projectButton);const stats=document.createElement('p');stats.textContent=`${note.blocks.length} block${note.blocks.length===1?'':'s'} · ${note.blocks.map(block=>block.text).join(' ').trim().split(/\s+/).filter(Boolean).length} words`;context.append(stats);noteRail.append(context);
 const nearby=document.createElement('div');nearby.className='rail-section';const nearbyLabel=document.createElement('small');nearbyLabel.textContent='RECENT NOTES';nearby.append(nearbyLabel);for(const other of state.notes.filter(item=>item.id!==note.id).slice(0,4)){const button=document.createElement('button');button.className='rail-note';button.textContent=other.title||'Untitled thought';button.onclick=()=>{active=other.id;render();focusFirstTextBlock()};nearby.append(button)}if(nearby.children.length>1)noteRail.append(nearby);
}
function renderProjects(){
 projectList.replaceChildren();
 for(const project of state?.projects||[]){
  const row=document.createElement('div');row.className='project-row';row.style.setProperty('--project-color',project.color||'#7669dd');const open=document.createElement('button');open.className='nav project-card';const identity=document.createElement('span');identity.className='project-icon';identity.textContent=project.icon||'◆';const copy=document.createElement('span');copy.className='project-copy';const name=document.createElement('strong');name.textContent=project.name;const description=document.createElement('small');description.textContent=project.description||`${project.path?'Connected folder':'Subject notebook'}`;copy.append(name,description);const count=document.createElement('span');count.className='project-count';count.textContent=state.notes.filter(note=>note.projectId===project.id).length;open.append(identity,copy,count);open.classList.toggle('active',filter===`project:${project.id}`);open.onclick=()=>{filter=`project:${project.id}`;active=null;$('#all').classList.remove('active');$('#pinned').classList.remove('active');if(window.marginShowProject)window.marginShowProject(project.id);else{list();render()}};row.append(open);
  const edit=document.createElement('button');edit.textContent='✎';edit.title=`Edit ${project.name}`;edit.setAttribute('aria-label',`Edit ${project.name}`);edit.onclick=()=>editProject(project);row.append(edit);
  if(project.path){const reveal=document.createElement('button');reveal.textContent='↗';reveal.title=`Open ${project.path} in Finder`;reveal.onclick=()=>native({type:'revealProject',path:project.path});row.append(reveal)}projectList.append(row)
 }
}
function focusFirstTextBlock(){const noteId=active;requestAnimationFrame(()=>{if(active!==noteId||!current()||$('article').hidden)return;const editor=$('#editor .rich-text'),title=$('#title');if(!title)return;const existing=window.getSelection();if(existing?.rangeCount&&editor?.contains(existing.anchorNode)&&(!existing.isCollapsed||document.activeElement===editor))return;title.focus({preventScroll:true});title.setSelectionRange?.(title.value.length,title.value.length)})}
list=function(){const query=$('#search').value.toLowerCase(),projectId=filter.startsWith('project:')?filter.slice(8):null;$('#notes').replaceChildren();$('#count').textContent=state.notes.length;for(const n of state.notes.filter(n=>(filter!=='pinned'||n.pinned)&&(!projectId||n.projectId===projectId)&&[n.title,...n.blocks.map(b=>b.text)].join(' ').toLowerCase().includes(query))){const button=document.createElement('button');button.className='note-item'+(n.id===active?' selected':'');button.dataset.filingKind='note';button.dataset.filingId=n.id;const icon=document.createElement('span');icon.textContent=n.pinned?'☆':'▤';const body=document.createElement('div'),title=document.createElement('strong'),date=document.createElement('small');title.textContent=n.title||'Untitled thought';date.textContent=new Date(n.updated).toLocaleDateString(undefined,{month:'short',day:'numeric'});body.append(title,date);button.append(icon,body);button.onclick=()=>{hideNoteMenu();active=n.id;selectedNode=null;render();focusFirstTextBlock()};button.oncontextmenu=event=>showNoteMenu(event,n,button);button.onkeydown=event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))showNoteMenu(event,n,button)};$('#notes').append(button)}renderProjects()};
const projectDialog=document.createElement('dialog');projectDialog.id='project-dialog';document.body.append(projectDialog);
function openProjectComposer(seed={}){let icon=seed.icon||'◆',color=seed.color||'#7669dd';projectDialog.replaceChildren();const heading=document.createElement('h2');heading.textContent=seed.path?'Connect a project':'Create a subject';const intro=document.createElement('p');intro.textContent=seed.path?`Organize notes around ${seed.path}.`:'Give this space a distinct identity so it is easy to return to.';const name=document.createElement('input');name.placeholder='Subject name';name.value=seed.name||'';name.setAttribute('aria-label','Subject name');const description=document.createElement('textarea');description.placeholder='What belongs in this project?';description.value=seed.description||'';description.setAttribute('aria-label','Subject description');const iconLabel=document.createElement('small');iconLabel.textContent='ICON';const icons=ProjectIcons.create(icon,value=>icon=value);const colorLabel=document.createElement('small');colorLabel.textContent='COLOR';const colors=document.createElement('div');colors.className='project-choices color-choices';for(const value of ['#7669dd','#39a7a5','#dd7088','#d79a35','#5886c7','#6d9b62']){const button=document.createElement('button');button.type='button';button.style.background=value;button.title=value;button.classList.toggle('selected',value===color);button.onclick=()=>{color=value;[...colors.children].forEach(item=>item.classList.toggle('selected',item===button))};colors.append(button)}const custom=document.createElement('input');custom.type='color';custom.value=color;custom.setAttribute('aria-label','Custom project color');custom.title='Choose any project color';custom.oninput=()=>{color=custom.value;[...colors.children].forEach(item=>item.classList.remove('selected'))};colors.append(custom);const actions=document.createElement('div');actions.className='project-dialog-actions';const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.onclick=()=>projectDialog.close();const save=document.createElement('button');save.className='primary';save.textContent=seed.path?'Connect project':'Create subject';save.onclick=()=>{if(!name.value.trim()){name.focus();return}const project={id:uid(),name:name.value.trim(),description:description.value.trim(),icon,color,path:seed.path||null};state.projects.push(project);filter=`project:${project.id}`;persist();projectDialog.close();if(window.marginShowProject)window.marginShowProject(project.id);else list();toast(`${project.name} created`)};actions.append(cancel,save);projectDialog.append(heading,intro,name,description,iconLabel,icons,colorLabel,colors,actions);if(!seed.path){const folder=document.createElement('button');folder.type='button';folder.className='connect-project-folder';folder.textContent='Connect a Finder folder…';folder.onclick=()=>{projectDialog.close();native({type:'chooseProjectFolder'})};projectDialog.insertBefore(folder,actions)}projectDialog.showModal();requestAnimationFrame(()=>name.focus())}
newProject.onclick=()=>openProjectComposer();
function editProject(project){projectDialog.replaceChildren();const heading=document.createElement('h2');heading.textContent='Edit subject';const name=document.createElement('input');name.value=project.name;name.setAttribute('aria-label','Subject name');const description=document.createElement('textarea');description.value=project.description||'';description.placeholder='Subject description';description.setAttribute('aria-label','Subject description');const actions=document.createElement('div');actions.className='project-dialog-actions';const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.onclick=()=>projectDialog.close();const save=document.createElement('button');save.className='primary';save.textContent='Save changes';save.onclick=()=>{if(!name.value.trim()){name.focus();return}project.name=name.value.trim();project.description=description.value.trim();persist();projectDialog.close();list();if(document.body.dataset.view==='home'&&window.marginHome)window.marginHome(filter.startsWith('project:')?filter.slice(8):null);else render();toast('Subject updated')};actions.append(cancel,save);projectDialog.append(heading,name,description,actions);projectDialog.showModal();requestAnimationFrame(()=>{name.focus();name.select()})}
window.marginEditProject=editProject;
connectProject.onclick=()=>native({type:'chooseProjectFolder'});
window.marginProjectFolderChosen=data=>{if(!data?.path)return;const existing=state.projects.find(project=>project.path===data.path);if(existing){filter=`project:${existing.id}`;list();return}openProjectComposer({name:data.name||data.path.split('/').pop(),path:data.path})};
const seed=()=>({notes:[{id:uid(),title:'A little experiment',updated:Date.now(),pinned:false,blocks:[{id:uid(),type:'text',text:'Start with a question. What happens when you change one thing? Write your idea, run the code, and keep what you discover.'},{id:uid(),type:'code',language:'javascript',text:'const numbers = [1, 2, 3];\nconst doubled = numbers.map(number => number * 2);\nconsole.log(doubled);',prediction:'What do you think will be printed?'},{id:uid(),type:'text',text:'What did you notice? Try duplicating the code cell and changing the multiplier.'}],nodes:[]}]});
function current(){return state?.notes?.find(n=>n.id===active)}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2800)}
let undoTimer=null,lastUndo=null;
function offerUndo(message,undo){lastUndo=undo;const bar=$('#toast');bar.replaceChildren();const text=document.createElement('span');text.textContent=message;const button=document.createElement('button');button.textContent='Undo';button.onclick=()=>{clearTimeout(undoTimer);lastUndo?.();lastUndo=null;bar.classList.remove('show')};bar.append(text,button);bar.classList.add('show');clearTimeout(undoTimer);undoTimer=setTimeout(()=>{lastUndo=null;bar.classList.remove('show')},6000)}
document.addEventListener('keydown',event=>{if(!(event.metaKey||event.ctrlKey)||event.shiftKey||event.key.toLowerCase()!=='z'||!lastUndo)return;const editing=document.activeElement?.matches?.('input,textarea,[contenteditable=true]');if(editing)return;event.preventDefault();const undo=lastUndo;lastUndo=null;clearTimeout(undoTimer);undo();$('#toast').classList.remove('show')});
function persist(){current()&&(current().updated=Date.now());$('#saved').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(bridge)bridge.postMessage({type:'save',state});else{try{localStorage.setItem('margin',JSON.stringify(state));$('#saved').textContent='All changes saved'}catch{toast('Storage is full. Export your notes.')}}},300)}
window.marginSaved=()=>$('#saved').textContent='All changes saved';window.marginError=m=>{toast(m);$('#saved').textContent='Could not save'};
window.marginImportWarning=m=>{toast(m);$('#connection').textContent='Foliose import needs attention';$('#connection').title=m};
function list(){const query=$('#search').value.toLowerCase();$('#notes').replaceChildren();$('#count').textContent=state.notes.length;for(const n of state.notes.filter(n=>(filter!=='pinned'||n.pinned)&&[n.title,...n.blocks.map(b=>b.text)].join(' ').toLowerCase().includes(query))){const button=document.createElement('button');button.className='note-item'+(n.id===active?' selected':'');button.dataset.filingKind='note';button.dataset.filingId=n.id;const icon=document.createElement('span');icon.textContent=n.pinned?'☆':'▤';const body=document.createElement('div'),title=document.createElement('strong'),date=document.createElement('small');title.textContent=n.title||'Untitled thought';date.textContent=new Date(n.updated).toLocaleDateString(undefined,{month:'short',day:'numeric'});body.append(title,date);button.append(icon,body);button.onclick=()=>{hideNoteMenu();active=n.id;selectedNode=null;render()};button.oncontextmenu=event=>showNoteMenu(event,n,button);button.onkeydown=event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))showNoteMenu(event,n,button)};$('#notes').append(button)}}
function words(){const n=current();$('#words').textContent=(n?.blocks.map(b=>b.text).join(' ').trim().split(/\s+/).filter(Boolean).length||0)+' words';const stats=document.querySelector('#note-rail .rail-context')?.parentElement.querySelector('p');if(n&&stats)stats.textContent=n.blocks.length+' block'+(n.blocks.length===1?'':'s')+' · '+$('#words').textContent}
function removeBlock(note,block){
 const index=note?.blocks.indexOf(block)??-1;if(index<0)return;
 note.blocks.splice(index,1);persist();render();
 const destination=Math.max(0,index-1),focusEnd=()=>{if(current()!==note)return;const input=$('#editor').children[destination]?.querySelector('.rich-text,textarea');if(!input){$('#title').focus();return}input.focus();if(input.matches('textarea'))input.setSelectionRange(input.value.length,input.value.length);else{const range=document.createRange();range.selectNodeContents(input);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)}input.scrollIntoView({block:'nearest'})};
 queueMicrotask(focusEnd);
 offerUndo('Cell deleted',()=>{note.blocks.splice(index,0,block);persist();render();$('#editor').children[index]?.querySelector('.rich-text,textarea')?.focus()});
}
function render(){RichEditor.reset();list();const n=current();$('article').hidden=!n;$('#pin').disabled=$('#delete').disabled=!n;if(!n)return;$('#title').value=n.title;$('#crumb').textContent=n.title||'Untitled thought';$('#date').textContent=new Date(n.updated).toLocaleDateString(undefined,{month:'long',day:'numeric'});$('#pin').textContent=n.pinned?'★':'☆';$('#pin').title=n.pinned?'Unstar this note':'Star this note';$('#pin').setAttribute('aria-label',$('#pin').title);$('#pin').setAttribute('aria-pressed',String(!!n.pinned));$('#pin').setAttribute('aria-pressed',String(!!n.pinned));words();renderPDFStatus(n);$('#editor').replaceChildren();LayoutModel.tidy(n.blocks,uid);const rowSize=new Map();for(const b of n.blocks)if(b.row)rowSize.set(b.row,(rowSize.get(b.row)||0)+1);let rowBox=null,rowKey=null;n.blocks.forEach(block=>{const wrap=document.createElement('section');wrap.className='block '+(block.type==='code'?'code':'')+(block.pdfRef?' pdf-note':'');const tools=document.createElement('div');tools.className='block-tools';if(block.type==='code'){const lang=document.createElement('select');lang.setAttribute('aria-label','Code language');for(const language of ['javascript','typescript','python','swift','html','css','shell','text']){const option=document.createElement('option');option.value=option.textContent=language;lang.append(option)}if(![...lang.options].some(o=>o.value===block.language)){const option=document.createElement('option');option.value=option.textContent=block.language;lang.append(option)}lang.value=block.language;lang.onchange=()=>{block.language=lang.value;persist();render()};tools.append(lang);const copy=document.createElement('button');copy.textContent='Copy';copy.onclick=async()=>{if(bridge)bridge.postMessage({type:'copy',text:block.text});else try{await navigator.clipboard.writeText(block.text);toast('Snippet copied')}catch{toast('Select the snippet and copy it manually.')}};tools.append(copy);labTools(tools,block,n)}const remove=document.createElement('button');remove.textContent='✕  Delete cell';remove.className='remove';remove.title='Delete cell (⌘⌫)';remove.setAttribute('aria-label','Delete cell');remove.setAttribute('aria-keyshortcuts','Meta+Backspace');remove.onclick=()=>removeBlock(n,block);tools.append(LayoutDrag.grip(n,block),sideControl(n,block));tools.append(remove);if(block.type==='code'){
 const input=document.createElement('textarea');input.value=block.text;input.setAttribute('aria-label','Code snippet');input.spellcheck=false;
 const size=()=>{input.style.height='auto';input.style.height=Math.max(130,input.scrollHeight)+'px'};
 input.oninput=()=>{block.text=input.value;size();words();persist();refreshResults()};
 input.onkeydown=e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&block.language==='javascript'){e.preventDefault();runLab(n,block.id);return}if(e.key==='Tab'){e.preventDefault();input.setRangeText('  ',input.selectionStart,input.selectionEnd,'end');input.dispatchEvent(new Event('input'))}};
 wrap.append(tools,input);wrap.addEventListener('click',event=>{if(event.target===wrap)input.focus()});labResult(wrap,block,n);requestAnimationFrame(size);
}else{
 wrap.append(tools);RichEditor.mount(block,wrap,()=>{words();persist();});
}
if(block.source){const source=document.createElement('div');source.className='source';const reveal=document.createElement('button');reveal.textContent=block.source.name+':'+(block.source.start+1)+' ↗';reveal.onclick=()=>native({type:'reveal',source:block.source});const comment=document.createElement('button');comment.textContent='Comment in VS Code';comment.onclick=()=>{const text=prompt('Comment on these lines:');if(text)native({type:'comment',source:block.source,text})};source.append(reveal,comment);wrap.append(source)}
if(block.pdfRef){const source=document.createElement('div');source.className='pdf-reference';if(block.pdfRef.quote&&!block.text.trim().startsWith('>')){const excerpt=document.createElement('q');excerpt.textContent=block.pdfRef.quote;excerpt.title=block.pdfRef.quote;source.append(excerpt)}const jump=document.createElement('button');jump.textContent=`▧ ${block.pdfRef.name} · page ${block.pdfRef.page} ↗`;jump.title='Jump to this passage in the PDF';jump.onclick=()=>{openPDFPath=block.pdfRef.path;native({type:'jumpPDF',path:block.pdfRef.path,page:block.pdfRef.page,bounds:block.pdfRef.bounds});renderPDFStatus(n)};source.append(jump);wrap.append(source)}
if(block.row&&rowSize.get(block.row)>1){if(block.row!==rowKey){rowBox=document.createElement('div');rowBox.className='block-row';rowBox.style.setProperty('--cols',String(Math.min(3,rowSize.get(block.row))));rowKey=block.row;$('#editor').append(rowBox)}rowBox.append(wrap)}else{rowBox=null;rowKey=null;$('#editor').append(wrap)}});setMode(mode)}
// Cells can sit side by side (see layout-model.js). This is the click alternative to dragging a cell by its grip.
function sideControl(n,block){
 const button=document.createElement('button'),row=LayoutModel.rowOf(n.blocks,block.id),together=row.cells.length>1;
 button.className='beside';
 if(together){
  button.textContent='▤  Stack';button.title='Move this cell out of the row, back to full width';
  button.onclick=()=>{LayoutModel.move(n.blocks,block.id,row.cells.find(b=>b.id!==block.id).id,'below',uid);persist();render()};
 }else{
  const before=n.blocks[n.blocks.indexOf(block)-1];
  button.textContent='◫  Beside previous';button.title='Put this cell next to the cell above it';button.disabled=!before;
  button.onclick=()=>{
   const out=LayoutModel.move(n.blocks,block.id,before.id,'right',uid);
   if(!out.ok){toast('A row holds up to '+LayoutModel.MAX_COLUMNS+' cells.');return}
   persist();render();
  };
 }
 button.setAttribute('aria-label',button.title);return button;
}
function native(message){if(bridge)bridge.postMessage(message);else toast('This action is available in the desktop app.')}
function setMode(next){mode=next;$('#editor').hidden=mode!=='write';$('#run-all').hidden=mode!=='write'||!current()?.blocks.some(b=>b.type==='code'&&b.language==='javascript');$('#add-bar').hidden=mode!=='write';$('#format-bar').hidden=mode!=='write';$('#map').hidden=mode!=='map';$('#write-tab').classList.toggle('selected',mode==='write');$('#map-tab').classList.toggle('selected',mode==='map');renderLinks();if(mode==='map')drawMap()}
function renderLinks(){
 const bar=$('#linked-files');bar.replaceChildren();const n=current();if(!n)return;
 const paths=[...(Array.isArray(n.linkedFiles)?n.linkedFiles:[]),...(n.sourceFile?[n.sourceFile]:[])];
 if(!paths.length)return;
 const label=document.createElement('span');label.textContent='LINKED FILES';bar.append(label);
 for(const path of paths){const button=document.createElement('button');button.textContent=n.linkedFileNames?.[path]||state.projects?.flatMap(s=>s.materials||[]).find(m=>m.path===path)?.name||path.split('/').filter(Boolean).pop()||path;button.title=path;button.onclick=()=>native({type:'revealFile',path});bar.append(button)}
}
function renderPDFStatus(note){
 requestAnimationFrame(renderNoteRail);
 const bar=$('#pdf-status');bar.replaceChildren();bar.hidden=!note.pdfPath;
 const attachMaterial=m=>{if(/\.pdf$/i.test(m.name)){note.pdfPath=m.path;note.pdfName=m.name;if(bridge){native({type:'showPDF',path:m.path});openPDFPath=m.path;collapseSidebarForPDF()}}else{note.linkedFiles=[...(note.linkedFiles||[]),m.path];note.linkedFileNames={...(note.linkedFileNames||{}),[m.path]:m.name}}persist();render()};
 const picker=window.marginNoteMaterialPicker?.(note,attachMaterial);
 if(picker){bar.hidden=false;0}else bar.classList.remove('picker-only');
 if(!note.pdfPath){if(picker)bar.append(picker);if(openPDFPath){native({type:'closePDF'});openPDFPath=null}return}
 if(openPDFPath&&openPDFPath!==note.pdfPath){native({type:'showPDF',path:note.pdfPath});openPDFPath=note.pdfPath;collapseSidebarForPDF()}
 const label=document.createElement('span');label.textContent=`▧ ${note.pdfName||note.pdfPath.split('/').pop()}`;
 const open=document.createElement('button');open.textContent=openPDFPath===note.pdfPath?'PDF open':'Open beside note';open.onclick=()=>{native({type:'showPDF',path:note.pdfPath});openPDFPath=note.pdfPath;collapseSidebarForPDF();renderPDFStatus(note)};
 const detach=document.createElement('button');detach.textContent='Detach';detach.onclick=()=>{note.pdfPath=null;note.pdfName=null;if(openPDFPath){native({type:'closePDF'});openPDFPath=null}persist();render()};
 bar.append(label,open);const unitPDF=window.marginNotePDFControl?.(note,()=>renderPDFStatus(note));if(unitPDF)bar.append(unitPDF);bar.append(detach);if(picker)bar.append(picker);
 renderPDFSelection();
 if(bridge&&openPDFPath===note.pdfPath)syncPDFHighlights(note);
}
function syncPDFHighlights(note){native({type:'showPDFHighlights',highlights:(note?.blocks||[]).filter(block=>block.pdfRef?.kind==='highlight'&&block.pdfRef.bounds).map(block=>({page:block.pdfRef.page,bounds:block.pdfRef.bounds}))})}
function savePDFAnnotation(kind,comment='',html=''){
 const note=current(),data=pendingPDFSelection;if(!note||!data)return;
 const block=PDFNotes.blockFromCapture({...data,kind,comment},uid());if(!block)return;if(kind==='comment'&&html)block.html=html;
 note.blocks.push(block);let nextId=null;if(kind==='comment'){nextId=uid();note.blocks.push({id:nextId,type:'text',text:''})}pendingPDFSelection=null;pendingPDFCommentDraft=null;persist();render();syncPDFHighlights(note);
 const index=nextId?note.blocks.findIndex(item=>item.id===nextId):note.blocks.findIndex(item=>item.id===block.id),cell=$('#editor').children[index];cell?.scrollIntoView({behavior:'smooth',block:'center'});cell?.querySelector('.rich-text')?.focus();
 toast(kind==='highlight'?`Highlighted page ${data.page}`:`Comment added to page ${data.page}`);
}
function renderPDFSelection(){
 const panel=$('#pdf-selection');if(!panel)return;
 const data=pendingPDFSelection,note=current();panel.replaceChildren();panel.hidden=!data||data.path!==note?.pdfPath;if(panel.hidden)return;
 const label=document.createElement('small');label.textContent=`SELECTED · PAGE ${data.page}`;
 const quote=document.createElement('q');quote.textContent=data.text;
 pendingPDFCommentDraft??={id:'pdf-comment-draft',type:'text',text:''};const inputWrap=document.createElement('div');inputWrap.className='pdf-comment-editor';const input=RichEditor.mount(pendingPDFCommentDraft,inputWrap,()=>{});input.setAttribute('data-placeholder','Comment on this passage…');input.setAttribute('aria-label','Comment on selected PDF text');
 const actions=document.createElement('div'),highlight=document.createElement('button'),comment=document.createElement('button'),dismiss=document.createElement('button');
 highlight.textContent='Highlight';highlight.onclick=()=>savePDFAnnotation('highlight');comment.textContent='Add comment';comment.className='primary';comment.onclick=()=>savePDFAnnotation('comment',pendingPDFCommentDraft.text,pendingPDFCommentDraft.html);dismiss.textContent='Dismiss';dismiss.onclick=()=>{pendingPDFSelection=null;pendingPDFCommentDraft=null;renderPDFSelection()};
 input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();event.stopPropagation();if(pendingPDFCommentDraft.text.trim())savePDFAnnotation('comment',pendingPDFCommentDraft.text,pendingPDFCommentDraft.html)}},true);
 actions.append(highlight,dismiss,comment);panel.append(label,quote,inputWrap,actions);requestAnimationFrame(()=>input.focus());
}
function drawMap(){const n=current();if(!n)return;let heading=$('#note-map-heading');if(!heading){heading=document.createElement('h2');heading.id='note-map-heading';$('#map').prepend(heading)}heading.textContent=(n.title||'Untitled note')+' · Mind map';if(!n.nodes.length)n.nodes.push({id:'root',label:n.title||'New idea',x:160,y:140});$('#nodes').replaceChildren();$('#edges').replaceChildren();for(const node of n.nodes){const el=document.createElement('button');el.className='map-node'+(!node.parent?' root':'')+(selectedNode===node.id?' selected':'');el.textContent=node.label;el.style.left=node.x+'px';el.style.top=node.y+'px';el.onpointerdown=e=>{selectedNode=node.id;const startX=e.clientX,startY=e.clientY,ox=node.x,oy=node.y;el.setPointerCapture(e.pointerId);el.onpointermove=ev=>{const scale=window.marginMapView?.scale()||1;node.x=Math.max(0,ox+(ev.clientX-startX)/scale);node.y=Math.max(0,oy+(ev.clientY-startY)/scale);el.style.left=node.x+'px';el.style.top=node.y+'px';edges()};el.onpointerup=()=>{el.onpointermove=null;window.marginSettleMap?.(n,node.id);persist();document.querySelectorAll('.map-node').forEach(item=>item.classList.toggle('selected',item===el))}};el.ondblclick=()=>{const label=prompt('Idea',node.label);if(label?.trim()){node.label=label.trim();persist();drawMap()}};$('#nodes').append(el)}edges()}
function edges(){const n=current();$('#edges').replaceChildren();for(const node of n.nodes){const parent=n.nodes.find(p=>p.id===node.parent);if(!parent)continue;const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',`M ${parent.x+65} ${parent.y+22} Q ${parent.x+65} ${node.y+22}, ${node.x+65} ${node.y+22}`);line.setAttribute('stroke','#b4c3a7');line.setAttribute('stroke-width','1.5');line.setAttribute('fill','none');$('#edges').append(line)}}
$('#new').onclick=()=>{const n={id:uid(),title:'',updated:Date.now(),blocks:[{id:uid(),type:'text',text:''}],nodes:[],pinned:false};state.notes.unshift(n);active=n.id;filter='';mode='write';persist();render();$('#title').focus()};$('#title').oninput=e=>{current().title=e.target.value;$('#crumb').textContent=e.target.value;list();persist()};$('#search').oninput=list;$('#all').onclick=()=>{filter='';$('#all').classList.add('active');$('#pinned').classList.remove('active');list()};$('#pinned').onclick=()=>{filter='pinned';$('#pinned').classList.add('active');$('#all').classList.remove('active');list()};$('#pin').onclick=()=>{if(!current())return;current().pinned=!current().pinned;persist();render()};$('#delete').onclick=()=>{if(!confirm('Delete this note? This cannot be undone.'))return;state.notes=state.notes.filter(n=>n.id!==active);active=state.notes[0]?.id;persist();render()};document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{current().blocks.push({id:uid(),type:b.dataset.add,text:'',language:'javascript'});persist();render();$('#editor').lastElementChild.querySelector('.rich-text,textarea').focus()});$('#write-tab').onclick=()=>setMode('write');$('#map-tab').onclick=$('#to-map').onclick=()=>setMode('map');$('#add-node').onclick=()=>{const label=prompt('New idea');if(!label?.trim())return;current().nodes.push({id:uid(),label:label.trim(),parent:current().nodes.some(node=>node.id===selectedNode)?selectedNode:current().nodes[0].id,x:40+Math.random()*250,y:40+Math.random()*240});persist();drawMap()};$('#remove-node').onclick=()=>{const n=current(),node=n.nodes.find(x=>x.id===selectedNode);if(!node?.parent){toast('Select a connected idea to remove.');return}n.nodes.forEach(x=>{if(x.parent===node.id)x.parent=node.parent});n.nodes=n.nodes.filter(x=>x.id!==node.id);selectedNode=null;persist();drawMap()};$('#capture').onclick=()=>$('#help').showModal();$('#close-help').onclick=()=>$('#help').close();$('#export').onclick=()=>{const text=JSON.stringify(state,null,2);if(bridge)bridge.postMessage({type:'export',text});else{const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='notival-notes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}};document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='n'){e.preventDefault();$('#new').click()}});
$('#import').onclick=()=>native({type:'import'});
$('#open-pdf').onclick=()=>{if(!current())return;native({type:'openPDF'})};window.marginNotice=message=>toast(String(message||''));$('#open-pdf').title='Open a PDF from Foliose, beside this note';
window.marginPDFOpened=data=>{
 if(typeof data?.path!=='string')return;
 let note=state.notes.find(item=>item.pdfPath===data.path);
 if(note){active=note.id;toast('Resumed this PDF workspace')}
 else{note={id:uid(),title:(data.name||'PDF notes').replace(/\.pdf$/i,''),updated:Date.now(),pinned:false,blocks:[{id:uid(),type:'text',text:''}],nodes:[],pdfPath:data.path,pdfName:data.name,...(window.marginCaptureDestination?.()||{})};state.notes.unshift(note);active=note.id;toast('Created a note for this PDF')}
 openPDFPath=data.path;pendingPDFSelection=null;persist();render();syncPDFHighlights(note);if(typeof collapseSidebarForPDF==='function')collapseSidebarForPDF();
};
window.marginPDFClosed=()=>{openPDFPath=null;requestAnimationFrame(renderNoteRail);if(typeof sidebarAutoCollapsed!=='undefined'&&sidebarAutoCollapsed){sidebarAutoCollapsed=false;setSidebarCollapsed(false)}const note=current();if(note)renderPDFStatus(note)};
// A figure traced out of the PDF becomes an image in the note, at the caret (or the end of the note).
function focusInsertionPoint(){
 if(mode!=='write')setMode('write');
 const editors=[...document.querySelectorAll('#editor .rich-text')];if(!editors.length)return null;
 let target=null;
 // Insert where the writer last had the caret; only fall back to the end of the note if there is none.
 const remembered=RichEditor.rememberedCaret?.();
 if(remembered&&remembered.editor.isConnected&&editors.includes(remembered.editor)&&remembered.editor.contains(remembered.range.startContainer)){
  target=remembered.editor;target.focus();const selection=getSelection();selection.removeAllRanges();selection.addRange(remembered.range);
  const active=RichEditor.active();if(active)active.range=remembered.range.cloneRange();
 }
 if(!target){target=RichEditor.active()?.editor;}
 if(!target?.isConnected||!editors.includes(target)){target=editors.at(-1);target.focus();const range=document.createRange();range.selectNodeContents(target);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)}
 return target;
}
// A figure traced out of the PDF becomes an image in the note, at the caret (or the end of the note).
window.marginPDFImage=async data=>{
 const note=current();if(!note||typeof data?.dataURL!=='string'||!/^data:image\/png;base64,/.test(data.dataURL))return;
 if(!focusInsertionPoint())return;
 const blob=await (await fetch(data.dataURL)).blob(),name=String(data.name||'PDF').replace(/\.pdf$/i,'');
 RichEditor.insertImage(new File([blob],'figure.png',{type:'image/png'}),'Figure from '+name+(data.page?', page '+data.page:''));
 toast('Figure added to your note');
};
// Fix the structural slips recognition often makes: stray \\right, missing \\left or closing brace.
function repairLatex(source){
 let text=String(source),stack=0,out='',lastIndex=0;
 const pattern=/\\(left|right)(?![A-Za-z])\s*(\\[{}|]|\\[A-Za-z]+|[()\[\]|.<>\/])?/g;let match;
 while((match=pattern.exec(text))){
  out+=text.slice(lastIndex,match.index);lastIndex=pattern.lastIndex;
  if(match[1]==='left'){stack++;out+=match[0]}
  else if(stack>0){stack--;out+=match[0]}
  // an unmatched \\right and its delimiter are simply dropped
 }
 out+=text.slice(lastIndex)+'\\right.'.repeat(stack);
 let depth=0,fixed='';
 for(let i=0;i<out.length;i++){
  const char=out[i];
  if(char==='\\'){fixed+=char+(out[i+1]??'');i++;continue}
  if(char==='{')depth++;
  if(char==='}'){if(depth===0)continue;depth--}
  fixed+=char;
 }
 return fixed+'}'.repeat(depth);
}
function latexRenders(source,display=true){
 if(typeof katex==='undefined')return true;
 try{katex.renderToString(MathSyntax.katexSource(source),{displayMode:display,throwOnError:true,trust:false,maxExpand:1000,maxSize:20});return true}catch{return false}
}
// An equation traced out of the PDF arrives as LaTeX, opened in the live equation editor to check and accept.
window.marginPDFEquation=async data=>{
 const note=current();if(!note)return;
 if(typeof data?.latex==='string'&&data.latex.trim()){
  // Take the first reading that renders (after repair); otherwise repair the best one and let the writer fix the rest.
  const readings=[...new Set([data.latex,...(Array.isArray(data.candidates)?data.candidates:[])].map(text=>MathSyntax.tidyLatex(String(text).trim())).filter(Boolean))];
  let best=null;
  for(const reading of readings){const repaired=repairLatex(reading);if(latexRenders(repaired,!data.inline)){best=repaired;break}}
  const renders=!!best;if(!best)best=repairLatex(readings[0]);
  if(!focusInsertionPoint())return;
  RichEditor.command(data.inline?'inlineequation':'equation',best.slice(0,2000));
  toast(!renders?'Read as LaTeX, but part of it doesn’t render yet. Fix the red part, then press Enter':data.uncertain?'Read as LaTeX, but check it carefully · Enter to accept':'Read as LaTeX · check it, then press Enter');
  return;
 }
 // Not recognized (or not set up): keep the work by adding the traced picture instead.
 const reason=data?.error==='setup'?'Equation recognition isn’t set up yet. Run scripts/setup-latex-ocr.sh once. Added the picture instead.':'Couldn’t read that as LaTeX, so I added it as a picture.';
 await window.marginPDFImage(data);toast(reason);
};
window.marginPDFSelection=data=>{if(!data||data.path!==current()?.pdfPath)return;pendingPDFSelection=data;pendingPDFCommentDraft=null;renderPDFSelection()};
window.marginPDFCapture=data=>{
 const note=current(),block=PDFNotes.blockFromCapture(data,uid());if(!note||!block)return;
 const quote=data.kind==='quote',comment=data.kind==='comment';
 note.pdfPath=data.path;note.pdfName=data.name||note.pdfName;note.blocks.push(block);persist();render();
 const cell=[...$('#editor .block')].find((item,index)=>note.blocks[index]?.id===block.id);
 cell?.querySelector('.rich-text')?.focus();cell?.scrollIntoView({behavior:'smooth',block:'center'});
 toast(comment?`Comment added to page ${data.page}`:quote?`Quote captured from page ${data.page}`:`Thought linked to page ${data.page}`);
};
window.marginImportBackup=backup=>{
 if(!Array.isArray(backup?.notes))return;
 const known=new Set([...state.notes,...state.trash].map(note=>note.id));
 const valid=note=>note&&typeof note.id==='string'&&typeof note.title==='string'&&Array.isArray(note.blocks)&&note.blocks.every(block=>block&&typeof block.text==='string'&&['text','code'].includes(block.type));
 const additions=[];for(const note of backup.notes){if(valid(note)&&!known.has(note.id)){additions.push(note);known.add(note.id)}}
 const trashed=[];for(const note of Array.isArray(backup.trash)?backup.trash:[]){if(valid(note)&&!known.has(note.id)){trashed.push(note);known.add(note.id)}}
 const subjects=(Array.isArray(backup.projects)?backup.projects:[]).filter(project=>project&&typeof project.id==='string'&&typeof project.name==='string'&&!state.projects.some(p=>p.id===project.id));
 if(!additions.length&&!trashed.length&&!subjects.length){toast('No new notes or subjects in that backup');return}
 state.projects.push(...subjects);
 state.notes.unshift(...additions);
 state.trash.unshift(...trashed);
 state.importedOrigins.push(...additions.map(note=>note.origin).filter(Boolean));
 state.importedOrigins.push(...trashed.map(note=>note.origin).filter(Boolean));
 if(additions.length)active=additions[0].id;persist();render();updateTrashCount();toast(`${additions.length+trashed.length} note${additions.length+trashed.length===1?'':'s'} imported`);
};
$('#run-all').onclick=()=>runLab(current());
window.marginLoad=data=>{state=data?.notes?data:seed();state.projects??=[];state.importedOrigins??=state.notes.map(note=>note.origin).filter(Boolean);active=state.notes[0]?.id;render();focusFirstTextBlock();window.dispatchEvent(new Event('notival-ready'))};
window.marginCapture=data=>{
 const files=Array.isArray(data.paths)?data.paths.filter(path=>typeof path==='string'&&path.startsWith('/')).slice(0,100):[];
 const blocks=files.length?[{id:uid(),type:'text',text:(data.text||'')+(data.text?'\n\n':'')+files.map(path=>'file://'+encodeURI(path)).join('\n')}]:
   [{id:uid(),type:'code',text:data.text||'',language:data.language||'text',source:data.source},{id:uid(),type:'text',text:''}];
 const n={id:uid(),title:data.title||'Captured selection',updated:Date.now(),pinned:false,nodes:[],blocks,contextFolder:data.context||null,linkedFiles:files,...(window.marginCaptureDestination?.()||{})};
 state.notes.unshift(n);active=n.id;mode='write';persist();render();toast(files.length?'Files linked in Notival':'Selection captured');
};
window.marginImportFoliose=imported=>{
 if(!Array.isArray(imported)||!imported.length)return;
 const known=new Set(state.importedOrigins);
 const additions=imported.filter(note=>note&&typeof note.origin==='string'&&!known.has(note.origin));
 if(!additions.length)return;
 state.importedOrigins.push(...additions.map(note=>note.origin));
 const activeNotes=additions.filter(note=>!note.deletedAt),deletedNotes=additions.filter(note=>!!note.deletedAt);
 state.notes.unshift(...activeNotes);state.trash.unshift(...deletedNotes);
 if(activeNotes.length)active=activeNotes[0].id;persist();render();updateTrashCount();toast(`${additions.length} Foliose note${additions.length===1?'':'s'} imported`);
};
if(bridge){const ready=()=>bridge.postMessage({type:'ready'});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready()}else{try{window.marginLoad(JSON.parse(localStorage.getItem('margin')))}catch{window.marginLoad(null)}}

// Notes have a recoverable destination before permanent removal. Imported
// Foliose IDs remain recorded even when their copies are moved to Trash.
const originalNotivalLoad=window.marginLoad;
window.marginLoad=data=>{originalNotivalLoad(data);state.trash??=[];state.archive??=[];updateTrashCount();updateArchiveCount()};
if(state)state.trash??=[];
if(state)state.archive??=[];
const archiveButton=document.createElement('button');archiveButton.id='archive';archiveButton.className='nav';archiveButton.textContent='▱   Archive';$('#pinned').after(archiveButton);
const archiveDialog=document.createElement('dialog');archiveDialog.id='archive-dialog';document.body.append(archiveDialog);
function updateArchiveCount(){archiveButton.textContent=`▱   Archive (${state?.archive?.length||0})`}
function renderArchive(){archiveDialog.replaceChildren();const heading=document.createElement('h2');heading.textContent='Archive';archiveDialog.append(heading);for(const note of state.archive){const row=document.createElement('div');row.className='trash-row';const name=document.createElement('strong');name.textContent=note.title||'Untitled thought';const restore=document.createElement('button');restore.textContent='Restore';restore.onclick=()=>{state.archive=state.archive.filter(item=>item.id!==note.id);delete note.archivedAt;state.notes.unshift(note);active=note.id;persist();render();updateArchiveCount();renderArchive();archiveDialog.close()};row.append(name,restore);archiveDialog.append(row)}if(!state.archive.length){const empty=document.createElement('p');empty.textContent='Archive is empty.';archiveDialog.append(empty)}const close=document.createElement('button');close.textContent='Done';close.onclick=()=>archiveDialog.close();archiveDialog.append(close)}
archiveButton.onclick=()=>{renderArchive();archiveDialog.showModal()};
function visibleSidebarNotes(){const query=$('#search').value.toLowerCase(),projectId=filter.startsWith('project:')?filter.slice(8):null;return state.notes.filter(note=>(filter!=='pinned'||note.pinned)&&(!projectId||note.projectId===projectId)&&[note.title,...note.blocks.map(block=>block.text)].join(' ').toLowerCase().includes(query))}
function noteForCard(card){return visibleSidebarNotes()[[...$('#notes').children].indexOf(card)]}
const swipeState=new WeakMap();
function resetSwipe(card){card.style.transform='';card.classList.remove('swipe-delete','swipe-archive');card.removeAttribute('data-swipe')}
$('#notes').addEventListener('wheel',event=>{const card=event.target.closest('.note-item');if(!card||Math.abs(event.deltaX)<=Math.abs(event.deltaY))return;event.preventDefault();const previous=swipeState.get(card)||{offset:0,timer:null,done:false};if(previous.done)return;previous.offset+=event.deltaX;const amount=Math.max(-105,Math.min(105,-previous.offset));card.style.transform=`translateX(${amount}px)`;const deleting=previous.offset>0;card.classList.toggle('swipe-delete',deleting);card.classList.toggle('swipe-archive',!deleting);card.dataset.swipe=deleting?'Delete':'Archive';clearTimeout(previous.timer);previous.timer=setTimeout(()=>{if(Math.abs(previous.offset)>=70){previous.done=true;const note=noteForCard(card);deleting?moveNoteToTrash(note):archiveNote(note)}else resetSwipe(card)},140);swipeState.set(card,previous)},{passive:false});
$('#notes').addEventListener('pointerdown',event=>{const card=event.target.closest('.note-item');if(!card||event.pointerType==='mouse')return;const start=event.clientX;card.setPointerCapture(event.pointerId);card.onpointermove=move=>{const delta=move.clientX-start;if(Math.abs(delta)<8)return;move.preventDefault();card.style.transform=`translateX(${Math.max(-105,Math.min(105,delta))}px)`;card.classList.toggle('swipe-delete',delta<0);card.classList.toggle('swipe-archive',delta>0);card.dataset.swipe=delta<0?'Delete':'Archive'};card.onpointerup=up=>{const delta=up.clientX-start;card.onpointermove=null;card.onpointerup=null;if(Math.abs(delta)>=70){const note=noteForCard(card);delta<0?moveNoteToTrash(note):archiveNote(note)}else resetSwipe(card)}});
const trashButton=document.createElement('button');trashButton.id='trash';trashButton.className='nav';trashButton.textContent='♧   Trash';
$('#pinned').after(trashButton);
const trashDialog=document.createElement('dialog');trashDialog.id='trash-dialog';document.body.append(trashDialog);
function updateTrashCount(){trashButton.textContent=`♧   Trash (${state?.trash?.length||0})`}
function renderTrash(){
 trashDialog.replaceChildren();
 const heading=document.createElement('h2');heading.textContent='Trash';trashDialog.append(heading);
 const intro=document.createElement('p');intro.textContent='Deleted notes stay here until you remove them permanently.';trashDialog.append(intro);
 for(const note of state.trash){
  const row=document.createElement('div');row.className='trash-row';
  const name=document.createElement('strong');name.textContent=note.title||'Untitled thought';row.append(name);
  const restore=document.createElement('button');restore.textContent='Restore';restore.onclick=()=>{
   state.trash=state.trash.filter(item=>item.id!==note.id);state.notes.unshift(note);active=note.id;
   persist();render();updateTrashCount();renderTrash();trashDialog.close();toast('Note restored')
  };row.append(restore);
  const remove=document.createElement('button');remove.textContent='Delete permanently';remove.onclick=()=>{
   if(!confirm(`Permanently delete ${note.title||'this note'}?`))return;
   state.trash=state.trash.filter(item=>item.id!==note.id);persist();updateTrashCount();renderTrash()
  };row.append(remove);trashDialog.append(row)
 }
 if(!state.trash.length){const empty=document.createElement('p');empty.textContent='Trash is empty.';trashDialog.append(empty)}
 const close=document.createElement('button');close.textContent='Done';close.onclick=()=>trashDialog.close();trashDialog.append(close)
}
trashButton.onclick=()=>{renderTrash();trashDialog.showModal()};
const noteMenu=document.createElement('div');noteMenu.id='note-menu';noteMenu.setAttribute('role','menu');noteMenu.hidden=true;document.body.append(noteMenu);
let noteMenuTrigger=null;
function hideNoteMenu(){noteMenu.hidden=true;noteMenu.replaceChildren();noteMenuTrigger=null}
function showNoteMenu(event,note,trigger){
 event.preventDefault();hideNoteMenu();noteMenuTrigger=trigger;
 const action=(label,run)=>{const item=document.createElement('button');item.type='button';item.setAttribute('role','menuitem');item.textContent=label;item.onclick=()=>{hideNoteMenu();run()};noteMenu.append(item);return item};
 action('Open note',()=>{active=note.id;selectedNode=null;render()});
 action('Rename note',()=>{active=note.id;selectedNode=null;render();requestAnimationFrame(()=>{$('#title').focus();$('#title').select()})});
 action(note.pinned?'Unpin note':'Pin note',()=>{note.pinned=!note.pinned;note.updated=Date.now();persist();render()});
 action('Archive note',()=>archiveNote(note));
 action('Move to subject or unit…',()=>window.marginNoteLocation?.open(note,trigger));
 const remove=action('Delete note',()=>moveNoteToTrash(note));remove.className='danger';remove.title='Move note to Trash';
 noteMenu.hidden=false;
 const bounds=trigger.getBoundingClientRect(),x=event.clientX||bounds.left+12,y=event.clientY||bounds.bottom;
 noteMenu.style.left=Math.max(8,Math.min(x,window.innerWidth-noteMenu.offsetWidth-8))+'px';
 noteMenu.style.top=Math.max(8,Math.min(y,window.innerHeight-noteMenu.offsetHeight-8))+'px';
 noteMenu.querySelector('button')?.focus();
}
document.addEventListener('pointerdown',event=>{if(!noteMenu.hidden&&!noteMenu.contains(event.target))hideNoteMenu()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!noteMenu.hidden){event.preventDefault();const trigger=noteMenuTrigger;hideNoteMenu();trigger?.focus()}});
window.addEventListener('resize',hideNoteMenu);
function moveNoteToTrash(note){
 if(!note||!state.notes.some(item=>item.id===note.id))return;
 const index=state.notes.indexOf(note);state.trash??=[];note.deletedAt=Date.now();state.trash.unshift(note);state.notes.splice(index,1);
 // Deleting the open note returns to Home rather than dropping you into some other note.
 const wasOpen=active===note.id;if(wasOpen)active=null;
 persist();render();updateTrashCount();offerUndo('Note moved to Trash',()=>{state.trash=state.trash.filter(item=>item.id!==note.id);delete note.deletedAt;state.notes.splice(Math.min(index,state.notes.length),0,note);if(wasOpen)active=note.id;persist();render();updateTrashCount()});
}
function archiveNote(note){if(!note||!state.notes.includes(note))return;const index=state.notes.indexOf(note);state.archive??=[];note.archivedAt=Date.now();state.archive.unshift(note);state.notes.splice(index,1);const wasOpen=active===note.id;if(wasOpen)active=null;persist();render();updateArchiveCount();offerUndo('Note archived',()=>{state.archive=state.archive.filter(item=>item.id!==note.id);delete note.archivedAt;state.notes.splice(Math.min(index,state.notes.length),0,note);if(wasOpen)active=note.id;persist();render();updateArchiveCount()})}
$('#delete').title='Move note to Trash';
$('#delete').onclick=()=>moveNoteToTrash(current());
updateTrashCount();

for(const button of document.querySelectorAll('#format-bar [data-command]'))button.onmousedown=e=>e.preventDefault();
for(const button of document.querySelectorAll('#format-bar [data-command]'))button.onclick=()=>RichEditor.command(button.dataset.command,button.dataset.value);
$('#heading-style').onchange=e=>{if(e.target.value){RichEditor.command('heading',e.target.value)}};
$('#insert-template').onchange=e=>{if(e.target.value){RichEditor.command('template',e.target.value);e.target.value=''}};
$('#image-picker').onchange=e=>{const file=e.target.files?.[0];if(file)RichEditor.insertImage(file);e.target.value=''};

function addBlock(type){
 const note=current();if(!note||$('article').hidden||mode!=='write')return;
 const previous=[...note.blocks].reverse().find(block=>block.type===type);
 note.blocks.push({id:uid(),type,text:'',language:note.defaultLanguage||previous?.language||'javascript'});
 persist();render();
 $('#editor').lastElementChild.querySelector('.rich-text,textarea').focus();
 if(type==='code')requestAnimationFrame(()=>{const input=$('#editor').lastElementChild.querySelector('textarea');input?.focus();input?.setSelectionRange(0,0)});
}
for(const button of document.querySelectorAll('#add-bar [data-add]'))button.onclick=()=>addBlock(button.dataset.add);
document.addEventListener('keydown',event=>{
 if(!(event.metaKey||event.ctrlKey)||!event.shiftKey||event.altKey||event.repeat||document.querySelector('dialog[open]'))return;
 const type=event.key.toLowerCase()==='t'?'text':event.key.toLowerCase()==='c'?'code':null;
 if(type && current() && mode==='write'){event.preventDefault();addBlock(type);}
});
document.addEventListener('keydown',event=>{
 if(!(event.metaKey||event.ctrlKey)||!event.shiftKey||event.altKey||event.repeat||document.querySelector('dialog[open]'))return;
 const kind=event.key.toLowerCase()==='q'?'quote':event.key.toLowerCase()==='p'?'thought':null;
 if(kind&&openPDFPath){event.preventDefault();native({type:'capturePDF',kind})}
});
document.addEventListener('keydown',event=>{
 if(!(event.metaKey||event.ctrlKey)||event.altKey||event.repeat||!['Backspace','Delete'].includes(event.key)||mode!=='write'||document.querySelector('dialog[open]'))return;
 const cell=document.activeElement?.closest?.('#editor .block');
 if(!cell)return;
 const note=current(),index=[...$('#editor').children].indexOf(cell),block=note?.blocks[index];
 if(block){event.preventDefault();removeBlock(note,block);}
});
const layoutDialog=document.createElement('dialog');layoutDialog.className='layout-dialog';document.body.append(layoutDialog);
const noteLayouts={blank:{icon:'✦',name:'Blank note',description:'Start with a clean page.',text:''},lecture:{icon:'🎓',name:'Lecture notes',description:'Main ideas, questions, and review.',text:'# Lecture notes\n\n## Main ideas\n\n- \n\n## Questions\n\n- [ ] Review these ideas\n'},reading:{icon:'📖',name:'Reading notes',description:'Source, key points, and your take.',text:'# Reading notes\n\n## Source\n\n## Key points\n\n- \n\n## My take\n'},assignment:{icon:'✓',name:'Assignment',description:'A goal, plan, and references.',text:'# Assignment\n\n## Goal\n\n## Plan\n\n- [ ] First step\n\n## References\n'},cornell:{icon:'▦',name:'Cornell notes',description:'Cues, detailed notes, and recall.',text:'# Cornell notes\n\n## Cues and questions\n\n- \n\n## Detailed notes\n\n## Summary from memory\n\n## Review checklist\n\n- [ ] Explain the key ideas without looking\n'}};
function createLayoutNote(layout){const choice=noteLayouts[layout]||noteLayouts.blank,projectId=filter.startsWith('project:')?filter.slice(8):null,block={id:uid(),type:'text',text:choice.text};if(choice.text)block.html=RichEditor.fromMarkdown(choice.text);const note={id:uid(),title:'',updated:Date.now(),blocks:[block],nodes:[],pinned:false};const destination=window.marginCaptureDestination?.()||{projectId,unitId:null};if(destination.projectId)note.projectId=destination.projectId;if(destination.unitId)note.unitId=destination.unitId;state.notes.unshift(note);active=note.id;mode='write';persist();layoutDialog.close();render();requestAnimationFrame(()=>$('#title').focus())}
function chooseNoteLayout(){layoutDialog.replaceChildren();const heading=document.createElement('h2');heading.textContent='What are you creating?';const intro=document.createElement('p');intro.textContent='Choose a starting structure. You can edit everything once the note opens.';const grid=document.createElement('div');grid.className='layout-grid';for(const [key,layout] of Object.entries(noteLayouts)){const option=document.createElement('button');option.className='layout-card';option.innerHTML=`<span>${layout.icon}</span><strong>${layout.name}</strong><small>${layout.description}</small>`;option.onclick=()=>createLayoutNote(key);grid.append(option)}const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.onclick=()=>layoutDialog.close();layoutDialog.append(heading,intro,grid,cancel);layoutDialog.showModal();requestAnimationFrame(()=>grid.querySelector('button')?.focus())}
$('#new').onclick=()=>createLayoutNote('blank');
// Enter settles the title and drops the caret at the start of the first text block.
$('#title').addEventListener('keydown',event=>{
 if(event.key!=='Enter'||event.isComposing||!current())return;event.preventDefault();
 const note=current(),title=$('#title'),text=title.value.trim();
 title.value=text;note.title=text;$('#crumb').textContent=text||'Untitled thought';
 if(!note.blocks.some(block=>block.type==='text'))note.blocks.unshift({id:uid(),type:'text',text:''});
 persist();render();list();
 const id=note.id;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(active!==id||document.querySelector('dialog[open]'))return;
  const editor=$('#editor .rich-text');if(!editor)return;
  editor.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(editor);range.collapse(true);
  const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
 }));
});
$('#delete').textContent='Delete note';$('#delete').setAttribute('aria-label','Move note to Trash');
setSidebarCollapsed(false);

let outlineRefreshPending=false;document.querySelector('#editor').addEventListener('input',()=>{if(!outlineRefreshPending){outlineRefreshPending=true;requestAnimationFrame(()=>{outlineRefreshPending=false;renderNoteRail()})}});
