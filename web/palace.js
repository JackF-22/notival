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
  stage.append(canvas,labels,toolbar,hud,card,recallBox);
  const body=el('div','pe-body');body.append(stage,side);root.append(top,body);document.body.append(root);

  const S={tool:'select',tab:'build',room:null,furniture:null,station:null,drag:null,space:false,recall:null,labelNodes:[],hudTimer:0,collapsed:false};
  let ctl=null;
  const toast_=message=>window.toast?.(message);
  const furnitureName=f=>P.spec(f.type)?.name||f.type;
  const roomNameOf=f=>P.roomOf(palace,f)?.name||'';

  // Record a change for undo and saving, then redraw everything.
  function commit(){
   if(history.record())persist();
   ctl?.rebuild();renderTop();renderSide();overlay();
  }
  function overlay(extra={}){ctl?.setOverlay({room:S.room,furniture:S.furniture,station:S.station,...extra})}

  // ── The top bar ──────────────────────────────────────────────────────────
  const nameInput=el('input','pe-name');nameInput.value=palace.name;nameInput.setAttribute('aria-label','Palace name');
  nameInput.onchange=()=>{palace.name=nameInput.value.trim()||'My palace';commit()};
  const modeButtons={};
  const undo=button('↶',()=>{if(history.undo()){persist();S.furniture=S.furniture&&palace.furniture.some(f=>f.id===S.furniture)?S.furniture:null;S.room=S.room&&palace.rooms.some(r=>r.id===S.room)?S.room:null;ctl.rebuild();renderTop();renderSide();overlay()}},'pe-icon','Undo (⌘Z)');
  const redo=button('↷',()=>{if(history.redo()){persist();ctl.rebuild();renderTop();renderSide();overlay()}},'pe-icon','Redo (⇧⌘Z)');
  function renderTop(){
   top.replaceChildren();
   const modes=el('div','pe-modes');
   for(const [id,label] of [['plan','Plan'],['walk','Walk']]){const b=button(label,()=>setMode(id),'pe-mode');b.setAttribute('aria-pressed',String(ctl?.getMode()===id));modeButtons[id]=b;modes.append(b)}
   undo.disabled=!history.canUndo();redo.disabled=!history.canRedo();
   top.append(button('← Back',()=>close(),'pe-back','Back to the subject'),nameInput,modes,undo,redo,el('span','pe-spacer'),button('Recall walk',()=>startRecall(),'pe-walk primary','Walk the route and recall what you left at each stop'));
  }
  function setMode(mode){
   if(!ctl||ctl.getMode()===mode)return;
   stopRecall(false);hideCard();ctl.setMode(mode);
   root.dataset.mode=mode;
   if(mode==='walk'){S.tool='select';hudShow('Drag to look · W A S D or arrows to walk · click the floor to go there · click a glowing marker to read it · Esc to go back')}
   renderTop();renderSide();renderToolbar();overlay();
  }
  function hudShow(text,ms=7000){hud.textContent=text;hud.classList.add('is-on');clearTimeout(S.hudTimer);S.hudTimer=setTimeout(()=>hud.classList.remove('is-on'),ms)}

  // The building tools sit over the plan so they are always to hand.
  const TOOLS=[['select','Select','Click to select; drag to move'],['room','Room','Drag out a new room'],['door','Door','Click a wall to add or remove a door'],['window','Window','Click a wall to add or remove a window'],['arch','Archway','Click a wall to add or remove an open archway']];
  function renderToolbar(){
   toolbar.replaceChildren();
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
   const groups=new Map();for(const [type,spec] of Object.entries(P.CATALOG)){if(!groups.has(spec.cat))groups.set(spec.cat,[]);groups.get(spec.cat).push([type,spec])}
   box.append(el('small','pe-hint','Click a piece to add it, or drag it onto the plan.'));
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
  }
  function addFurniture(type){
   const room=palace.rooms.find(r=>r.id===S.room)||palace.rooms.find(r=>r.id===P.roomAt(palace,ctl.plan.cx,ctl.plan.cz)?.id)||palace.rooms[0];
   if(!room){toast_('Add a room first');return}
   const spot=P.findSpot(palace,type,room.id);if(!spot){toast_('There is no room left in '+room.name+' for that');return}
   const f=P.placeFurniture(palace,type,spot.x,spot.z);if(!f){toast_('That doesn\'t fit there');return}
   S.furniture=f.id;S.room=null;S.tab='selected';commit();
  }
  function swatches(current,colours,onPick){
   const row=el('div','pe-swatches');
   for(const c of colours){const b=button('',()=>onPick(c),'pe-colour');b.style.background=c;b.title=c;b.setAttribute('aria-pressed',String(c.toLowerCase()===String(current).toLowerCase()));row.append(b)}
   const custom=el('input','pe-colour-input');custom.type='color';custom.value=/^#[0-9a-f]{6}$/i.test(current)?current:'#808080';custom.setAttribute('aria-label','Any colour');custom.oninput=()=>onPick(custom.value);row.append(custom);
   return row;
  }
  function renderSelected(box){
   const f=palace.furniture.find(g=>g.id===S.furniture),r=palace.rooms.find(g=>g.id===S.room);
   if(f){
    const spec=P.spec(f.type);
    box.append(el('h3','pe-title',spec.name),el('small','pe-hint',roomNameOf(f)));
    const row=el('div','pe-actions');
    if(P.layerOf(f)!=='wall')row.append(button('Rotate',()=>rotateSelected(),'','Turn 90° (R)'));
    row.append(button('Duplicate',()=>duplicateSelected(),'','Copy it next to this one (⌘D)'),button('Delete',()=>deleteSelected(),'pe-danger','Remove it (Delete)'));
    box.append(row);
    box.append(el('small','pe-label','Colour'),swatches(f.color,P.TINTS,c=>{P.recolour(palace,f.id,c);commit()}));
    const same=Object.entries(P.CATALOG).filter(([t,s])=>(s.layer||'floor')===P.layerOf(f)&&t!==f.type);
    const swap=el('select','pe-select');swap.setAttribute('aria-label','Swap for another piece');const first=el('option','','Swap for…');first.value='';swap.append(first);
    for(const [t,s] of same){const o=el('option','',s.name);o.value=t;swap.append(o)}
    swap.onchange=()=>{if(!swap.value)return;if(!P.swapFurniture(palace,f.id,swap.value))toast_('That one doesn\'t fit here');commit()};
    box.append(el('small','pe-label','Change it'),swap);
    renderStations(box,f);
   }else if(r){
    box.append(el('h3','pe-title','Room'));
    const name=el('input','pe-input');name.value=r.name;name.setAttribute('aria-label','Room name');name.onchange=()=>{r.name=name.value.trim()||r.name;commit()};box.append(name);
    box.append(el('small','pe-hint',r.w+' × '+r.d+' m · drag the edges and corners to resize, or drag inside to move it'));
    box.append(el('small','pe-label','Floor'),swatches(r.floor,P.FLOORS,c=>{r.floor=c;commit()}),el('small','pe-label','Walls'),swatches(r.wall,P.WALLS,c=>{r.wall=c;commit()}));
    const row=el('div','pe-actions');row.append(button('Delete room',()=>deleteRoom(r),'pe-danger'));box.append(row);
   }else box.append(el('p','pe-hint','Select a piece of furniture or a room to change it, or to leave something there to remember.'));
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
   if(S.furniture){const f=palace.furniture.find(g=>g.id===S.furniture);if(!f)return;const n=P.stationsOn(palace,f.id).length;if(n&&!confirmAgain('f'+f.id,'This holds '+n+' thing'+(n===1?'':'s')+' to remember. Press Delete again to remove it all.'))return;P.removeFurniture(palace,S.furniture);S.furniture=null;S.station=null;commit()}
   else if(S.room){const r=palace.rooms.find(g=>g.id===S.room);if(r)deleteRoom(r)}
  }

  // ── Things to remember ───────────────────────────────────────────────────
  function stationFields(station){
   const wrap=el('div','pe-station');
   const title=el('input','pe-input');title.placeholder='What to remember';title.value=station.title;title.setAttribute('aria-label','What to remember');
   const detail=el('input','pe-input');detail.placeholder='Meaning or note (optional)';detail.value=station.detail;detail.setAttribute('aria-label','Meaning or note');
   const image=el('textarea','pe-input');image.rows=2;image.placeholder='Picture it: a silly, vivid image that ties it to this spot (optional)';image.value=station.image||'';image.setAttribute('aria-label','Vivid image');
   const save=()=>{station.title=title.value.trim();station.detail=detail.value.trim();station.image=image.value.trim();station.link=station.link;commit()};
   for(const f of [title,detail,image])f.onchange=save;
   const head=el('div','pe-station-head');head.append(el('b','','Stop '+(P.route(palace).findIndex(s=>s.id===station.id)+1)),station.link?el('small','pe-linked',station.link.kind==='vocab'?'from your vocab':'from your questions'):el('span'),button('✕',()=>{P.removeStation(palace,station.id);S.station=null;commit()},'pe-x','Remove this'));
   wrap.append(head,title,detail,image);return wrap;
  }
  function renderStations(box,f){
   box.append(el('small','pe-label','Left here'));
   for(const s of P.stationsOn(palace,f.id))box.append(stationFields(s));
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
    const open=button('',()=>{S.furniture=s.furnitureId;S.station=s.id;S.room=null;S.tab='selected';if(f&&ctl.getMode()==='plan'){ctl.plan.cx=f.x;ctl.plan.cz=f.z}renderSide();overlay()},'pe-route-open');
    open.append(el('b','',String(k+1)),el('span','pe-route-title',s.title||'(empty)'),el('small','',f?furnitureName(f)+' · '+roomNameOf(f):''));
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
   card.append(el('small','pe-card-where',furnitureName(f)+' · '+roomNameOf(f)),el('h3','',r.title||'(empty)'));
   if(r.detail)card.append(el('p','',r.detail));
   if(r.image)card.append(el('p','pe-card-image','“'+r.image+'”'));
   card.append(button('✕',()=>hideCard(),'pe-x','Close'));card.hidden=false;S.station=station.id;overlay();
  }
  function hideCard(){card.hidden=true;S.station=null;overlay()}
  function startRecall(){
   const list=P.route(palace);if(!list.length){toast_('Leave something on the furniture first');S.tab='route';renderSide();return}
   if(ctl.getMode()!=='walk')setMode('walk');
   S.recall={i:0,shown:false,ok:0,miss:0,list};recallStep();
  }
  function stopRecall(summary=true){if(!S.recall)return;S.recall=null;recallBox.hidden=true;recallBox.replaceChildren();overlay()}
  function recallStep(){
   const rc=S.recall;if(!rc)return;hideCard();hud.classList.remove('is-on');recallBox.replaceChildren();recallBox.hidden=false;
   if(rc.i>=rc.list.length){
    palace.walks=[{t:Date.now(),ok:rc.ok,total:rc.list.length},...(palace.walks||[])].slice(0,30);persist();
    recallBox.append(el('h3','',rc.ok+' of '+rc.list.length+' remembered'),el('p','pe-hint',rc.ok===rc.list.length?'You walked the whole house without a miss.':'The ones you missed are worth another walk.'));
    const row=el('div','pe-actions');row.append(button('Walk again',()=>{S.recall={i:0,shown:false,ok:0,miss:0,list:P.route(palace)};recallStep()},'primary'),button('Done',()=>{stopRecall()}));recallBox.append(row);return;
   }
   const station=rc.list[rc.i],f=palace.furniture.find(g=>g.id===station.furnitureId);if(!f){rc.i++;recallStep();return}
   S.station=station.id;overlay();ctl.flyTo(P.viewFrom(palace,f),1000);
   recallBox.append(el('small','pe-card-where','Stop '+(rc.i+1)+' of '+rc.list.length+' · '+furnitureName(f)+' · '+roomNameOf(f)),el('h3','','What did you leave here?'));
   const r=resolve(station);
   if(!rc.shown){
    recallBox.append(el('p','pe-hint','Picture it before you look.'),button('Show me',()=>{rc.shown=true;recallStep()},'primary'));
   }else{
    const answer=el('div','pe-answer');answer.append(el('strong','',r.title||'(empty)'));recallBox.append(answer);
    if(r.detail)recallBox.append(el('p','pe-answer-detail',r.detail));
    if(r.image)recallBox.append(el('p','pe-card-image','“'+r.image+'”'));
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
  function select(kind,id){S.furniture=kind==='furniture'?id:null;S.room=kind==='room'?id:null;if(kind&&S.tab==='build')S.tab='selected';S.station=null;renderSide();overlay()}
  canvas.addEventListener('pointerdown',event=>{
   canvas.setPointerCapture?.(event.pointerId);canvas.focus();const p=at(event);
   if(ctl.getMode()==='walk'){S.drag={type:'look',x:p.x,y:p.y,moved:false};return}
   const w=ctl.toWorld(p.x,p.y);
   if(event.button===1||event.button===2||S.space||event.altKey){S.drag={type:'pan',x:p.x,y:p.y};return}
   if(S.tool==='room'){const s={x:P.snap(w.x),z:P.snap(w.z)};S.drag={type:'draw',start:s,x:p.x,y:p.y};return}
   if(S.tool!=='select'){S.drag={type:'click',x:p.x,y:p.y};return}
   // resizing the selected room by an edge or corner
   const handle=S.room?ctl.pickHandle(p.x,p.y,S.room):null;
   if(handle){S.drag={type:'resize',handle,x:p.x,y:p.y};return}
   const f=ctl.pickFurniture(p.x,p.y);
   if(f){select('furniture',f.id);S.drag={type:'move',id:f.id,dx:f.x-w.x,dz:f.z-w.z,x:p.x,y:p.y,moved:false};return}
   const room=ctl.pickRoom(p.x,p.y);
   if(room&&room.id===S.room){S.drag={type:'moveRoom',id:room.id,start:{x:P.snap(w.x),z:P.snap(w.z)},x:p.x,y:p.y,moved:false};return}
   if(room){select('room',room.id);S.drag={type:'pan',x:p.x,y:p.y,click:true};return}
   select(null);S.drag={type:'pan',x:p.x,y:p.y,click:true};
  });
  canvas.addEventListener('pointermove',event=>{
   const p=at(event),d=S.drag;
   if(ctl.getMode()==='walk'){
    if(d?.type==='look'){const dx=p.x-d.x,dy=p.y-d.y;if(Math.abs(dx)+Math.abs(dy)>3)d.moved=true;if(d.moved){ctl.lookBy(dx,dy);d.x=p.x;d.y=p.y}}
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
   if(d.type==='look'){
    if(!d.moved)walkClick(p);return;
   }
   if(d.type==='pan'){if(d.click&&!S.room&&!S.furniture)overlay();return}
   if(d.type==='click'){
    const c=ctl.pickWall(p.x,p.y);if(c&&c.kind!==undefined){
     const added=P.toggleOpening(palace,{axis:c.axis,at:c.at,i:c.i,kind:S.tool});
     if(!added&&P.openingAt(palace,c.axis,c.at,c.i))toast_('There is no room for it there');commit();
    }return;
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
  // In the walk view a click goes to a place, or reads a stop.
  function walkClick(p){
   const f=ctl.pickFurniture(p.x,p.y);
   if(f){const stations=P.stationsOn(palace,f.id);if(stations.length){showCard(f,stations[0]);return}hudShow(furnitureName(f)+' · '+roomNameOf(f)+(P.layerOf(f)==='wall'?'':' — nothing left here yet'),2500);return}
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
  canvas.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('text/palace-type')){event.preventDefault();event.dataTransfer.dropEffect='copy'}});
  canvas.addEventListener('drop',event=>{
   const type=event.dataTransfer.getData('text/palace-type');if(!type||ctl.getMode()!=='plan')return;event.preventDefault();
   const p=at(event),w=ctl.toWorld(p.x,p.y),f=P.placeFurniture(palace,type,w.x,w.z);
   if(!f){toast_('That doesn\'t fit there');return}S.furniture=f.id;S.room=null;S.tab='selected';commit();
  });
  const keyName=event=>event.key.length===1?event.key.toLowerCase():event.key.toLowerCase();
  function keydown(event){
   if(!root.isConnected)return;
   if(document.querySelector('dialog[open]'))return;
   const typing=event.target.matches?.('input,textarea,select,[contenteditable]');
   if(event.key==='Escape'){
    if(typing){event.target.blur();return}
    event.preventDefault();
    if(S.recall){stopRecall();return}
    if(!card.hidden){hideCard();return}
    if(ctl.getMode()==='walk'){setMode('plan');return}
    if(S.furniture||S.room){select(null);return}
    if(S.tool!=='select'){S.tool='select';canvas.dataset.tool='select';renderToolbar();return}
    close();return;
   }
   if(typing)return;
   const k=keyName(event),mod=event.metaKey||event.ctrlKey;
   if(ctl.getMode()==='walk'){if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','q','e','shift'].includes(k)){event.preventDefault();ctl.setKey(k,true)}return}
   if(mod&&k==='z'){event.preventDefault();event.shiftKey?redo.click():undo.click();return}
   if(mod&&k==='d'){event.preventDefault();duplicateSelected();return}
   if(k===' '){S.space=true;event.preventDefault();return}
   if(k==='delete'||k==='backspace'){event.preventDefault();deleteSelected();return}
   if(k==='r'&&!mod){rotateSelected();return}
   if(k==='+'||k==='='){ctl.zoomAt(canvas.clientWidth/2,canvas.clientHeight/2,1.2);return}
   if(k==='-'){ctl.zoomAt(canvas.clientWidth/2,canvas.clientHeight/2,1/1.2);return}
   const nudge={arrowleft:[-.25,0],arrowright:[.25,0],arrowup:[0,-.25],arrowdown:[0,.25]}[k];
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
    const f=palace.furniture.find(g=>g.id===st.furnitureId);if(!f)return;const spec=P.spec(f.type),top=(spec.lift||0)+spec.h+(ctl.getMode()==='plan'?.55:.4),s=ctl.toScreen(f.x,top,f.z);
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
   stopRecall(false);window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);resizer.disconnect();ctl?.dispose();root.remove();editor=null;
   if(subject&&window.marginSubjectTab)window.marginSubjectTab(subject.id,'palace');
  }
  editor={close,palace,ctl,S,commit,select,history,addFurniture,startRecall,setMode,root,candidate,fillDialog,rotateSelected,deleteSelected,duplicateSelected};
  renderTop();renderSide();renderToolbar();overlay();
  requestAnimationFrame(()=>{ctl?.frame();canvas.focus()});
 }
 window.marginPalace={open:openEditor,editor:()=>editor,create:(subjectId,starter=true)=>{const palace=starter?P.starterHouse(subjectId,'Starter house'):P.blank(subjectId,'My palace');palaces().unshift(palace);persist();return palace}};
})();
