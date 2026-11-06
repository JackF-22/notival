// Where to spend study time: ranks the parts of each subject by recall misses, unclear passages and neglect.
const StudyHubModel=(()=>{
 const DAY=864e5;
 function weakSpots(state,now=Date.now(),limit=5,{exclude=null}={}){
  const reviews=state.reviews||{},out=[];
  for(const subject of state.projects||[]){
   if(exclude?.has(subject.id))continue;
   const live=(state.notes||[]).filter(n=>n.projectId===subject.id&&!n.synthesis);
   const groups=new Map();
   for(const note of live){const key=note.unitId&&(subject.units||[]).some(u=>u.id===note.unitId)?note.unitId:'';(groups.get(key)||groups.set(key,[]).get(key)).push(note)}
   for(const [unitId,notes] of groups){
    const unit=(subject.units||[]).find(u=>u.id===unitId),items=RecallModel.collect(state,{notes});
    const stats=RecallModel.stats(items,reviews,now),flags=notes.reduce((s,n)=>s+FlagsModel.openCount(n),0);
    const last=items.reduce((m,i)=>Math.max(m,reviews[i.id]?.reviewedAt||0),0),idle=last?Math.floor((now-last)/DAY):null;
    const shaky=items.length?(stats.weak+.5*stats.due)/items.length:0;
    const score=shaky*3+Math.min(flags,4)*.6+(items.length&&idle!==null?Math.min(idle,14)/14*1.5:0)+(items.length&&idle===null?1:0)+(!items.length?.8:0);
    const reasons=[];
    if(stats.weak)reasons.push(stats.weak+(stats.weak===1?' question':' questions')+' you keep missing');
    if(stats.due)reasons.push(stats.due+' due for review');
    if(flags)reasons.push(flags+(flags===1?' unclear passage':' unclear passages'));
    if(items.length&&idle!==null&&idle>=5)reasons.push('not reviewed in '+idle+' days');
    if(items.length&&idle===null)reasons.push('never reviewed');
    if(!items.length)reasons.push('no questions yet');
    if(score<.8||!reasons.length)continue;
    out.push({subject,unit:unit||null,name:unit?unit.name:subject.name,notes,score,reasons,questions:items.length});
   }
  }
  return out.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,limit);
 }
 return {weakSpots};
})();
