const assert=require('node:assert/strict');
const F=require('../web/focus-model.js'),T=require('../web/tree-art.js');
const S=1000,MIN=60*S,t0=1e12;
// run a session through a script of [seconds, focused] steps, ticking once a second
const run=(session,steps,from=t0)=>{let now=from;for(const [seconds,focused] of steps)for(let i=0;i<seconds;i++){now+=S;F.advance(session,now,focused)}return now};

// Staying focused grows focused time and nothing else
let s=F.start({id:'a',now:t0,seed:1});
let now=run(s,[[120,true]]);
assert.equal(s.focusedMs,120*S);assert.equal(s.awayMs,0);assert.equal(F.ratio(s),1);

// Time away doesn't grow the tree and counts once it is long enough to be an episode
now=run(s,[[40,false],[60,true]],now);
assert.equal(s.focusedMs,180*S);assert.equal(s.awayMs,40*S);assert.equal(s.awayCount,1);
assert.equal(+F.ratio(s).toFixed(3),+(180/220).toFixed(3));
// A glance away shorter than 15s is time away but not an "away"
now=run(s,[[8,false],[30,true]],now);
assert.equal(s.awayCount,1);assert.equal(s.awayMs,48*S);

// "Looking something up": neutral, on either side
s=F.start({id:'b',now:t0});now=run(s,[[60,true]]);
F.beginLookup(s,now);now=run(s,[[90,false],[30,true]],now);
assert.equal(s.lookupMs,90*S);assert.equal(s.awayMs,0);assert.equal(s.awayCount,0);assert.equal(s.lookups,1);assert.equal(F.ratio(s),1);
// the lookup window expires: a longer trip is partly away
F.beginLookup(s,now);now=run(s,[[F.LOOKUP_WINDOW/S+60,false],[10,true]],now);
assert.equal(s.lookupMs,90*S+F.LOOKUP_WINDOW);assert.equal(s.awayMs,60*S);
// the window is used up by one trip
now=run(s,[[40,false],[10,true]],now);assert.equal(s.awayMs,100*S);

// Telling it afterwards: "that was a lookup" moves the last trip to neutral
s=F.start({id:'c',now:t0});now=run(s,[[60,true],[100,false],[20,true]]);
assert.equal(s.awayMs,100*S);assert.equal(s.awayCount,1);
assert.equal(F.reclassify(s),true);
assert.equal(s.awayMs,0);assert.equal(s.lookupMs,100*S);assert.equal(s.awayCount,0);assert.equal(s.lookups,1);assert.equal(F.ratio(s),1);
assert.equal(F.reclassify(s),false,'only once');

// A sleeping laptop is not "away": long gaps are not counted either way
s=F.start({id:'d',now:t0});now=run(s,[[30,true]]);
F.advance(s,now+2*60*MIN,true);
assert.equal(s.focusedMs,30*S);assert.equal(s.unobservedMs,2*60*MIN);assert.equal(s.awayMs,0);

// Finishing: still-open time away is closed, and the last stretch counts as presence
s=F.start({id:'e',now:t0,subjectId:'bio',noteId:'n'});now=run(s,[[600,true],[45,false]]);
const record=F.finish(s,now+3*S);
assert.equal(record.subjectId,'bio');assert.equal(record.awayCount,1);assert.equal(record.focusedMs,603*S);assert.equal(record.awayMs,45*S);
assert.equal(record.ratio,+(603/648).toFixed(3));assert.equal(record.endedAt,now+3*S);

// A planned class length counts down on the wall clock, whether or not you are here
s=F.start({id:'f',now:t0,plannedMs:50*MIN});
assert.equal(F.remaining(s,t0),50*MIN);assert.equal(F.remaining(s,t0+20*MIN),30*MIN);
assert.equal(F.progress(s,t0+25*MIN),.5);assert.equal(F.progress(s,t0+90*MIN),1,'progress stops at full');
run(s,[[60,false]]);assert.equal(F.remaining(s,t0+60*S),50*MIN-60*S,'time away does not pause the class');
assert(F.remaining(s,t0+55*MIN)<0,'negative once it runs over');
F.extend(s,10*MIN);assert.equal(s.plannedMs,60*MIN);assert.equal(F.remaining(s,t0+55*MIN),5*MIN);
const open=F.start({id:'g',now:t0});assert.equal(F.remaining(open,t0+5*MIN),null,'no timer, no countdown');assert.equal(F.progress(open,t0+5*MIN),0);
F.extend(open,15*MIN);assert.equal(open.plannedMs,15*MIN,'extending an open-ended class sets a limit from now');
s.wordsAdded=212;const planned=F.finish(s,t0+50*MIN);assert.equal(planned.plannedMs,60*MIN);assert.equal(planned.wordsAdded,212);

