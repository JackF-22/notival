/* Pictures and display equations can be picked up and put down anywhere in the note.
   A bar shows where it will land; for a picture the side of the note decides whether it sits left, centred or right. */
(()=>{
 const root=document.querySelector('#editor');if(!root)return;
 const SLOP=6;
 let drag=null,bar=null,ghost=null;
 const grabbable=target=>{
  const item=target.closest?.('.rich-text img, .rich-text .display-equation:not(.editing)');
  return item&&root.contains(item)?item:null;
 };
 const topOf=(editor,node)=>{let el=node;while(el&&el.parentElement!==editor)el=el.parentElement;return el};
 const isMedia=el=>el&&el.nodeType===Node.ELEMENT_NODE&&(el.tagName==='IMG'||el.classList.contains('equation'));
 const isBlank=el=>!el.textContent.replace(/[​ \s]/g,'')&&!el.querySelector('img,table,.equation,hr,input,li');
 // A picture standing alone in its line moves with that line; one inside a sentence is lifted out into a line of its own.
 const lineOf=picture=>{
  const holder=picture.parentElement;
  return holder&&/^(P|DIV)$/.test(holder.tagName)&&!holder.classList.contains('equation')&&!holder.classList.contains('col')&&!holder.classList.contains('cols')&&!holder.textContent.trim()&&holder.querySelectorAll('img').length===1?holder:null;
 };
 function zoneAt(editor,x){
  const box=editor.getBoundingClientRect(),share=(x-box.left)/Math.max(1,box.width);
  return share<.34?'left':share>.66?'right':'center';
 }
 function landing(editor,y,skip){
  const blocks=[...editor.children].filter(el=>el!==skip&&el.getBoundingClientRect().height>1&&!el.classList.contains('image-resizer'));
  if(!blocks.length)return null;
  let best=null,gap=Infinity;
  for(const block of blocks){
   const box=block.getBoundingClientRect(),away=y<box.top?box.top-y:y>box.bottom?y-box.bottom:0;
   if(away<gap){gap=away;best={block,before:y<(box.top+box.bottom)/2,box}}
  }
  return best;
 }
 function showBar(spot,zone,picture){
  if(!bar){bar=document.createElement('div');bar.className='move-drop';document.body.append(bar)}
  const editorBox=drag.editor.getBoundingClientRect(),top=(spot.before?spot.box.top:spot.box.bottom)-2;
  let left=editorBox.left,width=editorBox.width;
  if(picture){width=editorBox.width*(zone==='center'?.3:.34);left=zone==='left'?editorBox.left:zone==='right'?editorBox.right-width:editorBox.left+(editorBox.width-width)/2}
  Object.assign(bar.style,{left:left+'px',top:top+'px',width:width+'px',height:'4px',display:'block'});
 }
 function end(){
  document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',cancel,true);document.removeEventListener('keydown',key,true);
  document.body.classList.remove('block-moving');if(drag){drag.item.classList.remove('is-moving');if(!drag.item.getAttribute('class'))drag.item.removeAttribute('class')}bar?.remove();bar=null;ghost?.remove();ghost=null;drag=null;
 }
 function begin(event){
  drag.live=true;document.body.classList.add('block-moving');drag.item.classList.add('is-moving');
  getSelection()?.removeAllRanges();
  ghost=document.createElement('div');ghost.className='move-ghost';
  ghost.textContent=drag.picture?'Picture':(drag.item.dataset.equation||'Equation').slice(0,40);document.body.append(ghost);
 }
 function move(event){
  if(!drag)return;
  if(!drag.live){if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<SLOP)return;begin(event)}
  event.preventDefault();
  Object.assign(ghost.style,{left:event.clientX+12+'px',top:event.clientY+10+'px'});
  const inside=drag.editor.getBoundingClientRect();
  if(event.clientX<inside.left-40||event.clientX>inside.right+40||event.clientY<inside.top-60||event.clientY>inside.bottom+60){drag.spot=null;if(bar)bar.style.display='none';return}
  drag.zone=zoneAt(drag.editor,event.clientX);
  drag.spot=landing(drag.editor,event.clientY,drag.unit);
  if(drag.spot)showBar(drag.spot,drag.zone,drag.picture);else if(bar)bar.style.display='none';
 }
 function drop(){
  const {item,editor,spot,zone,picture}=drag;if(!spot)return;
  const source=item.parentElement;
  let moving=item;
  if(picture){
   const line=lineOf(item);
   if(line)moving=line;else{moving=document.createElement('p');moving.append(item)}
   if(zone==='center')item.dataset.align='center';else item.dataset.align=zone;
  }
  // Putting it back where it was, on the side it already had, changes nothing.
  const neighbour=spot.before?spot.block.previousElementSibling:spot.block.nextElementSibling;
  if(!picture&&(spot.block===moving||neighbour===moving))return;
  spot.block[spot.before?'before':'after'](moving);
  if(source&&source!==editor&&source.isConnected&&source!==moving&&isBlank(source)){
   if(source.tagName==='LI'||/^(TD|TH)$/.test(source.tagName))source.replaceChildren(document.createElement('br'));
   else if(/^(P|DIV)$/.test(source.tagName)&&!source.classList.contains('col'))source.remove();
  }
  editor.dispatchEvent(new Event('input',{bubbles:true}));
 }
 function up(event){
  if(!drag)return;
  const live=drag.live;
  if(live){event.preventDefault();event.stopPropagation();drop();
   // The click that follows letting go belongs to the drag, not to the picture or equation.
   const swallow=e=>{e.stopPropagation();e.preventDefault()};window.addEventListener('click',swallow,{capture:true,once:true});setTimeout(()=>window.removeEventListener('click',swallow,true),0);
  }
  end();
 }
 const cancel=()=>end();
 function key(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();end()}}
 root.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.isPrimary===false||drag)return;
  const item=grabbable(event.target);if(!item)return;
  const editor=item.closest('.rich-text');if(!editor||editor.isContentEditable===false)return;
  const picture=item.tagName==='IMG';
  drag={item,editor,picture,unit:topOf(editor,item),x:event.clientX,y:event.clientY,live:false,spot:null,zone:'center'};
  document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',cancel,true);document.addEventListener('keydown',key,true);
 },true);
 // The browser's own picture dragging would fight with this one: it cancels the pointer the moment it starts.
 root.addEventListener('mousedown',event=>{if(event.button===0&&event.target.closest?.('.rich-text img')&&!event.target.closest('.editing'))event.preventDefault()},true);
 root.addEventListener('dragstart',event=>{if(event.target.closest?.('.rich-text img'))event.preventDefault()},true);
})();
