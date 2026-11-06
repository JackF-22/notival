/* Drawing owns its input surface; text ranges supply the connection targets. */
(() => {
 const editor=document.querySelector('#editor'),scroller=document.querySelector('article');
 const bar=document.querySelector('#format-bar'),ns='http://www.w3.org/2000/svg';
 const toggle=document.createElement('button');
 toggle.id='connect-passages';toggle.textContent='Connect';toggle.title='Connect passages: draw a line between two parts of this note';toggle.setAttribute('aria-pressed','false');
 toggle.title='Draw between text lines, images, equations or cells · Escape exits';bar.append(toggle);
 const status=document.createElement('output');status.className='connection-input-status';status.hidden=true;bar.append(status);
 const surface=document.createElement('div');surface.id='connection-surface';surface.hidden=true;
 surface.setAttribute('aria-label','Draw connections over your note');surface.tabIndex=0;
 const canvas=document.createElement('canvas');canvas.className='connection-trail-canvas';canvas.setAttribute('aria-hidden','true');
 const badge=document.createElement('div');badge.className='connection-mode-badge';badge.textContent='DRAW CONNECTIONS';
 const caption=document.createElement('div');caption.className='connection-target-caption';
 surface.append(canvas,badge,caption);document.body.append(surface);
 const ctx=canvas.getContext('2d');
 const dialog=document.createElement('dialog');dialog.id='passage-connection-dialog';
 dialog.innerHTML='<form><h2>Connect these thoughts</h2><p class="connection-from"></p><div class="connection-field"><span class="connection-field-label" id="connection-field-label">Relationship</span><div class="connection-tools" role="toolbar" aria-label="Format relationship"></div><div class="connection-editor"></div><small>Write as much as you need. Format with ⌘B, ⌘I, lists, links or equations · ⌘↵ saves</small></div><p class="connection-to"></p><div class="project-dialog-actions"><button type="button" class="connection-delete" hidden>Delete connection</button><span class="connection-spacer"></span><button type="button" class="connection-cancel">Cancel</button><button class="primary" type="submit">Add connection</button></div></form>';
 document.body.append(dialog);
 // The relationship is rich text, so a connection can be as long and detailed as it needs to be.
 const draft={id:'connection-draft',type:'text',text:'',html:''},editorHost=dialog.querySelector('.connection-editor'),tools=dialog.querySelector('.connection-tools');
 let relationEditor=null;
 function openRelationEditor(link){
  draft.html=link?.html||'';draft.text=link?.text||link?.label||'';
  editorHost.replaceChildren();relationEditor=RichEditor.mount(draft,editorHost,()=>{});
  relationEditor.setAttribute('aria-labelledby','connection-field-label');
  relationEditor.addEventListener('keydown',event=>{
   if(event.isComposing||!(event.metaKey||event.ctrlKey)||event.altKey)return;
   const command={KeyB:'bold',KeyI:'italic',KeyU:'underline'}[event.code];
   if(command&&!event.shiftKey){event.preventDefault();event.stopPropagation();RichEditor.command(command);}
   else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();dialog.querySelector('form').requestSubmit();}
  });
 }
 for(const [label,command,title] of [['B','bold','Bold (⌘B)'],['I','italic','Italic (⌘I)'],['U','underline','Underline (⌘U)'],['≡','insertUnorderedList','Bulleted list'],['1.','insertOrderedList','Numbered list'],['❞','quote','Quote'],['↗','link','Link'],['ƒx','inlineequation','Inline equation']]){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.title=title;button.setAttribute('aria-label',title);
  button.onmousedown=event=>event.preventDefault();button.onclick=()=>{relationEditor.focus();RichEditor.command(command);};tools.append(button);
 }
 let enabled=false,sessionNote=null,source=null,hover=null,drag=null,pending=null,pointer=null,points=[],frame=0;
 let targets=[],dirty=true,area={left:0,top:0,width:0,height:0},cacheScroll=0;
 const editable=new Map();
 const textOf=el=>el.matches('img')?(el.alt||'Image'):el.matches('.equation')?(el.dataset.equation||'Equation'):el.matches('hr')?'Divider':(el.matches('textarea')?el.value:el.textContent).trim();
 const kindOf=el=>el.matches('img')?'Image':el.matches('.equation')?'Equation':el.matches('hr')?'Divider':el.matches('td,th')?'Table cell':el.matches('textarea')?'Code':el.matches('h1,h2,h3,h4,h5,h6')?'Heading':'Text line';
 const same=(a,b)=>!!a&&!!b&&a.el===b.el&&a.start===b.start&&a.end===b.end;
 function bounds(item){return item.range?item.range.getBoundingClientRect():item.el.getBoundingClientRect()}
 function announce(message){status.textContent=message;caption.textContent=message}
 function reset(){source=hover=drag=pending=pointer=null;points=[];cancelAnimationFrame(frame);frame=0;editor.querySelectorAll('.connection-origin,.connection-target').forEach(el=>el.classList.remove('connection-origin','connection-target'));paint()}
 function layout(){
  if(!enabled)return;
  if(current()!==sessionNote||mode!=='write'||scroller.hidden||document.body.dataset.view!=='note'){enable(false);return}
  const r=scroller.getBoundingClientRect(),b=bar.getBoundingClientRect();
  // Stay within the writing column, never over the context or outline rail beside it.
  const column=(document.querySelector('#note-column')||editor).getBoundingClientRect();
  const top=Math.max(0,r.top,b.bottom),left=Math.max(0,r.left,column.left),right=Math.min(innerWidth,r.right,column.right),bottom=Math.min(innerHeight,r.bottom);
  area={left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
  Object.assign(surface.style,{left:left+'px',top:top+'px',width:area.width+'px',height:area.height+'px'});
  const ratio=devicePixelRatio||1,w=Math.round(area.width*ratio),h=Math.round(area.height*ratio);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;dirty=true}
  paint();
 }
 function enable(value){
  if(value&&(!current()||mode!=='write'))return;
  enabled=value;reset();sessionNote=value?current():null;surface.hidden=!value;status.hidden=!value;
  toggle.textContent=value?'Done connecting':'Connect';toggle.setAttribute('aria-pressed',String(value));
  document.body.classList.toggle('drawing-connections',value);editor.classList.toggle('connecting',value);
  if(value){
   getSelection()?.removeAllRanges();
   for(const el of editor.querySelectorAll('.rich-text,textarea')){editable.set(el,{content:el.getAttribute('contenteditable'),readonly:el.readOnly});if(el.matches('.rich-text'))el.contentEditable='false';else el.readOnly=true}
   dirty=true;announce('Drag between two lines or features · or click, scroll, click');layout();surface.focus({preventScroll:true});
   requestAnimationFrame(()=>{layout();buildTargets();paint()});
  }else{
   for(const [el,old] of editable){if(old.content===null)el.removeAttribute('contenteditable');else el.setAttribute('contenteditable',old.content);if(el.matches('textarea'))el.readOnly=old.readonly}editable.clear();
   if(dialog.open)dialog.close();
  }
 }
 toggle.onmousedown=e=>e.preventDefault();toggle.onclick=()=>enable(!enabled);
 // Cache actual visual lines. Inline formatting remains intact; entering drawing mode never rewrites the note.
 function buildTargets(){
  if(!dirty&&cacheScroll===scroller.scrollTop)return;
  targets=[];cacheScroll=scroller.scrollTop;dirty=false;
  const note=current();if(!note)return;
  [...editor.children].forEach((wrap,index)=>{
   const block=note.blocks[index];if(!block)return;
   const rich=wrap.querySelector('.rich-text');
   if(!rich){const el=wrap.querySelector('textarea');if(el&&el.value.trim())targets.push({el,block,text:el.value.trim(),kind:'Code'});return}
   const features=[...rich.querySelectorAll('img,.equation,hr')];
   for(const el of features)targets.push({el,block,text:textOf(el),kind:kindOf(el)});
   const selector='p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th';
   const groups=new Map(),walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT);
   let textNode;
   while((textNode=walker.nextNode())){
    if(!textNode.textContent||textNode.parentElement.closest('.equation'))continue;
    const parent=textNode.parentElement.closest(selector),el=parent&&rich.contains(parent)?parent:rich;
    if(!groups.has(el))groups.set(el,[]);groups.get(el).push(textNode);
   }
   for(const [el,nodes] of groups){
    const er=el.getBoundingClientRect();if(er.bottom<area.top-80||er.top>area.top+area.height+80)continue;
    const lines=[];
    for(const node of nodes){
     const base=document.createRange();base.selectNodeContents(el);base.setEnd(node,0);const offset=base.toString().length;
     const range=document.createRange();range.selectNodeContents(node);
     const rects=[...range.getClientRects()].filter(r=>r.width&&r.height);
     function add(start,end,r){
      if(!r.width||!r.height||r.bottom<area.top-80||r.top>area.top+area.height+80)return;
      let line=lines.find(l=>Math.abs(l.y-(r.top+r.bottom)/2)<Math.min(8,r.height/3));
      if(!line){line={y:(r.top+r.bottom)/2,start:offset+start,end:offset+end,first:node,firstOffset:start,last:node,lastOffset:end};lines.push(line)}
      else{line.end=offset+end;line.last=node;line.lastOffset=end}
     }
     if(rects.length===1)add(0,node.length,rects[0]);
     else for(let i=0;i<node.length;i++){range.setStart(node,i);range.setEnd(node,i+1);add(i,i+1,range.getBoundingClientRect())}
    }
    for(const line of lines){
     const range=document.createRange();range.setStart(line.first,line.firstOffset);range.setEnd(line.last,line.lastOffset);
     const text=range.toString().trim();if(!text)continue;
     targets.push({el,block,range,text,start:line.start,end:line.end,whole:lines.length===1&&range.toString()===el.textContent,kind:kindOf(el)});
    }
   }
  });
 }
 function nearby(x,y){
  buildTargets();let best=null,score=32;
  for(const item of targets){
   const r=bounds(item);if(!r.width||!r.height||r.bottom<area.top||r.top>area.top+area.height)continue;
   const dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom);
   // Exact feature hits win over adjacent text; vertical distance separates adjacent text lines.
   const distance=Math.hypot(dx,dy*1.7)+(item.range?0.5:0);
   if(distance<score){score=distance;best=item}
  }return best;
 }
 function paint(){
  if(!ctx)return;
  const ratio=devicePixelRatio||1;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,canvas.width/ratio,canvas.height/ratio);
  if(!enabled)return;
  // Outline the glyphs' own boxes (one per line) rather than a padded block, so long lines never reach past the text.
  function highlight(item,color){
   if(!item)return;
   const rects=item.range?[...item.range.getClientRects()].filter(r=>r.width>0&&r.height>0):[bounds(item)];
   ctx.fillStyle=color+'28';ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.lineJoin='round';
   for(const r of rects){const x=r.left-area.left-1,y=r.top-area.top-0.5,w=r.width+2,h=r.height+1;ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,3):ctx.rect(x,y,w,h);ctx.fill();ctx.stroke()}
  }
  highlight(source,'#986cff');if(!same(source,hover))highlight(hover,'#12bfa4');
  let line=points.map(p=>({x:p.x-area.left,y:p.y-scroller.scrollTop-area.top}));
  if(source&&pointer&&!drag){const r=bounds(source);line=[{x:r.left-area.left+Math.min(r.width/2,16),y:Math.max(9,Math.min(area.height-9,r.top+r.height/2-area.top))},{x:pointer.x-area.left,y:pointer.y-area.top}]}
  if(line.length){
   ctx.beginPath();ctx.moveTo(line[0].x,line[0].y);for(const p of line.slice(1))ctx.lineTo(p.x,p.y);
   ctx.lineWidth=8;ctx.strokeStyle='#986cff30';ctx.lineCap=ctx.lineJoin='round';ctx.stroke();ctx.lineWidth=3.5;ctx.strokeStyle='#986cff';ctx.stroke();
   for(const p of [line[0],line[line.length-1]]){ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fillStyle='#986cff';ctx.fill()}
  }
  if(pointer){const x=pointer.x-area.left,y=pointer.y-area.top;ctx.beginPath();ctx.arc(x,y,hover?10:7,0,Math.PI*2);ctx.strokeStyle=hover?'#12bfa4':'#986cff';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#986cff';ctx.fillRect(x-2,y-2,4,4)}
 }
 function move(x,y){
  pointer={x,y};hover=nearby(x,y);
  if(drag){if(!source&&hover)source=hover;points.push({x,y:y+scroller.scrollTop});if(points.length>2400)points=points.filter((_,i)=>i%2===0)}
  announce(source?('From: '+source.text.slice(0,65)+' → '+(hover&&!same(source,hover)?hover.kind+': '+hover.text.slice(0,65):'choose another line or feature')):(hover?hover.kind+': '+hover.text.slice(0,110):'Move over a text line, image, equation or table cell'));
  paint();
 }
 function autoScroll(){
  if(!drag)return;
  const y=pointer.y,top=area.top+35,bottom=area.top+area.height-40;
  const speed=y<top?-Math.min(20,(top-y)/3):y>bottom?Math.min(20,(y-bottom)/3):0;
  if(speed){scroller.scrollTop+=speed;move(pointer.x,pointer.y)}
  frame=requestAnimationFrame(autoScroll);
 }
 function openDialog(link){
  const editing=!!link;
  dialog.querySelector('h2').textContent=editing?'Edit connection':'Connect these thoughts';
  dialog.querySelector('[type=submit]').textContent=editing?'Save connection':'Add connection';
  dialog.querySelector('.connection-delete').hidden=!editing;
  openRelationEditor(link);dialog.showModal();relationEditor.focus();
 }
 function connect(a,b){
  pending={note:current(),source:a,target:b};drag=null;cancelAnimationFrame(frame);
  dialog.querySelector('.connection-from').textContent=a.kind+': '+a.text;
  dialog.querySelector('.connection-to').textContent=b.kind+': '+b.text;
  openDialog(null);
 }
 surface.addEventListener('pointerdown',event=>{
  if(!enabled||pending||event.button!==0)return;event.preventDefault();event.stopPropagation();
  const hit=nearby(event.clientX,event.clientY);
  if(source&&hit&&!same(source,hit)){connect(source,hit);return}
  source=hit;points=[{x:event.clientX,y:event.clientY+scroller.scrollTop}];
  drag={id:event.pointerId,x:event.clientX,y:event.clientY};
  surface.setPointerCapture(event.pointerId);move(event.clientX,event.clientY);frame=requestAnimationFrame(autoScroll);
 });
 surface.addEventListener('pointermove',event=>{if(!enabled||pending)return;event.preventDefault();move(event.clientX,event.clientY)});
 surface.addEventListener('pointerup',event=>{
  if(!drag||event.pointerId!==drag.id)return;event.preventDefault();
  move(event.clientX,event.clientY);drag=null;cancelAnimationFrame(frame);
  if(surface.hasPointerCapture(event.pointerId))surface.releasePointerCapture(event.pointerId);
  if(source&&hover&&!same(source,hover)){connect(source,hover);return}
  announce(source?'First endpoint: '+source.text.slice(0,100)+' · click another target, or scroll to it':'No target here · start on a highlighted line or feature');paint();
 });
 surface.addEventListener('pointercancel',()=>{drag=null;cancelAnimationFrame(frame);paint()});
 // The browser can drop capture right after granting it. While the button is still down the drag goes on, so take capture back.
 surface.addEventListener('lostpointercapture',event=>{if(!drag)return;if(event.buttons){try{surface.setPointerCapture(event.pointerId)}catch{}return}drag=null;cancelAnimationFrame(frame);paint()});
 surface.addEventListener('pointerleave',()=>{if(!drag){hover=null;paint()}});
 surface.addEventListener('wheel',event=>{event.preventDefault();scroller.scrollTop+=event.deltaY;scroller.scrollLeft+=event.deltaX},{passive:false});
 surface.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','PageDown','PageUp'].includes(event.key)){event.preventDefault();scroller.scrollTop+=(event.key.endsWith('Down')?1:-1)*(event.key.startsWith('Page')?area.height*.8:48)}});
 window.addEventListener('blur',()=>{drag=null;cancelAnimationFrame(frame)});
 scroller.addEventListener('scroll',()=>{if(enabled){dirty=true;layout();if(pointer&&!pending)move(pointer.x,pointer.y)}});
 new ResizeObserver(()=>{dirty=true;if(enabled)layout()}).observe(scroller);
 new MutationObserver(()=>{dirty=true}).observe(editor,{childList:true,subtree:true,characterData:true});
 new MutationObserver(()=>{if(enabled&&(document.body.dataset.view!=='note'||mode!=='write'))enable(false)}).observe(document.body,{attributes:true,attributeFilter:['data-view','class']});
 window.addEventListener('resize',()=>{dirty=true;layout()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&enabled){event.preventDefault();enable(false);toggle.focus()}},true);
 dialog.querySelector('.connection-cancel').onclick=()=>dialog.close();
 dialog.querySelector('.connection-delete').onclick=()=>{const link=pending?.link,note=pending?.note;if(!link||!note)return;note.passageConnections=note.passageConnections.filter(l=>l!==link);persist();dialog.close();if(mode==='map')drawMap();toast('Connection removed');};
 dialog.addEventListener('close',()=>{const editing=pending?.link;if(pending&&!editing){reset();announce('Drag between two lines or features');surface.focus({preventScroll:true})}pending=null;});
 function anchor(item){
  const ref={blockId:item.block.id,kind:item.kind};
  if(!item.el.matches('textarea,.rich-text')){item.el.dataset.passageId ||= uid();ref.passageId=item.el.dataset.passageId}
  if(item.range){Object.assign(ref,{textStart:item.start,textEnd:item.end,quote:item.text,whole:item.whole})}
  const rich=item.el.closest('.rich-text');if(rich)item.block.html=RichEditor.cleanHTML(rich.innerHTML);
  return ref;
 }
 dialog.querySelector('form').onsubmit=event=>{
  event.preventDefault();if(!pending||current()!==pending.note)return;
  const plain=(relationEditor.innerText||relationEditor.textContent).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim(),hasContent=!!plain||!!relationEditor.querySelector('img,.equation');
  const detail={label:(plain||'relates to').replace(/\s+/g,' ').slice(0,160),plain:(plain||'relates to').slice(0,1200),html:hasContent?RichEditor.cleanHTML(relationEditor.innerHTML):'',text:hasContent?RichEditor.toMarkdown(relationEditor):''};
  if(pending.link){Object.assign(pending.link,detail);persist();dialog.close();if(mode==='map')drawMap();toast('Connection updated');return;}
  const {note,source:a,target:b}=pending,label=detail.label;
  note.nodes??=[];note.passageConnections??=[];
  function nodeFor(item){
   const ref=anchor(item);let node=note.nodes.find(n=>n.source?.blockId===ref.blockId&&n.source?.passageId===ref.passageId&&n.source?.textStart===ref.textStart&&n.source?.textEnd===ref.textEnd);
   if(!node){const root=ensureCenter(note);node={id:uid(),label:item.text.slice(0,120),source:ref,parent:root.id,...placeAround(note,root)};note.nodes.push(node)}return node;
  }
  const from=nodeFor(a),to=nodeFor(b),existing=note.passageConnections.find(l=>l.from===from.id&&l.to===to.id);
  if(existing)Object.assign(existing,detail);else note.passageConnections.push({id:uid(),from:from.id,to:to.id,...detail});
  persist();enable(false);setMode('map');toast('Connection added to this note’s mind map');
 };
 editor.addEventListener('input',()=>{
  const seen=new Set();for(const el of editor.querySelectorAll('[data-passage-id]')){if(seen.has(el.dataset.passageId))el.dataset.passageId=uid();seen.add(el.dataset.passageId)}
  const note=current();if(note)[...editor.children].forEach((wrap,i)=>{const rich=wrap.querySelector('.rich-text');if(rich&&note.blocks[i])note.blocks[i].html=RichEditor.cleanHTML(rich.innerHTML)});
 });
 const baseRender=render;render=function(...args){enable(false);return baseRender(...args)};
 const baseMode=setMode;setMode=function(next){if(next!=='write'&&enabled)enable(false);return baseMode(next)};
 function sync(note){
  for(const node of note.nodes||[]){
   if(!node.source)continue;const ref=node.source,block=note.blocks.find(b=>b.id===ref.blockId);let text=block?.text;
   if(block&&(ref.passageId||ref.textStart!==undefined)){
    const holder=document.createElement('div');holder.innerHTML=RichEditor.cleanHTML(block.html||RichEditor.fromMarkdown(block.text));
    const el=ref.passageId?[...holder.querySelectorAll('[data-passage-id]')].find(el=>el.dataset.passageId===ref.passageId):holder;
    text=el?textOf(el):null;
    if(el&&ref.textStart!==undefined&&!ref.whole){const full=el.textContent,index=full.indexOf(ref.quote);text=index>=0?ref.quote:full.slice(ref.textStart,ref.textEnd)}
   }
   node.sourceMissing=!text?.trim();if(!node.sourceMissing)node.label=text.trim().slice(0,120);
  }
 }
 const baseDraw=drawMap;drawMap=function(){const note=current();if(note){try{sync(note);tieToCenter(note)}catch(error){console.error('Mind map sync failed',error)}}baseDraw();if(note){if(settleMap(note))persist();renderConnectionList(note)}if(!note)return;[...document.querySelector('#nodes').children].forEach((el,i)=>{const node=note.nodes[i];el.dataset.nodeId=node?.id||'';el.classList.toggle('marked',marked.has('n:'+node?.id));if(node?.source){el.classList.remove('root');el.title=node.sourceMissing?'Source passage removed': 'Linked to note passage';el.classList.toggle('source-missing',!!node.sourceMissing);}});};
 const shortLabel=link=>link.label.length>32?link.label.slice(0,31)+'…':link.label;
 const nodeText=(note,id)=>note.nodes.find(n=>n.id===id)?.label||'';
 function editLink(link){const note=current();if(!note)return;pending={note,link};dialog.querySelector('.connection-from').textContent='From: '+nodeText(note,link.from);dialog.querySelector('.connection-to').textContent='To: '+nodeText(note,link.to);openDialog(link);}
 const sizeOf=(el)=>({w:el?.offsetWidth||130,h:el?.offsetHeight||44});
 // A mind map has a center. The note's own idea sits in the middle and every connected passage is tied to it.
 const centerOf=note=>note.nodes.find(n=>!n.parent&&!n.source);
 function ensureCenter(note){
  let root=centerOf(note);
  if(!root){
   const others=note.nodes;
   const cx=others.length?others.reduce((sum,n)=>sum+n.x+65,0)/others.length:580,cy=others.length?others.reduce((sum,n)=>sum+n.y+22,0)/others.length:440;
   root={id:'root',label:note.title||'Untitled note',x:Math.max(0,cx-65),y:Math.max(0,cy-22)};
   if(note.nodes.some(n=>n.id==='root'))root.id=uid();
   note.nodes.unshift(root);
  }
  return root;
 }
 function tieToCenter(note){
  if(!note.nodes.some(n=>n.source))return;
  const root=ensureCenter(note);
  if(root.id==='root')root.label=note.title||root.label||'Untitled note';
  for(const node of note.nodes)if(node.source&&!node.parent)node.parent=root.id;
 }
 // New passages fan out around the center instead of stacking in a grid.
 function placeAround(note,root){
  const count=note.nodes.filter(n=>n!==root).length,angle=count*2.399963-Math.PI/2,radius=350+Math.floor(count/6)*180;
  return {x:Math.max(0,root.x+Math.cos(angle)*radius),y:Math.max(0,root.y+Math.sin(angle)*radius*0.75)};
 }
 // ---- Connection lines and labels: draggable, with a right-click menu ----
 let linkMenu=null;
 function hideLinkMenu(){linkMenu?.remove();linkMenu=null}
 function showMenu(entries,x,y){
  hideLinkMenu();
  const menu=document.createElement('div');menu.className='table-menu';menu.setAttribute('role','menu');
  for(const entry of entries){
   if(!entry){menu.append(document.createElement('hr'));continue}
   const [label,run,danger]=entry,item=document.createElement('button');item.type='button';item.setAttribute('role','menuitem');item.textContent=label;if(danger)item.className='danger';item.onclick=()=>{hideLinkMenu();run()};menu.append(item);
  }
  document.body.append(menu);linkMenu=menu;
  menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';
  const close=event=>{if(event.type==='keydown'&&event.key!=='Escape')return;if(event.type==='pointerdown'&&menu.contains(event.target))return;hideLinkMenu();for(const type of ['pointerdown','keydown','wheel','blur'])window.removeEventListener(type,close,true)};
  for(const type of ['pointerdown','keydown','wheel','blur'])window.addEventListener(type,close,true);
 }
 // ---- ⌘-click selects several nodes and connections so they can be deleted together ----
 const marked=new Set();
 const markBar=document.createElement('div');markBar.className='map-selection';markBar.hidden=true;markBar.setAttribute('role','status');
 const markText=document.createElement('span'),markDelete=document.createElement('button'),markClear=document.createElement('button');
 markDelete.type=markClear.type='button';markDelete.className='danger';markDelete.textContent='Delete';markClear.textContent='Clear';
 markBar.append(markText,markDelete,markClear);document.querySelector('#canvas').append(markBar);
 const removable=(node)=>!!(node.source||node.parent);
 function paintMarks(){
  document.querySelectorAll('#nodes .map-node').forEach(el=>el.classList.toggle('marked',marked.has('n:'+el.dataset.nodeId)));
  document.querySelectorAll('[data-link-id]').forEach(el=>el.classList.toggle('marked',marked.has('l:'+el.dataset.linkId)));
  markBar.hidden=!marked.size;markText.textContent=marked.size+(marked.size===1?' item selected':' items selected');
 }
 function clearMarks(){if(marked.size){marked.clear();paintMarks()}}
 function toggleMark(key){marked.has(key)?marked.delete(key):marked.add(key);paintMarks()}
 function keyFor(target){
  const node=target.closest('.map-node');if(node)return 'n:'+node.dataset.nodeId;
  const link=target.closest('[data-link-id]');return link?'l:'+link.dataset.linkId:null;
 }
 function deleteMarked(){
  const note=current();if(!note||!marked.size)return;
  const snapshot=JSON.stringify({nodes:note.nodes,links:note.passageConnections||[]});
  const nodeIds=new Set(),linkIds=new Set();let kept=0;
  for(const key of marked){
   const id=key.slice(2);
   if(key[0]==='l')linkIds.add(id);
   else{const node=note.nodes.find(n=>n.id===id);if(node&&removable(node))nodeIds.add(id);else if(node)kept++}
  }
  const count=nodeIds.size+linkIds.size;
  if(!count){toast('The starting idea can’t be removed.');return}
  for(const node of note.nodes.filter(n=>nodeIds.has(n.id)))for(const child of note.nodes)if(child.parent===node.id)child.parent=nodeIds.has(node.parent)?undefined:node.parent;
  note.nodes=note.nodes.filter(n=>!nodeIds.has(n.id));
  note.passageConnections=(note.passageConnections||[]).filter(l=>!linkIds.has(l.id)&&!nodeIds.has(l.from)&&!nodeIds.has(l.to));
  marked.clear();selectedNode=null;persist();drawMap();paintMarks();
  offerUndo(`Removed ${count} ${count===1?'item':'items'}${kept?' (the starting idea stays)':''}`,()=>{const saved=JSON.parse(snapshot);note.nodes=saved.nodes;note.passageConnections=saved.links;persist();if(mode==='map')drawMap()});
 }
 markDelete.onclick=deleteMarked;markClear.onclick=clearMarks;
 const mapCanvas=document.querySelector('#canvas');
 mapCanvas.addEventListener('pointerdown',event=>{
  const key=keyFor(event.target);
  if(event.target.closest('.map-selection'))return;
  if(key&&(event.metaKey||event.ctrlKey||event.shiftKey)){event.preventDefault();event.stopPropagation();toggleMark(key);return}
  if(!key||!marked.has(key))clearMarks();
 },true);
 document.addEventListener('keydown',event=>{
  if(mode!=='map'||!marked.size||document.querySelector('dialog[open]')||event.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
  if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteMarked()}
  else if(event.key==='Escape')clearMarks();
 });
 mapCanvas.addEventListener('contextmenu',event=>{
  const key=keyFor(event.target);if(!key||event.defaultPrevented)return;
  if(key[0]!=='n')return;
  event.preventDefault();
  const node=current()?.nodes.find(n=>n.id===key.slice(2));if(!node)return;
  if(!marked.has(key)){marked.clear();marked.add(key);paintMarks()}
  const many=marked.size>1;
  showMenu([[many?`Delete ${marked.size} selected items`:'Delete this idea',deleteMarked,true]],event.clientX,event.clientY);
 });
 function showLinkMenu(link,x,y){
  const key='l:'+link.id;
  if(marked.size>1&&marked.has(key)){showMenu([[`Delete ${marked.size} selected items`,deleteMarked,true]],x,y);return}
  showMenu([
   ['Edit connection…',()=>editLink(link)],
   ['Reset line shape',()=>{delete link.bend;delete link.labelOffset;persist();drawMap()}],
   null,
   ['Delete connection',()=>{marked.clear();marked.add(key);deleteMarked()},true]
  ],x,y);
 }
 // Dragging a label moves it; dragging a line bends it. A press without movement opens the connection.
 function dragLink(event,link,kind){
  if(event.button!==0)return;
  event.preventDefault();event.stopPropagation();
  const view=window.marginMapView,start=view.toWorld(event.clientX,event.clientY),key=kind==='label'?'labelOffset':'bend',origin={dx:0,dy:0,...(link[key]||{})},gain=kind==='bend'?2:1;
  let moved=false;
  const move=e=>{
   if(!moved&&Math.hypot(e.clientX-event.clientX,e.clientY-event.clientY)<4)return;
   moved=true;const p=view.toWorld(e.clientX,e.clientY);
   link[key]={dx:origin.dx+(p.x-start.x)*gain,dy:origin.dy+(p.y-start.y)*gain};edges();
  };
  const done=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',done);document.removeEventListener('pointercancel',done);if(moved)persist();else editLink(link)};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',done);document.addEventListener('pointercancel',done);
 }
 const baseEdges=edges;edges=function(){
  baseEdges();const note=current();
  const els=[...document.querySelectorAll('#nodes .map-node')];
  // Draw the ties to the center from box middle to box middle, whatever size the boxes are.
  if(note&&els.length===note.nodes.length){
   const svg=document.querySelector('#edges');svg.replaceChildren();
   note.nodes.forEach((node,i)=>{
    const parentIndex=note.nodes.findIndex(p=>p.id===node.parent);if(parentIndex<0)return;
    const p=note.nodes[parentIndex],sp=sizeOf(els[parentIndex]),sn=sizeOf(els[i]);
    const line=document.createElementNS(ns,'path');line.setAttribute('d',`M ${p.x+sp.w/2} ${p.y+sp.h/2} L ${node.x+sn.w/2} ${node.y+sn.h/2}`);line.setAttribute('class','map-tie');svg.append(line);
   });
  }
  let layer=document.querySelector('#edge-labels');
  if(!layer){layer=document.createElement('div');layer.id='edge-labels';document.querySelector('#nodes').before(layer)}
  layer.replaceChildren();
  const placed=[];
  for(const link of note?.passageConnections||[]){
   const ai=note.nodes.findIndex(n=>n.id===link.from),bi=note.nodes.findIndex(n=>n.id===link.to);if(ai<0||bi<0)continue;
   const a=note.nodes[ai],b=note.nodes[bi],sa=sizeOf(els[ai]),sb=sizeOf(els[bi]);
   const ax=a.x+sa.w/2,ay=a.y+sa.h/2,bx=b.x+sb.w/2,by=b.y+sb.h/2,cx=(ax+bx)/2+(link.bend?.dx||0),cy=Math.min(ay,by)-25+(link.bend?.dy||0);
   const d=`M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
   const line=document.createElementNS(ns,'path');line.setAttribute('d',d);line.setAttribute('class','passage-edge'+(marked.has('l:'+link.id)?' marked':''));line.dataset.linkId=link.id;
   const hit=document.createElementNS(ns,'path');hit.setAttribute('d',d);hit.setAttribute('class','passage-edge-hit');hit.dataset.linkId=link.id;
   const full=link.plain||link.label;
   const title=document.createElementNS(ns,'title');title.textContent=full+' (drag to bend · click to edit · right-click for more)';hit.append(title);
   hit.addEventListener('pointerdown',event=>dragLink(event,link,'bend'));
   hit.addEventListener('contextmenu',event=>{event.preventDefault();showLinkMenu(link,event.clientX,event.clientY)});
   document.querySelector('#edges').append(line,hit);
   const chip=document.createElement('button');chip.type='button';chip.className='edge-chip'+(marked.has('l:'+link.id)?' marked':'');chip.dataset.linkId=link.id;chip.textContent=full;chip.title='Drag to move · click to read or edit · right-click for more';
   chip.addEventListener('pointerdown',event=>dragLink(event,link,'label'));
   chip.addEventListener('contextmenu',event=>{event.preventDefault();showLinkMenu(link,event.clientX,event.clientY)});
   chip.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();editLink(link)}});
   layer.append(chip);
   const mx=0.25*ax+0.5*cx+0.25*bx,my=0.25*ay+0.5*cy+0.25*by,cw=chip.offsetWidth,ch=chip.offsetHeight;
   let x=mx-cw/2,y=my-ch/2;
   if(link.labelOffset){x+=link.labelOffset.dx;y+=link.labelOffset.dy}
   else{
    // Unmoved labels sit on the middle of the line, nudged clear of boxes and other labels.
    const boxes=[...els.map((el,k)=>({x:note.nodes[k].x,y:note.nodes[k].y,w:el.offsetWidth,h:el.offsetHeight})),...placed];
    const free=(px,py)=>boxes.every(o=>px+cw+18<=o.x||o.x+o.w+18<=px||py+ch+18<=o.y||o.y+o.h+18<=py);
    if(!free(x,y)){outer:for(let step=1;step<=8;step++)for(const dy of [-1,1])for(const dx of [0,-1,1]){const px=x+dx*step*30,py=y+dy*step*(ch+14)*0.6;if(free(px,py)){x=px;y=py;break outer}}}
   }
   chip.style.left=x+'px';chip.style.top=y+'px';placed.push({x,y,w:cw,h:ch});
  }
 };
 window.marginTidyMap=()=>{const note=current();if(!note)return;for(const link of note.passageConnections||[]){delete link.bend;delete link.labelOffset}persist();drawMap()};
 // Keep boxes apart: whatever overlaps is moved to the nearest free spot, and the canvas grows to fit.
 function settleMap(note,keepId){
  const canvasEl=document.querySelector('#canvas'),els=[...document.querySelectorAll('#nodes .map-node')];
  if(!note||!canvasEl||!els.length||!els[0].offsetWidth||els.length!==note.nodes.length)return false;
  const gap=96,width=1e6,boxes=note.nodes.map((node,i)=>({node,w:els[i].offsetWidth,h:els[i].offsetHeight}));
  const order=[...boxes].sort((p,q)=>(q.node.id===keepId)-(p.node.id===keepId));
  const placed=[];let moved=false;
  const clash=(x,y,w,h)=>placed.some(o=>x<o.x+o.w+gap&&o.x<x+w+gap&&y<o.y+o.h+gap&&o.y<y+h+gap);
  for(const box of order){
   const {node,w,h}=box;let x=Math.max(0,Math.min(width-w,node.x)),y=Math.max(0,node.y);
   if(clash(x,y,w,h)){
    let best=null;
    for(let radius=20;radius<=1600&&!best;radius+=20){
     let bestDistance=Infinity;
     for(let dx=-radius;dx<=radius;dx+=20)for(let dy=-radius;dy<=radius;dy+=20){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
      const px=x+dx,py=y+dy;if(px<0||py<0||px+w>width||clash(px,py,w,h))continue;
      const distance=Math.hypot(dx,dy);if(distance<bestDistance){bestDistance=distance;best={x:px,y:py}}
     }
    }
    if(best){x=best.x;y=best.y}
   }
   if(Math.round(node.x)!==Math.round(x)||Math.round(node.y)!==Math.round(y))moved=true;
   node.x=x;node.y=y;placed.push({x,y,w,h});
  }
  els.forEach((el,i)=>{el.style.left=note.nodes[i].x+'px';el.style.top=note.nodes[i].y+'px'});
  edges();
  return moved;
 }
 window.marginSettleMap=(note,keepId)=>{if(settleMap(note,keepId))persist()};
 // Below the map, every connection is written out in full.
 function renderConnectionList(note){
  let list=document.querySelector('#connection-list');
  if(!list){list=document.createElement('section');list.id='connection-list';list.setAttribute('aria-label','Connections');document.querySelector('#map').append(list);}
  list.replaceChildren();
  const links=(note?.passageConnections||[]).filter(l=>note.nodes.some(n=>n.id===l.from)&&note.nodes.some(n=>n.id===l.to));
  if(!links.length){list.hidden=true;return;}
  list.hidden=false;
  const heading=document.createElement('h3');heading.textContent='Connections';list.append(heading);
  for(const link of links){
   const card=document.createElement('button');card.type='button';card.className='connection-card';card.onclick=()=>editLink(link);
   const route=document.createElement('strong');route.textContent=nodeText(note,link.from)+'  →  '+nodeText(note,link.to);
   const body=document.createElement('div');body.className='connection-card-body';
   body.innerHTML=RichEditor.cleanHTML(link.html||RichEditor.fromMarkdown(link.label));
   if(typeof katex!=='undefined')for(const item of body.querySelectorAll('.equation')){try{katex.render(item.dataset.equation||'',item,{displayMode:item.classList.contains('display-equation'),throwOnError:false,trust:false})}catch{}}
   card.append(route,body);list.append(card);
  }
 }
 const baseRemove=document.querySelector('#remove-node').onclick;document.querySelector('#remove-node').onclick=()=>{if(marked.size){deleteMarked();return}const note=current(),node=note?.nodes.find(n=>n.id===selectedNode);if(node?.source){note.nodes=note.nodes.filter(n=>n!==node);note.passageConnections=(note.passageConnections||[]).filter(l=>l.from!==node.id&&l.to!==node.id);selectedNode=null;persist();drawMap();}else baseRemove();};
})();
