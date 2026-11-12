// Draws a palace and lets you look round it: a top-down plan view for building, and a first-person view for walking. All the
// rules (walls, furniture, collisions) live in palace-model.js; this file turns them into pictures and camera movement.
const Palace3D=(()=>{
 const P=PalaceModel,M=Mini3D;
 const EYE=1.6,FOV=70*Math.PI/180,WALK=2.2,EXTERIOR='#e5e1d8',CAP='#4b4f58',GOLD='#f2b84b',ACCENT='#6a5ae0';
 const clampAngle=a=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a};

 function mount(canvas,palace,{background='#f3f1ec',sky='#cfe1ee',onFrame=null}={}){
  let view;try{view=M.create(canvas)}catch(error){console.warn('3D is not available:',error);return null}
  if(!view)return null;
  const bg=M.parse(background).slice(0,3),skyRgb=M.parse(sky).slice(0,3);
  const meshes={glow:new M.Mesh(),ground:new M.Mesh(),garden:new M.Mesh(),solid:new M.Mesh(),walls:new M.Mesh(),flat:new M.Mesh(),ceil:new M.Mesh(),soft:new M.Mesh(),grid:new M.Mesh(),over:new M.Mesh(),markers:new M.Mesh()};
  const state={mode:'plan',plan:{cx:5,cz:4.5,scale:40},walk:{x:3,z:2,yaw:0,pitch:0},overlay:{},dirty:true,fly:null,target:null,keys:new Set(),time:0,rects:[],gridOn:true,labels:true};
  let raf=0,last=performance.now(),disposed=false,matrices=null;

  // ── Building the picture from the model ────────────────────────────────────
  const CURTAINS=['#b98f8f','#8fa6bd','#a3bd8f','#bdad8f','#a08fbd'];
  const hashOf=text=>{let h=7;for(const c of String(text))h=(h*31+c.charCodeAt(0))>>>0;return h};
  const TRIM='#f4f1ea';
  function addWalls(walls,soft){
   for(const run of P.wallRuns(palace)){
    const along=run.axis==='x',len=run.to-run.from,mid=(run.from+run.to)/2,half=P.THICK/2;
    const pieces=run.kind==='solid'?[[0,P.HEIGHT]]:run.kind==='door'?[[P.DOOR_TOP,P.HEIGHT]]:run.kind==='arch'?[[P.ARCH_TOP,P.HEIGHT]]:[[0,P.SILL],[P.HEAD,P.HEIGHT]];
    for(const [y0,y1] of pieces)for(const side of ['a','b']){
     const room=run[side],colour=room?room.wall:EXTERIOR,off=(side==='a'?-1:1)*half/2;
     // the inner face of each side shows that room's colour; the top of the wall is dark so walls read clearly from above
     if(along)walls.box(mid,y0,run.at+off,len,y1-y0,half,colour,{top:CAP,mat:'paint'});else walls.box(run.at+off,y0,mid,half,y1-y0,len,colour,{top:CAP,mat:'paint'});
    }
    // skirting boards at the foot and a crown moulding at the top of every solid wall
    if(run.kind==='solid')for(const side of ['a','b']){
     const room=run[side];if(!room)continue;const off=(side==='a'?-1:1)*(half/2+.01);
     if(along){walls.box(mid,0,run.at+off,len,.11,half+.02,TRIM);walls.box(mid,P.HEIGHT-.07,run.at+off,len,.07,half+.025,TRIM)}
     else{walls.box(run.at+off,0,mid,half+.02,.11,len,TRIM);walls.box(run.at+off,P.HEIGHT-.07,mid,half+.025,.07,len,TRIM)}
    }
    if(run.kind==='window')addWindow(walls,soft,run,along,len,mid);
    if(run.kind==='door')addDoor(walls,run,along,len);
   }
  }
  function addWindow(walls,soft,run,along,len,mid){
   const glass='#cfe6f5',w=P.HEAD-P.SILL;
   if(along)soft.box(mid,P.SILL,run.at,len,w,.02,glass,{alpha:.3,mat:'glass'});else soft.box(run.at,P.SILL,mid,.02,w,len,glass,{alpha:.3,mat:'glass'});
   const T=P.THICK+.02;
   const bar=(x,y,z,bw,bh,bd)=>walls.box(x,y,z,bw,bh,bd,TRIM);
   if(along){
    bar(mid,P.SILL-.03,run.at,len+.1,.04,P.THICK+.1);bar(run.from+.02,P.SILL,run.at,.04,w,T);bar(run.to-.02,P.SILL,run.at,.04,w,T);bar(mid,P.SILL+w/2-.015,run.at,len,.03,T);bar(mid,P.SILL+w/2-.015,run.at,.03,0.001,T);
    walls.box(mid,P.SILL,run.at,.03,w,T,TRIM);
   }else{
    bar(run.at,P.SILL-.03,mid,P.THICK+.1,.04,len+.1);bar(run.at,P.SILL,run.from+.02,T,w,.04);bar(run.at,P.SILL,run.to-.02,T,w,.04);bar(run.at,P.SILL+w/2-.015,mid,T,.03,len);
    walls.box(run.at,P.SILL,mid,T,w,.03,TRIM);
   }
   // curtains on whichever side has a room: a pole and two soft panels
   for(const side of ['a','b']){
    const room=run[side];if(!room)continue;
    const dir=side==='a'?-1:1,off=dir*(P.THICK/2+.09),colour=CURTAINS[hashOf(room.id)%CURTAINS.length],top=P.HEAD+.2,bottom=.1,pw=Math.min(.42,len/3);
    if(along){walls.box(mid,top-.02,run.at+off,len+.5,.03,.03,'#6b5a45');walls.box(run.from-.02,bottom,run.at+off,pw,top-bottom,.07,colour,{mat:'fabric'});walls.box(run.to+.02,bottom,run.at+off,pw,top-bottom,.07,colour,{mat:'fabric'})}
    else{walls.box(run.at+off,top-.02,mid,.03,.03,len+.5,'#6b5a45');walls.box(run.at+off,bottom,run.from-.02,.07,top-bottom,pw,colour,{mat:'fabric'});walls.box(run.at+off,bottom,run.to+.02,.07,top-bottom,pw,colour,{mat:'fabric'})}
   }
  }
  // A door standing open, hinged at its start, swung into whichever side has a room.
  function addDoor(walls,run,along,len){
   const wood='#a67c52',brass='#cdb27c',leafW=len-.05,H=P.DOOR_TOP-.03;
   const into=run.b?1:-1,angle=82*into;      // which way it swings
   // frame
   if(along){walls.box(run.from+.025,0,run.at,.05,P.DOOR_TOP,P.THICK+.03,TRIM);walls.box(run.to-.025,0,run.at,.05,P.DOOR_TOP,P.THICK+.03,TRIM)}
   else{walls.box(run.at,0,run.from+.025,P.THICK+.03,P.DOOR_TOP,.05,TRIM);walls.box(run.at,0,run.to-.025,P.THICK+.03,P.DOOR_TOP,.05,TRIM)}
   if(along){
    const hinge=run.from+.03,pivot=[hinge,run.at],rot=-angle;
    walls.box(hinge+leafW/2,0,run.at,leafW,H,.04,wood,{rot,pivot,mat:'timber'});
    walls.box(hinge+leafW-.1,.95,run.at+.035,.1,.03,.03,brass,{rot,pivot,mat:'metal'});walls.box(hinge+leafW-.1,.95,run.at-.035,.1,.03,.03,brass,{rot,pivot,mat:'metal'});
   }else{
    const hinge=run.from+.03,pivot=[run.at,hinge],rot=angle;
    walls.box(run.at,0,hinge+leafW/2,.04,H,leafW,wood,{rot,pivot,mat:'timber'});
    walls.box(run.at+.035,.95,hinge+leafW-.1,.03,.03,.1,brass,{rot,pivot,mat:'metal'});walls.box(run.at-.035,.95,hinge+leafW-.1,.03,.03,.1,brass,{rot,pivot,mat:'metal'});
   }
  }
  // The same walls as a plan would draw them: dark lines, with a gap for each door and a thin pale line for each window.
  function addPlanWalls(flat){
   for(const run of P.wallRuns(palace)){
    const along=run.axis==='x',len=run.to-run.from,mid=(run.from+run.to)/2;
    const put=(colour,t,y,h)=>along?flat.box(mid,y,run.at,len,h,t,colour):flat.box(run.at,y,mid,t,h,len,colour);
    if(run.kind==='solid')put(CAP,P.THICK,0,P.HEIGHT);
    else if(run.kind==='window'){put(CAP,P.THICK,0,.5);put('#b9d9ee',P.THICK*.55,.5,.2)}
    else if(run.kind==='door'){
     const wood='#a07a50';
     if(along){flat.box(run.from+.03,0,run.at,.06,.5,P.THICK+.02,wood);flat.box(run.to-.03,0,run.at,.06,.5,P.THICK+.02,wood)}
     else{flat.box(run.at,0,run.from+.03,P.THICK+.02,.5,.06,wood);flat.box(run.at,0,run.to-.03,P.THICK+.02,.5,.06,wood)}
    }
   }
  }
  // A prop, part by part, standing on its furniture (books standing with their spine out, or lying flat).
  const PROP_MAT={mug:'ceramic',vase:'ceramic',fruit:'ceramic',frame:'paint',laptop:'metal',book:'fabric',notebook:'fabric',paper:'paper',candle:'paper'};
  function propParts(prop,w){
   const sp=P.propSpec(prop.type);
   if(prop.type!=='book')return sp.parts;
   const t=w.shelf?(prop.t||sp.w):.2,d=w.shelf?sp.d:.27,h=w.h,page='#f1ead8';
   if(w.shelf)return [['b',0,0,d/2-.007,t,h,.007,'m'],['b',-t/2+.004,0,0,.008,h,d,'m'],['b',t/2-.004,0,0,.008,h,d,'m'],['b',0,.004,-.005,t-.016,h-.008,d-.012,page],['b',0,h*.72,d/2,t,.014,.009,'m+'],['b',0,h*.22,d/2,t,.01,.009,'m+']];
   return [['b',0,0,0,t,.006,d,'m'],['b',0,h-.006,0,t,.006,d,'m'],['b',-t/2+.006,0,0,.012,h,d,'m'],['b',.004,.006,0,t-.02,h-.012,d-.008,page],['b',.0,h-.006,0,t*.6,.002,d*.5,'m+']];
  }
  function addProp(solid,glow,prop){
   const w=P.propWorld(palace,prop);if(!w)return;
   const pivot=[w.x,w.z],rad=w.rot*Math.PI/180,cs=Math.cos(rad),sn=Math.sin(rad),sp=P.propSpec(prop.type),main=prop.color||sp.color,mat=PROP_MAT[prop.type];
   for(const part of propParts(prop,w)){
    const raw=part.at(-1),colour=P.paint(raw,main),m=['m','m-','m+'].includes(raw)?mat:undefined;
    if(part[0]==='b'){const [,x,y,z,bw,bh,bd]=part;solid.box(w.x+x,w.y+y,w.z+z,bw,bh,bd,colour,{rot:w.rot,pivot,mat:colour==='#1b1b20'?'screen':m})}
    else if(part[0]==='c'){const [,x,y,z,r,h]=part;solid.cylinder(w.x+x*cs+z*sn,w.y+y,w.z-x*sn+z*cs,r,h,colour,{mat:m,segments:14})}
    else{const [,x,y,z,r]=part;solid.sphere(w.x+x*cs+z*sn,w.y+y,w.z-x*sn+z*cs,r,colour,{segments:12,rings:8,mat:m})}
   }
   if(prop.type==='candle')for(const [r,a] of [[.5,.05],[.3,.08]])glow.disc(w.x,w.z,r,w.y+.002,'#ffd596',a);
  }
  // A piece of furniture, part by part: boxes and cylinders placed round its centre, turned to face the way it faces.
  function addFurniture(solid,soft,f){
   const spec=P.spec(f.type),lift=spec.lift||0,pivot=[f.x,f.z],rad=f.rot*Math.PI/180,cs=Math.cos(rad),sn=Math.sin(rad);
   for(const part of spec.parts){
    const raw=part.at(-1),colour=P.paint(raw,f.color||spec.color),mat=['m','m-','m+'].includes(raw)?spec.mat:(part.screen?'screen':undefined);
    if(part[0]==='b'){const [,x,y,z,w,h,d]=part;solid.box(f.x+x,lift+y,f.z+z,w,h,d,colour,{rot:f.rot,pivot,mat:colour==='#1b1b20'?'screen':mat})}
    else{const [,x,y,z,r,h]=part;solid.cylinder(f.x+x*cs+z*sn,lift+y,f.z-x*sn+z*cs,r,h,colour,{mat,segments:16})}
   }
   // a soft shadow on the floor under anything that stands on it
   if(P.layerOf(f)==='floor'){
    const fp=P.footprint(f),onRug=palace.furniture.some(g=>P.layerOf(g)==='rug'&&fp.x0>=P.footprint(g).x0-.01&&fp.x1<=P.footprint(g).x1+.01&&fp.z0>=P.footprint(g).z0-.01&&fp.z1<=P.footprint(g).z1+.01);
    const y=onRug?.045:.026;
    for(const [grow,alpha] of [[.03,.1],[.08,.06],[.14,.03]])soft.floor(fp.x0-grow,fp.z0-grow,fp.x1+grow,fp.z1+grow,y,'#000000',alpha);
   }
   // lamps leave a warm pool of light on the floor
   if(f.type==='floor-lamp')for(const [r,a] of [[1.4,.035],[.95,.05],[.55,.07]])meshes.glow.disc(f.x,f.z,r,.03,'#ffd596',a);
  }
  // Soft darkening where walls meet the floor, so rooms feel solid.
  function addCorners(soft){  // (only drawn when walking about)
   for(const run of P.wallRuns(palace)){
    if(run.kind!=='solid'&&run.kind!=='window')continue;
    const along=run.axis==='x',half=P.THICK/2;
    for(const side of ['a','b']){
     if(!run[side])continue;const dir=side==='a'?-1:1;
     for(const [w,a] of [[.1,.13],[.22,.08],[.38,.045]]){
      if(along){const z0=run.at+dir*half,z1=run.at+dir*(half+w);soft.floor(run.from,Math.min(z0,z1),run.to,Math.max(z0,z1),.024,'#000000',a)}
      else{const x0=run.at+dir*half,x1=run.at+dir*(half+w);soft.floor(Math.min(x0,x1),run.from,Math.max(x0,x1),run.to,.024,'#000000',a)}
     }
    }
   }
  }
  // The garden: a lawn, a path to the front door, trees and bushes. Seen from inside, and it casts shadows too.
  function addGarden(garden,ground){
   const b=P.bounds(palace),cx=(b.x0+b.x1)/2,cz=(b.z0+b.z1)/2;
   ground.floor(b.x0-80,b.z0-80,b.x1+80,b.z1+80,-.02,'#86a56d',1,'grass');
   const e=P.entrance(palace);
   if(e){
    // a stepping-stone path outward from the front door
    const out=e.z<=b.z0+.2?[0,-1]:e.z>=b.z1-.2?[0,1]:e.x<=b.x0+.2?[-1,0]:[1,0];
    for(let k=0;k<7;k++){const x=e.x+out[0]*(.6+k*.7),z=e.z+out[1]*(.6+k*.7);garden.box(x+(k%2?.08:-.08),0,z,.55,.04,.45,'#b9b3a6',{rot:k*11})}
   }
   const reach=Math.hypot(b.x1-b.x0,b.z1-b.z0)/2;
   for(let i=0;i<16;i++){
    const h=hashOf('tree'+i),ang=(h%628)/100,dist=reach+4+(h>>3)%9,x=cx+Math.cos(ang)*dist,z=cz+Math.sin(ang)*dist,size=.8+((h>>5)%10)/14;
    const trunk=1.3*size,leaf=['#5b8a4a','#4f7f48','#6a9650'][h%3];
    garden.cylinder(x,0,z,.16*size,trunk,'#6f5338',{segments:8,mat:'timber'});
    garden.sphere(x,trunk+.9*size,z,1.25*size,leaf,{mat:'leaf',scaleY:1.15});garden.sphere(x+.4*size,trunk+.5*size,z+.3*size,.85*size,leaf,{mat:'leaf'});
   }
   // bushes along the house
   for(let i=0;i<14;i++){
    const h=hashOf('bush'+i),t=(h%1000)/1000,side=h%4,along=b.x0+(b.x1-b.x0)*t,down=b.z0+(b.z1-b.z0)*t;
    let x,z;
    if(side===0){x=along;z=b.z0-.7}else if(side===1){x=along;z=b.z1+.7}else if(side===2){x=b.x0-.7;z=down}else{x=b.x1+.7;z=down}
    if(e&&Math.hypot(x-e.x,z-e.z)<2)continue;
    garden.sphere(x,.3,z,.42+((h>>4)%4)/12,['#5b8a4a','#6a9650','#4f7f48'][h%3],{mat:'leaf',scaleY:.8,segments:9,rings:6});
   }
  }
  const sunDir=(()=>{const d=[.5,.78,.34],l=Math.hypot(...d);return d.map(v=>v/l)})();
  // The sun's view of the house, for shadows.
  function sunMatrix(){
   const b=P.bounds(palace),c=[(b.x0+b.x1)/2,1.2,(b.z0+b.z1)/2],r=Math.hypot(b.x1-b.x0,b.z1-b.z0)/2+7,eye=[c[0]+sunDir[0]*r*1.6,c[1]+sunDir[1]*r*1.6,c[2]+sunDir[2]*r*1.6];
   return M.multiply(M.ortho(-r,r,-r,r,.1,r*3.6),M.lookAt(eye,c,[0,1,0]));
  }
  const FLOOR_MATERIAL={wood:'wood',tile:'tile',carpet:'carpet',plain:0};
  function rebuild(){
   for(const m of [meshes.glow,meshes.ground,meshes.garden,meshes.solid,meshes.walls,meshes.flat,meshes.ceil,meshes.soft,meshes.grid])m.clear();
   const {glow,ground,garden,solid,walls,flat,ceil,soft,grid}=meshes,b=P.bounds(palace);
   for(const r of palace.rooms){solid.floor(r.x,r.z,r.x+r.w,r.z+r.d,.02,r.floor,1,FLOOR_MATERIAL[r.floorType||'wood']);ceil.ceiling(r.x,r.z,r.x+r.w,r.z+r.d,P.HEIGHT,'#f3efe6','paint')}
   addGarden(garden,ground);
   addWalls(walls,soft);addPlanWalls(flat);addCorners(glow);
   for(const f of palace.furniture)addFurniture(solid,soft,f);
   for(const q of P.propsOf(palace))if(q.id!==state.hidden)addProp(solid,meshes.glow,q);
   // a faint one-metre grid, seen only from above
   for(let x=Math.floor(b.x0)-3;x<=Math.ceil(b.x1)+3;x++)grid.line([x,.012,Math.floor(b.z0)-3],[x,.012,Math.ceil(b.z1)+3],'#d7d4cc');
   for(let z=Math.floor(b.z0)-3;z<=Math.ceil(b.z1)+3;z++)grid.line([Math.floor(b.x0)-3,.012,z],[Math.ceil(b.x1)+3,.012,z],'#d7d4cc');
   for(const name of ['glow','ground','garden','solid','walls','flat','ceil','soft'])view.set(name,meshes[name]);view.set('grid',grid,'lines');
   state.rects=P.colliders(palace);state.sun=sunMatrix();state.dirty=true;
  }
  // Places to remember bob gently above their furniture.
  function buildMarkers(){
   const m=meshes.markers;m.clear();let any=false;
   palace.stations.forEach((s,k)=>{
    const f=palace.furniture.find(g=>g.id===s.furnitureId);if(!f)return;any=true;
    const spec=P.spec(f.type),pw=s.propId?P.propWorld(palace,P.propsOf(palace).find(q=>q.id===s.propId)||{}):null,top=pw?pw.y+pw.h+(state.mode==='plan'?.55:.22):(spec.lift||0)+spec.h+(state.mode==='plan'?.55:.4),bob=Math.sin(state.time*2+k)*.05;
    const active=state.overlay.station===s.id;
    m.diamond(pw?pw.x:f.x,top+bob,pw?pw.z:f.z,state.mode==='plan'?.24:.13,active?'#ffffff':GOLD,{tall:1.6});
   });
   view.set('markers',m);return any;
  }
  // Outlines and handles drawn over everything: the selection, a piece being carried, a room being drawn.
  function buildOverlay(){
   const m=meshes.over;m.clear();const o=state.overlay;
   const frame=(x0,z0,x1,z1,colour,t=.06)=>{const y=.09;m.floor(x0-t,z0-t,x1+t,z0,y,colour);m.floor(x0-t,z1,x1+t,z1+t,y,colour);m.floor(x0-t,z0,x0,z1,y,colour);m.floor(x1,z0,x1+t,z1,y,colour)};
   const fill=(x0,z0,x1,z1,colour,alpha)=>m.floor(x0,z0,x1,z1,.085,colour,alpha);
   const handle=(x,z,colour=ACCENT)=>{const s=.16;m.floor(x-s,z-s,x+s,z+s,.1,'#ffffff');m.floor(x-s+.04,z-s+.04,x+s-.04,z+s-.04,.11,colour)};
   if(o.room){const r=palace.rooms.find(q=>q.id===o.room);if(r){frame(r.x,r.z,r.x+r.w,r.z+r.d,ACCENT,.08);for(const [x,z] of [[r.x+r.w/2,r.z],[r.x+r.w/2,r.z+r.d],[r.x,r.z+r.d/2],[r.x+r.w,r.z+r.d/2],[r.x,r.z],[r.x+r.w,r.z],[r.x,r.z+r.d],[r.x+r.w,r.z+r.d]])handle(x,z)}}
   if(o.furniture){const f=palace.furniture.find(g=>g.id===o.furniture);if(f){const fp=P.footprint(f);fill(fp.x0,fp.z0,fp.x1,fp.z1,ACCENT,.18);frame(fp.x0-.03,fp.z0-.03,fp.x1+.03,fp.z1+.03,ACCENT)}}
   if(o.prop){const q=P.propsOf(palace).find(g=>g.id===o.prop),w=q&&P.propWorld(palace,q);if(w){const turned=(w.rot%180)!==0,hw=(turned?w.d:w.w)/2+.03,hd=(turned?w.w:w.d)/2+.03;fill(w.x-hw,w.z-hd,w.x+hw,w.z+hd,ACCENT,.3);frame(w.x-hw,w.z-hd,w.x+hw,w.z+hd,ACCENT,.025)}}
   if(o.hover&&o.hover!==o.furniture){const f=palace.furniture.find(g=>g.id===o.hover);if(f){const fp=P.footprint(f);frame(fp.x0-.02,fp.z0-.02,fp.x1+.02,fp.z1+.02,'#9a97d8',.035)}}
   if(o.ghost){const g=o.ghost;fill(g.x0,g.z0,g.x1,g.z1,g.ok?'#3fb06b':'#d4584a',.28);frame(g.x0,g.z0,g.x1,g.z1,g.ok?'#2f9a58':'#c2402f',.05)}
   if(o.draw){const g=o.draw;fill(g.x0,g.z0,g.x1,g.z1,g.ok?'#3fb06b':'#d4584a',.22);frame(g.x0,g.z0,g.x1,g.z1,g.ok?'#2f9a58':'#c2402f',.06)}
   if(o.wall){const c=o.wall,x0=c.axis==='x'?c.i*P.G:c.at,z0=c.axis==='x'?c.at:c.i*P.G;const w=c.axis==='x'?P.G:0,d=c.axis==='x'?0:P.G;frame(x0-.04,z0-.04,x0+w+.04,z0+d+.04,GOLD,.07)}
   view.set('over',m);
  }

  // ── Cameras ────────────────────────────────────────────────────────────────
  function cameras(){
   const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
   if(state.mode==='plan'){
    const {cx,cz,scale}=state.plan,vw=w/scale,vh=h/scale;
    return {view:M.lookAt([cx,40,cz],[cx,0,cz],[0,0,-1]),proj:M.ortho(-vw/2,vw/2,-vh/2,vh/2,1,80),eye:[cx,40,cz]};
   }
   const {x,z,yaw,pitch}=state.walk,cp=Math.cos(pitch),f=[Math.sin(yaw)*cp,Math.sin(pitch),Math.cos(yaw)*cp];
   return {view:M.lookAt([x,EYE,z],[x+f[0],EYE+f[1],z+f[2]],[0,1,0]),proj:M.perspective(FOV,w/h,.05,120),eye:[x,EYE,z]};
  }
  function toScreen(x,y,z){
   if(!matrices)return null;
   const t=M.transform(matrices.vp,x,y,z);if(t.w<=0)return null;
   return {x:(t.x*.5+.5)*canvas.clientWidth,y:(1-(t.y*.5+.5))*canvas.clientHeight};
  }
  function toWorld(px,py){
   if(state.mode!=='plan')return null;
   const {cx,cz,scale}=state.plan;return {x:cx+(px-canvas.clientWidth/2)/scale,z:cz+(py-canvas.clientHeight/2)/scale};
  }
  function ray(px,py){
   const w=canvas.clientWidth,h=canvas.clientHeight,{yaw,pitch}=state.walk,cp=Math.cos(pitch);
   const f=[Math.sin(yaw)*cp,Math.sin(pitch),Math.cos(yaw)*cp],r=[-f[2],0,f[0]],rl=Math.hypot(r[0],r[2])||1;r[0]/=rl;r[2]/=rl;
   const u=[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]],t=Math.tan(FOV/2),nx=(px/w*2-1)*t*(w/h),ny=(1-py/h*2)*t;
   const d=[f[0]+r[0]*nx+u[0]*ny,f[1]+r[1]*nx+u[1]*ny,f[2]+r[2]*nx+u[2]*ny],l=Math.hypot(...d);
   return {origin:{x:state.walk.x,y:EYE,z:state.walk.z},dir:{x:d[0]/l,y:d[1]/l,z:d[2]/l}};
  }

  // ── What is under the pointer ──────────────────────────────────────────────
  function pickFurniture(px,py){
   if(state.mode==='walk'){const r=ray(px,py),hit=P.pick(palace,r.origin,r.dir);return hit?hit.furniture:null}
   const w=toWorld(px,py);if(!w)return null;
   // the smallest thing under the pointer wins, so a lamp on a rug can be picked
   let best=null,area=1e9;
   for(const f of palace.furniture){const fp=P.footprint(f),pad=P.layerOf(f)==='wall'?.12:0;if(w.x>=fp.x0-pad&&w.x<=fp.x1+pad&&w.z>=fp.z0-pad&&w.z<=fp.z1+pad){const a=(fp.x1-fp.x0)*(fp.z1-fp.z0);if(a<area||P.layerOf(f)!=='rug'&&best&&P.layerOf(best)==='rug'){best=f;area=a}}}
   return best;
  }
  // The small thing under the pointer, if any (walking: by ray; plan: by footprint, a little generous).
  function pickProp(px,py){
   if(state.mode==='walk'){const r=ray(px,py),hit=P.pickProp(palace,r.origin,r.dir),fh=P.pick(palace,r.origin,r.dir);return hit&&(!fh||hit.t<=fh.t+.05)?hit.prop:null}
   const w=toWorld(px,py);if(!w)return null;let best=null,bd=1e9;
   for(const q of P.propsOf(palace)){const pw=P.propWorld(palace,q);if(!pw)continue;const turned=(pw.rot%180)!==0,hw=Math.max(.08,(turned?pw.d:pw.w)/2+.04),hd=Math.max(.08,(turned?pw.w:pw.d)/2+.04);if(Math.abs(w.x-pw.x)<=hw&&Math.abs(w.z-pw.z)<=hd){const d=Math.hypot(w.x-pw.x,w.z-pw.z);if(d<bd){bd=d;best=q}}}
   return best;
  }
  function pickRoom(px,py){const w=toWorld(px,py);return w?P.roomAt(palace,w.x,w.z):null}
  // The wall cell nearest the pointer, if one is close.
  function pickWall(px,py,reach=.35){
   const w=toWorld(px,py);if(!w)return null;let best=null;
   for(const c of P.wallCells(palace)){
    const mx=c.axis==='x'?(c.i+.5)*P.G:c.at,mz=c.axis==='x'?c.at:(c.i+.5)*P.G,d=Math.hypot(mx-w.x,mz-w.z);
    if(d<reach&&(!best||d<best.d))best={axis:c.axis,at:c.at,i:c.i,kind:c.kind,d};
   }
   return best;
  }
  // The edge or corner of a room under the pointer, for resizing: {room, left, right, top, bottom}.
  function pickHandle(px,py,roomId){
   const r=palace.rooms.find(q=>q.id===roomId),w=toWorld(px,py);if(!r||!w)return null;
   const reach=Math.max(.25,10/state.plan.scale),near=(v,t)=>Math.abs(v-t)<reach;
   const inX=w.x>r.x-reach&&w.x<r.x+r.w+reach,inZ=w.z>r.z-reach&&w.z<r.z+r.d+reach;
   const left=inZ&&near(w.x,r.x),right=inZ&&near(w.x,r.x+r.w),top=inX&&near(w.z,r.z),bottom=inX&&near(w.z,r.z+r.d);
   return left||right||top||bottom?{room:r,left,right,top,bottom}:null;
  }

  // ── Moving the camera ──────────────────────────────────────────────────────
  function frame(margin=1.5){
   const b=P.bounds(palace),w=canvas.clientWidth||800,h=canvas.clientHeight||600;
   state.plan.cx=(b.x0+b.x1)/2;state.plan.cz=(b.z0+b.z1)/2;
   state.plan.scale=Math.max(14,Math.min(90,Math.min(w/(b.x1-b.x0+margin*2),h/(b.z1-b.z0+margin*2))));state.dirty=true;
  }
  function zoomAt(px,py,factor){
   const before=toWorld(px,py);state.plan.scale=Math.max(10,Math.min(140,state.plan.scale*factor));
   if(before){const after=toWorld(px,py);state.plan.cx+=before.x-after.x;state.plan.cz+=before.z-after.z}state.dirty=true;
  }
  function panBy(dx,dy){state.plan.cx-=dx/state.plan.scale;state.plan.cz-=dy/state.plan.scale;state.dirty=true}
  function lookBy(dx,dy){state.walk.yaw=clampAngle(state.walk.yaw-dx*.0042);state.walk.pitch=Math.max(-1.2,Math.min(1.2,state.walk.pitch-dy*.0042));state.dirty=true}
  function setMode(mode){
   state.mode=mode;state.target=null;state.fly=null;
   if(mode==='walk'&&!P.roomAt(palace,state.walk.x,state.walk.z)){const e=P.entrance(palace);if(e){state.walk.x=e.x;state.walk.z=e.z+(e.z<=0.01?.9:0);state.walk.yaw=0}}
   if(mode==='plan')frame();
   state.dirty=true;
  }
  // Glide the walker to a pose {x, z, yaw}.
  function flyTo(pose,ms=900){
   state.target=null;state.fly={from:{...state.walk},to:{x:pose.x,z:pose.z,yaw:pose.yaw,pitch:pose.pitch??-.08},t:0,ms};state.dirty=true;
  }
  const setTarget=(x,z)=>{state.fly=null;state.target={x,z};state.dirty=true};
  const setKey=(key,down)=>{down?state.keys.add(key):state.keys.delete(key);if(down)state.target=null;state.dirty=true};

  function step(dt){
   state.time+=dt;
   if(state.fly){
    const fly=state.fly;fly.t+=dt*1000;const k=Math.min(1,fly.t/fly.ms),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
    state.walk.x=fly.from.x+(fly.to.x-fly.from.x)*e;state.walk.z=fly.from.z+(fly.to.z-fly.from.z)*e;
    state.walk.yaw=fly.from.yaw+clampAngle(fly.to.yaw-fly.from.yaw)*e;state.walk.pitch=fly.from.pitch+(fly.to.pitch-fly.from.pitch)*e;
    if(k>=1)state.fly=null;state.dirty=true;
   }
   if(state.mode==='walk'&&!state.fly){
    const keys=state.keys,run=keys.has('shift')?1.8:1;let forward=0,strafe=0,turn=0;
    if(keys.has('w')||keys.has('arrowup'))forward+=1;if(keys.has('s')||keys.has('arrowdown'))forward-=1;
    if(keys.has('d'))strafe-=1;if(keys.has('a'))strafe+=1;
    if(keys.has('arrowleft')||keys.has('q'))turn+=1;if(keys.has('arrowright')||keys.has('e'))turn-=1;
    if(turn){state.walk.yaw=clampAngle(state.walk.yaw+turn*1.9*dt);state.dirty=true}
    let dx=0,dz=0;
    if(forward||strafe){
     const sy=Math.sin(state.walk.yaw),cy=Math.cos(state.walk.yaw),len=Math.hypot(forward,strafe)||1;
     // forward is (sin yaw, cos yaw); the walker's left is (cos yaw, -sin yaw)
     dx=((sy*forward+cy*strafe)/len)*WALK*run*dt;dz=((cy*forward-sy*strafe)/len)*WALK*run*dt;
    }else if(state.target){
     const tx=state.target.x-state.walk.x,tz=state.target.z-state.walk.z,dist=Math.hypot(tx,tz);
     if(dist<.12)state.target=null;else{
      const s=Math.min(dist,WALK*1.2*dt);dx=tx/dist*s;dz=tz/dist*s;state.walk.yaw=clampAngle(state.walk.yaw+clampAngle(Math.atan2(tx,tz)-state.walk.yaw)*Math.min(1,dt*6));
     }
    }
    if(dx||dz){
     const moved=P.slide(state.rects,state.walk.x,state.walk.z,dx,dz);
     if(state.target&&Math.abs(moved.x-state.walk.x)+Math.abs(moved.z-state.walk.z)<Math.hypot(dx,dz)*.2)state.target=null;
     state.walk.x=moved.x;state.walk.z=moved.z;state.dirty=true;
    }
   }
  }
  function draw(){
   const cam=cameras();matrices={vp:M.multiply(cam.proj,cam.view)};
   const markers=buildMarkers();
   if(state.mode==='plan'){
    // from above: flat, even light, no shadows, so the plan is easy to read
    buildOverlay();view.draw({...cam,clear:bg,layers:[...(state.gridOn?['grid']:[]),'solid','flat','soft~','markers','over!'],ambient:.92,gain:1,sun:[.28,.28,.28],sky:[1,1,1],ground:[1,1,1],light:[.3,.9,.35],patterns:false});
   }else{
    // from inside: warm sunlight through the windows, with shadows, and a soft fill so rooms are never black
    view.draw({...cam,clear:skyRgb,layers:['ground','garden','solid','walls','ceil','soft~','glow~','markers'],ambient:.8,gain:1.0,sun:[1.05,.94,.8],sky:[.97,.95,.92],ground:[.86,.8,.72],light:sunDir,fog:{color:skyRgb,start:18,end:60},shadows:{matrix:state.sun,casters:['solid','walls','ceil','garden'],strength:.78}});
   }
   state.dirty=false;state.animating=markers;
   onFrame?.(api);
  }
  function loop(now){
   if(disposed)return;const dt=Math.min(.1,(now-last)/1000);last=now;
   const moving=state.fly||state.target||state.keys.size;
   if(moving||state.animating||state.dirty){step(dt);draw()}
   raf=requestAnimationFrame(loop);
  }
  function hideProp(id){state.hidden=id||null;rebuild()}
  function setOverlay(o){state.overlay=o||{};state.dirty=true}
  function snapshot(){draw();return canvas.toDataURL('image/png')}
  function dispose(){disposed=true;cancelAnimationFrame(raf);view.dispose()}
  const api={canvas,state,rebuild,hideProp,setOverlay,setMode,getMode:()=>state.mode,frame,zoomAt,panBy,lookBy,flyTo,setTarget,setKey,toWorld,toScreen,ray,pickFurniture,pickProp,pickRoom,pickWall,pickHandle,snapshot,dispose,redraw:()=>{state.dirty=true},step,draw,
   walk:state.walk,plan:state.plan,setLabels:on=>{state.labels=on},setGrid:on=>{state.gridOn=on;state.dirty=true}};
  rebuild();frame();raf=requestAnimationFrame(loop);
  return api;
 }
 return {mount,EYE,FOV};
})();
if(typeof module!=='undefined')module.exports=Palace3D;
