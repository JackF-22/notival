/* Writing around the text, the way you would on paper. The first kind is a brace: group a run of lines (say three
   bullets that share an assumption) with a } and a short handwritten label beside it.

   An annotation is pinned to lines, not to a spot on the screen: it remembers the first and last line it spans (by the
   lines' passage ids) and is drawn again from where those lines are now. So text added above, a narrower window, or
   reopening the note all keep it beside the same group. It lives on note.annotations; the text itself is untouched
   apart from the ids on the lines it's pinned to.

   Starting one: hover a line and use the small } in the right margin (click for that line, drag down or up to cover
   several), or select across lines and press ⌘} (⌘⇧]) or use "Group" in the selection toolbar. Type the label, then
   Enter (or Esc) puts the caret back where you were typing. */
(()=>{
 const root=document.querySelector('#editor'),article=root?.closest('article');if(!root||!article)return;
 const mac=/Mac|iPhone|iPad/.test(navigator.platform);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n};
 const svgNS='http://www.w3.org/2000/svg';
 const visible=()=>document.body.dataset.view==='note'&&mode==='write'&&!root.hidden;
 const list=note=>(note.annotations??=[]);
 const tidy=text=>String(text||'').replace(/\s+/g,' ').trim();

 // ── Lines ───────────────────────────────────────────────────────────────────
 // The lines of a text block in reading order: each top-level line, each bullet at any depth, each line of a column.
 function linesOf(rich){
  const found=[];
  const walk=parent=>{for(const child of parent.children){
   if(child.matches('.cols')){for(const col of child.children)if(col.matches('.col'))walk(col);continue}
   if(/^(UL|OL)$/.test(child.tagName)){for(const item of child.querySelectorAll('li'))found.push(item);continue}
   found.push(child);
  }};
  walk(rich);return found;
 }
 const lineOf=node=>{const at=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement,rich=at?.closest?.('#editor .rich-text');if(!rich)return null;return linesOf(rich).filter(line=>line.contains(at)).at(-1)||null};
 const lineById=id=>id?[...root.querySelectorAll('[data-passage-id]')].find(n=>n.dataset.passageId===id)||null:null;
 function idFor(line){if(!line.dataset.passageId)line.dataset.passageId=uid();return line.dataset.passageId}
 // Where the ink of some lines sits: their own text, not the full width of the block they're in.
 function inkOf(lines){
  let top=Infinity,bottom=-Infinity,right=-Infinity,left=Infinity;
  for(const line of lines){
   const range=document.createRange();range.selectNodeContents(line);
   const nested=line.tagName==='LI'?[...line.children].find(n=>/^(UL|OL)$/.test(n.tagName)):null;if(nested)range.setEndBefore(nested);
   let rects=[...range.getClientRects()].filter(r=>r.width||r.height);
   if(!rects.length)rects=[line.getBoundingClientRect()];
   for(const r of rects){top=Math.min(top,r.top);bottom=Math.max(bottom,r.bottom);right=Math.max(right,r.right);left=Math.min(left,r.left)}
   if(!range.toString().trim()){const box=line.getBoundingClientRect();right=Math.max(right,box.left+24)}
  }
  return {top,bottom,right,left};
 }
 // The lines an annotation spans now, first to last, whichever order its ends are in.
 function span(note,a){
  const first=lineById(a.from),last=lineById(a.to)||first;if(!first)return null;
  const rich=first.closest('.rich-text');if(!rich||!rich.contains(last))return [first];
  const lines=linesOf(rich),i=lines.indexOf(first),j=lines.indexOf(last);if(i<0||j<0)return [first];
  return lines.slice(Math.min(i,j),Math.max(i,j)+1);
 }
 // Enter copies a line's attributes onto the new line. The copy loses the id, and if the original was left empty
 // (Enter at the very start of a line), the id moves to the line that now holds the words.
 root.addEventListener('input',()=>{
  textAt=++clock;
  const note=current();if(!note?.annotations?.length)return;
  const ends=new Set(note.annotations.flatMap(a=>[a.from,a.to]).filter(Boolean)),byId=new Map();
  for(const node of root.querySelectorAll('[data-passage-id]')){const id=node.dataset.passageId;if(!ends.has(id))continue;if(!byId.has(id))byId.set(id,[]);byId.get(id).push(node)}
  for(const nodes of byId.values()){if(nodes.length<2)continue;const keep=nodes.find(n=>tidy(n.textContent))||nodes[0];for(const n of nodes)if(n!==keep)delete n.dataset.passageId}
 },true);

 // ── Undo: annotation changes have their own history, used when an annotation was the last thing changed ───────
 // A counter rather than the time: a brace and the save of its lines' ids can happen in the same millisecond.
 const histories=new Map();let clock=0,changedAt=0,textAt=0;
 const history=note=>{if(!histories.has(note.id))histories.set(note.id,{undo:[],redo:[]});return histories.get(note.id)};
 function change(note,apply){
  const h=history(note);h.undo.push(JSON.stringify(list(note)));if(h.undo.length>100)h.undo.shift();h.redo=[];
  apply();changedAt=++clock;persist();schedule();
 }
 function travel(note,from,to){
  const h=history(note);if(!h[from].length)return false;
  h[to].push(JSON.stringify(list(note)));note.annotations=JSON.parse(h[from].pop());changedAt=++clock;
  editing=null;persist();draw();return true;
 }
 document.addEventListener('keydown',event=>{
  if(!(event.metaKey||event.ctrlKey)||event.altKey||event.key.toLowerCase()!=='z')return;
  const note=current();if(!note||!visible()||document.querySelector('dialog[open]'))return;
  if(document.activeElement?.closest?.('.anno-label'))return;   // typing in a label: its own text undo
  if(changedAt<=textAt)return;                                  // the text was changed last: the editor's undo
  if(travel(note,event.shiftKey?'redo':'undo',event.shiftKey?'undo':'redo')){event.preventDefault();event.stopImmediatePropagation()}
 },true);

 // ── Making a brace ──────────────────────────────────────────────────────────
 let editing=null;   // {id, fresh, back: where the caret was in the text, before: label text when editing began}
 function caretInText(){const s=getSelection();if(!s?.rangeCount)return null;const r=s.getRangeAt(0),rich=(r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement)?.closest?.('#editor .rich-text');return rich?{rich,range:r.cloneRange()}:null}
 function group(first,last){
  const note=current();if(!note||!first)return;
  // Afterwards the caret goes back where you were typing, or else to the end of the last grouped line.
  let back=caretInText();
  if(!back){const end=last||first,range=document.createRange();range.selectNodeContents(end);const nested=end.tagName==='LI'?[...end.children].find(n=>/^(UL|OL)$/.test(n.tagName)):null;if(nested)range.setEndBefore(nested);range.collapse(false);back={rich:end.closest('.rich-text'),range}}
  const a={id:uid(),kind:'brace',from:idFor(first),to:idFor(last||first),text:'',dx:0,dy:0,created:Date.now()};
  first.closest('.rich-text')?.dispatchEvent(new Event('input',{bubbles:true}));   // save the lines' new ids
  change(note,()=>list(note).push(a));
  editing={id:a.id,fresh:true,back,before:''};draw();focusLabel(a.id);
 }
 function groupSelection(){
  const s=getSelection();if(!s?.rangeCount)return false;const r=s.getRangeAt(0);
  const first=lineOf(r.startContainer),last=lineOf(r.endContainer)||first;if(!first)return false;
  // A selection ending at the very start of a line doesn't take that line in.
  let end=last;if(last!==first&&r.endOffset===0){const lines=linesOf(first.closest('.rich-text')),i=lines.indexOf(last);if(i>0)end=lines[i-1]}
  group(first,end);return true;
 }
 document.addEventListener('keydown',event=>{
  if(event.code!=='BracketRight'||!event.shiftKey||event.altKey||!(mac?event.metaKey&&!event.ctrlKey:event.ctrlKey&&!event.metaKey))return;
  if(!visible()||document.querySelector('dialog[open]'))return;
  if(groupSelection()){event.preventDefault();event.stopImmediatePropagation()}
 },true);
 function finishEditing(restore=true){
  if(!editing)return;const {id,fresh,back,before}=editing;editing=null;
  const note=current(),a=note&&list(note).find(x=>x.id===id),label=layer.querySelector(`.anno[data-id="${id}"] .anno-label`);
  if(a&&label){const text=label.innerText.replace(/\n{3,}/g,'\n\n').trim();if(text!==a.text){
   if(fresh){a.text=text;persist()}else{change(note,()=>{a.text=text})}}}
  changedAt=++clock;
  if(restore&&back?.rich?.isConnected){back.rich.focus({preventScroll:true});const s=getSelection();s.removeAllRanges();try{s.addRange(back.range)}catch{}}
  else label?.blur();
  schedule();
 }
 function cancelFresh(){
  if(!editing?.fresh)return finishEditing();
  const {id,back}=editing,note=current();editing=null;
  if(note){const h=history(note);note.annotations=list(note).filter(a=>a.id!==id);h.undo.pop();persist()}
  if(back?.rich?.isConnected){back.rich.focus({preventScroll:true});const s=getSelection();s.removeAllRanges();try{s.addRange(back.range)}catch{}}
  draw();
 }
 function remove(id){
  const note=current();if(!note)return;
  if(editing?.id===id)editing=null;
  change(note,()=>{note.annotations=list(note).filter(a=>a.id!==id)});
  offerUndo('Removed the brace',()=>travel(note,'undo','redo'));
 }
 function focusLabel(id){
  const label=layer.querySelector(`.anno[data-id="${id}"] .anno-label`);if(!label)return;
  const host=label.closest('.anno');if(host.classList.contains('tucked'))host.classList.add('open');
  label.focus({preventScroll:true});const r=document.createRange();r.selectNodeContents(label);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);
 }

 // ── Drawing ─────────────────────────────────────────────────────────────────
 const layer=el('div',undefined,'anno-layer');layer.setAttribute('aria-label','Annotations');article.append(layer);
 const bracePath=(x,y1,y2,w)=>{const ym=(y1+y2)/2,q=Math.min(9,(y2-y1)/4),m=x+w/2;return `M ${x} ${y1} Q ${m} ${y1} ${m} ${y1+q} L ${m} ${ym-q} Q ${m} ${ym} ${x+w} ${ym} Q ${m} ${ym} ${m} ${ym+q} L ${m} ${y2-q} Q ${m} ${y2} ${x} ${y2}`};
 // Page coordinates inside the scrolling article, so drawings scroll with the text without being redrawn.
 const local=()=>{const box=article.getBoundingClientRect();return {x:v=>v-box.left+article.scrollLeft,y:v=>v-box.top+article.scrollTop,right:box.right-box.left+article.scrollLeft}};
 function roomRight(line,at){
  const column=line.closest('.col'),rail=document.querySelector('#note-rail');
  let limit=at.right-18;
  if(column&&column.nextElementSibling)limit=Math.min(limit,at.x(column.getBoundingClientRect().right)-6);
  if(rail&&!rail.hidden&&rail.offsetWidth){const r=rail.getBoundingClientRect();if(r.left>0)limit=Math.min(limit,at.x(r.left)-12)}
  return limit;
 }
 function draw(){
  const note=current();
  if(!note||!visible()||!note.annotations?.length){layer.replaceChildren();layer.hidden=true;return}
  layer.hidden=false;const at=local(),seen=new Set();let number=0;
  for(const a of note.annotations){
   if(a.kind!=='brace')continue;
   const lines=span(note,a);if(!lines?.length)continue;
   const ink=inkOf(lines);if(!isFinite(ink.top))continue;
   number++;seen.add(a.id);
   let host=layer.querySelector(`.anno[data-id="${a.id}"]`);if(!host)host=build(a);
   const y1=at.y(ink.top)+1,y2=Math.max(at.y(ink.bottom)-1,y1+14),limit=roomRight(lines[0],at),w=12;
   const x=Math.max(at.x(ink.right)+8,Math.min(at.x(ink.right)+12+(a.dx||0),limit-w-6));
   const labelLeft=x+w+8,room=limit-labelLeft;
   const tucked=room<120;host.classList.toggle('tucked',tucked);if(!tucked)host.classList.remove('open');
   host.style.cssText=`left:${x}px;top:${y1}px;width:${w}px;height:${y2-y1}px`;
   const svg=host.querySelector('svg');svg.setAttribute('width',String(w+2));svg.setAttribute('height',String(y2-y1+2));
   for(const path of svg.querySelectorAll('path'))path.setAttribute('d',bracePath(1,1,y2-y1+1,w));
   const label=host.querySelector('.anno-label'),badge=host.querySelector('.anno-badge');
   badge.textContent=String(number);badge.title=a.text?a.text:'Brace '+number+' (no label)';badge.setAttribute('aria-label','Note beside brace: '+(a.text||'empty'));
   if(editing?.id!==a.id&&label.innerText!==a.text)label.textContent=a.text;
   label.classList.toggle('empty',!a.text&&editing?.id!==a.id);
   if(tucked){label.style.cssText='';}
   else{const width=Math.min(260,room);label.style.cssText=`left:${w+8}px;max-width:${width}px`;label.style.top=((y2-y1)/2+(a.dy||0)-label.offsetHeight/2)+'px'}
  }
  for(const host of [...layer.children])if(!seen.has(host.dataset.id))host.remove();
 }
 function build(a){
  const host=el('div',undefined,'anno anno-brace');host.dataset.id=a.id;
  const svg=document.createElementNS(svgNS,'svg');svg.classList.add('anno-ink');
  const hit=document.createElementNS(svgNS,'path');hit.classList.add('anno-hit');
  const ink=document.createElementNS(svgNS,'path');ink.classList.add('anno-stroke');svg.append(hit,ink);
  const label=el('div',undefined,'anno-label');label.contentEditable='plaintext-only';label.spellcheck=true;label.setAttribute('role','textbox');label.setAttribute('aria-label','Label for the grouped lines');label.dataset.placeholder='Say what they share…';
  const badge=el('button',undefined,'anno-badge');badge.type='button';
  const close=el('button','×','anno-remove');close.type='button';close.title='Remove the brace';close.setAttribute('aria-label','Remove the brace');
  const top=el('span',undefined,'anno-knob anno-knob-top'),bottom=el('span',undefined,'anno-knob anno-knob-bottom');top.title=bottom.title='Drag to cover more or fewer lines';
  host.append(svg,label,badge,close,top,bottom);layer.append(host);
  close.onmousedown=e=>e.preventDefault();close.onclick=()=>remove(host.dataset.id);
  badge.onmousedown=e=>e.preventDefault();
  badge.onclick=()=>{const open=!host.classList.contains('open');for(const other of layer.querySelectorAll('.anno.open'))other.classList.remove('open');host.classList.toggle('open',open);if(open)focusLabel(host.dataset.id)};
  label.addEventListener('focus',()=>{if(editing?.id!==host.dataset.id){finishEditing(false);const a=current()?.annotations?.find(x=>x.id===host.dataset.id);editing={id:host.dataset.id,fresh:false,back:null,before:a?.text||''}}label.classList.remove('empty')});
  label.addEventListener('blur',()=>{setTimeout(()=>{if(editing?.id===host.dataset.id&&!host.contains(document.activeElement))finishEditing(false)},0)});
  label.addEventListener('keydown',event=>{
   event.stopPropagation();
   if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();host.classList.remove('open');finishEditing(true)}
   else if(event.key==='Escape'){event.preventDefault();host.classList.remove('open');if(editing?.fresh&&!label.innerText.trim())cancelFresh();else finishEditing(true)}
   else if(event.key==='Backspace'&&!label.innerText.trim()&&!editing?.fresh){event.preventDefault();remove(host.dataset.id)}
  });
  label.addEventListener('input',()=>{const a=current()?.annotations?.find(x=>x.id===host.dataset.id);if(a&&!host.classList.contains('tucked'))label.style.top=((host.offsetHeight)/2+(a.dy||0)-label.offsetHeight/2)+'px'});
  // Dragging the brace or the label moves the annotation; a click on the label edits it.
  for(const part of [hit,ink,label])part.addEventListener('pointerdown',event=>moveStart(event,host,part===label));
  for(const knob of [top,bottom])knob.addEventListener('pointerdown',event=>resizeStart(event,host,knob===top));
  return host;
 }
 function moveStart(event,host,fromLabel){
  if(event.button!==0)return;const note=current(),a=note?.annotations?.find(x=>x.id===host.dataset.id);if(!a)return;
  if(fromLabel&&document.activeElement===host.querySelector('.anno-label'))return;   // already typing: select text normally
  event.preventDefault();
  const start={x:event.clientX,y:event.clientY,dx:a.dx||0,dy:a.dy||0};let moved=false,snapshot=null;
  const move=ev=>{
   const ddx=ev.clientX-start.x,ddy=ev.clientY-start.y;if(!moved&&Math.hypot(ddx,ddy)<4)return;
   if(!moved){moved=true;snapshot=JSON.stringify(list(note));host.classList.add('dragging')}
   a.dx=Math.max(-40,Math.min(400,start.dx+ddx));a.dy=Math.max(-(host.offsetHeight/2+60),Math.min(host.offsetHeight/2+60,start.dy+ddy));draw();
  };
  const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);host.classList.remove('dragging');
   if(moved){const h=history(note);h.undo.push(snapshot);h.redo=[];changedAt=++clock;persist();draw()}
   else if(fromLabel)focusLabel(host.dataset.id)};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
 }
 // A knob at either end of the brace stretches it over more lines (or fewer), snapping to whole lines.
 function resizeStart(event,host,top){
  if(event.button!==0)return;const note=current(),a=note?.annotations?.find(x=>x.id===host.dataset.id);if(!a)return;
  event.preventDefault();event.stopPropagation();
  const lines=span(note,a);if(!lines)return;const rich=lines[0].closest('.rich-text'),all=linesOf(rich),fixed=top?lines.at(-1):lines[0];
  const snapshot=JSON.stringify(list(note));let changed=false;host.classList.add('dragging');
  const move=ev=>{
   const near=lineNear(all,ev.clientY);if(!near)return;
   const i=all.indexOf(fixed),j=all.indexOf(near);
   const [first,last]=top?[all[Math.min(i,j)],fixed]:[fixed,all[Math.max(i,j)]];
   const from=idFor(first),to=idFor(last);if(from!==a.from||to!==a.to){a.from=from;a.to=to;changed=true;draw()}
  };
  const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);host.classList.remove('dragging');
   if(changed){rich.dispatchEvent(new Event('input',{bubbles:true}));const h=history(note);h.undo.push(snapshot);h.redo=[];changedAt=++clock;persist();draw()}};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
 }
 const lineNear=(lines,y)=>{let best=null,distance=Infinity;for(const line of lines){const ink=inkOf([line]);const d=y<ink.top?ink.top-y:y>ink.bottom?y-ink.bottom:0;if(d<distance){distance=d;best=line}}return best};

 // ── The } in the margin: hover a line to see it; click for that line, drag to cover several ──────────────────
 const control=el('button','}','anno-start');control.type='button';control.hidden=true;
 control.title='Group lines with a brace and a note: click for this line, drag up or down for several ('+(mac?'⌘}':'Ctrl+}')+' groups selected lines)';
 control.setAttribute('aria-label','Group this line with a brace');article.append(control);
 let hovered=null,hideTimer=0;
 function placeControl(line){
  const at=local(),rich=line.closest('.rich-text'),ink=inkOf([line]),block=(line.closest('.col')||rich).getBoundingClientRect();
  const gutter=at.right-at.x(block.right);
  const x=gutter>=34?at.x(block.right)+8:at.x(block.right)-24;
  control.style.left=x+'px';control.style.top=(at.y(ink.top)+Math.max(0,(ink.bottom-ink.top-20)/2))+'px';control.hidden=false;
 }
 article.addEventListener('mousemove',event=>{
  if(dragging||!visible())return;
  if(event.target.closest?.('.anno')){clearTimeout(hideTimer);control.hidden=true;return}   // over a drawing: its own tools, not a new brace
  if(event.target.closest?.('.anno-start'))return;
  const rich=event.target.closest?.('#editor .rich-text');
  let line=rich?lineOf(event.target):null;
  // Over the empty margin to the right of the text: the line at the same height.
  if(!line&&!rich&&!event.target.closest?.('#format-bar,#note-rail,.block-tools')){const texts=[...root.querySelectorAll('.rich-text')];for(const t of texts){const b=t.getBoundingClientRect();if(event.clientY>=b.top&&event.clientY<=b.bottom&&event.clientX>b.right){line=lineNear(linesOf(t),event.clientY);break}}}
  if(line&&!line.matches('.equation,.procedure,table,hr')){clearTimeout(hideTimer);hovered=line;placeControl(line)}
  else{clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!dragging&&!control.matches(':hover'))control.hidden=true},400)}
 });
 article.addEventListener('mouseleave',()=>{if(!dragging)control.hidden=true});
 control.addEventListener('mousedown',e=>e.preventDefault());
 let dragging=false;
 control.addEventListener('pointerdown',event=>{
  if(event.button!==0||!hovered)return;event.preventDefault();
  const start=hovered,rich=start.closest('.rich-text'),all=linesOf(rich),preview=el('div',undefined,'anno anno-brace anno-preview');
  const svg=document.createElementNS(svgNS,'svg');svg.classList.add('anno-ink');const path=document.createElementNS(svgNS,'path');path.classList.add('anno-stroke');svg.append(path);preview.append(svg);
  let end=start,moved=false;dragging=true;
  const show=()=>{
   const i=all.indexOf(start),j=all.indexOf(end),lines=all.slice(Math.min(i,j),Math.max(i,j)+1),ink=inkOf(lines),at=local();
   for(const line of all)line.classList.toggle('anno-covered',lines.includes(line));
   const y1=at.y(ink.top)+1,y2=Math.max(at.y(ink.bottom)-1,y1+14),x=at.x(ink.right)+12;
   preview.style.cssText=`left:${x}px;top:${y1}px;width:12px;height:${y2-y1}px`;svg.setAttribute('width','14');svg.setAttribute('height',String(y2-y1+2));path.setAttribute('d',bracePath(1,1,y2-y1+1,12));
   if(!preview.isConnected)layer.append(preview);layer.hidden=false;
  };
  const move=ev=>{if(!moved&&Math.abs(ev.clientY-event.clientY)<4)return;moved=true;const near=lineNear(all,ev.clientY);if(near&&near!==end){end=near}show()};
  const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);
   dragging=false;preview.remove();for(const line of all)line.classList.remove('anno-covered');control.hidden=true;
   const i=all.indexOf(start),j=all.indexOf(end);group(all[Math.min(i,j)],all[Math.max(i,j)])};
  show();document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
 });

 // ── Keeping drawings beside their lines ─────────────────────────────────────
 let queued=false;
 const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;draw()})};
 new MutationObserver(schedule).observe(root,{childList:true,subtree:true,characterData:true});
 const resized=new ResizeObserver(schedule);resized.observe(root);resized.observe(article);
 window.addEventListener('resize',schedule);document.fonts?.ready?.then(schedule);
 document.addEventListener('pointerdown',event=>{if(!event.target.closest?.('.anno'))for(const open of layer.querySelectorAll('.anno.open'))if(!open.contains(document.activeElement))open.classList.remove('open')},true);
 const reset=()=>{if(editing)finishEditing(false);control.hidden=true};
 new MutationObserver(()=>{reset();schedule()}).observe(document.body,{attributes:true,attributeFilter:['data-view']});
 const baseRender=render;render=function(){reset();baseRender();schedule()};
 const baseSetMode=setMode;setMode=function(next){reset();baseSetMode(next);schedule()};

 // In the selection toolbar, beside Flag and Link.
 function addToolbarButton(){
  const tools=document.querySelector('#selection-tools');if(!tools)return false;
  if(!document.querySelector('#selection-group')){const b=el('button','Group }');b.type='button';b.id='selection-group';b.title='Group these lines with a brace and a note ('+(mac?'⌘}':'Ctrl+}')+')';b.onmousedown=e=>e.preventDefault();b.onclick=()=>groupSelection();tools.append(b)}
  return true;
 }
 if(!addToolbarButton()){const watcher=new MutationObserver(()=>{if(addToolbarButton())watcher.disconnect()});watcher.observe(document.body,{childList:true})}
 window.marginAnnotations={draw,group,groupSelection};
})();
