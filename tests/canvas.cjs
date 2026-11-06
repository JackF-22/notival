const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const model=vm.runInNewContext(fs.readFileSync('web/canvas-model.js','utf8')+'\nCanvasModel',{URL});
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
// The feed link: a school's own https address, /feeds/calendars/…ics; webcal links are accepted.
same(model.normalizeFeedURL('https://school.instructure.com/feeds/calendars/user_abc123.ics'),{url:'https://school.instructure.com/feeds/calendars/user_abc123.ics',base:'https://school.instructure.com'});
assert.equal(model.normalizeFeedURL('webcal://school.instructure.com/feeds/calendars/user_abc.ics').url,'https://school.instructure.com/feeds/calendars/user_abc.ics');
same(model.normalizeFeedURL(' https://canvas.uni.edu/feeds/calendars/user_x.ics '),model.normalizeFeedURL('https://canvas.uni.edu/feeds/calendars/user_x.ics'));
assert.equal(model.normalizeFeedURL('http://school.instructure.com/feeds/calendars/user_abc.ics'),null);
assert.equal(model.normalizeFeedURL('https://school.instructure.com/calendar'),null);
assert.equal(model.normalizeFeedURL('https://evil.example/login.ics'),null);
assert.equal(model.normalizeFeedURL('javascript:alert(1)'),null);
assert.equal(model.normalizeFeedURL('not a link'),null);
assert.equal(model.normalizeFeedURL('http://127.0.0.1:8123/feeds/calendars/user_t.ics').base,'http://127.0.0.1:8123');
// Reading what Canvas sends: folded lines, escapes, UTC, local and all-day times, and non-assignment events.
const ics=[
 'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Instructure//Canvas//EN',
 'BEGIN:VEVENT','UID:event-assignment-11','DTSTART:20261108T235900Z','SUMMARY:Lab 3\\, part 1 [BIOL 101: Intro to Biology]',
 'DESCRIPTION:Write up the results\\n\\nhttps://school.instructure.com/courses/101/assign',' ments/11','URL;VALUE=URI:https://school.instructure.com/calendar?event_id=9&include_contexts=course_101','END:VEVENT',
 'BEGIN:VEVENT','UID:event-assignment-12','DTSTART;VALUE=DATE:20261110','SUMMARY:Reflection [CS 210]','DESCRIPTION:Think.','URL:https://school.instructure.com/calendar?include_contexts=course_202','END:VEVENT',
 'BEGIN:VEVENT','UID:event-calendar-event-77','DTSTART:20261109T150000Z','SUMMARY:Office hours [CS 210]','END:VEVENT',
 'BEGIN:VEVENT','UID:event-assignment-13','DTSTART:20261112T180000','SUMMARY:No course in the title','END:VEVENT',
 'END:VCALENDAR',''].join('\r\n');
