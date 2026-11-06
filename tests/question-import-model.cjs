const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const M=vm.runInNewContext(fs.readFileSync('web/question-import-model.js','utf8')+'\nQuestionImportModel');
const j=x=>JSON.parse(JSON.stringify(x));

// Plain Q:/A: pairs, in a chat-style reply with chatter around them
let out=j(M.parse(`Sure! Here are your questions:

Q: Why does the Krebs cycle run twice per glucose?
A: Glycolysis makes two pyruvate from each glucose.

Q: Where does glycolysis happen?
A: In the cytoplasm.

Good luck!`));
assert.equal(out.length,2);assert.equal(out[0].type,'qa');assert.match(out[0].answer,/two pyruvate/);assert.equal(out[1].prompt,'Where does glycolysis happen?');

// Numbered, bolded, "Question 3:" style, multi-line answers, and a fenced block
out=j(M.parse('```\n1. **Question 1:** What is osmosis?\n**Answer 1:** Water moving across a membrane.\n\n**Q2.** Define diffusion.\n**A2.** Net movement down a gradient,\nwithout energy.\n```'));
assert.equal(out.length,2);assert.equal(out[0].prompt,'What is osmosis?');assert.equal(out[0].answer,'Water moving across a membrane.');
assert.equal(out[1].answer,'Net movement down a gradient,\nwithout energy.');

// Question and answer on one line; a question that wraps
out=j(M.parse('Q: What is ATP? A: The cell\'s energy currency.\nQ: Which organelle makes most\nof the ATP in a cell?\nA: The mitochondrion.'));
assert.equal(out.length,2);assert.equal(out[0].answer,"The cell's energy currency.");assert.equal(out[1].prompt,'Which organelle makes most of the ATP in a cell?');

// Fill-in-the-blanks use {{double braces}}
out=j(M.parse('Q: What carries oxygen?\nA: Haemoglobin\n\nC: The {{mitochondrion}} makes most of the cell\'s ATP.\n- Water crosses a membrane by {{osmosis}}.'));
assert.equal(out.length,3);
assert.deepEqual(out[1],{type:'cloze',text:"The mitochondrion makes most of the cell's ATP.",blank:'mitochondrion',duplicate:false});
assert.equal(M.label(out[1]),"The […] makes most of the cell's ATP.");

// JSON replies work too
out=j(M.parse('Here you go:\n[{"question":"What is a codon?","answer":"Three bases that code for one amino acid."},{"question":"","answer":"x"}]'));
assert.equal(out.length,1);assert.equal(out[0].prompt,'What is a codon?');

// Duplicates: against what you already have, and within the paste
out=j(M.parse('Q: What is ATP?\nA: Energy.\nQ: what is ATP\nA: Energy again.\nQ: Why is ATP useful?\nA: It powers work.',{existing:['What is atp?']}));
assert.equal(out.length,3);assert.deepEqual(out.map(i=>i.duplicate),[true,true,false]);

// Unfinished or empty pairs are dropped, and junk gives nothing
assert.equal(M.parse('Q: Half a question').length,0);assert.equal(M.parse('Q: Empty answer\nA:').length,0);
assert.equal(M.parse('Just some text with no questions in it.').length,0);assert.equal(M.parse('').length,0);
console.log('PASS: AI replies parse into questions across Q/A, numbered, fenced, cloze and JSON styles, with duplicates flagged.');
