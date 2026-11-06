const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const P=vm.runInNewContext(fs.readFileSync('web/study-plan-model.js','utf8')+'\nStudyPlanModel');
const area=(id,extra={})=>({id,name:id,flags:0,weak:0,...extra});
const all=[0,1,2,3,4,5,6];
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));

// Refuses nonsense dates and empty tests
assert.match(P.build({from:'2026-11-10',test:'2026-11-10',areas:[area('a')]}).problem,/after today/);
assert.match(P.build({from:'2026-11-10',test:'2026-11-20',areas:[]}).problem,/Add units or notes/);

// Ten days out, three units: every area is learned, the last stretch is mixed practice, and the day before is the final review
let r=P.build({from:'2026-11-10',test:'2026-11-20',areas:[area('a'),area('b'),area('c')],confidence:{a:1,b:2,c:3}});
assert.equal(r.sessions.length,10);
assert.equal(r.sessions[0].date,'2026-11-10');assert.equal(r.sessions.at(-1).date,'2026-11-19');
assert.equal(r.sessions.at(-1).kind,'final');
same(r.sessions.at(-1).areaIds.slice().sort(),['a','b','c']);
const learn=r.sessions.filter(s=>s.kind==='learn'),practice=r.sessions.filter(s=>s.kind==='practice');
assert.equal(learn.length,7);assert.equal(practice.length,2);
const count=id=>learn.filter(s=>s.areaIds.includes(id)).length;
assert.ok(count('a')>count('c'),'the shakiest area gets the most sessions');
assert.ok(['a','b','c'].every(id=>count(id)>=1),'nothing is skipped');
assert.equal(learn[0].areaIds[0],'a','hardest first');
assert.ok(r.sessions.every((s,i,a)=>!i||a[i-1].date<s.date),'one session a day, in order');
assert.ok(r.sessions.every(s=>s.date<'2026-11-20'),'nothing on or after the test');

// Flags and weak recall raise an area's need
assert.ok(P.need(area('x',{flags:2,weak:1}),2)>P.need(area('x'),2));
r=P.build({from:'2026-11-10',test:'2026-11-20',areas:[area('a'),area('b',{flags:3})]});
assert.equal(r.sessions[0].areaIds[0],'b');

// More areas than days: sessions carry several areas, still covering all
r=P.build({from:'2026-11-10',test:'2026-11-14',areas:['a','b','c','d','e','f'].map(id=>area(id))});
assert.equal(r.sessions.length,4);
same([...new Set(r.sessions.filter(s=>s.kind==='learn').flatMap(s=>s.areaIds))].sort(),['a','b','c','d','e','f']);

// Allowed weekdays are respected, but the day before the test is always used
r=P.build({from:'2026-11-09',test:'2026-11-20',weekdays:[1,3],areas:[area('a'),area('b')]}); // Mon & Wed; Nov 9 is a Monday
assert.ok(r.sessions.slice(0,-1).every(s=>[1,3].includes(P.parse(s.date).getDay())));
assert.equal(r.sessions.at(-1).date,'2026-11-19');                                          // a Thursday, kept anyway

// Tomorrow's test: a single final review today
r=P.build({from:'2026-11-10',test:'2026-11-11',areas:[area('a'),area('b')]});
same(r.sessions.map(s=>s.kind),['final']);

// Falling behind: missed sessions are rebuilt from today, done work is kept, slipped areas get more time
const settings={weekdays:all,minutes:45,confidence:{a:2,b:2}};
const areas=[area('a'),area('b')];
let plan={sessions:P.build({from:'2026-11-10',test:'2026-11-20',areas,confidence:settings.confidence}).sessions};
plan.sessions[0].done=true;                                // finished day 1; missed days 2 and 3
const today='2026-11-13';
assert.equal(P.missed(plan,today).length,2);
const again=P.replan(plan,settings,{today,test:'2026-11-20',areas});
assert.equal(again.missed,2);
assert.ok(again.sessions.some(s=>s.done&&s.date==='2026-11-10'),'finished work stays');
assert.ok(again.sessions.filter(s=>!s.done).every(s=>s.date>=today),'nothing left in the past');
assert.equal(again.sessions.at(-1).kind,'final');
assert.equal(P.missed({sessions:again.sessions},today).length,0);
assert.equal(P.next({sessions:again.sessions},today).date,today);
same(P.progress({sessions:again.sessions}).done,1);
console.log('PASS: the study plan works back from the test date, weights weak areas, and re-plans after missed days.');