// Growth and stages
assert.equal(F.growth(0),0);assert.equal(F.growth(60*MIN),1);
assert(F.growth(5*MIN)>0.2,'early minutes show visible growth');
assert(F.growth(10*MIN)>F.growth(5*MIN)&&F.growth(30*MIN)>F.growth(10*MIN));
assert.deepEqual([0,2,10,20,40,55].map(m=>F.stage(m*MIN)),['Seed','Sprout','Sapling','Young tree','Tree','Grand tree']);
assert(F.density(1)>F.density(.5)&&F.density(.5)>F.density(0));assert(F.density(0)>0);

// Words stay kind
for(const [r,focused] of [[.95,50],[.8,50],[.5,50],[.2,50],[1,0.5]]){
 const text=F.verdict({ratio:r,focusedMs:focused*MIN,awayCount:2});assert(text.length>10&&!/fail|bad|lazy|distract/i.test(text),text);
}
assert.match(F.verdict({ratio:1,focusedMs:30*S,awayCount:0}),/seed/i);
assert.equal(F.duration(754*S),'12:34');assert.equal(F.duration(3725*S),'1:02:05');assert.equal(F.minutesLabel(95*MIN),'1 h 35 min');

// Garden totals
const sessions=[
 {subjectId:'bio',focusedMs:30*MIN,awayMs:10*MIN,endedAt:t0},{subjectId:'bio',focusedMs:20*MIN,awayMs:0,endedAt:t0-1*MIN},
 {subjectId:'zh',focusedMs:10*MIN,awayMs:10*MIN,endedAt:t0-30*24*60*MIN},{subjectId:null,focusedMs:5*MIN,awayMs:0,endedAt:t0}];
const stats=F.gardenStats(sessions,t0+MIN);
assert.equal(stats.weekFocusedMs,55*MIN);assert.equal(stats.weekCount,3);assert.equal(stats.total,4);
assert.equal(stats.subjects[0].subjectId,'bio');assert.equal(+stats.subjects[0].ratio.toFixed(3),+(50/60).toFixed(3));
assert.equal(stats.subjects.find(x=>x.subjectId==='zh').ratio,.5);

// Trees: deterministic, bigger with focus, fuller with presence, and always drawable
const shapes=o=>T.build(o),count=o=>{const b=shapes(o);return b.branches.length+b.leaves.length};
assert.equal(T.svg({seed:7,growth:.6,density:.8}),T.svg({seed:7,growth:.6,density:.8}),'same seed, same tree');
assert.notEqual(T.svg({seed:7,growth:.6,density:.8}),T.svg({seed:8,growth:.6,density:.8}));
assert.equal(shapes({seed:3,growth:0,density:1}).shape,'seed');assert.equal(shapes({seed:3,growth:.04,density:1}).shape,'sprout');assert.equal(shapes({seed:3,growth:.5,density:1}).shape,'tree');
const sizes=[.1,.25,.5,.75,1].map(g=>count({seed:9,growth:g,density:1}));
assert(sizes.every((n,i)=>!i||n>=sizes[i-1]),'bigger with growth: '+sizes);assert(sizes.at(-1)>sizes[0]*3);
assert(count({seed:9,growth:.9,density:1})>count({seed:9,growth:.9,density:.1}),'fuller when you stayed');
assert(shapes({seed:9,growth:.9,density:.1}).fallen.length>shapes({seed:9,growth:.9,density:1}).fallen.length,'a drifting class drops leaves');
for(const g of [0,.03,.1,.5,1])for(const d of [0,.5,1]){const out=T.svg({seed:5,growth:g,density:d,color:'#4a9d6f'});assert(out.startsWith('<svg')&&out.length<40000&&!/NaN|undefined/.test(out),g+' '+d)}
assert(T.svg({seed:1,growth:1,density:1,color:'#d4584a'}).includes('hsl('),'subject colour drives the leaves');
assert(!/NaN/.test(T.svg({seed:1,growth:1,density:1,color:'not a colour'})),'bad colours fall back');

console.log('PASS: focus model — focus vs away vs lookups, sleep gaps, growth and stages, garden totals; trees are deterministic and respond to focus.');
