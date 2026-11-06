/* Opening a different note puts the cursor in its title, whichever way you got there. */
(()=>{
 let shown=null;
 const baseRender=render;
 render=function(...args){
  const result=baseRender.apply(this,args),note=current();
  if(note&&note.id!==shown&&!$('article').hidden){
   const id=note.id;
   requestAnimationFrame(()=>{if(active!==id||document.querySelector('dialog[open]')||document.activeElement?.closest('#editor'))return;const title=$('#title');if(title&&!title.closest('[hidden]')){title.focus({preventScroll:true});title.setSelectionRange?.(title.value.length,title.value.length)}});
  }
  shown=note?.id||null;
  return result;
 };
})();
