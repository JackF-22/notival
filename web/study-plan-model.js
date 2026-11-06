// A study schedule worked backward from a test date. Pure: it only turns dates, days and how shaky each area is into sessions.
const StudyPlanModel=(()=>{
 const pad=n=>String(n).padStart(2,'0');
 const key=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const parse=text=>{const [y,m,d]=String(text).split('-').map(Number);return new Date(y,m-1,d,12)};
 const addDays=(text,n)=>{const d=parse(text);d.setDate(d.getDate()+n);return key(d)};
 const between=(from,to)=>Math.round((parse(to)-parse(from))/864e5);
 const uid=()=>'sess-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
 // How much an area needs: self-rated confidence first, nudged by what the notes themselves say (open flags, weak recall).
 function need(area,confidence=2){
  const base={1:3,2:2,3:1}[confidence]||2;
  return base+(area.flags>0?.5:0)+(area.weak>0?.5:0);
 }
 // Spread `total` slots over areas in proportion to need, at least one each (largest remainder).
 function share(areas,total){
  const sum=areas.reduce((s,a)=>s+a.need,0),counts=new Map(areas.map(a=>[a.id,1]));
  let left=total-areas.length;if(left<=0)return counts;
  const raw=areas.map(a=>({a,exact:a.need/sum*total-1})).map(r=>({...r,floor:Math.max(0,Math.floor(r.exact))}));
  for(const r of raw){counts.set(r.a.id,1+r.floor);left-=r.floor}
  for(const r of raw.sort((x,y)=>(y.exact-Math.floor(y.exact))-(x.exact-Math.floor(x.exact))||y.a.need-x.a.need)){if(left<=0)break;counts.set(r.a.id,counts.get(r.a.id)+1);left--}
  return counts;
 }
 // Study days: every allowed weekday from `from` through the day before the test, and always the day before itself.
 function studyDates({from,test,weekdays}){
  const last=addDays(test,-1),out=[];
  for(let d=from;d<=last;d=addDays(d,1)){if(weekdays.includes(parse(d).getDay())||d===last)out.push(d)}
  return out;
 }
 function build({from,test,weekdays=[0,1,2,3,4,5,6],minutes=45,areas,confidence={}}){
  if(!test||test<=from)return {sessions:[],problem:'The test date needs to be after today.'};
  if(!areas.length)return {sessions:[],problem:'Add units or notes to this test first.'};
  const days=studyDates({from,test,weekdays}),D=days.length;
  const rated=areas.map(a=>({...a,need:need(a,confidence[a.id])})).sort((a,b)=>b.need-a.need||a.name.localeCompare(b.name));
  const practice=D===1?1:D===2?1:Math.max(1,Math.floor(D*.3)),learn=D-practice;
  const sessions=[];
  const make=(date,kind,areaIds)=>sessions.push({id:uid(),date,kind,areaIds,minutes,done:false});
  // Learning days: weaker areas come back more often, and they come first.
  if(learn>0){
   const learnDays=days.slice(0,learn);
   if(learn>=rated.length){
    const counts=share(rated,learn),order=[];
    while(order.length<learn){for(const a of rated){if(counts.get(a.id)>0&&order.length<learn){order.push(a.id);counts.set(a.id,counts.get(a.id)-1)}}}
    learnDays.forEach((date,i)=>make(date,'learn',[order[i]]));
   }else{
    const buckets=learnDays.map(()=>[]);rated.forEach((a,i)=>buckets[i%learn].push(a.id));
    learnDays.forEach((date,i)=>make(date,'learn',buckets[i]));
   }
  }
  // The last stretch mixes everything; the final day is the lightest pass over it all.
  const practiceDays=days.slice(learn);
  practiceDays.forEach((date,i)=>make(date,i===practiceDays.length-1?'final':'practice',rated.map(a=>a.id)));
  return {sessions,days:D};
 }
 // Missed sessions are not dropped: rebuild from today and lean on the areas that slipped.
 function replan(plan,settings,{today,test,areas}){
  const kept=plan.sessions.filter(s=>s.date<today||(s.done&&s.date>=today));
  const missed=kept.filter(s=>!s.done&&s.date<today),slipped=new Set(missed.flatMap(s=>s.areaIds));
  const confidence={...settings.confidence};
  for(const id of slipped)confidence[id]=Math.max(1,(confidence[id]||2)-1);
  const result=build({from:today,test,weekdays:settings.weekdays,minutes:settings.minutes,areas,confidence});
  if(result.problem)return {...result,sessions:kept};
  const done=kept.filter(s=>s.done);
  return {sessions:[...done,...result.sessions.filter(s=>!done.some(d=>d.date===s.date&&d.kind===s.kind&&d.areaIds.join()===s.areaIds.join()))].sort((a,b)=>a.date.localeCompare(b.date)),missed:missed.length};
 }
 function missed(plan,today){return plan.sessions.filter(s=>!s.done&&s.date<today)}
 function onDate(plan,date){return plan.sessions.filter(s=>s.date===date)}
 function next(plan,today){return plan.sessions.filter(s=>!s.done&&s.date>=today).sort((a,b)=>a.date.localeCompare(b.date))[0]||null}
 function progress(plan){const total=plan.sessions.length,done=plan.sessions.filter(s=>s.done).length;return {total,done}}
 const kindLabel={learn:'Learn & review',practice:'Mixed practice',final:'Final review'};
 return {key,parse,addDays,between,studyDates,build,replan,missed,onDate,next,progress,need,share,kindLabel};
})();
