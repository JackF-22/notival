// A student's timetable: which classes happen when, and which one is about to start.
// Pure functions over plain data, so they can be tested without a window.
//   entry: {id, subjectId, days:[0..6] (0 = Sunday), start:'HH:MM', minutes}
const ScheduleModel=(()=>{
 const MINUTE=60000,DAY=24*60*MINUTE;
 const LEAD=5*MINUTE;              // offer a class this long before it starts
 const LATE=20*MINUTE;             // …and for this long after, if it wasn't started
 const DAY_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

 const parseTime=text=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(text||'').trim());if(!m)return null;const h=+m[1],min=+m[2];return h<24&&min<60?h*60+min:null};
 function valid(entry){
  return !!entry&&!!entry.subjectId&&Array.isArray(entry.days)&&entry.days.length>0&&entry.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6)
   &&parseTime(entry.start)!==null&&Number.isFinite(entry.minutes)&&entry.minutes>=5&&entry.minutes<=300;
 }
 // Local calendar date as YYYY-MM-DD (what "today" means to the student).
 const dayKey=time=>{const d=new Date(time);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const atMinutes=(time,minutes)=>{const d=new Date(time);d.setHours(0,0,0,0);d.setMinutes(minutes);return d.getTime()};

 // Every class on the day that contains `time`, in order.
 function onDay(schedule,time){
  const weekday=new Date(time).getDay();
  return (schedule||[]).filter(valid).filter(entry=>entry.days.includes(weekday)).map(entry=>{
   const start=atMinutes(time,parseTime(entry.start));
   return {entry,start,end:start+entry.minutes*MINUTE,key:entry.id+':'+dayKey(start)};
  }).sort((a,b)=>a.start-b.start);
 }
 // The class to offer right now: starting within LEAD, or under way and less than LATE in. `handled` is a map of
 // occurrence keys the student already started or waved off, so nothing is offered twice.
 function due(schedule,now,handled={}){
  for(const occurrence of onDay(schedule,now)){
   if(handled[occurrence.key])continue;
   if(now>=occurrence.start-LEAD&&now<Math.min(occurrence.end,occurrence.start+LATE))return {...occurrence,state:now<occurrence.start?'soon':'now'};
  }
  return null;
 }
 // The next class that hasn't ended, looking up to a week ahead.
 function next(schedule,now){
  for(let day=0;day<8;day++){
   const found=onDay(schedule,now+day*DAY).find(occurrence=>occurrence.end>now);
   if(found)return found;
  }
  return null;
 }
 // Minutes left in a class, for class mode's timer: never less than five.
 const minutesLeft=(occurrence,now)=>Math.max(5,Math.ceil((occurrence.end-Math.max(now,occurrence.start))/MINUTE));
 const clock=minutes=>{const h=Math.floor(minutes/60),m=minutes%60,suffix=h<12?'am':'pm',h12=h%12||12;return h12+(m?':'+String(m).padStart(2,'0'):'')+suffix};
 const timeLabel=time=>{const d=new Date(time);return clock(d.getHours()*60+d.getMinutes())};
 const span=occurrence=>timeLabel(occurrence.start)+'–'+timeLabel(occurrence.end);
 const daysLabel=days=>{
  const sorted=[...days].sort((a,b)=>((a+6)%7)-((b+6)%7));     // Monday first
  if(sorted.length===5&&[1,2,3,4,5].every(d=>days.includes(d)))return 'Weekdays';
  if(sorted.length===7)return 'Every day';
  return sorted.map(d=>DAY_NAMES[d]).join(' ');
 };
 // "today", "tomorrow", or the weekday, for the next class.
 function when(occurrence,now){
  const today=dayKey(now),day=dayKey(occurrence.start),tomorrow=dayKey(now+DAY);
  return (day===today?'today':day===tomorrow?'tomorrow':DAY_NAMES[new Date(occurrence.start).getDay()])+' '+timeLabel(occurrence.start);
 }

 // Today's note for a subject: the one made for a class on this date, if there is one.
 const classNote=(notes,subjectId,time)=>(notes||[]).find(note=>note.projectId===subjectId&&note.classDate===dayKey(time))||null;

 // The title of a scheduled note: the student's own pattern, e.g. "{date} - CoStaff Meeting". {date} is "Tue, Nov 11",
 // {iso} is 2026-11-11 (sorts well), {weekday} and {subject} are what they say. With no pattern: "Subject · date".
 const dateText=time=>new Date(time).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
 function noteTitle(entry,subjectName,time){
  const pattern=String(entry?.title||'').trim();
  if(!pattern)return subjectName+' · '+dateText(time);
  const values={date:dateText(time),iso:dayKey(time),weekday:new Date(time).toLocaleDateString(undefined,{weekday:'long'}),subject:subjectName};
  return pattern.replace(/\{(\w+)\}/g,(whole,name)=>values[name.toLowerCase()]??whole);
 }
 return {noteTitle,MINUTE,LEAD,LATE,DAY_NAMES,parseTime,valid,dayKey,onDay,due,next,minutesLeft,timeLabel,span,daysLabel,when,classNote};
})();
if(typeof module!=='undefined')module.exports=ScheduleModel;
