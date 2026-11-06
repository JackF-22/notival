const StudentModel=(()=>{
 function initialize(subject){subject.units??=[];subject.materials??=[];subject.packs??=[];subject.checklist??=[];subject.assessments??=[];subject.overview??={checklist:true,dates:true,recent:true,shortcuts:true};return subject}
 function contents(subject,notes,pack){const units=new Set(pack.unitIds||[]),noteIDs=new Set(pack.noteIds||[]),materialIDs=new Set(pack.materialIds||[]);return {notes:notes.filter(n=>n.projectId===subject.id&&(noteIDs.has(n.id)||units.has(n.unitId))),materials:(subject.materials||[]).filter(m=>materialIDs.has(m.id)||units.has(m.unitId))}}
 function summary(subject,notes){return {notes:notes.filter(n=>n.projectId===subject.id).length,units:subject.units?.length||0,materials:subject.materials?.length||0,packs:subject.packs?.length||0}}
 function removeUnit(subject,notes,id){
  const index=subject.units.findIndex(u=>u.id===id);if(index<0)return ()=>{};
  const unit=subject.units[index],changedNotes=notes.filter(n=>n.projectId===subject.id&&n.unitId===id),changedFiles=subject.materials.filter(m=>m.unitId===id),packs=subject.packs.filter(p=>(p.unitIds||[]).includes(id)).map(p=>({p,unitIds:[...p.unitIds],noteIds:[...(p.noteIds||[])],materialIds:[...(p.materialIds||[])]}));
  subject.units.splice(index,1);for(const n of changedNotes)n.unitId=null;for(const m of changedFiles)m.unitId=null;
  for(const {p} of packs){p.unitIds=p.unitIds.filter(u=>u!==id);p.noteIds=[...new Set([...(p.noteIds||[]),...changedNotes.map(n=>n.id)])];p.materialIds=[...new Set([...(p.materialIds||[]),...changedFiles.map(m=>m.id)])]}
  return ()=>{subject.units.splice(index,0,unit);for(const n of changedNotes)n.unitId=id;for(const m of changedFiles)m.unitId=id;for(const snapshot of packs){const {p,unitIds,noteIds,materialIds}=snapshot;Object.assign(p,{unitIds,noteIds,materialIds})}};
 }
 function dates(subject){return [...(subject.assessments||[]).map(item=>({item,kind:item.kind||'assignment',date:item.date})),...(subject.checklist||[]).filter(t=>t.date).map(item=>({item,kind:'checklist',date:item.date})),...(subject.packs||[]).filter(p=>p.date).map(item=>({item,kind:'test-pack',date:item.date}))].filter(entry=>/^\d{4}-\d{2}-\d{2}$/.test(entry.date||'')).sort((a,b)=>a.date.localeCompare(b.date)||(a.item.time||'23:59').localeCompare(b.item.time||'23:59'))}
 /* A note's linked PDF becomes a unit material, once per file. A material already in another unit moves with the note's choice only when the caller confirms. */
 function addNotePDF(subject,note){
  if(!note?.pdfPath||note.projectId!==subject.id)return {status:'none'};
  if(!note.unitId||!(subject.units||[]).some(u=>u.id===note.unitId))return {status:'needs-unit'};
  const existing=(subject.materials||[]).find(m=>m.path===note.pdfPath);
  if(existing)return existing.unitId===note.unitId?{status:'exists',material:existing}:{status:'elsewhere',material:existing};
  const material={id:note.id+':pdf',name:note.pdfName||note.pdfPath.split('/').pop()||'PDF',path:note.pdfPath,unitId:note.unitId,added:Date.now(),fromNoteId:note.id};
  while(subject.materials.some(m=>m.id===material.id))material.id+='+';
  subject.materials.push(material);return {status:'added',material};
 }
 /* Everything an end-of-unit study guide can draw on: the unit's notes that have content, and its PDF materials. */
 function guideContents(subject,notes,unitId){
  const has=n=>(n.blocks||[]).some(b=>b.type==='code'||(b.text||'').trim()||(b.html||'').replace(/<[^>]*>/g,'').trim());
  return {notes:notes.filter(n=>n.projectId===subject.id&&n.unitId===unitId&&!n.synthesis&&has(n)).sort((a,b)=>(a.created||a.updated||0)-(b.created||b.updated||0)),pdfs:(subject.materials||[]).filter(m=>m.unitId===unitId&&/\.pdf$/i.test(m.path||m.name||''))};
 }
 return {initialize,contents,summary,removeUnit,dates,addNotePDF,guideContents};
})();
