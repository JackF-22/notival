// Class mode: a quiet writing surface for a lecture, with a tree that grows while you are here.
// You can always leave. Time away just doesn't grow the tree, and "looking something up" doesn't count against you.
// Bookkeeping lives in focus-model.js, drawing in tree-art.js; this file is the window.
(()=>{
 const M=FocusModel,TICK=1000,CHECKPOINT_EVERY=60,RETURN_CUE_AFTER=10*1000,CUE_HIDE_AFTER=16*1000;
 const $=selector=>document.querySelector(selector);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const button=(label,onclick,cls='',title='')=>{const b=el('button',cls,label);b.type='button';b.onclick=onclick;if(title)b.title=title;return b};
 let live=null,timer=0,ticks=0,nativeActive=null,probeOverride=null,sidebarWasOpen=true;
 let hud=null,cue=null,cueTimer=0,park=null,lastCaret=null,treeStage='';

 // ── Is the window with you right now? ──────────────────────────────────────
 // The desktop app reports whether Notival is the active app (so clicking its PDF pane doesn't look like leaving);
 // in a plain browser the page's own focus is the best signal there is.
 window.notivalAppActive=active=>{nativeActive=!!active;if(live)tick()};
 const present=()=>probeOverride?probeOverride():!document.hidden&&(nativeActive===null?document.hasFocus():nativeActive);

 const subjectOf=id=>(state.projects||[]).find(p=>p.id===id)||null;
 const colourOf=id=>subjectOf(id)?.color||'#4a9d6f';
 const treeFor=(record,size,label)=>TreeArt.svg({seed:record.seed,growth:M.growth(record.focusedMs),density:M.density(record.ratio??M.ratio(record)),color:colourOf(record.subjectId)},{size,label});

 // ── Where you were, so coming back doesn't mean starting over ──────────────
 function rememberCaret(){
  const selection=getSelection();if(!selection?.rangeCount||!selection.anchorNode)return;
  const node=selection.anchorNode,host=(node.nodeType===1?node:node.parentElement)?.closest?.('#editor .rich-text');if(!host)return;
  const range=document.createRange();range.selectNodeContents(host);range.setEnd(node,selection.anchorOffset);
  const words=range.toString().replace(/\s+/g,' ').trim();
  lastCaret={cell:host.closest('.block'),tail:words.slice(-170)};
 }
 document.addEventListener('selectionchange',()=>{if(live)rememberCaret()});
 function whereYouWere(){
  if(lastCaret?.tail)return lastCaret.tail;
  const last=(current()?.blocks||[]).filter(b=>b.type==='text'&&String(b.text||'').trim()).at(-1);
  return last?Knowledge.prose(last.text).replace(/\s+/g,' ').trim().slice(-170):'';
 }

 // ── Buttons in the header ──────────────────────────────────────────────────
 const classButton=button('Class',()=>live?null:begin(),'',  'Class mode: a quiet page and a tree that grows while you stay');
 classButton.id='class-mode-toggle';
 const gardenButton=button('Garden',()=>openGarden(),'','Your trees, class by class');gardenButton.id='garden-open';
 const anchor=$('#focus-writing-toggle')||$('#sidebar-toggle');
 if(anchor)anchor.after(classButton,gardenButton);else document.querySelector('header')?.append(classButton,gardenButton);

 // ── Starting and ending a class ────────────────────────────────────────────
 function begin(){
  const note=current();if(!note){toast('Open a note first, then start class mode.');return}
  live=M.start({subjectId:note.projectId||null,noteId:note.id});
  lastCaret=null;ticks=0;treeStage='';
  sidebarWasOpen=!document.body.classList.contains('sidebar-collapsed');
  setSidebarCollapsed(true);document.body.classList.add('class-mode');
  buildHud();timer=setInterval(()=>tick(),TICK);tick();
  const first=$('#editor .rich-text');first?.focus();
 }
 async function end(){
  if(!live)return;
  const record=M.finish(live,Date.now());
  clearInterval(timer);live=null;hideCue();closePark();hud?.remove();hud=null;
  document.body.classList.remove('class-mode');if(sidebarWasOpen)setSidebarCollapsed(false);
  (state.focusSessions??=[]).push(record);delete state.focusLive;persist();
  summary(record);
 }

 // ── The clock ──────────────────────────────────────────────────────────────
 function tick(now=Date.now()){
  syncButtons();
  if(!live){recoverInterrupted();return}
  const wasAway=!!live.away;
  M.advance(live,now,present());
  if(wasAway&&!live.away&&live.lastEpisode.ms>=RETURN_CUE_AFTER)showCue(live.lastEpisode);
  paintHud(now);
  if(++ticks%CHECKPOINT_EVERY===0){state.focusLive=JSON.parse(JSON.stringify(live));persist()}
 }
 setInterval(()=>{if(!live)tick()},TICK*5);
 function syncButtons(){
  const show=!!current()&&document.body.dataset.view==='note'&&!live;
  classButton.hidden=!show;gardenButton.hidden=!!live||!current();
 }
 // A class that was running when the app closed still counts: end it where the clock last ran.
 function recoverInterrupted(){
  const stale=state?.focusLive;if(!stale)return;
  delete state.focusLive;
  if(stale.focusedMs+stale.awayMs<M.MINUTE)return;
  (state.focusSessions??=[]).push(M.finish(stale,stale.last));persist();
 }

 // ── The strip at the top ───────────────────────────────────────────────────
 function buildHud(){
  hud=el('div');hud.id='class-hud';hud.setAttribute('role','region');hud.setAttribute('aria-label','Class mode');
  const treeBox=el('div','hud-tree'),time=el('div','hud-time'),strong=el('strong','','0:00'),label=el('small','','focused');time.append(strong,label);
  const away=el('div','hud-away');away.hidden=true;
  const lookup=button('Looking something up',()=>{M.beginLookup(live,live.last);toast('Go ahead. The next few minutes away won’t count against you.');paintHud(live.last)},'hud-lookup','Tell Notival you’re stepping out to look something up. That time won’t count against your tree.');
  const parkButton=button('Park a thought',()=>openPark(),'hud-park','Jot down a stray thought and get straight back (⌘⇧P)');
  const stop=button('End class',()=>end(),'hud-end');
  hud.append(treeBox,time,away,lookup,parkButton,stop);
  document.body.append(hud);
 }
 function paintHud(now){
  if(!hud||!live)return;
  const stage=M.stage(live.focusedMs);
  if(stage!==treeStage||ticks%15===0){treeStage=stage;hud.querySelector('.hud-tree').innerHTML=treeFor({...live,ratio:M.ratio(live)},54,'Your tree: '+stage.toLowerCase())}
  hud.querySelector('.hud-time strong').textContent=M.duration(live.focusedMs);
  hud.querySelector('.hud-time small').textContent=stage.toLowerCase()+' · '+Math.round(M.ratio(live)*100)+'%';
  const away=hud.querySelector('.hud-away'),bits=[];
  if(live.awayCount)bits.push('Away '+live.awayCount+'× · '+M.duration(live.awayMs));
  if(live.lookups)bits.push(live.lookups+(live.lookups===1?' lookup':' lookups'));
  away.hidden=!bits.length;away.textContent=bits.join(' · ');
  const looking=live.lookupUntil>now,lookup=hud.querySelector('.hud-lookup');
  lookup.textContent=looking?'Lookup window · '+M.duration(live.lookupUntil-now):'Looking something up';lookup.classList.toggle('is-open',looking);
  hud.querySelector('.hud-park').textContent=live.parked.length?'Park a thought ('+live.parked.length+')':'Park a thought';
 }

 // ── Welcome back ───────────────────────────────────────────────────────────
 function showCue(episode){
  hideCue();
  cue=el('div');cue.id='class-cue';cue.setAttribute('role','status');
  const quote=whereYouWere();
  cue.append(el('strong','','Welcome back'),el('span','cue-away','Away '+M.duration(episode.ms)+(episode.lookupMs&&!episode.awayMs?' · lookup':'')));
  if(quote){cue.append(el('small','','You were here:'),el('q','',quote))}
  const row=el('div','cue-actions');
  if(episode.awayMs>0)row.append(button('That was a lookup',()=>{M.reclassify(live);hideCue();paintHud(live.last)},'','Count that time as a lookup instead of time away'));
  row.append(button('Back to it',hideCue,'primary'));cue.append(row);
  document.body.append(cue);
  cueTimer=setTimeout(hideCue,CUE_HIDE_AFTER);
  const cell=lastCaret?.cell;if(cell?.isConnected){cell.classList.add('resume-flash');setTimeout(()=>cell.classList.remove('resume-flash'),1800)}
 }
 function hideCue(){clearTimeout(cueTimer);cue?.remove();cue=null}

 // ── Parking a thought ──────────────────────────────────────────────────────
 function openPark(){
  if(!live||park)return;
  const selection=getSelection(),saved=selection?.rangeCount?selection.getRangeAt(0).cloneRange():null;
  park=el('form');park.id='class-park';
  const input=el('input');input.type='text';input.placeholder='A stray thought, to deal with after class';input.setAttribute('aria-label','Park a thought');input.maxLength=240;
  park.append(input,button('Park',()=>park.requestSubmit(),'primary'));
  park.onsubmit=event=>{event.preventDefault();const text=input.value.trim();if(text){live.parked.push({t:Date.now(),text});toast('Parked. It’ll be waiting after class.');paintHud(live.last)}closePark(saved)};
  input.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();closePark(saved)}};
  document.body.append(park);input.focus();
 }
 function closePark(restore){
  park?.remove();park=null;
  const range=restore;if(!range||!range.startContainer.isConnected)return;
  const host=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement)?.closest('.rich-text');
  host?.focus();const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
 }
 document.addEventListener('keydown',event=>{
  if(live&&(event.metaKey||event.ctrlKey)&&event.shiftKey&&event.key.toLowerCase()==='p'){event.preventDefault();park?closePark():openPark()}
 });

 // ── How it went ────────────────────────────────────────────────────────────
 function dialog(cls,heading){
  document.querySelector('dialog.'+cls)?.remove();
  const box=el('dialog','class-dialog '+cls);box.setAttribute('aria-label',heading);
  box.addEventListener('close',()=>box.remove());document.body.append(box);return box;
 }
 function summary(record){
  const box=dialog('class-summary','Class finished'),subject=subjectOf(record.subjectId);
  const art=el('div','summary-tree');art.innerHTML=treeFor(record,170,'Your tree: '+M.stage(record.focusedMs).toLowerCase());
  const head=el('div','summary-head');head.append(el('small','',(subject?.name||'Class')+' · '+new Date(record.endedAt).toLocaleDateString(undefined,{weekday:'long'})),el('h2','',M.stage(record.focusedMs)+' · '+M.minutesLabel(record.focusedMs)+' focused'),el('p','',M.verdict(record)));
  const facts=el('dl','summary-facts');
  const fact=(name,value)=>{facts.append(el('dt','',name),el('dd','',value))};
  fact('Here',Math.round(record.ratio*100)+'%');fact('Away',record.awayCount?record.awayCount+(record.awayCount===1?' time · ':' times · ')+M.duration(record.awayMs):'not once');
  if(record.lookups)fact('Lookups',record.lookups+' · '+M.duration(record.lookupMs)+', not counted against you');
  const top=el('div','summary-top');top.append(art,head);box.append(top,facts);
  let add=null;
  if(record.parked.length){
   const parked=el('div','summary-parked');parked.append(el('h3','','Parked during class'));
   const list=el('ul');for(const item of record.parked)list.append(el('li','',item.text));parked.append(list);
   const label=el('label','summary-add');add=el('input');add.type='checkbox';add.checked=true;label.append(add,' Add these to the note');parked.append(label);box.append(parked);
  }
  // However the dialog closes (Done, Escape, the garden link), parked thoughts the writer kept ticked go into the note.
  box.addEventListener('close',()=>finishSummary(record,add));
  const actions=el('div','summary-actions');
  actions.append(button('See my garden',()=>{box.close();openGarden()}),button('Done',()=>box.close(),'primary'));
  box.append(actions);box.showModal();actions.lastChild.focus();
 }
 function finishSummary(record,add){
  if(!add?.checked||!record.parked.length)return;
  const note=state.notes.find(n=>n.id===record.noteId);if(!note)return;
  const markdown='## Parked in class\n\n'+record.parked.map(p=>'- '+p.text).join('\n');
  note.blocks.push({id:uid(),type:'text',text:markdown,html:RichEditor.fromMarkdown(markdown)});
  note.updated=Date.now();persist();if(current()?.id===note.id)render();
 }

 // ── The garden ─────────────────────────────────────────────────────────────
 function openGarden(){
  const sessions=(state.focusSessions||[]).slice().sort((a,b)=>b.endedAt-a.endedAt),stats=M.gardenStats(sessions);
  const box=dialog('garden-dialog','Garden');
  const head=el('div','garden-head');head.append(el('h2','','Your garden'),button('Close',()=>box.close(),'garden-close'));box.append(head);
  if(!sessions.length){
   const empty=el('div','garden-empty');empty.innerHTML=TreeArt.svg({seed:3,growth:.04,density:1},{size:96,label:'A sprout'});
   empty.append(el('p','','Nothing planted yet. Start class mode in a note, and the first tree grows while you write.'));box.append(empty);
  }else{
   box.append(el('p','garden-week','This week: '+M.minutesLabel(stats.weekFocusedMs)+' focused across '+stats.weekCount+(stats.weekCount===1?' class':' classes')+'.'));
   if(stats.subjects.length>1||stats.subjects[0]?.subjectId){
    const bars=el('div','garden-subjects');
    for(const s of stats.subjects){
     const name=subjectOf(s.subjectId)?.name||'No subject',row=el('div','garden-subject');
     const bar=el('span','garden-bar'),fill=el('i');fill.style.width=Math.round(s.ratio*100)+'%';fill.style.background=colourOf(s.subjectId);bar.append(fill);
     row.append(el('span','garden-name',name),bar,el('span','garden-pct',Math.round(s.ratio*100)+'% here · '+s.count+(s.count===1?' class':' classes')));bars.append(row);
    }
    box.append(bars);
   }
   const grid=el('div','garden-grid');
   for(const record of sessions.slice(0,80)){
    const tile=el('figure','garden-tile');tile.innerHTML=treeFor(record,104,M.stage(record.focusedMs));
    const when=new Date(record.endedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'});
    tile.append(el('figcaption','',(subjectOf(record.subjectId)?.name||'Class')+' · '+when+' · '+M.minutesLabel(record.focusedMs)+' · '+Math.round(record.ratio*100)+'%'));grid.append(tile);
   }
   box.append(grid);
  }
  box.showModal();
 }

 window.marginClass={begin,end,tick,openGarden,session:()=>live,setProbe:fn=>{probeOverride=fn},isLive:()=>!!live};
 new MutationObserver(syncButtons).observe(document.body,{attributes:true,attributeFilter:['data-view']});   // opening or leaving a note
 setInterval(syncButtons,TICK*2);syncButtons();
})();
