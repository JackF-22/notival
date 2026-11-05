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
 function dates(subject){return [...(subject.assessments||[]).map(item=>({item,kind:item.kind||'assignment',date:item.date})),...(subject.packs||[]).filter(p=>p.date).map(item=>({item,kind:'test-pack',date:item.date}))].filter(entry=>/^\d{4}-\d{2}-\d{2}$/.test(entry.date||'')).sort((a,b)=>a.date.localeCompare(b.date))}
 return {initialize,contents,summary,removeUnit,dates};
})();
