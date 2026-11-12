// Show and hide: people pick which parts of Notival they see. Everything stays one switch away in this panel, which
// can't itself be hidden (it opens from Appearance, and with ⌘,). Choices are kept on this Mac like the appearance ones.
const Customize=(()=>{
 const $$=selector=>[...document.querySelectorAll(selector)];
 const menuOf=id=>$$('#'+id).map(node=>node.closest('.editor-menu')||node);
 const byText=(selector,text)=>$$(selector).filter(node=>node.textContent.trim().replace(/\s+/g,' ').startsWith(text));
 // [id, label, find()]: what each switch controls. A switch whose part isn't on screen right now still remembers.
 const groups=[
  {title:'Sidebar',items:[
   ['study','Study',()=>$$('#study-nav')],
   ['capture','Where new notes are saved',()=>$$('.capture-destination')],
   ['search','Search box',()=>$$('.quick-search-trigger')],
   ['all-notes','All notes',()=>$$('#all')],
   ['questions','Questions',()=>byText('aside .nav','Questions')],
   ['pinned','Pinned',()=>$$('#pinned')],
   ['trash','Trash',()=>$$('#trash')],
   ['archive','Archive',()=>$$('#archive')],
   ['recent-notes','Your notes list',()=>{const list=$$('#notes')[0];return list?[list.previousElementSibling,list].filter(Boolean):[]}],
   ['backup','Backup buttons',()=>$$('#import,#export')]]},
  {title:'Top bar',items:[
   ['history','Back and forward arrows',()=>$$('header [aria-label="Go back"],header [aria-label="Go forward"]')],
   ['focus-menu','Focus menu',()=>$$('#focus-menu')],
   ['breadcrumb','Where you are',()=>$$('.breadcrumb')],
   ['saved','“All changes saved”',()=>$$('#saved')],
   ['pin','Pin note',()=>$$('#pin')],
   ['export-note','Export note',()=>$$('#share-note')],
   ['delete-note','Move note to Trash',()=>$$('#delete')]]},
  {title:'Above a note',items:[
   ['mind-map','Note / Mind map switch',()=>$$('.toolbar > .tabs')],
   ['note-questions','Questions',()=>$$('#note-questions')],
   ['open-pdf','Open PDF',()=>$$('#open-pdf')],
   ['note-tools','Tools',()=>menuOf('note-tools')],
   ['context','Context',()=>$$('#note-context-toggle')],
   ['outline','Outline beside a note',()=>$$('#note-rail')],
   ['vocab-button','Vocab (language subjects)',()=>$$('#note-vocab')]]},
  {title:'Formatting bar',items:[
   ['text-style','Text style',()=>$$('#heading-style')],
   ['highlight','Highlight',()=>$$('#format-bar [data-command="highlight"]')],
   ['lists','Bullet and numbered lists',()=>$$('#format-bar [data-command="insertUnorderedList"],#format-bar [data-command="insertOrderedList"]')],
   ['checklist','Checklist',()=>$$('#format-bar [data-command="task"]')],
   ['align','Align',()=>menuOf('editor-alignment')],
   ['insert','Insert',()=>menuOf('editor-insert')],
   ['connect','Connect',()=>$$('#connect-passages')],
   ['mark-up','Mark up',()=>$$('.format-markup')]]},
  {title:'Subject tabs',items:[
   ['tab-notes','Notes',()=>$$('.student-tabs [data-feature="notes"]')],
   ['tab-materials','Materials',()=>$$('.student-tabs [data-feature="materials"]')],
   ['tab-tests','Test packs',()=>$$('.student-tabs [data-feature="tests"]')],
   ['tab-synthesis','Synthesis',()=>$$('.student-tabs [data-feature="synthesis"]')]]},
  {title:'On a subject’s page',items:[
   ['w-recall','Recall',()=>$$('.subject-widgets .subject-recall')],
   ['w-plan','Study plan',()=>$$('.subject-widgets .subject-plan')],
   ['w-schedule','Schedule',()=>$$('.subject-widgets .subject-schedule')],
   ['w-todo','To do',()=>$$('.subject-widgets .subject-checklist:not(.subject-recall):not(.subject-plan):not(.subject-flags)')],
   ['w-dates','Upcoming dates',()=>$$('.subject-widgets .subject-dates')],
   ['w-flags','Flagged passages',()=>$$('.subject-widgets .subject-flags')],
   ['w-recent','Recent notes',()=>$$('.subject-recents')],
   ['w-units','Units',()=>$$('.subject-units')]]}
 ];
 // One-click starting points; every switch can still be changed afterwards.
 const presets=[
  {id:'everything',name:'Everything',hint:'All of Notival',hidden:[]},
  {id:'simple',name:'Simple',hint:'Notes, subjects and the basics',hidden:['study','capture','questions','archive','backup','focus-menu','breadcrumb','saved','mind-map','note-questions','context','open-pdf','connect','mark-up','tab-tests','tab-synthesis','w-recall','w-plan','w-schedule','w-flags']},
  {id:'writing',name:'Just writing',hint:'Almost nothing but the page',hidden:['study','capture','all-notes','questions','pinned','trash','archive','backup','history','focus-menu','breadcrumb','saved','pin','export-note','delete-note','mind-map','note-questions','open-pdf','note-tools','context','outline','vocab-button','text-style','highlight','checklist','align','insert','connect','mark-up','tab-materials','tab-tests','tab-synthesis','w-recall','w-plan','w-schedule','w-dates','w-flags','w-recent','w-units']}
 ];
 const KEY='notival-layout';
 let hidden=new Set();
 try{hidden=new Set(JSON.parse(localStorage.getItem(KEY)||'{}').hidden||[])}catch{}
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({hidden:[...hidden]}))}catch{}};
 const all=groups.flatMap(group=>group.items);

 // Leftovers: a heading with nothing under it, and dividers with nothing between them.
 function tidy(){
  const label=$$('.section-label').find(node=>node.textContent.trim()==='WORKSPACE');
  if(label){const entries=$$('#all,#pinned,#trash,#archive').concat(byText('aside .nav','Questions'));if(entries.length&&entries.every(node=>node.hasAttribute('data-user-hidden')))label.setAttribute('data-user-hidden','')}
  for(const bar of $$('#format-bar')){
   let before=false,pendingGap=null;
   for(const child of [...bar.children]){
    if(child.hasAttribute('data-user-hidden')||child.hidden)continue;
    if(child.classList.contains('format-gap')){if(!before||pendingGap)child.setAttribute('data-user-hidden','');else pendingGap=child;continue}
    before=true;pendingGap=null;
   }
   if(pendingGap)pendingGap.setAttribute('data-user-hidden','');
  }
 }
 // Hidden parts get an attribute; the stylesheet does the hiding, so a part that is redrawn is hidden again at once.
 function apply(){
  for(const node of $$('[data-user-hidden]'))node.removeAttribute('data-user-hidden');
  for(const [id,,find] of all)if(hidden.has(id))for(const node of find())node.setAttribute('data-user-hidden','');
  tidy();
  document.body.dataset.hiddenCount=String(hidden.size);
  // A subject tab that was just hidden can't stay selected: go back to the overview.
  const current=$$('.student-tabs [aria-current="page"]')[0];
  if(current?.hasAttribute('data-user-hidden'))document.querySelector('.student-tabs [data-feature="overview"]')?.click();
 }
 let queued=0;
 const schedule=()=>{if(queued)return;queued=requestAnimationFrame(()=>{queued=0;apply()})};
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});

 // ── The panel ──────────────────────────────────────────────────────────────
 let dialog=null;
 function paint(){
  dialog.replaceChildren();
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
  dialog.append(el('h2','','Show and hide'),el('p','customize-sub','Hide whatever you don\'t use. Nothing is deleted; it all comes back here.'));
  const row=el('div','customize-presets');
  for(const preset of presets){
   const active=preset.hidden.length===hidden.size&&preset.hidden.every(id=>hidden.has(id));
   const b=el('button','customize-preset');b.type='button';b.setAttribute('aria-pressed',String(active));b.append(el('strong','',preset.name),el('small','',preset.hint));
   b.onclick=()=>{hidden=new Set(preset.hidden);save();apply();paint()};row.append(b);
  }
  dialog.append(row);
  const scroll=el('div','customize-groups');
  for(const group of groups){
   const section=el('section','customize-group');section.append(el('h3','',group.title));
   for(const [id,label] of group.items){
    const line=el('label','customize-line'),box=el('input');box.type='checkbox';box.setAttribute('role','switch');box.checked=!hidden.has(id);box.dataset.item=id;
    box.onchange=()=>{box.checked?hidden.delete(id):hidden.add(id);save();apply();for(const b of row.children)b.setAttribute('aria-pressed','false')};
    line.append(el('span','',label),box);section.append(line);
   }
   scroll.append(section);
  }
  dialog.append(scroll);
  const foot=el('div','customize-foot'),done=el('button','primary','Done');done.type='button';done.onclick=()=>dialog.close();foot.append(done);dialog.append(foot);
 }
 function open(){
  if(!dialog){dialog=document.createElement('dialog');dialog.className='customize-dialog';dialog.setAttribute('aria-label','Show and hide');document.body.append(dialog)}
  document.querySelector('.appearance-dialog')?.close();
  paint();dialog.showModal();
 }
 // ⌘, is the usual place for preferences.
 document.addEventListener('keydown',event=>{if(event.key===','&&(event.metaKey||event.ctrlKey)&&!event.altKey&&!event.shiftKey){event.preventDefault();open()}});
 apply();
 return {open,apply,hidden:()=>[...hidden],presets,groups};
})();
