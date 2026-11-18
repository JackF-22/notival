// The garden page: everything you have grown, a bed for each subject, and what you have harvested.
// Plants come from finished classes (state.focusSessions); drawing them is class-mode's and garden-art's job.
(()=>{
 const M=FocusModel;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const button=(label,onclick,cls='')=>{const b=el('button',cls,label);b.type='button';b.onclick=onclick;return b};
 const kit=()=>window.marginGardenKit;
 const day=ms=>new Date(ms).toLocaleDateString(undefined,{month:'short',day:'numeric'});
 let page=null,nav=null;

 function place(){
  if(!page)return;
  const aside=document.querySelector('aside'),open=aside&&aside.offsetParent!==null;
  page.style.left=(open?Math.round(aside.getBoundingClientRect().right):0)+'px';
 }
 const onKey=event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){event.preventDefault();close()}};

 function open(){
  if(!page){
   page=el('section','garden-page');page.id='garden-page';page.setAttribute('aria-label','Your garden');
   document.body.append(page);
   addEventListener('resize',place);
   new MutationObserver(place).observe(document.body,{attributes:true,attributeFilter:['class']});
   // Choosing anything in the sidebar takes you back to your notes.
   document.querySelector('aside')?.addEventListener('click',event=>{if(page&&!page.hidden&&!nav.contains(event.target)&&!event.target.closest('input,label'))close()},true);
  }
  paint();page.hidden=false;place();nav?.classList.add('active');nav?.setAttribute('aria-current','page');
  document.addEventListener('keydown',onKey);page.querySelector('.gp-back').focus({preventScroll:true});
 }
 function close(){
  if(!page||page.hidden)return;
  page.hidden=true;nav?.classList.remove('active');nav?.removeAttribute('aria-current');document.removeEventListener('keydown',onKey);
  page.replaceChildren();                                  // nothing animates, or costs anything, while it is away
 }

 function paint(){
  const sessions=(state.focusSessions||[]).slice().sort((a,b)=>b.endedAt-a.endedAt),stats=M.gardenStats(sessions);
  page.replaceChildren();
  const head=el('header','gp-head'),title=el('div','gp-title');
  title.append(el('h1','','Your garden'),el('p','gp-sub',sessions.length?'Every class grows something. Stay with it and it thrives.':'Plants grow while you focus in class.'));
  head.append(button('← Back',close,'gp-back'),title);page.append(head);

  const body=el('div','gp-body');page.append(body);
  if(!sessions.length){
   const empty=el('div','gp-empty');
   empty.innerHTML=GardenArt.svg({plant:'sunflower',seed:3,growth:.3,density:1},{size:150,label:'A young sunflower',still:true});
   const words=el('div');words.append(el('h2','','Nothing planted yet'),el('p','','Start a class from the Focus menu. Pick what to grow, stay with your notes, and it will be here when you finish.'));
   empty.append(words);body.append(empty);return;
  }

  const total=sessions.reduce((n,r)=>n+r.focusedMs,0),away=sessions.reduce((n,r)=>n+r.awayMs,0),here=total+away?Math.round(total/(total+away)*100):100;
  const tiles=el('div','gp-stats');
  const stat=(value,label)=>{const box=el('div','gp-stat');box.append(el('b','',value),el('small','',label));tiles.append(box)};
  stat(String(sessions.length),sessions.length===1?'plant grown':'plants grown');
  stat(M.minutesLabel(stats.weekFocusedMs),'focused this week');
  stat(M.minutesLabel(total),'focused in all');
  stat(here+'%','of the time here');
  body.append(tiles);

  if(stats.harvested.length){
   const basket=el('section','gp-harvest');basket.append(el('h2','','Harvest'));
   const row=el('div','gp-harvest-row');
   for(const item of stats.harvested){
    const chip=el('div','gp-harvest-item'),art=el('span','gp-harvest-art');
    art.innerHTML=GardenArt.svg({plant:item.plant,seed:7,growth:1,density:1},{size:44,label:'',still:true});
    chip.append(art,el('b','',String(item.count)),el('span','',item.noun));row.append(chip);
   }
   basket.append(row);body.append(basket);
  }

  // One bed for each subject, the one you have spent most time in first.
  const beds=new Map();
  for(const r of sessions){const key=r.subjectId||'';(beds.get(key)||beds.set(key,[]).get(key)).push(r)}
  for(const subject of stats.subjects){
   const list=beds.get(subject.subjectId||'')||[],info=kit().subjectOf(subject.subjectId);
   const bed=el('section','gp-bed');bed.style.setProperty('--bed',kit().colourOf(subject.subjectId));
   const top=el('div','gp-bed-head'),name=el('h2','',(info?.icon?info.icon+' ':'')+(info?.name||'No subject'));
   const meter=el('span','gp-meter'),fill=el('i');fill.style.width=Math.round(subject.ratio*100)+'%';meter.append(fill);
   top.append(name,el('small','',list.length+(list.length===1?' plant · ':' plants · ')+M.minutesLabel(subject.focusedMs)+' · '+Math.round(subject.ratio*100)+'% here'),meter);
   const grid=el('div','gp-grid');
   for(const record of list){
    const tile=button('','','gp-tile'),kind=M.plantOf(record.plant),h=M.harvest(record);
    tile.onclick=()=>detail(record);
    const art=el('span','gp-tile-art');art.innerHTML=kit().plantFor(record,132);
    tile.append(art,el('b','',kind.name),el('small','',M.stage(record.focusedMs,record.plant)+(h?' · '+h.count+' '+h.noun:'')),el('small','gp-when',day(record.endedAt)+' · '+M.minutesLabel(record.focusedMs)));
    tile.setAttribute('aria-label',kind.name+', '+M.stage(record.focusedMs,record.plant)+', '+day(record.endedAt));
    grid.append(tile);
   }
   bed.append(top,grid);body.append(bed);
  }
 }

 // One plant up close.
 function detail(record){
  document.querySelector('dialog.garden-detail')?.remove();
  const box=el('dialog','class-dialog garden-detail'),kind=M.plantOf(record.plant),info=kit().subjectOf(record.subjectId),h=M.harvest(record);
  box.setAttribute('aria-label',kind.name);box.addEventListener('close',()=>box.remove());
  const art=el('div','gd-art');art.innerHTML=kit().plantFor(record,230,{still:false});
  const text=el('div','gd-text');
  text.append(el('small','',(info?.name||'Class')+' · '+new Date(record.endedAt).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})),el('h2','',kind.name),el('p','gd-stage',M.stage(record.focusedMs,record.plant)));
  const facts=el('dl','summary-facts');
  const fact=(k,v)=>{facts.append(el('dt','',k),el('dd','',v))};
  fact('Focused',M.minutesLabel(record.focusedMs)+' of '+M.minutesLabel(record.endedAt-record.startedAt));
  fact('Here',Math.round(record.ratio*100)+'% of the time'+(record.awayCount?', away '+record.awayCount+(record.awayCount===1?' time':' times'):''));
  if(record.wordsAdded)fact('Written','+'+record.wordsAdded+' words');
  if(h)fact('Harvest',h.count+' '+h.noun);
  text.append(facts,el('p','gd-note',M.verdict(record)));
  const actions=el('div','summary-actions');actions.append(button('Close',()=>box.close(),'primary'));
  const row=el('div','gd-row');row.append(art,text);box.append(row,actions);
  document.body.append(box);box.showModal();actions.lastChild.focus();
 }

 // A "Garden" entry among the sidebar's workspace links.
 const pinned=document.querySelector('#pinned');
 if(pinned){
  nav=el('button','nav');nav.id='garden-nav';nav.type='button';nav.innerHTML='✿ &nbsp; Garden';
  nav.title='Everything you have grown in class';nav.onclick=()=>page&&!page.hidden?close():open();
  pinned.after(nav);
 }
 window.marginGarden={open,close,isOpen:()=>!!page&&!page.hidden};
})();
