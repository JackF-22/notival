const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);
for(const f of ['knowledge.js','recall-model.js','flags-model.js','study-hub-model.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8')+'\n',ctx);
const H=vm.runInContext('StudyHubModel',ctx);
const DAY=864e5,now=Date.UTC(2026,10,10);
const note=(id,unitId,flags=[])=>({id,title:id,projectId:'bio',unitId,blocks:[{id:'b'+id,type:'text',text:'x'}],flags});
const item=(id,noteId)=>({id,type:'qa',prompt:'Q '+id,answer:'A',noteId,projectId:'bio',unitId:null});
const state={
 projects:[{id:'bio',name:'Biology',units:[{id:'u1',name:'Cells'},{id:'u2',name:'Energy'},{id:'u3',name:'Genes'}]}],
 notes:[note('n1','u1'),note('n2','u2',[{id:'f',quote:'q',status:'open',created:1},{id:'g',quote:'r',status:'open',created:2}]),note('n3','u3')],
 items:[item('i1','n1'),item('i2','n1'),item('i3','n2'),item('i4','n3')],
 reviews:{
  i1:{due:now+9*DAY,interval:9,ease:2.5,reps:4,lapses:0,reviewedAt:now-1*DAY,rating:'Good'},
  i2:{due:now+9*DAY,interval:9,ease:2.5,reps:4,lapses:0,reviewedAt:now-1*DAY,rating:'Good'},
  i3:{due:now-2*DAY,interval:1,ease:1.8,reps:2,lapses:3,reviewedAt:now-9*DAY,rating:'Again'},
 }
};
const spots=H.weakSpots(state,now);
assert.equal(spots[0].name,'Energy','missed questions and open flags put Energy first');
assert.ok(spots[0].reasons.some(r=>/unclear passage/.test(r)));
assert.ok(spots[0].reasons.some(r=>/not reviewed in 9 days|due for review|keep missing/.test(r)));
assert.ok(spots.some(s=>s.name==='Genes'&&s.reasons.includes('never reviewed')),'untouched material shows up');
assert.ok(!spots.some(s=>s.name==='Cells'),'a unit you reviewed yesterday is fine');
assert.equal(H.weakSpots(state,now,1).length,1);
// Notes without units still count, under the subject's own name
state.notes.push(note('n4',null));state.items.push(item('i5','n4'));
assert.ok(H.weakSpots(state,now).some(s=>s.name==='Biology'&&s.unit===null));
// Subjects left out of Study never show up
assert.equal(H.weakSpots(state,now,5,{exclude:new Set(['bio'])}).length,0);
const R=vm.runInContext('RecallModel',ctx);
assert.equal(R.collect(state,{exclude:new Set(['bio'])}).length,0);assert.ok(R.collect(state,{}).length>0);
// Nothing to report on an empty workspace
assert.equal(H.weakSpots({projects:[],notes:[],items:[],reviews:{}},now).length,0);
console.log('PASS: weak spots rank by missed questions, unclear passages and neglect, and skip what is fine.');
