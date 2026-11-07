// Lines in columns, inside a text cell. Drag the handle beside any line onto the edge of another line:
// the left or right edge sets them side by side, the top or bottom edge puts one above the other.
// A group of columns is <div class="cols"><div class="col">…</div><div class="col">…</div></div>; the blocks inside a
// column are ordinary lines, and reading order is left to right, then down.
//
// Hierarchy: bullets that come right after a line belong to it. The line is their header, and the two always move
// together; nothing can be dropped between a header and its bullets. A blank line ends the belonging.
const LineColumns=(()=>{
 const MAX=3,EDGE=.22,MOVE_PX=5;
 const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const isGroup=node=>node?.nodeType===1&&node.classList.contains('cols');
 const isCol=node=>node?.nodeType===1&&node.classList.contains('col');
 const isList=node=>node?.nodeType===1&&(node.tagName==='UL'||node.tagName==='OL');
 const hasContent=node=>!!node&&(node.textContent.replace(/[​\s]/g,'')!==''||!!node.querySelector('img,table,.equation,hr,pre'));
 const colsOf=group=>[...group.children].filter(isCol);

 // ── What belongs to what ───────────────────────────────────────────────────
 // A line can head bullets; an empty line, an equation, a list or a column group cannot.
 const canHead=node=>node?.nodeType===1&&/^(P|H[1-6]|BLOCKQUOTE|DIV)$/.test(node.tagName)&&!isGroup(node)&&!isCol(node)&&!node.classList.contains('equation')&&!node.classList.contains('task-row')&&hasContent(node);
 // The lists straight after a line.
 function followers(line){
  const out=[];if(!canHead(line))return out;
  for(let next=line.nextElementSibling;isList(next);next=next.nextElementSibling)out.push(next);
  return out;
 }
 // A line with its bullets: the unit that moves.
 const sectionOf=line=>[line,...followers(line)];
 // Whatever you point at, the thing it belongs to: bullets answer to the line above them.
 function ownerOf(node){
  if(!isList(node))return node;
  let above=node.previousElementSibling;while(isList(above))above=above.previousElementSibling;
  return canHead(above)?above:node;
 }
 const bulletCount=lists=>lists.reduce((total,list)=>total+list.querySelectorAll('li').length,0);

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
 // What travels: a line with its bullets, or a single list item (which becomes a list of its own).
 function extract(unit){
  if(unit.tagName!=='LI')return sectionOf(unit);
  const list=unit.parentElement,wrap=document.createElement(list.tagName);
  wrap.append(unit);if(!list.children.length)list.remove();
  return [wrap];
 }
 // May `moving` go on `side` (left | right | above | below) of `target`?
 function check(moving,target,side){
  if(!moving||!target||moving===target)return {ok:false,reason:'self'};
  if(moving.tagName==='LI'&&moving.parentElement===target&&target.children.length===1)return {ok:false,reason:'self'};
  if(sectionOf(moving).includes(target))return {ok:false,reason:'self'};
  if((side==='left'||side==='right')&&isCol(target.parentElement)){
   const group=target.parentElement.parentElement,cols=colsOf(group),oldCol=moving.parentElement;
   const freed=isCol(oldCol)&&cols.includes(oldCol)&&oldCol.children.length===sectionOf(moving).length?1:0;   // its old column disappears
   if(cols.length-freed>=MAX)return {ok:false,reason:'full'};
  }
  return {ok:true};
 }
 function move(editor,moving,rawTarget,side){
  const target=ownerOf(rawTarget);
  const verdict=check(moving,target,side);if(!verdict.ok)return verdict;
  const targetSection=sectionOf(target),tail=targetSection.at(-1);   // measured before anything moves
  const pieces=extract(moving);
  if(side==='above')target.before(...pieces);
  else if(side==='below')tail.after(...pieces);       // after the target's bullets, never between them
  else{
   const column=make('div','col');column.append(...pieces);
   if(isCol(target.parentElement))target.parentElement[side==='left'?'before':'after'](column);
   else{
    const group=make('div','cols'),home=make('div','col');group.dataset.n='2';
    target.replaceWith(group);home.append(...targetSection);       // the target keeps its bullets
    group.append(...(side==='left'?[column,home]:[home,column]));
   }
  }
  tidy(editor);
  if(!editor.lastElementChild||isGroup(editor.lastElementChild))editor.append(Object.assign(make('p'),{innerHTML:'<br>'}));   // always somewhere to click below
  placeCaret(pieces[0].isConnected?pieces[0]:target);
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
  group.after(...extract(unit));tidy(editor);editor.dispatchEvent(new Event('input',{bubbles:true}));
 }
 // Click alternatives for the handle's menu.
 function menuItems(editor,unit){
  const items=[],group=unit.closest('.cols');
  if(!group){
   let above=unit.previousElementSibling;
   while(above&&!isGroup(above)&&!hasContent(above))above=above.previousElementSibling;   // blank lines are only spacing
   if(above&&unit.tagName!=='LI'){
    const target=isGroup(above)?colsOf(above).at(-1)?.lastElementChild:ownerOf(above);   // a list above answers to its header
    if(target)items.push(['Put beside the line above','◫',()=>{if(!move(editor,unit,target,'right').ok)window.toast?.('A row holds up to '+MAX+' columns.')}]);
   }
  }else{
   items.push(['Move out of the columns','▤',()=>moveOut(editor,unit)],['Stack all the columns','☰',()=>unwrap(editor,group)]);
  }
  return items;
 }

 // ── Dragging ───────────────────────────────────────────────────────────────
 // The line under the pointer, as something that can be dropped on (bullets stand for their header).
 function lineAt(editor,x,y){
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
  return node?ownerOf(node):null;
 }
 function distance(node,x,y){const r=node.getBoundingClientRect(),dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom);return dx*dx+dy*dy*4}
 // The space a line and its bullets take up together.
 function boxOf(line){
  const rects=sectionOf(line).map(node=>node.getBoundingClientRect());
  return {left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right)),top:rects[0].top,bottom:rects.at(-1).bottom};
 }
 function zoneOf(line,x,y){
  const b=boxOf(line),fx=(x-b.left)/Math.max(1,b.right-b.left),fy=(y-b.top)/Math.max(1,b.bottom-b.top);
  return fx<EDGE?'left':fx>1-EDGE?'right':fy<.5?'above':'below';
 }
 function barFor(line,side){
  const b=boxOf(line);
  if(side==='left')return {left:b.left-8,top:b.top,width:4,height:b.bottom-b.top};
  if(side==='right')return {left:b.right+4,top:b.top,width:4,height:b.bottom-b.top};
  return {left:b.left,top:side==='above'?b.top-4:b.bottom,width:b.right-b.left,height:4};
 }
 function scrollParent(node){
  for(let p=node.parentElement;p;p=p.parentElement){if(/(auto|scroll)/.test(getComputedStyle(p).overflowY)&&p.scrollHeight>p.clientHeight)return p}
  return document.scrollingElement;
 }
 let drag=null;
 function startDrag(editor,unit,event){
  const label=unit.textContent.replace(/\s+/g,' ').trim(),pieces=unit.tagName==='LI'?[unit]:sectionOf(unit),bullets=bulletCount(pieces.slice(1));
  drag={editor,unit,pieces,x:event.clientX,y:event.clientY,plan:null,refused:false,scroller:scrollParent(editor),raf:0};
  const shown=label?(label.length>40?label.slice(0,40)+'…':label):'Line';
  drag.ghost=make('div','line-ghost',shown+(bullets?'  ·  +'+bullets+(bullets===1?' bullet':' bullets'):''));
  drag.mark=make('div','line-drop');drag.mark.hidden=true;
  document.body.append(drag.ghost,drag.mark);document.body.classList.add('line-dragging');pieces.forEach(node=>node.classList.add('line-moving'));
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
  const target=lineAt(editor,x,y);
  if(target&&target!==unit&&!sectionOf(unit).includes(target)){
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
  const {editor,unit,pieces,plan,refused}=drag;
  cancelAnimationFrame(drag.raf);drag.ghost.remove();drag.mark.remove();pieces.forEach(node=>node.classList.remove('line-moving'));document.body.classList.remove('line-dragging');
  drag=null;
  if(commit&&plan)move(editor,unit,plan.target,plan.side);
  else if(commit&&refused)window.toast?.('A row holds up to '+MAX+' columns.');
 }
 document.addEventListener('pointerdown',event=>{
  const api=window.marginBlockHandle;
  if(!api||event.button!==0||!api.handle.contains(event.target)||api.menuOpen())return;
  const unit=api.unit(),editor=api.editor();if(!unit||!editor)return;
  const from={x:event.clientX,y:event.clientY};let started=false;
  const step=e=>{
   if(!started&&Math.hypot(e.clientX-from.x,e.clientY-from.y)<MOVE_PX)return;
   if(!started){started=true;startDrag(editor,unit,e)}
   drag.x=e.clientX;drag.y=e.clientY;
  };
  const off=()=>{document.removeEventListener('pointermove',step);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',key,true)};
  const up=()=>{off();if(started){const swallow=e=>{e.stopPropagation();e.preventDefault()};window.addEventListener('click',swallow,true);setTimeout(()=>window.removeEventListener('click',swallow,true),60)}endDrag(started)};
  const cancel=()=>{off();endDrag(false)};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();off();endDrag(false)}};
  document.addEventListener('pointermove',step);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',key,true);
 },true);

 // Pointing at the handle of a line shows what will travel with it.
 const watchHandle=()=>{
  const handle=window.marginBlockHandle?.handle;if(!handle)return;
  const clear=()=>document.querySelectorAll('.line-with').forEach(node=>node.classList.remove('line-with'));
  handle.addEventListener('pointerenter',()=>{
   clear();const unit=window.marginBlockHandle.unit();if(!unit||unit.tagName==='LI')return;
   const lists=followers(unit);if(lists.length)[unit,...lists].forEach(node=>node.classList.add('line-with'));
  });
  handle.addEventListener('pointerleave',clear);handle.addEventListener('pointerdown',clear);
 };
 watchHandle();

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

 return {tidy,move,check,unwrap,moveOut,menuItems,followers,sectionOf,ownerOf,MAX};
})();
window.LineColumns=LineColumns;
