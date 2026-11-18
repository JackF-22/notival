const assert=require('node:assert/strict');
global.TreeArt=require('../web/tree-art.js');
const F=require('../web/focus-model.js'),G=require('../web/garden-art.js'),MIN=60000;

// The species and what they yield
assert.deepEqual(F.PLANTS.map(p=>p.id),['tree','sunflower','tomato','carrot','strawberry','lettuce']);
for(const p of F.PLANTS)assert.equal(p.stages.length,6,p.id+' names six stages');
assert.equal(F.plantOf('nonsense').id,'tree','an unknown plant is an oak');assert.equal(F.plantOf().id,'tree');
assert.equal(F.stage(2*MIN,'tomato'),'Sprout');assert.equal(F.stage(40*MIN,'tomato'),'Fruiting');assert.equal(F.stage(55*MIN,'carrot'),'Ready to pull');assert.equal(F.stage(10*MIN),'Sapling','the oak keeps its names');
assert.deepEqual(F.nextStage(2*MIN,'lettuce'),{name:'Seedling',inMs:3*MIN});assert.equal(F.nextStage(51*MIN,'lettuce'),null);
const seeds=new Set();for(let s=0;s<60;s++)seeds.add(F.start({now:0,seed:s}).plant);assert.equal(seeds.size,6,'a surprise can be any of them');
assert.equal(F.start({now:0,plant:'carrot'}).plant,'carrot','or what you chose');assert.equal(F.finish(F.start({now:0,plant:'carrot'}),1000).plant,'carrot','the record keeps it');

// Harvest: crops that grew ripe, scaled by how much you stayed
assert.equal(F.harvest({plant:'tomato',focusedMs:10*MIN,ratio:1}),null,'too young');
assert.equal(F.harvest({plant:'tree',focusedMs:50*MIN,ratio:1}),null,'an oak is not a crop');assert.equal(F.harvest({focusedMs:50*MIN,ratio:1}),null,'nor is an old record with no plant');
assert.deepEqual(F.harvest({plant:'tomato',focusedMs:50*MIN,ratio:1}),{plant:'tomato',count:4,noun:'tomatoes'});
assert.deepEqual(F.harvest({plant:'carrot',focusedMs:50*MIN,ratio:.3}),{plant:'carrot',count:1,noun:'carrot'},'there is always at least one');
assert(F.harvest({plant:'strawberry',focusedMs:50*MIN,ratio:1}).count>F.harvest({plant:'strawberry',focusedMs:50*MIN,ratio:.2}).count,'staying with it yields more');
const stats=F.gardenStats([{plant:'tomato',focusedMs:50*MIN,awayMs:0,ratio:1,endedAt:1},{plant:'tomato',focusedMs:50*MIN,awayMs:0,ratio:1,endedAt:1},{plant:'tree',focusedMs:50*MIN,awayMs:0,ratio:1,endedAt:1},{plant:'carrot',focusedMs:5*MIN,awayMs:0,ratio:1,endedAt:1}],10);
assert.deepEqual(stats.harvested,[{plant:'tomato',count:8,noun:'tomatoes'}],'totals across classes');

// The drawings
// Gradient ids differ on purpose (see below), so compare drawings without them
const bare=svg=>svg.replace(/id="[^"]+"/g,'id=""').replace(/url\(#[^)]+\)/g,'url()');
const plants=F.PLANTS.map(p=>p.id),grid=[0,.01,.05,.1,.2,.4,.7,1];
for(const plant of plants){
 const sizes=[];
 for(const growth of grid)for(const density of [0,.5,1]){
  const out=G.svg({plant,seed:11,growth,density,color:'#4a9d6f'},{size:100});
  assert(out.startsWith('<svg')&&out.endsWith('</svg>'),plant+' is an svg');assert(!/NaN|undefined|Infinity/.test(out),plant+' at '+growth+'/'+density+' has a bad number');
  if(density===1)sizes.push(out.length);
 }
 assert(sizes.at(-1)>sizes[0]*1.5,plant+' grows: '+sizes);
 assert.equal(bare(G.svg({plant,seed:3,growth:.6,density:.8},{still:true})),bare(G.svg({plant,seed:3,growth:.6,density:.8},{still:true})),plant+': the same inputs, the same plant');
}
assert.notEqual(bare(G.svg({plant:'tomato',seed:3,growth:.8,density:1})),bare(G.svg({plant:'tomato',seed:4,growth:.8,density:1})),'a different seed, a different plant');
assert(G.svg({plant:'sunflower',seed:3,growth:1,density:1}).length>G.svg({plant:'sunflower',seed:3,growth:1,density:.1}).length,'a drifting class is sparser');
// Many are on the page at once, so each must have gradient ids of its own
const ids=s=>[...s.matchAll(/id="([A-Za-z0-9_]+)"/g)].map(m=>m[1]);
const a=ids(G.svg({plant:'lettuce',seed:1,growth:1})),b=ids(G.svg({plant:'lettuce',seed:1,growth:1}));
assert(a.length>=5&&!a.some(id=>b.includes(id)),'unique gradient ids per drawing');assert.equal(new Set(a).size,a.length);
for(const url of G.svg({plant:'lettuce',seed:1,growth:1}).matchAll(/url\(#([A-Za-z0-9_]+)\)/g))assert(ids(G.svg({plant:'lettuce',seed:1,growth:1})).length>0&&url[1]);
const one=G.svg({plant:'tomato',seed:1,growth:1}),defined=new Set(ids(one));for(const m of one.matchAll(/url\(#([A-Za-z0-9_]+)\)/g))assert(defined.has(m[1]),'every gradient it uses is defined: '+m[1]);
assert(G.svg({plant:'tomato',seed:1,growth:1}).includes('plant-sway')&&!G.svg({plant:'tomato',seed:1,growth:1},{still:true}).includes('plant-sway'),'it sways unless asked to be still');
console.log('PASS: garden art — six plants, harvest, stages, deterministic and continuous drawings.');
