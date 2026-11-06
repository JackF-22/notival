// Where a note lives: a chip beside the date that files it under a subject and unit, at any point while writing.
(()=>{
 const $=s=>document.querySelector(s);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n};
 const meta=$('#note-column>.meta')||$('.meta');if(!meta)return;
 const chip=el('button',undefined,'note-location');chip.type='button';chip.id='note-location';chip.setAttribute('aria-haspopup','dialog');chip.setAttribute('aria-expanded','false');
 meta.append(el('span','·'),chip);
 const pop=el('div',undefined,'note-location-pop');pop.hidden=true;pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Where this note lives');document.body.append(pop);
 const subjectOf=note=>state.projects.find(p=>p.id===note?.projectId);
 const unitOf=(subject,note)=>(subject?.units||[]).find(u=>u.id===note?.unitId);
 const where=note=>{const s=subjectOf(note);return s?{subject:s,unit:unitOf(s,note)}:{subject:null,unit:null}};
 function paint(){
  const note=current();chip.hidden=!note;if(!note)return;
  const {subject,unit}=where(note);
  chip.replaceChildren();chip.classList.toggle('unfiled',!subject);
  if(!subject){chip.append(el('span','＋ Add to a subject or unit'))}
  else{chip.append(el('span',subject.icon||'📚','note-location-icon'),el('span',subject.name));if(unit)chip.append(el('span','›','note-location-sep'),el('span',unit.name));else chip.append(el('span','No unit','note-location-none'))}
  chip.append(el('span','▾','note-location-caret'));
  chip.style.setProperty('--subject-color',subject?.color||'var(--green)');
  chip.title=subject?'Move this note to another subject or unit':'File this note under a subject and unit';
 }
 function close(){pop.hidden=true;pop.replaceChildren();chip.setAttribute('aria-expanded','false')}
 function row(label,{icon,selected,onPick,note:sub}){
  const b=el('button',undefined,'note-location-row');b.type='button';b.setAttribute('role','option');b.setAttribute('aria-selected',String(!!selected));
  if(icon)b.append(el('span',icon,'note-location-icon'));b.append(el('span',label,'note-location-label'));if(sub)b.append(el('small',sub));
  b.append(el('span',selected?'✓':'','note-location-check'));b.onclick=onPick;return b;
 }
 function build(note,anchor){
  const {subject,unit}=where(note),target=value=>window.marginMoveItemsTo([{kind:'note',id:note.id}],value);
  pop.replaceChildren(el('small','Subject','note-location-head'));
  const subjects=el('div',undefined,'note-location-list');subjects.setAttribute('role','listbox');subjects.setAttribute('aria-label','Subject');
  subjects.append(row('Personal notes',{icon:'🗒',selected:!subject,onPick:()=>{target({projectId:null,unitId:null});close()}}));
  for(const s of state.projects)subjects.append(row(s.name,{icon:s.icon||'📚',selected:s.id===subject?.id,onPick:()=>{if(s.id===subject?.id)return;target({projectId:s.id,unitId:null});reopen(note.id,anchor)}}));
  pop.append(subjects);
  if(subject){
   pop.append(el('small','Unit in '+subject.name,'note-location-head'));
   const units=el('div',undefined,'note-location-list');units.setAttribute('role','listbox');units.setAttribute('aria-label','Unit');
   units.append(row('No unit · subject overview',{selected:!unit,onPick:()=>{if(unit)target({projectId:subject.id,unitId:null});close()}}));
   for(const u of subject.units||[])units.append(row(u.name,{selected:u.id===unit?.id,onPick:()=>{if(u.id!==unit?.id)target({projectId:subject.id,unitId:u.id});close()}}));
   if(!(subject.units||[]).length)units.append(el('p','This subject has no units yet. Add one from the subject page.','note-location-empty'));
   pop.append(units);
  }
 }
 function place(anchor){
  const r=anchor.getBoundingClientRect();pop.style.left=Math.max(12,Math.min(r.left,innerWidth-pop.offsetWidth-12))+'px';
  const below=r.bottom+8,fits=below+pop.offsetHeight<innerHeight-12;pop.style.top=Math.max(12,fits?below:r.top-pop.offsetHeight-8)+'px';
 }
 function open(note,anchor=chip){
  if(!note||!window.marginMoveItemsTo)return;
  build(note,anchor);pop.hidden=false;chip.setAttribute('aria-expanded','true');place(anchor);
  requestAnimationFrame(()=>{place(anchor);(pop.querySelector('[aria-selected=true]')||pop.querySelector('button'))?.focus()});
 }
 const reopen=(id,anchor)=>requestAnimationFrame(()=>{const note=state.notes.find(n=>n.id===id);if(note&&current()?.id===id)open(note,anchor.isConnected?anchor:chip)});
 chip.onclick=()=>pop.hidden?open(current()):close();
 document.addEventListener('pointerdown',e=>{if(!pop.hidden&&!pop.contains(e.target)&&!chip.contains(e.target))close()},true);
 document.addEventListener('keydown',e=>{
  if(pop.hidden)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();chip.focus();return}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const items=[...pop.querySelectorAll('button')],i=items.indexOf(document.activeElement);items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()}
 },true);
 window.addEventListener('resize',close);
 const baseRender=render;render=function(){baseRender();paint()};
 window.marginNoteLocation={open:(note,anchor)=>{if(current()?.id!==note.id){active=note.id;render()}requestAnimationFrame(()=>open(note,chip))},paint};
 paint();
})();
