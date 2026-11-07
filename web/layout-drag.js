// Drag a cell by its grip to rearrange the note. Hovering an edge of another cell shows where it will land:
// the left or right edge makes columns, the top or bottom edge puts it above or below. The grip also takes arrow keys.
const LayoutDrag=(()=>{
 const EDGE=.24,STEP=6,MOVE_PX=5;
 let drag=null;
 const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e};
 const blockLabel=block=>{const t=String(block.text||'').replace(/\s+/g,' ').trim();return t?(t.length>44?t.slice(0,44)+'…':t):(block.type==='code'?'Code cell':'Empty cell')};

 // Which edge of which cell is the pointer on? Returns {target, side} or null.
 function aim(x,y,editor){
  const hit=document.elementFromPoint(x,y)?.closest?.('#editor .block');
  const blocks=[...editor.querySelectorAll('.block')];
  if(!hit){
   // Past the end of the note drops at the bottom, above the start at the top.
   const box=editor.getBoundingClientRect(),first=blocks[0],last=blocks.at(-1);
   if(!first||x<box.left-60||x>box.right+60)return null;
   if(y<first.getBoundingClientRect().top)return {wrap:first,side:'above'};
   if(y>last.getBoundingClientRect().bottom)return {wrap:last,side:'below'};
   return null;
  }
  const r=hit.getBoundingClientRect(),fx=(x-r.left)/r.width,fy=(y-r.top)/r.height;
  return {wrap:hit,side:fx<EDGE?'left':fx>1-EDGE?'right':fy<.5?'above':'below'};
 }
 // The rectangle to light up: beside a cell it is that cell; above/below a row it is the whole row.
 function indicatorBox(wrap,side){
  const r=(side==='above'||side==='below')?(wrap.closest('.block-row')||wrap).getBoundingClientRect():wrap.getBoundingClientRect();
  if(side==='left')return {left:r.left-8,top:r.top,width:4,height:r.height};
  if(side==='right')return {left:r.right+4,top:r.top,width:4,height:r.height};
  return {left:r.left,top:side==='above'?r.top-6:r.bottom+2,width:r.width,height:4};
 }
 function scrollParent(node){
  for(let p=node.parentElement;p;p=p.parentElement){const o=getComputedStyle(p).overflowY;if(/(auto|scroll)/.test(o)&&p.scrollHeight>p.clientHeight)return p}
  return document.scrollingElement;
 }

 function begin(event,note,block,source){
  const editor=document.querySelector('#editor');
  drag={note,block,source,editor,ghost:null,mark:null,plan:null,scroller:scrollParent(editor),raf:0,x:event.clientX,y:event.clientY};
  drag.ghost=el('div','layout-ghost',blockLabel(block));drag.mark=el('div','layout-drop');drag.mark.hidden=true;
  document.body.append(drag.ghost,drag.mark);document.body.classList.add('cell-dragging');source.classList.add('is-dragging');
  track();
 }
 function track(){
  if(!drag)return;
  const {x,y}=drag;
  Object.assign(drag.ghost.style,{left:x+14+'px',top:y+14+'px'});
  // Edge of the window: keep scrolling so a long note can be rearranged
  const view=drag.scroller===document.scrollingElement?{top:0,bottom:innerHeight}:drag.scroller.getBoundingClientRect();
  if(y<view.top+60)drag.scroller.scrollTop-=Math.ceil((view.top+60-y)/4);else if(y>view.bottom-60)drag.scroller.scrollTop+=Math.ceil((y-view.bottom+60)/4);
  const spot=aim(x,y,drag.editor);drag.plan=null;drag.refused=false;
  if(spot&&spot.wrap!==drag.source){
   const targetId=cellId(spot.wrap),verdict=LayoutModel.check(drag.note.blocks,drag.block.id,targetId,spot.side);
   Object.assign(drag.mark.style,Object.fromEntries(Object.entries(indicatorBox(spot.wrap,spot.side)).map(([k,v])=>[k,v+'px'])));
   drag.mark.hidden=false;drag.mark.classList.toggle('is-refused',!verdict.ok);
   drag.mark.dataset.note=verdict.ok?'':'A row holds up to '+LayoutModel.MAX_COLUMNS+' cells';
   if(verdict.ok)drag.plan={targetId,side:spot.side};else drag.refused=true;
  }else drag.mark.hidden=true;
  drag.raf=requestAnimationFrame(track);
 }
 const cellId=wrap=>drag.note.blocks[[...drag.editor.querySelectorAll('.block')].indexOf(wrap)]?.id;
 function finish(commit){
  if(!drag)return;
  const {note,block,plan,refused}=drag;
  cancelAnimationFrame(drag.raf);drag.ghost.remove();drag.mark.remove();drag.source.classList.remove('is-dragging');document.body.classList.remove('cell-dragging');
  drag=null;
  if(commit&&plan){LayoutModel.move(note.blocks,block.id,plan.targetId,plan.side,uid);persist();render()}
  else if(commit&&refused)toast('A row holds up to '+LayoutModel.MAX_COLUMNS+' cells.');
 }

 function grip(note,block){
  const button=el('button','grip','⠿  Move');
  button.type='button';button.title='Drag to move this cell. Drop on the left or right edge of another cell to make columns. Arrow keys also work.';
  button.setAttribute('aria-label','Move cell. Arrow keys move it; drag to place it beside another cell.');
  button.onpointerdown=event=>{
   if(event.button!==0)return;event.preventDefault();
   const source=button.closest('.block'),startX=event.clientX,startY=event.clientY;let started=false;
   const move=e=>{
    if(!started&&Math.hypot(e.clientX-startX,e.clientY-startY)<MOVE_PX)return;
    if(!started){started=true;begin(e,note,block,source)}
    drag.x=e.clientX;drag.y=e.clientY;
   };
   const up=()=>{off();finish(started)};
   const key=e=>{if(e.key==='Escape'){off();finish(false)}};
   const off=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);document.removeEventListener('keydown',key,true)};
   document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',()=>{off();finish(false)});document.addEventListener('keydown',key,true);
  };
  button.onkeydown=event=>{
   const dir={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[event.key];if(!dir)return;
   event.preventDefault();
   const out=LayoutModel.nudge(note.blocks,block.id,dir,uid);
   if(!out.ok){if(out.reason==='full')toast('A row holds up to '+LayoutModel.MAX_COLUMNS+' cells.');return}
   persist();render();
   // render() rebuilt the cells; keep the keyboard on this cell's grip so the next arrow keeps moving it
   const index=note.blocks.indexOf(block);document.querySelectorAll('#editor .block')[index]?.querySelector('.grip')?.focus();
  };
  return button;
 }
 return {grip};
})();
