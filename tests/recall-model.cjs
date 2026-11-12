const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const M=vm.runInNewContext(fs.readFileSync('web/knowledge.js','utf8')+'\n'+fs.readFileSync('web/recall-model.js','utf8')+'\nRecallModel');
const DAY=86400000,now=1e12;
const note=(id,text,extra={})=>({id,title:id,projectId:'p',blocks:[{id:id+'-b',type:'text',text}],...extra});

// Markup: Q:/A: pairs and {{cloze}} become items with stable ids
const markup=M.parseMarkup('Q: What organelle makes ATP?\nA: The mitochondrion\n\nThe {{nucleus::organelle}} stores DNA and the {{ribosome}} builds protein.\n- **Q:** Why is water polar? **A:** Uneven electron sharing');
assert.equal(markup.filter(m=>m.type==='qa').length,2);
const clozes=markup.filter(m=>m.type==='cloze');assert.equal(clozes.length,2);assert.equal(clozes[1].blank,'ribosome');
assert.equal(clozes[0].blank,'nucleus');assert.equal(clozes[0].hint,'organelle');assert.equal(clozes[0].text,'The nucleus stores DNA and the ribosome builds protein.');
assert.equal(M.parseMarkup('Q: Unanswered question?').length,0);
assert.equal(M.parseMarkup('```\nQ: code\nA: not an item\n```').length,0);

const a=note('Bio','Q: What organelle makes ATP?\nA: The mitochondrion\n\nThe {{nucleus}} stores DNA.');
const items=M.collect({notes:[a]},{projectId:'p'});
assert(items.some(i=>i.type==='qa'&&i.answer==='The mitochondrion'));
const cloze=items.find(i=>i.type==='cloze');assert.equal(M.promptText(cloze),'The […] stores DNA.');
// Editing the answer keeps the id (review history survives); editing the question does not
const idOf=n=>M.collect({notes:[n]},{projectId:'p'}).find(i=>i.type==='qa').id;
assert.equal(idOf(a),idOf(note('Bio','Q: What organelle makes ATP?\nA: Mitochondria, via respiration')));
assert.notEqual(idOf(a),idOf(note('Bio','Q: Which organelle makes ATP?\nA: The mitochondrion')));
// Blocks with markup don't also produce generic passage cards
assert(!items.some(i=>i.origin==='legacy'&&i.blockId==='Bio-b'));

// Student-made items are scoped, and suspended items are excluded
const state={notes:[a,note('Chem','Water is polar because oxygen pulls electrons harder than hydrogen does.',{projectId:'q'})],items:[
 M.newItem({id:'m1',type:'qa',prompt:'  Why?  ',answer:' Because ',noteId:'Bio',projectId:'p'}),
 M.newItem({id:'m2',type:'cloze',text:'Osmosis moves water.',blank:'water',projectId:'q'}),
 M.newItem({id:'m3',type:'explain',prompt:'Explain diffusion',answer:'',projectId:'p'})]};
let scoped=M.collect(state,{projectId:'p'});
assert(scoped.some(i=>i.id==='m1'&&i.prompt==='Why?'));assert(!scoped.some(i=>i.id==='m2'));assert(scoped.some(i=>i.id==='m3'));
assert(M.validItem(state.items[0])&&M.validItem(state.items[1])&&M.validItem(state.items[2]));
assert(!M.validItem(M.newItem({type:'cloze',text:'No match',blank:'zzz'})));assert(!M.validItem(M.newItem({type:'qa',prompt:'only prompt',answer:''})));
state.suspended={m1:true};assert(!M.collect(state,{projectId:'p'}).some(i=>i.id==='m1'));assert(M.collectAll(state,{projectId:'p'}).some(i=>i.id==='m1'));
// Test-pack scope: only items from the chosen notes
assert(M.collect({...state,suspended:{}},{notes:[a]}).every(i=>i.noteId==='Bio'));

