/* A quiet word counter for any text block: switch it on from the Insert menu (or /wordcount) for the block you are in. */
(()=>{
 const root=document.querySelector('#editor');if(!root)return;
 const WORD=/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
 // Count prose only: skip rendered equations, whose markup repeats the same symbols several times.
 function textOf(node){
  const copy=node.cloneNode(true);
  copy.querySelectorAll('.equation,.katex,.katex-mathml,input,[data-placeholder]').forEach(item=>item.remove());
  // Keep adjacent blocks and line breaks from gluing words together.
  copy.querySelectorAll('p,div,li,h1,h2,h3,blockquote,pre,tr,td,th,br').forEach(item=>item.append(' '));
  return copy.textContent.replace(/[ ​]/g,' ');
 }
 const count=text=>(text.match(WORD)||[]).length;
 const plural=(n,word)=>n.toLocaleString()+' '+word+(n===1?'':'s');
 function refresh(wrap){
  const rich=wrap.querySelector('.rich-text'),badge=wrap.querySelector('.word-count');if(!rich||!badge)return;
  const text=textOf(rich),total=count(text),selection=getSelection();
  let label=plural(total,'word');
  // With text selected inside this block, show how much of it is selected.
  if(selection&&!selection.isCollapsed&&rich.contains(selection.anchorNode)&&rich.contains(selection.focusNode)){
   const chosen=count(selection.toString());if(chosen>0&&chosen!==total)label=chosen.toLocaleString()+' of '+plural(total,'word');
  }
  const characters=text.replace(/\s/g,'').length,minutes=Math.max(1,Math.round(total/230));
  badge.textContent=label;badge.title=`${plural(total,'word')} · ${plural(characters,'character')} · about ${minutes} min read`;
 }
 const note=()=>typeof current==='function'?current():null;
 function decorate(){
  const blocks=note()?.blocks||[];
  queueMicrotask(()=>window.marginWordCountLabel?.());
  [...root.children].forEach((wrap,index)=>{
   const block=blocks[index],rich=wrap.querySelector('.rich-text');
   if(!block||!rich)return;
   let badge=wrap.querySelector('.word-count');
   if(!rich.dataset.countWatching){rich.dataset.countWatching='1';for(const type of ['input','keyup','mouseup','focusin'])rich.addEventListener(type,()=>schedule(wrap))}
   if(block.wordCount){
    if(!badge){badge=document.createElement('div');badge.className='word-count';badge.setAttribute('aria-live','off');wrap.append(badge)}
    refresh(wrap);
   }else badge?.remove();
  });
 }
 const queued=new WeakSet();
 function schedule(wrap){if(queued.has(wrap))return;queued.add(wrap);requestAnimationFrame(()=>{queued.delete(wrap);if(wrap.isConnected)refresh(wrap)})}
 document.addEventListener('selectionchange',()=>{const anchor=getSelection()?.anchorNode,wrap=(anchor?.nodeType===Node.ELEMENT_NODE?anchor:anchor?.parentElement)?.closest?.('.block');if(wrap&&root.contains(wrap)&&wrap.querySelector('.word-count'))schedule(wrap)});
 // Blocks are rebuilt whenever a note is shown, so add the toggle to whatever appears.
 let pending=false;
 new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;decorate()})}).observe(root,{childList:true});
 window.marginWordCountRefresh=decorate;
 decorate();
})();
