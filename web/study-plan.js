// The study planner: asks when the test is and when you can study, then lays out each day and keeps it honest.
(()=>{
 const P=StudyPlanModel;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n};
 const btn=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.onclick=fn;return b};
 const today=()=>P.key(new Date());
 // The Study hub shares the home screen, so refresh it in place instead of jumping to a subject.
 const refreshHome=()=>document.querySelector('#workspace-home')?.dataset.hub==='study'?window.marginStudyHubRefresh?.():window.marginRefreshStudentHome?.();
 const subjectOf=pack=>state.projects.find(s=>(s.packs||[]).includes(pack));
 const dayName=date=>{const d=P.parse(date),gap=P.between(today(),date);return gap===0?'Today':gap===1?'Tomorrow':d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})};
 const inDays=date=>{const n=P.between(today(),date);return n<=0?'today':n===1?'tomorrow':'in '+n+' days'};
 const plural=(n,word)=>n+' '+word+(n===1?'':'s');

 // What a pack covers, as areas a plan can schedule: each unit, then any single notes outside those units.
 function areasOf(subject,pack){
  const notes=StudentModel.contents(subject,state.notes,pack).notes.filter(n=>!n.synthesis);
  const areas=[],used=new Set();
  const weakNotes=new Set(RecallModel.weakTopics(RecallModel.collect(state,{notes}),state.reviews||{},Date.now(),999).map(t=>t.noteId));
  const describe=(id,name,list)=>({id,name,noteIds:list.map(n=>n.id),flags:list.reduce((s,n)=>s+FlagsModel.openCount(n),0),weak:list.filter(n=>weakNotes.has(n.id)).length});
  for(const unitId of pack.unitIds||[]){
   const unit=(subject.units||[]).find(u=>u.id===unitId);if(!unit)continue;
   const list=notes.filter(n=>n.unitId===unitId);list.forEach(n=>used.add(n.id));areas.push(describe('unit:'+unitId,unit.name,list));
  }
  for(const n of notes)if(!used.has(n.id))areas.push(describe('note:'+n.id,n.title||'Untitled note',[n]));
  if(!areas.length)for(const t of pack.topics||[])areas.push({id:'topic:'+t.title,name:t.title,noteIds:[],flags:0,weak:0});
  return areas;
 }
 // Every upcoming test in a subject: test packs, plus tests added as dates that have no pack yet.
 function testsFor(subject){
  const out=[],from=today();
  for(const pack of subject.packs||[])if(pack.date&&pack.date>=from)out.push({subject,pack,assessment:null,title:pack.title,date:pack.date});
  for(const item of subject.assessments||[]){
   if(item.kind!=='test'||item.done||!item.date||item.date<from)continue;
   if((subject.packs||[]).some(p=>p.fromAssessmentId===item.id))continue;
   out.push({subject,pack:null,assessment:item,title:item.title,date:item.date});
  }
  return out.sort((x,y)=>x.date.localeCompare(y.date));
 }
 // A pack for a bare test: everything in the subject, to be narrowed later. It only joins the subject once a plan is made.
 function draftPack(subject,assessment){
  const units=(subject.units||[]).map(u=>u.id);
  const notes=units.length?[]:state.notes.filter(n=>n.projectId===subject.id&&!n.synthesis).map(n=>n.id);
  return {id:'pack-'+Date.now().toString(36),title:assessment.title,date:assessment.date,unitIds:units,noteIds:notes,materialIds:[],topics:[],fromAssessmentId:assessment.id};
 }
 const planTest=entry=>setup(entry.subject,entry.pack||draftPack(entry.subject,entry.assessment));
 const notesOf=(areas,ids)=>[...new Set(areas.filter(a=>ids.includes(a.id)).flatMap(a=>a.noteIds))].map(id=>state.notes.find(n=>n.id===id)).filter(Boolean);
 const namesOf=(areas,ids)=>areas.filter(a=>ids.includes(a.id)).map(a=>a.name);

 // ── Setting up ──────────────────────────────────────────────────────────────
 const dialog=el('dialog',undefined,'student-dialog study-plan-dialog');document.body.append(dialog);
 const weekdayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 function setup(subject,pack){
  const areas=areasOf(subject,pack),old=pack.plan?.settings;
  const settings={weekdays:old?.weekdays||[0,1,2,3,4,5,6],minutes:old?.minutes||45,confidence:{...(old?.confidence||{})}};
  let test=pack.date||'';
  dialog.replaceChildren(el('h2',pack.plan?'Adjust your study plan':'Plan my studying'),el('p',pack.title+' · answer three quick things and I’ll lay out each day, harder material first.','plan-lead'));
  if(pack.fromAssessmentId&&!(subject.packs||[]).includes(pack))dialog.append(el('p','Based on everything in '+subject.name+'. After this, use Edit pack to narrow it to the right units or notes.','plan-lead'));
  const form=el('form');dialog.append(form);
  const layout=el('div',undefined,'plan-layout'),inputs=el('div',undefined,'plan-inputs'),output=el('section',undefined,'plan-output'),basics=el('div',undefined,'plan-basics');
  layout.append(inputs,output);form.append(layout);inputs.append(basics);

  const when=el('label','When is the test?'),date=el('input');date.type='date';date.value=test;date.min=today();date.required=true;date.setAttribute('aria-label','Test date');when.append(date);basics.append(when);

  inputs.append(el('h3','Which days can you study?'));
  const days=el('div',undefined,'plan-days');days.setAttribute('role','group');days.setAttribute('aria-label','Days you can study');
  weekdayNames.forEach((name,i)=>{const b=btn(name,()=>{const at=settings.weekdays.indexOf(i);if(at>=0)settings.weekdays.splice(at,1);else settings.weekdays.push(i);redraw()},'plan-day');b.dataset.day=i;days.append(b)});inputs.append(days);
  const length=el('label','How long per session?'),minutes=el('select');minutes.setAttribute('aria-label','Minutes per session');
  for(const m of [20,30,45,60,90,120]){const o=el('option',m<60?m+' minutes':m/60+(m===60?' hour':' hours'));o.value=m;minutes.append(o)}minutes.value=settings.minutes;minutes.onchange=()=>{settings.minutes=+minutes.value;redraw()};length.append(minutes);basics.append(length);

  inputs.append(el('h3','How well do you know each part?'));
  const rows=el('div',undefined,'plan-areas');inputs.append(rows);
  for(const a of areas){
   const row=el('div',undefined,'plan-area'),info=el('div');info.append(el('strong',a.name));
   const hints=[a.flags?plural(a.flags,'unclear passage'):'',a.weak?'recall needs work':'',!a.noteIds.length?'no notes yet':''].filter(Boolean);if(hints.length)info.append(el('small',hints.join(' · ')));
   const group=el('div',undefined,'plan-confidence');group.setAttribute('role','radiogroup');group.setAttribute('aria-label','How well you know '+a.name);
   [[1,'Shaky'],[2,'Okay'],[3,'Solid']].forEach(([value,label])=>{const b=btn(label,()=>{settings.confidence[a.id]=value;redraw()});b.setAttribute('role','radio');b.dataset.value=value;b.dataset.area=a.id;group.append(b)});
   row.append(info,group);rows.append(row);
  }
  if(!areas.length)rows.append(el('p','This test has no units or notes yet. Use Edit pack to choose some.','plan-empty'));

  output.append(el('h3','Your plan'));
  const preview=el('div',undefined,'plan-preview');preview.setAttribute('aria-live','polite');output.append(preview);
  const row=el('div',undefined,'student-actions');row.append(btn('Cancel',()=>dialog.close()));
  const save=el('button',pack.plan?'Update plan':'Create plan','primary');save.type='submit';row.append(save);form.append(row);

  let current=null;
  function redraw(){
   test=date.value;
   for(const b of days.children)b.setAttribute('aria-pressed',String(settings.weekdays.includes(+b.dataset.day)));
   for(const b of rows.querySelectorAll('[data-value]'))b.setAttribute('aria-pressed',String((settings.confidence[b.dataset.area]||2)===+b.dataset.value));
   preview.replaceChildren();
   if(!test){preview.append(el('p','Pick the test date to see your plan.','plan-empty'));save.disabled=true;current=null;return}
   if(!settings.weekdays.length){preview.append(el('p','Choose at least one day you can study.','plan-empty'));save.disabled=true;current=null;return}
   const result=P.build({from:today(),test,weekdays:settings.weekdays,minutes:settings.minutes,areas,confidence:settings.confidence});
   current=result;save.disabled=!!result.problem;
   if(result.problem){preview.append(el('p',result.problem,'plan-empty'));return}
   preview.append(el('p',plural(result.sessions.length,'session')+' over '+plural(P.between(today(),test),'day')+', about '+Math.round(result.sessions.length*settings.minutes/60*10)/10+' hours in all.','plan-summary'));
   for(const s of result.sessions)preview.append(sessionLine(s,areas));
  }
  date.oninput=redraw;
  form.onsubmit=e=>{
   e.preventDefault();if(!current||current.problem)return;
   const keep=(pack.plan?.sessions||[]).filter(s=>s.done&&s.date<today());
   if(!(subject.packs||[]).includes(pack))(subject.packs??=[]).push(pack);
   pack.date=test;pack.plan={settings:{weekdays:[...settings.weekdays],minutes:settings.minutes,confidence:{...settings.confidence}},sessions:[...keep,...current.sessions],created:pack.plan?.created||Date.now(),updated:Date.now()};
   persist();dialog.close();window.marginShowPack?.(subject,pack);refreshHome();toast('Plan ready. First session '+dayName(current.sessions[0].date).toLowerCase()+'.');
  };
  redraw();if(!dialog.open)dialog.showModal();
 }
 function sessionLine(session,areas){
  const line=el('div',undefined,'plan-line plan-'+session.kind);
  line.append(el('span',dayName(session.date),'plan-when'),el('span',session.kind==='learn'?namesOf(areas,session.areaIds).join(', '):P.kindLabel[session.kind],'plan-what'));
  if(session.kind!=='learn')line.append(el('small','all parts'));
  return line;
 }

 // ── Adding a test ───────────────────────────────────────────────────────────
 const addDialog=el('dialog',undefined,'student-dialog study-plan-dialog add-test-dialog');document.body.append(addDialog);
 function addTest({subject=null,unitId=''}={}){
  if(!state.projects.length){toast('Create a subject first, then add its tests');return}
  addDialog.replaceChildren(el('h2','Add a test'),el('p','I’ll count down to it and can lay out your studying day by day.','plan-lead'));
  const form=el('form');addDialog.append(form);
  const subjectSelect=el('select');subjectSelect.setAttribute('aria-label','Subject');
  for(const p of state.projects){const o=el('option',(p.icon||'')+' '+p.name);o.value=p.id;subjectSelect.append(o)}
  subjectSelect.value=subject?.id||state.projects[0].id;
  const field=(label,node)=>{const l=el('label',label);l.append(node);form.append(l);return node};
  field('Subject',subjectSelect);
  const name=el('input');name.placeholder='Midterm';name.required=true;name.setAttribute('aria-label','Test name');field('What is it called?',name);
  const row=el('div',undefined,'add-test-when');form.append(row);
  const date=el('input');date.type='date';date.min=today();date.required=true;date.setAttribute('aria-label','Test date');
  const time=el('input');time.type='time';time.setAttribute('aria-label','Test time, optional');
  for(const [label,node] of [['Date',date],['Time · optional',time]]){const l=el('label',label);l.append(node);row.append(l)}
  form.append(el('h3','What’s on it?'));
  const chips=el('div',undefined,'plan-days add-test-units');chips.setAttribute('role','group');chips.setAttribute('aria-label','Units on this test');form.append(chips);
  const hint=el('p',undefined,'plan-lead');form.append(hint);
  let picked=new Set();
  function units(){
   const s=state.projects.find(p=>p.id===subjectSelect.value);chips.replaceChildren();
   const list=s?.units||[];picked=new Set(unitId&&list.some(u=>u.id===unitId)?[unitId]:list.map(u=>u.id));
   for(const u of list){const b=btn(u.name,()=>{picked.has(u.id)?picked.delete(u.id):picked.add(u.id);paint()},'plan-day');b.dataset.unit=u.id;chips.append(b)}
   hint.textContent=list.length?'Tap to leave out units that aren’t covered. You can refine this later with Edit pack.':'This subject has no units, so the test will cover all of its notes.';
   paint();
  }
  const paint=()=>{for(const b of chips.children)b.setAttribute('aria-pressed',String(picked.has(b.dataset.unit)))};
  subjectSelect.onchange=units;units();
  const planLabel=el('label',undefined,'add-test-plan'),plan=document.createElement('input');plan.type='checkbox';plan.checked=true;planLabel.append(plan,el('span','Plan my studying next'));form.append(planLabel);
  const actions=el('div',undefined,'student-actions');actions.append(btn('Cancel',()=>addDialog.close()));
  const save=el('button','Add test','primary');save.type='submit';actions.append(save);form.append(actions);
  form.onsubmit=e=>{
   e.preventDefault();const s=state.projects.find(p=>p.id===subjectSelect.value);
   if(!s||!name.value.trim()||!date.value)return;
   StudentModel.initialize(s);
   const unitIds=[...picked],notes=unitIds.length||(s.units||[]).length?[]:state.notes.filter(n=>n.projectId===s.id&&!n.synthesis).map(n=>n.id);
   const pack={id:'pack-'+Date.now().toString(36),title:name.value.trim(),date:date.value,time:time.value||'',unitIds,noteIds:notes,materialIds:[],topics:[]};
   s.packs.push(pack);persist();addDialog.close();
   if(plan.checked)setup(s,pack);else toast('Added '+pack.title+' · '+inDays(pack.date));
   refreshHome();
  };
  addDialog.showModal();name.focus();
 }
 window.marginAddTest=addTest;

 // ── Doing a session ─────────────────────────────────────────────────────────
 function tasksFor(session,areas){
  const notes=notesOf(areas,session.areaIds),flagged=notes.reduce((s,n)=>s+FlagsModel.openCount(n),0);
  const ready=notes.length?RecallModel.stats(RecallModel.collect(state,{notes}),state.reviews||{}).ready:0;
  const tasks=[];
  if(session.kind==='learn')tasks.push('Reread and tidy your notes on '+namesOf(areas,session.areaIds).join(' and '));
  if(session.kind==='practice')tasks.push('Answer questions from every part, without looking at your notes');
  if(session.kind==='final')tasks.push('A light pass: what you got wrong, then stop and rest');
  if(flagged)tasks.push('Clear up '+plural(flagged,'unclear passage'));
  if(ready)tasks.push('Answer '+plural(ready,'recall question')+' ('+ready+' ready)');
  return {tasks,notes};
 }
 function start(subject,pack,session){
  const areas=areasOf(subject,pack),{notes}=tasksFor(session,areas);
  if(!notes.length){toast('There are no notes to practise yet');return}
  const card=document.querySelector('.student-dialog[open]');if(card&&card!==dialog)card.close();
  window.marginReviewNotes(pack.title+' · '+P.kindLabel[session.kind],notes,subject.id);
 }
 function sessionCard(subject,pack,session,{compact=false}={}){
  const areas=areasOf(subject,pack),{tasks,notes}=tasksFor(session,areas);
  const card=el('div',undefined,'plan-session'+(session.done?' done':''));
  const check=document.createElement('input');check.type='checkbox';check.checked=session.done;check.setAttribute('aria-label','Mark '+dayName(session.date)+' done');
  check.onchange=()=>{session.done=check.checked;persist();rerender(subject,pack)};
  const body=el('div');body.append(el('strong',dayName(session.date)+' · '+P.kindLabel[session.kind]),el('small',(session.kind==='learn'?namesOf(areas,session.areaIds).join(', ')+' · ':'')+session.minutes+' min'));
  if(!compact&&!session.done){const list=el('ul');for(const t of tasks)list.append(el('li',t));body.append(list)}
  card.append(check,body);
  if(!session.done&&session.date<=today()&&notes.length)card.append(btn('Start',()=>start(subject,pack,session),'primary'));
  return card;
 }
 function rerender(subject,pack){
  if(document.querySelector('.student-dialog[open] .study-plan'))window.marginShowPack?.(subject,pack);
  refreshHome();
 }
 function catchUp(subject,pack){
  const areas=areasOf(subject,pack),result=P.replan(pack.plan,pack.plan.settings,{today:today(),test:pack.date,areas});
  if(result.problem){toast(result.problem);return}
  const before=pack.plan.sessions;pack.plan.sessions=result.sessions;pack.plan.updated=Date.now();persist();rerender(subject,pack);
  offerUndo('Re-planned from today. The parts you missed come up more often.',()=>{pack.plan.sessions=before;persist();rerender(subject,pack)});
 }

 // ── Inside a test pack ──────────────────────────────────────────────────────
 window.marginPlanSection=(subject,pack)=>{
  const box=el('section',undefined,'study-plan');
  if(!pack.plan){
   box.classList.add('study-plan-empty');
   box.append(el('h3','Study plan'),el('p',pack.date?'Your test is '+inDays(pack.date)+'. Want a day-by-day schedule?':'Tell me when the test is and when you can study, and I’ll lay out each day.','plan-lead'),btn('Plan my studying',()=>setup(subject,pack),'primary'));
   return box;
  }
  const {done,total}=P.progress(pack.plan),late=P.missed(pack.plan,today()),upcoming=pack.plan.sessions.filter(s=>!s.done&&s.date>=today()).slice(0,4);
  const head=el('div',undefined,'plan-head');head.append(el('h3','Study plan · '+done+' of '+total+' sessions'),btn('Adjust',()=>setup(subject,pack),'plan-quiet'),btn('Remove',()=>{const old=pack.plan;delete pack.plan;persist();rerender(subject,pack);offerUndo('Study plan removed',()=>{pack.plan=old;persist();rerender(subject,pack)})},'plan-quiet'));
  box.append(head);
  if(pack.date)box.append(el('p','Test '+inDays(pack.date)+'.','plan-lead'));
  if(late.length){const warn=el('div',undefined,'plan-behind');warn.append(el('span',plural(late.length,'session')+' behind.'),btn('Catch up',()=>catchUp(subject,pack),'primary'));box.append(warn)}
  if(!upcoming.length&&!late.length)box.append(el('p',pack.date&&pack.date>=today()?'Every session is done. Rest well.':'This test has passed.','plan-lead'));
  for(const s of upcoming)box.append(sessionCard(subject,pack,s,{compact:s.date!==today()}));
  return box;
 };

 // ── On the subject page ─────────────────────────────────────────────────────
 window.marginPlanWidget=subject=>{
  const tests=testsFor(subject),planned=tests.filter(t=>t.pack?.plan)[0]?.pack;
  const box=el('section',undefined,'subject-checklist subject-plan'),head=el('div',undefined,'widget-heading');
  if(!planned){
   const soon=tests.find(t=>P.between(today(),t.date)<=28);
   if(!soon)return null;
   head.append(el('h2','Study plan'));box.append(head,el('p',soon.title+' is '+inDays(soon.date)+'. Want me to plan your studying?','plan-lead'),btn('Plan it',()=>planTest(soon),'primary'));
   return box;
  }
  head.append(el('h2','Study plan'),btn('Open',()=>window.marginShowPack?.(subject,planned)));box.append(head,el('p',planned.title+' · '+inDays(planned.date),'plan-lead'));
  const late=P.missed(planned.plan,today()),now=P.onDate(planned.plan,today());
  if(late.length){const warn=el('div',undefined,'plan-behind');warn.append(el('span',plural(late.length,'session')+' behind.'),btn('Catch up',()=>catchUp(subject,planned),'primary'));box.append(warn)}
  for(const s of now)box.append(sessionCard(subject,planned,s));
  if(!now.length){const next=P.next(planned.plan,today());box.append(el('p',next?'Nothing today. Next: '+dayName(next.date)+' · '+P.kindLabel[next.kind]+'.':'Every session is done.','plan-lead'))}
  return box;
 };
 window.marginStudyPlan={setup,areasOf,sessionCard,catchUp,today,testsFor,planTest};
})();
