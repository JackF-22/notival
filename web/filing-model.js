const FilingModel=(()=>{
 function destination(state,value){const projectId=value?.projectId||null,unitId=value?.unitId||null;if(!projectId)return unitId?null:{projectId:null,unitId:null};const subject=state.projects.find(s=>s.id===projectId);if(!subject||unitId&&!(subject.units||[]).some(u=>u.id===unitId))return null;return {projectId,unitId}}
 function move(state,items,target){const dest=destination(state,target);if(!dest)throw Error('That destination is no longer available.');const unique=[...new Map(items.map(item=>[item.kind+':'+item.id,item])).values()];if(!unique.length||unique.length>500)throw Error('Choose up to 500 notes or materials.');
  const changes=unique.map(item=>{if(item.kind==='note'){const note=state.notes.find(n=>n.id===item.id);if(!note)throw Error('A selected note is no longer available.');return {kind:'note',note,projectId:note.projectId,unitId:note.unitId}}
   if(item.kind==='material'){if(!dest.projectId)throw Error('Materials need a subject destination.');const owner=state.projects.find(s=>(s.materials||[]).some(m=>m.id===item.id)),material=owner?.materials.find(m=>m.id===item.id);if(!material)throw Error('A selected material is no longer available.');return {kind:'material',material,owner,index:owner.materials.indexOf(material),unitId:material.unitId}}
   throw Error('Unsupported item.');
  }).filter(change=>change.kind==='note'?(change.note.projectId||null)!==dest.projectId||(change.note.unitId||null)!==dest.unitId:change.owner.id!==dest.projectId||(change.material.unitId||null)!==dest.unitId);
  const owner=state.projects.find(s=>s.id===dest.projectId);
  for(const c of changes){if(c.kind==='note'){c.note.projectId=dest.projectId;c.note.unitId=dest.unitId}else{if(c.owner!==owner){c.owner.materials.splice(c.owner.materials.indexOf(c.material),1);owner.materials??=[];owner.materials.push(c.material)}c.material.unitId=dest.unitId}}
  return {count:changes.length,undo(){for(const c of [...changes].reverse()){if(c.kind==='note'){c.note.projectId=c.projectId;c.note.unitId=c.unitId}else{if(c.owner!==owner){const i=owner.materials.indexOf(c.material);if(i>=0)owner.materials.splice(i,1);c.owner.materials.splice(Math.min(c.index,c.owner.materials.length),0,c.material)}c.material.unitId=c.unitId}}}};
 }
 return {destination,move};
})();
