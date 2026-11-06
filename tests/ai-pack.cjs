const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const A=vm.runInNewContext(fs.readFileSync('web/ai-pack.js','utf8')+'\nAIPack');
const subject={id:'bio',name:'Biology',units:[{id:'u1',name:'Unit 1 · Cells'},{id:'u2',name:'Unit 2 · Energy'}]};
const notes=[
 {id:'a',title:'Respiration',unitId:'u2',blocks:[{type:'text',text:'# Krebs\nRuns twice per glucose.'},{type:'code',language:'python',text:'print(2)'},{type:'text',text:'   '}],flags:[{quote:'why  twice',status:'open',comment:'is it per glucose?'},{quote:'ATP yield',status:'resolved',clarification:'About 30.'}]},
 {id:'b',title:'Membranes',unitId:'u1',blocks:[{type:'text',text:'Lipid bilayer.'}]},
 {id:'c',title:'',unitId:null,blocks:[]}
];
const md=A.build({subject,title:'Midterm',date:'2026-12-01',topics:[{title:'Explain osmosis',done:true},{title:'Compare ATP yields',done:false}],notes,materials:[{name:'Slides.pdf'}]});
assert.match(md,/^# Test prep: Midterm\n\nSubject: Biology · Test date: .*2026/);
assert.match(md,/- \[x\] Explain osmosis\n- \[ \] Compare ATP yields/);
assert.ok(md.indexOf('### Unit 1 · Cells')<md.indexOf('### Unit 2 · Energy'));          // follows the subject's unit order, not note order
assert.match(md,/#### Respiration\n\n##### Krebs\nRuns twice per glucose\./);          // the note's own headings sit below the document's
assert.match(md,/```python\nprint\(2\)\n```/);
assert.match(md,/### Other notes\n\n#### Untitled note\n\n_This note is empty\._/);
assert.match(md,/- Unclear: “why twice” \(in Respiration\) — is it per glucose\?/);
assert.match(md,/- Cleared up: “ATP yield” \(in Respiration\) — About 30\./);
assert.match(md,/Slides\.pdf/);
assert.doesNotMatch(md,/\n   \n/);                                                      // blank blocks are dropped
const bare=A.build({subject:null,title:'Quick',notes:[notes[1]]});
assert.match(bare,/## My notes\n\n### Membranes\n\nLipid bilayer\./);assert.doesNotMatch(bare,/Passages I flagged|Topics I need/);
console.log('PASS: AI pack groups notes by unit, keeps code and flags, and says what is missing.');