// Scheduler (a memory model: stability and difficulty per item, with learning steps)
let r=M.schedule(null,'Good',now);assert.equal(r.interval,1,'a new item is checked again after a day');assert(r.stability>0&&r.difficulty>=1&&r.difficulty<=10);
r=M.schedule(r,'Good',r.due);assert(r.interval>=5&&r.interval<=20,'a good review at the right time stretches it to a week or more: '+r.interval);
const before=r.interval;r=M.schedule(r,'Good',r.due);assert(r.interval>before*1.5,'and it keeps growing: '+before+' → '+r.interval);
const lapsed=M.schedule(r,'Again',r.due);assert.equal(lapsed.interval,0);assert.equal(lapsed.lapses,1);assert(lapsed.stability<r.stability,'forgetting shrinks stability');assert(lapsed.difficulty>r.difficulty,'and makes it harder');assert.equal(lapsed.due,r.due+600000);
const back=M.schedule(lapsed,'Good',lapsed.due+600000);assert.equal(back.interval,1,'after a lapse it is confirmed the next day');
assert(M.schedule(null,'Easy',now).interval>M.schedule(null,'Good',now).interval);
assert.equal(M.schedule({interval:170,reps:5,ease:2.5},'Easy',now).interval,180,'intervals stop at 180 days');
const early=M.schedule(r,'Good',r.reviewedAt+DAY);assert.equal(early.due,r.due);assert.equal(early.interval,r.interval,'practising early changes nothing');
assert.equal(M.schedule({interval:80,due:0},'Again',100).due,600100);   // legacy records still work
const legacy=M.schedule({interval:10,due:now,ease:2.5,reps:3,reviewedAt:now-10*DAY,lapses:0},'Good',now);assert(legacy.interval>10&&legacy.stability>10,'an older record carries on from its interval');
const easyHard=[M.schedule(r,'Hard',r.due),M.schedule(r,'Good',r.due),M.schedule(r,'Easy',r.due)].map(x=>x.interval);assert(easyHard[0]<=easyHard[1]&&easyHard[1]<=easyHard[2],'Hard ≤ Good ≤ Easy: '+easyHard);
// A review made later than due earns more than one made on time, and an easy item grows faster than a hard one
const late2=M.schedule(r,'Good',r.due+10*DAY);assert(late2.stability>M.schedule(r,'Good',r.due).stability,'remembering after a long gap is worth more');
const easy1={...r,difficulty:2},hard1={...r,difficulty:9};assert(M.schedule(easy1,'Good',r.due).stability>M.schedule(hard1,'Good',r.due).stability);
assert.equal(Object.keys(M.preview(null,now)).join(),'Again,Hard,Good,Easy');
// A test coming up caps how far an item can drift; your calibration stretches or shrinks the rest
const noExam=M.schedule(r,'Good',r.due),withExam=M.schedule(r,'Good',r.due,{examDays:6});assert.equal(withExam.interval,3,'six days to a test: look again within three');assert(noExam.interval>withExam.interval);
assert(M.schedule(r,'Good',r.due,{factor:.7}).interval<noExam.interval&&M.schedule(r,'Good',r.due,{factor:1.3}).interval>noExam.interval);
assert(M.schedule(r,'Good',r.due,{retention:.95}).interval<noExam.interval,'asking for higher retention reviews sooner');
assert(Math.abs(M.forget(10,10)-.9)<1e-9&&Math.abs(M.daysFor(10,.9)-10)<1e-9,'90% at the stability, by definition');
// Retrievability falls over time and status reflects it
const rev=M.schedule(null,'Good',now);assert(M.retrievability(rev,rev.due)<1&&M.retrievability(rev,now)>M.retrievability(rev,now+3*DAY));
assert.equal(M.status(undefined,now),'new');assert.equal(M.status(M.schedule(null,'Again',now),now),'weak');assert.equal(M.status(rev,rev.due+1),'due');

// Queue: overdue first, new capped, weak mode, quiz fills up
const pool=Array.from({length:12},(_,i)=>({id:'n'+i,noteId:'a',type:'qa',prompt:'p',answer:'x'+i}));
const reviews={n0:{due:now-5*DAY,interval:2,reviewedAt:now-7*DAY},n1:{due:now+9*DAY,interval:10,reviewedAt:now},n2:M.schedule(null,'Again',now-2*DAY)};
const due=M.queue(pool,reviews,{mode:'due',now,limit:10,newLimit:3});
assert(due.some(i=>i.id==='n0'));assert(!due.some(i=>i.id==='n1'));assert.equal(due.filter(i=>!reviews[i.id]).length,3);
assert.equal(M.queue(pool,reviews,{mode:'weak',now}).map(i=>i.id).sort().join(),'n0,n2');
assert.equal(M.queue(pool,reviews,{mode:'quiz',now,limit:20}).length,12);
const s=M.stats(pool,reviews,now);assert.equal(s.total,12);assert.equal(s.new,9);assert.equal(s.due,1);assert.equal(s.weak,1);
assert(M.weakTopics(pool,reviews,now)[0].noteId==='a');
const st={};M.logReview(st,'n0','Good','due',now);assert.equal(M.reviewedToday(st,now),1);

