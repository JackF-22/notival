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
  const meshes={ground:new M.Mesh(),solid:new M.Mesh(),walls:new M.Mesh(),flat:new M.Mesh(),ceil:new M.Mesh(),soft:new M.Mesh(),grid:new M.Mesh(),over:new M.Mesh(),markers:new M.Mesh()};
  const state={mode:'plan',plan:{cx:5,cz:4.5,scale:40},walk:{x:3,z:2,yaw:0,pitch:0},overlay:{},dirty:true,fly:null,target:null,keys:new Set(),time:0,rects:[],gridOn:true,labels:true};
  let raf=0,last=performance.now(),disposed=false,matrices=null;

  // ── Building the picture from the model ────────────────────────────────────
  function addWalls(solid,soft){
   for(const run of P.wallRuns(palace)){
    const along=run.axis==='x',len=run.to-run.from,mid=(run.from+run.to)/2,half=P.THICK/2;
    const pieces=run.kind==='solid'?[[0,P.HEIGHT]]:run.kind==='door'?[[P.DOOR_TOP,P.HEIGHT]]:run.kind==='arch'?[[P.ARCH_TOP,P.HEIGHT]]:[[0,P.SILL],[P.HEAD,P.HEIGHT]];
    for(const [y0,y1] of pieces)for(const side of ['a','b']){
     const room=run[side],colour=room?room.wall:EXTERIOR,off=(side==='a'?-1:1)*half/2;
     // the inner face of each side shows that room's colour; the top of the wall is dark so walls read clearly from above
     if(along)solid.box(mid,y0,run.at+off,len,y1-y0,half,colour,{top:CAP});else solid.box(run.at+off,y0,mid,half,y1-y0,len,colour,{top:CAP});
    }
    // skirting boards along the foot of every solid wall
    if(run.kind==='solid')for(const side of ['a','b']){const room=run[side];if(!room)continue;const off=(side==='a'?-1:1)*(half/2+.008);if(along)solid.box(mid,0,run.at+off,len,.1,half+.016,P.shade(room.wall,.8));else solid.box(run.at+off,0,mid,half+.016,.1,len,P.shade(room.wall,.8))}
    if(run.kind==='window'){
     if(along)soft.box(mid,P.SILL,run.at,len,P.HEAD-P.SILL,.02,'#cfe6f5',{alpha:.32});else soft.box(run.at,P.SILL,mid,.02,P.HEAD-P.SILL,len,'#cfe6f5',{alpha:.32});
     // frame and sill
     const frame='#f4f2ee';
     if(along){solid.box(mid,P.SILL-.03,run.at,len+.06,.04,P.THICK+.08,frame);solid.box(run.from+.02,P.SILL,run.at,.04,P.HEAD-P.SILL,P.THICK+.02,frame);solid.box(run.to-.02,P.SILL,run.at,.04,P.HEAD-P.SILL,P.THICK+.02,frame);solid.box(mid,P.SILL+(P.HEAD-P.SILL)/2-.02,run.at,len,.04,P.THICK+.02,frame)}
     else{solid.box(run.at,P.SILL-.03,mid,P.THICK+.08,.04,len+.06,frame);solid.box(run.at,P.SILL,run.from+.02,P.THICK+.02,P.HEAD-P.SILL,.04,frame);solid.box(run.at,P.SILL,run.to-.02,P.THICK+.02,P.HEAD-P.SILL,.04,frame);solid.box(run.at,P.SILL+(P.HEAD-P.SILL)/2-.02,mid,P.THICK+.02,.04,len,frame)}
    }
    if(run.kind==='door'){
     const wood='#8b6b4a';
     if(along){solid.box(run.from+.025,0,run.at,.05,P.DOOR_TOP,P.THICK+.03,wood);solid.box(run.to-.025,0,run.at,.05,P.DOOR_TOP,P.THICK+.03,wood)}
     else{solid.box(run.at,0,run.from+.025,P.THICK+.03,P.DOOR_TOP,.05,wood);solid.box(run.at,0,run.to-.025,P.THICK+.03,P.DOOR_TOP,.05,wood)}
    }
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
  // A piece of furniture, part by part: boxes and cylinders placed round its centre, turned to face the way it faces.
  function addFurniture(solid,soft,f){
   const spec=P.spec(f.type),lift=spec.lift||0,pivot=[f.x,f.z];
   for(const part of spec.parts){
    const colour=P.paint(part.at(-1),f.color||spec.color);
    if(part[0]==='b'){const [,x,y,z,w,h,d]=part;solid.box(f.x+x,lift+y,f.z+z,w,h,d,colour,{rot:f.rot,pivot})}
    else{const [,x,y,z,r,h]=part;const wx=f.x+x*Math.cos(f.rot*Math.PI/180)+z*Math.sin(f.rot*Math.PI/180),wz=f.z-x*Math.sin(f.rot*Math.PI/180)+z*Math.cos(f.rot*Math.PI/180);solid.cylinder(wx,lift+y,wz,r,h,colour)}
   }
   // a soft shadow on the floor under anything that stands on it
   if(P.layerOf(f)==='floor'){
    const fp=P.footprint(f),onRug=palace.furniture.some(g=>P.layerOf(g)==='rug'&&fp.x0>=P.footprint(g).x0-.01&&fp.x1<=P.footprint(g).x1+.01&&fp.z0>=P.footprint(g).z0-.01&&fp.z1<=P.footprint(g).z1+.01);
    const y=onRug?.045:.026;
    for(const [grow,alpha] of [[.04,.13],[.1,.07],[.17,.035]])soft.floor(fp.x0-grow,fp.z0-grow,fp.x1+grow,fp.z1+grow,y,'#000000',alpha);
   }
  }
  function rebuild(){
   for(const m of [meshes.ground,meshes.solid,meshes.walls,meshes.flat,meshes.ceil,meshes.soft,meshes.grid])m.clear();
   const {ground,solid,walls,flat,ceil,soft,grid}=meshes,b=P.bounds(palace);
   ground.floor(b.x0-60,b.z0-60,b.x1+60,b.z1+60,-.02,'#a9bd96');
   for(const r of palace.rooms){solid.floor(r.x,r.z,r.x+r.w,r.z+r.d,.02,r.floor);ceil.ceiling(r.x,r.z,r.x+r.w,r.z+r.d,P.HEIGHT,'#f8f5ee')}
   addWalls(walls,soft);addPlanWalls(flat);
   // wood-effect floor boards: faint lines every half metre
   for(const r of palace.rooms)for(let z=r.z+.5;z<r.z+r.d-.01;z+=.5)soft.floor(r.x,z-.004,r.x+r.w,z+.004,.022,'#000000',.05);
   for(const f of palace.furniture)addFurniture(solid,soft,f);
   // a faint one-metre grid, seen only from above
   for(let x=Math.floor(b.x0)-3;x<=Math.ceil(b.x1)+3;x++)grid.line([x,.012,Math.floor(b.z0)-3],[x,.012,Math.ceil(b.z1)+3],'#d7d4cc');
   for(let z=Math.floor(b.z0)-3;z<=Math.ceil(b.z1)+3;z++)grid.line([Math.floor(b.x0)-3,.012,z],[Math.ceil(b.x1)+3,.012,z],'#d7d4cc');
   for(const name of ['ground','solid','walls','flat','ceil','soft'])view.set(name,meshes[name]);view.set('grid',grid,'lines');
   state.rects=P.colliders(palace);state.dirty=true;
  }
  // Places to remember bob gently above their furniture.
  function buildMarkers(){
   const m=meshes.markers;m.clear();let any=false;
   palace.stations.forEach((s,k)=>{
    const f=palace.furniture.find(g=>g.id===s.furnitureId);if(!f)return;any=true;
    const spec=P.spec(f.type),top=(spec.lift||0)+spec.h+(state.mode==='plan'?.55:.4),bob=Math.sin(state.time*2+k)*.05;
    const active=state.overlay.station===s.id;
    m.diamond(f.x,top+bob,f.z,state.mode==='plan'?.24:.13,active?'#ffffff':GOLD,{tall:1.6});
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
   if(state.mode==='plan'){buildOverlay();view.draw({...cam,clear:bg,layers:[...(state.gridOn?['grid']:[]),'solid','flat','soft~','markers','over!'],ambient:.8,gain:1.0,light:[.3,.9,.35]})}
   else{view.draw({...cam,clear:skyRgb,layers:['ground','solid','walls','ceil','soft~','markers'],ambient:.86,gain:1.24,light:[.38,.8,.42],fog:{color:skyRgb,start:14,end:48}})}
   state.dirty=false;state.animating=markers;
   onFrame?.(api);
  }
  function loop(now){
   if(disposed)return;const dt=Math.min(.1,(now-last)/1000);last=now;
   const moving=state.fly||state.target||state.keys.size;
   if(moving||state.animating||state.dirty){step(dt);draw()}
   raf=requestAnimationFrame(loop);
  }
  function setOverlay(o){state.overlay=o||{};state.dirty=true}
  function snapshot(){draw();return canvas.toDataURL('image/png')}
  function dispose(){disposed=true;cancelAnimationFrame(raf);view.dispose()}
  const api={canvas,state,rebuild,setOverlay,setMode,getMode:()=>state.mode,frame,zoomAt,panBy,lookBy,flyTo,setTarget,setKey,toWorld,toScreen,ray,pickFurniture,pickRoom,pickWall,pickHandle,snapshot,dispose,redraw:()=>{state.dirty=true},step,draw,
   walk:state.walk,plan:state.plan,setLabels:on=>{state.labels=on},setGrid:on=>{state.gridOn=on;state.dirty=true}};
  rebuild();frame();raf=requestAnimationFrame(loop);
  return api;
 }
 return {mount,EYE,FOV};
})();
if(typeof module!=='undefined')module.exports=Palace3D;
