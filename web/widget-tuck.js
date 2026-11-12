// Push a box on a page (To do, Recall, Schedule…) out to the right edge, out of view; a small labelled tab stays at the
// edge to bring it back. What's tucked away is remembered on this Mac, and the page closes up around the gap.
const WidgetTuck=(()=>{
 const KEY='notival-tucked',SECTIONS='.subject-widgets > section, .global-todo';
 let tucked=new Set();
 try{tucked=new Set(JSON.parse(localStorage.getItem(KEY)||'[]'))}catch{}
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify([...tucked]))}catch{}};
 const sections=()=>[...document.querySelectorAll(SECTIONS)];
 // Each kind of box has a name that is the same on every subject page.
 function keyOf(section){
  const c=section.classList;
  if(c.contains('global-todo'))return 'home-todo';
  for(const name of ['recall','plan','schedule','flags','vocab','listening','dates'])if(c.contains('subject-'+name))return name;
  return c.contains('subject-checklist')?'todo':null;
 }
 const titleOf=section=>(section.querySelector('h2,h3')?.textContent||'').replace(/\s*·.*$/,'').trim()||'Box';
 let strip=null,shown='';
 const ensureStrip=()=>{
  if(strip)return strip;
  strip=document.createElement('nav');strip.id='widget-tabs';strip.setAttribute('aria-label','Boxes pushed to the side');strip.hidden=true;document.body.append(strip);return strip;
 };
 function tuck(section,animate=true){
  const key=keyOf(section);if(!key)return;
  tucked.add(key);save();
  if(!animate||matchMedia('(prefers-reduced-motion: reduce)').matches){refresh();return}
  section.classList.add('widget-leaving');
  setTimeout(()=>{section.classList.remove('widget-leaving');refresh()},230);
 }
 function untuck(key){
  tucked.delete(key);save();
  refresh();
  for(const section of sections())if(keyOf(section)===key){section.classList.add('widget-arriving');setTimeout(()=>section.classList.remove('widget-arriving'),260)}
 }
 function refresh(){
  const tabs=[];
  for(const section of sections()){
   const key=keyOf(section);if(!key)continue;
   // the little tab hanging off the box's right edge
   if(!section.querySelector(':scope > .widget-tuck')){
    const handle=document.createElement('button');handle.type='button';handle.className='widget-tuck';
    handle.textContent='›';handle.title='Push to the side';handle.setAttribute('aria-label','Push '+titleOf(section)+' to the side');
    handle.onclick=event=>{event.stopPropagation();tuck(section)};
    section.append(handle);
   }
   const away=tucked.has(key);
   if(away)section.setAttribute('data-tucked','');else section.removeAttribute('data-tucked');
   if(away&&!section.hasAttribute('data-user-hidden'))tabs.push([key,titleOf(section)]);
  }
  // The tabs at the top right: one per box that is tucked away on this page.
  const edge=ensureStrip(),signature=tabs.map(tab=>tab.join(':')).join('|');
  // Only rebuilt when the set of tabs changes, so a tab slides in once rather than restarting.
  if(signature!==shown){
   shown=signature;edge.replaceChildren();
   for(const [key,title] of tabs){
    const tab=document.createElement('button'),arrow=document.createElement('span'),label=document.createElement('span');tab.type='button';tab.className='widget-tab';arrow.className='widget-tab-arrow';arrow.textContent='‹';arrow.setAttribute('aria-hidden','true');label.className='widget-tab-label';label.textContent=title;tab.append(arrow,label);tab.title='Bring back '+title;tab.setAttribute('aria-label','Bring back '+title);
    tab.onclick=()=>untuck(key);edge.append(tab);
   }
  }
  edge.hidden=!tabs.length;
  // When every box on a page is away, the page uses the room the column held.
  for(const view of document.querySelectorAll('.student-home-view')){
   const boxes=[...view.querySelectorAll(':scope > .subject-widgets > section, :scope > .global-todo')];
   view.toggleAttribute('data-widgets-away',boxes.length>0&&boxes.every(box=>box.hasAttribute('data-tucked')||box.hasAttribute('data-user-hidden')));
  }
 }
 const clear=()=>{tucked.clear();save();refresh()};
 let queued=0;
 new MutationObserver(records=>{if(records.every(record=>record.target.closest?.('#widget-tabs')))return;if(queued)return;queued=requestAnimationFrame(()=>{queued=0;refresh()})}).observe(document.body,{childList:true,subtree:true});
 refresh();
 return {tuck,untuck,clear,tucked:()=>[...tucked],refresh};
})();