// Checking answers
const c=M.newItem({type:'cloze',text:'The mitochondrion makes ATP.',blank:'mitochondrion'});
assert.equal(M.check(c,'Mitochondrion'),'correct');assert.equal(M.check(c,' the mitochondrion '),'correct');
assert.equal(M.check(c,'mitochondrian'),'close');assert.equal(M.check(c,'ribosome'),'wrong');assert.equal(M.check(c,''),'wrong');
const long=M.newItem({type:'qa',prompt:'Why?',answer:'Because the membrane is selectively permeable to water and small solutes alike.'});
assert.equal(M.check(long,'anything'),null);assert.equal(M.suggestedGrade(null),'Good');assert.equal(M.suggestedGrade('wrong'),'Again');
const cover=M.coverage('Osmosis moves water across a selectively permeable membrane','Water moves across the membrane');
assert(cover.hit.includes('water')&&cover.missed.includes('osmosis'));

// Multiple choice only when sensible distractors exist
const bank=['mitochondrion','ribosome','nucleus','chloroplast'].map((w,i)=>M.newItem({id:'c'+i,type:'cloze',text:'The '+w+' is an organelle.',blank:w}));
const f=M.format(bank[0],bank,{quiz:true,rng:()=>.3});assert.equal(f.kind,'choice');assert(f.choices.includes('mitochondrion')&&f.choices.length===4&&new Set(f.choices).size===4);
assert.equal(M.format(bank[0],[bank[0]],{quiz:true}).kind,'type');assert.equal(M.format(bank[0],bank,{quiz:false}).kind,'type');
assert.equal(M.format(M.newItem({type:'explain',prompt:'Explain it'}),bank,{quiz:true}).kind,'self');
assert(!M.distractors(bank[0],bank).includes('mitochondrion'));
const numbers=[M.newItem({id:'d1',type:'cloze',text:'DNA has 46 chromosomes.',blank:'46'}),M.newItem({id:'d2',type:'cloze',text:'A cell is word.',blank:'word'}),...bank];
assert(!M.distractors(numbers[0],numbers).includes('word'));

// Suggestions: bold terms, definitions, headings; never duplicates of existing items
const study=note('Cells','# Mitochondria\n\nMitochondria are organelles that release energy from food through respiration in most cells. The **cristae** increase surface area for the reactions that make ATP.\n\nOsmosis is the movement of water across a selectively permeable membrane.');
const sug=M.suggest(study,{});
assert(sug.some(x=>x.type==='cloze'&&x.blank==='cristae'));assert(sug.some(x=>x.type==='qa'&&/What is Osmosis/.test(x.prompt)));assert(sug.some(x=>/What are Mitochondria/.test(x.prompt)));
assert(!sug.some(x=>x.type==='explain'));   // the paragraph under the heading already has a sharper question
assert(sug.every(x=>M.validItem(x)||x.type==='explain'));
const cris=sug.find(x=>x.blank==='cristae');
assert(!M.suggest(study,{items:[{...cris}]}).some(x=>x.id===cris.id));

