(()=>{
 const dialog=document.createElement('dialog');dialog.className='capture-pick';document.body.append(dialog);
 function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
 window.marginAskCapture=(data,done)=>{
  dialog.replaceChildren();let finished=false;
  const finish=(id,remember)=>{if(finished)return;finished=true;if(dialog.open)dialog.close();done(id,remember)};
  const lines=(data.text||'').split('\n'),preview=lines.slice(0,3).join('\n')+(lines.length>3?'\n…':'');
  const search=el('input');search.type='search';search.placeholder='Search your notes';search.setAttribute('aria-label','Search notes');
  const list=el('div','capture-pick-list'),keep=el('input'),keepLabel=el('label','capture-pick-keep');keep.type='checkbox';keepLabel.append(keep,' Keep adding to the note I pick');
  const fresh=el('button','primary','New note instead');
  function paint(){
   const q=search.value.trim().toLowerCase();list.replaceChildren();
   const notes=[...state.notes].sort((a,b)=>(b.updated||0)-(a.updated||0)).filter(n=>!q||(n.title||'Untitled').toLowerCase().includes(q)).slice(0,60);
   for(const n of notes){const b=el('button','capture-pick-row');b.type='button';b.dataset.note=n.id;const project=state.projects?.find(p=>p.id===n.projectId);b.append(el('span','',n.title||'Untitled'),el('small','',project?project.name:'Personal'));b.onclick=()=>finish(n.id,keep.checked);list.append(b)}
   if(!notes.length)list.append(el('p','capture-pick-empty','No notes match.'));
  }
  search.oninput=paint;fresh.onclick=()=>finish(null);dialog.oncancel=()=>finish(null);
  dialog.append(el('h2','','Add this code to a note'),el('pre','capture-pick-preview',preview),search,list,keepLabel,el('div','capture-pick-actions',null));
  dialog.querySelector('.capture-pick-actions').append(fresh);
  paint();dialog.showModal();search.focus();
 };
})();
