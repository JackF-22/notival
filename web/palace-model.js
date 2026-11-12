// A memory palace: a house you can walk through, with things to remember placed around it. This file is only the data
// and its rules (no drawing), so it can be tested without a window.
//
//   palace = {id, projectId, name, rooms, openings, furniture, stations, camera}
//   room      {id, name, x, z, w, d, floor, wall}               metres, on a half-metre grid; x east, z south
//   opening   {id, kind:'door'|'window'|'arch', axis, at, from, to}   a gap in a wall: axis 'x' = a wall running east-west
//                                                                  at z=at, from..to along x; axis 'z' = north-south at x=at
//   furniture {id, type, x, z, rot, color}                       centre of the footprint; rot 0/90/180/270, front faces +z at 0
//   station   {id, furnitureId, order, title, detail, image, link} something to remember, left on a piece of furniture
//
// Walls are worked out from the rooms: every room edge is a row of half-metre cells, shared edges become one wall, and an
// opening turns some of those cells into a door, window or arch.
const PalaceModel=(()=>{
 const G=.5,HEIGHT=2.6,THICK=.12,DOOR_TOP=2.1,ARCH_TOP=2.35,SILL=.9,HEAD=2.0,RADIUS=.28,MIN_ROOM=2;
 const snap=(value,step=G)=>Math.round(value/step)*step;
 const round=value=>Math.round(value*1000)/1000;
 const makeId=prefix=>prefix+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-3);

 // ── What can be put in a house ───────────────────────────────────────────────
 // Parts are boxes ['b',x,bottom,z,w,h,d,colour] and upright cylinders ['c',x,bottom,z,radius,h,colour] around the centre of
 // the footprint. Colours: '#hex', or 'm' (the piece's own colour), 'm-' darker, 'm+' lighter.
 const B=(x,y,z,w,h,d,c)=>['b',x,y,z,w,h,d,c],C=(x,y,z,r,h,c)=>['c',x,y,z,r,h,c];
 const DARK='#3a3a40';
 const books=(y,x0,x1,z=.02)=>{const colours=['#b5533c','#3f6f8f','#d6a64a','#5f8a5a','#8a5a8a','#c9c2b2'],out=[];let x=x0,k=0;while(x<x1-.05){const w=.07+(k*37%5)*.012;out.push(B(x+w/2,y,z,w-.01,.28+((k*13)%4)*.025,.2,colours[k%colours.length]));x+=w;k++}return out};
 const legs=(w,d,h,inset=.05,t=.05)=>[[-1,-1],[1,-1],[-1,1],[1,1]].map(([a,b])=>B(a*(w/2-inset),0,b*(d/2-inset),t,h,t,DARK));
 const CATALOG={
  sofa:{name:'Sofa',cat:'Living',w:2.1,d:.95,h:.85,color:'#6f8fb0',parts:[B(0,0,0,2.1,.28,.95,'m-'),B(0,.28,.1,1.74,.17,.72,'m+'),B(0,.28,-.36,2.1,.57,.23,'m'),B(-.96,.28,.05,.18,.3,.85,'m-'),B(.96,.28,.05,.18,.3,.85,'m-')]},
  armchair:{name:'Armchair',cat:'Living',w:.95,d:.9,h:.85,color:'#c98f8f',parts:[B(0,0,0,.95,.28,.9,'m-'),B(0,.28,.1,.6,.17,.65,'m+'),B(0,.28,-.34,.95,.57,.22,'m'),B(-.38,.28,.05,.2,.3,.8,'m-'),B(.38,.28,.05,.2,.3,.8,'m-')]},
  'coffee-table':{name:'Coffee table',cat:'Living',w:1.1,d:.6,h:.42,color:'#b9876b',parts:[B(0,.38,0,1.1,.04,.6,'m'),...legs(1.1,.6,.38,.06,.05)]},
  'side-table':{name:'Side table',cat:'Living',w:.5,d:.5,h:.55,color:'#b9876b',parts:[C(0,.5,0,.25,.04,'m'),C(0,0,0,.04,.5,DARK),C(0,0,0,.18,.03,DARK)]},
  'tv-unit':{name:'TV and stand',cat:'Living',w:1.5,d:.45,h:1.15,color:'#8d8aa6',parts:[B(0,0,0,1.5,.5,.45,'m'),B(0,.5,0,.2,.1,.12,DARK),B(0,.6,0,1.25,.7,.05,'#1b1b20')]},
  bookshelf:{name:'Bookshelf',cat:'Living',w:1,d:.32,h:1.9,color:'#a8a39a',parts:[B(0,0,0,1,1.9,.32,'m'),...[.05,.55,1.05,1.52].flatMap(y=>books(y,-.43,.43,.07))]},
  fireplace:{name:'Fireplace',cat:'Living',w:1.4,d:.4,h:1.2,color:'#a8a39a',parts:[B(0,0,0,1.4,1.1,.4,'m'),B(0,.05,.2,.7,.6,.02,'#1d1d20'),B(0,1.1,0,1.5,.07,.46,'#8a7a64')]},
  piano:{name:'Piano',cat:'Living',w:1.5,d:.65,h:1.15,color:'#2a2a30',parts:[B(0,0,0,1.5,.9,.65,'m'),B(0,.9,.15,1.4,.05,.35,'#efece4'),B(0,.95,-.1,1.5,.2,.45,'m'),...[-.6,0,.6].map(x=>B(x,0,.2,.06,.5,.06,DARK))]},
  'floor-lamp':{name:'Floor lamp',cat:'Living',w:.35,d:.35,h:1.65,color:'#f4e7c2',parts:[C(0,0,0,.14,.03,DARK),C(0,0,0,.02,1.35,DARK),C(0,1.3,0,.17,.35,'m')]},
  plant:{name:'Plant',cat:'Decor',w:.5,d:.5,h:1.2,color:'#4f8a4a',parts:[C(0,0,0,.2,.35,'#a0634a'),C(0,.35,0,.04,.3,'#5a7a3a'),C(0,.55,0,.28,.35,'m'),C(0,.85,0,.2,.3,'m+')]},
  rug:{name:'Rug',cat:'Decor',w:2.2,d:1.5,h:.02,layer:'rug',color:'#c98f8f',parts:[B(0,0,0,2.2,.02,1.5,'m-'),B(0,.02,0,1.9,.005,1.2,'m+')]},
  'round-rug':{name:'Round rug',cat:'Decor',w:1.8,d:1.8,h:.02,layer:'rug',color:'#8d8aa6',parts:[C(0,0,0,.9,.02,'m-'),C(0,.02,0,.7,.005,'m+')]},
  painting:{name:'Painting',cat:'Decor',w:.9,d:.05,h:.7,layer:'wall',lift:1.3,color:'#d6c28e',parts:[B(0,0,0,.9,.7,.05,'#6b4a2f'),B(0,.06,.027,.78,.58,.006,'m'),B(-.12,.2,.032,.3,.3,.004,'m+'),B(.2,.12,.032,.26,.2,.004,'m-')]},
  mirror:{name:'Mirror',cat:'Decor',w:.6,d:.04,h:1.2,layer:'wall',lift:.8,color:'#bcd3dc',parts:[B(0,0,0,.6,1.2,.04,'#8a7a64'),B(0,.05,.022,.5,1.1,.004,'#bcd3dc')]},
  clock:{name:'Wall clock',cat:'Decor',w:.4,d:.05,h:.4,layer:'wall',lift:1.9,color:'#efece4',parts:[B(0,0,0,.4,.4,.05,'#3a3a40'),B(0,.03,.027,.34,.34,.006,'m'),B(0,.2,.034,.02,.14,.004,DARK),B(.04,.19,.034,.1,.02,.004,DARK)]},
  'bed-double':{name:'Double bed',cat:'Bedroom',w:1.6,d:2.1,h:1,color:'#7ea181',parts:[B(0,0,0,1.6,.3,2.1,'#8b6b4a'),B(0,.3,.05,1.5,.22,1.95,'#efece4'),B(0,.52,.45,1.52,.06,1.2,'m'),B(-.4,.52,-.8,.5,.12,.32,'#f7f4ee'),B(.4,.52,-.8,.5,.12,.32,'#f7f4ee'),B(0,.3,-1.03,1.6,.7,.08,'#7a5a3d')]},
  'bed-single':{name:'Single bed',cat:'Bedroom',w:1,d:2,h:.9,color:'#6f8fb0',parts:[B(0,0,0,1,.3,2,'#8b6b4a'),B(0,.3,.05,.92,.2,1.85,'#efece4'),B(0,.5,.4,.94,.06,1.15,'m'),B(0,.5,-.75,.5,.12,.32,'#f7f4ee'),B(0,.3,-.97,1,.6,.07,'#7a5a3d')]},
  nightstand:{name:'Nightstand',cat:'Bedroom',w:.45,d:.4,h:.5,color:'#b9876b',parts:[B(0,0,0,.45,.5,.4,'m'),B(0,.32,.21,.2,.02,.01,DARK)]},
  wardrobe:{name:'Wardrobe',cat:'Bedroom',w:1.2,d:.6,h:2,color:'#d6c28e',parts:[B(0,0,0,1.2,2,.6,'m'),B(0,.05,.305,.01,1.9,.005,DARK),B(-.08,.9,.31,.03,.2,.02,'#c9b3a6'),B(.08,.9,.31,.03,.2,.02,'#c9b3a6')]},
  dresser:{name:'Dresser',cat:'Bedroom',w:1.2,d:.5,h:.9,color:'#b9876b',parts:[B(0,0,0,1.2,.86,.5,'m'),B(0,.86,0,1.24,.04,.54,'m+'),...[.2,.5,.74].map(y=>B(0,y-.04,.255,.5,.03,.01,DARK))]},
  desk:{name:'Desk',cat:'Study',w:1.4,d:.7,h:.75,color:'#d6c28e',parts:[B(0,.72,0,1.4,.04,.7,'m'),...legs(1.4,.7,.72,.05,.05).slice(0,3),B(.45,.1,0,.4,.62,.6,'m-')]},
  'office-chair':{name:'Office chair',cat:'Study',w:.55,d:.55,h:1,color:'#5f6b73',parts:[B(0,.45,0,.5,.08,.5,'m'),B(0,.53,-.22,.5,.45,.07,'m'),C(0,.1,0,.04,.35,DARK),B(0,0,0,.5,.06,.06,DARK),B(0,0,0,.06,.06,.5,DARK)]},
  chair:{name:'Chair',cat:'Kitchen',w:.45,d:.45,h:.9,color:'#b9876b',parts:[B(0,.45,0,.44,.05,.44,'m'),...legs(.45,.45,.45,.02,.04),B(0,.5,-.2,.44,.4,.04,'m')]},
  'dining-table':{name:'Dining table',cat:'Kitchen',w:1.6,d:.9,h:.76,color:'#b9876b',parts:[B(0,.72,0,1.6,.05,.9,'m'),...legs(1.6,.9,.72,.07,.06)]},
  'kitchen-counter':{name:'Counter',cat:'Kitchen',w:1.2,d:.6,h:.92,color:'#a8a39a',parts:[B(0,0,0,1.2,.88,.6,'m'),B(0,.88,0,1.24,.04,.64,'#dcdad4'),B(-.3,.55,.305,.2,.02,.01,DARK),B(.3,.55,.305,.2,.02,.01,DARK)]},
  'kitchen-sink':{name:'Sink',cat:'Kitchen',w:1.2,d:.6,h:1.1,color:'#a8a39a',parts:[B(0,0,0,1.2,.88,.6,'m'),B(0,.88,0,1.24,.04,.64,'#dcdad4'),B(0,.9,0,.5,.02,.4,'#7a8891'),C(0,.92,-.22,.025,.22,'#aab4ba'),B(0,1.1,-.14,.03,.03,.16,'#aab4ba')]},
  stove:{name:'Stove',cat:'Kitchen',w:.6,d:.6,h:.92,color:'#cfcfcf',parts:[B(0,0,0,.6,.9,.6,'m'),...[[-.15,-.15],[.15,-.15],[-.15,.15],[.15,.15]].map(([x,z])=>C(x,.9,z,.08,.02,'#222222')),B(0,.15,.305,.45,.35,.01,'#222222')]},
  fridge:{name:'Fridge',cat:'Kitchen',w:.7,d:.7,h:1.8,color:'#e9ecee',parts:[B(0,0,0,.7,1.8,.7,'m'),B(0,1.2,.351,.7,.015,.005,'#99a1a6'),B(.27,.5,.36,.03,.5,.03,'#99a1a6'),B(.27,1.3,.36,.03,.3,.03,'#99a1a6')]},
  'kitchen-island':{name:'Island',cat:'Kitchen',w:1.6,d:.8,h:.92,color:'#6f8fb0',parts:[B(0,0,0,1.6,.88,.8,'m'),B(0,.88,0,1.7,.04,.9,'#dcdad4')]},
  bathtub:{name:'Bathtub',cat:'Bathroom',w:1.7,d:.75,h:.6,color:'#f1f3f4',parts:[B(0,0,0,1.7,.55,.75,'m'),B(0,.5,0,1.5,.04,.6,'#bfe0ee'),B(-.78,.55,0,.05,.1,.08,'#aab4ba')]},
  toilet:{name:'Toilet',cat:'Bathroom',w:.4,d:.65,h:.8,color:'#f3f5f6',parts:[B(0,.3,-.25,.38,.45,.16,'m'),B(0,0,.02,.34,.4,.5,'m'),B(0,.4,.05,.38,.04,.44,'#e4e7e8')]},
  vanity:{name:'Basin',cat:'Bathroom',w:.9,d:.5,h:.85,color:'#d8d4cc',parts:[B(0,0,0,.9,.8,.5,'m'),B(0,.8,0,.9,.05,.5,'#f1f3f4'),B(0,.84,0,.4,.02,.3,'#bfd0d8'),C(0,.85,-.2,.02,.12,'#aab4ba')]}
 };
 const FLOORS=['#c9a77c','#a98258','#d8d4cc','#b9c7c3','#c8b8d8','#cfc9a8'],WALLS=['#f2ede4','#e9eef2','#f0e6e1','#e6efe6','#f3efd9','#e4e0ee'];
 const ROOM_NAMES=['Living room','Kitchen','Bedroom','Bathroom','Study','Hall','Dining room','Pantry','Garage','Nursery','Attic','Library','Porch','Cellar'];
 const TINTS=['#b9876b','#6f8fb0','#7ea181','#c98f8f','#d6c28e','#8d8aa6','#a8a39a','#5f6b73'];
 // What each piece is mostly made of, so it can be drawn with the right surface.
 const MATERIALS={sofa:'fabric',armchair:'fabric','bed-double':'fabric','bed-single':'fabric','office-chair':'fabric','coffee-table':'timber','side-table':'timber','tv-unit':'timber',bookshelf:'timber',piano:'ceramic',nightstand:'timber',wardrobe:'timber',dresser:'timber',desk:'timber',chair:'timber','dining-table':'timber','kitchen-counter':'timber','kitchen-sink':'timber',stove:'metal',fridge:'metal','kitchen-island':'timber',bathtub:'ceramic',toilet:'ceramic',vanity:'ceramic',plant:'leaf',rug:'rug','round-rug':'rug','floor-lamp':'fabric',painting:'paper',clock:'ceramic',mirror:'ceramic',fireplace:'brick'};
 for(const [type,mat] of Object.entries(MATERIALS))if(CATALOG[type])CATALOG[type].mat=mat;
 const FLOOR_TYPES=['wood','tile','carpet','plain'];
 const spec=type=>CATALOG[type];
 // A colour made lighter or darker.
 function shade(hex,factor){
  const n=parseInt(String(hex).slice(1),16),c=[n>>16&255,n>>8&255,n&255].map(v=>Math.max(0,Math.min(255,Math.round(factor>=1?v+(255-v)*(factor-1):v*factor))));
  return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
 }
 // A part's real colour for a piece painted `main`.
 const paint=(colour,main)=>colour==='m'?main:colour==='m-'?shade(main,.82):colour==='m+'?shade(main,1.18):colour;

 // ── Rooms and walls ──────────────────────────────────────────────────────────
 const roomAt=(palace,x,z)=>palace.rooms.find(r=>x>r.x&&x<r.x+r.w&&z>r.z&&z<r.z+r.d)||null;
 const cellKey=(axis,at,i)=>axis+':'+round(at)+':'+i;
 // Every wall cell: {axis, at, i, kind, a, b}. For an east-west wall (axis 'x') a is the room to the north and b to the south;
 // for a north-south wall (axis 'z') a is the west room and b the east. kind: solid, door, window or arch.
 function wallCells(palace){
  const edges=new Map(),kinds=new Map();
  for(const o of palace.openings||[])for(let i=Math.round(o.from/G);i<Math.round(o.to/G);i++)kinds.set(cellKey(o.axis,o.at,i),o.kind);
  const add=(axis,at,i)=>{const key=cellKey(axis,at,i);if(!edges.has(key))edges.set(key,{axis,at:round(at),i})};
  for(const r of palace.rooms)for(let i=Math.round(r.x/G);i<Math.round((r.x+r.w)/G);i++){add('x',r.z,i);add('x',r.z+r.d,i)}
  for(const r of palace.rooms)for(let i=Math.round(r.z/G);i<Math.round((r.z+r.d)/G);i++){add('z',r.x,i);add('z',r.x+r.w,i)}
  return [...edges.values()].map(cell=>{
   const mid=(cell.i+.5)*G,e=.1,key=cellKey(cell.axis,cell.at,cell.i);
   const a=cell.axis==='x'?roomAt(palace,mid,cell.at-e):roomAt(palace,cell.at-e,mid),b=cell.axis==='x'?roomAt(palace,mid,cell.at+e):roomAt(palace,cell.at+e,mid);
   return {...cell,kind:kinds.get(key)||'solid',a,b};
  }).sort((p,q)=>p.axis.localeCompare(q.axis)||p.at-q.at||p.i-q.i);
 }
 // Cells in a row with the same kind and the same rooms either side, joined into runs (metres).
 function wallRuns(palace){
  const runs=[];let last=null;
  for(const c of wallCells(palace)){
   if(last&&last.axis===c.axis&&last.at===c.at&&last.kind===c.kind&&last.a===c.a&&last.b===c.b&&Math.round(last.to/G)===c.i){last.to=round((c.i+1)*G);continue}
   last={axis:c.axis,at:c.at,from:round(c.i*G),to:round((c.i+1)*G),kind:c.kind,a:c.a,b:c.b};runs.push(last);
  }
  return runs;
 }
 const sameRect=(p,q)=>p.x<q.x+q.w-1e-6&&q.x<p.x+p.w-1e-6&&p.z<q.z+q.d-1e-6&&q.z<p.z+p.d-1e-6;
 function validRoom(palace,room,ignoreId){
  const ok=[room.x,room.z,room.w,room.d].every(v=>Math.abs(v/G-Math.round(v/G))<1e-6);
  return ok&&room.w>=MIN_ROOM&&room.d>=MIN_ROOM&&!palace.rooms.some(r=>r.id!==ignoreId&&sameRect(r,room));
 }
 function addRoom(palace,{x,z,w,d,name,floor,wall,floorType}){
  const room={id:makeId('r'),name:name||ROOM_NAMES.find(n=>!palace.rooms.some(r=>r.name===n))||'Room '+(palace.rooms.length+1),x:snap(x),z:snap(z),w:snap(w),d:snap(d),floor:floor||FLOORS[palace.rooms.length%FLOORS.length],wall:wall||WALLS[palace.rooms.length%WALLS.length],floorType:floorType||'wood'};
  if(!validRoom(palace,room))return null;
  palace.rooms.push(room);return room;
 }
 // Change a room's size or position. Furniture must still fit, so nothing is lost: the answer is null if it doesn't.
 function resizeRoom(palace,id,{x,z,w,d}){
  const room=palace.rooms.find(r=>r.id===id);if(!room)return null;
  const next={...room,x:snap(x??room.x),z:snap(z??room.z),w:snap(w??room.w),d:snap(d??room.d)};
  if(!validRoom(palace,next,id))return null;
  const before={...room};Object.assign(room,{x:next.x,z:next.z,w:next.w,d:next.d});
  if(palace.furniture.some(f=>!fitsInRoom(palace,f))){Object.assign(room,before);return null}
  pruneOpenings(palace);return room;
 }
 // Move a room and the furniture inside it together.
 function moveRoom(palace,id,x,z){
  const room=palace.rooms.find(r=>r.id===id);if(!room)return null;
  const dx=snap(x)-room.x,dz=snap(z)-room.z;if(!dx&&!dz)return room;
  const next={...room,x:room.x+dx,z:room.z+dz};if(!validRoom(palace,next,id))return null;
  const inside=palace.furniture.filter(f=>roomOf(palace,f)===room);
  Object.assign(room,{x:next.x,z:next.z});for(const f of inside){f.x=round(f.x+dx);f.z=round(f.z+dz)}
  pruneOpenings(palace);return room;
 }
 function removeRoom(palace,id){
  const room=palace.rooms.find(r=>r.id===id);if(!room)return false;
  const gone=palace.furniture.filter(f=>roomOf(palace,f)===room).map(f=>f.id);
  palace.furniture=palace.furniture.filter(f=>!gone.includes(f.id));palace.stations=palace.stations.filter(s=>!gone.includes(s.furnitureId));
  palace.rooms=palace.rooms.filter(r=>r.id!==id);pruneOpenings(palace);return true;
 }
 // ── Doors and windows ────────────────────────────────────────────────────────
 const WIDTH={door:2,window:3,arch:3};
 function openingAt(palace,axis,at,i){return (palace.openings||[]).find(o=>o.axis===axis&&round(o.at)===round(at)&&i>=Math.round(o.from/G)&&i<Math.round(o.to/G))||null}
 // Put a door, window or arch on the wall at (axis, at, cell i); on a cell that already has an opening, take it away.
 function toggleOpening(palace,{axis,at,i,kind='door'}){
  const existing=openingAt(palace,axis,at,i);
  if(existing){palace.openings=palace.openings.filter(o=>o!==existing);return null}
  const cells=new Set(wallCells(palace).filter(c=>c.axis===axis&&c.at===round(at)).map(c=>c.i));
  if(!cells.has(i))return null;
  const width=WIDTH[kind]||2;
  // Fit `width` cells around the click, on cells that are wall and still free: centred if possible, else shifted.
  const starts=Array.from({length:width},(_,k)=>i-width+1+k).sort((p,q)=>Math.abs(p+(width-1)/2-i)-Math.abs(q+(width-1)/2-i));
  for(const start of starts){
   const run=Array.from({length:width},(_,k)=>start+k);
   if(run.every(c=>cells.has(c)&&!openingAt(palace,axis,at,c))){
    const opening={id:makeId('o'),kind,axis,at:round(at),from:round(start*G),to:round((start+width)*G)};palace.openings.push(opening);return opening;
   }
  }
  return null;
 }
 function pruneOpenings(palace){
  const cells=new Set(wallCells(palace).map(c=>cellKey(c.axis,c.at,c.i)));
  palace.openings=(palace.openings||[]).filter(o=>{for(let i=Math.round(o.from/G);i<Math.round(o.to/G);i++)if(!cells.has(cellKey(o.axis,o.at,i)))return false;return true});
 }

 // ── Furniture ────────────────────────────────────────────────────────────────
 const layerOf=f=>spec(f.type)?.layer||'floor';
 // The footprint rectangle, after turning.
 function footprint(f){
  const s=spec(f.type),turned=f.rot===90||f.rot===270,w=turned?s.d:s.w,d=turned?s.w:s.d;
  return {x0:f.x-w/2,x1:f.x+w/2,z0:f.z-d/2,z1:f.z+d/2,w,d};
 }
 const roomOf=(palace,f)=>roomAt(palace,f.x,f.z);
 function fitsInRoom(palace,f){
  const r=roomOf(palace,f),p=footprint(f);if(!r)return false;
  if(layerOf(f)==='wall'){const e=.15;return p.x0>=r.x-e&&p.x1<=r.x+r.w+e&&p.z0>=r.z-e&&p.z1<=r.z+r.d+e}
  return p.x0>=r.x+THICK/2-1e-6&&p.x1<=r.x+r.w-THICK/2+1e-6&&p.z0>=r.z+THICK/2-1e-6&&p.z1<=r.z+r.d-THICK/2+1e-6;
 }
 const overlap=(p,q,e=1e-6)=>p.x0<q.x1-e&&q.x0<p.x1-e&&p.z0<q.z1-e&&q.z0<p.z1-e;
 // May this piece stand here? Floor pieces must be inside a room and clear of other floor pieces; rugs only need a room.
 function canPlace(palace,f,ignoreId){
  if(!spec(f.type))return false;
  if(!fitsInRoom(palace,f))return false;
  if(layerOf(f)==='floor'){const p=footprint(f);return !palace.furniture.some(g=>g.id!==ignoreId&&layerOf(g)==='floor'&&overlap(p,footprint(g)))}
  if(layerOf(f)==='wall'){const p=footprint(f);return !palace.furniture.some(g=>g.id!==ignoreId&&layerOf(g)==='wall'&&overlap({...p,x0:p.x0-.01,x1:p.x1+.01,z0:p.z0-.01,z1:p.z1+.01},footprint(g)))}
  return true;
 }
 // The nearest wall to a point, as a spot a wall-hung piece can take: its position, which way it faces, and its room.
 function wallSpot(palace,type,x,z,reach=.8){
  const s=spec(type);let best=null;
  for(const c of wallCells(palace)){
   if(c.kind!=='solid')continue;
   const mx=c.axis==='x'?(c.i+.5)*G:c.at,mz=c.axis==='x'?c.at:(c.i+.5)*G,dist=Math.hypot(mx-x,mz-z);
   if(dist>reach+G||(best&&dist>=best.dist))continue;
   // Which side of the wall is the point on? That is the room it will hang in.
   const side=c.axis==='x'?(z<c.at?'a':'b'):(x<c.at?'a':'b'),room=c[side];if(!room)continue;
   const out=THICK/2+s.d/2+.005,pos=c.axis==='x'?{x:snap(x,.25),z:c.at+(side==='a'?-out:out),rot:side==='a'?180:0}:{x:c.at+(side==='a'?-out:out),z:snap(z,.25),rot:side==='a'?270:90};
   best={...pos,room,dist};
  }
  return best;
 }
 // Furniture snaps to a quarter-metre grid, and also sits flush against a wall that is within a hand's width.
 function flush(palace,f){
  const r=roomOf(palace,f);if(!r||layerOf(f)==='wall')return f;
  const p=footprint(f),lo=r.x+THICK/2,hi=r.x+r.w-THICK/2,zlo=r.z+THICK/2,zhi=r.z+r.d-THICK/2,E=.2;let {x,z}=f;
  if(Math.abs(p.x0-lo)<E)x+=lo-p.x0;else if(Math.abs(p.x1-hi)<E)x+=hi-p.x1;
  if(Math.abs(p.z0-zlo)<E)z+=zlo-p.z0;else if(Math.abs(p.z1-zhi)<E)z+=zhi-p.z1;
  return {...f,x:round(x),z:round(z)};
 }
 function placeFurniture(palace,type,x,z,{rot=0,color}={}){
  const s=spec(type);if(!s)return null;
  let f={id:makeId('f'),type,x:snap(x,.25),z:snap(z,.25),rot,color:color||s.color};
  if(s.layer==='wall'){const spot=wallSpot(palace,type,x,z);if(!spot)return null;f={...f,x:round(spot.x),z:round(spot.z),rot:spot.rot}}
  else f=flush(palace,f);
  if(!canPlace(palace,f))return null;
  palace.furniture.push(f);return f;
 }
 function moveFurniture(palace,id,x,z){
  const f=palace.furniture.find(g=>g.id===id);if(!f)return null;
  let next={...f,x:snap(x,.25),z:snap(z,.25)};
  if(layerOf(f)==='wall'){const spot=wallSpot(palace,f.type,x,z);if(!spot)return null;next={...f,x:round(spot.x),z:round(spot.z),rot:spot.rot}}
  else next=flush(palace,next);
  if(!canPlace(palace,next,id))return null;
  Object.assign(f,{x:next.x,z:next.z,rot:next.rot});return f;
 }
 function rotateFurniture(palace,id){
  const f=palace.furniture.find(g=>g.id===id);if(!f||layerOf(f)==='wall')return null;
  const next=flush(palace,{...f,rot:(f.rot+90)%360});if(!canPlace(palace,next,id))return null;
  Object.assign(f,{x:next.x,z:next.z,rot:next.rot});return f;
 }
 function removeFurniture(palace,id){
  palace.furniture=palace.furniture.filter(f=>f.id!==id);palace.stations=palace.stations.filter(s=>s.furnitureId!==id);
 }
 function recolour(palace,id,color){const f=palace.furniture.find(g=>g.id===id);if(f)f.color=color;return f||null}
 // Swap a piece for another kind in the same spot, if the new one fits (a bed for a sofa); stations stay with it.
 function swapFurniture(palace,id,type){
  const f=palace.furniture.find(g=>g.id===id);if(!f||!spec(type)||layerOf(f)!==(spec(type).layer||'floor'))return null;
  const next=flush(palace,{...f,type,color:spec(type).color});if(!canPlace(palace,next,id))return null;
  Object.assign(f,{type:next.type,color:next.color,x:next.x,z:next.z});return f;
 }
 // Somewhere in a room where a new piece fits, nearest the middle.
 function findSpot(palace,type,roomId){
  const s=spec(type),room=palace.rooms.find(r=>r.id===roomId)||palace.rooms[0];if(!s||!room)return null;
  if(s.layer==='wall'){
   for(let k=0;k<2*(room.w+room.d)/.5;k++){const t=k*.5,pts=[[room.x+t%room.w,room.z+.05],[room.x+room.w-.05,room.z+t%room.d],[room.x+t%room.w,room.z+room.d-.05],[room.x+.05,room.z+t%room.d]];for(const [px,pz] of pts){const spot=wallSpot(palace,type,px,pz,.3);if(spot&&spot.room===room&&canPlace(palace,{id:'?',type,x:spot.x,z:spot.z,rot:spot.rot},null))return {x:spot.x,z:spot.z}}}
   return null;
  }
  const cx=room.x+room.w/2,cz=room.z+room.d/2,tried=[];
  for(let dx=-room.w/2;dx<=room.w/2;dx+=.25)for(let dz=-room.d/2;dz<=room.d/2;dz+=.25)tried.push([cx+dx,cz+dz,Math.hypot(dx,dz)]);
  tried.sort((p,q)=>p[2]-q[2]);
  for(const [x,z] of tried){const f={id:'?',type,x:snap(x,.25),z:snap(z,.25),rot:0};if(canPlace(palace,f,null))return {x:f.x,z:f.z}}
  return null;
 }

 // ── Things to remember, left on the furniture ────────────────────────────────
 function addStation(palace,furnitureId,fields={}){
  if(!palace.furniture.some(f=>f.id===furnitureId))return null;
  const order=Math.max(0,...palace.stations.map(s=>s.order))+1;
  const station={id:makeId('s'),furnitureId,order,title:'',detail:'',image:'',link:null,...fields};
  palace.stations.push(station);return station;
 }
 const stationsOn=(palace,furnitureId)=>palace.stations.filter(s=>s.furnitureId===furnitureId);
 function removeStation(palace,id){palace.stations=palace.stations.filter(s=>s.id!==id)}
 const route=palace=>[...palace.stations].sort((a,b)=>a.order-b.order);
 // Move a station one step earlier (-1) or later (+1) along the route.
 function moveStation(palace,id,step){
  const list=route(palace),i=list.findIndex(s=>s.id===id),j=i+step;if(i<0||j<0||j>=list.length)return false;
  [list[i],list[j]]=[list[j],list[i]];list.forEach((s,k)=>{s.order=k+1});return true;
 }
 // The way in: the room behind an outside door, else the first room.
 function entrance(palace){
  for(const c of wallCells(palace))if(c.kind==='door'&&(!c.a||!c.b)){const room=c.a||c.b;if(room)return {room,x:c.axis==='x'?(c.i+.5)*G:c.at,z:c.axis==='x'?c.at:(c.i+.5)*G}}
  const r=palace.rooms[0];return r?{room:r,x:r.x+r.w/2,z:r.z+r.d/2}:null;
 }
 // Furniture in the order you would meet it walking round: room by room from the entrance, and clockwise inside each room
 // starting from the door you came in by. This is the natural route for placing things.
 function walkOrder(palace){
  const start=entrance(palace);if(!start)return [];
  const through=new Map();   // room -> where we came in
  const links=wallCells(palace).filter(c=>c.a&&c.b&&c.a!==c.b&&(c.kind==='door'||c.kind==='arch'));
  const order=[start.room],seen=new Set([start.room.id]);through.set(start.room.id,start);
  for(let k=0;k<order.length;k++){
   const here=order[k];
   const next=links.filter(c=>c.a===here||c.b===here).map(c=>({c,room:c.a===here?c.b:c.a})).filter(n=>!seen.has(n.room.id)).sort((p,q)=>p.c.axis.localeCompare(q.c.axis)||p.c.at-q.c.at||p.c.i-q.c.i);
   for(const n of next){if(seen.has(n.room.id))continue;seen.add(n.room.id);order.push(n.room);through.set(n.room.id,{x:n.c.axis==='x'?(n.c.i+.5)*G:n.c.at,z:n.c.axis==='x'?n.c.at:(n.c.i+.5)*G})}
  }
  for(const r of palace.rooms)if(!seen.has(r.id)){order.push(r);through.set(r.id,{x:r.x,z:r.z})}
  const out=[];
  for(const room of order){
   const door=through.get(room.id),cx=room.x+room.w/2,cz=room.z+room.d/2,from=Math.atan2(door.z-cz,door.x-cx);
   const mine=palace.furniture.filter(f=>roomOf(palace,f)===room&&layerOf(f)!=='rug');
   const turn=f=>(Math.atan2(f.z-cz,f.x-cx)-from+Math.PI*4)%(Math.PI*2);
   out.push(...mine.sort((p,q)=>turn(p)-turn(q)));
  }
  return out;
 }
 // Leave a list of things around the house, one per piece of furniture that has nothing yet, in walking order. Each item is
 // {title, detail, link}. Returns the stations made (fewer than items if the house runs out of furniture).
 function autoPlace(palace,items){
  const free=walkOrder(palace).filter(f=>layerOf(f)!=='wall'||true).filter(f=>!stationsOn(palace,f.id).length),made=[];
  for(let i=0;i<items.length&&i<free.length;i++)made.push(addStation(palace,free[i].id,{title:items[i].title||'',detail:items[i].detail||'',image:items[i].image||'',link:items[i].link||null}));
  return made;
 }

 // ── Walking about ────────────────────────────────────────────────────────────
 // Solid things a person can't walk through: walls and windows, and furniture that stands on the floor.
 function colliders(palace){
  const rects=[];
  for(const c of wallCells(palace)){
   if(c.kind==='door'||c.kind==='arch')continue;
   rects.push(c.axis==='x'?{x0:c.i*G,x1:(c.i+1)*G,z0:c.at-THICK/2,z1:c.at+THICK/2}:{x0:c.at-THICK/2,x1:c.at+THICK/2,z0:c.i*G,z1:(c.i+1)*G});
  }
  for(const f of palace.furniture)if(layerOf(f)==='floor'){const p=footprint(f);rects.push({x0:p.x0,x1:p.x1,z0:p.z0,z1:p.z1})}
  return rects;
 }
 function blockedBy(rects,x,z,r=RADIUS){
  return rects.some(q=>{const nx=Math.max(q.x0,Math.min(x,q.x1)),nz=Math.max(q.z0,Math.min(z,q.z1));return (x-nx)**2+(z-nz)**2<r*r});
 }
 // A move from (x,z) by (dx,dz) that slides along obstacles instead of stopping dead.
 function slide(rects,x,z,dx,dz,r=RADIUS){
  let nx=x,nz=z;
  if(!blockedBy(rects,x+dx,z+dz,r)){return {x:x+dx,z:z+dz}}
  if(!blockedBy(rects,x+dx,z,r))nx=x+dx;
  if(!blockedBy(rects,nx,z+dz,r))nz=z+dz;
  return {x:nx,z:nz};
 }
 // Where to stand to look at a piece of furniture: in front of it if there is room, else from another side or further back,
 // keeping to the same room.
 function viewFrom(palace,f){
  const p=footprint(f),rects=colliders(palace),s=spec(f.type),yaw0=f.rot*Math.PI/180,home=roomOf(palace,f);
  // far enough back to see the whole piece: further for tall ones, and for things hung on a wall
  const base=Math.max(p.w,p.d)/2+(s.layer==='wall'?1.5:1.1)+Math.min(s.h,1.8)*.5;
  const free=(x,z)=>{const r=roomAt(palace,x,z);return !!r&&(!home||r===home)&&!blockedBy(rects,x,z,.42)};
  for(const extra of [0,.3,.6,1,1.5,2])for(const turn of [0,Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3,Math.PI/2,-Math.PI/2,Math.PI,2.4,-2.4]){
   const a=yaw0+turn,reach=base+extra,x=f.x+Math.sin(a)*reach,z=f.z+Math.cos(a)*reach;
   if(free(x,z))return {x,z,yaw:Math.atan2(f.x-x,f.z-z)};
  }
  // Anywhere free in the room, nearest first.
  if(home){
   let best=null;
   for(let x=home.x+.5;x<home.x+home.w;x+=.25)for(let z=home.z+.5;z<home.z+home.d;z+=.25){const d=Math.hypot(x-f.x,z-f.z);if(free(x,z)&&(!best||d<best.d))best={x,z,d}}
   if(best)return {x:best.x,z:best.z,yaw:Math.atan2(f.x-best.x,f.z-best.z)};
  }
  return {x:f.x,z:f.z+1.5,yaw:Math.PI};
 }
 // Where a ray from the camera first meets a piece of furniture (for clicking things in the walk-through).
 function pick(palace,origin,dir){
  let best=null;
  for(const f of palace.furniture){
   const p=footprint(f),s=spec(f.type),y0=s.lift||0,y1=y0+s.h;
   let t0=0,t1=1e9;
   for(const [o,d,lo,hi] of [[origin.x,dir.x,p.x0,p.x1],[origin.y,dir.y,y0,y1],[origin.z,dir.z,p.z0,p.z1]]){
    if(Math.abs(d)<1e-9){if(o<lo||o>hi){t0=1;t1=0;break}continue}
    let a=(lo-o)/d,b=(hi-o)/d;if(a>b)[a,b]=[b,a];t0=Math.max(t0,a);t1=Math.min(t1,b);if(t0>t1)break;
   }
   if(t0<=t1&&(!best||t0<best.t))best={furniture:f,t:t0};
  }
  return best;
 }

 // ── A new palace, and the starter house ──────────────────────────────────────
 function blank(projectId,name){return {id:makeId('p'),projectId:projectId||'',name:name||'My palace',created:Date.now(),rooms:[],openings:[],furniture:[],stations:[],camera:null}}
 function starterHouse(projectId,name){
  const p=blank(projectId,name||'My house');
  const room=(n,x,z,w,d,floor,wall,floorType)=>{const r=addRoom(p,{name:n,x,z,w,d,floor,wall,floorType});if(!r)throw new Error('starter room '+n);return r};
  room('Living room',0,0,6,5,'#c9a77c','#efe8dc','wood');room('Kitchen',6,0,4,5,'#d9d6cf','#f1ecd6','tile');room('Bedroom',0,5,4,4,'#b9aec6','#e4eaee','carpet');
  room('Bathroom',4,5,2,4,'#b7c7c4','#e1ede8','tile');room('Study',6,5,4,4,'#9b7650','#ece1d6','wood');
  const open=(kind,axis,at,from,to)=>p.openings.push({id:makeId('o'),kind,axis,at,from,to});
  open('door','x',0,2,3);open('arch','z',6,1.5,3);open('door','x',5,1,2);open('door','z',4,6,7);open('door','x',5,7,8);
  open('window','x',0,4,5.5);open('window','z',0,1,2.5);open('window','x',0,7.5,9);open('window','z',10,1,2.5);
  open('window','z',0,7.5,8.5);open('window','x',9,1,2.5);open('window','z',10,6.5,8);open('window','x',9,7,8.5);open('window','x',9,4.5,5.5);
  const put=(type,x,z,rot=0,color)=>{const f=placeFurniture(p,type,x,z,{rot,color});if(!f){if(typeof process!=='undefined'&&process.env&&process.env.PALACE_DEBUG){console.warn('starter does not fit:',type,x,z,rot);return null}throw new Error('starter '+type+' at '+x+','+z)}return f};
  put('tv-unit',.3,3.6,90);put('sofa',4.4,3.6,270);put('coffee-table',2.4,3.6,90);put('rug',2.6,3.6,90,'#c98f8f');put('armchair',1.25,1.5,90);
  put('bookshelf',5.5,4.75,180);put('floor-lamp',5.6,.5);put('plant',.5,.5);put('painting',1,.1);
  put('fridge',6.4,.4);put('stove',7.25,.35);put('kitchen-sink',8.25,.35);put('kitchen-island',8,2.3);
  put('dining-table',8.5,3.75);put('chair',8.5,2.95);put('chair',8.5,4.5,180);put('chair',7.25,3.75,90);put('chair',9.75,3.75,270);put('clock',9.5,.1);
  put('bed-double',2.5,7.9,180);put('nightstand',1.25,8.7);put('nightstand',3.75,8.7);put('wardrobe',.35,6.6,90);put('dresser',.3,8.2,90);
  put('bathtub',5.55,7.7,90);put('toilet',5,5.4);put('vanity',4.6,8.7,180);put('mirror',4.6,8.9);
  put('desk',8.5,8.6,180);put('office-chair',8.5,7.8);put('bookshelf',9.8,6.5,270,'#b9876b');put('bookshelf',9.8,7.6,270);put('piano',6.45,7,90);put('plant',6.5,8.5);put('painting',9,5.1);
  return p;
 }

 // ── Undo ─────────────────────────────────────────────────────────────────────
 const CONTENT=['name','rooms','openings','furniture','stations'];
 const snapshot=palace=>JSON.stringify(Object.fromEntries(CONTENT.map(k=>[k,palace[k]])));
 const restore=(palace,json)=>{const data=JSON.parse(json);for(const k of CONTENT)palace[k]=data[k]};
 function history(palace,limit=60){
  const past=[snapshot(palace)],future=[];
  return {
   // Call after a change: the new state becomes the latest step.
   record(){const now=snapshot(palace);if(now===past.at(-1))return false;past.push(now);if(past.length>limit)past.shift();future.length=0;return true},
   undo(){if(past.length<2)return false;future.push(past.pop());restore(palace,past.at(-1));return true},
   redo(){if(!future.length)return false;const next=future.pop();past.push(next);restore(palace,next);return true},
   canUndo:()=>past.length>1,canRedo:()=>future.length>0
  };
 }
 // Anything wrong with a palace (for tests and for repairing old data): [] means sound.
 function problems(palace){
  const out=[];
  palace.rooms.forEach((r,i)=>{if(!validRoom(palace,r,r.id))out.push('room '+r.name+' is invalid or overlaps')});
  for(const f of palace.furniture)if(!canPlace(palace,f,f.id))out.push(f.type+' '+f.id+' does not fit');
  for(const s of palace.stations)if(!palace.furniture.some(f=>f.id===s.furnitureId))out.push('station '+s.id+' has no furniture');
  return out;
 }
 function bounds(palace){
  if(!palace.rooms.length)return {x0:0,z0:0,x1:10,z1:10};
  return {x0:Math.min(...palace.rooms.map(r=>r.x)),z0:Math.min(...palace.rooms.map(r=>r.z)),x1:Math.max(...palace.rooms.map(r=>r.x+r.w)),z1:Math.max(...palace.rooms.map(r=>r.z+r.d))};
 }
 return {FLOOR_TYPES,G,HEIGHT,THICK,DOOR_TOP,ARCH_TOP,SILL,HEAD,RADIUS,CATALOG,FLOORS,WALLS,TINTS,ROOM_NAMES,spec,shade,paint,snap,roomAt,wallCells,wallRuns,validRoom,addRoom,resizeRoom,moveRoom,removeRoom,toggleOpening,openingAt,pruneOpenings,layerOf,footprint,roomOf,fitsInRoom,canPlace,wallSpot,flush,placeFurniture,moveFurniture,rotateFurniture,removeFurniture,recolour,swapFurniture,findSpot,addStation,stationsOn,removeStation,route,moveStation,entrance,walkOrder,autoPlace,colliders,blockedBy,slide,viewFrom,pick,blank,starterHouse,history,snapshot,restore,problems,bounds,makeId};
})();
if(typeof module!=='undefined')module.exports=PalaceModel;