// Summary
const summary=M.summarize([{item:bank[0],rating:'Good'},{item:{...bank[1],noteId:'N'},rating:'Again'},{item:{...bank[2],noteId:'N'},rating:'Again'},{item:bank[3],rating:'Easy'}]);
assert.equal(summary.pct,50);assert.equal(summary.missed.length,2);assert.equal(JSON.stringify(summary.restudy),'[{"noteId":"N","count":2}]');
// Question quality: no auto-made passage cards, no nonsense prompts, one question per fact
const prose=note('Prose',`# Mitochondria\n\nThe **mitochondrion** is the organelle that produces most of the cell's ATP. It has a double membrane.\n\nThis is why muscle cells have many of them. They are also involved in apoptosis, which is programmed cell death.\n\n# Nucleus\n\n- Contains the nucleolus\n- Surrounded by nuclear envelope\n\nLecture 3 notes: remember to read chapter 5 before Friday.\n\nATP is made mostly in mitochondria and is adenosine triphosphate.`);
const dupe=note('Dupe',`# Mitochondria\n\nThe mitochondrion is the organelle that produces most of the cell's ATP.\n\n# Causes of WWI\n\nThe war began in 1914 after an assassination. Alliances turned a regional conflict into a world war.`);
assert.equal(M.collect({notes:[prose,dupe]},{projectId:'p'}).length,0);   // plain paragraphs are never asked unprompted
const drafts=M.suggestAll([prose,dupe],{notes:[prose,dupe]});
const asked=drafts.map(d=>d.prompt||M.promptText(d));
assert(!asked.some(p=>/\b(?:This|They|It)\b/.test(p)),'no pronoun subjects: '+asked);
assert(!asked.some(p=>/key ideas|Lecture|Friday|chapter/i.test(p+JSON.stringify(drafts.map(d=>d.answer)))));
assert.equal(asked.filter(p=>/mitochondri/i.test(p)).length,1,'same fact in two notes is asked once: '+asked);
assert(asked.includes('What is the mitochondrion?'));assert(asked.includes('Explain Causes of WWI in your own words.'));
assert(!drafts.some(d=>d.answer==='ATP is made mostly in mitochondria and is adenosine triphosphate.'));
// Accepting a draft (or writing it by hand) silences repeats of the same fact
const kept=drafts.map(d=>M.newItem(d));assert.equal(M.suggestAll([prose,dupe],{notes:[prose,dupe],items:kept}).length,0);
const byHand=[M.newItem({type:'qa',prompt:'Which organelle makes ATP?',answer:'The mitochondrion is the organelle that produces most of the cell\'s ATP.',noteId:'Prose',projectId:'p'})];
assert(!M.suggestAll([prose],{notes:[prose],items:byHand}).some(d=>/mitochondri/i.test(d.prompt)));
// Lines set in columns are saved with ::: markers; they never leak into questions, and the sentences inside still count
const cols=note('Cols',':::columns\n\n:::col\n\nThe **mitochondrion** is the organelle that produces most of the cell\'s ATP.\n\n:::col\n\nThe nucleus is a membrane-bound organelle that stores the cell\'s DNA.\n\n:::\n\nDone.');
const colDrafts=M.suggestAll([cols],{notes:[cols]}),colAsked=colDrafts.map(d=>(d.prompt||M.promptText(d))+' '+d.answer);
assert(colDrafts.length>=2&&!colAsked.some(t=>/:::/.test(t)),'no marker text in suggestions: '+colAsked);
assert(colAsked.some(t=>/mitochondrion/.test(t))&&colAsked.some(t=>/nucleus/.test(t)),'both columns are read');
// Questions a student wrote into the note still count
assert.equal(M.collect({notes:[note('Q','Why does water move across a membrane?\nBecause of a concentration gradient across it.')]},{projectId:'p'}).length,1);
// Answers that are symbols, signs, decimals or other numbers are checked exactly, never by spelling
const ans=a=>M.newItem({type:'qa',prompt:'q',answer:a});
for(const symbol of ['∫','→','+','≤'])assert.equal(M.check(ans(symbol),symbol),'correct',symbol+' typed as itself');
assert.equal(M.check(ans('∫'),'→'),'wrong');assert.equal(M.check(ans('∫'),''),'wrong');assert.equal(M.check(ans('−'),'-'),'correct');
assert.equal(M.check(ans('−3'),'3'),'wrong');assert.equal(M.check(ans('−3'),'-3'),'correct');assert.equal(M.check(ans('−3'),'−3'),'correct');
assert.equal(M.check(ans('3.5'),'35'),'wrong');assert.equal(M.check(ans('3.5'),'3.5'),'correct');assert.equal(M.check(ans('0.5'),'05'),'wrong');
assert.equal(M.check(ans('1/2'),'12'),'wrong');assert.equal(M.check(ans('1/2'),'1/2'),'correct');assert.equal(M.check(ans('25%'),'25'),'wrong');
assert.equal(M.check(ans('1,000'),'1000'),'correct');
assert.equal(M.check(ans('1947'),'1948'),'wrong');assert.equal(M.check(ans('1947'),'1947'),'correct');assert.equal(M.check(ans('x^2+y^2'),'x^2+y^3'),'wrong');
assert.equal(M.check(ans('Paris'),'Pariss'),'close');assert.equal(M.check(c,'mitochondrian'),'close');

