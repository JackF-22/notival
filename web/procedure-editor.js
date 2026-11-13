// The Procedure box in a note: drawn from its steps, and edited in place with the typeset result updating as you type.
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

 // ── Editing in place ───────────────────────────────────────────────────────
 // Like an equation, the box becomes its own editor where it sits: the steps at the top, the typeset result
 // underneath, redrawn as you type. Clicking away or ⌘↵ keeps the change; Esc puts it back.
 let editing=null;   // {box, finish}
 const TIPS=[['Algorithm: Name','a title (or Procedure: / Function:)'],['Input: … / Output: …','bold labels above the steps; a blank line starts the steps'],['indent','nests a step inside the one above it (Tab / Shift-Tab)'],['<-   ->   !=   <=   >=','become ←  →  ≠  ≤  ≥'],['x_i   x^2   p_{LM}   \\Sigma   \\in','maths, no dollar signs needed'],['$…$','for anything longer, like $\\sum_{i=1}^n x_i$'],['// note','a comment, set apart in small type'],['paste \\State … \\EndIf','a LaTeX algorithm is converted for you']];
 function open(box,{isNew=false}={}){
  if(editing&&!editing.box.isConnected)editing=null;      // the note was redrawn underneath it
  if(editing?.box===box)return;
  editing?.finish(true);
  const editor=editorOf(box);if(!editor)return;
  const before={source:box.dataset.procedure||'',numbered:box.dataset.numbered==='1'};
  box.classList.add('editing');box.removeAttribute('title');box.tabIndex=-1;box.setAttribute('aria-label','Editing a procedure');
  box.replaceChildren();
  const field=make('textarea','proc-source');field.value=before.source;field.spellcheck=false;field.setAttribute('aria-label','Procedure steps');
  field.placeholder='Write each step on its own line. Indent a step to put it inside the one above.\nOptional, at the top: Algorithm: Name / Input: … / Output: …';
  const note=make('div','proc-note');note.setAttribute('aria-live','polite');
  const preview=make('div','proc-preview');preview.setAttribute('aria-live','polite');
  const bar=make('div','proc-bar');
  const options=make('label','proc-option'),numbered=make('input');numbered.type='checkbox';numbered.checked=before.numbered;options.append(numbered,' Number the lines');
  const help=make('details','proc-help');help.append(make('summary','','How to write one'));
  const tips=make('ul');for(const [code,what] of TIPS){const item=make('li');item.append(make('code','',code),' '+what);tips.append(item)}help.append(tips);
  const button=(label,cls,run)=>{const b=make('button',cls,label);b.type='button';b.onmousedown=event=>event.preventDefault();b.onclick=run;return b};
  bar.append(options,make('span','proc-keys','⌘↵ done · esc cancel'),make('span','proc-spacer'));
  if(!isNew&&before.source)bar.append(button('Delete','danger',()=>{editing=null;stop.abort();box.remove();commit(editor);editor.focus({preventScroll:true})}));
  bar.append(button('Cancel','',()=>finish(false)),button('Done','primary',()=>finish(true)));
  box.append(field,note,preview,bar,help);

  const grow=()=>{field.style.height='auto';field.style.height=Math.max(field.scrollHeight,60)+'px'};
  const paint=()=>{preview.innerHTML=M.html(field.value,{number:numberOf(box),numbered:numbered.checked,katex:window.katex||null});grow()};
  // Typing in the box is the box's own business: the note around it shouldn't react to these keys and edits.
  for(const type of ['keydown','keypress','keyup','beforeinput','input','paste','cut','copy'])field.addEventListener(type,event=>event.stopPropagation());
  field.addEventListener('input',paint);numbered.onchange=paint;
  // Tab nests, Shift-Tab un-nests, Enter keeps (and deepens) the indent, ⌘↵ finishes, Esc cancels
  field.addEventListener('keydown',event=>{
   const {selectionStart:start,selectionEnd:end,value}=field;
   if(event.key==='Escape'){event.preventDefault();finish(false);return}
   if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();finish(true);return}
   if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){
    event.preventDefault();
    const lineStart=value.lastIndexOf('\n',start-1)+1,indent=M.nextIndent(value.slice(lineStart,start));
    field.setRangeText('\n'+indent,start,end,'end');paint();return;
   }
   if(event.key==='Tab'){
    event.preventDefault();
    const first=value.lastIndexOf('\n',start-1)+1,last=end>start&&value[end-1]==='\n'?end-1:end;
    const lines=value.slice(first,Math.max(last,first)).split('\n');
    const changed=lines.map(line=>event.shiftKey?line.replace(/^( {1,2}|\t)/,''):'  '+line).join('\n');
    if(start===end&&!event.shiftKey)field.setRangeText('  ',start,end,'end');
    else{field.setRangeText(changed,first,Math.max(last,first),'select');field.setSelectionRange(first,first+changed.length)}
    paint();
   }
  });
  // Pasting a paper's LaTeX algorithm (\State, \If{…}, \EndIf …) turns it into steps, and ⌘Z undoes it.
  field.addEventListener('paste',event=>{
   const pasted=event.clipboardData?.getData('text/plain')||'';
   if(!M.looksLikeLatex(pasted))return;
   const converted=M.fromLatex(pasted);if(!converted.trim())return;
   event.preventDefault();
   if(!document.execCommand('insertText',false,converted))field.setRangeText(converted,field.selectionStart,field.selectionEnd,'end');
   paint();note.textContent='Converted from a LaTeX algorithm. ⌘Z undoes it.';
  });
  // Clicking anywhere outside the box keeps what was written.
  // Each editing session listens only while it lasts, so reopening a box never wakes an old session.
  const session={},stop=new AbortController();
  box.addEventListener('focusout',event=>{
   if(box.contains(event.relatedTarget))return;
   if(event.relatedTarget){finish(true,{refocus:false});return}      // focus went somewhere definite: keep it now
   setTimeout(()=>{if(editing?.session===session&&!box.contains(document.activeElement))finish(true,{refocus:false})},0);
  },{signal:stop.signal});
  function finish(save,{refocus=true}={}){
   if(editing?.session!==session)return;
   editing=null;stop.abort();
   if(save){
    const steps=field.value.replace(/\s+$/,'');
    if(!steps.trim())box.remove();
    else{box.dataset.procedure=steps;if(numbered.checked)box.dataset.numbered='1';else delete box.dataset.numbered}
   }else if(isNew)box.remove();
   box.classList.remove('editing');delete box.dataset.drawn;
   commit(editor);
   if(!refocus)return;
   if(box.isConnected)box.focus({preventScroll:true});else editor.focus({preventScroll:true});
  }
  editing={box,session,finish:save=>finish(save,{refocus:false})};
  paint();field.focus({preventScroll:true});field.setSelectionRange(field.value.length,field.value.length);
  box.scrollIntoView({block:'nearest'});
 }

 // ── Working with a box in the page ─────────────────────────────────────────
 document.addEventListener('dblclick',event=>{const box=event.target.closest?.('#editor .procedure');if(box){event.preventDefault();open(box)}});
 document.addEventListener('keydown',event=>{
  const box=event.target.closest?.('#editor .procedure');if(!box||event.target!==box||box.classList.contains('editing'))return;
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
