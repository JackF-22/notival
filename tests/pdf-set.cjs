const assert=require('assert'),PDFSet=require('../web/pdf-set.js');
const note={pdfPath:'/a/One.pdf',pdfName:'One.pdf'};
// A note from before multi-PDF support already has its one PDF in the set.
assert.deepEqual(PDFSet.list(note).map(p=>p.path),['/a/One.pdf']);
assert.equal(PDFSet.step(note,1),null);
PDFSet.activate(note,'/a/Two.pdf','Two.pdf');PDFSet.activate(note,'/a/Three.pdf');
assert.deepEqual(PDFSet.list(note).map(p=>p.name),['One.pdf','Two.pdf','Three.pdf']);
assert.equal(note.pdfPath,'/a/Three.pdf');assert.equal(note.pdfName,'Three.pdf');
// Re-activating a known PDF switches to it without duplicating it.
PDFSet.activate(note,'/a/One.pdf');assert.equal(PDFSet.list(note).length,3);assert.equal(note.pdfName,'One.pdf');
// Cycling wraps in both directions.
assert.equal(PDFSet.step(note,-1).path,'/a/Three.pdf');assert.equal(PDFSet.step(note,1).path,'/a/Two.pdf');
assert.deepEqual(PDFSet.position(note),{index:0,count:3});
// Removing the shown PDF falls back to its neighbour, then to none.
PDFSet.activate(note,'/a/Two.pdf');PDFSet.remove(note,'/a/Two.pdf');assert.equal(note.pdfPath,'/a/Three.pdf');
PDFSet.remove(note,'/a/Three.pdf');assert.equal(note.pdfPath,'/a/One.pdf');
PDFSet.remove(note,'/a/One.pdf');assert.equal(note.pdfPath,null);assert.equal(PDFSet.list(note).length,0);
console.log('pdf-set ok');