const events=model.parseICS(ics);
assert.equal(events.length,4);
assert.equal(events[0].summary,'Lab 3, part 1 [BIOL 101: Intro to Biology]');
assert.match(events[0].description,/courses\/101\/assignments\/11/,'folded lines are joined');
const assignments=model.eventsToAssignments(events);
assert.equal(assignments.length,3,'calendar events that are not assignments are skipped');
same(assignments.map(a=>[a.id,a.name,a.course_id,a.course_label]),[['11','Lab 3, part 1','101','BIOL 101: Intro to Biology'],['12','Reflection','202','CS 210'],['13','No course in the title','','']]);
assert.equal(assignments[0].html_url,'https://school.instructure.com/courses/101/assignments/11');
assert.equal(new Date(assignments[0].due_at).toISOString(),'2026-11-08T23:59:00.000Z');
assert.equal(new Date(assignments[1].due_at).getHours(),23,'an all-day date is due at the end of that day');
assert.equal(model.startToISO({value:'garbage'}),null);
same(model.feedCourses(assignments).map(c=>[c.id,c.name]),[['101','BIOL 101: Intro to Biology'],['202','CS 210']]);
same(model.splitSummary('Quiz [Part [1]] [HIST 100]'),{title:'Quiz [Part [1]]',course:'HIST 100'});
// Merge: add, update, never duplicate, never auto-untick.
const now=new Date('2026-11-05T12:00:00');
const subject={id:'bio',name:'Biology',canvas:{courseId:'7'},checklist:[{id:'manual',title:'My own task',done:false}]};
const iso=days=>new Date(now.getTime()+days*86400000).toISOString();
const base=[
 {id:'1',course_id:7,name:'Lab 3',due_at:iso(3),html_url:'https://s/c/7/a/1',points_possible:20,submission:{workflow_state:'unsubmitted'}},
 {id:'2',course_id:7,name:'Quiz 2',due_at:iso(1),html_url:'https://s/c/7/a/2',submission:{workflow_state:'graded',submitted_at:iso(-1)}},
 {id:'3',course_id:7,name:'Old one',due_at:iso(-40),submission:{workflow_state:'unsubmitted'}},
 {id:'4',course_id:7,name:'No due date',due_at:null},
 {id:'5',course_id:7,name:'Hidden',due_at:iso(2),published:false}
];
same(model.merge(subject,base,{now}),{added:2,updated:0});
assert.equal(subject.checklist.length,3);
assert.equal(subject.checklist[0].title,'My own task');
const lab=subject.checklist.find(t=>t.canvas?.id==='1'),quiz=subject.checklist.find(t=>t.canvas?.id==='2');
assert.equal(lab.done,false);assert.equal(quiz.done,true);assert.match(lab.date,/^\d{4}-\d{2}-\d{2}$/);assert.match(lab.time,/^\d{2}:\d{2}$/);
assert.equal(lab.canvas.url,'https://s/c/7/a/1');
// Running it again changes nothing.
same(model.merge(subject,base,{now}),{added:0,updated:0});
// Canvas renames and moves it; submitting ticks it; unticking by the student sticks.
base[0]={...base[0],name:'Lab 3 (revised)',due_at:iso(5),submission:{workflow_state:'submitted',submitted_at:iso(0)}};
same(model.merge(subject,base,{now}),{added:0,updated:1});
assert.equal(lab.title,'Lab 3 (revised)');assert.equal(lab.done,true);
lab.done=false;
same(model.merge(subject,base,{now}),{added:0,updated:0});
assert.equal(lab.done,false,'a student who unticks a submitted task keeps it unticked');
// Pairing suggestions.
const subjects=[{id:'b',name:'Biology'},{id:'c',name:'Computer Science'},{id:'h',name:'History'},{id:'p',name:'Already',canvas:{courseId:'9'}}];
const courses=[{id:1,name:'BIOL 101: Intro to Biology',course_code:'BIOL101'},{id:2,name:'CS 210 Data Structures and Computer Science',course_code:'CS210'},{id:9,name:'Taken',course_code:'X'},{id:3,name:'Art Appreciation',course_code:'ART100'}];
same(model.suggestPairing(subjects,courses),{b:'1',c:'2'});
// Acronyms and word starts, with no false match on an unrelated course.
const abbreviated=[{id:'m',name:'Calculus II'},{id:'e',name:'English Composition'},{id:'p',name:'Psychology'}];
const odd=[{id:5,name:'MATH 152 Calculus II',course_code:'MATH152'},{id:6,name:'ENGL 101',course_code:'ENGL101'},{id:7,name:'PSYC 100 Intro',course_code:'PSYC100'},{id:8,name:'Chemistry Lab',course_code:'CHEM110'}];
same(model.suggestPairing(abbreviated,odd),{m:'5',e:'6',p:'7'});
same(model.suggestPairing([{id:'x',name:'Zoology'}],odd),{});
console.log('PASS: Canvas feed links, calendar parsing, merging without duplicates or auto-unticking, and pairing suggestions.');
