const assert=require('node:assert/strict');
const L=require('../web/layout-model.js');
let n=0;const newId=()=>'r'+(++n);
const cells=(...ids)=>ids.map(id=>({id,type:'text',text:id}));
const shape=blocks=>L.rows(blocks).map(r=>r.cells.map(c=>c.id).join('+')).join(' / ');
const order=blocks=>blocks.map(b=>b.id).join('');

// Dropping beside a cell makes a row; order is left to right
let b=cells('a','b','c','d');
assert.equal(L.move(b,'c','a','right',newId).ok,true);
assert.equal(shape(b),'a+c / b / d');assert.equal(order(b),'acbd');
assert.equal(L.move(b,'d','a','left',newId).ok,true);
assert.equal(shape(b),'d+a+c / b');assert.equal(order(b),'dacb');

// A row holds three; a fourth is refused and nothing changes
const before=JSON.stringify(b);
assert.deepEqual(L.move(b,'b','a','right',newId),{ok:false,reason:'full'});assert.equal(JSON.stringify(b),before);
// ...but reordering inside a full row is fine
assert.equal(L.move(b,'c','d','left',newId).ok,true);assert.equal(shape(b),'c+d+a / b');

// Dropping above/below goes outside the whole row, never into the middle of it
assert.equal(L.move(b,'b','a','above',newId).ok,true);assert.equal(shape(b),'b / c+d+a');
assert.equal(L.move(b,'b','d','below',newId).ok,true);assert.equal(shape(b),'c+d+a / b');

// Pulling a cell out of a pair leaves no lone cell behind with a row id
b=cells('a','b','c');L.move(b,'b','a','right',newId);
assert.equal(L.move(b,'b','c','below',newId).ok,true);
assert.equal(shape(b),'a / c / b');assert(b.every(x=>!x.row),'singleton rows are dissolved');

// Moving a cell out of one row into another
b=cells('a','b','c','d');L.move(b,'b','a','right',newId);L.move(b,'d','c','right',newId);
assert.equal(shape(b),'a+b / c+d');
assert.equal(L.move(b,'b','c','left',newId).ok,true);
assert.equal(shape(b),'a / b+c+d');assert(!b[0].row);

// Moving onto itself does nothing
assert.deepEqual(L.move(b,'a','a','left',newId),{ok:false,reason:'self'});

// tidy repairs rows broken by other edits: lone cells, split rows, over-wide rows
b=cells('a','b','c','d','e');b[0].row='x';           // lone
assert.equal(L.tidy(b,newId),true);assert(!b[0].row);
b=cells('a','b','c','d');b[0].row=b[1].row='x';b[3].row='x';   // 'x' reappears after a gap
L.tidy(b,newId);assert.equal(shape(b),'a+b / c / d');assert(!b[3].row);
b=cells('a','b','c','d','e');b.forEach(x=>x.row='w');L.tidy(b,newId);
assert.equal(shape(b),'a+b+c / d+e');
b=cells('a','b');b[0].row=b[1].row='ok';assert.equal(L.tidy(b,newId),false);

// Keyboard steps
b=cells('a','b','c');
assert.equal(L.nudge(b,'b','left',newId).ok,true);assert.equal(shape(b),'a+b / c');   // joins the row above
assert.equal(L.nudge(b,'b','left',newId).ok,true);assert.equal(shape(b),'b+a / c');   // then swaps within it
assert.equal(L.nudge(b,'a','down',newId).ok,true);assert.equal(shape(b),'b / a / c');  // down lifts it out of the row
assert.equal(L.nudge(b,'c','up',newId).ok,true);assert.equal(shape(b),'b / c / a');
assert.equal(L.nudge(b,'b','up',newId).ok,false);
assert.equal(L.nudge(b,'b','right',newId).ok,true);assert.equal(shape(b),'b+c / a');   // a lone cell can join the row below
assert.equal(order(b),'bca');

console.log('PASS: layout model — rows, three-column limit, drop above/below/beside, singleton cleanup, repair, keyboard steps.');
