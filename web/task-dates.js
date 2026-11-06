/* Small, deterministic English date parser. Dates stay in the Mac's local time. */
const TaskDates=(()=>{
 const pad=n=>String(n).padStart(2,'0');
 const key=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 const dayPattern='(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)';
 const monthPattern='(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
 const datePattern=`(?:today|tomorrow|tonight|in \\d{1,3} days?|(?:(?:next|this) )?${dayPattern}|\\d{4}-\\d{2}-\\d{2}|${monthPattern} \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?)`;
 const pattern=new RegExp(`(?:\\s+(?:due|by|on)\\s+|\\s+|^)(${datePattern})(?:\\s+(?:at\\s+)?(noon|midnight|\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)|\\d{1,2}:\\d{2}))?[.!]?\\s*$`,'i');
 function timeOf(value){if(!value)return '';const s=value.toLowerCase().replace(/[.\s]/g,'');if(s==='noon')return '12:00';if(s==='midnight')return '00:00';const m=s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);if(!m)return null;let h=+m[1],min=+(m[2]||0);if(min>59||h>(m[3]?12:23)||(m[3]&&h<1))return null;if(m[3])h=h%12+(m[3]==='pm'?12:0);return pad(h)+':'+pad(min)}
 function parse(text,now=new Date()){
  // Repeats and time zones require a richer scheduler; never silently discard them.
  if(/\b(?:every|each|daily|weekly|monthly|yearly)\b/i.test(text))return null;
  const match=String(text).match(pattern);if(!match)return null;
  const phrase=match[1].toLowerCase(),time=timeOf(match[2]);if(time===null)return null;
  const date=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12),today=key(date);
  if(phrase==='tomorrow')date.setDate(date.getDate()+1);
  else if(/^in /.test(phrase))date.setDate(date.getDate()+parseInt(phrase.slice(3),10));
  else if(!['today','tonight'].includes(phrase)){
   const weekday=phrase.match(new RegExp(`^(?:(next|this) )?(${dayPattern})$`));
   if(weekday){const index=days.findIndex(d=>d.startsWith(weekday[2].slice(0,3)));let offset=(index-date.getDay()+7)%7;if(weekday[1]==='next'&&offset===0)offset=7;date.setDate(date.getDate()+offset)}
   else{
    let y,m,d;const iso=phrase.match(/^(\d{4})-(\d{2})-(\d{2})$/),named=phrase.match(new RegExp(`^(${monthPattern}) (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?$`));
    if(iso){y=+iso[1];m=+iso[2]-1;d=+iso[3]}else if(named){y=named[3]?+named[3]:date.getFullYear();m=months.findIndex(n=>n.startsWith(named[1].slice(0,3)));d=+named[2]}else return null;
    date.setFullYear(y,m,d);if(date.getFullYear()!==y||date.getMonth()!==m||date.getDate()!==d)return null;
    if(named&&!named[3]&&key(date)<today){date.setFullYear(y+1,m,d);if(date.getMonth()!==m||date.getDate()!==d)return null}
   }
  }
  if(!Number.isFinite(date.getTime()))return null;
  if(time&&days.some(d=>phrase.endsWith(d)||phrase.endsWith(d.slice(0,3)))&&!phrase.startsWith('this ')&&key(date)===today&&new Date(`${key(date)}T${time}`)<now)date.setDate(date.getDate()+7);
  const title=text.slice(0,match.index).trim();if(!title)return null;
  return {title,date:key(date),time,phrase:match[0].trim()};
 }
 function format(date,time=''){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return '';const d=new Date(`${date}T${time||'12:00'}`);return d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'})+(time?' · '+d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'')}
 function overdue(item,now=new Date()){if(!item.date)return false;return item.time?new Date(`${item.date}T${item.time}`)<now:item.date<key(now)}
 return {parse,format,overdue,key};
})();
