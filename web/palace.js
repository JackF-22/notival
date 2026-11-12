// Memory palaces on a subject: each subject can have palaces (a house you build, then walk through), with things to remember
// left on the furniture. This is the screen: the subject's Palace tab, and the editor with its plan view (build) and
// walk view (look round, and recall what you left where). The rules are in palace-model.js, the drawing in palace-3d.js.
(()=>{
 const P=PalaceModel;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const button=(label,onclick,cls='',title='')=>{const b=el('button',cls,label);b.type='button';b.onclick=onclick;if(title){b.title=title;b.setAttribute('aria-label',title)}return b};
 const palaces=()=>(state.palaces??=[]);
 const subjectOf=id=>(state?.projects||[]).find(p=>p.id===id)||null;
 const ago=time=>{const d=Math.round((Date.now()-time)/86400000);return d<=0?'today':d===1?'yesterday':d+' days ago'};
 const hexOf=css=>{const m=String(css).match(/\d+(\.\d+)?/g);return m&&m.length>=3?'#'+m.slice(0,3).map(v=>Math.round(+v).toString(16).padStart(2,'0')).join(''):'#f3f1ec'};
 let editor=null;

 // ── The subject's Palace tab ───────────────────────────────────────────────
 window.marginPalacePage=subject=>{
  const page=el('div','palace-page');
  const head=el('div','palace-page-head');head.append(el('h2','','Memory palaces'));
  const make=(starter)=>{const palace=starter?P.starterHouse(subject.id,subject.name+' house'):P.blank(subject.id,'My palace');palaces().unshift(palace);persist();openEditor(palace.id)};
  const add=el('div','palace-new');add.append(button('+ New palace',()=>make(true),'primary','Start from a furnished starter house'),button('Start empty',()=>make(false),'','Start with nothing and build your own'));
  head.append(add);page.append(head);
  const mine=palaces().filter(p=>p.projectId===subject.id);
  page.append(el('p','palace-lead','Walk through a house in your mind and leave what you want to remember on the furniture. Build one that looks like somewhere you know, then walk it to recall.'));
  if(!mine.length)page.append(el('p','palace-empty','No palaces yet. Start from the starter house and rearrange it, or begin with an empty plot.'));
  const grid=el('div','palace-grid');
  for(const palace of mine){
   const card=el('div','palace-card');
   const body=el('button','palace-card-open');body.type='button';body.onclick=()=>openEditor(palace.id);
   body.append(el('strong','',palace.name),el('small','',palace.rooms.length+' room'+(palace.rooms.length===1?'':'s')+' · '+palace.stations.length+' thing'+(palace.stations.length===1?'':'s')+' to remember'),el('small','palace-card-when',palace.walks?.length?'Last walked '+ago(palace.walks[0].t):'Not walked yet'));
   const actions=el('div','palace-card-actions');
   actions.append(button('Copy',()=>{const copy=JSON.parse(JSON.stringify(palace));copy.id=P.makeId('p');copy.name=palace.name+' copy';copy.created=Date.now();copy.walks=[];palaces().unshift(copy);persist();window.marginSubjectTab?.(subject.id,'palace')},'','Make a copy to try a different arrangement'));
   let armed=false,timer=0;const del=button('Delete',()=>{if(!armed){armed=true;del.textContent='Sure?';del.classList.add('is-armed');timer=setTimeout(()=>{armed=false;del.textContent='Delete';del.classList.remove('is-armed')},3000);return}clearTimeout(timer);state.palaces=palaces().filter(p=>p!==palace);persist();window.marginSubjectTab?.(subject.id,'palace')},'palace-delete','Delete this palace');
   actions.append(del);card.append(body,actions);grid.append(card);
  }
  page.append(grid);return page;
 };

 // ── The editor ─────────────────────────────────────────────────────────────
 function openEditor(id){
  const palace=palaces().find(p=>p.id===id);if(!palace)return;
  if(editor)editor.close();
  const subject=subjectOf(palace.projectId),history=P.history(palace);
  const root=el('div','palace-editor');root.setAttribute('role','dialog');root.setAttribute('aria-label','Memory palace');
  const top=el('header','pe-top'),stage=el('div','pe-stage'),side=el('aside','pe-side'),canvas=el('canvas','pe-canvas'),labels=el('div','pe-labels'),hud=el('div','pe-hud'),card=el('div','pe-card'),recallBox=el('div','pe-recall');
  card.hidden=true;recallBox.hidden=true;
  const toolbar=el('div','pe-toolbar');toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Building tools');
  const cross=el('div','pe-cross');stage.append(canvas,labels,cross,toolbar,hud,card,recallBox);
  const body=el('div','pe-body');body.append(stage,side);root.append(top,body);document.body.append(root);

  const S={look:false,edit:false,placing:null,tool:'select',tab:'build',room:null,furniture:null,prop:null,station:null,drag:null,space:false,recall:null,labelNodes:[],hudTimer:0,collapsed:false};
  let ctl=null;
  const toast_=message=>window.toast?.(message);
  // Text with LaTeX in it ($x^2$ inline, $$…$$ on its own line), typeset.
  const rich=(tag,text,cls='')=>{const n=el(tag,cls);n.append(PalaceBook.typeset(text));return n};
  // Under a field that is being typed in: the same text with its equations drawn, shown only when it has any.
  function preview(...inputs){
   const box=el('div','pe-math-preview');box.hidden=true;
   const update=()=>{const text=inputs.map(i=>i.value).filter(v=>v.includes('$')).join('\n');box.hidden=!text;box.replaceChildren();if(text)box.append(PalaceBook.typeset(text))};
   for(const i of inputs)i.addEventListener('input',update);update();return box;
  }
  const furnitureName=f=>P.spec(f.type)?.name||f.type;
  const roomNameOf=f=>P.roomOf(palace,f)?.name||'';

  // Record a change for undo and saving, then redraw everything.
  function commit(){
   if(history.record())persist();
   ctl?.rebuild();renderTop();renderSide();overlay();
  }
  function overlay(extra={}){ctl?.setOverlay({room:S.room,furniture:S.furniture,prop:S.prop,station:S.station,edit:S.edit&&ctl.getMode()==='walk',...S.hover,...extra})}

  // ── The top bar ──────────────────────────────────────────────────────────
  const nameInput=el('input','pe-name');nameInput.value=palace.name;nameInput.setAttribute('aria-label','Palace name');
  nameInput.onchange=()=>{palace.name=nameInput.value.trim()||'My palace';commit()};
  const modeButtons={};
  const undo=button('↶',()=>{if(history.undo()){persist();S.furniture=S.furniture&&palace.furniture.some(f=>f.id===S.furniture)?S.furniture:null;S.prop=S.prop&&P.propsOf(palace).some(q=>q.id===S.prop)?S.prop:null;S.room=S.room&&palace.rooms.some(r=>r.id===S.room)?S.room:null;ctl.rebuild();renderTop();renderSide();overlay()}},'pe-icon','Undo (⌘Z)');
  const redo=button('↷',()=>{if(history.redo()){S.prop=S.prop&&P.propsOf(palace).some(q=>q.id===S.prop)?S.prop:null;S.furniture=S.furniture&&palace.furniture.some(f=>f.id===S.furniture)?S.furniture:null;persist();ctl.rebuild();renderTop();renderSide();overlay()}},'pe-icon','Redo (⇧⌘Z)');
  function renderTop(){
   top.replaceChildren();
   const modes=el('div','pe-modes');
   for(const [id,label] of [['plan','Plan'],['walk','Walk']]){const b=button(label,()=>setMode(id),'pe-mode');b.setAttribute('aria-pressed',String(ctl?.getMode()===id));modeButtons[id]=b;modes.append(b)}
   undo.disabled=!history.canUndo();redo.disabled=!history.canRedo();
   const floors=el('div','pe-levels');floors.setAttribute('role','group');floors.setAttribute('aria-label','Floors');
   for(const n of P.levels(palace)){const b=button(n===0?'Ground':'Floor '+n,()=>goLevel(n),'pe-mode',P.levelName(n));b.setAttribute('aria-pressed',String(P.levelOf(palace)===n));floors.append(b)}
   floors.append(button('+ Floor',()=>addLevel(),'pe-mode pe-addfloor','Add another floor on top of the house'));
   top.append(button('← Back',()=>close(),'pe-back','Back to the subject'),nameInput,modes,floors,undo,redo,el('span','pe-spacer'),button('Recall walk',()=>startRecall(),'pe-walk primary','Walk the route and recall what you left at each stop'));
  }
  function setMode(mode){
   if(!ctl||ctl.getMode()===mode)return;
   lookOff();stopRecall(false);hideCard();S.placing=null;S.hover={};ctl.setMode(mode);
   root.dataset.mode=mode;
   if(mode==='walk'){if(!S.visited){S.visited=true;toFrontDoor()}S.tool='select';hudShow('Drag to look · W A S D or arrows to walk · click the floor to go there · click a book to take it down, or a glowing marker to read it · Esc to go back')}
   renderTop();renderSide();renderToolbar();overlay();
   if(mode==='walk'&&!S.edit)lookOn();   // walking is mouse look: the mouse turns your head, with nothing to switch on
  }
  // ── Mouse look ───────────────────────────────────────────────────────────
  // The pointer is held in the middle and every movement of the mouse turns your head. In the app the Mac does the holding
  // (the page cannot be sure of pointer lock there); in a browser it is pointer lock.
  const bridge=window.webkit?.messageHandlers?.margin;
  const centre=()=>({x:canvas.clientWidth/2,y:canvas.clientHeight/2});
  const aimPoint=p=>S.look?centre():p;
  function lookChanged(){
   root.dataset.look=String(S.look);S.hover={};S.drag=null;canvas.style.cursor='';
   if(S.look)hudShow('Move the mouse to look around · click what is under the dot · Esc frees the mouse',5000);
   else if(ctl?.getMode()==='walk'&&!S.edit&&!reading&&!S.recall&&bridge)hudShow('Click the view to look around again',4000);
   renderToolbar();overlay();ctl?.redraw();
  }
  function lookOn(){
   if(S.look||ctl?.getMode()!=='walk'||reading)return;
   if(bridge){bridge.postMessage({type:'mouseLook',on:true});S.look=true;lookChanged()}
   else if(canvas.requestPointerLock){try{const r=canvas.requestPointerLock();r&&r.catch&&r.catch(()=>{})}catch{}}
  }
  function lookOff(){
   if(!S.look)return;
   if(bridge)bridge.postMessage({type:'mouseLook',on:false});
   if(document.pointerLockElement===canvas)document.exitPointerLock?.();
   S.look=false;lookChanged();
  }
  const lockChange=()=>{const on=document.pointerLockElement===canvas;if(on!==S.look){S.look=on;lookChanged()}};
  document.addEventListener('pointerlockchange',lockChange);
  let hoverQueued=false;
  window.marginMouseLook=(dx,dy)=>{
   if(!S.look||!root.isConnected)return;ctl.turnBy(dx,dy);
   if(!hoverQueued){hoverQueued=true;requestAnimationFrame(()=>{hoverQueued=false;if(S.look)walkHover(centre())})}
  };
  window.marginMouseLookEnded=()=>{if(S.look){S.look=false;lookChanged()}};
  function setEdit(on){
   S.edit=on;S.placing=null;S.hover={};root.dataset.edit=String(on);hideCard();if(on)lookOff();else lookOn();   // building needs the pointer for the panel; exploring takes the mouse back
   if(on){S.tab='build';hudShow('Pick something in the panel, then click where it goes · click a thing to select it · R turns it · Esc cancels',9000)}
   renderToolbar();renderSide();overlay();requestAnimationFrame(()=>ctl?.redraw());
  }
  // Every walk starts at the front door, so the house always has the same beginning.
  function toFrontDoor(){
   const at=P.startPoint(palace);if(!at||!ctl)return;
   goLevel(P.levels(palace)[0],true);
   ctl.walk.x=at.x;ctl.walk.z=at.z;ctl.walk.yaw=at.yaw;ctl.walk.pitch=0;ctl.redraw();
  }
  // ── Floors ───────────────────────────────────────────────────────────────
  function goLevel(n,quiet=false){
   if(P.levelOf(palace)===n||!P.setLevel(palace,n))return false;
   S.prop=null;S.furniture=null;S.room=null;S.placing=null;if(!S.recall)S.station=null;hideCardQuiet();
   persist();ctl.rebuild();renderTop();renderSide();overlay();
   if(!quiet)hudShow(P.levelName(n),2200);return true;
  }
  function hideCardQuiet(){card.hidden=true}
  function addLevel(){
   const n=P.addLevel(palace);commit();goLevel(n);
   toast_(P.levelName(n)+' added with the same outline. Put a staircase on the floor below to link them.');
  }
  // Click a staircase in the walk-through: climb to the other end.
  function useStairs(f){
   const other=P.partnerOf(palace,f);if(!other){toast_('These stairs lead nowhere');return}
   const id=other.furniture.id;P.setLevel(palace,other.level);
   const g=palace.furniture.find(x=>x.id===id),v=P.viewFrom(palace,g);
   S.prop=null;S.furniture=null;S.station=null;hideCardQuiet();
   const room=P.roomAt(palace,v.x,v.z);ctl.walk.x=v.x;ctl.walk.z=v.z;ctl.walk.yaw=room?Math.atan2(room.x+room.w/2-v.x,room.z+room.d/2-v.z):v.yaw+Math.PI;ctl.walk.pitch=-.05;
   persist();ctl.rebuild();renderTop();renderSide();overlay();hudShow(P.levelName(other.level),2200);
  }
  function hudShow(text,ms=7000){hud.textContent=text;hud.classList.add('is-on');clearTimeout(S.hudTimer);S.hudTimer=setTimeout(()=>hud.classList.remove('is-on'),ms)}

  // The building tools sit over the plan so they are always to hand.
  const TOOLS=[['select','Select','Click to select; drag to move'],['room','Room','Drag out a new room'],['door','Door','Click a wall to add or remove a door'],['window','Window','Click a wall to add or remove a window'],['arch','Archway','Click a wall to add or remove an open archway']];
  function renderToolbar(){
   toolbar.replaceChildren();
   if(ctl?.getMode()==='walk'){
    for(const [edit,label,hint] of [[false,'Explore','Look around, take books down, read things'],[true,'Build','Add, move and change things while you walk']]){const b=button(label,()=>setEdit(edit),'pe-tool',hint);b.setAttribute('aria-pressed',String(S.edit===edit));toolbar.append(b)}
    const door=button('Front door',()=>{toFrontDoor();hudShow('The front door: where every walk begins',2200)},'pe-tool','Go back to the front door');toolbar.append(door);
    return;
   }
   for(const [id,label,hint] of TOOLS){const b=button(label,()=>{S.tool=id;canvas.dataset.tool=id;overlay();renderToolbar()},'pe-tool',hint);b.setAttribute('aria-pressed',String(S.tool===id));toolbar.append(b)}
  }
  // ── The side panel ───────────────────────────────────────────────────────
  function renderSide(){
   side.replaceChildren();
   const tabs=el('div','pe-tabs');
   for(const [id,label] of [['build','Build'],['selected','Selected'],['route','Route · '+palace.stations.length]]){const b=button(label,()=>{S.tab=id;renderSide()},'pe-tab');b.setAttribute('aria-pressed',String(S.tab===id));tabs.append(b)}
   side.append(tabs);
   const content=el('div','pe-panel');side.append(content);
   if(S.tab==='build')renderBuild(content);else if(S.tab==='selected')renderSelected(content);else renderRoute(content);
  }
  function renderBuild(box){
   const groups=new Map();for(const [type,spec] of Object.entries(P.CATALOG)){if(spec.hidden)continue;if(!groups.has(spec.cat))groups.set(spec.cat,[]);groups.get(spec.cat).push([type,spec])}
   box.append(el('small','pe-hint',ctl?.getMode()==='walk'?'Click a piece, then click where it goes. R turns it, Esc cancels.':'Click a piece to add it, or drag it onto the plan.'));
   for(const [cat,items] of groups){
    const section=el('section','pe-cat');section.append(el('h3','',cat));const row=el('div','pe-items');
    for(const [type,spec] of items){
     const b=button('',()=>addFurniture(type),'pe-item');b.draggable=true;b.dataset.type=type;
     const swatch=el('span','pe-swatch');swatch.style.background=spec.color;b.append(swatch,el('span','pe-item-name',spec.name),el('small','',spec.w.toFixed(1)+' × '+spec.d.toFixed(1)+' m'));
     b.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/palace-type',type);event.dataTransfer.effectAllowed='copy'});
     row.append(b);
    }
    section.append(row);box.append(section);
   }
   // small things that stand on furniture
   const things=el('section','pe-cat');things.append(el('h3','','Things to put on furniture'),el('small','pe-hint','Select a piece of furniture and click one, or drag it onto the furniture. Books can be taken down and read.'));
   const grid=el('div','pe-items');
   for(const [type,spec] of Object.entries(P.PROPS)){
    const b=button('',()=>addProp(type),'pe-item');b.draggable=true;b.dataset.prop=type;
    const swatch=el('span','pe-swatch');swatch.style.background=spec.color;b.append(swatch,el('span','pe-item-name',spec.name),el('small','',spec.read?'can be read':'holds a meaning'));
    b.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/palace-prop',type);event.dataTransfer.effectAllowed='copy'});
    grid.append(b);
   }
   things.append(grid);box.append(things);
  }
  // Put a prop on the selected piece of furniture (or the one holding the selected prop).
  function addProp(type){
   if(ctl.getMode()==='walk'){S.placing={kind:'prop',type};S.tab='build';hudShow('Point at a shelf or table and click · Esc cancels · hold Shift to place several',6000);renderSide();overlay();return}
   const host=palace.furniture.find(g=>g.id===S.furniture);
   if(!host){toast_('Select a piece of furniture first, or drag this onto one');return}
   if(!P.surfacesOf(host).length){toast_('Nothing can stand on a '+furnitureName(host).toLowerCase());return}
   const q=P.placeProp(palace,type,host.id,type==='book'?P.bookLike(P.propsOn(palace,host.id).length+2):{});
   if(!q){toast_('There is no room left on it');return}
   S.prop=q.id;S.tab='selected';commit();
  }
  const localOf=(f,x,z)=>{const rad=f.rot*Math.PI/180,dx=x-f.x,dz=z-f.z;return {lx:dx*Math.cos(rad)-dz*Math.sin(rad),lz:dx*Math.sin(rad)+dz*Math.cos(rad)}};
  function selectProp(id){const q=P.propsOf(palace).find(g=>g.id===id);if(!q)return;S.prop=id;S.furniture=q.hostId;S.room=null;S.station=null;S.tab='selected';renderSide();overlay()}
  function addFurniture(type){
   if(ctl.getMode()==='walk'){S.placing={kind:'furniture',type,rot:0};S.tab='build';hudShow('Click where it goes · R turns it · Esc cancels · hold Shift to place several',6000);renderSide();overlay();return}
   if(P.spec(type).link==='up')return addStairs();
   const room=palace.rooms.find(r=>r.id===S.room)||palace.rooms.find(r=>r.id===P.roomAt(palace,ctl.plan.cx,ctl.plan.cz)?.id)||palace.rooms[0];
   if(!room){toast_('Add a room first');return}
   const spot=P.findSpot(palace,type,room.id);if(!spot){toast_('There is no room left in '+room.name+' for that');return}
   const f=P.placeFurniture(palace,type,spot.x,spot.z);if(!f){toast_('That doesn\'t fit there');return}
   S.furniture=f.id;S.room=null;S.tab='selected';commit();
  }
  // A staircase needs a floor above, and room for both ends.
  function addStairs(){
   if(!P.levels(palace).includes(P.levelOf(palace)+1)){toast_('Add a floor above first (+ Floor), then put the staircase here');return}
   const room=palace.rooms.find(r=>r.id===S.room)||palace.rooms[0];if(!room){toast_('Add a room first');return}
   for(const rot of [0,90])for(let x=room.x+.5;x<room.x+room.w;x+=.5)for(let z=room.z+.5;z<room.z+room.d;z+=.5){
    const f=P.placeFurniture(palace,'stairs-up',x,z,{rot});if(f){S.furniture=f.id;S.room=null;S.tab='selected';commit();return}
   }
   toast_('There is no room for a staircase here that fits on the floor above too');
  }
  function swatches(current,colours,onPick){
   const row=el('div','pe-swatches');
   for(const c of colours){const b=button('',()=>onPick(c),'pe-colour');b.style.background=c;b.title=c;b.setAttribute('aria-pressed',String(c.toLowerCase()===String(current).toLowerCase()));row.append(b)}
   const custom=el('input','pe-colour-input');custom.type='color';custom.value=/^#[0-9a-f]{6}$/i.test(current)?current:'#808080';custom.setAttribute('aria-label','Any colour');custom.oninput=()=>onPick(custom.value);row.append(custom);
   return row;
  }
  function renderSelected(box){
   const f=palace.furniture.find(g=>g.id===S.furniture),r=palace.rooms.find(g=>g.id===S.room),q=P.propsOf(palace).find(g=>g.id===S.prop);
   if(q&&f){renderProp(box,q,f)}
   else if(f){
    const spec=P.spec(f.type);
    box.append(el('h3','pe-title',spec.name),el('small','pe-hint',roomNameOf(f)));
    const row=el('div','pe-actions');
    if(ctl.getMode()==='walk')row.append(button('Move',()=>{S.placing={kind:'moveF',id:f.id};hudShow('Click where it should go · Esc cancels',5000);overlay()},'','Pick it up and put it somewhere else'));
    if(f.link){const other=P.partnerOf(palace,f);if(other)row.append(button(other.level>P.levelOf(palace)?'Go upstairs':'Go downstairs',()=>ctl.getMode()==='walk'?useStairs(f):goLevel(other.level),'primary'))}
    if(P.layerOf(f)!=='wall')row.append(button('Rotate',()=>rotateSelected(),'','Turn 90° (R)'));
    row.append(button('Duplicate',()=>duplicateSelected(),'','Copy it next to this one (⌘D)'),button('Delete',()=>deleteSelected(),'pe-danger','Remove it (Delete)'));
    box.append(row);
    box.append(el('small','pe-label','Colour'),swatches(f.color,P.TINTS,c=>{P.recolour(palace,f.id,c);commit()}));
    const same=Object.entries(P.CATALOG).filter(([t,s])=>(s.layer||'floor')===P.layerOf(f)&&t!==f.type);
    const swap=el('select','pe-select');swap.setAttribute('aria-label','Swap for another piece');const first=el('option','','Swap for…');first.value='';swap.append(first);
    for(const [t,s] of same){const o=el('option','',s.name);o.value=t;swap.append(o)}
    swap.onchange=()=>{if(!swap.value)return;if(!P.swapFurniture(palace,f.id,swap.value))toast_('That one doesn\'t fit here');commit()};
    if(!f.link)box.append(el('small','pe-label','Change it'),swap);
    const onTop=P.propsOn(palace,f.id);
    if(onTop.length){box.append(el('small','pe-label','On it · '+onTop.length));const chips=el('div','pe-chips');for(const o of onTop)chips.append(button(o.title||P.PROPS[o.type].name,()=>selectProp(o.id),'pe-chip','Select it'));box.append(chips)}
    renderStations(box,f);
   }else if(r){
    box.append(el('h3','pe-title','Room'));
    const name=el('input','pe-input');name.value=r.name;name.setAttribute('aria-label','Room name');name.onchange=()=>{r.name=name.value.trim()||r.name;commit()};box.append(name);
    box.append(el('small','pe-hint',r.w+' × '+r.d+' m · drag the edges and corners to resize, or drag inside to move it'));
    box.append(el('small','pe-label','Floor'),swatches(r.floor,P.FLOORS,c=>{r.floor=c;commit()}),el('small','pe-label','Walls'),swatches(r.wall,P.WALLS,c=>{r.wall=c;commit()}));
    const row=el('div','pe-actions');row.append(button('Delete room',()=>deleteRoom(r),'pe-danger'));box.append(row);
   }else box.append(el('p','pe-hint','Select a piece of furniture or a room to change it, or to leave something there to remember.'));
  }

  // ── A small thing on a piece of furniture ────────────────────────────────
  function renderProp(box,q,host){
   const sp=P.PROPS[q.type],levels=P.surfacesOf(host);
   box.append(el('h3','pe-title',sp.name),el('small','pe-hint','On the '+furnitureName(host).toLowerCase()+' · '+roomNameOf(host)));
   const row=el('div','pe-actions');
   if(ctl.getMode()==='walk')row.append(button('Move',()=>{S.placing={kind:'moveP',id:q.id};hudShow('Point at a shelf or table and click · Esc cancels',5000);overlay()},'','Pick it up and put it somewhere else'));
   row.append(button('Rotate',()=>rotateProp(),'','Turn 90° (R)'));
   if(levels.length>1)row.append(button('Up a level',()=>moveLevel(q,1),'','Put it on the shelf above'),button('Down a level',()=>moveLevel(q,-1),'','Put it on the shelf below'));
   row.append(button('Delete',()=>deleteProp(),'pe-danger','Remove it (Delete)'));box.append(row);
   box.append(button('← The '+furnitureName(host).toLowerCase(),()=>select('furniture',host.id),'pe-link'));
   const title=el('input','pe-input');title.placeholder='What it stands for (use $…$ for an equation)';title.value=q.title||'';title.setAttribute('aria-label','What it stands for');
   const detail=el('input','pe-input');detail.placeholder='Meaning or note (optional)';detail.value=q.detail||'';detail.setAttribute('aria-label','Meaning or note');
   const sync=()=>{q.title=title.value.trim();q.detail=detail.value.trim();const st=P.stationOf(palace,q.id);if(st){st.title=q.title||sp.name;st.detail=q.detail}commit()};
   title.onchange=sync;detail.onchange=sync;box.append(el('small','pe-label','Value'),title,detail,preview(title,detail));
   const on=P.stationOf(palace,q.id),route=el('label','pe-check'),check=el('input');check.type='checkbox';check.checked=!!on;check.onchange=()=>{P.toggleRoute(palace,q.id);commit()};
   route.append(check,el('span','','Stop on my recall walk'+(on?' · stop '+(P.route(palace).findIndex(s=>s.id===on.id)+1):'')));box.append(route);
   box.append(el('small','pe-label','Colour'),swatches(q.color,q.type==='book'?['#b5533c','#3f6f8f','#d6a64a','#5f8a5a','#8a5a8a','#c9c2b2','#2f3e5c','#7a5a3d']:P.TINTS,c=>{q.color=c;commit()}));
   if(sp.read)renderPages(box,q);
  }
  function rotateProp(){const q=P.propsOf(palace).find(g=>g.id===S.prop);if(!q)return;if(!P.rotateProp(palace,q.id))toast_('No room to turn it here');else commit()}
  function moveLevel(q,dir){
   for(let k=q.surface+dir;k>=0&&k<P.surfacesOf(palace.furniture.find(g=>g.id===q.hostId)).length;k+=dir)if(P.moveProp(palace,q.id,q.hostId,{surface:k,lx:q.lx,lz:q.lz})){commit();return}
   toast_(dir>0?'No room on a higher level':'No room on a lower level');
  }
  function deleteProp(){
   const q=P.propsOf(palace).find(g=>g.id===S.prop);if(!q)return;
   if(P.stationOf(palace,q.id)&&!confirmAgain('o'+q.id,'It is a stop on your recall walk. Press Delete again to remove it.'))return;
   const host=q.hostId;P.removeProp(palace,q.id);S.prop=null;S.furniture=host;S.station=null;commit();
  }
  // What is written in a book: pages to edit, and ways to fill them from the subject's own material.
  function renderPages(box,q){
   box.append(el('small','pe-label','Pages · '+q.pages.length));
   const write=el('div','pe-actions');
   write.append(button('✎ Write in it',()=>readProp(q,false,true),'primary','Open the book and write on its pages, with equations drawn as you type'),button('Read it',()=>readProp(q),'','Take it down and read it'));box.append(write);
   // a short list of what is on each page; click one to open the book there and write
   q.pages.forEach((pg,i)=>{
    const first=String(pg.text||'').replace(/\s+/g,' ').trim();
    box.append(button((i+1)+' · '+(first?first.slice(0,46)+(first.length>46?'…':''):'(blank)'),()=>readProp(q,false,true,i+1),'pe-pageline','Write on page '+(i+1)));
   });
   const fill=el('div','pe-pick');
   const notes=(state.notes||[]).filter(n=>!palace.projectId||n.projectId===palace.projectId||!n.projectId).filter(n=>(n.blocks||[]).some(b=>b.type==='text'&&b.text));
   if(notes.length)fill.append(picker('Pages from a note',notes.map(n=>({id:n.id,label:n.title||'Untitled',make:()=>({title:n.title,pages:PalaceBook.paginate(n.blocks.filter(b=>b.type==='text'&&b.text).map(b=>b.text).join('\n\n'))})})),item=>fillPages(q,item.make())));
   const vocab=(state.vocab||[]).filter(w=>w.projectId===palace.projectId&&w.meaning);
   if(vocab.length)fill.append(picker('Pages from my vocab',[{id:'all',label:'All '+vocab.length+' words, eight to a page',make:()=>({title:(subject?.name||'Vocab'),pages:PalaceBook.listPages(vocab.map(w=>({title:w.term,detail:w.meaning})))})}],item=>fillPages(q,item.make())));
   const questions=typeof RecallModel!=='undefined'?RecallModel.collect(state,{projectId:palace.projectId}).filter(i=>i.origin!=='vocab'):[];
   if(questions.length)fill.append(picker('Pages from my questions',[{id:'all',label:'All '+questions.length+' questions, one to a page',make:()=>({title:'Questions',pages:questions.map(i=>({text:(i.type==='cloze'?i.text:i.prompt)+'\n\n— '+(i.type==='cloze'?i.blank:(typeof Knowledge!=='undefined'?Knowledge.prose(i.answer):i.answer))}))})}],item=>fillPages(q,item.make())));
   box.append(fill);
  }
  function fillPages(q,made){
   if(!made.pages.length){toast_('There was nothing to put in it');return}
   q.pages=made.pages;if(!q.title&&made.title){q.title=made.title;const st=P.stationOf(palace,q.id);if(st)st.title=q.title}
   commit();toast_(made.pages.length+' page'+(made.pages.length===1?'':'s')+' written');
  }
  // Taking a book down: it comes off its shelf in front of you and opens. Anything else just shows what it stands for.
  let reading=null;
  function readProp(q,fromScreen=true,edit=false,page=0){
   if(reading||!q)return;lookOff();const sp=P.PROPS[q.type],w=P.propWorld(palace,q);
   hideCard();hud.classList.remove('is-on');const pt=fromScreen&&w&&ctl.getMode()==='walk'?ctl.toScreen(w.x,w.y+w.h/2,w.z):null,r=canvas.getBoundingClientRect();
   ctl.hideProp(q.id);
   reading=PalaceBook.open({title:q.title||sp.name,detail:q.detail,pages:q.pages||[],color:q.color||sp.color,origin:pt?{x:r.left+pt.x,y:r.top+pt.y}:null,mount:root,editable:true,edit,page,
    onChange:({title,detail,pages})=>{q.title=title.trim();q.detail=detail.trim();q.pages=pages;const st=P.stationOf(palace,q.id);if(st){st.title=q.title||sp.name;st.detail=q.detail}commit()},
    onClose:()=>{reading=null;ctl.hideProp(null);canvas.focus();if(ctl.getMode()==='walk'&&!S.edit&&!S.recall)lookOn()}});
  }
  function showPropCard(q){
   const sp=P.PROPS[q.type],host=palace.furniture.find(g=>g.id===q.hostId),st=P.stationOf(palace,q.id);
   hud.classList.remove('is-on');card.replaceChildren();
   card.append(el('small','pe-card-where',sp.name+(host?' · on the '+furnitureName(host).toLowerCase()+' · '+roomNameOf(host):'')),q.title?rich('h3',q.title):el('h3','',sp.name));
   if(q.detail)card.append(rich('p',q.detail));
   if(st?.image)card.append(rich('p',st.image,'pe-card-image'));
   if(!q.title&&!q.detail)card.append(el('p','pe-hint','Nothing to remember here yet. Select it in the plan to give it a meaning.'));
   card.append(button('✕',()=>hideCard(),'pe-x','Close'));card.hidden=false;S.station=st?st.id:null;overlay();
  }
  function deleteRoom(r){
   const inside=palace.furniture.filter(f=>P.roomOf(palace,f)===r).length;
   if(inside&&!confirmAgain('room'+r.id,'Delete “'+r.name+'” and the '+inside+' piece'+(inside===1?'':'s')+' in it? Press again to confirm.'))return;
   P.removeRoom(palace,r.id);S.room=null;commit();
  }
  let armedKey='',armedTimer=0;
  function confirmAgain(key,message){if(armedKey===key){armedKey='';return true}armedKey=key;clearTimeout(armedTimer);armedTimer=setTimeout(()=>{armedKey=''},3500);toast_(message);return false}
  function rotateSelected(){const f=palace.furniture.find(g=>g.id===S.furniture);if(!f)return;if(!P.rotateFurniture(palace,f.id))toast_('No room to turn it here');else commit()}
  function duplicateSelected(){
   const f=palace.furniture.find(g=>g.id===S.furniture);if(!f)return;
   const spot=P.findSpot(palace,f.type,P.roomOf(palace,f)?.id);const copy=spot&&P.placeFurniture(palace,f.type,spot.x,spot.z,{rot:f.rot,color:f.color});
   if(!copy){toast_('No room for another');return}S.furniture=copy.id;commit();
  }
  function deleteSelected(){
   if(S.prop){deleteProp();return}
   if(S.furniture){const f=palace.furniture.find(g=>g.id===S.furniture);if(!f)return;const n=P.stationsOn(palace,f.id).length;if(n&&!confirmAgain('f'+f.id,'This holds '+n+' thing'+(n===1?'':'s')+' to remember. Press Delete again to remove it all.'))return;P.removeFurniture(palace,S.furniture);S.furniture=null;S.station=null;commit()}
   else if(S.room){const r=palace.rooms.find(g=>g.id===S.room);if(r)deleteRoom(r)}
  }

  // ── Things to remember ───────────────────────────────────────────────────
  function stationFields(station){
   const wrap=el('div','pe-station');
   const title=el('input','pe-input');title.placeholder='What to remember (use $…$ for an equation)';title.value=station.title;title.setAttribute('aria-label','What to remember');
   const detail=el('input','pe-input');detail.placeholder='Meaning or note (optional)';detail.value=station.detail;detail.setAttribute('aria-label','Meaning or note');
   const image=el('textarea','pe-input');image.rows=2;image.placeholder='Picture it: a silly, vivid image that ties it to this spot (optional)';image.value=station.image||'';image.setAttribute('aria-label','Vivid image');
   const save=()=>{station.title=title.value.trim();station.detail=detail.value.trim();station.image=image.value.trim();station.link=station.link;commit()};
   for(const f of [title,detail,image])f.onchange=save;
   const head=el('div','pe-station-head');head.append(el('b','','Stop '+(P.route(palace).findIndex(s=>s.id===station.id)+1)),station.link?el('small','pe-linked',station.link.kind==='vocab'?'from your vocab':'from your questions'):el('span'),button('✕',()=>{P.removeStation(palace,station.id);S.station=null;commit()},'pe-x','Remove this'));
   wrap.append(head,title,detail,image,preview(title,detail,image));return wrap;
  }
  function renderStations(box,f){
   box.append(el('small','pe-label','Left here'));
   for(const s of P.stationsOn(palace,f.id)){
    if(!s.propId){box.append(stationFields(s));continue}
    const o=P.propsOf(palace).find(g=>g.id===s.propId);if(o)box.append(button('Stop '+(P.route(palace).findIndex(x=>x.id===s.id)+1)+' · '+(o.title||P.PROPS[o.type].name),()=>selectProp(o.id),'pe-chip','It is set on the thing itself'));
   }
   const adder=el('div','pe-add');
   adder.append(button('+ Write something to remember',()=>{const s=P.addStation(palace,f.id,{title:'New thing'});S.station=s.id;commit()},'pe-add-write'));
   // pick from what the subject already has
   const pick=el('div','pe-pick');
   const vocab=(state.vocab||[]).filter(w=>w.projectId===palace.projectId&&w.meaning&&!palace.stations.some(s=>s.link?.kind==='vocab'&&s.link.id===w.id));
   if(vocab.length)pick.append(picker('From my vocab',vocab.map(w=>({id:w.id,label:w.term+' — '+w.meaning,make:()=>({title:w.term,detail:w.meaning,link:{kind:'vocab',id:w.id}})})),item=>{P.addStation(palace,f.id,item.make());commit()}));
   const questions=typeof RecallModel!=='undefined'?RecallModel.collect(state,{projectId:palace.projectId}).filter(i=>i.origin!=='vocab'&&!palace.stations.some(s=>s.link?.kind==='question'&&s.link.id===i.id)):[];
   if(questions.length)pick.append(picker('From my questions',questions.map(i=>({id:i.id,label:(i.type==='cloze'?i.text:i.prompt).slice(0,70),make:()=>({title:i.type==='cloze'?i.blank:(typeof Knowledge!=='undefined'?Knowledge.prose(i.answer):i.answer),detail:i.type==='cloze'?i.text:i.prompt,link:{kind:'question',id:i.id}})})),item=>{P.addStation(palace,f.id,item.make());commit()}));
   adder.append(pick);box.append(adder);
  }
  function picker(label,items,onPick){
   const wrap=el('details','pe-picker');wrap.append(el('summary','',label+' · '+items.length));
   const search=el('input','pe-input');search.type='search';search.placeholder='Search';const list=el('div','pe-picklist');
   const paint=()=>{list.replaceChildren();for(const item of items.filter(i=>!search.value||i.label.toLowerCase().includes(search.value.toLowerCase())).slice(0,60))list.append(button(item.label,()=>onPick(item),'pe-pickitem'))};
   search.oninput=paint;paint();wrap.append(search,list);return wrap;
  }
  function renderRoute(box){
   const list=P.route(palace);
   box.append(el('p','pe-hint',list.length?'The order you will walk them in. Use the arrows to reorder.':'Nothing to remember yet. Select a piece of furniture and leave something on it, or fill the house in one go.'));
   const actions=el('div','pe-actions');
   actions.append(button('Fill the house…',()=>fillDialog(),'','Place a list of things around the house in walking order'));
   if(list.length)actions.append(button('Recall walk',()=>startRecall(),'primary'));
   box.append(actions);
   list.forEach((s,k)=>{
    const f=palace.furniture.find(g=>g.id===s.furnitureId),row=el('div','pe-route');
    const open=button('',()=>{if((s.level||0)!==P.levelOf(palace))goLevel(s.level||0,true);const f=palace.furniture.find(g=>g.id===s.furnitureId);if(s.propId){selectProp(s.propId);S.station=s.id;return}S.prop=null;S.furniture=s.furnitureId;S.station=s.id;S.room=null;S.tab='selected';if(f&&ctl.getMode()==='plan'){ctl.plan.cx=f.x;ctl.plan.cz=f.z}renderSide();overlay()},'pe-route-open');
    open.append(el('b','',String(k+1)),rich('span',s.title||'(empty)','pe-route-title'),el('small','',f?furnitureName(f)+' · '+roomNameOf(f):P.levelName(s.level||0)));
    row.append(open,button('↑',()=>{P.moveStation(palace,s.id,-1);commit()},'pe-icon','Earlier'),button('↓',()=>{P.moveStation(palace,s.id,1);commit()},'pe-icon','Later'));box.append(row);
   });
  }
  // Put a whole list around the house in walking order.
  function fillDialog(){
   const free=P.walkOrder(palace).filter(f=>!P.stationsOn(palace,f.id).length).length;
   if(!free){toast_('Every piece of furniture already holds something');return}
   const dialog=el('dialog','pe-dialog');dialog.append(el('h2','','Fill the house'),el('p','pe-hint','Places things on furniture in the order you would walk past it, starting at the front door. '+free+' piece'+(free===1?'':'s')+' free.'));
   const vocab=(state.vocab||[]).filter(w=>w.projectId===palace.projectId&&w.meaning&&!palace.stations.some(s=>s.link?.kind==='vocab'&&s.link.id===w.id));
   const questions=typeof RecallModel!=='undefined'?RecallModel.collect(state,{projectId:palace.projectId}).filter(i=>i.origin!=='vocab'&&!palace.stations.some(s=>s.link?.kind==='question'&&s.link.id===i.id)):[];
   const source=el('select','pe-select');for(const [v,l] of [['paste','A list I type or paste'],...(vocab.length?[['vocab','My vocab words ('+vocab.length+')']]:[]),...(questions.length?[['questions','My questions ('+questions.length+')']]:[])]){const o=el('option','',l);o.value=v;source.append(o)}
   const text=el('textarea','pe-input');text.rows=7;text.placeholder='One per line. Put a dash between the thing and its meaning:\\nпривет — hello\\nспасибо — thank you';
   const count=el('p','pe-hint');
   const items=()=>source.value==='vocab'?vocab.map(w=>({title:w.term,detail:w.meaning,link:{kind:'vocab',id:w.id}})):source.value==='questions'?questions.map(i=>({title:i.type==='cloze'?i.blank:i.answer,detail:i.type==='cloze'?i.text:i.prompt,link:{kind:'question',id:i.id}})):text.value.split('\\n').map(l=>l.trim()).filter(Boolean).map(l=>{const [a,...b]=l.split(/\\s+[—–-]\\s+|\\t/);return {title:a.trim(),detail:b.join(' — ').trim()}});
   const refresh=()=>{text.hidden=source.value!=='paste';const n=items().length;count.textContent=n?(Math.min(n,free)+' will be placed'+(n>free?' (the house has room for '+free+')':'')):''};
   source.onchange=refresh;text.oninput=refresh;refresh();
   const row=el('div','pe-actions');row.append(button('Place them',()=>{const made=P.autoPlace(palace,items());dialog.close();if(made.length){S.tab='route';commit();toast_('Placed '+made.length+' around the house')}},'primary'),button('Cancel',()=>dialog.close()));
   dialog.append(source,text,count,row);dialog.addEventListener('close',()=>dialog.remove());root.append(dialog);dialog.showModal();
  }

  // ── Reading a stop (and recalling it) ────────────────────────────────────
  function resolve(station){
   // what a stop says now: its linked vocab word or question if there is one, else what was written
   if(station.link?.kind==='vocab'){const w=(state.vocab||[]).find(x=>x.id===station.link.id);if(w)return {title:w.term,detail:w.meaning,image:station.image}}
   return {title:station.title,detail:station.detail,image:station.image};
  }
  function showCard(f,station){
   hud.classList.remove('is-on');card.replaceChildren();const r=resolve(station);
   card.append(el('small','pe-card-where',furnitureName(f)+' · '+roomNameOf(f)),r.title?rich('h3',r.title):el('h3','','(empty)'));
   if(r.detail)card.append(rich('p',r.detail));
   if(r.image)card.append(rich('p',r.image,'pe-card-image'));
   card.append(button('✕',()=>hideCard(),'pe-x','Close'));card.hidden=false;S.station=station.id;overlay();
  }
  function hideCard(){card.hidden=true;S.station=null;overlay()}
  function startRecall(){
   const list=P.route(palace);if(!list.length){toast_('Leave something on the furniture first');S.tab='route';renderSide();return}
   if(ctl.getMode()!=='walk')setMode('walk');
   lookOff();toFrontDoor();
   S.recall={i:0,shown:false,ok:0,miss:0,list};recallStep();
  }
  function stopRecall(summary=true){if(!S.recall)return;S.recall=null;recallBox.hidden=true;recallBox.replaceChildren();overlay();if(summary&&ctl.getMode()==='walk'&&!S.edit)lookOn()}
  function recallStep(){
   const rc=S.recall;if(!rc)return;hideCard();hud.classList.remove('is-on');recallBox.replaceChildren();recallBox.hidden=false;
   if(rc.i>=rc.list.length){
    palace.walks=[{t:Date.now(),ok:rc.ok,total:rc.list.length},...(palace.walks||[])].slice(0,30);persist();
    recallBox.append(el('h3','',rc.ok+' of '+rc.list.length+' remembered'),el('p','pe-hint',rc.ok===rc.list.length?'You walked the whole house without a miss.':'The ones you missed are worth another walk.'));
    const row=el('div','pe-actions');row.append(button('Walk again',()=>{S.recall={i:0,shown:false,ok:0,miss:0,list:P.route(palace)};recallStep()},'primary'),button('Done',()=>{stopRecall()}));recallBox.append(row);return;
   }
   const station=rc.list[rc.i];
   if((station.level||0)!==P.levelOf(palace))goLevel(station.level||0,true);
   const f=palace.furniture.find(g=>g.id===station.furnitureId),thing=station.propId?P.propsOf(palace).find(g=>g.id===station.propId):null;if(!f||(station.propId&&!thing)){rc.i++;recallStep();return}
   S.station=station.id;overlay();ctl.flyTo(P.viewFrom(palace,f),1000);
   recallBox.append(el('small','pe-card-where','Stop '+(rc.i+1)+' of '+rc.list.length+' · '+furnitureName(f)+' · '+roomNameOf(f)),el('h3','','What did you leave here?'));
   const r=resolve(station);
   if(!rc.shown){
    recallBox.append(el('p','pe-hint','Picture it before you look.'),button('Show me',()=>{rc.shown=true;recallStep()},'primary'));
   }else{
    const answer=el('div','pe-answer'),strong=el('strong');strong.append(PalaceBook.typeset(r.title||'(empty)'));answer.append(strong);recallBox.append(answer);
    if(r.detail)recallBox.append(rich('p',r.detail,'pe-answer-detail'));
    if(r.image)recallBox.append(rich('p',r.image,'pe-card-image'));
    if(thing&&P.PROPS[thing.type].read&&(thing.pages||[]).some(g=>g.text))recallBox.append(button('Open it',()=>readProp(thing,false),'pe-link'));
    const row=el('div','pe-actions');
    const mark=ok=>{station.stats={ok:(station.stats?.ok||0)+(ok?1:0),miss:(station.stats?.miss||0)+(ok?0:1),last:Date.now()};if(ok)rc.ok++;else rc.miss++;rc.i++;rc.shown=false;persist();recallStep()};
    row.append(button('I remembered',()=>mark(true),'primary'),button('Not yet',()=>mark(false)));recallBox.append(row);
   }
   const nav=el('div','pe-recall-nav');nav.append(button('Stop',()=>stopRecall(),'pe-link'));recallBox.append(nav);
  }

  // ── Pointer and keyboard on the canvas ───────────────────────────────────
  const at=event=>{const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top}};
  // Where a piece would end up if dropped at (x,z): {next, ok}
  function candidate(f,x,z){
   let next={...f,x:P.snap(x,.25),z:P.snap(z,.25)};
   if(P.layerOf(f)==='wall'){const spot=P.wallSpot(palace,f.type,x,z);if(!spot)return {next:null,ok:false};next={...f,x:spot.x,z:spot.z,rot:spot.rot}}
   else next=P.flush(palace,next);
   return {next,ok:P.canPlace(palace,next,f.id)};
  }
  const rectOf=(a,b)=>({x0:Math.min(a.x,b.x),z0:Math.min(a.z,b.z),x1:Math.max(a.x,b.x),z1:Math.max(a.z,b.z)});
  function select(kind,id){S.prop=null;S.furniture=kind==='furniture'?id:null;S.room=kind==='room'?id:null;if(kind&&S.tab==='build')S.tab='selected';S.station=null;renderSide();overlay()}
  canvas.addEventListener('pointerdown',event=>{
   canvas.setPointerCapture?.(event.pointerId);canvas.focus();const p=at(event);
   if(ctl.getMode()==='walk'){S.drag=S.look?{type:'lookclick'}:{type:'look',x:p.x,y:p.y,moved:false};return}
   const w=ctl.toWorld(p.x,p.y);
   if(event.button===1||event.button===2||S.space||event.altKey){S.drag={type:'pan',x:p.x,y:p.y};return}
   if(S.tool==='room'){const s={x:P.snap(w.x),z:P.snap(w.z)};S.drag={type:'draw',start:s,x:p.x,y:p.y};return}
   if(S.tool!=='select'){S.drag={type:'click',x:p.x,y:p.y};return}
   // resizing the selected room by an edge or corner
   const handle=S.room?ctl.pickHandle(p.x,p.y,S.room):null;
   if(handle){S.drag={type:'resize',handle,x:p.x,y:p.y};return}
   const q=(S.furniture||S.prop)?ctl.pickProp(p.x,p.y):null;
   if(q&&(q.hostId===S.furniture)){selectProp(q.id);S.drag={type:'moveProp',id:q.id,x:p.x,y:p.y,moved:false};return}
   const f=ctl.pickFurniture(p.x,p.y);
   if(f){select('furniture',f.id);S.drag={type:'move',id:f.id,dx:f.x-w.x,dz:f.z-w.z,x:p.x,y:p.y,moved:false};return}
   const room=ctl.pickRoom(p.x,p.y);
   if(room&&room.id===S.room){S.drag={type:'moveRoom',id:room.id,start:{x:P.snap(w.x),z:P.snap(w.z)},x:p.x,y:p.y,moved:false};return}
   if(room){select('room',room.id);S.drag={type:'pan',x:p.x,y:p.y,click:true};return}
   select(null);S.drag={type:'pan',x:p.x,y:p.y,click:true};
  });
  canvas.addEventListener('pointermove',event=>{
   const p=at(event),d=S.drag;S.lastPoint=p;
   if(ctl.getMode()==='walk'){
    if(d?.type==='look'){const dx=p.x-d.x,dy=p.y-d.y;if(Math.abs(dx)+Math.abs(dy)>3)d.moved=true;if(d.moved){ctl.lookBy(dx,dy,d.x,d.y);d.x=p.x;d.y=p.y;canvas.style.cursor='grabbing'}}
    else if(!d&&!S.look)walkHover(p);
    if(S.look&&!bridge&&document.pointerLockElement===canvas)window.marginMouseLook(event.movementX||0,event.movementY||0);
    return;
   }
   const w=ctl.toWorld(p.x,p.y);if(!w)return;
   if(!d){
    // hover: what would a click do?
    if(['door','window','arch'].includes(S.tool)){const c=ctl.pickWall(p.x,p.y);overlay({wall:c});canvas.style.cursor=c?'pointer':'default'}
    else if(S.tool==='select'){const f=ctl.pickFurniture(p.x,p.y);overlay({hover:f?.id});const h=S.room?ctl.pickHandle(p.x,p.y,S.room):null;canvas.style.cursor=h?(h.left||h.right?(h.top||h.bottom?'nwse-resize':'ew-resize'):'ns-resize'):f?'grab':'default'}
    return;
   }
   if(d.type==='pan'){ctl.panBy(p.x-d.x,p.y-d.y);d.x=p.x;d.y=p.y;d.click=false;return}
   if(d.type==='moveProp'){if(Math.abs(p.x-d.x)+Math.abs(p.y-d.y)>3)d.moved=true;if(d.moved){const h=ctl.pickFurniture(p.x,p.y);overlay({hover:h?.id});canvas.style.cursor='grabbing'}return}
   if(d.type==='move'){
    const f=palace.furniture.find(g=>g.id===d.id);if(!f)return;if(Math.abs(p.x-d.x)+Math.abs(p.y-d.y)>3)d.moved=true;if(!d.moved)return;
    const c=candidate(f,w.x+d.dx,w.z+d.dz);d.cand=c;
    if(c.next){const fp=P.footprint(c.next);overlay({ghost:{...fp,ok:c.ok}})}else overlay();
    canvas.style.cursor='grabbing';return;
   }
   if(d.type==='draw'){const cur={x:P.snap(w.x),z:P.snap(w.z)},r=rectOf(d.start,cur),room={x:r.x0,z:r.z0,w:r.x1-r.x0,d:r.z1-r.z0};d.rect=room;overlay({draw:{...r,ok:P.validRoom(palace,room)}});return}
   if(d.type==='resize'){
    const r=d.handle.room;let x0=r.x,z0=r.z,x1=r.x+r.w,z1=r.z+r.d;const s={x:P.snap(w.x),z:P.snap(w.z)};
    if(d.handle.left)x0=Math.min(s.x,x1-2);if(d.handle.right)x1=Math.max(s.x,x0+2);if(d.handle.top)z0=Math.min(s.z,z1-2);if(d.handle.bottom)z1=Math.max(s.z,z0+2);
    d.next={x:x0,z:z0,w:x1-x0,d:z1-z0};d.moved=true;
    const ok=P.validRoom(palace,d.next,r.id)&&!palace.furniture.some(f=>{const keep={...r};Object.assign(r,d.next);const bad=!P.fitsInRoom(palace,f);Object.assign(r,keep);return bad});
    overlay({draw:{x0,z0,x1,z1,ok}});return;
   }
   if(d.type==='moveRoom'){
    if(Math.abs(p.x-d.x)+Math.abs(p.y-d.y)>3)d.moved=true;if(!d.moved)return;
    const r=palace.rooms.find(g=>g.id===d.id),dx=P.snap(w.x)-d.start.x,dz=P.snap(w.z)-d.start.z,next={...r,x:r.x+dx,z:r.z+dz};d.delta={dx,dz};
    overlay({draw:{x0:next.x,z0:next.z,x1:next.x+next.w,z1:next.z+next.d,ok:P.validRoom(palace,next,r.id)}});
   }
  });
  canvas.addEventListener('pointerup',event=>{
   const p=at(event),d=S.drag;S.drag=null;canvas.style.cursor='';if(!d)return;
   if(d.type==='lookclick'){walkClick(centre(),event);return}
   if(d.type==='look'){
    if(d.moved){canvas.style.cursor='';return}
    if(bridge&&!S.edit&&!S.look&&!reading&&!S.recall&&!S.placing){lookOn();return}   // a click on the free mouse just takes it back
    walkClick(p,event);
    if(!S.edit&&!S.look&&!reading&&!S.placing&&!S.recall)lookOn();
    return;
   }
   if(d.type==='pan'){if(d.click&&!S.room&&!S.furniture)overlay();return}
   if(d.type==='click'){
    const c=ctl.pickWall(p.x,p.y);if(c&&c.kind!==undefined){
     const added=P.toggleOpening(palace,{axis:c.axis,at:c.at,i:c.i,kind:S.tool});
     if(!added&&P.openingAt(palace,c.axis,c.at,c.i))toast_('There is no room for it there');commit();
    }return;
   }
   if(d.type==='moveProp'){
    if(d.moved){
     const host=ctl.pickFurniture(p.x,p.y),w=ctl.toWorld(p.x,p.y),q=P.propsOf(palace).find(g=>g.id===d.id);
     if(host&&q&&w){const t=localOf(host,w.x,w.z);if(P.moveProp(palace,q.id,host.id,{surface:host.id===q.hostId?q.surface:undefined,lx:t.lx,lz:t.lz}))commit();else{toast_('There is no room for it there');overlay()}}else overlay();
    }
    return;
   }
   if(d.type==='move'){
    const f=palace.furniture.find(g=>g.id===d.id);
    if(f&&d.moved&&d.cand?.ok&&d.cand.next){f.x=d.cand.next.x;f.z=d.cand.next.z;f.rot=d.cand.next.rot;commit()}else{overlay()}
    return;
   }
   if(d.type==='draw'){
    let r=d.rect;
    if(!r||r.w<1||r.d<1){const w=ctl.toWorld(p.x,p.y);r={x:P.snap(w.x-2),z:P.snap(w.z-2),w:4,d:4}}
    const room=P.addRoom(palace,r);
    if(room){S.room=room.id;S.tool='select';canvas.dataset.tool='select';S.tab='selected';commit()}else{toast_('Rooms need at least 2 × 2 m and can\'t overlap another');overlay()}
    return;
   }
   if(d.type==='resize'){
    if(d.next){const r=d.handle.room,res=P.resizeRoom(palace,r.id,d.next);if(!res)toast_('Move the furniture first, or choose a size that fits');commit()}else overlay();
    return;
   }
   if(d.type==='moveRoom'){
    if(d.moved&&d.delta&&(d.delta.dx||d.delta.dz)){const r=palace.rooms.find(g=>g.id===d.id),moved=P.moveRoom(palace,d.id,r.x+d.delta.dx,r.z+d.delta.dz);if(!moved)toast_('It would overlap another room');commit()}else overlay();
   }
  });
  // ── Walking: what is under the pointer, and what a click does ─────────────
  // Pointing at a book (or a staircase, or a stop) lights it up; while placing, a ghost shows where it would go.
  function walkHover(p){
   p=aimPoint(p);
   if(S.placing){const g=placement(p);S.hover={ghost3:g?g.box:null};S.aimed=g;overlay();canvas.style.cursor=g&&g.ok?'copy':'not-allowed';return}
   const o=ctl.pickProp(p.x,p.y);let cursor='grab',tip='';
   if(o){cursor='pointer';tip=(P.PROPS[o.type].read?'Take it down: ':'')+(o.title||P.PROPS[o.type].name)}
   else if(!S.edit){const f=ctl.pickFurniture(p.x,p.y);if(f&&f.link){cursor='pointer';tip=P.spec(f.type).link==='up'?'Go upstairs':'Go downstairs'}else if(f&&P.stationsOn(palace,f.id).some(s=>!s.propId)){cursor='pointer'}}
   else cursor='default';
   const id=o?o.id:null;
   if((S.hover.hoverProp||null)!==id){S.hover={hoverProp:id};overlay();if(tip)hudShow(tip,1800)}
   canvas.style.cursor=cursor;
  }
  // Where the thing being placed would land if clicked now: {ok, box, place:fn}
  function placement(p){
   const pl=S.placing;if(!pl)return null;
   const a=ctl.aim(p.x,p.y);
   if(pl.kind==='furniture'||pl.kind==='moveF'){
    const base=pl.kind==='moveF'?palace.furniture.find(g=>g.id===pl.id):{id:'?',type:pl.type,x:0,z:0,rot:pl.rot||0,color:P.spec(pl.type).color};if(!base)return null;
    const spec=P.spec(base.type),wall=P.layerOf(base)==='wall',at=wall?a.wall:a.floor;if(!at)return null;
    const c=candidate({...base,rot:pl.kind==='moveF'?base.rot:pl.rot||0},at.x,at.z);if(!c.next)return {ok:false,box:null};
    const fp=P.footprint(c.next),y=spec.lift||0;
    return {ok:c.ok,box:{x0:fp.x0,x1:fp.x1,z0:fp.z0,z1:fp.z1,y0:y,y1:y+spec.h,ok:c.ok},place:()=>pl.kind==='moveF'?P.moveFurniture(palace,base.id,at.x,at.z)&&base:P.placeFurniture(palace,pl.type,at.x,at.z,{rot:pl.rot||0})};
   }
   // a small thing: it goes on whatever furniture is under the pointer, on the shelf or top nearest the spot
   const host=a.furniture;if(!host||!a.point||!P.surfacesOf(host).length)return {ok:false,box:null};
   const levels=P.surfacesOf(host);let surface=0,best=-1e9;
   levels.forEach((l,k)=>{const y=(P.spec(host.type).lift||0)+l.y;if(y<=a.point.y+.2&&y>best){best=y;surface=k}});
   const t=localOf(host,a.point.x,a.point.z);
   const proto=pl.kind==='moveP'?{...P.propsOf(palace).find(g=>g.id===pl.id),hostId:host.id}:{id:'?',type:pl.type,hostId:host.id,rot:0,...(pl.type==='book'?P.bookLike(P.propsOn(palace,host.id).length+2):{})};
   if(!proto.type)return null;
   const slot=P.findPropSlot(palace,proto,{surface,lx:t.lx,lz:t.lz});
   if(!slot)return {ok:false,box:{x0:a.point.x-.06,x1:a.point.x+.06,z0:a.point.z-.06,z1:a.point.z+.06,y0:a.point.y,y1:a.point.y+.12,ok:false}};
   const w=P.propWorld(palace,{...proto,...slot}),turned=(w.rot%180)!==0,hw=(turned?w.d:w.w)/2,hd=(turned?w.w:w.d)/2;
   const opts={...slot,...(pl.type==='book'?{t:proto.t,ht:proto.ht,color:proto.color,title:proto.title,pages:proto.pages}:{})};
   return {ok:true,box:{x0:w.x-hw,x1:w.x+hw,z0:w.z-hd,z1:w.z+hd,y0:w.y,y1:w.y+w.h,ok:true},place:()=>pl.kind==='moveP'?P.moveProp(palace,pl.id,host.id,slot)&&P.propsOf(palace).find(g=>g.id===pl.id):P.placeProp(palace,pl.type,host.id,opts)};
  }
  // In the walk view a click goes to a place, reads a stop, takes a book down, or (building) selects or places.
  function walkClick(p,event){
   p=aimPoint(p);
   if(S.placing){
    const g=placement(p);if(!g||!g.ok||!g.place){toast_('It doesn\'t fit there');return}
    const done=g.place();if(!done){toast_('It doesn\'t fit there');return}
    const pl=S.placing,isProp=pl.kind==='prop'||pl.kind==='moveP'||!!done.hostId;
    if(isProp){S.prop=done.id;S.furniture=done.hostId}else{S.prop=null;S.furniture=done.id}
    S.room=null;if(!(event&&event.shiftKey)||pl.kind.startsWith('move'))S.placing=null;S.hover={};S.tab='selected';commit();return;
   }
   const o=ctl.pickProp(p.x,p.y);
   if(S.edit){
    if(o){selectProp(o.id);return}
    const f=ctl.pickFurniture(p.x,p.y);if(f){select('furniture',f.id);return}
    select(null);
    const r=ctl.ray(p.x,p.y);if(r.dir.y<-.01){const t=-r.origin.y/r.dir.y,x=r.origin.x+r.dir.x*t,z=r.origin.z+r.dir.z*t;if(P.roomAt(palace,x,z))ctl.setTarget(x,z)}
    return;
   }
   if(o){if(P.PROPS[o.type].read)readProp(o);else showPropCard(o);return}
   const f=ctl.pickFurniture(p.x,p.y);
   if(f&&f.link){useStairs(f);return}
   if(f){const stations=P.stationsOn(palace,f.id).filter(s=>!s.propId);if(stations.length){showCard(f,stations[0]);return}hudShow(furnitureName(f)+' · '+roomNameOf(f)+(P.layerOf(f)==='wall'?'':' — nothing left here yet'),2500);return}
   const r=ctl.ray(p.x,p.y);if(r.dir.y<-.01){const t=-r.origin.y/r.dir.y,x=r.origin.x+r.dir.x*t,z=r.origin.z+r.dir.z*t;if(P.roomAt(palace,x,z)){hideCard();ctl.setTarget(x,z)}}
  }
  canvas.addEventListener('wheel',event=>{
   event.preventDefault();const p=at(event);
   if(ctl.getMode()==='walk')return;
   // pinching zooms; a mouse wheel zooms; two fingers sliding pan
   const wheel=event.deltaMode===1||(event.deltaX===0&&Number.isInteger(event.deltaY)&&Math.abs(event.deltaY)>=40);
   if(event.ctrlKey||event.metaKey)ctl.zoomAt(p.x,p.y,Math.exp(-event.deltaY*.01));
   else if(wheel)ctl.zoomAt(p.x,p.y,Math.exp(-event.deltaY*.0025));
   else ctl.panBy(-event.deltaX,-event.deltaY);
  },{passive:false});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('text/palace-type')||event.dataTransfer.types.includes('text/palace-prop')){event.preventDefault();event.dataTransfer.dropEffect='copy'}});
  canvas.addEventListener('drop',event=>{
   const prop=event.dataTransfer.getData('text/palace-prop');
   if(prop&&ctl.getMode()==='plan'){
    event.preventDefault();const p=at(event),w=ctl.toWorld(p.x,p.y),host=ctl.pickFurniture(p.x,p.y);
    if(!host||!P.surfacesOf(host).length){toast_('Drop it onto a table, shelf or other piece of furniture');return}
    const t=localOf(host,w.x,w.z),q=P.placeProp(palace,prop,host.id,{lx:t.lx,lz:t.lz,...(prop==='book'?P.bookLike(P.propsOn(palace,host.id).length+2):{})});
    if(!q){toast_('There is no room left there');return}S.prop=q.id;S.furniture=host.id;S.tab='selected';commit();return;
   }
   const type=event.dataTransfer.getData('text/palace-type');if(!type||ctl.getMode()!=='plan')return;event.preventDefault();
   const p=at(event),w=ctl.toWorld(p.x,p.y),f=P.placeFurniture(palace,type,w.x,w.z);
   if(!f){toast_('That doesn\'t fit there');return}S.furniture=f.id;S.room=null;S.tab='selected';commit();
  });
  const keyName=event=>event.key.length===1?event.key.toLowerCase():event.key.toLowerCase();
  function keydown(event){
   if(!root.isConnected)return;
   if(document.querySelector('dialog[open]')||reading)return;
   const typing=event.target.matches?.('input,textarea,select,[contenteditable]');
   if(event.key==='Escape'){
    if(typing){event.target.blur();return}
    event.preventDefault();
    if(S.look){lookOff();return}
    if(S.recall){stopRecall();return}
    if(S.placing){S.placing=null;S.hover={};overlay();canvas.style.cursor='';return}
    if(!card.hidden){hideCard();return}
    if(ctl.getMode()==='walk'){setMode('plan');return}
    if(S.furniture||S.room){select(null);return}
    if(S.tool!=='select'){S.tool='select';canvas.dataset.tool='select';renderToolbar();return}
    close();return;
   }
   if(typing)return;
   const k=keyName(event),mod=event.metaKey||event.ctrlKey;
   if(ctl.getMode()==='walk'){
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','q','e','shift'].includes(k)&&!mod){event.preventDefault();ctl.setKey(k,true);return}
    if(!S.edit)return;
    if(k==='r'&&S.placing&&S.placing.kind!=='moveF'&&S.placing.kind!=='moveP'){S.placing.rot=((S.placing.rot||0)+90)%360;walkHover(S.lastPoint||{x:canvas.clientWidth/2,y:canvas.clientHeight/2});return}
   }
   if(mod&&k==='z'){event.preventDefault();event.shiftKey?redo.click():undo.click();return}
   if(mod&&k==='d'){event.preventDefault();duplicateSelected();return}
   if(k===' '){S.space=true;event.preventDefault();return}
   if(k==='delete'||k==='backspace'){event.preventDefault();deleteSelected();return}
   if(k==='r'&&!mod){S.prop?rotateProp():rotateSelected();return}
   if(k==='+'||k==='='){ctl.zoomAt(canvas.clientWidth/2,canvas.clientHeight/2,1.2);return}
   if(k==='-'){ctl.zoomAt(canvas.clientWidth/2,canvas.clientHeight/2,1/1.2);return}
   const nudge={arrowleft:[-.25,0],arrowright:[.25,0],arrowup:[0,-.25],arrowdown:[0,.25]}[k];
   if(nudge&&S.prop){event.preventDefault();const q=P.propsOf(palace).find(g=>g.id===S.prop),w=q&&P.propWorld(palace,q);if(w){const t=localOf(w.host,w.x+nudge[0]*.2,w.z+nudge[1]*.2);if(P.moveProp(palace,q.id,q.hostId,{surface:q.surface,lx:t.lx,lz:t.lz}))commit()}return}
   if(nudge&&S.furniture){event.preventDefault();const f=palace.furniture.find(g=>g.id===S.furniture);if(f&&P.moveFurniture(palace,f.id,f.x+nudge[0],f.z+nudge[1]))commit()}
  }
  function keyup(event){const k=keyName(event);if(k===' ')S.space=false;if(ctl?.getMode()==='walk')ctl.setKey(k,false)}
  window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);

  // ── Names and numbers drawn over the picture ─────────────────────────────
  function updateLabels(){
   const items=[];
   if(ctl.getMode()==='plan')for(const r of palace.rooms){const s=ctl.toScreen(r.x+r.w/2,.1,r.z+r.d/2);if(s)items.push({text:r.name,x:s.x,y:s.y,cls:'pe-room-label'})}
   const order=P.route(palace);
   order.forEach((st,k)=>{
    const f=palace.furniture.find(g=>g.id===st.furnitureId);if(!f)return;const spec=P.spec(f.type),pw=st.propId?P.propWorld(palace,P.propsOf(palace).find(g=>g.id===st.propId)||{}):null,top=pw?pw.y+pw.h+(ctl.getMode()==='plan'?.55:.22):(spec.lift||0)+spec.h+(ctl.getMode()==='plan'?.55:.4),s=ctl.toScreen(pw?pw.x:f.x,top,pw?pw.z:f.z);
    if(s)items.push({text:String(k+1),x:s.x,y:s.y,cls:'pe-stop-label'+(S.station===st.id?' is-on':'')});
   });
   while(S.labelNodes.length<items.length){const n=el('div');labels.append(n);S.labelNodes.push(n)}
   S.labelNodes.forEach((n,i)=>{const item=items[i];if(!item){n.hidden=true;return}n.hidden=false;if(n.textContent!==item.text)n.textContent=item.text;if(n.className!==item.cls)n.className=item.cls;n.style.transform='translate('+Math.round(item.x)+'px,'+Math.round(item.y)+'px) translate(-50%,-50%)'});
  }

  // ── Opening and closing ──────────────────────────────────────────────────
  const bgColour=hexOf(getComputedStyle(document.body).backgroundColor);
  ctl=Palace3D.mount(canvas,palace,{background:bgColour,onFrame:updateLabels});
  if(!ctl){
   stage.replaceChildren(el('p','pe-nogl','3D isn\'t available on this Mac\'s graphics, so the palace can\'t be shown.'));
  }else{canvas.tabIndex=0;canvas.dataset.tool='select';root.dataset.mode='plan'}
  const resizer=new ResizeObserver(()=>ctl?.redraw());resizer.observe(stage);
  function close(){
   lookOff();document.removeEventListener('pointerlockchange',lockChange);if(window.marginMouseLook)window.marginMouseLook=null;stopRecall(false);window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);resizer.disconnect();ctl?.dispose();root.remove();editor=null;
   if(subject&&window.marginSubjectTab)window.marginSubjectTab(subject.id,'palace');
  }
  editor={toFrontDoor,close,palace,ctl,S,commit,select,selectProp,goLevel,useStairs,setEdit,addLevel,addStairs,placement,walkHover,addProp,readProp,reader:()=>reading,history,addFurniture,startRecall,setMode,root,candidate,fillDialog,rotateSelected,deleteSelected,duplicateSelected};
  renderTop();renderSide();renderToolbar();overlay();
  requestAnimationFrame(()=>{ctl?.frame();canvas.focus()});
 }
 window.marginPalace={open:openEditor,editor:()=>editor,create:(subjectId,starter=true)=>{const palace=starter?P.starterHouse(subjectId,'Starter house'):P.blank(subjectId,'My palace');palaces().unshift(palace);persist();return palace}};
})();
