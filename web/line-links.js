/* Linking two lines of a note as references to each other: a remark and the equation it's about, a definition and
   where it's used. Unlike connections, a link stays in the text and never appears on the mind map. Each linked line
   carries a small marker in the margin; hovering it lights up both ends, clicking it jumps between them. */
(()=>{
 const root=document.querySelector('#editor');if(!root)return;
 const mac=/Mac|iPhone|iPad/.test(navigator.platform);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n};
 const links=note=>(note.lineLinks??=[]);
 const visible=()=>document.body.dataset.view==='note'&&mode==='write'&&!root.hidden;

 // ── Lines ───────────────────────────────────────────────────────────────────
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
 // How the other end reads in a list: equations by their source, everything else by its own words.
 function describe(line){
  if(line.classList.contains('equation'))return {kind:'Equation',text:line.dataset.equation||''};
  const own=line.tagName==='LI'?[...line.childNodes].filter(n=>!(n.nodeType===1&&/^(UL|OL)$/.test(n.tagName))).map(n=>n.textContent).join(''):line.textContent;
  const kind=line.tagName==='LI'?'Bullet':/^H[1-6]$/.test(line.tagName)?'Heading':line.classList.contains('procedure')?'Procedure':'Line';
  return {kind,text:own.replace(/[\s​ ]+/g,' ').trim()||'(empty)'};
 }
 const shorten=(text,n=90)=>text.length>n?text.slice(0,n)+'…':text;
 // Pressing Enter copies a line's attributes onto the new line; a linked line keeps its id and the copy gets none.
 root.addEventListener('input',()=>{
  const note=current();if(!note?.lineLinks?.length)return;
  const ends=new Set(note.lineLinks.flatMap(link=>[link.from,link.to])),seen=new Set();
  for(const node of root.querySelectorAll('[data-passage-id]')){const id=node.dataset.passageId;if(!ends.has(id))continue;if(seen.has(id))delete node.dataset.passageId;else seen.add(id)}
 },true);

 // ── Picking the other end ───────────────────────────────────────────────────
 let picking=null;
 const banner=el('div',undefined,'line-link-banner');banner.hidden=true;banner.setAttribute('role','status');document.body.append(banner);
 function start(source){
  if(!source||!current())return;
  stop();closePop();
  picking={source,candidate:null};source.classList.add('line-link-source');document.body.classList.add('linking-lines');
  banner.replaceChildren(el('span','Click the line or equation this refers to'),el('small','Esc to cancel'));banner.hidden=false;
 }
 function stop(){
  if(!picking)return;
  picking.source.classList.remove('line-link-source');picking.candidate?.classList.remove('line-link-candidate');
  document.body.classList.remove('linking-lines');banner.hidden=true;picking=null;
 }
 function finish(target){
  const {source}=picking,note=current();stop();
  if(!note||!target||target===source||source.contains(target)||target.contains(source)){toast('Pick a different line to link to');return}
  const from=idFor(source),to=idFor(target);
  if(links(note).some(link=>(link.from===from&&link.to===to)||(link.from===to&&link.to===from))){toast('Those two are already linked');return}
  links(note).push({id:uid(),from,to,created:Date.now()});persist();draw();
  for(const line of [source,target])pulse(line);
  toast('Linked. Hover the ↔ in the margin to see both ends');
 }
 root.addEventListener('mousemove',event=>{
  if(!picking)return;
  const line=lineAt(event.target),next=line&&line!==picking.source?line:null;
  if(next===picking.candidate)return;
  picking.candidate?.classList.remove('line-link-candidate');picking.candidate=next;next?.classList.add('line-link-candidate');
 });
 // While picking, a click chooses a line rather than placing the caret or opening an equation.
 for(const type of ['pointerdown','mousedown','click','dblclick'])document.addEventListener(type,event=>{
  if(!picking)return;
  if(banner.contains(event.target))return;
  event.preventDefault();event.stopPropagation();
  if(type!=='click')return;
  const line=root.contains(event.target)?lineAt(event.target):null;
  if(line&&line!==picking.source)finish(line);else stop();
 },true);
 document.addEventListener('keydown',event=>{
  if(picking&&event.key==='Escape'){event.preventDefault();event.stopPropagation();stop();return}
  if(event.code!=='KeyL'||!event.shiftKey||event.altKey||!(mac?event.metaKey&&!event.ctrlKey:event.ctrlKey&&!event.metaKey))return;
  if(document.querySelector('dialog[open]')||!visible())return;
  const selected=root.querySelector('.equation.selected'),line=selected||lineAt(getSelection()?.anchorNode);
  if(!line)return;
  event.preventDefault();event.stopImmediatePropagation();start(line);
 },true);

 // ── Markers in the margin ───────────────────────────────────────────────────
 const layer=el('div',undefined,'line-link-layer');document.body.append(layer);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('line-link-curve');svg.setAttribute('aria-hidden','true');document.body.append(svg);
 let lit=null;
 // Every line with at least one link, with the links it has, in the order they appear in the note.
 function ends(note){
  const found=new Map();
  for(const link of note?.lineLinks||[]){
   const a=lineById(link.from),b=lineById(link.to);if(!a||!b)continue;
   for(const [line,other] of [[a,b],[b,a]]){if(!found.has(line))found.set(line,[]);found.get(line).push({link,other})}
  }
  return found;
 }
 function marginOf(line){
  const rich=line.closest('.rich-text'),column=line.closest('.col');
  return (column||rich).getBoundingClientRect().right+6;
 }
 function draw(){
  const note=current();layer.replaceChildren();
  if(!note||!visible()||!note.lineLinks?.length){unlight();return}
  const scroller=root.closest('article')?.getBoundingClientRect()||{top:0,bottom:innerHeight};
  for(const [line,list] of ends(note)){
   const box=line.getBoundingClientRect();if(!box.height||box.bottom<scroller.top||box.top>scroller.bottom)continue;
   const marker=el('button',list.length>1?'↔ '+list.length:'↔','line-link-marker');marker.type='button';
   marker.title=list.length>1?'Linked to '+list.length+' lines':'Linked to: '+shorten(describe(list[0].other).text,60);
   marker.setAttribute('aria-label',marker.title);
   const lineHeight=parseFloat(getComputedStyle(line).lineHeight)||22;
   Object.assign(marker.style,{left:marginOf(line)+'px',top:(box.top+Math.max(0,(Math.min(lineHeight,box.height)-20)/2))+'px'});
   marker.onmouseenter=()=>light(line,list.map(item=>item.other));marker.onmouseleave=unlight;
   marker.onfocus=()=>light(line,list.map(item=>item.other));marker.onblur=unlight;
   marker.onmousedown=event=>event.preventDefault();
   marker.onclick=()=>!pop.hidden&&popFor===line?closePop():openPop(line,list,marker);
   layer.append(marker);
  }
  if(lit)light(...lit);
 }
 // Light up both ends and draw a curve between them in the margin, so a link to something far above is easy to follow.
 function light(line,others){
  unlight(false);lit=[line,others];
  for(const node of [line,...others])node.classList.add('line-link-lit');
  const paths=[];const a=line.getBoundingClientRect(),x=marginOf(line)+20;
  for(const other of others){
   const b=other.getBoundingClientRect(),y1=a.top+Math.min(a.height,24)/2,y2=Math.max(4,Math.min(innerHeight-4,b.top+Math.min(b.height,24)/2)),bend=Math.min(48,20+Math.abs(y2-y1)/8);
   paths.push(`<path d="M ${x} ${y1} C ${x+bend} ${y1}, ${x+bend} ${y2}, ${x} ${y2}"/>`);
   if(b.bottom<0||b.top>innerHeight)paths.push(`<circle cx="${x}" cy="${y2}" r="3"/>`);
  }
  svg.innerHTML=paths.join('');svg.classList.add('shown');
 }
 function unlight(forget=true){
  for(const node of root.querySelectorAll('.line-link-lit'))node.classList.remove('line-link-lit');
  svg.classList.remove('shown');svg.replaceChildren();if(forget)lit=null;
 }
 function pulse(line){line.classList.remove('line-link-pulse');void line.offsetWidth;line.classList.add('line-link-pulse');setTimeout(()=>line.classList.remove('line-link-pulse'),1600)}
 function jump(line){line.scrollIntoView({block:'center',behavior:'smooth'});pulse(line)}

 // ── The list of links on a line ─────────────────────────────────────────────
 const pop=el('div',undefined,'line-link-pop');pop.hidden=true;pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Linked lines');document.body.append(pop);
 let popFor=null;
 function closePop(){pop.hidden=true;pop.replaceChildren();popFor=null}
 function openPop(line,list,marker){
  // Each linked line, with which way it is and what it says: click to go there, or unlink it.
  popFor=line;pop.replaceChildren(el('small',list.length>1?'Linked to '+list.length+' lines':'Linked to','line-link-label'));
  for(const {link,other} of list){
   const {kind,text}=describe(other),row=el('div',undefined,'line-link-row');
   const go=el('button',undefined,'line-link-go');go.type='button';go.title='Go to it';
   const above=other.compareDocumentPosition(line)&Node.DOCUMENT_POSITION_FOLLOWING;
   go.append(el('span',above?'↑':'↓','line-link-dir'),el('strong',kind),el('span',shorten(text),'line-link-text'));
   go.onclick=()=>{closePop();jump(other)};
   const cut=el('button','Unlink','line-link-unlink');cut.type='button';cut.title='Remove this link (the lines stay)';
   cut.onclick=()=>{const note=current();if(!note)return;note.lineLinks=links(note).filter(l=>l!==link);persist();closePop();draw()};
   row.append(go,cut);pop.append(row);
  }
  pop.hidden=false;
  const box=marker.getBoundingClientRect();
  pop.style.left=Math.max(12,Math.min(box.right-pop.offsetWidth,innerWidth-pop.offsetWidth-12))+'px';
  pop.style.top=(box.bottom+6+pop.offsetHeight<innerHeight-12?box.bottom+6:Math.max(12,box.top-pop.offsetHeight-6))+'px';
  pop.querySelector('.line-link-go')?.focus();
 }
 document.addEventListener('pointerdown',event=>{if(!pop.hidden&&!pop.contains(event.target)&&!event.target.closest?.('.line-link-marker'))closePop()},true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!pop.hidden){closePop()}});

 // ── Keeping markers in place ────────────────────────────────────────────────
 let queued=false;
 const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;draw()})};
 new MutationObserver(schedule).observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']});  // not class: lighting a line up must not redraw (and relight) it
 for(const type of ['scroll','resize'])window.addEventListener(type,()=>{schedule();if(!pop.hidden)closePop()},true);
 new MutationObserver(()=>{stop();closePop();schedule()}).observe(document.body,{attributes:true,attributeFilter:['data-view']});
 const baseRender=render;render=function(){stop();closePop();baseRender();schedule()};
 const baseSetMode=setMode;setMode=function(next){stop();closePop();baseSetMode(next);schedule()};

 // In the line handle's menu, beside the column options.
 (window.marginBlockMenuExtras??=[]).push((rich,item)=>[['Link to another line…','↔',()=>start(item)]]);
 window.marginLineLinks={start,stop,draw,lineAt,picking:()=>!!picking};
})();
