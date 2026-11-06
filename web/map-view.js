/* The mind map is a pannable, zoomable surface; a horizontal swipe also moves between Note and Mind map. */
(()=>{
 const canvas=document.querySelector('#canvas');if(!canvas)return;
 const world=document.createElement('div');world.id='map-world';
 world.append(document.querySelector('#edges'),document.querySelector('#nodes'));canvas.prepend(world);
 const view={x:40,y:40,z:1},MIN=0.2,MAX=3,clamp=z=>Math.max(MIN,Math.min(MAX,z));
 let needFit=true,lastNote=null;
 const hint=document.querySelector('.map-hint');if(hint)hint.textContent='Drag the background to move around · Pinch or ⌘-scroll to zoom · Drag boxes and connections to arrange · ⌘-click to select several, then Delete · Double-click a box to rename';
 canvas.tabIndex=0;canvas.setAttribute('aria-label','Mind map. Drag to move, pinch to zoom; plus, minus and 0 keys zoom and fit.');
 const controls=document.createElement('div');controls.className='map-zoom';
 const button=(label,title,run)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);b.onpointerdown=e=>e.stopPropagation();b.onclick=run;controls.append(b);return b};
 const center=()=>{const r=canvas.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}};
 button('−','Zoom out',()=>{const c=center();zoomAt(1/1.25,c.x,c.y)});
 const level=button('100%','Reset zoom to 100%',()=>{const c=center();zoomAt(1/view.z,c.x,c.y)});level.className='map-zoom-level';
 button('+','Zoom in',()=>{const c=center();zoomAt(1.25,c.x,c.y)});
 button('Fit','Fit everything in view',()=>fit());
 button('Tidy','Reset every connection line to its default shape',()=>window.marginTidyMap?.());
 canvas.append(controls);
 function apply(){
  world.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.z})`;
  canvas.style.backgroundSize=`${18*view.z}px ${18*view.z}px`;canvas.style.backgroundPosition=`${view.x}px ${view.y}px`;
  level.textContent=Math.round(view.z*100)+'%';
 }
 function zoomAt(factor,clientX,clientY){
  const rect=canvas.getBoundingClientRect(),px=clientX-rect.left,py=clientY-rect.top,z=clamp(view.z*factor),k=z/view.z;
  view.x=px-(px-view.x)*k;view.y=py-(py-view.y)*k;view.z=z;apply();
 }
 function fit(){
  const boxes=[...document.querySelectorAll('#nodes .map-node,#edge-labels .edge-chip')].map(el=>({x:parseFloat(el.style.left)||0,y:parseFloat(el.style.top)||0,w:el.offsetWidth,h:el.offsetHeight})).filter(b=>b.w);
  if(!boxes.length)return;
  const minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y)),maxX=Math.max(...boxes.map(b=>b.x+b.w)),maxY=Math.max(...boxes.map(b=>b.y+b.h));
  const cw=canvas.clientWidth,ch=canvas.clientHeight,pad=48,bw=Math.max(1,maxX-minX),bh=Math.max(1,maxY-minY);
  view.z=clamp(Math.min(1.25,(cw-pad*2)/bw,(ch-pad*2)/bh));
  view.x=(cw-bw*view.z)/2-minX*view.z;view.y=(ch-bh*view.z)/2-minY*view.z;apply();
 }
 window.marginMapView={scale:()=>view.z,toWorld:(clientX,clientY)=>{const r=canvas.getBoundingClientRect();return {x:(clientX-r.left-view.x)/view.z,y:(clientY-r.top-view.y)/view.z}},fit,apply};
 // Drag the background to move around.
 let pan=null;
 canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('.map-node,.edge-chip,.passage-edge-hit,.map-zoom,.map-selection'))return;
  event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);
  pan={id:event.pointerId,x:event.clientX,y:event.clientY,vx:view.x,vy:view.y};canvas.classList.add('panning');
 });
 canvas.addEventListener('pointermove',event=>{if(pan?.id!==event.pointerId)return;view.x=pan.vx+event.clientX-pan.x;view.y=pan.vy+event.clientY-pan.y;apply()});
 const endPan=event=>{if(pan?.id!==event.pointerId)return;pan=null;canvas.classList.remove('panning');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId)};
 canvas.addEventListener('pointerup',endPan);canvas.addEventListener('pointercancel',endPan);
 // Pinch (Chrome reports it as ctrl+wheel; WebKit as gesture events), and two-finger scroll to move.
 canvas.addEventListener('wheel',event=>{
  event.preventDefault();
  const unit=event.deltaMode===1?16:1,dx=event.deltaX*unit,dy=event.deltaY*unit;
  if(event.ctrlKey||event.metaKey)zoomAt(Math.exp(-dy*(event.ctrlKey?0.01:0.0025)),event.clientX,event.clientY);
  else{view.x-=dx;view.y-=dy;apply()}
 },{passive:false});
 let gestureStart=1;
 canvas.addEventListener('gesturestart',event=>{event.preventDefault();gestureStart=view.z});
 canvas.addEventListener('gesturechange',event=>{event.preventDefault();zoomAt(clamp(gestureStart*event.scale)/view.z,event.clientX,event.clientY)});
 canvas.addEventListener('gestureend',event=>event.preventDefault());
 canvas.addEventListener('keydown',event=>{
  if(event.metaKey||event.ctrlKey||event.altKey||event.target!==canvas)return;
  const c=center(),step=60;
  if(event.key==='+'||event.key==='='){event.preventDefault();zoomAt(1.2,c.x,c.y)}
  else if(event.key==='-'){event.preventDefault();zoomAt(1/1.2,c.x,c.y)}
  else if(event.key==='0'){event.preventDefault();fit()}
  else if(event.key.startsWith('Arrow')){event.preventDefault();view.x+={ArrowLeft:step,ArrowRight:-step}[event.key]||0;view.y+={ArrowUp:step,ArrowDown:-step}[event.key]||0;apply()}
 });
 // Fit once each time the map opens (or the note changes); later redraws keep the view.
 const baseDraw=drawMap;drawMap=function(){
  baseDraw();
  const note=current();if(note&&note.id!==lastNote){lastNote=note.id;needFit=true}
  if(needFit&&canvas.clientWidth){needFit=false;fit()}else apply();
 };
 const baseMode=setMode;setMode=function(next){if(next==='map'&&mode!=='map')needFit=true;return baseMode(next)};
 // Swipe sideways with two fingers to flip between the note and its map (left → map, right → note).
 let travel=0,lastWheel=0,lockedUntil=0;
 function slide(target,from){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!target)return;
  target.classList.remove('swipe-in-left','swipe-in-right');void target.offsetWidth;target.classList.add('swipe-in-'+from);
  setTimeout(()=>target.classList.remove('swipe-in-left','swipe-in-right'),320);
 }
 document.addEventListener('wheel',event=>{
  if(document.body.dataset.view!=='note'||event.ctrlKey||event.metaKey||document.querySelector('dialog[open]')||!current())return;
  if(event.target.closest?.('#canvas,textarea,pre,table,.code-editor,select,input,.editor-menu-panel,#note-rail,.table-menu,.slash-menu'))return;
  const now=performance.now();
  if(now<lockedUntil){lockedUntil=now+350;return}
  if(now-lastWheel>220)travel=0;lastWheel=now;
  if(Math.abs(event.deltaX)<Math.abs(event.deltaY)*1.5){travel=0;return}
  travel+=event.deltaX;
  if(Math.abs(travel)<110)return;
  const go=travel>0?'map':'write';travel=0;lockedUntil=now+600;
  if(mode===go)return;
  setMode(go);slide(document.querySelector(go==='map'?'#map':'#editor'),go==='map'?'right':'left');
 },{passive:true,capture:true});
})();
