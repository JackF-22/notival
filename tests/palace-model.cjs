const assert=require('node:assert/strict'),P=require('../web/palace-model.js');
const house=()=>P.starterHouse('subject','Test house');
const near=(a,b,e=1e-6)=>Math.abs(a-b)<e;

// ── The catalogue ──
const types=Object.keys(P.CATALOG);assert(types.length>=30,'a good range of furniture: '+types.length);
for(const t of types){
 const s=P.CATALOG[t];assert(s.name&&s.cat&&s.w>0&&s.d>0&&s.h>0&&s.parts.length>0,t+' is complete');
 for(const part of s.parts){assert(['b','c'].includes(part[0]),t+' part kind');assert(part.slice(1,-1).every(Number.isFinite),t+' part numbers');assert(/^#[0-9a-f]{6}$/i.test(P.paint(part.at(-1),'#808080')),t+' part colour '+part.at(-1))}
}
assert.equal(P.paint('m','#808080'),'#808080');assert.notEqual(P.paint('m-','#808080'),P.paint('m+','#808080'),'darker and lighter differ');

// ── The starter house is sound ──
const h=house();
assert.equal(h.rooms.length,5);assert.deepEqual(P.problems(h),[],'nothing in the starter house is misplaced');
assert(h.furniture.length>=30&&h.openings.length>=10);
// walls: a shared edge is one wall, not two
const cells=P.wallCells(h);
assert.equal(cells.filter(c=>c.axis==='z'&&c.at===6&&c.i>=0&&c.i<10).length,10,'living room and kitchen share one wall of ten cells');
const arch=cells.filter(c=>c.kind==='arch');assert.equal(arch.length,3,'the archway is three cells');assert(arch.every(c=>c.a&&c.b&&c.a!==c.b),'between two rooms');
assert(cells.some(c=>c.kind==='door'&&(!c.a||!c.b)),'there is a way in from outside');
const runs=P.wallRuns(h);assert(runs.length<cells.length,'cells are joined into runs');
assert(runs.every(r=>r.to>r.from));
const total=runs.reduce((n,r)=>n+(r.to-r.from)/P.G,0);assert.equal(total,cells.length,'every cell is in exactly one run');

// ── Rooms ──
let p=P.blank('s','x');
const a=P.addRoom(p,{x:0,z:0,w:4,d:4});assert(a&&a.name==='Living room');
assert.equal(P.addRoom(p,{x:2,z:2,w:4,d:4}),null,'rooms cannot overlap');
const b=P.addRoom(p,{x:4,z:0,w:3,d:4});assert(b,'but they can touch');
assert.equal(P.addRoom(p,{x:10,z:0,w:1,d:4}),null,'and not be too small');
const odd=P.addRoom(p,{x:10.1,z:0,w:2.7,d:2.2});assert(odd&&near(odd.x%.5,0)&&near(odd.w%.5,0),'sizes snap to the half-metre grid');
assert.equal(P.resizeRoom(p,b.id,{w:2}).w,2);assert.equal(P.resizeRoom(p,b.id,{x:3}),null,'a resize that would overlap is refused');
// resizing cannot strand furniture
const sofa=P.placeFurniture(p,'sofa',2,2);assert(sofa);assert.equal(P.resizeRoom(p,a.id,{w:2}),null,'the sofa would be outside, so no');
assert.equal(P.resizeRoom(p,a.id,{d:5}).d,5);assert.equal(P.resizeRoom(p,a.id,{w:5}),null,'but not into its neighbour');
// moving a room takes its furniture with it
P.removeRoom(p,odd.id);const sx=sofa.x;P.moveRoom(p,a.id,0,6);assert.equal(sofa.z>6,true,'the furniture came too');assert.equal(sofa.x,sx);assert.deepEqual(P.problems(p),[]);
// removing a room removes what was in it
const st=P.addStation(p,sofa.id,{title:'x'});P.removeRoom(p,a.id);assert.equal(p.furniture.length,0);assert.equal(p.stations.length,0,'and its stations');

// ── Doors and windows ──
p=P.blank('s','x');P.addRoom(p,{x:0,z:0,w:4,d:4});P.addRoom(p,{x:4,z:0,w:4,d:4});
const door=P.toggleOpening(p,{axis:'z',at:4,i:4,kind:'door'});assert(door&&door.to-door.from===1,'a door is a metre wide');
assert.equal(P.wallCells(p).filter(c=>c.kind==='door').length,2);
assert.equal(P.toggleOpening(p,{axis:'z',at:4,i:4,kind:'door'}),null,'clicking it again takes it away');assert.equal(p.openings.length,0);
assert.equal(P.toggleOpening(p,{axis:'z',at:4,i:50,kind:'door'}),null,'not on thin air');
const win=P.toggleOpening(p,{axis:'x',at:0,i:2,kind:'window'});assert.equal(win.to-win.from,1.5);
const beside=P.toggleOpening(p,{axis:'x',at:0,i:5,kind:'door'});assert(beside&&beside.from>=2,'a door fits beside the window');assert.equal(P.openingAt(p,'x',0,2).kind,'window','and never on top of it');P.toggleOpening(p,{axis:'x',at:0,i:5,kind:'door'});
// an opening survives while its wall does, and goes when the wall is taken away
const far=P.toggleOpening(p,{axis:'x',at:0,i:14,kind:'door'});assert(far,'a door on the second room\'s north wall');
assert(P.resizeRoom(p,p.rooms[1].id,{w:2}),'shrink that room');assert.equal(P.openingAt(p,'x',0,14),null,'the door was on wall that no longer exists, so it went');
assert.equal(P.openingAt(p,'x',0,2)?.kind,'window','the window on the first room is untouched');

// ── Furniture ──
p=P.blank('s','x');P.addRoom(p,{x:0,z:0,w:4,d:4});
const bed=P.placeFurniture(p,'bed-double',2,2);assert(bed,'a bed fits');
assert.equal(P.placeFurniture(p,'sofa',2,2),null,'no two floor pieces in one spot');
assert.equal(P.placeFurniture(p,'sofa',20,20),null,'and not outside the house');
assert(P.placeFurniture(p,'rug',2,2),'a rug can lie under the bed');
const tv=P.placeFurniture(p,'tv-unit',.3,3,{rot:90});assert(tv&&near(P.footprint(tv).x0,P.THICK/2),'it sits flush against the wall');
// rotating swaps the footprint, and is refused when there is no room
const chair=P.placeFurniture(p,'bookshelf',3.5,3);assert(chair);const fw=P.footprint(chair);assert(fw.w>fw.d);
const turned=P.rotateFurniture(p,chair.id);assert(turned&&P.footprint(turned).w<P.footprint(turned).d,'rotating swaps its width and depth');
// a wall piece hangs on a wall, facing into the room
const pic=P.placeFurniture(p,'painting',2,.3);assert(pic,'a painting finds the wall');assert.equal(pic.rot,0,'on the north wall it faces south, into the room');assert(pic.z<.3);
const pic2=P.placeFurniture(p,'painting',.1,2);assert(pic2&&pic2.rot===90,'on the west wall it faces east');
const pic3=P.placeFurniture(p,'mirror',3.9,2);assert(pic3&&pic3.rot===270,'on the east wall it faces west');
assert.equal(P.placeFurniture(p,'painting',2,2),null,'there is no wall in the middle of the room');
// moving, swapping, recolouring, removing
assert(P.moveFurniture(p,bed.id,1.5,1.5));assert.equal(P.moveFurniture(p,bed.id,50,50),null);
assert(P.swapFurniture(p,bed.id,'bed-single'),'a bed for a bed');assert.equal(P.swapFurniture(p,bed.id,'painting'),null,'but not a bed for a painting');
assert.equal(P.recolour(p,bed.id,'#112233').color,'#112233');
const s1=P.addStation(p,bed.id,{title:'привет'});P.removeFurniture(p,bed.id);assert.equal(p.stations.length,0,'stations leave with their furniture');
// finding a spot for a new piece
const spot=P.findSpot(p,'armchair',p.rooms[0].id);assert(spot);assert(P.canPlace(p,{id:'?',type:'armchair',x:spot.x,z:spot.z,rot:0},null));
const wallSpot=P.findSpot(p,'clock',p.rooms[0].id);assert(wallSpot,'a wall piece finds a wall');

// ── Stations and the route ──
const g=house();
const sofa2=g.furniture.find(f=>f.type==='sofa'),fridge=g.furniture.find(f=>f.type==='fridge');
const sA=P.addStation(g,sofa2.id,{title:'one'}),sB=P.addStation(g,fridge.id,{title:'two'});
assert.deepEqual(P.route(g).map(s=>s.title),['one','two']);
assert(P.moveStation(g,sB.id,-1));assert.deepEqual(P.route(g).map(s=>s.title),['two','one'],'the route can be reordered');
assert.equal(P.moveStation(g,sB.id,-1),false,'not past the start');
assert.equal(P.addStation(g,'nope',{}),null);
assert.equal(P.stationsOn(g,sofa2.id).length,1);
// the entrance and the walk
const door0=P.entrance(g);assert.equal(door0.room.name,'Living room','you come in through the living room');
const order=P.walkOrder(g);assert.equal(order.length,g.furniture.filter(f=>P.layerOf(f)!=='rug').length);
const rooms=[];for(const f of order){const r=P.roomOf(g,f).name;if(rooms.at(-1)!==r)rooms.push(r)}
assert.equal(rooms[0],'Living room');assert.equal(new Set(rooms).size,rooms.length,'each room is visited once, in one go');assert.equal(rooms.length,5);
// placing a list of things around the house
const g2=house(),order2=P.walkOrder(g2);const made=P.autoPlace(g2,Array.from({length:6},(_,i)=>({title:'w'+i,detail:'d'+i,link:{kind:'vocab',id:'v'+i}})));
assert.equal(made.length,6);assert.equal(new Set(made.map(s=>s.furnitureId)).size,6,'each on a different piece');
assert.deepEqual(made.map(s=>s.furnitureId),order2.slice(0,6).map(f=>f.id),'in walking order');
assert.equal(made[0].link.kind,'vocab');
const more=P.autoPlace(g2,Array.from({length:3},(_,i)=>({title:'x'+i})));assert.equal(more[0].furnitureId,order2[6].id,'the next batch carries on where the last stopped');
const tiny=P.blank('s','t');P.addRoom(tiny,{x:0,z:0,w:4,d:4});P.placeFurniture(tiny,'sofa',2,2);assert.equal(P.autoPlace(tiny,[{title:'a'},{title:'b'}]).length,1,'only as many as there is furniture');

// ── Walking about ──
const walls=P.colliders(g);
const living=g.rooms[0];
assert.equal(P.blockedBy(walls,3,1.2),false,'open floor');assert.equal(P.blockedBy(walls,0.1,4.5),true,'a wall');
assert.equal(P.blockedBy(walls,1.5,5),false,'the bedroom door is open');assert.equal(P.blockedBy(walls,3.5,5),true,'beside the door is wall');
assert.equal(P.blockedBy(walls,6,2),false,'the archway is open');assert.equal(P.blockedBy(walls,6,4),true,'the rest of that wall is solid');
const sofaRect=P.footprint(sofa2);assert.equal(P.blockedBy(walls,sofa2.x,sofa2.z),true,'furniture blocks');
const rugF=g.furniture.find(f=>f.type==='rug');const onRug=P.footprint(rugF);assert.equal(P.blockedBy(walls,onRug.x1-.1,rugF.z),false,'a rug does not block (where nothing else stands on it)');
const empty=P.blank('s','e');P.addRoom(empty,{x:0,z:0,w:4,d:4});const emptyWalls=P.colliders(empty);
const slid=P.slide(emptyWalls,.5,2,-.3,.3);assert(near(slid.z,2.3)&&near(slid.x,.5),'walking into a wall at an angle slides along it: '+JSON.stringify(slid));
const stuck=P.slide(emptyWalls,2,2,.1,.1);assert(near(stuck.x,2.1)&&near(stuck.z,2.1),'free movement is unchanged');
// every doorway in the starter house can actually be walked through, from either side
for(const o of g.openings.filter(o=>o.kind==='door'||o.kind==='arch')){
 const mid=(o.from+o.to)/2,mx=o.axis==='x'?mid:o.at,mz=o.axis==='x'?o.at:mid,nx=o.axis==='x'?0:1,nz=o.axis==='x'?1:0;
 for(const side of [-.55,0,.55])assert.equal(P.blockedBy(walls,mx+nx*side,mz+nz*side),false,'a '+o.kind+' at '+mx+','+mz+' is clear ('+side+')');
}
// where to stand to look at something
for(const f of g.furniture){const v=P.viewFrom(g,f);assert(P.roomAt(g,v.x,v.z),f.type+': you stand inside a room');assert.equal(P.blockedBy(walls,v.x,v.z,.3),false,f.type+': and not inside anything');
 const dx=Math.sin(v.yaw),dz=Math.cos(v.yaw);assert((f.x-v.x)*dx+(f.z-v.z)*dz>0,f.type+': facing it')}
// clicking furniture from the camera
const view=P.viewFrom(g,sofa2);const dir={x:sofa2.x-view.x,y:.4-1.6,z:sofa2.z-view.z};
const hit=P.pick(g,{x:view.x,y:1.6,z:view.z},dir);assert(hit&&hit.furniture.id===sofa2.id,'looking at the sofa picks the sofa');
assert.equal(P.pick(g,{x:view.x,y:1.6,z:view.z},{x:0,y:1,z:0}),null,'looking at the ceiling picks nothing');

// ── Undo ──
const q=P.blank('s','x');P.addRoom(q,{x:0,z:0,w:4,d:4});const hist=P.history(q);
assert.equal(hist.canUndo(),false);P.placeFurniture(q,'sofa',2,2);assert.equal(hist.record(),true);assert.equal(hist.record(),false,'nothing changed, nothing recorded');
P.placeFurniture(q,'plant',.5,.5);hist.record();assert.equal(q.furniture.length,2);
assert(hist.undo());assert.equal(q.furniture.length,1);assert(hist.undo());assert.equal(q.furniture.length,0);assert.equal(hist.undo(),false);
assert(hist.redo());assert.equal(q.furniture.length,1);P.removeFurniture(q,q.furniture[0].id);hist.record();assert.equal(hist.canRedo(),false,'a new change ends the redo trail');
assert.deepEqual(P.bounds(g),{x0:0,z0:0,x1:10,z1:9});
console.log('PASS: palace model — catalogue, starter house, shared walls and openings, rooms, furniture rules (flush, wall-hung, rugs), stations and route, auto-placement in walking order, collisions and sliding, viewpoints, picking, undo.');
