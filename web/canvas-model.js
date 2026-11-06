/* Pure helpers for the Canvas integration: calendar feed parsing, merging into to-do lists, pairing. No network, no storage. */
const CanvasModel=(()=>{
 // The Canvas calendar feed link is the secret that lets Notival read due dates: school https address, /feeds/calendars/…ics.
 function normalizeFeedURL(input){
  let value=String(input||'').trim();if(!value)return null;
  if(/^webcal:\/\//i.test(value))value='https://'+value.slice(9);
  try{
   const url=new URL(value),local=url.hostname==='localhost'||url.hostname==='127.0.0.1';
   if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))return null;
   if(!local&&!url.hostname.includes('.'))return null;
   if(!url.pathname.startsWith('/feeds/calendars/')||!url.pathname.endsWith('.ics'))return null;
   return {url:url.origin+url.pathname+url.search,base:url.origin};
  }catch{return null}
 }
 // ---- reading the iCalendar text Canvas sends ----
 function unfold(text){return String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\n[ \t]/g,'')}
 const unescapeText=value=>String(value||'').replace(/\\n/gi,'\n').replace(/\\([,;\\])/g,'$1');
 function parseICS(text){
  const events=[];let current=null;
  for(const line of unfold(text).split('\n')){
   if(line==='BEGIN:VEVENT'){current={};continue}
   if(line==='END:VEVENT'){if(current)events.push(current);current=null;continue}
   if(!current)continue;
   const colon=line.indexOf(':');if(colon<1)continue;
   const [name,...params]=line.slice(0,colon).split(';'),value=line.slice(colon+1),key=name.toUpperCase();
   if(key==='UID')current.uid=value.trim();
   else if(key==='SUMMARY')current.summary=unescapeText(value).trim();
   else if(key==='DESCRIPTION')current.description=unescapeText(value);
   else if(key==='URL')current.url=value.trim();
   else if(key==='DTSTART')current.start={value:value.trim(),dateOnly:params.some(p=>/VALUE=DATE$/i.test(p))||/^\d{8}$/.test(value.trim())};
  }
  return events;
 }
 // 20261108T235900Z (UTC), 20261108T235900 (local), or 20261108 (all day) → an ISO instant
 function startToISO(start){
  const m=String(start?.value||'').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if(!m)return null;
  const [,y,mo,d,h,mi,sec,z]=m;
  if(!h)return new Date(+y,+mo-1,+d,23,59).toISOString();
  return (z?new Date(Date.UTC(+y,+mo-1,+d,+h,+mi,+(sec||0))):new Date(+y,+mo-1,+d,+h,+mi,+(sec||0))).toISOString();
 }
 // Canvas titles each event "Assignment name [Course name]". Keep the two parts apart.
 function splitSummary(summary){
  const match=String(summary||'').match(/^(.*?)\s*\[([^\[\]]+)\]\s*$/);
  return match?{title:match[1].trim(),course:match[2].trim()}:{title:String(summary||'').trim(),course:''};
 }
 const courseIdOf=event=>{
  const haystack=`${event.url||''} ${event.description||''}`;
  return (haystack.match(/include_contexts=course_(\d+)/)||haystack.match(/\/courses\/(\d+)/)||[])[1]||'';
 };
 // Only assignment-type events become tasks; class meetings and other calendar events are left alone.
 function eventsToAssignments(events){
  const out=[];
  for(const event of events){
   if(!/^event-assignment/.test(event.uid||''))continue;
   const {title,course}=splitSummary(event.summary),due=startToISO(event.start);
   if(!title)continue;
   const haystack=`${event.description||''} ${event.url||''}`;
   const link=(haystack.match(/https?:\/\/[^\s"<>\\]+\/courses\/\d+\/(?:assignments|quizzes|discussion_topics)\/\d+/)||[])[0]||event.url||'';
   const id=(String(event.uid).match(/assignment-(?:override-)?(\d+)/)||[])[1]||event.uid;
   const courseId=courseIdOf(event)||(course?'label:'+course.toLowerCase():'');
   out.push({id,name:title,due_at:due,html_url:link,course_id:courseId,course_label:course});
  }
  return out;
 }
 // The courses that appear in the feed, as pairing candidates.
 function feedCourses(assignments){
  const seen=new Map();
  for(const a of assignments){
   if(!a.course_id||seen.has(a.course_id))continue;
   seen.set(a.course_id,{id:a.course_id,name:a.course_label||'Course '+a.course_id,course_code:a.course_label||''});
  }
  return [...seen.values()].sort((x,y)=>x.name.localeCompare(y.name));
 }
 function localParts(iso){
  const when=new Date(iso);if(Number.isNaN(when.getTime()))return {};
  const pad=n=>String(n).padStart(2,'0');
  return {date:`${when.getFullYear()}-${pad(when.getMonth()+1)}-${pad(when.getDate())}`,time:`${pad(when.getHours())}:${pad(when.getMinutes())}`};
 }
 const isSubmitted=assignment=>{const s=assignment.submission;return !!s&&(!!s.submitted_at||['submitted','graded','pending_review'].includes(s.workflow_state))};
 // Bring a subject's checklist in line with its Canvas assignments. Canvas owns the title and due date; the student owns "done" once it is set.
 function merge(subject,assignments,{now=new Date(),horizonDays=14}={}){
  subject.checklist??=[];
  const stats={added:0,updated:0};
  const existing=new Map(subject.checklist.filter(task=>task.canvas?.id).map(task=>[String(task.canvas.id),task]));
  const cutoff=now.getTime()-horizonDays*86400000;
  for(const assignment of assignments||[]){
   if(!assignment||!assignment.name||assignment.published===false)continue;
   const key=String(assignment.id),task=existing.get(key),parts=assignment.due_at?localParts(assignment.due_at):{},submitted=isSubmitted(assignment);
   const due=assignment.due_at?new Date(assignment.due_at).getTime():null;
   if(!task&&(due===null||due<cutoff))continue;
   const canvas={id:key,courseId:String(assignment.course_id??subject.canvas?.courseId??''),url:assignment.html_url||'',points:assignment.points_possible??null,submitted};
   if(!task){
    subject.checklist.push({id:`canvas-${canvas.courseId}-${key}`,title:assignment.name,date:parts.date||'',time:parts.time||'',done:submitted,canvas});
    stats.added++;continue;
   }
   let changed=false;
   const set=(field,value)=>{if(task[field]!==value){task[field]=value;changed=true}};
   set('title',assignment.name);set('date',parts.date||'');set('time',parts.time||'');
   // Turning in the work on Canvas ticks the task; unticking is always the student's own choice.
   if(submitted&&!task.canvas.submitted&&!task.done){task.done=true;changed=true}
   if(JSON.stringify(task.canvas)!==JSON.stringify(canvas)){task.canvas=canvas;changed=true}
   if(changed)stats.updated++;
  }
  return stats;
 }
 const words=text=>String(text||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(word=>word.length>2);
 const letters=text=>String(text||'').toLowerCase().match(/[a-z]+/g)||[];
 // Suggest which Canvas course goes with which subject: shared words, word starts (Biol / Biology), and acronyms (CS 210 / Computer Science).
 function suggestPairing(subjects,courses){
  const taken=new Set(subjects.filter(s=>s.canvas?.courseId).map(s=>String(s.canvas.courseId))),result={};
  const score=(subject,course)=>{
   const mine=words(subject.name),acronym=letters(subject.name).map(word=>word[0]).join('');
   const theirs=[...words(course.name),...letters(course.course_code)];
   const courseTokens=new Set([...letters(course.name),...letters(course.course_code)]);
   let points=0;
   for(const word of mine)for(const other of theirs){
    if(word===other)points+=2;
    else if(word.length>=4&&other.length>=4&&(word.startsWith(other)||other.startsWith(word)))points+=1.5;
   }
   if(acronym.length>=2&&courseTokens.has(acronym))points+=2;
   return points;
  };
  for(const subject of subjects){
   if(subject.canvas?.courseId)continue;
   let best=null,bestScore=0;
   for(const course of courses){
    if(taken.has(String(course.id)))continue;
    const value=score(subject,course);
    if(value>bestScore){best=course;bestScore=value}
   }
   if(best){result[subject.id]=String(best.id);taken.add(String(best.id))}
  }
  return result;
 }
 return {normalizeFeedURL,parseICS,startToISO,splitSummary,eventsToAssignments,feedCourses,localParts,isSubmitted,merge,suggestPairing};
})();
if(typeof module!=='undefined')module.exports=CanvasModel;