// Math survives prose cleanup (subscripts and stars are markup elsewhere, not inside $…$) and is never typed as an answer
const K=vm.runInNewContext(fs.readFileSync('web/knowledge.js','utf8')+'\nKnowledge');
assert.equal(K.prose('Energy is $E_{k}=\\frac{1}{2}*m*v^2$ and **bold** _it_.'),'Energy is $E_{k}=\\frac{1}{2}*m*v^2$ and bold it.');
assert.equal(K.prose('$$x_1+x_2$$\n# Heading\nplain_text'),'$$x_1+x_2$$\nHeading\nplaintext');
assert.equal(M.hasMath('$x^2$'),true);assert.equal(M.hasMath('costs $5 or $6'),true,'a pair of dollar signs is treated as math');assert.equal(M.hasMath('plain'),false);
assert.equal(M.checkable(M.newItem({type:'qa',prompt:'Energy?',answer:'$E=mc^2$'})),false);
assert.equal(M.checkable(M.newItem({type:'cloze',text:'Area is $\\pi r^2$ always.',blank:'$\\pi r^2$'})),false);
assert.equal(M.checkable(M.newItem({type:'cloze',text:'Area is $\\pi r^2$ always.',blank:'always'})),true,'a plain blank next to math can still be typed');
assert.equal(M.format(M.newItem({type:'qa',prompt:'Energy?',answer:'$E=mc^2$'}),bank,{quiz:true}).kind,'self');

// Daily new-item limit: new items stop counting as ready once today's budget is used
const day=new Date(2026,10,6,15).getTime(),fresh=Array.from({length:30},(_,i)=>({id:'f'+i,noteId:'a',type:'qa',prompt:'p',answer:'x'}));
assert.equal(M.allowance({},day),10);assert.equal(M.allowance({recallNewPerDay:20},day),20);
const used={};for(let i=0;i<4;i++)M.logReview(used,'f'+i,'Good','due',day-i*1000,true);M.logReview(used,'old','Good','due',day,false);
assert.equal(M.newToday(used,day),4);assert.equal(M.reviewedToday(used,day),5);assert.equal(M.allowance(used,day),6);
assert.equal(M.newToday(used,day+DAY),0,'a new day starts with a full allowance');
used.recallNewPerDay=4;assert.equal(M.allowance(used,day),0);
assert.equal(M.queue(fresh,{},{now:day,limit:15,newLimit:M.allowance({},day)}).length,10);
assert.equal(M.queue(fresh,{},{now:day,limit:15,newLimit:0}).length,0);
// The ready count tells the whole workload, not just one session
const backlog=Array.from({length:40},(_,i)=>({id:'b'+i,noteId:'a',type:'qa',prompt:'p',answer:'x'})),late={};backlog.slice(0,30).forEach(i=>late[i.id]={due:day-1,interval:3,ease:2.5,reps:2,lapses:0,reviewedAt:day-3*DAY,rating:'Good'});
const work=M.workload(backlog,late,day,M.allowance({},day));assert.equal(work.due,30);assert.equal(work.new,10);assert.equal(work.ready,40);
assert.equal(M.queue(backlog,late,{now:day,limit:15,newLimit:10}).length,15,'a session is still capped at 15');
assert.equal(M.stats(backlog,late,day,3).ready,33);assert.equal(M.stats(backlog,late,day).ready,40);
assert.equal(M.workload(backlog,late,day,0).ready,30);

