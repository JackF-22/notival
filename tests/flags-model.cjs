const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const F=vm.runInNewContext(fs.readFileSync('web/flags-model.js','utf8')+'\nFlagsModel');
const note=(id,projectId)=>({id,projectId,title:id,blocks:[]});
const a=note('a','p'),b=note('b','q');

const flag=F.create(a,{blockId:'blk',quote:'  the Krebs   cycle\n runs twice  '});
assert.equal(flag.quote,'the Krebs cycle runs twice');assert.equal(flag.status,'open');assert.equal(flag.comment,'');assert.equal(a.flags.length,1);
assert.equal(F.create(a,{blockId:'blk',quote:'   '}),null);assert.equal(a.flags.length,1);

// Resolving requires a real clarification
assert.equal(F.resolve(flag,''),false);assert.equal(F.resolve(flag,'   \n '),false);assert.equal(flag.status,'open');
assert.equal(F.resolve(flag,' Two acetyl-CoA per glucose, so two turns. ',500),true);
assert.equal(flag.status,'resolved');assert.equal(flag.clarification,'Two acetyl-CoA per glucose, so two turns.');assert.equal(flag.resolvedAt,500);
F.reopen(flag);assert.equal(flag.status,'open');assert.equal(flag.resolvedAt,undefined);assert(flag.clarification);   // the earlier answer is kept

// Lists are scoped by subject and ordered newest first
const second=F.create(a,{blockId:'blk',quote:'osmosis',comment:'why does water leave?',now:Date.now()+10});
const other=F.create(b,{blockId:'x',quote:'elsewhere'});
assert.equal(F.count([a,b]),3);assert.equal(F.count([a,b],{projectId:'p'}),2);assert.equal(F.open([a,b],{projectId:'p'})[0].flag,second);
F.resolve(second,'Because the solute is concentrated outside.');
assert.equal(F.openCount(a),1);assert.equal(F.resolved([a,b]).length,1);assert.equal(F.open([a,b]).every(e=>e.flag!==second),true);
assert.equal(F.count([note('empty')]),0);assert.equal(F.openCount(undefined),0);

// A resolved flag can seed a question
const draft=F.draftQuestion(second);assert.equal(draft.prompt,'why does water leave?');assert.equal(draft.answer,'Because the solute is concentrated outside.');assert.equal(draft.blockId,'blk');
assert.match(F.draftQuestion({quote:'x'.repeat(200),clarification:'y'}).prompt,/^What does “x{80}…” mean\?$/);

assert.equal(F.remove(a,flag),true);assert.equal(F.remove(a,flag),false);assert.equal(a.flags.length,1);
console.log('PASS: flags need a clarification to resolve, reopen, scope by subject, and seed questions.');
