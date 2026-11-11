// Scheduled classes: the student enters their timetable once, and when a class is about to start Notival offers to
// open today's note for that subject and start class mode with the right length. Times live in ScheduleModel.
(()=>{
 const S=ScheduleModel,CHECK=20*1000;
 const $=selector=>document.querySelector(selector);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const button=(label,onclick,cls='',title='')=>{const b=el('button',cls,label);b.type='button';b.onclick=onclick;if(title)b.title=title;return b};
 const subjects=()=>state?.projects||[];
 const subjectOf=id=>subjects().find(p=>p.id===id)||null;
 const schedule=()=>(state.classSchedule??=[]);
 const handled=()=>(state.classHandled??={});
 const fullscreenPref=()=>{try{const raw=localStorage.getItem('notival.class.fullscreen');return raw==null?true:JSON.parse(raw)}catch{return true}};
 let banner=null,shownKey='',now=()=>Date.now();

 // ── Starting a scheduled class ─────────────────────────────────────────────
 // Today's note for the subject (made the first time), opened, and class mode running until the class ends.
 function start(occurrence){
  const at=now(),subject=subjectOf(occurrence.entry.subjectId);if(!subject)return;
  handled()[occurrence.key]='started';
  let note=S.classNote(state.notes,subject.id,at);
  if(!note){
   note={id:uid(),title:S.noteTitle(occurrence.entry,subject.name,at),projectId:subject.id,classDate:S.dayKey(at),updated:at,pinned:false,nodes:[],blocks:[{id:uid(),type:'text',text:'',html:'<p><br></p>'}]};
   state.notes.unshift(note);
  }
  active=note.id;persist();render();setMode?.('write');hideBanner();
  if(occurrence.entry.timer!==false)window.marginClass?.begin(S.minutesLeft(occurrence,at),{fullscreen:fullscreenPref()});
 }
 function skip(occurrence){handled()[occurrence.key]='skipped';persist();hideBanner()}

 // ── "Biology starts at 10am" ───────────────────────────────────────────────
 function hideBanner(){banner?.remove();banner=null;shownKey=''}
 function showBanner(occurrence){
  if(shownKey===occurrence.key&&banner?.isConnected)return;
  hideBanner();shownKey=occurrence.key;
  const subject=subjectOf(occurrence.entry.subjectId);
  banner=el('div');banner.id='class-due';banner.setAttribute('role','status');
  const text=el('div','due-text');
  text.append(el('strong','',(subject?.icon?subject.icon+' ':'')+(subject?.name||'Class')+(occurrence.state==='soon'?' starts at '+S.timeLabel(occurrence.start):' is on now')),el('small','',S.span(occurrence)+' · opens today\'s '+(subject?.name||'class')+' note'));
  const actions=el('div','due-actions');
  actions.append(button('Not today',()=>skip(occurrence),'','Don\'t offer this class again today'),button(occurrence.entry.timer===false?'Open note':'Start class',()=>start(occurrence),'primary'));
  banner.append(text,actions);document.body.append(banner);
 }
 function check(){
  if(!state)return;
  const due=S.due(schedule(),now(),handled());
  // a class started by hand during its slot counts as started
  const live=window.marginClass?.session?.();
  if(due&&live&&live.subjectId===due.entry.subjectId){handled()[due.key]='started';hideBanner();return}
  if(!due||live){hideBanner();return}
  showBanner(due);
 }
 setInterval(check,CHECK);

 function scheduleRow(entry,{pickSubject,changed:notify,remove:onRemove}){
  const r=el('div','schedule-row'+(pickSubject?'':' in-subject')),changed=()=>{persist();notify?.();r.classList.toggle('is-invalid',!S.valid(entry))};
  const pick=el('select');pick.setAttribute('aria-label','Subject');
  for(const subject of subjects()){const option=el('option','',(subject.icon?subject.icon+' ':'')+subject.name);option.value=subject.id;pick.append(option)}
  pick.value=entry.subjectId;pick.onchange=()=>{entry.subjectId=pick.value;changed()};
  const days=el('div','schedule-days');days.setAttribute('role','group');days.setAttribute('aria-label','Days');
  for(const day of [1,2,3,4,5,6,0]){
   const b=button(S.DAY_NAMES[day].slice(0,2),()=>{entry.days=entry.days.includes(day)?entry.days.filter(d=>d!==day):[...entry.days,day];b.setAttribute('aria-pressed',String(entry.days.includes(day)));changed()},'schedule-day',S.DAY_NAMES[day]);
   b.setAttribute('aria-pressed',String(entry.days.includes(day)));days.append(b);
  }
  const time=el('input');time.type='time';time.value=entry.start.padStart(5,'0');time.setAttribute('aria-label','Starts at');time.onchange=()=>{entry.start=time.value;changed()};
  const length=el('input');length.type='number';length.min='5';length.max='300';length.step='5';length.value=String(entry.minutes);length.setAttribute('aria-label','Length in minutes');
  length.onchange=()=>{entry.minutes=Math.round(Number(length.value)||0);changed()};
  const remove=button('✕',()=>{state.classSchedule=schedule().filter(e=>e!==entry);persist();onRemove?.()},'schedule-remove','Remove this class');
  const minutes=el('label','schedule-length');minutes.append(length,el('span','',' min'));
  const name=el('input','schedule-title');name.type='text';name.value=entry.title||'';name.placeholder='Note title, e.g. {date} - CoStaff Meeting';name.setAttribute('aria-label','Title for each note');name.title='Each time, a note with this title is made. {date} is today\'s date, {iso} is 2026-11-11, {weekday} and {subject} work too.';name.onchange=()=>{entry.title=name.value.trim();changed()};
  const timer=el('label','schedule-timer'),timerBox=el('input');timerBox.type='checkbox';timerBox.checked=entry.timer!==false;timerBox.onchange=()=>{entry.timer=timerBox.checked;changed()};timer.append(timerBox,el('span','',' Class timer'));timer.title='Start class mode for the length of this slot. Turn off to just open the note.';
  r.append(...(pickSubject?[pick]:[]),days,time,minutes,remove,name,timer);r.classList.toggle('is-invalid',!S.valid(entry));
  return r;
 }

 // ── The timetable ──────────────────────────────────────────────────────────
 function openSchedule(){
  document.querySelector('dialog.schedule-dialog')?.remove();
  const box=el('dialog','class-dialog schedule-dialog');box.setAttribute('aria-label','Class schedule');
  box.addEventListener('close',()=>{box.remove();check()});document.body.append(box);
  const paint=()=>{
   box.replaceChildren();
   box.append(el('h2','','Class schedule'),el('p','schedule-sub','When a class is about to start, Notival offers to open today\'s note for it and start class mode for the right length.'));
   if(!subjects().length){box.append(el('p','schedule-empty','Add a subject first. Each class belongs to a subject.'));box.append(actionsRow());return}
   const list=el('div','schedule-list');
   for(const entry of schedule())list.append(scheduleRow(entry,{pickSubject:true,remove:paint,changed:()=>{const next=box.querySelector('.schedule-next');if(next){const upcoming=S.next(schedule(),now());next.textContent=upcoming?'Next: '+(subjectOf(upcoming.entry.subjectId)?.name||'class')+', '+S.when(upcoming,now()):''}}}));
   if(!schedule().length)list.append(el('p','schedule-empty','No classes yet.'));
   box.append(list,button('+ Add a class',()=>{schedule().push({id:uid(),subjectId:subjects()[0].id,days:[1,3,5],start:'09:00',minutes:50});persist();paint();box.querySelector('.schedule-row:last-child select')?.focus()},'schedule-add'));
   const upcoming=S.next(schedule(),now());
   if(upcoming)box.append(el('p','schedule-next','Next: '+(subjectOf(upcoming.entry.subjectId)?.name||'class')+', '+S.when(upcoming,now())));
   box.append(actionsRow());
  };
  const actionsRow=()=>{const r=el('div','summary-actions');r.append(button('Done',()=>box.close(),'primary'));return r};
  paint();box.showModal();box.querySelector('button.primary,select')?.focus();
 }

 // ── On a subject's page: the times this subject meets, each making its own note ─────────────────────────
 window.marginScheduleWidget=subject=>{
  const box=el('section','subject-schedule'),own=()=>schedule().filter(entry=>entry.subjectId===subject.id);
  const paint=()=>{
   box.replaceChildren();
   const head=el('div','widget-heading');head.append(el('h2','','Schedule'),button('+ Add',()=>{schedule().push({id:uid(),subjectId:subject.id,days:[new Date().getDay()],start:'09:00',minutes:60,title:''});persist();paint();box.querySelector('.schedule-row:last-of-type .schedule-title')?.focus()},'','Add a time this subject meets'));
   box.append(head);
   const list=el('div','schedule-list');
   for(const entry of own())list.append(scheduleRow(entry,{pickSubject:false,remove:paint}));
   if(!own().length)list.append(el('p','schedule-empty','Set a regular time, like a weekly meeting. Notival offers to open a note for it when it starts, titled the way you like (for example "{date} - Staff Meeting").'));
   box.append(list);
   const upcoming=S.next(own(),now());
   if(upcoming)box.append(el('p','schedule-next','Next: '+S.when(upcoming,now())));
  };
  paint();return box;
 };

 // ── In the Focus menu ──────────────────────────────────────────────────────
 window.marginFocusMenuExtras=()=>{
  const items=[],due=state?S.due(schedule(),now(),handled()):null;
  if(due){const subject=subjectOf(due.entry.subjectId);items.push({name:'Start '+(subject?.name||'class')+' now',hint:S.span(due)+' · in today\'s note',action:()=>start(due)})}
  const upcoming=state?S.next(schedule(),now()):null;
  items.push({name:'Class schedule…',hint:upcoming?'Next: '+(subjectOf(upcoming.entry.subjectId)?.name||'class')+', '+S.when(upcoming,now()):'Set the times your classes happen',action:openSchedule});
  return items;
 };
 window.marginSchedule={openSchedule,check,start,setClock:fn=>{now=fn||(()=>Date.now())}};
 check();
})();
