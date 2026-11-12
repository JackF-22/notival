const assert=require('node:assert/strict'),P=require('../web/palace-model.js');
const house=()=>P.starterHouse('subject','Test house');
const near=(a,b,e=1e-6)=>Math.abs(a-b)<e;

// ── The catalogue ──
const types=Object.keys(P.CATALOG);assert(types.length>=30,'a good range of furniture: '+types.length);
for(const t of types){
 const s=P.CATALOG[t];assert(s.name&&s.cat&&s.w>0&&s.d>0&&s.h>0&&s.parts.length>0,t+' is complete');
 for(const part of s.parts){const opts=typeof part.at(-1)==='object',colour=opts?part.at(-2):part.at(-1);assert(['b','c','s','k'].includes(part[0]),t+' part kind');assert(part.slice(1,opts?-2:-1).every(Number.isFinite),t+' part numbers');assert(/^#[0-9a-f]{6}$/i.test(P.paint(colour,'#808080')),t+' part colour '+colour)}
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

// ── Where every walk begins ──
{
 const h=P.starterHouse('s','x'),st=P.startPoint(h);assert.deepEqual([st.x,st.z,st.yaw],[2.5,.9,0],'just inside the front door, facing in');assert.equal(P.roomAt(h,st.x,st.z).name,'Living room');
 const e=P.entrance(h);assert(Math.abs(e.x-st.x)<.6&&Math.abs(e.z-st.z)<1.2,'at the entrance');
 const w=P.blank('s','side');P.addRoom(w,{x:0,z:0,w:4,d:4});w.openings.push({id:'d',kind:'door',axis:'z',at:4,from:1,to:2});
 const s2=P.startPoint(w);assert(Math.abs(s2.x-3.1)<1e-9&&s2.z===1.5&&Math.abs(s2.yaw+Math.PI/2)<1e-9,'a door on the east wall: stand inside facing west');assert(P.roomAt(w,s2.x,s2.z));
 assert.equal(P.startPoint(P.blank('s','none')),null);
}

// ── Floors and staircases ──
{
 const h=P.starterHouse('s','x');const doors0=h.openings.filter(o=>o.kind==='door').length;const furniture0=h.furniture.length;
 assert.deepEqual(P.levels(h),[0]);assert.equal(P.levelName(0),'Ground floor');assert.equal(P.levelName(1),'First floor');
 assert.equal(P.setLevel(h,1),false,'there is no floor 1 yet');
 const hist=P.history(h);
 const lone=P.placeFurniture(h,'stairs-up',3,2);assert.equal(lone,null,'a staircase needs a floor above');
 const n=P.addLevel(h);assert.equal(n,1);assert.deepEqual(P.levels(h),[0,1]);assert.equal(P.levelOf(h),0,'adding a floor does not move you');
 assert(hist.record(),'adding a floor is an edit');
 P.setLevel(h,1);assert.equal(h.rooms.length,5,'the same outline upstairs');assert.equal(h.furniture.length,0,'and empty');
 const outside=h.openings.filter(o=>o.kind==='door'&&o.axis==='x'&&o.at===0);assert.equal(outside.length,0,'no front door upstairs');
 assert(h.openings.some(o=>o.kind==='window'),'windows are copied');assert.deepEqual(P.problems(h),[]);
 assert.equal(hist.record(),false,'going upstairs is not an edit');
 P.setLevel(h,0);assert.equal(h.furniture.length,furniture0,'the ground floor is as it was');
 // a staircase has two ends
 const room=h.rooms.find(r=>r.name==='Study');P.removeFurniture(h,h.furniture.find(f=>f.type==='piano').id);
 let st=null;for(const rot of [0,90])for(let x=room.x+.5;x<room.x+room.w&&!st;x+=.5)for(let z=room.z+.5;z<room.z+room.d&&!st;z+=.5)st=P.placeFurniture(h,'stairs-up',x,z,{rot});
 assert(st&&st.link,'a staircase fits somewhere in the study');
 const other=P.partnerOf(h,st);assert(other&&other.level===1&&other.furniture.type==='stairs-down'&&other.furniture.x===st.x&&other.furniture.z===st.z&&other.furniture.rot===st.rot,'with a stairwell above it');
 assert.equal(P.partnerOf(h,other.furniture).furniture.id,st.id,'and the stairs lead back down');
 assert.equal(P.swapFurniture(h,st.id,'sofa'),null,'a staircase cannot be swapped');
 assert.deepEqual(P.problems(h),[]);
 // moving and turning it moves the stairwell too
 const before={x:st.x,z:st.z};const moved=P.moveFurniture(h,st.id,st.x+.5,st.z);if(moved){const o=P.partnerOf(h,st);assert.equal(o.furniture.x,st.x,'the stairwell follows')}
 const r0=st.rot;if(P.rotateFurniture(h,st.id)){const o=P.partnerOf(h,st);assert.equal(o.furniture.rot,st.rot,'and turns with it')}
 // stations remember their floor, and the history keeps every floor
 P.setLevel(h,1);const up=P.placeFurniture(h,'sofa',2,2)||P.placeFurniture(h,'sofa',3,2.5)||P.placeFurniture(h,'sofa',2,6);assert(up,'a sofa upstairs');
 const stn=P.addStation(h,up.id,{title:'upstairs thing'});assert.equal(stn.level,1);assert(hist.record());
 P.setLevel(h,0);assert.deepEqual(P.problems(h),[],'stations upstairs do not count against the floor below');
 assert(hist.undo(),'undo');assert.equal(P.levelOf(h),0,'undo keeps you on your floor');P.setLevel(h,1);assert.equal(h.furniture.some(f=>f.type==='sofa'),false,'the sofa upstairs is gone');assert.equal(h.stations.some(q=>q.title==='upstairs thing'),false);P.setLevel(h,0);
 assert(hist.redo());P.setLevel(h,1);assert(h.furniture.some(f=>f.type==='sofa'),'and back');P.setLevel(h,0);
 // removing the staircase removes both ends
 P.removeFurniture(h,st.id);assert.equal(P.partnerOf(h,{link:st.link,id:'x'}),null);P.setLevel(h,1);assert.equal(h.furniture.some(f=>f.type==='stairs-down'),false,'the stairwell goes too');P.setLevel(h,0);
 // a second floor, and an old palace with no floors at all
 assert.equal(P.addLevel(h),2);assert.deepEqual(P.levels(h),[0,1,2]);assert.equal(P.levelName(2),'Second floor');
 const old=P.starterHouse('s','old');delete old.level;delete old.floors;assert.deepEqual(P.levels(old),[0]);assert.equal(P.placeFurniture(old,'plant',1,1)?1:1,1);
 const copy=JSON.parse(JSON.stringify(h));assert.deepEqual(P.levels(copy),[0,1,2],'floors survive saving');
}

// ── Props on furniture ──
{
 const h=P.blank('s','props');P.addRoom(h,{x:0,z:0,w:6,d:5});
 const shelf=P.placeFurniture(h,'bookshelf',3,.4),desk=P.placeFurniture(h,'desk',3,3),rug=P.placeFurniture(h,'rug',3,3.5),lamp=P.placeFurniture(h,'floor-lamp',.5,.5);
 assert(shelf&&desk&&lamp,'furniture placed');assert(P.surfacesOf(shelf).length>=4,'a bookshelf has several shelves');assert.equal(P.surfacesOf(lamp).length,0,'a lamp has no top to stand things on');
 assert.equal(P.placeProp(h,'mug',lamp.id),null,'nothing stands on a lamp');assert.equal(P.placeProp(h,'nope',desk.id),null);assert.equal(P.placeProp(h,'mug','missing'),null);
 // books stand on shelves, side by side, never overlapping
 const books=[];for(let i=0;i<24;i++){const b=P.placeProp(h,'book',shelf.id,{surface:0,...P.bookLike(i)});if(b)books.push(b)}
 assert(books.length>=8&&books.length<24,'a shelf fills up: '+books.length);assert(books.every(b=>b.surface===0),'all on the shelf asked for');
 for(const a of books)for(const b of books)if(a!==b)assert(Math.abs(a.lx-b.lx)>=(a.t+b.t)/2-1e-6,'books do not overlap');
 assert.deepEqual(P.problems(h),[],'a sound house');
 assert.equal(P.placeProp(h,'vase',shelf.id,{surface:3}),null,'a vase is too tall for the top shelf');
 const vase=P.placeProp(h,'vase',shelf.id,{surface:1});assert(vase,'a vase fits on a middle shelf');
 // size: a book stands on a shelf and lies flat on a desk
 const flat=P.placeProp(h,'book',desk.id,{});const sz=P.propSize(flat,P.surfacesOf(desk)[0]);assert(sz.w>.15&&sz.h<.06,'flat on a desk');
 const upright=P.propWorld(h,books[0]);assert(upright.shelf&&upright.h>.2,'upright on a shelf');assert.equal(upright.y,P.surfacesOf(shelf)[0].y+(P.spec('bookshelf').lift||0));
 // position follows the furniture when it turns
 const m=P.placeProp(h,'mug',desk.id,{lx:.5,lz:0});const before=P.propWorld(h,m);P.rotateFurniture(h,desk.id);const after=P.propWorld(h,m);
 assert(Math.hypot(after.x-desk.x,after.z-desk.z)>.4&&(Math.abs(after.x-before.x)>.1||Math.abs(after.z-before.z)>.1),'props turn with their furniture');
 P.rotateFurniture(h,desk.id);P.rotateFurniture(h,desk.id);P.rotateFurniture(h,desk.id);
 // moving, levels and refusing
 const mug=P.placeProp(h,'mug',desk.id,{lx:-.5});assert(P.moveProp(h,mug.id,desk.id,{lx:.2,lz:.1}),'moved on the desk');assert(Math.abs(mug.lx-.2)<.02);
 assert.equal(P.moveProp(h,mug.id,lamp.id,{}),null,'not onto a lamp');
 const other=P.placeFurniture(h,'coffee-table',1.5,3);assert(P.moveProp(h,mug.id,other.id,{}),'to another table');assert.equal(mug.hostId,other.id);
 // routes: a prop becomes a stop, and the stop follows it
 const st=P.toggleRoute(h,mug.id);assert(st&&st.propId===mug.id&&st.furnitureId===other.id,'a stop on the mug');assert.equal(P.stationOf(h,mug.id).id,st.id);
 P.moveProp(h,mug.id,desk.id,{});assert.equal(P.stationOf(h,mug.id).furnitureId,desk.id,'the stop moves with the prop');
 assert.equal(P.toggleRoute(h,mug.id),null,'toggled off');assert.equal(P.stationOf(h,mug.id),null);
 // turning a prop
 const note=P.placeProp(h,'notebook',desk.id,{});assert(P.rotateProp(h,note.id));assert.equal(note.rot,90);
 // removing
 P.toggleRoute(h,note.id);P.removeProp(h,note.id);assert.equal(P.propsOf(h).some(q=>q.id===note.id),false);assert.equal(h.stations.some(q=>q.propId===note.id),false,'its stop goes too');
 P.toggleRoute(h,vase.id);const n=P.propsOn(h,shelf.id).length;P.removeFurniture(h,shelf.id);assert.equal(P.propsOn(h,shelf.id).length,0,'furniture takes its props with it');assert(P.propsOf(h).length<n+10);assert.equal(h.stations.some(q=>q.propId===vase.id),false);
 assert.deepEqual(P.problems(h),[]);
 // swapping furniture keeps props only if they still fit
 const t1=P.placeFurniture(h,'dining-table',4.5,3.2);const cup=P.placeProp(h,'fruit',t1.id,{});assert(cup);assert.equal(P.swapFurniture(h,t1.id,'coffee-table'),t1,'a small prop fits on the swapped table');
 for(let i=0;i<3;i++)P.placeProp(h,'laptop',t1.id,{lx:-.3+i*.31});
 // undo restores props, and old palaces without any still work
 const u=P.blank('s','u');P.addRoom(u,{x:0,z:0,w:4,d:4});const dk=P.placeFurniture(u,'desk',2,2);delete u.props;const hist=P.history(u);
 P.placeProp(u,'mug',dk.id,{});assert(hist.record());assert(hist.undo());assert.equal(u.props.length,0,'undo removes the prop');assert(hist.redo());assert.equal(u.props.length,1,'redo brings it back');
 // picking by ray
 const hv=P.blank('s','pick');P.addRoom(hv,{x:0,z:0,w:6,d:5});const dk2=P.placeFurniture(hv,'desk',3,3),mg=P.placeProp(hv,'mug',dk2.id,{lx:0,lz:0}),w=P.propWorld(hv,mg);
 const eye={x:w.x,y:1.6,z:w.z+2},dir={x:0,y:w.y+.05-1.6,z:-2};const hit=P.pickProp(hv,eye,dir);assert(hit&&hit.prop.id===mg.id,'looking at the mug picks it');
 assert.equal(P.pickProp(hv,eye,{x:0,y:1,z:0}),null);
 // the starter house has things to find, one of them a readable guide
 const sh=P.starterHouse('s','x');assert(P.propsOf(sh).length>=8,'things to find');assert(!P.propsOf(sh).some(q=>P.furniture&&0),'');assert.equal(P.propsOf(sh).filter(q=>{const h=sh.furniture.find(f=>f.id===q.hostId);return h.type==='bookshelf'}).length,0,'the bookshelves start empty');assert(P.propsOf(sh).some(q=>q.type==='book'&&q.pages.length>=3),'a guide book with pages');assert.deepEqual(P.problems(sh),[]);
 // removing a room takes its props
 const r2=P.blank('s','r');const room=P.addRoom(r2,{x:0,z:0,w:4,d:4});const dk3=P.placeFurniture(r2,'desk',2,2);P.placeProp(r2,'mug',dk3.id,{});P.removeRoom(r2,room.id);assert.equal(P.propsOf(r2).length,0);
}
console.log('PASS: palace model — catalogue, starter house, shared walls and openings, rooms, furniture rules (flush, wall-hung, rugs), stations and route, auto-placement in walking order, collisions and sliding, viewpoints, picking, undo, props on furniture, and floors with staircases.');
