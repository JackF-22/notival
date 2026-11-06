// The Study hub: today's sessions, upcoming tests, questions ready, unclear passages and weak spots, across every subject.
(()=>{
 const P=StudyPlanModel,F=FlagsModel,M=RecallModel;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n};
 const btn=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.onclick=fn;return b};
 const today=()=>P.key(new Date());
 const plural=(n,word)=>n+' '+word+(n===1?'':'s');
 const shorten=(text,n=90)=>text.length>n?text.slice(0,n)+'…':text;
 const inDays=date=>{const n=P.between(today(),date);return n<=0?'today':n===1?'tomorrow':'in '+n+' days'};
 let host=null;
 // Subjects can be left out of Study; they keep working everywhere else.
 const shown=()=>state.projects.filter(p=>!p.excludeFromStudy);
 const hiddenIds=()=>new Set(state.projects.filter(p=>p.excludeFromStudy).map(p=>p.id));

 function card(title,{wide=false,action=null,count=null}={}){
  const box=el('section',undefined,'hub-card'+(wide?' wide':'')),head=el('div',undefined,'hub-head');
  head.append(el('h2',title));if(count!==null)head.append(el('span',String(count),'hub-count'));if(action)head.append(action);
  box.append(head);return box;
 }
 const packs=()=>shown().flatMap(subject=>(subject.packs||[]).filter(p=>p.date&&p.date>=today()).map(pack=>({subject,pack}))).sort((a,b)=>a.pack.date.localeCompare(b.pack.date));
 const tests=()=>shown().flatMap(subject=>window.marginStudyPlan.testsFor(subject)).sort((a,b)=>a.date.localeCompare(b.date));

 function todayCard(){
  const planned=packs().filter(({pack})=>pack.plan),box=card('Today',{wide:true});
  const lines=[];
  for(const {subject,pack} of planned){
   const late=P.missed(pack.plan,today()),now=P.onDate(pack.plan,today());
   if(late.length){const warn=el('div',undefined,'plan-behind');warn.append(el('span',pack.title+': '+plural(late.length,'session')+' behind.'),btn('Catch up',()=>{window.marginStudyPlan.catchUp(subject,pack);refresh()},'primary'));lines.push(warn)}
   for(const session of now){const label=el('small',subject.icon?subject.icon+' '+subject.name+' · '+pack.title:pack.title,'hub-source');lines.push(label,window.marginStudyPlan.sessionCard(subject,pack,session))}
  }
  if(lines.length){box.append(...lines);return box}
  const unplanned=tests().find(t=>!t.pack?.plan);
  if(unplanned){box.append(el('p',unplanned.title+' is '+inDays(unplanned.date)+' and has no plan yet.','hub-lead'),btn('Plan my studying',()=>window.marginStudyPlan.planTest(unplanned),'primary'))}
  else if(planned.length){const next=planned.map(({pack})=>P.next(pack.plan,today())).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date))[0];box.append(el('p',next?'Nothing scheduled today. Next study day is '+P.parse(next.date).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})+'.':'Every session is done. Rest well.','hub-lead'))}
  else box.append(el('p','Add a test date to a test pack and I’ll plan your studying around it.','hub-lead'));
  return box;
 }

 function testsCard(){
  const list=tests(),box=card('Coming up',{count:list.length||null,action:list.length?btn('＋ Add',()=>window.marginAddTest({})):null});
  if(!list.length){box.append(el('p','No tests with a date yet. Add one and I’ll count down and plan your studying.','hub-lead'),btn('＋ Add a test',()=>window.marginAddTest({}),'primary'));return box}
  for(const entry of list.slice(0,6)){
   const {subject,pack}=entry,row=el('div',undefined,'hub-row'),info=el('div'),done=pack?.plan?P.progress(pack.plan):null;
   info.append(el('strong',entry.title),el('small',(subject.icon||'')+' '+subject.name+' · '+inDays(entry.date)+(done?' · '+done.done+'/'+done.total+' sessions':' · no plan')));
   row.append(info,btn(pack?.plan?'Open':'Plan it',()=>pack?.plan?window.marginShowPack?.(subject,pack):window.marginStudyPlan.planTest(entry)));
   box.append(row);
  }
  return box;
 }

 function recallCard(){
  const reviews=state.reviews||{},hidden=hiddenIds(),all=M.collect(state,{exclude:hidden}),stats=M.stats(all,reviews,Date.now(),M.allowance(state)),box=card('Recall',{count:stats.ready||null});
  if(!all.length){
   box.append(el('p','Questions you write, or import from an AI, show up here for review.','hub-lead'));
  }else{
   box.append(el('p',stats.ready?plural(stats.ready,'question')+' ready to answer.':'All caught up.','hub-lead'));
   for(const subject of shown()){
    const items=M.collect(state,{projectId:subject.id});if(!items.length)continue;
    const ready=M.stats(items,reviews,Date.now(),M.allowance(state)).ready,row=el('div',undefined,'hub-row'),info=el('div');
    info.append(el('strong',(subject.icon||'')+' '+subject.name),el('small',ready?ready+' ready':'caught up'));
    row.append(info,btn(ready?'Start':'Open',()=>{window.marginRecall.setScope({project:subject});ready?window.marginRecall.start('due',15):window.marginRecall.hub({project:subject})}));box.append(row);
   }
  }
  const actions=el('div',undefined,'hub-actions');
  if(stats.ready)actions.append(btn('Start everything due',()=>{window.marginRecall.setScope({exclude:[...hidden],title:'Study'});window.marginRecall.start('due',15)},'primary'));
  actions.append(btn('Import from AI',()=>window.marginImportQuestions?.({onDone:refresh}),stats.ready?'':'primary'),btn('Draft from my notes',()=>{window.marginRecall.setScope({exclude:[...hidden],title:'Study'});window.marginRecall.suggestions()}));
  box.append(actions);return box;
 }

 function flagsCard(){
  const hidden=hiddenIds(),open=F.open(state.notes,{projectId:null}).filter(e=>!hidden.has(e.note.projectId)),box=card('To clarify',{count:open.length||null,action:open.length>5?btn('All',()=>window.marginFlags?.list({})):null});
  if(!open.length){box.append(el('p','Nothing flagged. Select text in a note and press ⌘⇧U when something doesn’t click.','hub-lead'));return box}
  for(const {note,flag} of open.slice(0,5)){
   const row=el('div',undefined,'hub-row'),info=el('div');info.append(el('strong',shorten(flag.comment||flag.quote)),el('small',note.title||'Untitled note'));
   row.append(info,btn('Go to',()=>window.marginFlags?.goTo(note,flag)));box.append(row);
  }
  return box;
 }

 function weakCard(){
  const spots=StudyHubModel.weakSpots(state,Date.now(),5,{exclude:hiddenIds()}),box=card('Weak spots');
  if(!spots.length){box.append(el('p','Nothing stands out yet. As you answer questions and flag passages, the parts that need work will show here.','hub-lead'));return box}
  for(const spot of spots){
   const row=el('div',undefined,'hub-row'),info=el('div');
   info.append(el('strong',(spot.subject.icon||'')+' '+spot.name+(spot.unit?' · '+spot.subject.name:'')),el('small',spot.reasons.join(' · ')));
   row.append(info,btn('Practice',()=>window.marginReviewNotes(spot.name,spot.notes,spot.subject.id)));box.append(row);
  }
  return box;
 }

 // Which subjects Study shows. Everything is on until you switch it off.
 const chooser=el('dialog',undefined,'student-dialog hub-chooser');document.body.append(chooser);
 function choose(){
  chooser.replaceChildren(el('h2','Subjects in Study'),el('p','Switch off any subject you don’t want to actively study. It stays in Notival, it just won’t appear in Study, its recall, or its plans.','hub-lead'));
  const list=el('div',undefined,'hub-subjects');
  for(const subject of state.projects){
   const row=el('label',undefined,'hub-subject'),check=document.createElement('input');check.type='checkbox';check.setAttribute('role','switch');check.checked=!subject.excludeFromStudy;
   check.onchange=()=>{subject.excludeFromStudy=!check.checked;persist();refresh()};
   row.append(el('span',(subject.icon||'📚')+' '+subject.name,'hub-subject-name'),check);list.append(row);
  }
  if(!state.projects.length)list.append(el('p','No subjects yet.','hub-lead'));
  chooser.append(list,btn('Done',()=>chooser.close(),'primary'));
  if(!chooser.open)chooser.showModal();
 }
 function render(home){
  host=home;home.replaceChildren();home.classList.remove('overview-layout','home-layout');home.classList.add('student-home-view','study-hub');home.dataset.hub='study';
  home.style.setProperty('--subject-color','var(--green)');
  const head=el('div',undefined,'hub-title');const titleText=el('div');titleText.append(el('small',new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}),'student-eyebrow'),el('h1','Study'),el('p','What to do today, what’s coming, and where you’re weakest.','student-intro'));const tools=el('div',undefined,'hub-tools');const hiddenCount=state.projects.length-shown().length;tools.append(btn(hiddenCount?'Subjects · '+shown().length+' of '+state.projects.length:'Subjects',choose,'hub-subjects-button'),btn('＋ Add a test',()=>window.marginAddTest({}),'primary hub-add-test'));head.append(titleText,tools);
  const grid=el('div',undefined,'hub-grid');
  if(state.projects.length&&!shown().length){const none=card('Nothing to show',{wide:true});none.append(el('p','Every subject is switched off for Study.','hub-lead'),btn('Choose subjects',choose,'primary'));grid.append(none)}
  else{
   // Two independent stacks, so a tall card never leaves a gap under its neighbour.
   const left=el('div',undefined,'hub-col'),right=el('div',undefined,'hub-col');
   left.append(testsCard(),flagsCard());right.append(recallCard(),weakCard());grid.append(todayCard(),left,right);
  }
  home.append(head,grid);
 }
 function refresh(){if(host&&host.dataset.hub==='study'&&!host.hidden)render(host)}
 window.marginStudyHubRefresh=refresh;

 // Sidebar entry. Home and Study are a matching pair of buttons; the page you are on is filled in.
 const nav=btn('',()=>window.marginHome(null,'study'),'nav');nav.id='study-nav';
 nav.append(el('span','◎','nav-glyph'),el('span','Study'));
 const homeButton=document.querySelector('#home-button');
 if(homeButton&&!homeButton.querySelector('.nav-glyph')){homeButton.replaceChildren(el('span','⌂','nav-glyph'),el('span','Home'))}
 if(homeButton)homeButton.after(nav);else document.querySelector('#new')?.before(nav);
 const here=(which)=>{for(const [button,name] of [[homeButton,'home'],[nav,'study']]){if(!button)continue;button.classList.toggle('is-here',which===name);if(which===name)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')}};
 new MutationObserver(()=>{if(document.body.dataset.view==='note')here(null)}).observe(document.body,{attributes:true,attributeFilter:['data-view']});
 const base=window.marginStudentHome;
 window.marginStudentHome=(home,subject,view)=>{
  base(home,subject,view==='study'?null:view);
  if(view==='study'){render(home);for(const id of ['all','pinned'])document.getElementById(id)?.classList.remove('active')}
  else{home.classList.remove('study-hub');delete home.dataset.hub}
  here(view==='study'?'study':(!subject&&view!=='pinned'?'home':null));
 };
 document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.code==='KeyJ'&&!document.querySelector('dialog[open]')){e.preventDefault();window.marginHome(null,'study')}});
})();
