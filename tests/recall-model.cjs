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

// Scheduler
let r=M.schedule(null,'Good',now);assert.equal(r.interval,1);
r=M.schedule(r,'Good',now+DAY);assert.equal(r.interval,3);
r=M.schedule(r,'Good',now+4*DAY);assert.equal(r.interval,Math.round(3*2.5));
const lapsed=M.schedule(r,'Again',r.due);assert.equal(lapsed.interval,0);assert.equal(lapsed.lapses,1);assert(lapsed.ease<2.5);assert.equal(lapsed.due,r.due+600000);
assert(M.schedule(null,'Easy',now).interval>M.schedule(null,'Good',now).interval);
assert.equal(M.schedule({interval:170,reps:5,ease:2.5},'Easy',now).interval,180);
const early=M.schedule(r,'Good',r.reviewedAt+DAY);assert.equal(early.due,r.due);assert.equal(early.interval,r.interval);
assert.equal(M.schedule({interval:80,due:0},'Again',100).due,600100);   // legacy records still work
assert.equal(Object.keys(M.preview(null,now)).join(),'Again,Hard,Good,Easy');
// Retrievability falls to ~90% at the due date and status reflects it
const rev=M.schedule(null,'Good',now);assert(Math.abs(M.retrievability(rev,rev.due)-.9)<1e-9);assert(M.retrievability(rev,now)>M.retrievability(rev,now+3*DAY));
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
// Questions a student wrote into the note still count
assert.equal(M.collect({notes:[note('Q','Why does water move across a membrane?\nBecause of a concentration gradient across it.')]},{projectId:'p'}).length,1);
console.log('PASS: markup items, stable ids, scoping, scheduler, queues, answer checking, multiple choice, suggestions, question quality, summary.');
