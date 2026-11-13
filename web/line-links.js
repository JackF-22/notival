/* Linking words to another line of the same note: a remark and the equation it's about, a term and its definition.
   You choose the words; they read like a link. Hovering them previews what they point to, clicking goes there. The line pointed at carries a quiet marker in the margin leading back. Unlike connections, links stay in
   the text and never appear on the mind map. The words carry only <span data-line-link="id">; the rest is note.lineLinks. */
(()=>{
 const root=document.querySelector('#editor');if(!root)return;
 const mac=/Mac|iPhone|iPad/.test(navigator.platform);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n};
 const links=note=>(note.lineLinks??=[]);
 const visible=()=>document.body.dataset.view==='note'&&mode==='write'&&!root.hidden;
 const shorten=(text,n=90)=>text.length>n?text.slice(0,n)+'…':text;
 const tidy=text=>text.replace(/[\s​ ]+/g,' ').trim();

 // ── Lines and words ─────────────────────────────────────────────────────────
 // What a link can point at: an equation (display or inline), a bullet, or a line of the text or of one of its columns.
 function lineAt(node){
  let at=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;const rich=at?.closest?.('#editor .rich-text');if(!rich)return null;
  const equation=at.closest('.equation');if(equation&&rich.contains(equation))return equation;
  const item=at.closest('li');if(item&&rich.contains(item))return item;
  while(at&&at.parentElement!==rich&&!at.parentElement?.classList.contains('col'))at=at.parentElement;
  if(!at||at===rich||at.matches('.cols,.col,ul,ol'))return null;
  return at;
 }
 const lineById=id=>id?[...root.querySelectorAll('[data-passage-id]')].find(n=>n.dataset.passageId===id)||null:null;
 function idFor(line){
  if(!line.dataset.passageId){line.dataset.passageId=uid();line.closest('.rich-text')?.dispatchEvent(new Event('input',{bubbles:true}))}
  return line.dataset.passageId;
 }
 const words=id=>[...root.querySelectorAll('[data-line-link]')].filter(span=>span.dataset.lineLink===id);
 // The linked words of a link (links made before words could be chosen point from a whole line).
 const sourceOf=link=>{const found=words(link.id);if(found.length)return found;const line=lineById(link.from);return line?[line]:[]};
 const target=link=>lineById(link.to);
 // How the other end reads: equations by their source, everything else by its own words.
 function describe(line){
  if(line.classList.contains('equation'))return {kind:'Equation',text:line.dataset.equation||''};
  const own=line.tagName==='LI'?[...line.childNodes].filter(n=>!(n.nodeType===1&&/^(UL|OL)$/.test(n.tagName))).map(n=>n.textContent).join(''):line.textContent;
  const kind=line.tagName==='LI'?'Bullet':/^H[1-6]$/.test(line.tagName)?'Heading':line.classList.contains('procedure')?'Procedure':'Line';
  return {kind,text:tidy(own)||'(empty)'};
 }
 // Pressing Enter copies a line's attributes onto the new line; the line pointed at keeps its id and the copy gets none.
 root.addEventListener('input',()=>{
  const note=current();if(!note?.lineLinks?.length)return;
  const ends=new Set(note.lineLinks.flatMap(link=>[link.from,link.to]).filter(Boolean)),seen=new Set();
  for(const node of root.querySelectorAll('[data-passage-id]')){const id=node.dataset.passageId;if(!ends.has(id))continue;if(seen.has(id))delete node.dataset.passageId;else seen.add(id)}
 },true);

 // Wrap the chosen words, a piece per text node so formatting inside them is kept. Equations inside are left out.
 function wrap(range,id){
  const holder=range.commonAncestorContainer.nodeType===Node.TEXT_NODE?range.commonAncestorContainer.parentNode:range.commonAncestorContainer;
  const walker=document.createTreeWalker(holder,NodeFilter.SHOW_TEXT),found=[];
  for(let n=walker.nextNode();n;n=walker.nextNode())if(range.intersectsNode(n)&&n.nodeValue.trim()&&!n.parentElement.closest('.equation,[data-line-link]'))found.push(n);
  if(!found.length&&range.commonAncestorContainer.nodeType===Node.TEXT_NODE)found.push(range.commonAncestorContainer);
  const made=[];
  for(const node of found){
   const start=node===range.startContainer?range.startOffset:0,end=node===range.endContainer?range.endOffset:node.length;if(end<=start)continue;
   let piece=node;if(start>0)piece=node.splitText(start);if(end-start<piece.length)piece.splitText(end-start);
   const span=document.createElement('span');span.dataset.lineLink=id;piece.replaceWith(span);span.append(piece);made.push(span);
  }
  return made;
 }
 function unwrap(spans){const parents=new Set();for(const span of spans){parents.add(span.closest('.rich-text'));span.replaceWith(...span.childNodes)}for(const rich of parents)if(rich){rich.normalize();rich.dispatchEvent(new Event('input',{bubbles:true}))}}
 // A whole line's own words, for linking from the line handle or with the caret on a line.
 function lineRange(line){
  if(!line||line.classList.contains('equation'))return null;
  const range=document.createRange();range.selectNodeContents(line);
  const nested=line.tagName==='LI'?[...line.children].find(n=>/^(UL|OL)$/.test(n.tagName)):null;if(nested)range.setEndBefore(nested);
  return tidy(range.toString())?range:null;
 }

 // ── Choosing the words, then what they point to ─────────────────────────────
 let picking=null;
 const banner=el('div',undefined,'line-link-banner');banner.hidden=true;banner.setAttribute('role','status');document.body.append(banner);
 function start(range){
  if(!current()||!visible())return;
  const rich=(range?.commonAncestorContainer.nodeType===Node.ELEMENT_NODE?range.commonAncestorContainer:range?.commonAncestorContainer.parentElement)?.closest('#editor .rich-text');
  if(!range||range.collapsed||!rich||!tidy(range.toString())){toast('Select the words you want to link first');return}
  stop();closePop();
  const id=uid(),spans=wrap(range,id);if(!spans.length){toast('Select some words (not just an equation) to link');return}
  getSelection().removeAllRanges();
  for(const span of spans)span.classList.add('line-link-source');
  picking={id,spans,rich,candidate:null};document.body.classList.add('linking-lines');
  banner.replaceChildren(el('span','Now click the line or equation “'+shorten(tidy(spans.map(s=>s.textContent).join('')),40)+'” refers to'),el('small','Esc to cancel'));banner.hidden=false;
 }
 function stop(keep=false){
  if(!picking)return;
  const {spans}=picking;picking.candidate?.classList.remove('line-link-candidate');
  for(const span of spans)span.classList.remove('line-link-source');
  if(!keep){const parents=new Set(spans.map(s=>s.parentNode));for(const span of spans)if(span.isConnected)span.replaceWith(...span.childNodes);for(const p of parents)p?.normalize?.()}
  document.body.classList.remove('linking-lines');banner.hidden=true;picking=null;
 }
 function finish(line){
  const {id,spans,rich}=picking,note=current();
  if(!note||!line||spans.some(span=>line.contains(span))){toast('Pick a different line, not the one these words are on');return}
  stop(true);
  links(note).push({id,to:idFor(line),created:Date.now()});
  rich.dispatchEvent(new Event('input',{bubbles:true}));persist();schedule();
  pulse(line);for(const span of spans)pulse(span);
 }
 root.addEventListener('mousemove',event=>{
  if(!picking)return;
  const line=lineAt(event.target),next=line&&!picking.spans.some(span=>line.contains(span))?line:null;
  if(next===picking.candidate)return;
  picking.candidate?.classList.remove('line-link-candidate');picking.candidate=next;next?.classList.add('line-link-candidate');
 });
 // While picking, a click chooses a line rather than placing the caret or opening an equation.
 for(const type of ['pointerdown','mousedown','click','dblclick'])document.addEventListener(type,event=>{
  if(!picking||banner.contains(event.target))return;
  event.preventDefault();event.stopPropagation();
  if(type!=='click')return;
  const line=root.contains(event.target)?lineAt(event.target):null;
  if(line)finish(line);else stop();
 },true);
 const fromSelection=()=>{
  const selection=getSelection();if(!selection?.rangeCount)return null;
  const range=selection.getRangeAt(0);
  return range.collapsed?lineRange(lineAt(range.startContainer)):range.cloneRange();
 };
 document.addEventListener('keydown',event=>{
  if(picking&&event.key==='Escape'){event.preventDefault();event.stopPropagation();stop();return}
  if(event.code!=='KeyL'||!event.shiftKey||event.altKey||!(mac?event.metaKey&&!event.ctrlKey:event.ctrlKey&&!event.metaKey))return;
  if(document.querySelector('dialog[open]')||!visible())return;
  event.preventDefault();event.stopImmediatePropagation();start(fromSelection());
 },true);

 const pop=el('div',undefined,'line-link-pop');pop.hidden=true;pop.setAttribute('role','dialog');document.body.append(pop);
 let popFor=null;
 // ── Hovering and clicking linked words ──────────────────────────────────────
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('line-link-curve');svg.setAttribute('aria-hidden','true');document.body.append(svg);
 const linkOf=id=>current()?.lineLinks?.find(link=>link.id===id);
 const marginOf=node=>((node.closest('.col')||node.closest('.rich-text'))?.getBoundingClientRect().right||0)+6;
 // Light up both ends and draw a curve between them in the margin, so a link to something far above is easy to follow.
 function light(from,to){
  unlight();
  for(const node of [...from,...to])node.classList.add('line-link-lit');
  const anchor=from.at(-1)?.getBoundingClientRect(),x=Math.max(...[...from,...to].map(marginOf))+16,paths=[];if(!anchor)return;
  const y1=anchor.top+anchor.height/2;
  for(const node of to){
   const b=node.getBoundingClientRect(),y2=Math.max(4,Math.min(innerHeight-4,b.top+Math.min(b.height,24)/2)),bend=Math.min(48,20+Math.abs(y2-y1)/8);
   paths.push(`<path d="M ${anchor.right+4} ${y1} L ${x} ${y1} C ${x+bend} ${y1}, ${x+bend} ${y2}, ${x} ${y2} L ${Math.min(x,b.right+4)} ${y2}"/>`);
   if(b.bottom<0||b.top>innerHeight)paths.push(`<circle cx="${x}" cy="${y2}" r="3"/>`);
  }
  svg.innerHTML=paths.join('');svg.classList.add('shown');
 }
 function unlight(){for(const node of document.querySelectorAll('.line-link-lit'))node.classList.remove('line-link-lit');svg.classList.remove('shown');svg.replaceChildren()}
 const pulses=new WeakMap();  // one timer per line, so a fresh flash is never cut short by an earlier one
 function pulse(node){clearTimeout(pulses.get(node));node.classList.remove('line-link-pulse');void node.offsetWidth;node.classList.add('line-link-pulse');pulses.set(node,setTimeout(()=>node.classList.remove('line-link-pulse'),1600))}
 // Hovering the words lights up both ends and, after a moment, shows a preview of what they point to. The preview
 // stays while the pointer moves onto it, so its buttons can be reached.
 let hoverTimer=0,leaveTimer=0;
 root.addEventListener('mouseover',event=>{
  if(picking)return;const span=event.target.closest?.('[data-line-link]');const link=span&&linkOf(span.dataset.lineLink);if(!link)return;
  clearTimeout(leaveTimer);const to=target(link);if(to)light(words(link.id),[to]);
  if(popFor===span&&!pop.hidden)return;
  clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>{if(span.isConnected&&span.matches(':hover'))card(link,span,true)},280);
 });
 const leave=()=>{clearTimeout(hoverTimer);clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>{if(pop.matches(':hover'))return;if(pop.dataset.hover)closePop();unlight()},220)};
 root.addEventListener('mouseout',event=>{const span=event.target.closest?.('[data-line-link]');if(span&&!span.contains(event.relatedTarget))leave()});
 pop.addEventListener('mouseenter',()=>clearTimeout(leaveTimer));pop.addEventListener('mouseleave',()=>{if(pop.dataset.hover)leave()});

 // A click on the words goes to what they point to. ⌥-click (or selecting) leaves the caret in them for editing.
 root.addEventListener('click',event=>{
  if(picking||event.altKey)return;const span=event.target.closest?.('[data-line-link]');const link=span&&linkOf(span.dataset.lineLink);if(!link)return;
  if(!getSelection().isCollapsed)return;
  event.preventDefault();clearTimeout(hoverTimer);closePop();
  const to=target(link);if(to)go(to,link);else card(link,span);
 });

 // ── The card under linked words, and the list on the line they point to ─────
 function closePop(){pop.hidden=true;pop.replaceChildren();popFor=null;delete pop.dataset.hover}
 function place(anchor){
  const box=anchor.getBoundingClientRect();pop.hidden=false;
  pop.style.left=Math.max(12,Math.min(box.left,innerWidth-pop.offsetWidth-12))+'px';
  pop.style.top=(box.bottom+6+pop.offsetHeight<innerHeight-12?box.bottom+6:Math.max(12,box.top-pop.offsetHeight-6))+'px';
 }
 function preview(line){
  // An equation is shown as it's typeset; anything else by its words.
  const rendered=line.classList.contains('equation')&&line.querySelector('.katex');
  if(rendered){const box=el('div',undefined,'line-link-preview line-link-math');box.append(rendered.cloneNode(true));return box}
  return el('div',shorten(describe(line).text,160),'line-link-preview');
 }
 function card(link,span,hover=false){
  const to=target(link);popFor=span;pop.replaceChildren();pop.setAttribute('aria-label','Linked to');
  if(hover)pop.dataset.hover='1';else delete pop.dataset.hover;
  if(!to){pop.append(el('small','Linked to','line-link-label'),el('p','What these words pointed to was deleted.','line-link-gone'))}
  else{const above=to.compareDocumentPosition(span)&Node.DOCUMENT_POSITION_FOLLOWING;pop.append(el('small',(above?'↑ ':'↓ ')+describe(to).kind+(above?' above':' below'),'line-link-label'),preview(to))}
  const row=el('div',undefined,'line-link-actions');
  if(to){const goTo=el('button','Go to it','primary');goTo.type='button';goTo.title='Clicking the words goes there too';goTo.onclick=()=>{closePop();go(to,link)};row.append(goTo)}
  const cut=el('button','Unlink','line-link-unlink');cut.type='button';cut.title='Remove the link (the words stay)';cut.onclick=()=>{closePop();remove(link)};row.append(cut);
  pop.append(row);place(span);if(!hover)pop.querySelector('button')?.focus({preventScroll:true});
 }
 function backlinks(line,list,marker){
  popFor=line;pop.replaceChildren(el('small',list.length>1?'Referred to from '+list.length+' places':'Referred to from','line-link-label'));pop.setAttribute('aria-label','Referred to from');
  for(const link of list){
   const from=sourceOf(link),row=el('div',undefined,'line-link-row');
   const goTo=el('button',undefined,'line-link-go');goTo.type='button';goTo.title='Go to it';
   const above=from[0]&&from[0].compareDocumentPosition(line)&Node.DOCUMENT_POSITION_FOLLOWING;
   goTo.append(el('span',above?'↑':'↓','line-link-dir'),el('span','“'+shorten(tidy(from.map(n=>n.textContent).join(' ')),70)+'”','line-link-text'));
   goTo.onclick=()=>{closePop();if(from[0])go(from[0],link,from)};
   const cut=el('button','Unlink','line-link-unlink');cut.type='button';cut.title='Remove the link (the words stay)';cut.onclick=()=>{closePop();remove(link)};
   row.append(goTo,cut);pop.append(row);
  }
  place(marker);pop.querySelector('button')?.focus({preventScroll:true});
 }
 function remove(link){
  const note=current();if(!note)return;
  note.lineLinks=links(note).filter(l=>l!==link);const spans=words(link.id);if(spans.length)unwrap(spans);
  persist();unlight();schedule();
 }
 document.addEventListener('pointerdown',event=>{if(!pop.hidden&&!pop.contains(event.target)&&!event.target.closest?.('.line-link-marker,[data-line-link]'))closePop()},true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!pop.hidden)closePop()});

 // Going to the other end, with a way back to where you were.
 const back=el('button',undefined,'line-link-back');back.type='button';back.hidden=true;document.body.append(back);let backTimer=0;
 function go(node,link,highlight=[node]){
  const from=highlight[0]===node&&words(link.id).includes(node)?null:words(link.id);
  node.scrollIntoView({block:'center',behavior:'smooth'});for(const n of highlight)pulse(n);
  const returnTo=from&&from.length?from:(()=>{const t=target(link);return t?[t]:[]})();
  clearTimeout(backTimer);
  if(!returnTo.length){back.hidden=true;return}
  back.textContent='↩ Back to “'+shorten(tidy(returnTo.map(n=>n.textContent).join(' '))||describe(returnTo[0]).text,36)+'”';
  back.onclick=()=>{back.hidden=true;returnTo[0].scrollIntoView({block:'center',behavior:'smooth'});for(const n of returnTo)pulse(n)};
  back.hidden=false;backTimer=setTimeout(()=>{back.hidden=true},9000);
 }

 // ── Markers on the lines pointed at ─────────────────────────────────────────
 const layer=el('div',undefined,'line-link-layer');document.body.append(layer);
 function draw(){
  layer.replaceChildren();const note=current();
  if(!note||!visible()||!note.lineLinks?.length)return;
  const scroller=root.closest('article')?.getBoundingClientRect()||{top:0,bottom:innerHeight};
  const pointedAt=new Map();
  for(const link of note.lineLinks){const to=target(link);if(!to||!sourceOf(link).length)continue;if(!pointedAt.has(to))pointedAt.set(to,[]);pointedAt.get(to).push(link)}
  for(const [line,list] of pointedAt){
   const box=line.getBoundingClientRect();if(!box.height||box.bottom<scroller.top||box.top>scroller.bottom)continue;
   const marker=el('button',list.length>1?'↩ '+list.length:'↩','line-link-marker');marker.type='button';
   marker.title=list.length>1?'Referred to from '+list.length+' places':'Referred to from “'+shorten(tidy(sourceOf(list[0]).map(n=>n.textContent).join(' ')),50)+'”';
   marker.setAttribute('aria-label',marker.title);
   const lineHeight=parseFloat(getComputedStyle(line).lineHeight)||22;
   Object.assign(marker.style,{left:marginOf(line)+'px',top:(box.top+Math.max(0,(Math.min(lineHeight,box.height)-20)/2))+'px'});
   marker.onmouseenter=marker.onfocus=()=>light(list.flatMap(sourceOf),[line]);marker.onmouseleave=marker.onblur=unlight;
   marker.onmousedown=event=>event.preventDefault();
   marker.onclick=()=>!pop.hidden&&popFor===line?closePop():backlinks(line,list,marker);
   layer.append(marker);
  }
 }

 // ── Keeping everything in place ─────────────────────────────────────────────
 let queued=false;
 const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;draw()})};
 // Not watching class: lighting a line up must not redraw (and relight) it.
 new MutationObserver(schedule).observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']});
 for(const type of ['scroll','resize'])window.addEventListener(type,()=>{schedule();if(!pop.hidden)closePop();if(svg.classList.contains('shown'))unlight()},true);
 const reset=()=>{stop();closePop();unlight();back.hidden=true};
 new MutationObserver(()=>{reset();schedule()}).observe(document.body,{attributes:true,attributeFilter:['data-view']});
 const baseRender=render;render=function(){reset();baseRender();schedule()};
 const baseSetMode=setMode;setMode=function(next){reset();baseSetMode(next);schedule()};

 // Entry points: the selection toolbar (for chosen words), the line handle (for a whole line), and ⌘⇧L.
 function addToolbarButton(){
  const tools=document.querySelector('#selection-tools');if(!tools)return false;
  if(!document.querySelector('#selection-link')){const b=el('button','Link to…');b.type='button';b.id='selection-link';b.title='Link these words to another line or equation ('+(mac?'⌘⇧L':'Ctrl+Shift+L')+')';b.onmousedown=e=>e.preventDefault();b.onclick=()=>start(fromSelection());tools.append(b)}
  return true;
 }
 if(!addToolbarButton()){const watcher=new MutationObserver(()=>{if(addToolbarButton())watcher.disconnect()});watcher.observe(document.body,{childList:true})}
 (window.marginBlockMenuExtras??=[]).push((rich,item)=>lineRange(item)?[['Link this line to…','↔',()=>start(lineRange(item))]]:[]);
 window.marginLineLinks={start,stop,draw,lineAt,picking:()=>!!picking};
})();
