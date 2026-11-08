/* Writing around the text, the way you would on paper. Three kinds, all kept on note.annotations:
     brace   a } beside a run of lines (say three bullets that share an assumption), with a short note beside it
     bubble  a side note in the margin beside a line, joined to it by a faint lead line
     box     a box drawn in blank space anywhere on the page, holding a reminder or an equation ($…$)

   Each is pinned to lines, never to a spot on the screen. A brace remembers the first and last line it spans; a bubble
   or box remembers the line nearest its top and where it sits from there: dy from the line's top, and x from the text's
   left edge, or from its right edge when it was put out in the margin (so it stays in the margin as the column widens
   or narrows). All are drawn again from where those lines are now, so text added above, a narrower window and reopening
   the note keep them in place. When there's no room for one, it folds into a small badge beside its line.

   Starting one: the } in the right margin (click for a line, drag for several), ⌘} for selected lines; a click in the
   margin beside a paragraph, or ⌘', for a side note; a drag across blank space, or ⌘⇧B then a drag anywhere, for a box.
   "Mark up" in the format bar lists all three. Enter (or Esc) after typing puts the caret back where you were. */
(()=>{
 const root=document.querySelector('#editor'),article=root?.closest('article');if(!root||!article)return;
 const mac=/Mac|iPhone|iPad/.test(navigator.platform),cmd=mac?'⌘':'Ctrl+';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n};
 const svgNS='http://www.w3.org/2000/svg';
 const visible=()=>document.body.dataset.view==='note'&&mode==='write'&&!root.hidden;
 const list=note=>(note.annotations??=[]);
 const find=id=>current()?.annotations?.find(a=>a.id===id);
 const tidy=text=>String(text||'').replace(/\s+/g,' ').trim();
 const names={brace:'brace',bubble:'side note',box:'box'};

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
 const allLines=()=>[...root.querySelectorAll('.rich-text')].flatMap(linesOf);
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
 const lineNear=(lines,y)=>{let best=null,distance=Infinity;for(const line of lines){const ink=inkOf([line]);const d=y<ink.top?ink.top-y:y>ink.bottom?y-ink.bottom:0;if(d<distance){distance=d;best=line}}return best};
 // The lines a brace spans now, first to last, whichever order its ends are in.
 function span(a){
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
 const saveIds=line=>line?.closest('.rich-text')?.dispatchEvent(new Event('input',{bubbles:true}));

 // ── Undo: annotation changes have their own history, used when an annotation was the last thing changed ───────
 // A counter rather than the time: an annotation and the save of its lines' ids can happen in the same millisecond.
 const histories=new Map();let clock=0,changedAt=0,textAt=0;
 const history=note=>{if(!histories.has(note.id))histories.set(note.id,{undo:[],redo:[]});return histories.get(note.id)};
 function change(note,apply){
  const h=history(note);h.undo.push(JSON.stringify(list(note)));if(h.undo.length>100)h.undo.shift();h.redo=[];
  apply();changedAt=++clock;persist();schedule();
 }
 const remember=(note,snapshot)=>{const h=history(note);h.undo.push(snapshot);h.redo=[];changedAt=++clock;persist()};
 function travel(note,from,to){
  const h=history(note);if(!h[from].length)return false;
  h[to].push(JSON.stringify(list(note)));note.annotations=JSON.parse(h[from].pop());changedAt=++clock;
  editing=null;persist();draw();return true;
 }
 document.addEventListener('keydown',event=>{
  if(!(event.metaKey||event.ctrlKey)||event.altKey||event.key.toLowerCase()!=='z')return;
  const note=current();if(!note||!visible()||document.querySelector('dialog[open]'))return;
  if(document.activeElement?.closest?.('.anno-label'))return;   // typing in a note: its own text undo
  if(changedAt<=textAt)return;                                  // the text was changed last: the editor's undo
  if(travel(note,event.shiftKey?'redo':'undo',event.shiftKey?'undo':'redo')){event.preventDefault();event.stopImmediatePropagation()}
 },true);

 // ── Text inside annotations: typed plainly, shown with $…$ typeset ───────────
 function show(label,text){
  if(label.dataset.shown===text&&label.dataset.mode==='show')return;
  label.dataset.shown=text;label.dataset.mode='show';label.replaceChildren();
  const parts=String(text||'').split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/);
  for(const part of parts){
   if(!part)continue;
   const math=part.match(/^\$\$([\s\S]+)\$\$$/)||part.match(/^\$([^$]+)\$$/);
   if(math&&typeof katex!=='undefined'){const box=el('span',undefined,'anno-math');try{katex.render(window.MathSyntax?.katexSource?MathSyntax.katexSource(math[1]):math[1],box,{displayMode:part.startsWith('$$'),throwOnError:false})}catch{box.textContent=part}label.append(box)}
   else label.append(document.createTextNode(part));
  }
 }
 function raw(label,text){label.dataset.mode='raw';label.textContent=text||''}

 // ── Starting and finishing ──────────────────────────────────────────────────
 let editing=null;   // {id, fresh, back: where the caret was in the text}
 function caretInText(){const s=getSelection();if(!s?.rangeCount)return null;const r=s.getRangeAt(0),rich=(r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement)?.closest?.('#editor .rich-text');return rich?{rich,range:r.cloneRange()}:null}
 // Afterwards the caret goes back where you were typing, or else to the end of the line the annotation is on.
 function backTo(line){
  const back=caretInText();if(back)return back;if(!line)return null;
  const range=document.createRange();range.selectNodeContents(line);const nested=line.tagName==='LI'?[...line.children].find(n=>/^(UL|OL)$/.test(n.tagName)):null;if(nested)range.setEndBefore(nested);range.collapse(false);
  return {rich:line.closest('.rich-text'),range};
 }
 function add(a,line){
  const note=current();if(!note)return;
  const back=backTo(line);saveIds(line);
  change(note,()=>list(note).push(a));
  editing={id:a.id,fresh:true,back};draw();focusLabel(a.id);
 }
 function group(first,last){
  if(!first)return;
  add({id:uid(),kind:'brace',from:idFor(first),to:idFor(last||first),text:'',dx:0,dy:0,created:Date.now()},last||first);
 }
 function groupSelection(){
  const s=getSelection();if(!s?.rangeCount)return false;const r=s.getRangeAt(0);
  const first=lineOf(r.startContainer),last=lineOf(r.endContainer)||first;if(!first)return false;
  // A selection ending at the very start of a line doesn't take that line in.
  let end=last;if(last!==first&&r.endOffset===0){const lines=linesOf(first.closest('.rich-text')),i=lines.indexOf(last);if(i>0)end=lines[i-1]}
  group(first,end);return true;
 }
 // Where a bubble or box at this spot on the page is pinned: the line nearest its top, and its place from there.
 function pinAt(left,top,line=lineNear(allLines(),top)){
  if(!line)return null;
  const text=(line.closest('.col')||line.closest('.rich-text')).getBoundingClientRect(),ink=inkOf([line]),margin=left>=text.right-4;
  return {line,from:idFor(line),side:margin?'right':'left',x:Math.round(margin?left-text.right:left-text.left),dy:Math.round(top-ink.top)};
 }
 function bubbleAt(clientX,clientY,line){
  const pin=line?pinAt(Math.max(inkOf([line]).right+28,clientX),clientY,line):pinAt(clientX,clientY);
  if(!pin)return;
  add({id:uid(),kind:'bubble',from:pin.from,side:pin.side,x:pin.x,dy:pin.dy,text:'',created:Date.now()},pin.line);
 }
 function boxAt(left,top,width,height){
  const pin=pinAt(left,top);if(!pin)return;
  add({id:uid(),kind:'box',from:pin.from,side:pin.side,x:pin.x,dy:pin.dy,w:Math.round(width),h:Math.round(height),text:'',created:Date.now()},pin.line);
 }
 function finishEditing(restore=true){
  if(!editing)return;const {id,fresh,back}=editing;editing=null;
  const note=current(),a=note&&find(id),host=layer.querySelector(`.anno[data-id="${id}"]`),label=host?.querySelector('.anno-label');
  if(a&&label){
   const text=label.innerText.replace(/ /g,' ').replace(/\n{3,}/g,'\n\n').trim();
   // A side note left empty was a stray click in the margin: it simply goes.
   if(!text&&a.kind==='bubble'){note.annotations=list(note).filter(x=>x!==a);if(fresh)history(note).undo.pop();else remember(note,JSON.stringify([...list(note),a]));persist()}
   else if(text!==a.text){if(fresh){a.text=text;persist()}else change(note,()=>{a.text=text})}
  }
  host?.classList.remove('open');
  changedAt=++clock;
  if(restore&&back?.rich?.isConnected){back.rich.focus({preventScroll:true});const s=getSelection();s.removeAllRanges();try{s.addRange(back.range)}catch{}}
  else if(label&&document.activeElement===label)label.blur();
  draw();
 }
 function cancelFresh(){
  if(!editing?.fresh)return finishEditing();
  const {id,back}=editing,note=current();editing=null;
  if(note){note.annotations=list(note).filter(a=>a.id!==id);history(note).undo.pop();persist()}
  if(back?.rich?.isConnected){back.rich.focus({preventScroll:true});const s=getSelection();s.removeAllRanges();try{s.addRange(back.range)}catch{}}
  draw();
 }
 function remove(id){
  const note=current(),a=find(id);if(!note||!a)return;
  if(editing?.id===id)editing=null;
  change(note,()=>{note.annotations=list(note).filter(x=>x.id!==id)});
  offerUndo('Removed the '+names[a.kind],()=>travel(note,'undo','redo'));
 }
 function focusLabel(id){
  const host=layer.querySelector(`.anno[data-id="${id}"]`),label=host?.querySelector('.anno-label');if(!label)return;
  if(host.classList.contains('tucked'))host.classList.add('open');
  label.focus({preventScroll:true});const r=document.createRange();r.selectNodeContents(label);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);
 }

 // ── Drawing ─────────────────────────────────────────────────────────────────
 const layer=el('div',undefined,'anno-layer');layer.setAttribute('aria-label','Annotations');article.append(layer);
 const bracePath=(x,y1,y2,w)=>{const ym=(y1+y2)/2,q=Math.min(9,(y2-y1)/4),m=x+w/2;return `M ${x} ${y1} Q ${m} ${y1} ${m} ${y1+q} L ${m} ${ym-q} Q ${m} ${ym} ${x+w} ${ym} Q ${m} ${ym} ${m} ${ym+q} L ${m} ${y2-q} Q ${m} ${y2} ${x} ${y2}`};
 // Page coordinates inside the scrolling article, so drawings scroll with the text without being redrawn.
 function local(){const box=article.getBoundingClientRect();return {x:v=>v-box.left+article.scrollLeft,y:v=>v-box.top+article.scrollTop,toClientX:v=>v+box.left-article.scrollLeft,toClientY:v=>v+box.top-article.scrollTop,right:box.right-box.left+article.scrollLeft}}
 function roomRight(line,at){
  const column=line.closest('.col'),rail=document.querySelector('#note-rail');
  let limit=at.right-18;
  if(column&&column.nextElementSibling)limit=Math.min(limit,at.x(column.getBoundingClientRect().right)-6);
  // The outline beside the note is a wall on the right; when the window is narrow it moves above the note instead.
  if(rail&&!rail.hidden&&rail.offsetWidth){const r=rail.getBoundingClientRect(),text=line.closest('.rich-text').getBoundingClientRect();if(r.left>=text.right-1)limit=Math.min(limit,at.x(r.left)-12)}
  return limit;
 }
 function draw(){
  const note=current();
  if(!note||!visible()||!note.annotations?.length){for(const host of [...layer.querySelectorAll('.anno:not(.anno-preview)')])host.remove();layer.hidden=!layer.children.length;return}
  layer.hidden=false;const at=local(),seen=new Set();let number=0;
  for(const a of note.annotations){
   const host=layer.querySelector(`.anno[data-id="${a.id}"]`)||build(a);
   const placed=a.kind==='brace'?placeBrace(a,host,at):placeFree(a,host,at);
   if(!placed){host.hidden=true;seen.add(a.id);continue}
   host.hidden=false;seen.add(a.id);number++;
   const label=host.querySelector('.anno-label'),badge=host.querySelector('.anno-badge');
   if(editing?.id!==a.id)show(label,a.text);
   label.classList.toggle('empty',!a.text&&editing?.id!==a.id);
   badge.textContent=a.kind==='brace'?String(number):a.kind==='box'?'▢':'“';
   badge.title=a.text||('Empty '+names[a.kind]);badge.setAttribute('aria-label',names[a.kind]+': '+(a.text||'empty'));
  }
  for(const host of [...layer.querySelectorAll('.anno:not(.anno-preview)')])if(!seen.has(host.dataset.id))host.remove();
 }
 function placeBrace(a,host,at){
  const lines=span(a);if(!lines?.length)return false;
  const ink=inkOf(lines);if(!isFinite(ink.top))return false;
  const y1=at.y(ink.top)+1,y2=Math.max(at.y(ink.bottom)-1,y1+14),limit=roomRight(lines[0],at),w=12;
  const x=Math.max(at.x(ink.right)+8,Math.min(at.x(ink.right)+12+(a.dx||0),limit-w-6));
  const room=limit-(x+w+8),tucked=room<120;
  host.classList.toggle('tucked',tucked);if(!tucked&&editing?.id!==a.id)host.classList.remove('open');
  host.style.cssText=`left:${x}px;top:${y1}px;width:${w}px;height:${y2-y1}px`;
  const svg=host.querySelector('svg');svg.setAttribute('width',String(w+2));svg.setAttribute('height',String(y2-y1+2));
  for(const path of svg.querySelectorAll('path'))path.setAttribute('d',bracePath(1,1,y2-y1+1,w));
  const label=host.querySelector('.anno-label');
  if(tucked)label.style.cssText='';
  else{label.style.cssText=`left:${w+8}px;max-width:${Math.min(260,room)}px`;label.style.top=((y2-y1)/2+(a.dy||0)-label.offsetHeight/2)+'px'}
  return true;
 }
 // Bubbles and boxes: placed from their line, moved left to fit if the window narrows, folded into a badge if they
 // still don't fit (or would land on the text).
 function placeFree(a,host,at){
  const line=lineById(a.from);if(!line)return false;
  const rich=line.closest('.rich-text'),ink=inkOf([line]);if(!isFinite(ink.top))return false;
  const text=(line.closest('.col')||rich).getBoundingClientRect(),richLeft=at.x(rich.getBoundingClientRect().left),limit=roomRight(line,at);
  let left=(a.side==='right'?at.x(text.right):at.x(text.left))+(a.x||0),top=at.y(ink.top)+(a.dy||0);
  if(a.drag){left=a.drag.left;top=a.drag.top}
  host.classList.remove('tucked');
  const frame=host.querySelector('.anno-frame');
  if(a.kind==='box'){frame.style.width=Math.max(60,a.w||160)+'px';frame.style.minHeight=Math.max(32,a.h||60)+'px'}
  else frame.style.width='';
  const width=frame.offsetWidth,height=frame.offsetHeight;
  let tucked=false;
  if(!a.drag&&left+width>limit){
   const shifted=limit-width;
   const lines=linesOf(rich).filter(l=>{const k=inkOf([l]);return at.y(k.bottom)>top&&at.y(k.top)<top+height});
   const clear=lines.every(l=>at.x(inkOf([l]).right)+10<=shifted);
   // Moved left only into clear space: past the end of every line beside it, never onto the words.
   if(clear&&(shifted>=at.x(ink.right)+8||(a.kind==='box'&&shifted>=richLeft)))left=shifted;else tucked=true;
  }
  host.classList.toggle('tucked',tucked);
  if(tucked){
   if(editing?.id!==a.id&&!host.classList.contains('open'))host.classList.remove('open');
   host.style.cssText=`left:${Math.min(at.x(ink.right)+6,limit-22)}px;top:${at.y(ink.top)+Math.max(0,(Math.min(ink.bottom-ink.top,26)-18)/2)}px`;
   host.querySelector('.anno-leader').replaceChildren();
   return true;
  }
  host.classList.remove('open');
  host.style.cssText=`left:${left}px;top:${top}px`;
  // A side note is joined to the end of its line by a faint lead line, when it sits away from it.
  const leader=host.querySelector('.anno-leader');leader.replaceChildren();
  if(a.kind==='bubble'){
   const sx=at.x(ink.right)+4-left,sy=at.y(ink.top)+Math.min(ink.bottom-ink.top,24)/2-top,ex=0,ey=Math.min(height/2,16);
   if(Math.hypot(sx-ex,sy-ey)>18&&sx<ex-4){const path=document.createElementNS(svgNS,'path');path.setAttribute('d',`M ${sx} ${sy} C ${(sx+ex)/2} ${sy}, ${(sx+ex)/2} ${ey}, ${ex} ${ey}`);leader.append(path)}
  }
  return true;
 }
 function build(a){
  const host=el('div',undefined,'anno anno-'+a.kind);host.dataset.id=a.id;
  const label=el('div',undefined,'anno-label');label.contentEditable='plaintext-only';label.spellcheck=true;label.setAttribute('role','textbox');
  label.setAttribute('aria-label',a.kind==='brace'?'Note beside the grouped lines':a.kind==='box'?'Text in the box':'Side note');
  label.dataset.placeholder=a.kind==='brace'?'Say what they share…':a.kind==='box'?'Type, or $x^2$ for maths…':'Side note…';
  const badge=el('button',undefined,'anno-badge');badge.type='button';
  const close=el('button','×','anno-remove');close.type='button';close.title='Remove the '+names[a.kind];close.setAttribute('aria-label',close.title);
  if(a.kind==='brace'){
   const svg=document.createElementNS(svgNS,'svg');svg.classList.add('anno-ink');
   const hit=document.createElementNS(svgNS,'path');hit.classList.add('anno-hit');
   const ink=document.createElementNS(svgNS,'path');ink.classList.add('anno-stroke');svg.append(hit,ink);
   const top=el('span',undefined,'anno-knob anno-knob-top'),bottom=el('span',undefined,'anno-knob anno-knob-bottom');top.title=bottom.title='Drag to cover more or fewer lines';
   host.append(svg,label,badge,close,top,bottom);
   for(const part of [hit,ink,label])part.addEventListener('pointerdown',event=>moveBrace(event,host,part===label));
   for(const knob of [top,bottom])knob.addEventListener('pointerdown',event=>stretchBrace(event,host,knob===top));
  }else{
   const leader=document.createElementNS(svgNS,'svg');leader.classList.add('anno-leader');
   const frame=el('div',undefined,'anno-frame');frame.append(label);
   host.append(leader,frame,badge,close);
   if(a.kind==='box'){const corner=el('span',undefined,'anno-corner');corner.title='Drag to resize';frame.append(corner);corner.addEventListener('pointerdown',event=>resizeBox(event,host))}
   frame.addEventListener('pointerdown',event=>moveFree(event,host));
  }
  layer.append(host);
  close.onmousedown=e=>e.preventDefault();close.onclick=()=>remove(host.dataset.id);
  badge.onmousedown=e=>e.preventDefault();
  badge.onclick=()=>{const open=!host.classList.contains('open');for(const other of layer.querySelectorAll('.anno.open'))other.classList.remove('open');host.classList.toggle('open',open);if(open)focusLabel(host.dataset.id)};
  label.addEventListener('focus',()=>{
   const id=host.dataset.id;if(editing?.id!==id){finishEditing(false);editing={id,fresh:false,back:null}}
   raw(label,find(id)?.text);label.classList.remove('empty');
   const r=document.createRange();r.selectNodeContents(label);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);
  });
  label.addEventListener('blur',()=>{setTimeout(()=>{if(editing?.id===host.dataset.id&&!host.contains(document.activeElement))finishEditing(false)},0)});
  label.addEventListener('keydown',event=>{
   event.stopPropagation();
   if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();finishEditing(true)}
   else if(event.key==='Escape'){event.preventDefault();if(editing?.fresh&&!label.innerText.trim())cancelFresh();else finishEditing(true)}
   else if(event.key==='Backspace'&&!label.innerText.trim()&&!editing?.fresh){event.preventDefault();remove(host.dataset.id)}
  });
  label.addEventListener('input',()=>{if(host.classList.contains('anno-brace')&&!host.classList.contains('tucked')){const a=find(host.dataset.id);if(a)label.style.top=(host.offsetHeight/2+(a.dy||0)-label.offsetHeight/2)+'px'}});
  return host;
 }
 // Follow the pointer until it's let go; `done` learns whether it moved at all.
 function follow(event,move,done){
  let moved=false;const start={x:event.clientX,y:event.clientY};
  const onMove=ev=>{if(!moved&&Math.hypot(ev.clientX-start.x,ev.clientY-start.y)<4)return;moved=true;move(ev.clientX-start.x,ev.clientY-start.y,ev)};
  const up=ev=>{document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);done(moved,ev)};
  document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
 }
 function moveBrace(event,host,fromLabel){
  if(event.button!==0)return;const note=current(),a=find(host.dataset.id);if(!a)return;
  if(fromLabel&&document.activeElement===host.querySelector('.anno-label'))return;   // already typing: select text normally
  event.preventDefault();
  const start={dx:a.dx||0,dy:a.dy||0},snapshot=JSON.stringify(list(note));
  follow(event,(ddx,ddy)=>{host.classList.add('dragging');a.dx=Math.max(-40,Math.min(400,start.dx+ddx));a.dy=Math.max(-(host.offsetHeight/2+60),Math.min(host.offsetHeight/2+60,start.dy+ddy));draw()},
   moved=>{host.classList.remove('dragging');if(moved){remember(note,snapshot);draw()}else if(fromLabel)focusLabel(host.dataset.id)});
 }
 // A knob at either end of the brace stretches it over more lines (or fewer), snapping to whole lines.
 function stretchBrace(event,host,top){
  if(event.button!==0)return;const note=current(),a=find(host.dataset.id);if(!a)return;
  event.preventDefault();event.stopPropagation();
  const lines=span(a);if(!lines)return;const all=linesOf(lines[0].closest('.rich-text')),fixed=top?lines.at(-1):lines[0];
  const snapshot=JSON.stringify(list(note));host.classList.add('dragging');
  follow(event,(ddx,ddy,ev)=>{
   const near=lineNear(all,ev.clientY);if(!near)return;
   const i=all.indexOf(fixed),j=all.indexOf(near),[first,last]=top?[all[Math.min(i,j)],fixed]:[fixed,all[Math.max(i,j)]];
   const from=idFor(first),to=idFor(last);if(from!==a.from||to!==a.to){a.from=from;a.to=to;draw()}
  },moved=>{host.classList.remove('dragging');if(moved){saveIds(fixed);remember(note,snapshot);draw()}});
 }
 // A bubble or box moves wherever it's dragged, then pins itself to the line nearest its new top.
 function moveFree(event,host){
  if(event.button!==0||event.target.closest('.anno-corner'))return;const note=current(),a=find(host.dataset.id);if(!a)return;
  const label=host.querySelector('.anno-label');if(document.activeElement===label&&label.contains(event.target))return;
  if(host.classList.contains('tucked'))return;
  event.preventDefault();
  const at=local(),origin={left:parseFloat(host.style.left)||0,top:parseFloat(host.style.top)||0},snapshot=JSON.stringify(list(note));
  follow(event,(ddx,ddy)=>{host.classList.add('dragging');a.drag={left:Math.max(0,origin.left+ddx),top:Math.max(0,origin.top+ddy)};draw()},
   moved=>{host.classList.remove('dragging');
    if(!moved){delete a.drag;focusLabel(host.dataset.id);return}
    const pin=pinAt(at.toClientX(a.drag.left),at.toClientY(a.drag.top));delete a.drag;
    if(pin){a.from=pin.from;a.side=pin.side;a.x=pin.x;a.dy=pin.dy;saveIds(pin.line)}
    remember(note,snapshot);draw()});
 }
 function resizeBox(event,host){
  if(event.button!==0)return;const note=current(),a=find(host.dataset.id);if(!a)return;
  event.preventDefault();event.stopPropagation();
  const start={w:a.w||160,h:a.h||60},snapshot=JSON.stringify(list(note));
  follow(event,(ddx,ddy)=>{host.classList.add('dragging');a.w=Math.round(Math.max(60,Math.min(900,start.w+ddx)));a.h=Math.round(Math.max(32,Math.min(900,start.h+ddy)));draw()},
   moved=>{host.classList.remove('dragging');if(moved){remember(note,snapshot);draw()}});
 }

 // ── The } in the margin: hover a line to see it; click for that line, drag to cover several ──────────────────
 const control=el('button','}','anno-start');control.type='button';control.hidden=true;
 control.title='Group lines with a brace: click for this line, drag up or down for several ('+cmd+'} groups selected lines)';
 control.setAttribute('aria-label','Group this line with a brace');article.append(control);
 let hovered=null,hideTimer=0,dragging=false;
 function placeControl(line){
  const at=local(),rich=line.closest('.rich-text'),ink=inkOf([line]),block=(line.closest('.col')||rich).getBoundingClientRect();
  const gutter=at.right-at.x(block.right);
  control.style.left=(gutter>=34?at.x(block.right)+8:at.x(block.right)-24)+'px';control.style.top=(at.y(ink.top)+Math.max(0,(ink.bottom-ink.top-20)/2))+'px';control.hidden=false;
 }
 // Blank page: inside the note's area but not on text, a control or a drawing.
 function blankAt(event){
  if(!visible()||event.target.closest?.('#editor .block,#format-bar,#note-rail,.anno,.anno-start,button,input,textarea,select,a,[contenteditable],header,#add-bar,.note-head,.title-row'))return false;
  if(!article.contains(event.target))return false;
  const top=root.getBoundingClientRect().top;return event.clientY>=top-8;
 }
 // Beside which text, if any, a point in the blank margin is.
 function textBeside(event){for(const t of root.querySelectorAll('.rich-text')){const b=t.getBoundingClientRect();if(event.clientY>=b.top-6&&event.clientY<=b.bottom+6&&event.clientX>b.right)return t}return null}
 article.addEventListener('mousemove',event=>{
  if(dragging||drawingBox||!visible())return;
  if(event.target.closest?.('.anno')){clearTimeout(hideTimer);control.hidden=true;return}   // over a drawing: its own tools
  if(event.target.closest?.('.anno-start'))return;
  const rich=event.target.closest?.('#editor .rich-text');
  let line=rich?lineOf(event.target):null;
  const beside=!rich&&blankAt(event)?textBeside(event):null;
  if(beside)line=lineNear(linesOf(beside),event.clientY);
  article.classList.toggle('anno-margin',!!beside);
  if(line&&!line.matches('.equation,.procedure,table,hr')){clearTimeout(hideTimer);hovered=line;placeControl(line)}
  else{clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!dragging&&!control.matches(':hover'))control.hidden=true},400)}
 });
 article.addEventListener('mouseleave',()=>{if(!dragging)control.hidden=true;article.classList.remove('anno-margin')});
 control.addEventListener('mousedown',e=>e.preventDefault());
 control.addEventListener('pointerdown',event=>{
  if(event.button!==0||!hovered)return;event.preventDefault();
  const start=hovered,all=linesOf(start.closest('.rich-text')),preview=el('div',undefined,'anno anno-brace anno-preview');
  const svg=document.createElementNS(svgNS,'svg');svg.classList.add('anno-ink');const path=document.createElementNS(svgNS,'path');path.classList.add('anno-stroke');svg.append(path);preview.append(svg);
  let end=start;dragging=true;
  const paint=()=>{
   const i=all.indexOf(start),j=all.indexOf(end),lines=all.slice(Math.min(i,j),Math.max(i,j)+1),ink=inkOf(lines),at=local();
   for(const line of all)line.classList.toggle('anno-covered',lines.includes(line));
   const y1=at.y(ink.top)+1,y2=Math.max(at.y(ink.bottom)-1,y1+14),x=at.x(ink.right)+12;
   preview.style.cssText=`left:${x}px;top:${y1}px;width:12px;height:${y2-y1}px`;svg.setAttribute('width','14');svg.setAttribute('height',String(y2-y1+2));path.setAttribute('d',bracePath(1,1,y2-y1+1,12));
   if(!preview.isConnected)layer.append(preview);layer.hidden=false;
  };
  paint();
  follow(event,(ddx,ddy,ev)=>{const near=lineNear(all,ev.clientY);if(near)end=near;paint()},()=>{
   dragging=false;preview.remove();for(const line of all)line.classList.remove('anno-covered');control.hidden=true;
   const i=all.indexOf(start),j=all.indexOf(end);group(all[Math.min(i,j)],all[Math.max(i,j)]);
  });
 });

 // ── Blank space: a click beside the text starts a side note, a drag draws a box ──────────────────────────────
 let drawingBox=false;   // ⌘⇧B or "Box" in Mark up: the next drag draws a box anywhere, even over the text
 function boxMode(on){
  const was=drawingBox;drawingBox=on;document.body.classList.toggle('anno-drawing',on);
  if(on){control.hidden=true;toast('Drag to draw a box · Esc to cancel')}else if(was)document.querySelector('#toast')?.classList.remove('show');
 }
 article.addEventListener('pointerdown',event=>{
  if(event.button!==0||!visible())return;
  // While drawing a box on purpose, anywhere on the page will do (over text, over a block's own tools), except an
  // existing drawing and the format bar.
  const free=drawingBox&&!event.target.closest?.('.anno,#format-bar');
  if(!free&&!blankAt(event))return;
  event.preventDefault();if(free)event.stopPropagation();
  const at=local(),origin={x:at.x(event.clientX),y:at.y(event.clientY)},beside=textBeside(event);
  const preview=el('div',undefined,'anno anno-box anno-preview');const frame=el('div',undefined,'anno-frame');preview.append(frame);
  follow(event,(ddx,ddy,ev)=>{
   const x=at.x(ev.clientX),y=at.y(ev.clientY);
   preview.style.cssText=`left:${Math.min(x,origin.x)}px;top:${Math.min(y,origin.y)}px`;frame.style.cssText=`width:${Math.abs(x-origin.x)}px;min-height:${Math.abs(y-origin.y)}px`;
   if(!preview.isConnected)layer.append(preview);layer.hidden=false;
  },(moved,ev)=>{
   preview.remove();const wasDrawing=drawingBox;boxMode(false);
   if(moved){
    const w=Math.abs(at.x(ev.clientX)-origin.x),h=Math.abs(at.y(ev.clientY)-origin.y);
    if(w>=24&&h>=16)boxAt(Math.min(ev.clientX,event.clientX),Math.min(ev.clientY,event.clientY),Math.max(w,60),Math.max(h,32));
   }else if(!wasDrawing&&beside)bubbleAt(event.clientX,event.clientY-10,null);
  });
 },true);
 document.addEventListener('keydown',event=>{
  if(drawingBox&&event.key==='Escape'){event.preventDefault();boxMode(false);return}
  const mod=mac?event.metaKey&&!event.ctrlKey:event.ctrlKey&&!event.metaKey;if(!mod||event.altKey||!visible()||document.querySelector('dialog[open]'))return;
  if(event.code==='BracketRight'&&event.shiftKey){if(groupSelection()){event.preventDefault();event.stopImmediatePropagation()}}
  else if(event.code==='Quote'&&!event.shiftKey){const line=lineOf(getSelection()?.anchorNode);if(line){event.preventDefault();event.stopImmediatePropagation();sideNote(line)}}
  else if(event.code==='KeyB'&&event.shiftKey){event.preventDefault();event.stopImmediatePropagation();boxMode(!drawingBox)}
 },true);
 function sideNote(line){const ink=inkOf([line]);bubbleAt(ink.right+28,ink.top,line)}

 // ── Keeping drawings beside their lines ─────────────────────────────────────
 let queued=false;
 const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;draw()})};
 new MutationObserver(schedule).observe(root,{childList:true,subtree:true,characterData:true});
 const resized=new ResizeObserver(schedule);resized.observe(root);resized.observe(article);
 window.addEventListener('resize',schedule);document.fonts?.ready?.then(schedule);
 document.addEventListener('pointerdown',event=>{if(!event.target.closest?.('.anno'))for(const open of layer.querySelectorAll('.anno.open'))if(!open.contains(document.activeElement))open.classList.remove('open')},true);
 const reset=()=>{if(editing)finishEditing(false);control.hidden=true;if(drawingBox)boxMode(false)};
 new MutationObserver(()=>{reset();schedule()}).observe(document.body,{attributes:true,attributeFilter:['data-view']});
 const baseRender=render;render=function(){reset();baseRender();schedule()};
 const baseSetMode=setMode;setMode=function(next){reset();baseSetMode(next);schedule()};

 // ── Ways in: the selection toolbar, the line handle's menu, and "Mark up" in the format bar ──────────────────
 function addToolbarButton(){
  const tools=document.querySelector('#selection-tools');if(!tools)return false;
  if(!document.querySelector('#selection-group')){const b=el('button','Group }');b.type='button';b.id='selection-group';b.title='Group these lines with a brace and a note ('+cmd+'})';b.onmousedown=e=>e.preventDefault();b.onclick=()=>groupSelection();tools.append(b)}
  return true;
 }
 if(!addToolbarButton()){const watcher=new MutationObserver(()=>{if(addToolbarButton())watcher.disconnect()});watcher.observe(document.body,{childList:true})}
 (window.marginBlockMenuExtras??=[]).push((rich,item)=>item.matches('.equation,.procedure,table,hr')?[]:[['Side note','“',()=>sideNote(item)],['Brace this line','}',()=>group(item,item)]]);
 const bar=document.querySelector('#format-bar');
 if(bar){
  const markup=el('button','Mark up','format-markup');markup.type='button';markup.title='Write around your notes: braces, side notes and boxes';markup.setAttribute('aria-haspopup','menu');
  bar.append(markup);let menu=null;
  const close=()=>{menu?.remove();menu=null;markup.setAttribute('aria-expanded','false')};
  markup.onmousedown=e=>e.preventDefault();
  markup.onclick=()=>{
   if(menu){close();return}
   const line=lineOf(getSelection()?.anchorNode)||lineOf(document.querySelector('#editor .rich-text')?.lastElementChild);
   menu=el('div',undefined,'table-menu block-menu');menu.setAttribute('role','menu');
   for(const [name,mark,keys,run] of [['Brace the selected lines','}',cmd+'}',()=>{if(!groupSelection()&&line)group(line,line)}],['Side note beside this line','“',cmd+'\'',()=>line&&sideNote(line)],['Draw a box','▢',cmd+'⇧B',()=>boxMode(true)]]){
    const row=el('button',undefined);row.type='button';row.setAttribute('role','menuitem');
    row.append(el('span',mark,'block-menu-mark'),document.createTextNode(name),el('kbd',keys,'anno-keys'));
    row.onmousedown=e=>e.preventDefault();row.onclick=()=>{close();run()};menu.append(row);
   }
   document.body.append(menu);markup.setAttribute('aria-expanded','true');
   const box=markup.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(box.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=(box.bottom+6)+'px';
   const away=e=>{if(e.type==='keydown'&&e.key!=='Escape')return;if(e.type==='pointerdown'&&(menu?.contains(e.target)||markup.contains(e.target)))return;close();for(const t of ['pointerdown','keydown'])window.removeEventListener(t,away,true)};
   for(const t of ['pointerdown','keydown'])window.addEventListener(t,away,true);
  };
 }
 window.marginAnnotations={draw,group,groupSelection,sideNote,boxMode};
})();
