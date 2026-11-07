// Lines in columns, inside a text cell. Drag the handle beside any line onto the edge of another line:
// the left or right edge sets them side by side, the top or bottom edge puts one above the other.
// A group of columns is <div class="cols"><div class="col">…</div><div class="col">…</div></div>; the blocks inside a
// column are ordinary lines, and reading order is left to right, then down.
const LineColumns=(()=>{
 const MAX=3,EDGE=.22,MOVE_PX=5;
 const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const isGroup=node=>node?.nodeType===1&&node.classList.contains('cols');
 const isCol=node=>node?.nodeType===1&&node.classList.contains('col');
 const hasContent=node=>!!node&&(node.textContent.replace(/[​\s]/g,'')!==''||!!node.querySelector('img,table,.equation,hr,pre'));
 const colsOf=group=>[...group.children].filter(isCol);

 // ── Keeping the structure honest ───────────────────────────────────────────
 // A column that empties out goes away, a group left with one column stops being a group, and stray text that
 // wandered into a group leaves it. Runs on every edit, so typing and deleting can never leave a broken layout.
 function tidy(editor){
  if(!editor)return;
  const selection=getSelection(),anchor=selection?.rangeCount?selection.anchorNode:null;
  let rescue=null;
  for(const inner of [...editor.querySelectorAll('.col .cols')])inner.replaceWith(...colsOf(inner).flatMap(col=>[...col.childNodes]));   // columns don't nest
  for(const group of [...editor.querySelectorAll('.cols')]){
   for(const child of [...group.childNodes]){
    if(isCol(child))continue;
    if(child.nodeType===3&&!child.textContent.trim()){child.remove();continue}
    group.before(child);
   }
   for(const col of colsOf(group)){
    if(hasContent(col))continue;
    if(anchor&&col.contains(anchor))rescue=col.previousElementSibling||col.nextElementSibling;
    col.remove();
   }
   const left=colsOf(group);
   if(!left.length){if(!rescue)rescue=group.previousElementSibling;group.remove()}
   else if(left.length===1){const only=left[0];if(anchor&&only.contains(anchor))rescue=null;group.replaceWith(...only.childNodes)}
   else group.dataset.n=String(Math.min(MAX,left.length));
  }
  // The caret was in a column that just vanished: put it back where the writer was working.
  if(rescue?.isConnected){
   const target=rescue.lastElementChild||rescue,range=document.createRange();range.selectNodeContents(target);range.collapse(false);
   selection.removeAllRanges();selection.addRange(range);
  }
 }

 // ── Moving a line ──────────────────────────────────────────────────────────
 // The thing that moves: a line, or a single list item (which becomes a list of its own).
 function extract(unit){
  if(unit.tagName!=='LI')return unit;
  const list=unit.parentElement,wrap=document.createElement(list.tagName);
  wrap.append(unit);if(!list.children.length)list.remove();
  return wrap;
 }
 // May `moving` go on `side` (left | right | above | below) of `target`?
 function check(moving,target,side){
  if(!moving||!target||moving===target)return {ok:false,reason:'self'};
  if(moving.tagName==='LI'&&moving.parentElement===target&&target.children.length===1)return {ok:false,reason:'self'};
  if((side==='left'||side==='right')&&isCol(target.parentElement)){
   const group=target.parentElement.parentElement,cols=colsOf(group),oldCol=moving.parentElement;
   const freed=isCol(oldCol)&&cols.includes(oldCol)&&oldCol.children.length===1?1:0;   // its old column disappears
   if(cols.length-freed>=MAX)return {ok:false,reason:'full'};
  }
  return {ok:true};
 }
 function move(editor,moving,target,side){
  const verdict=check(moving,target,side);if(!verdict.ok)return verdict;
  const piece=extract(moving);
  if(side==='above')target.before(piece);
  else if(side==='below')target.after(piece);
  else{
   const column=make('div','col');column.append(piece);
   if(isCol(target.parentElement))target.parentElement[side==='left'?'before':'after'](column);
   else{
    const group=make('div','cols'),home=make('div','col');group.dataset.n='2';
    target.replaceWith(group);home.append(target);
    group.append(...(side==='left'?[column,home]:[home,column]));
   }
  }
  tidy(editor);
  if(!editor.lastElementChild||isGroup(editor.lastElementChild))editor.append(Object.assign(make('p'),{innerHTML:'<br>'}));   // always somewhere to click below
  placeCaret(piece.isConnected?piece:target);
  editor.dispatchEvent(new Event('input',{bubbles:true}));
  return {ok:true};
 }
 // The caret goes to the end of the text of the line that just moved.
 function placeCaret(node){
  let target=node;
  while(target.lastElementChild&&!/^(IMG|BR|TABLE|HR)$/.test(target.lastElementChild.tagName)&&!target.lastElementChild.classList.contains('equation'))target=target.lastElementChild;
  const range=document.createRange(),selection=getSelection();
  range.selectNodeContents(target);range.collapse(false);selection.removeAllRanges();selection.addRange(range);
 }
 function unwrap(editor,group){
  for(const col of colsOf(group))group.before(...col.childNodes);
  group.remove();tidy(editor);editor.dispatchEvent(new Event('input',{bubbles:true}));
 }
 function moveOut(editor,unit){
  const group=unit.closest('.cols');if(!group)return;
  group.after(extract(unit));tidy(editor);editor.dispatchEvent(new Event('input',{bubbles:true}));
 }
 // Click alternatives for the handle's menu.
 function menuItems(editor,unit){
  const items=[],group=unit.closest('.cols');
  if(!group){
   let above=unit.previousElementSibling;
   while(above&&!isGroup(above)&&!hasContent(above))above=above.previousElementSibling;   // blank lines are only spacing
   if(above&&unit.tagName!=='LI'){
    const target=isGroup(above)?colsOf(above).at(-1)?.lastElementChild:above;
    if(target)items.push(['Put beside the line above','◫',()=>{if(!move(editor,unit,target,'right').ok)window.toast?.('A row holds up to '+MAX+' columns.')}]);
   }
  }else{
   items.push(['Move out of the columns','▤',()=>moveOut(editor,unit)],['Stack all the columns','☰',()=>unwrap(editor,group)]);
  }
  return items;
 }

 // ── Dragging ───────────────────────────────────────────────────────────────
 // The line under the pointer, as something that can be dropped on.
 function lineAt(editor,x,y,moving){
  // Look through anything laid over the text (the cell's hover toolbar sits right where the first line's edge is).
  let node=document.elementsFromPoint(x,y).find(item=>editor.contains(item));
  if(!node)return null;
  while(node&&node!==editor&&node.parentElement!==editor&&!isCol(node.parentElement))node=node.parentElement;
  if(!node||node===editor)return null;
  if(isGroup(node)||isCol(node)){
   // between columns or in a column's margin: take the nearest line
   const lines=[...node.querySelectorAll(isGroup(node)?':scope>.col>*':':scope>*')];
   node=lines.sort((a,b)=>distance(a,x,y)-distance(b,x,y))[0]||null;
  }
  return node;
 }
 function distance(node,x,y){const r=node.getBoundingClientRect(),dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom);return dx*dx+dy*dy*4}
 function zoneOf(node,x,y){
  const r=node.getBoundingClientRect(),fx=(x-r.left)/Math.max(1,r.width),fy=(y-r.top)/Math.max(1,r.height);
  return fx<EDGE?'left':fx>1-EDGE?'right':fy<.5?'above':'below';
 }
 function barFor(node,side){
  const r=node.getBoundingClientRect();
  if(side==='left')return {left:r.left-8,top:r.top,width:4,height:r.height};
  if(side==='right')return {left:r.right+4,top:r.top,width:4,height:r.height};
  return {left:r.left,top:side==='above'?r.top-4:r.bottom,width:r.width,height:4};
 }
 function scrollParent(node){
  for(let p=node.parentElement;p;p=p.parentElement){if(/(auto|scroll)/.test(getComputedStyle(p).overflowY)&&p.scrollHeight>p.clientHeight)return p}
  return document.scrollingElement;
 }
 let drag=null;
 function startDrag(editor,unit,event){
  const label=unit.textContent.replace(/\s+/g,' ').trim();
  drag={editor,unit,x:event.clientX,y:event.clientY,plan:null,refused:false,scroller:scrollParent(editor),raf:0};
  drag.ghost=make('div','line-ghost',label?(label.length>46?label.slice(0,46)+'…':label):'Line');
  drag.mark=make('div','line-drop');drag.mark.hidden=true;
  document.body.append(drag.ghost,drag.mark);document.body.classList.add('line-dragging');unit.classList.add('line-moving');
  window.marginBlockHandle?.hide();
  frame();
 }
 function frame(){
  if(!drag)return;
  const {x,y,editor,unit}=drag;
  Object.assign(drag.ghost.style,{left:x+14+'px',top:y+14+'px'});
  const view=drag.scroller===document.scrollingElement?{top:0,bottom:innerHeight}:drag.scroller.getBoundingClientRect();
  if(y<view.top+60)drag.scroller.scrollTop-=Math.ceil((view.top+60-y)/4);else if(y>view.bottom-60)drag.scroller.scrollTop+=Math.ceil((y-view.bottom+60)/4);
  drag.plan=null;drag.refused=false;
  const target=lineAt(editor,x,y,unit);
  if(target&&target!==unit){
   const side=zoneOf(target,x,y),verdict=check(unit,target,side);
   Object.assign(drag.mark.style,Object.fromEntries(Object.entries(barFor(target,side)).map(([key,value])=>[key,value+'px'])));
   drag.mark.hidden=false;drag.mark.classList.toggle('is-refused',!verdict.ok);
   drag.mark.dataset.note=verdict.ok?'':'A row holds up to '+MAX+' columns';
   if(verdict.ok)drag.plan={target,side};else drag.refused=true;
  }else drag.mark.hidden=true;
  drag.raf=requestAnimationFrame(frame);
 }
 function endDrag(commit){
  if(!drag)return;
  const {editor,unit,plan,refused}=drag;
  cancelAnimationFrame(drag.raf);drag.ghost.remove();drag.mark.remove();unit.classList.remove('line-moving');document.body.classList.remove('line-dragging');
  drag=null;
  if(commit&&plan)move(editor,unit,plan.target,plan.side);
  else if(commit&&refused)window.toast?.('A row holds up to '+MAX+' columns.');
 }
 document.addEventListener('pointerdown',event=>{
  const api=window.marginBlockHandle;
  if(!api||event.button!==0||!api.handle.contains(event.target)||api.menuOpen())return;
  const unit=api.unit(),editor=api.editor();if(!unit||!editor)return;
  const from={x:event.clientX,y:event.clientY};let started=false;
  const move=e=>{
   if(!started&&Math.hypot(e.clientX-from.x,e.clientY-from.y)<MOVE_PX)return;
   if(!started){started=true;startDrag(editor,unit,e)}
   drag.x=e.clientX;drag.y=e.clientY;
  };
  const off=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',key,true)};
  const up=()=>{off();if(started){const swallow=e=>{e.stopPropagation();e.preventDefault()};window.addEventListener('click',swallow,true);setTimeout(()=>window.removeEventListener('click',swallow,true),60)}endDrag(started)};
  const cancel=()=>{off();endDrag(false)};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();off();endDrag(false)}};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',key,true);
 },true);

 // ── Backspace and Delete stop at the edge of a column ──────────────────────
 // Otherwise deleting at the start of one column would pull its text into the neighbouring column.
 document.addEventListener('keydown',event=>{
  if((event.key!=='Backspace'&&event.key!=='Delete')||event.metaKey||event.ctrlKey||event.altKey)return;
  const selection=getSelection();if(!selection?.rangeCount||!selection.isCollapsed)return;
  const node=selection.anchorNode,column=(node?.nodeType===1?node:node?.parentElement)?.closest?.('.col');if(!column)return;
  let line=node.nodeType===1?node:node.parentElement;while(line&&line.parentElement!==column)line=line.parentElement;
  if(!line||!/^(P|DIV|H[1-6])$/.test(line.tagName))return;       // lists and quotes keep their own Backspace behaviour
  const probe=document.createRange();probe.selectNodeContents(column);
  if(event.key==='Backspace'){if(line!==column.firstElementChild)return;probe.setEnd(selection.anchorNode,selection.anchorOffset)}
  else{if(line!==column.lastElementChild)return;probe.setStart(selection.anchorNode,selection.anchorOffset)}
  if(probe.toString().replace(/[​]/g,'')!==''||probe.cloneContents().querySelector('img,.equation'))return;
  event.preventDefault();
  // an empty column simply goes away
  if(!hasContent(column)){const editor=column.closest('.rich-text');tidy(editor);editor?.dispatchEvent(new Event('input',{bubbles:true}))}
 },true);

 return {tidy,move,check,unwrap,moveOut,menuItems,MAX};
})();
window.LineColumns=LineColumns;