// ── Knowing you ──
const T0=new Date(2026,0,15,10,0,0).getTime();
const mkLog=(n,fn)=>Array.from({length:n},(_,i)=>({id:'x'+i,t:T0-i*3600000,first:false,mode:'due',...fn(i)}));
// Calibration: doing worse than predicted shrinks intervals; better stretches them; too little data does nothing
assert.equal(M.calibration({reviewLog:mkLog(10,()=>({rating:'Good',r:.9}))},T0).factor,1,'under 40 reviews: no change');
const worse=M.calibration({reviewLog:mkLog(100,i=>({rating:i%4===0?'Again':'Good',r:.9}))},T0);assert(worse.factor<1&&worse.factor>=.6,'75% vs 90% predicted shrinks intervals: '+worse.factor);
const better=M.calibration({reviewLog:mkLog(100,i=>({rating:i%50===0?'Again':'Good',r:.8}))},T0);assert(better.factor>1&&better.factor<=1.4,'98% vs 80% predicted stretches them: '+better.factor);
assert(Math.abs(M.calibration({reviewLog:mkLog(100,i=>({rating:i%10===0?'Again':'Good',r:.9}))},T0).factor-1)<.01,'on target: no change');
// Accuracy, retention, pace
assert.equal(M.accuracy({reviewLog:mkLog(5,()=>({rating:'Good'}))},T0),null,'too few to say');
assert.equal(M.accuracy({reviewLog:mkLog(20,i=>({rating:i<5?'Again':'Good'}))},T0),.75);
assert.equal(M.retention({reviewLog:mkLog(20,i=>({rating:i<5?'Again':'Good'}))},T0,30).pct,75);
assert.equal(M.paceSeconds({}),12,'a sensible default');assert.equal(M.paceSeconds({reviewLog:mkLog(20,()=>({rating:'Good',ms:8000}))}),8);
assert.equal(M.usualMs({reviewLog:mkLog(20,()=>({rating:'Good',ms:6000}))}),6000);
// Tests coming up
const exams={projects:[{id:'p',assessments:[{title:'Midterm',date:'2026-01-25'},{title:'Done',date:'2026-01-16',done:true},{title:'Final',date:'2026-03-01'}],packs:[]}]};
const ex=M.examFor(exams,'p',T0);assert.equal(ex.title,'Midterm');assert.equal(ex.days,11,'the nearest test that is not finished');assert.equal(M.examFor(exams,'nope',T0),null);
assert.equal(M.optionsFor({...exams},{projectId:'p'},T0).examDays,11);
// If you stopped today: readiness for test day
const items3=[{id:'a'},{id:'b'},{id:'c'}],revs3={a:M.schedule(null,'Good',T0),b:{...M.schedule(null,'Good',T0-30*DAY),reviewedAt:T0-30*DAY}};
const ready=M.readiness(items3,revs3,T0+10*DAY,T0);assert.equal(ready.unseen,1);assert(ready.pct>0&&ready.pct<100);assert(ready.shaky.some(i=>i.id==='b'),'the one left for a month is shaky');
// Forecast
const startDay=new Date(T0).setHours(0,0,0,0);
assert.deepEqual(Array.from(M.forecast([{id:'a'},{id:'b'},{id:'c'},{id:'d'}],{a:{due:T0-5*DAY},b:{due:startDay+3600000},c:{due:startDay+DAY+3600000},d:{due:startDay+9*DAY}},T0)),[2,1,0,0,0,0,0],'overdue counts today; beyond the week is left out');
// Leeches
assert.deepEqual(Array.from(M.leeches([{id:'a'},{id:'b'},{id:'c'}],{a:{lapses:6},b:{lapses:2},c:{lapses:4}}).map(i=>i.id)),['a','c']);
// When you remember best, and tired days
const timed=[...mkLog(30,i=>({rating:i%10===0?'Again':'Good',t:new Date(2026,0,10,8,i).getTime()})),...mkLog(30,i=>({rating:i%2?'Again':'Good',t:new Date(2026,0,10,20,i).getTime()}))];
const bt=M.bestTime({reviewLog:timed},T0);assert.equal(bt.best.name,'morning');assert.equal(bt.worst.name,'evening');
assert.equal(M.bestTime({reviewLog:timed.slice(0,30)},T0),null,'one time of day tells nothing');
const moods=M.byMood({reviewLog:[...mkLog(20,()=>({rating:'Good',mood:'fresh'})),...mkLog(20,i=>({rating:i%2?'Again':'Good',mood:'tired'}))]},T0);assert(moods.fresh.pct>moods.tired.pct+10);
assert.equal(M.byMood({reviewLog:mkLog(20,()=>({rating:'Good',mood:'ok'}))},T0),null);
// Today's session is built for how you feel and what is waiting
const bigPool=Array.from({length:60},(_,i)=>({id:'q'+i,noteId:'n'+(i%5),projectId:'p',type:'qa',prompt:'p',answer:'x'}));
const some={};bigPool.slice(0,12).forEach(i=>some[i.id]={due:T0-DAY,interval:3,stability:3,reps:2,lapses:0,reviewedAt:T0-4*DAY,rating:'Good'});
const ok=M.plan(bigPool,some,{},{now:T0});assert.equal(ok.queue.length,15);assert.equal(ok.reviews,12);assert.equal(ok.new,3,'ten new allowed, but the session is capped at 15');
const tired=M.plan(bigPool,some,{},{now:T0,mood:'tired'});assert.equal(tired.new,0,'a tired day: no new questions');assert(tired.queue.length<=8);assert(/light/i.test(tired.note));
const fresh2=M.plan(bigPool,{},{},{now:T0,mood:'fresh'});assert.equal(fresh2.new,15);
const swamped={};bigPool.slice(0,45).forEach(i=>swamped[i.id]={due:T0-DAY,interval:3,stability:3,reps:2,lapses:0,reviewedAt:T0-4*DAY,rating:'Good'});
const catchUp=M.plan(bigPool,swamped,{},{now:T0});assert.equal(catchUp.new,0,'a big backlog pauses new questions');assert(/catching up/i.test(catchUp.note));
const shaky=M.plan(bigPool,some,{reviewLog:mkLog(30,i=>({rating:i%2?'Again':'Good'}))},{now:T0,limit:99});assert(/shaky/i.test(shaky.note),'poor recent accuracy slows new questions');
assert.equal(M.plan(bigPool,some,{reviewLog:mkLog(30,()=>({rating:'Good',ms:6000}))},{now:T0,minutes:2}).queue.length,20,'two minutes at six seconds each');
assert(M.plan(bigPool,some,{},{now:T0}).seconds>0);
// ── Vocabulary becomes questions, in order ──
const vstate={projects:[{id:'ru',language:{code:'ru'}}],vocab:[{id:'w1',term:'привет',meaning:'hello',projectId:'ru',sentence:'Привет, как дела?'},{id:'w2',term:'спасибо',meaning:'thank you',projectId:'ru'},{id:'w3',term:'hmm',meaning:'',projectId:'ru'}],reviews:{}};
let vitems=M.collect(vstate,{projectId:'ru'});
assert.equal(vitems.length,2,'only words with a meaning are asked, and only recognition at first');
assert.deepEqual(Array.from(vitems.map(i=>i.id)),['vocab:w1:know','vocab:w2:know']);
assert.equal(vitems[0].prompt,'What does “привет” mean?');assert.equal(vitems[0].answer,'hello');assert.equal(vitems[0].lang,'ru');
vstate.reviews['vocab:w1:know']={stability:3,interval:3,due:1,reviewedAt:0};
vitems=M.collect(vstate,{projectId:'ru'});assert(vitems.some(i=>i.id==='vocab:w1:say'),'once recognised, saying it is asked');assert(!vitems.some(i=>i.id==='vocab:w2:say'));
const vsay=vitems.find(i=>i.id==='vocab:w1:say');assert.equal(vsay.answer,'привет');assert.equal(M.check(vsay,'приве́т'),'correct','stress marks are fine');assert.equal(M.check(vsay,'privet'),'wrong');
assert(!vitems.some(i=>i.type==='cloze'),'the sentence comes last');
vstate.reviews['vocab:w1:say']={stability:4,interval:4,due:1,reviewedAt:0};
const vcloze=M.collect(vstate,{projectId:'ru'}).find(i=>i.type==='cloze');assert(vcloze,'once it can be said, it is used in its sentence');assert.equal(vcloze.blank,'Привет');assert.equal(M.clozeParts(vcloze).after,', как дела?');assert.equal(M.check(vcloze,'привет'),'correct');
assert.equal(M.collect(vstate,{projectId:'other'}).length,0,'vocab stays with its subject');assert.equal(M.collect(vstate,{notes:[]}).filter(i=>i.origin==='vocab').length,0,'and is not part of a note\'s questions');
vstate.suspended={'vocab:w2:know':true};assert(!M.collect(vstate,{projectId:'ru'}).some(i=>i.id==='vocab:w2:know'),'set-aside words are skipped');
// Accents and ё do not count against an answer
assert.equal(M.check({type:'qa',prompt:'water',answer:'вода́'},'вода'),'correct');assert.equal(M.check({type:'qa',prompt:'all',answer:'всё'},'все'),'correct');
assert.equal(M.check({type:'qa',prompt:'my',answer:'мой'},'мои'),'wrong','й and и stay different letters');
console.log('PASS: markup items, stable ids, scoping, scheduler, queues, answer checking, symbol/number answers, daily new limit, multiple choice, suggestions, question quality, summary.');
