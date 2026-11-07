const assert=require('node:assert/strict');
const S=require('../web/schedule-model.js');
const MIN=60000;
// Friday 6 Nov 2026, local time (Saturday the 7th, Monday the 9th)
const at=(day,h,m=0)=>new Date(2026,10,day,h,m).getTime();
const bio={id:'b',subjectId:'bio',days:[1,3,5],start:'10:00',minutes:50};      // Mon Wed Fri
const zh={id:'z',subjectId:'zh',days:[2,4,5],start:'13:30',minutes:75};        // Tue Thu Fri
const schedule=[zh,bio,{id:'bad',subjectId:'x',days:[],start:'9:00',minutes:50}];

// Entries must make sense
assert(S.valid(bio)&&S.valid(zh));
for(const broken of [{...bio,days:[]},{...bio,start:'25:00'},{...bio,start:'nine'},{...bio,minutes:2},{...bio,minutes:600},{...bio,subjectId:''},{...bio,days:[7]}])assert(!S.valid(broken),JSON.stringify(broken));
assert.equal(S.parseTime('9:05'),545);assert.equal(S.parseTime('23:59'),1439);assert.equal(S.parseTime('24:00'),null);

// What's on today, in order (broken entries ignored)
const friday=S.onDay(schedule,at(6,8));
assert.deepEqual(friday.map(o=>o.entry.id),['b','z']);
assert.equal(friday[0].start,at(6,10));assert.equal(friday[0].end,at(6,10,50));assert.equal(friday[0].key,'b:2026-11-06');
assert.deepEqual(S.onDay(schedule,at(7,10)).map(o=>o.entry.id),[],'nothing on Saturday');

// A class is offered from five minutes before until twenty minutes in
assert.equal(S.due(schedule,at(6,9,54)),null,'too early');
assert.equal(S.due(schedule,at(6,9,55)).state,'soon');
assert.equal(S.due(schedule,at(6,10,0)).state,'now');
assert.equal(S.due(schedule,at(6,10,19)).entry.id,'b');
assert.equal(S.due(schedule,at(6,10,20)),null,'too late to start it now');
assert.equal(S.due(schedule,at(6,13,28)).entry.id,'z');
// started or waved off: not offered again that day, but offered again next time
assert.equal(S.due(schedule,at(6,10,2),{'b:2026-11-06':'started'}),null);
assert.equal(S.due(schedule,at(9,10,2),{'b:2026-11-06':'started'}).entry.id,'b','next Monday it is offered again');
// a short class ends before the late window does
const quick={id:'q',subjectId:'q',days:[5],start:'15:00',minutes:10};
assert.equal(S.due([quick],at(6,15,12)),null,'a ten-minute class is over at 15:10');

// The next class
assert.equal(S.next(schedule,at(6,8)).entry.id,'b');
assert.equal(S.next(schedule,at(6,10,30)).entry.id,'b','still under way');
assert.equal(S.next(schedule,at(6,11)).entry.id,'z');
const weekend=S.next(schedule,at(6,15));assert.equal(weekend.entry.id,'b');assert.equal(S.dayKey(weekend.start),'2026-11-09','after Friday afternoon comes Monday');
assert.equal(S.next([],at(6,8)),null);

// Words for it
assert.equal(S.minutesLeft(friday[0],at(6,9,57)),50,'before it starts: the whole class');
assert.equal(S.minutesLeft(friday[0],at(6,10,12)),38);
assert.equal(S.minutesLeft(friday[0],at(6,10,48)),5,'never less than five');
assert.equal(S.span(friday[0]),'10am–10:50am');assert.equal(S.span(friday[1]),'1:30pm–2:45pm');
assert.equal(S.daysLabel([5,1,3]),'Mon Wed Fri');assert.equal(S.daysLabel([1,2,3,4,5]),'Weekdays');assert.equal(S.daysLabel([0,1,2,3,4,5,6]),'Every day');assert.equal(S.daysLabel([0,6]),'Sat Sun');
assert.equal(S.when(friday[0],at(6,8)),'today 10am');assert.equal(S.when(weekend,at(6,15)),'Mon 10am');
assert.equal(S.when(S.next(schedule,at(7,20)),at(7,20)),'Mon 10am');
assert.equal(S.when(S.onDay([{...bio,days:[6]}],at(7,8))[0],at(6,20)),'tomorrow 10am');

// Today's note for a subject
const notes=[{id:'old',projectId:'bio',classDate:'2026-11-04'},{id:'today',projectId:'bio',classDate:'2026-11-06'},{id:'other',projectId:'zh',classDate:'2026-11-06'}];
assert.equal(S.classNote(notes,'bio',at(6,10)).id,'today');assert.equal(S.classNote(notes,'bio',at(9,10)),null);

console.log('PASS: schedule — valid entries, today\'s classes, offered from 5 min before to 20 min in, once per day, next class, labels, today\'s note.');
