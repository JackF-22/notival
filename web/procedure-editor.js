// The Procedure box in a note: drawn from its steps, and edited in a small window with a live preview.
// Reading and drawing live in procedure-model.js; this is the part that touches the page.
const ProcedureBox=(()=>{
 const M=ProcedureModel;
 const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const boxes=()=>[...document.querySelectorAll('#editor .procedure')];
 const numberOf=box=>boxes().indexOf(box)+1||1;
 const editorOf=box=>box.closest('.rich-text');

 // ── Drawing ────────────────────────────────────────────────────────────────
 // Every box in the note is drawn, because numbering ("Algorithm 2") depends on the ones before it.
 function render(root){
  // A cell is built off the page and attached afterwards, so draw what was handed over too, then once more when it is in place.
  const pending=new Set([...boxes(),...(root?root.querySelectorAll('.procedure'):[])]);
  if(root&&!root.isConnected)requestAnimationFrame(()=>render());
  for(const box of pending){
   if(box.classList.contains('editing'))continue;
   const source=box.dataset.procedure||'',number=numberOf(box),numbered=box.dataset.numbered==='1';
   const key=number+'|'+(numbered?1:0)+'|'+source;
   if(box.dataset.drawn===key&&box.firstChild)continue;                         // nothing changed
   box.dataset.drawn=key;
   box.contentEditable='false';box.tabIndex=0;box.setAttribute('role','group');
   box.setAttribute('aria-label',M.label(source,number)+'. Press Enter to edit.');box.title='Double-click to edit';
   box.innerHTML=M.html(source,{number,numbered,katex:window.katex||null});
   const edit=make('button','proc-edit','Edit');edit.type='button';edit.setAttribute('aria-label','Edit this procedure');edit.tabIndex=-1;
   edit.onclick=event=>{event.preventDefault();event.stopPropagation();open(box)};
   box.append(edit);
  }
 }
 const commit=editor=>{render();editor?.dispatchEvent(new Event('input',{bubbles:true}))};

 // ── Putting one in a note ──────────────────────────────────────────────────
 function insert(editor){
  const selection=getSelection(),range=selection.rangeCount&&editor.contains(selection.anchorNode)?selection.getRangeAt(0):null;
  const box=make('div','procedure');box.dataset.procedure='';
  const origin=range&&(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement);
  let anchor=origin;
  while(anchor&&anchor.parentElement!==editor&&!anchor.parentElement?.classList?.contains('col'))anchor=anchor.parentElement;
  if(!anchor||anchor===editor)editor.append(box);
  else if(anchor.tagName==='P'&&!anchor.textContent.trim()&&!anchor.querySelector('img,.equation'))anchor.replaceWith(box);   // an empty line becomes the box
  else anchor.after(box);
  render();open(box,{isNew:true});
 }

 // ── The editor window ──────────────────────────────────────────────────────
 function open(box,{isNew=false}={}){
  const editor=editorOf(box);if(!editor)return;
  const before={source:box.dataset.procedure||'',numbered:box.dataset.numbered==='1'};
  document.querySelector('dialog.procedure-dialog')?.remove();
  const dlg=make('dialog','procedure-dialog');dlg.setAttribute('aria-label','Write a procedure');
  const head=make('div','proc-dialog-head');head.append(make('h2','',isNew?'New procedure':'Edit procedure'));
  const field=make('textarea','proc-source');field.value=before.source||(isNew?M.starter:'');field.spellcheck=false;field.setAttribute('aria-label','Procedure steps');field.placeholder='Algorithm: Name\nInput: …\nOutput: …\n\nsteps, indented to nest';
  const preview=make('div','procedure proc-preview');preview.setAttribute('aria-live','polite');
  const options=make('label','proc-option'),numbered=make('input');numbered.type='checkbox';numbered.checked=before.numbered;options.append(numbered,' Number the lines');
  const help=make('details','proc-help'),summary=make('summary','','How to write one');
  const tips=make('ul');
  for(const [code,what] of [['Algorithm: Name','a title (or Procedure: / Function:)'],['Input: … / Output: …','bold labels above the steps; a blank line starts the steps'],['indent','nests a step inside the one above it'],['<-   ->   !=   <=   >=','become ←  →  ≠  ≤  ≥'],['// note','a comment, set apart in small type'],['$x_i^2$','typeset maths'],['\\leftarrow  \\in  \\Sigma','LaTeX commands are typeset on their own, no dollar signs needed'],['paste \\State … \\EndIf','a LaTeX algorithm is converted for you'],['while  if  then  do  return','keywords are made bold for you']]){
   const item=make('li');item.append(make('code','',code),' '+what);tips.append(item);
  }
  help.append(summary,tips);
  const body=make('div','proc-dialog-body'),left=make('div','proc-pane'),right=make('div','proc-pane');
  const note=make('div','proc-note');note.setAttribute('aria-live','polite');
  left.append(make('small','','Steps'),field,note);right.append(make('small','','Preview'),preview);body.append(left,right);
  const actions=make('div','proc-actions');
  const done=make('button','primary','Done'),cancel=make('button','','Cancel');done.type=cancel.type='button';
  actions.append(options,make('span','proc-spacer'),...(!isNew&&before.source?[(()=>{const b=make('button','danger','Delete');b.type='button';b.onclick=()=>{box.remove();dlg.close();commit(editor)};return b})()]:[]),cancel,done);
  dlg.append(head,body,help,actions);document.body.append(dlg);

  const paint=()=>{preview.innerHTML=M.html(field.value,{number:numberOf(box),numbered:numbered.checked,katex:window.katex||null})};
  field.oninput=paint;numbered.onchange=paint;paint();
  // Typing steps: Tab nests, Shift-Tab un-nests, Enter keeps (and deepens) the indent, ⌘↵ finishes
  field.onkeydown=event=>{
   const {selectionStart:start,selectionEnd:end,value}=field;
   if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();done.click();return}
   if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){
    event.preventDefault();
    const lineStart=value.lastIndexOf('\n',start-1)+1,indent=M.nextIndent(value.slice(lineStart,start));
    field.setRangeText('\n'+indent,start,end,'end');paint();return;
   }
   if(event.key==='Tab'){
    event.preventDefault();
    const first=value.lastIndexOf('\n',start-1)+1,last=end>start&&value[end-1]==='\n'?end-1:end;
    const chunk=value.slice(first,Math.max(last,first)),lines=chunk.split('\n');
    const changed=lines.map(line=>event.shiftKey?line.replace(/^( {1,2}|\t)/,''):'  '+line).join('\n');
    if(start===end&&!event.shiftKey){field.setRangeText('  ',start,end,'end')}
    else{field.setRangeText(changed,first,Math.max(last,first),'select');field.setSelectionRange(first,first+changed.length)}
    paint();
   }
  };
  // Pasting a paper's LaTeX algorithm (\State, \If{…}, \EndIf …) turns it into steps, and can be undone with ⌘Z.
  field.addEventListener('paste',event=>{
   const pasted=event.clipboardData?.getData('text/plain')||'';
   if(!M.looksLikeLatex(pasted))return;
   const converted=M.fromLatex(pasted);if(!converted.trim())return;
   event.preventDefault();
   if(field.value===M.starter)field.select();             // an untouched starting example is replaced, not added to
   if(!document.execCommand('insertText',false,converted)){field.setRangeText(converted,field.selectionStart,field.selectionEnd,'end');}
   paint();note.textContent='Converted from a LaTeX algorithm. ⌘Z undoes it.';
  });
  const finish=save=>{
   if(save){
    const steps=field.value.replace(/\s+$/,'');
    if(!steps.trim())box.remove();
    else{box.dataset.procedure=steps;if(numbered.checked)box.dataset.numbered='1';else delete box.dataset.numbered}
   }else if(isNew)box.remove();
   delete box.dataset.drawn;
   commit(editor);
   dlg.close();
   if(box.isConnected)box.focus({preventScroll:true});else editor.focus({preventScroll:true});
  };
  done.onclick=()=>finish(true);cancel.onclick=()=>finish(false);
  dlg.addEventListener('cancel',event=>{event.preventDefault();finish(false)});   // Escape
  dlg.addEventListener('close',()=>dlg.remove());
  dlg.showModal();field.focus();field.setSelectionRange(0,0);
 }

 // ── Working with a box in the page ─────────────────────────────────────────
 document.addEventListener('dblclick',event=>{const box=event.target.closest?.('#editor .procedure');if(box){event.preventDefault();open(box)}});
 document.addEventListener('keydown',event=>{
  const box=event.target.closest?.('#editor .procedure');if(!box||event.target!==box)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();open(box);return}
  if((event.key==='Backspace'||event.key==='Delete')&&!event.metaKey&&!event.ctrlKey){
   event.preventDefault();
   const editor=editorOf(box),next=box.nextElementSibling||box.previousElementSibling;
   box.remove();commit(editor);
   const target=next?.isConnected&&next.isContentEditable?next:editor,range=document.createRange();
   range.selectNodeContents(target);range.collapse(target===editor?false:true);editor.focus({preventScroll:true});
   const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  }
 });
 // A box can be added from the Insert menu as well as the slash menu.
 const panel=document.querySelector('#editor-insert-panel');
 if(panel){
  const item=make('button','','Procedure');item.type='button';item.id='insert-procedure';item.title='Pseudocode or steps, typeset like a paper';
  item.onmousedown=event=>event.preventDefault();item.onclick=()=>RichEditor.command('procedure');panel.append(item);
 }
 return {render,insert,open};
})();
window.ProcedureBox=ProcedureBox;
ProcedureBox.render();   // a note that was already open when this loaded
