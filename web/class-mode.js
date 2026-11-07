// Class mode: you tell Notival how long the class is, the window goes full screen, and a countdown runs while you write.
// You can always leave. Time away just doesn't count as focus, and "looking something up" doesn't count against you.
// Bookkeeping lives in focus-model.js, drawing in tree-art.js; this file is the window.
(()=>{
 const M=FocusModel,TICK=1000,CHECKPOINT_EVERY=60,RETURN_CUE_AFTER=10*1000,CUE_HIDE_AFTER=16*1000,LOW_MS=5*M.MINUTE,EXTRA_MS=10*M.MINUTE;
 const LENGTHS=[30,45,50,60,75,90];
 const $=selector=>document.querySelector(selector);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const button=(label,onclick,cls='',title='')=>{const b=el('button',cls,label);b.type='button';b.onclick=onclick;if(title)b.title=title;return b};
 const remember=(key,value)=>{try{localStorage.setItem('notival.class.'+key,JSON.stringify(value))}catch{}};
 const recall=(key,fallback)=>{try{const raw=localStorage.getItem('notival.class.'+key);return raw==null?fallback:JSON.parse(raw)}catch{return fallback}};
 let live=null,timer=0,ticks=0,nativeActive=null,probeOverride=null,sidebarWasOpen=true;
 let hud=null,cue=null,cueTimer=0,park=null,timeUp=null,lastCaret=null;
 let fullscreenOn=false,weEnteredFullscreen=false;const fullscreenLog=[];

 // ── Is the window with you right now? ──────────────────────────────────────
 // The desktop app reports whether Notival is the active app (so clicking its PDF pane doesn't look like leaving);
 // in a plain browser the page's own focus is the best signal there is.
 window.notivalAppActive=active=>{nativeActive=!!active;if(live)tick()};
 const present=()=>probeOverride?probeOverride():!document.hidden&&(nativeActive===null?document.hasFocus():nativeActive);

 const subjectOf=id=>(state.projects||[]).find(p=>p.id===id)||null;
 const colourOf=id=>subjectOf(id)?.color||'#4a9d6f';
 const treeFor=(record,size,label)=>TreeArt.svg({seed:record.seed,growth:M.growth(record.focusedMs),density:M.density(record.ratio??M.ratio(record)),color:colourOf(record.subjectId)},{size,label});
 const wordsIn=note=>(note?.blocks||[]).reduce((n,b)=>n+(b.type==='text'?(String(b.text||'').match(/\S+/g)||[]).length:0),0);

 // ── Full screen: the whole display, so nothing else is in view ─────────────
 function setFullscreen(on){
  fullscreenLog.push(on);
  try{
   if(bridge)bridge.postMessage({type:'fullscreen',on});
   else if(on)document.documentElement.requestFullscreen?.().catch(()=>{});
   else if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});
  }catch{}
 }
 // It can also change by the person's own hand (Esc in a browser, ⌃⌘F on a Mac); the class carries on either way.
 window.notivalFullscreen=on=>{fullscreenOn=!!on;if(live)paintHud(live.last)};
 document.addEventListener('fullscreenchange',()=>{fullscreenOn=!!document.fullscreenElement;if(live)paintHud(live.last)});

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
 const classButton=button('Class',()=>live?null:openStart(),'','Start a class: full screen, a timer, and a page with nothing else on it');
 classButton.id='class-mode-toggle';
 // One "Focus" entry in the header instead of three buttons. The original Focus and Class buttons stay in the page
 // (hidden) as the things the menu presses, so their behaviour lives in one place each.
 const focusToggle=$('#focus-writing-toggle'),anchor=focusToggle||$('#sidebar-toggle');
 const focusMenu=button('Focus',()=>toggleFocusMenu(),'','Focus: a quiet page, or start a class');
 focusMenu.id='focus-menu';focusMenu.setAttribute('aria-haspopup','menu');focusMenu.setAttribute('aria-expanded','false');
 if(anchor)anchor.after(classButton,focusMenu);else document.querySelector('header')?.append(classButton,focusMenu);
 let focusPopover=null;
 function closeFocusMenu(refocus){
  if(!focusPopover)return;
  focusPopover.remove();focusPopover=null;focusMenu.setAttribute('aria-expanded','false');
  document.removeEventListener('pointerdown',outsideFocusMenu,true);document.removeEventListener('keydown',keyFocusMenu,true);
  if(refocus)focusMenu.focus();
 }
 const outsideFocusMenu=event=>{if(!focusPopover?.contains(event.target)&&!focusMenu.contains(event.target))closeFocusMenu()};
 const keyFocusMenu=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeFocusMenu(true)}};
 function toggleFocusMenu(){
  // While the quiet page is on, the button simply turns it off.
  if(document.body.classList.contains('focus-writing')){focusToggle?.click();return}
  if(focusPopover){closeFocusMenu(true);return}
  focusPopover=el('div','focus-popover');focusPopover.setAttribute('role','menu');
  const item=(name,hint,action)=>{const b=el('button','focus-item');b.type='button';b.setAttribute('role','menuitem');b.append(el('b','',name),el('small','',hint));b.onclick=()=>{closeFocusMenu();action()};return b};
  focusPopover.append(
   item('Quiet page','Hide everything but your note',()=>focusToggle?.click()),
   item('Start a class…','Full screen, a timer, and live stats',()=>classButton.click())
  );
  document.body.append(focusPopover);
  const box=focusMenu.getBoundingClientRect();
  focusPopover.style.top=Math.round(box.bottom+6)+'px';focusPopover.style.left=Math.round(Math.max(8,Math.min(box.left,innerWidth-focusPopover.offsetWidth-8)))+'px';
  focusMenu.setAttribute('aria-expanded','true');
  focusPopover.querySelector('button').focus();
  document.addEventListener('pointerdown',outsideFocusMenu,true);document.addEventListener('keydown',keyFocusMenu,true);
 }

 // ── Starting: how long is the class? ───────────────────────────────────────
 function openStart(){
  const note=current();if(!note){toast('Open a note first, then start a class.');return}
  const box=dialog('class-start','Start class'),subject=subjectOf(note.projectId);
  let minutes=recall('minutes',50);
  box.append(el('h2','','Start class'),el('p','class-start-sub',(subject?(subject.icon?subject.icon+' ':'')+subject.name+' · ':'')+(note.title||'Untitled note')));
  box.append(el('p','class-start-q','How long is your class?'));
  const chips=el('div','length-chips');chips.setAttribute('role','radiogroup');chips.setAttribute('aria-label','Class length');
  const custom=el('input','length-custom');custom.type='number';custom.min='1';custom.max='480';custom.placeholder='other';custom.setAttribute('aria-label','Class length in minutes');
  const paint=()=>{for(const chip of chips.children){const on=Number(chip.dataset.minutes)===minutes;chip.setAttribute('aria-checked',String(on));chip.classList.toggle('on',on)}custom.classList.toggle('on',!!custom.value&&Number(custom.value)===minutes)};
  for(const m of [...LENGTHS,0]){
   const chip=button(m?m+' min':'No timer',()=>{minutes=m;custom.value='';paint()},'length-chip');
   chip.dataset.minutes=String(m);chip.setAttribute('role','radio');chips.append(chip);
  }
  custom.oninput=()=>{const v=Math.round(Number(custom.value));if(v>=1&&v<=480){minutes=v}paint()};
  chips.append(custom,el('span','length-unit','min'));
  box.append(chips);
  if(minutes&&!LENGTHS.includes(minutes))custom.value=String(minutes);
  paint();
  const fs=el('label','class-start-fs'),fsBox=el('input');fsBox.type='checkbox';fsBox.checked=recall('fullscreen',true);fs.append(fsBox,' Go full screen');box.append(fs);
  const go=()=>{remember('minutes',minutes);remember('fullscreen',fsBox.checked);box.close();begin(minutes,{fullscreen:fsBox.checked})};
  custom.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();go()}};
  const actions=el('div','class-start-actions');actions.append(button('Cancel',()=>box.close()),button('Start class',go,'primary'));
  box.append(actions);box.showModal();actions.lastChild.focus();
 }

 function begin(minutes=0,{fullscreen=true}={}){
  const note=current();if(!note||live)return;
  live=M.start({subjectId:note.projectId||null,noteId:note.id,plannedMs:minutes*M.MINUTE,wordsAtStart:wordsIn(note)});
  lastCaret=null;ticks=0;
  sidebarWasOpen=!document.body.classList.contains('sidebar-collapsed');
  setSidebarCollapsed(true);document.body.classList.add('class-mode');
  weEnteredFullscreen=false;
  if(fullscreen&&!fullscreenOn){weEnteredFullscreen=true;setFullscreen(true)}
  buildHud();timer=setInterval(()=>tick(),TICK);tick();
  $('#editor .rich-text')?.focus();
 }
 function end(){
  if(!live)return;
  const note=state.notes.find(n=>n.id===live.noteId);
  live.wordsAdded=Math.max(0,wordsIn(note)-live.wordsAtStart);
  const record=M.finish(live,Date.now());
  clearInterval(timer);live=null;hideCue();closePark();closeTimeUp();hud?.remove();hud=null;
  document.body.classList.remove('class-mode');if(sidebarWasOpen)setSidebarCollapsed(false);
  if(weEnteredFullscreen)setFullscreen(false);weEnteredFullscreen=false;
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
  live.wordsAdded=Math.max(0,wordsIn(state.notes.find(n=>n.id===live.noteId))-live.wordsAtStart);
  if(live.plannedMs&&M.remaining(live,now)<=0&&!live.timeUpShown){live.timeUpShown=true;showTimeUp()}
  paintHud(now);
  if(++ticks%CHECKPOINT_EVERY===0){state.focusLive=JSON.parse(JSON.stringify(live));persist()}
 }
 setInterval(()=>{if(!live)tick()},TICK*5);
 function syncButtons(){
  const show=!!current()&&document.body.dataset.view==='note'&&!live;
  classButton.hidden=!show;focusMenu.hidden=!show;
  focusMenu.textContent=document.body.classList.contains('focus-writing')?'Exit focus':'Focus ▾';
  if(!show)closeFocusMenu();
 }
 // A class that was running when the app closed still counts: end it where the clock last ran.
 function recoverInterrupted(){
  const stale=state?.focusLive;if(!stale)return;
  delete state.focusLive;
  if(stale.focusedMs+stale.awayMs<M.MINUTE)return;
  (state.focusSessions??=[]).push(M.finish(stale,stale.last));persist();
 }

 // ── The strip at the top: time, then how it's going ────────────────────────
 function buildHud(){
  hud=el('div');hud.id='class-hud';hud.setAttribute('role','region');hud.setAttribute('aria-label','Class timer and stats');
  const clock=el('div','hud-clock'),big=el('strong','hud-left','0:00'),label=el('small','hud-label','');
  const bar=el('div','hud-bar');bar.append(el('i'));clock.append(big,label,bar);
  const stats=el('div','hud-stats');
  for(const [key,name] of [['here','here'],['away','away'],['lookups','looked up'],['words','written']]){
   const stat=el('div','hud-stat');stat.dataset.stat=key;stat.append(el('b','','–'),el('small','',name));stats.append(stat);
  }
  const actions=el('div','hud-actions');
  actions.append(
   button('Looking something up',()=>{M.beginLookup(live,live.last);toast('Go ahead. The next few minutes away won’t count against you.');paintHud(live.last)},'hud-lookup','Tell Notival you’re stepping out to look something up. That time won’t count against you.'),
   button('Park a thought',()=>openPark(),'hud-park','Jot down a stray thought and get straight back (⌘⇧P)'),
   button('Full screen',()=>setFullscreen(!fullscreenOn),'hud-fullscreen','Enter or leave full screen'),
   button('End class',()=>end(),'hud-end')
  );
  hud.append(clock,stats,actions);document.body.append(hud);
 }
 function paintHud(now){
  if(!hud||!live)return;
  const rem=M.remaining(live,now),clock=hud.querySelector('.hud-clock');
  const left=hud.querySelector('.hud-left'),label=hud.querySelector('.hud-label');
  if(rem===null){left.textContent=M.duration(M.elapsed(live,now));label.textContent='into class · no timer'}
  else if(rem>0){left.textContent=M.duration(rem);label.textContent='left of '+Math.round(live.plannedMs/M.MINUTE)+' min'}
  else{left.textContent='+'+M.duration(-rem);label.textContent='past the planned '+Math.round(live.plannedMs/M.MINUTE)+' min'}
  clock.classList.toggle('is-low',rem!==null&&rem>0&&rem<=LOW_MS);clock.classList.toggle('is-over',rem!==null&&rem<=0);
  hud.querySelector('.hud-bar i').style.width=(rem===null?0:Math.round(M.progress(live,now)*100))+'%';
  hud.querySelector('.hud-bar').hidden=rem===null;
  const set=(key,value,sub)=>{const stat=hud.querySelector('[data-stat='+key+']');stat.querySelector('b').textContent=value;if(sub)stat.querySelector('small').textContent=sub};
  set('here',Math.round(M.ratio(live)*100)+'%');
  set('away',live.awayCount?live.awayCount+'× · '+M.duration(live.awayMs):'0');
  set('lookups',String(live.lookups));
  set('words','+'+live.wordsAdded);
  const looking=live.lookupUntil>now,lookup=hud.querySelector('.hud-lookup');
  lookup.textContent=looking?'Lookup window · '+M.duration(live.lookupUntil-now):'Looking something up';lookup.classList.toggle('is-open',looking);
  hud.querySelector('.hud-park').textContent=live.parked.length?'Park a thought ('+live.parked.length+')':'Park a thought';
  hud.querySelector('.hud-fullscreen').textContent=fullscreenOn?'Exit full screen':'Full screen';
 }

 // ── Time's up ──────────────────────────────────────────────────────────────
 function chime(){
  try{
   const audio=new (window.AudioContext||window.webkitAudioContext)(),now=audio.currentTime;
   [[660,0],[880,.22]].forEach(([hz,at])=>{const osc=audio.createOscillator(),gain=audio.createGain();osc.frequency.value=hz;gain.gain.setValueAtTime(0,now+at);gain.gain.linearRampToValueAtTime(.12,now+at+.03);gain.gain.exponentialRampToValueAtTime(.0001,now+at+.7);osc.connect(gain).connect(audio.destination);osc.start(now+at);osc.stop(now+at+.75)});
   setTimeout(()=>audio.close(),1500);
  }catch{}
 }
 function showTimeUp(){
  closeTimeUp();chime();
  timeUp=el('div');timeUp.id='class-timeup';timeUp.setAttribute('role','alertdialog');timeUp.setAttribute('aria-label','Class time is up');
  timeUp.append(el('strong','','Class time is up'),el('span','','You planned '+Math.round(live.plannedMs/M.MINUTE)+' minutes. Finish here, or keep going.'));
  const row=el('div','cue-actions');
  row.append(button('Keep going',closeTimeUp),button('10 more minutes',()=>{M.extend(live,EXTRA_MS);live.timeUpShown=false;closeTimeUp();paintHud(live.last)}),button('End class',()=>end(),'primary'));
  timeUp.append(row);document.body.append(timeUp);row.lastChild.focus();
 }
 function closeTimeUp(){timeUp?.remove();timeUp=null}

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
  const head=el('div','summary-head');
  head.append(el('small','',(subject?.name||'Class')+' · '+new Date(record.endedAt).toLocaleDateString(undefined,{weekday:'long'})),el('h2','','Class finished'),el('p','',M.verdict(record)));
  const art=el('div','summary-tree');art.innerHTML=treeFor(record,110,'Your tree: '+M.stage(record.focusedMs).toLowerCase());
  const top=el('div','summary-top');top.append(head,art);
  const facts=el('dl','summary-facts');
  const fact=(name,value)=>{facts.append(el('dt','',name),el('dd','',value))};
  const total=record.endedAt-record.startedAt;
  fact('Class length',M.duration(total)+(record.plannedMs?' of '+Math.round(record.plannedMs/M.MINUTE)+' min planned':''));
  fact('Focused',M.duration(record.focusedMs)+' · '+Math.round(record.ratio*100)+'% of the time you were here or away');
  fact('Away',record.awayCount?record.awayCount+(record.awayCount===1?' time · ':' times · ')+M.duration(record.awayMs):'not once');
  if(record.lookups)fact('Lookups',record.lookups+' · '+M.duration(record.lookupMs)+', not counted against you');
  fact('Written','+'+record.wordsAdded+' words');
  box.append(top,facts);
  let add=null;
  if(record.parked.length){
   const parked=el('div','summary-parked');parked.append(el('h3','','Parked during class'));
   const list=el('ul');for(const item of record.parked)list.append(el('li','',item.text));parked.append(list);
   const label=el('label','summary-add');add=el('input');add.type='checkbox';add.checked=true;label.append(add,' Add these to the note');parked.append(label);box.append(parked);
  }
  // However the dialog closes (Done, Escape, the garden link), parked thoughts the writer kept ticked go into the note.
  box.addEventListener('close',()=>finishSummary(record,add));
  const actions=el('div','summary-actions');
  actions.append(button('Done',()=>box.close(),'primary'));
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
   empty.append(el('p','','Nothing planted yet. Finish a class and its tree appears here.'));box.append(empty);
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

 window.marginClass={begin,end,openStart,tick,openGarden,session:()=>live,setProbe:fn=>{probeOverride=fn},isLive:()=>!!live,fullscreenLog,showTimeUp};
 new MutationObserver(syncButtons).observe(document.body,{attributes:true,attributeFilter:['data-view','class']});   // opening or leaving a note, or the quiet page turning on
 setInterval(syncButtons,TICK*2);syncButtons();
})();
