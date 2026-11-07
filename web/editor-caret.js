/* A drawn caret: one height on every wrapped line, and a slant while italics are on. */
(()=>{
 const caret=document.createElement('div');caret.id='slant-caret';caret.setAttribute('aria-hidden','true');document.body.append(caret);
 let editor=null,frame=0,lastKey='';
 const hide=()=>{caret.style.display='none';if(editor)editor.removeAttribute('data-caret');editor=null};
 function rectAt(node,offset){
  const probe=document.createRange();
  const take=(a,b,side)=>{probe.setStart(a[0],a[1]);probe.setEnd(b[0],b[1]);const list=[...probe.getClientRects()].filter(r=>r.height>0&&(side==='left'||r.width>0));const r=side==='left'?list[0]:list.at(-1);return r?{x:side==='left'?r.left:r.right,top:r.top,height:r.height}:null};
  if(node.nodeType===Node.TEXT_NODE){
   const length=node.data.length;
   // Prefer the left edge of the next character: it lands on the right line at a soft wrap.
   const measured=(offset<length&&take([node,offset],[node,offset+1],'left'))||(offset>0&&take([node,offset-1],[node,offset],'right'));
   if(measured)return measured;
   // An empty or collapsed text node (the anchor beside an inline equation) has nothing to measure, so sit against the neighbouring element.
   const edge=(el,side)=>{const list=[...el.getClientRects()].filter(r=>r.height>0),r=side==='right'?list.at(-1):list[0];return r?{x:side==='right'?r.right:r.left,top:r.top,height:r.height}:null};
   const prev=node.previousSibling,next=node.nextSibling;
   if(offset===0&&prev?.nodeType===Node.ELEMENT_NODE&&prev.tagName!=='BR')return edge(prev,'right');
   if(offset===length&&next?.nodeType===Node.ELEMENT_NODE&&next.tagName!=='BR')return edge(next,'left');
   return null;
  }
  const child=node.childNodes[offset],before=node.childNodes[offset-1];
  // A caret sitting on a <br> (a new line inside a cell or paragraph) belongs where that line break is, not at the block's start.
  const lineHeight=el=>parseFloat(getComputedStyle(el).lineHeight)||(parseFloat(getComputedStyle(el).fontSize)||15)*1.5;
  if(child?.nodeName==='BR'){const r=child.getClientRects()[0];if(r&&(r.top||r.left)){const h=r.height||lineHeight(node);return {x:r.left,top:r.top,height:h}}}
  if(!child&&before?.nodeName==='BR'){
   // A <br> that only holds an empty line open (first child, or right after another <br>) does not start a new line.
   const previous=before.previousSibling,own=before.getClientRects()[0];
   if((!previous||previous.nodeName==='BR')&&own&&(own.top||own.left))return {x:own.left,top:own.top,height:own.height||lineHeight(node)};
   const r=before.getClientRects()[0],box=node.getBoundingClientRect(),cs=getComputedStyle(node),h=(r&&r.height)||lineHeight(node);
   if(r&&(r.top||r.left))return {x:box.left+(parseFloat(cs.paddingLeft)||0),top:r.top+h,height:h};
  }
  if(child?.nodeType===Node.TEXT_NODE&&child.data)return take([child,0],[child,1],'left');
  if(child?.nodeType===Node.ELEMENT_NODE&&child.tagName!=='BR'){const r=child.getClientRects()[0];if(r&&r.height)return {x:r.left,top:r.top,height:r.height}}
  if(before?.nodeType===Node.TEXT_NODE&&before.data)return take([before,before.data.length-1],[before,before.data.length],'right');
  if(before?.nodeType===Node.ELEMENT_NODE&&before.tagName!=='BR'){const r=before.getClientRects().item(before.getClientRects().length-1);if(r&&r.height)return {x:r.right,top:r.top,height:r.height}}
  return null;
 }
 function update(){
  frame=0;
  const selection=getSelection(),active=document.activeElement;
  if(!selection?.rangeCount||!selection.isCollapsed||!document.hasFocus()||!active?.classList?.contains('rich-text')||active.isContentEditable===false){hide();return}
  const range=selection.getRangeAt(0),anchor=range.startContainer,host=anchor.nodeType===Node.ELEMENT_NODE?anchor:anchor.parentElement;
  if(!host||!active.contains(host)||host.closest('.equation')){hide();return}
  const style=getComputedStyle(host),size=parseFloat(style.fontSize)||15,height=Math.round(size*1.25);
  let spot=rectAt(anchor,range.startOffset),x,top;
  if(spot){x=spot.x;top=spot.top+spot.height/2-height/2}
  else{
   // An empty line has no glyphs to measure, so use its box.
   const block=host.closest('p,h1,h2,h3,li,td,th,blockquote,div')||host,box=block.getBoundingClientRect(),cs=getComputedStyle(block);
   const lineHeight=parseFloat(cs.lineHeight)||size*1.7,align=cs.textAlign;
   x=box.left+(parseFloat(cs.paddingLeft)||0);
   if(align==='center')x=box.left+box.width/2;else if(align==='right'||align==='end')x=box.right-(parseFloat(cs.paddingRight)||0);
   top=box.top+(parseFloat(cs.paddingTop)||0)+(lineHeight-height)/2;
  }
  const bounds=(active.closest('article')||document.documentElement).getBoundingClientRect();
  if(top+height<bounds.top||top>Math.min(bounds.bottom,innerHeight)){hide();return}
  let italic=false;try{italic=document.queryCommandState('italic')}catch{}
  // A modal dialog lives in the top layer, above the page, so the caret must live inside it to be seen.
  const home=active.closest('dialog[open]')||document.body;if(caret.parentElement!==home)home.append(caret);
  editor=active;active.dataset.caret='drawn';
  caret.style.display='block';caret.style.height=height+'px';
  caret.style.transform=`translate(${(x-1).toFixed(1)}px,${top.toFixed(1)}px)${italic?' skewX(-14deg)':''}`;
  // Restart the blink whenever the caret moves, as native carets do.
  const key=x.toFixed(0)+','+top.toFixed(0)+italic;
  if(key!==lastKey){lastKey=key;caret.style.animation='none';void caret.offsetWidth;caret.style.animation=''}
 }
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};
 for(const type of ['selectionchange','input','keydown','keyup','mouseup','focusin','focusout','compositionend','resize'])document.addEventListener(type,schedule,true);
 window.addEventListener('resize',schedule);window.addEventListener('blur',schedule);window.addEventListener('focus',schedule);
 document.addEventListener('scroll',schedule,true);
})();
