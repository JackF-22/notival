const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const model=vm.runInNewContext(fs.readFileSync('web/student-model.js','utf8')+'\nStudentModel');
const s={id:'biology',name:'Biology',plan:[{title:'Existing reminder'}]};model.initialize(s);assert.equal(s.plan[0].title,'Existing reminder');assert.equal(s.units.length,0);
s.units.push({id:'cells',name:'Cells'});s.materials=[{id:'slides',unitId:'cells'},{id:'reading',unitId:null}];
const notes=[{id:'a',projectId:'biology',unitId:'cells'},{id:'b',projectId:'biology',unitId:null},{id:'outside',projectId:'history',unitId:'cells'}];
const pack={unitIds:['cells'],noteIds:['a','b','outside','missing'],materialIds:['slides','reading','missing']};let result=model.contents(s,notes,pack);assert.equal(result.notes.length,2);assert.equal(result.materials.length,2);assert(!result.notes.some(n=>n.id==='outside'));
notes.push({id:'new',projectId:'biology',unitId:'cells'});result=model.contents(s,notes,pack);assert.equal(result.notes.length,3);assert.equal(model.summary(s,notes).notes,3);assert.equal(model.contents(s,notes,{unitIds:[],noteIds:[],materialIds:[]}).notes.length,0);
const restored=JSON.parse(JSON.stringify({subject:s,notes,pack}));assert.equal(model.contents(restored.subject,restored.notes,restored.pack).notes.length,3);
console.log('PASS: legacy subject metadata preserved; test-pack membership is scoped, deduplicated, dynamic, missing-reference-safe, and survives JSON round trips.');
s.packs=[pack];const before=model.contents(s,notes,pack).notes.length;const undo=model.removeUnit(s,notes,'cells');assert.equal(s.units.length,0);assert.equal(model.contents(s,notes,pack).notes.length,before);assert.equal(notes[0].unitId,null);undo();assert.equal(s.units[0].id,'cells');assert.equal(notes[0].unitId,'cells');assert.equal(pack.unitIds[0],'cells');
console.log('PASS: removing a unit preserves notes, files, and test-pack coverage; Undo restores unit membership.');

s.assessments=[{id:'due',title:'Assignment',kind:'assignment',date:'2026-11-06'}];s.packs=[{id:'exam',title:'Midterm',date:'2026-11-05'},{id:'undated',title:'No date'}];
assert.equal(model.dates(s)[0].kind,'test-pack');assert.equal(model.dates(s)[1].kind,'assignment');assert.equal(model.dates(s).length,2);
s.checklist=[{id:'task',title:'Read chapter',done:true}];s.overview.shortcuts=false;const restoredSettings=JSON.parse(JSON.stringify(s));model.initialize(restoredSettings);assert.equal(restoredSettings.overview.shortcuts,false);assert.equal(restoredSettings.checklist[0].done,true);assert.equal(model.dates(restoredSettings)[1].date,'2026-11-06');
console.log('PASS: test-pack dates and assignments share chronological ordering; checklist progress and overview preferences survive serialization.');

{
 const g={id:'bio',name:'Bio'};model.initialize(g);g.units.push({id:'u1',name:'Cells'},{id:'u2',name:'Genes'});
 const n={id:'n1',projectId:'bio',unitId:'u1',pdfPath:'/tmp/Ch1.pdf',pdfName:'Ch1.pdf',blocks:[{type:'text',text:'x'}]};
 assert.equal(model.addNotePDF(g,{...n,unitId:null}).status,'needs-unit');
 assert.equal(model.addNotePDF(g,{...n,pdfPath:null}).status,'none');
 assert.equal(model.addNotePDF(g,{...n,projectId:'other'}).status,'none');
 let r=model.addNotePDF(g,n);assert.equal(r.status,'added');assert.equal(g.materials[0].unitId,'u1');assert.equal(g.materials[0].name,'Ch1.pdf');
 assert.equal(model.addNotePDF(g,n).status,'exists');assert.equal(g.materials.length,1);
 assert.equal(model.addNotePDF(g,{...n,unitId:'u2'}).status,'elsewhere');assert.equal(g.materials.length,1);
 g.materials.push({id:'doc',name:'Notes.docx',path:'/tmp/Notes.docx',unitId:'u1'});
 const all=[n,{id:'n2',projectId:'bio',unitId:'u1',blocks:[{type:'text',text:'  '}]},{id:'n3',projectId:'bio',unitId:'u1',synthesis:true,blocks:[{type:'text',text:'s'}]},{id:'n4',projectId:'bio',unitId:'u2',blocks:[{type:'text',text:'y'}]},{id:'n5',projectId:'bio',unitId:'u1',blocks:[{type:'text',text:'',html:'<p>rich</p>'}]}];
 const guide=model.guideContents(g,all,'u1');
 assert.equal(guide.notes.map(x=>x.id).join(),'n1,n5');assert.equal(guide.pdfs.map(x=>x.name).join(),'Ch1.pdf');
 console.log('PASS: a note’s linked PDF joins its unit once; study-guide contents are the unit’s non-empty notes and PDF materials.');
}
