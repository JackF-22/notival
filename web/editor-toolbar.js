/* Keep the original controls and handlers, with writing first and tools nearby. */
(()=>{
 const $=s=>document.querySelector(s),bar=$('#format-bar');if(!bar)return;
 const makeButton=(label,id,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.id=id;b.onclick=action;return b};
 const menus=[];
 function closeMenus(){for(const {trigger,panel} of menus){panel.hidden=true;trigger.setAttribute('aria-expanded','false')}}
 function menu(label,id,parent){
  const wrap=document.createElement('div');wrap.className='editor-menu';
  const panel=document.createElement('div');panel.id=id+'-panel';panel.className='editor-menu-panel';panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label',label);
  const trigger=makeButton(label+' ▾',id,()=>{const open=panel.hidden;closeMenus();panel.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open&&document.activeElement===trigger)panel.querySelector('button')?.focus()});
  trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',panel.id);trigger.onmousedown=e=>e.preventDefault();wrap.append(trigger,panel);parent.append(wrap);menus.push({trigger,panel});
  panel.addEventListener('click',e=>{if(e.target.closest('button'))closeMenus()});
  wrap.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenus();trigger.focus()}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const items=[...panel.querySelectorAll('button:not([hidden])')],index=items.indexOf(document.activeElement);items[(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()}});
  return panel;
 }
 const selectionTools=document.createElement('div');selectionTools.id='selection-tools';selectionTools.hidden=true;selectionTools.setAttribute('role','toolbar');selectionTools.setAttribute('aria-label','Selected passage');document.body.append(selectionTools);
 const core=new Set(['bold','italic','insertUnorderedList','insertOrderedList','task']);
 let highlightColor='yellow';
 const insert=menu('Insert','editor-insert',bar);
 for(const control of [...bar.children]){
  if(control.classList.contains('format-separator')){control.remove();continue}
  if(control.hidden||control.id==='heading-style'||control.classList.contains('editor-menu'))continue;
  if(core.has(control.dataset.command))continue;
  if(control.dataset.command==='highlight'){control.onmousedown=e=>e.preventDefault();control.onclick=()=>RichEditor.command('highlight',highlightColor);continue}
  if(['underline','strikeThrough'].includes(control.dataset.command)){const copy=control.cloneNode(true);copy.onmousedown=e=>e.preventDefault();copy.onclick=()=>RichEditor.command(copy.dataset.command);selectionTools.append(copy);continue}
  if(control.id==='connect-passages')continue;
  control.textContent=control.getAttribute('aria-label')||control.textContent||control.title;insert.append(control);
 }
 const alignment=menu('Align','editor-alignment',bar);bar.insertBefore(alignment.parentElement,insert.parentElement);
 for(const [label,command] of [['Left','justifyLeft'],['Center','justifyCenter'],['Right','justifyRight'],['Justify','justifyFull']]){const b=makeButton(label,'align-'+label.toLowerCase(),()=>RichEditor.command(command));b.onmousedown=e=>e.preventDefault();alignment.append(b)}
 const passageButton=$('#connect-passages');passageButton.textContent='Connect';passageButton.title='Connect passages: draw a line between two parts of this note';insert.parentElement.after(passageButton);
 // The Note / Mind map switch lives in the always-visible toolbar above, so the format bar only formats.
 // Word count lives in the Insert menu: it switches a live count on or off for the block the caret is in.
 const wordCount=makeButton('Word count','insert-word-count',()=>RichEditor.command('wordcount'));wordCount.onmousedown=e=>e.preventDefault();insert.append(wordCount);
 const labelWordCount=()=>{const block=RichEditor.active()?.block;wordCount.textContent=block?.wordCount?'Hide word count':'Show word count'};
 window.marginWordCountLabel=labelWordCount;document.addEventListener('selectionchange',labelWordCount);labelWordCount();
 const addCode=$('[data-add=code]');if(addCode){addCode.textContent='Code cell';insert.append(addCode)}
 const actions=$('.toolbar-actions'),tools=menu('Tools','note-tools',actions);
 tools.append(makeButton('New from template','new-from-template',chooseNoteLayout));
 for(const id of ['project-connections','capture']){const node=$('#'+id);if(node)tools.append(node)}
 const writeTab=$('#write-tab'),mapTab=$('#map-tab');writeTab.textContent='Note';mapTab.textContent='Mind map';writeTab.title='Write in this note (⌘⇧M switches)';mapTab.title='See this note as a mind map (⌘⇧M switches)';
 for(const tab of [writeTab,mapTab])tab.setAttribute('aria-pressed',String(tab.classList.contains('selected')));
 // Highlight colours sit in the selection bar: pick one to mark the passage, pick it again to take it off.
 for(const color of ['yellow','green','blue','pink']){const dot=document.createElement('button');dot.type='button';dot.onclick=()=>{highlightColor=color;RichEditor.command('highlight',color)};dot.className='hl-dot';dot.dataset.hl=color;dot.title='Highlight '+color;dot.setAttribute('aria-label','Highlight '+color);dot.onmousedown=e=>e.preventDefault();selectionTools.append(dot)}
 const ask=makeButton('Make a question','selection-question',()=>window.marginAskQuestion?.());ask.title='Turn this into a question (⌘⇧K)';ask.onmousedown=e=>e.preventDefault();selectionTools.append(ask);
 const connect=makeButton('Connect passages','selection-connect',()=>$('#connect-passages').click());connect.onmousedown=e=>e.preventDefault();selectionTools.append(connect);
 const question=makeButton('Questions','note-questions',()=>window.marginBrowseNoteQuestions?.());actions.prepend(question);
 const context=makeButton('Context','note-context-toggle',()=>{document.body.classList.toggle('context-open');renderNoteRail();refresh()});context.setAttribute('aria-controls','note-rail');actions.append(context);
 const focus=makeButton('Focus','focus-writing-toggle',()=>{document.body.classList.toggle('focus-writing');refresh()});focus.title='Focus writing · Escape to exit';$('#sidebar-toggle').after(focus);
 function refresh(){const note=current(),show=!!note&&document.body.dataset.view==='note';if(!show)document.body.classList.remove('focus-writing');focus.hidden=!show;focus.textContent=document.body.classList.contains('focus-writing')?'Exit focus':'Focus';focus.setAttribute('aria-pressed',String(document.body.classList.contains('focus-writing')));{const n=window.marginNoteQuestionCount?window.marginNoteQuestionCount(note):note?.questions?.length||0;question.textContent='Questions'+(n?' · '+n:'')}context.hidden=!!note?.pdfPath&&openPDFPath===note.pdfPath;context.setAttribute('aria-expanded',String(document.body.classList.contains('context-open')));document.body.classList.toggle('map-view',mode==='map');for(const tab of [writeTab,mapTab])tab.setAttribute('aria-pressed',String(tab.classList.contains('selected')));selectionTools.hidden=true;closeMenus()}
 window.marginEditorRefresh=refresh;
 // Group the bar: style | inline | blocks | menus.
 for(const before of [$('[data-command="bold"]'),$('[data-command="insertUnorderedList"]'),insert.parentElement.previousElementSibling]){if(!before)continue;const gap=document.createElement('span');gap.className='format-gap';gap.setAttribute('aria-hidden','true');bar.insertBefore(gap,before)}
 // Star lives with the title it belongs to, as a quiet toggle rather than a header button.
 const titleInput=$('#title'),starButton=$('#pin');
 if(titleInput&&starButton){const row=document.createElement('div');row.className='title-row';titleInput.parentElement.insertBefore(row,titleInput);row.append(titleInput,starButton)}
 const originalMode=setMode;setMode=function(next){originalMode(next);refresh()};
 const originalRender=render;render=function(){originalRender();refresh()};
 function selectedPassage(){const s=window.getSelection();return s?.rangeCount&&!s.isCollapsed&&s.toString().trim()&&$('#editor').contains(s.anchorNode)&&$('#editor').contains(s.focusNode)?s:null}
 function positionSelection(){const s=selectedPassage();if(!s||mode!=='write'||document.querySelector('dialog[open]')){selectionTools.hidden=true;return}const r=s.getRangeAt(0).getBoundingClientRect();if(r.bottom<0||r.top>innerHeight){selectionTools.hidden=true;return}selectionTools.hidden=false;const width=selectionTools.offsetWidth,height=selectionTools.offsetHeight;selectionTools.style.left=Math.max(8,Math.min(innerWidth-width-8,r.left+r.width/2-width/2))+'px';selectionTools.style.top=Math.max(8,r.top-height-8<8?Math.min(innerHeight-height-8,r.bottom+8):r.top-height-8)+'px'}
 document.addEventListener('selectionchange',()=>requestAnimationFrame(positionSelection));
 document.addEventListener('scroll',()=>{selectionTools.hidden=true},true);
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.editor-menu'))closeMenus();if(!selectionTools.contains(e.target)&&!$('#editor').contains(e.target))selectionTools.hidden=true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenus();selectionTools.hidden=true;document.body.classList.remove('focus-writing');refresh()}});
 new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['data-view']});
 refresh();
})();
