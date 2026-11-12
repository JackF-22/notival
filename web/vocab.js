// Vocabulary for language subjects. A subject you mark as a language gets a Vocab section on its page and a drawer in
// its notes: add a word (typed, or from the words you've selected), look things up, quiz yourself. Words live in
// state.vocab with the subject they belong to; Russian typing comes from translit.js.
(()=>{
 const $=selector=>document.querySelector(selector);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const button=(label,onclick,cls='',title='')=>{const b=el('button',cls,label);b.type='button';b.onclick=onclick;if(title){b.title=title;b.setAttribute('aria-label',title)}return b};
 const store=()=>(state.vocab??=[]);
 const pref=(key,fallback)=>{try{const raw=localStorage.getItem('notival.vocab.'+key);return raw==null?fallback:JSON.parse(raw)}catch{return fallback}};
 const remember=(key,value)=>{try{localStorage.setItem('notival.vocab.'+key,JSON.stringify(value))}catch{}};
 const subjectOf=id=>(state?.projects||[]).find(project=>project.id===id)||null;
 const languageOf=id=>subjectOf(id)?.language||null;
 const noteSubject=()=>document.body.dataset.view==='note'?current()?.projectId||'':'';
 const norm=text=>String(text||'').trim().replace(/\s+/g,' ');
 const views=new Set();
 const refreshAll=()=>{for(const v of views){if(v.root.isConnected)v.refresh();else views.delete(v)}};

 const wordsOf=subjectId=>store().filter(word=>word.projectId===subjectId);
 function add({term,meaning='',sentence='',projectId,noteId}={}){
  projectId??=noteSubject();if(!projectId)return null;
  term=norm(term);meaning=norm(meaning);if(!term)return null;
  const existing=store().find(word=>word.term.toLowerCase()===term.toLowerCase()&&word.projectId===projectId);
  if(existing){let changed=false;if(meaning&&!existing.meaning){existing.meaning=meaning;changed=true}if(sentence&&!existing.sentence){existing.sentence=norm(sentence);changed=true}if(changed){persist();refreshAll()}return existing}
  const word={id:uid(),term,meaning,sentence:norm(sentence),projectId,noteId:noteId??(current()?.id||''),added:Date.now()};
  store().unshift(word);persist();refreshAll();return word;
 }
 function remove(word){state.vocab=store().filter(item=>item!==word);persist();refreshAll()}
 // Words made before subjects could be languages belong to the first language subject that asks for them.
 function adopt(subjectId){let changed=false;for(const word of store())if(!word.projectId){word.projectId=subjectId;changed=true}if(changed)persist()}

 // ── One vocab list, for one subject; used inline on the subject page and inside the drawer ────────────────────
 function view(subjectId,{drawer=false,onClose}={}){
  adopt(subjectId);
  const root=el('div','vocab-view'+(drawer?' is-drawer':''));
  let filter='',termInput,meaningInput,sentenceInput,list,search,form,tools,title,russian=null,guide=null,review,needs;
  const lang=languageOf(subjectId),isRussian=lang?.code==='ru';
  const head=el('div','vocab-head');title=el('h2');head.append(title);
  if(isRussian){
   russian=button('РУ',()=>{russian.setAttribute('aria-pressed',String(russian.getAttribute('aria-pressed')!=='true'));remember('translit',russian.getAttribute('aria-pressed')==='true')},'vocab-chip','Type Russian with a Latin keyboard (privet → привет)');
   russian.setAttribute('aria-pressed',String(pref('translit',true)));head.append(russian);
   const keys=button('?',()=>{guide.hidden=!guide.hidden;keys.setAttribute('aria-pressed',String(!guide.hidden))},'vocab-chip vocab-keys','Which keys type which letters');keys.setAttribute('aria-pressed','false');head.append(keys);
   guide=Translit.help();
  }
  // Words are reviewed in Recall, so each one comes back just before you would forget it.
  review=button('Review',()=>window.marginRecall?.hub({project:subjectOf(subjectId)}),'vocab-chip vocab-review','Review these words: each comes back just before you would forget it');
  head.append(review);
  if(drawer)head.append(button('✕',()=>onClose?.(),'vocab-close','Hide vocab'));
  const translit=()=>!!russian&&russian.getAttribute('aria-pressed')==='true';
  form=el('div','vocab-form');
  termInput=el('input');termInput.placeholder='Word or phrase';termInput.setAttribute('aria-label','Word or phrase');termInput.spellcheck=false;if(lang)termInput.lang=lang.code;
  meaningInput=el('input');meaningInput.placeholder='Meaning';meaningInput.setAttribute('aria-label','Meaning');
  sentenceInput=el('input');sentenceInput.placeholder='Example sentence (optional)';sentenceInput.setAttribute('aria-label','Example sentence');sentenceInput.spellcheck=false;if(lang)sentenceInput.lang=lang.code;
  Translit.attach(termInput,translit);Translit.attach(sentenceInput,translit);
  const submit=()=>{if(!termInput.value.trim())return termInput.focus();add({term:termInput.value,meaning:meaningInput.value,sentence:sentenceInput.value,projectId:subjectId});termInput.value='';meaningInput.value='';sentenceInput.value='';termInput.focus()};
  termInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();meaningInput.focus()}});
  for(const field of [meaningInput,sentenceInput])field.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submit()}});
  form.append(termInput,meaningInput,sentenceInput,button('Add',submit,'vocab-add primary'));
  tools=el('div','vocab-tools');
  search=el('input');search.type='search';search.placeholder='Search';search.setAttribute('aria-label','Search vocab');search.oninput=()=>{filter=search.value.trim().toLowerCase();refresh()};
  tools.append(search);
  needs=el('p','vocab-needs');needs.hidden=true;
  list=el('div','vocab-list');
  root.append(head,...(guide?[guide]:[]),form,needs,tools,list);

  const visible=()=>wordsOf(subjectId).filter(word=>!filter||(word.term+' '+word.meaning+' '+(word.sentence||'')).toLowerCase().includes(filter));
  // How many of these words are waiting for review right now.
  function dueCount(){
   if(typeof RecallModel==='undefined')return 0;
   state.reviews??={};const items=RecallModel.collect(state,{projectId:subjectId}).filter(item=>item.origin==='vocab');
   return RecallModel.workload(items,state.reviews,Date.now(),RecallModel.allowance(state)).ready;
  }
  function refresh(){
   const words=visible(),all=wordsOf(subjectId),ready=dueCount();
   title.textContent='Vocab'+(all.length?' · '+words.length:'');
   review.textContent=ready?'Review · '+ready:'Review';review.hidden=!all.some(word=>word.meaning);
   const missing=all.filter(word=>!word.meaning).length;
   needs.hidden=!missing;needs.textContent=missing?missing+(missing===1?' word needs':' words need')+' a meaning before it can be reviewed. Click it to add one.':'';
   tools.hidden=all.length<6&&!filter;
   list.replaceChildren();
   if(!words.length)list.append(el('p','vocab-empty',filter?'No matches':'No words yet'));
   for(const word of words)list.append(row(word));
  }
  function row(word){
   const r=el('div','vocab-row'),text=el('div','vocab-text');
   const meaning=el('span','',word.meaning||'Add a meaning');if(!word.meaning)meaning.className='is-blank';
   text.append(el('strong','',word.term),meaning);
   if(word.sentence)text.append(el('em','vocab-sentence',word.sentence));
   // Click a word to change it.
   text.onclick=()=>{
    const a=el('input'),b=el('input'),c=el('input');a.value=word.term;b.value=word.meaning;c.value=word.sentence||'';a.setAttribute('aria-label','Word');b.setAttribute('aria-label','Meaning');c.setAttribute('aria-label','Example sentence');b.placeholder='Meaning';c.placeholder='Example sentence (optional)';
    Translit.attach(a,translit);Translit.attach(c,translit);
    const edit=el('div','vocab-edit');edit.append(a,b,c);text.replaceWith(edit);(word.meaning?a:b).focus();
    const save=()=>{if(!edit.isConnected)return;word.term=norm(a.value)||word.term;word.meaning=norm(b.value);word.sentence=norm(c.value);persist();refreshAll()};
    for(const field of [a,b,c])field.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();save()}if(event.key==='Escape'){event.stopPropagation();refresh()}});
    edit.addEventListener('focusout',()=>setTimeout(()=>{if(edit.isConnected&&!edit.contains(document.activeElement))save()},0));
   };
   r.append(text,button('✕',()=>remove(word),'vocab-remove','Remove “'+word.term+'”'));
   return r;
  }
  const instance={root,refresh,focus:()=>termInput.focus(),prefill:text=>{termInput.value=text;meaningInput.focus()},focusMeaning:()=>meaningInput.focus()};
  views.add(instance);refresh();return instance;
 }

 // ── On a language subject's page: a Vocab section ─────────────────────────────────────────────────────────
 window.marginVocabWidget=subject=>{
  if(!subject?.language)return null;
  const box=el('section','subject-vocab');box.append(view(subject.id).root);return box;
 };

 // ── In a language subject's notes: a drawer that slides out and tucks away ────────────────────────────────
 let panel=null,drawerView=null,drawerSubject='';
 const inLanguageNote=()=>!!languageOf(noteSubject());
 function show(open,focus=true){
  const subject=noteSubject();
  if(open&&!languageOf(subject))return;
  if(!panel){panel=el('aside');panel.id='vocab-panel';panel.setAttribute('aria-label','Vocab');panel.hidden=true;document.body.append(panel);
   panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();show(false)}})}
  if(open&&drawerSubject!==subject){drawerSubject=subject;drawerView=view(subject,{drawer:true,onClose:()=>show(false)});panel.replaceChildren(drawerView.root)}
  panel.hidden=!open;document.body.classList.toggle('vocab-open',open);remember('open',open);
  const toggle=$('#note-vocab');if(toggle)toggle.setAttribute('aria-pressed',String(open));
  if(open&&focus)drawerView.focus();
 }
 // The words you've selected go straight into the Word box, ready for a meaning.
 function addSelection(){
  if(!inLanguageNote())return;
  const text=norm(getSelection()?.toString());
  show(true,false);
  if(text&&text.length<=80)drawerView.prefill(text);else drawerView.focus();
 }
 const actions=$('.toolbar-actions');
 let toggle=null,selectionButton=null;
 if(actions){
  toggle=button('Vocab',()=>show(panel?.hidden!==false),'','Vocab drawer (⌘⇧V)');toggle.id='note-vocab';toggle.setAttribute('aria-pressed','false');
  const questions=$('#note-questions');if(questions)questions.after(toggle);else actions.prepend(toggle);
 }
 const selectionTools=$('#selection-tools');
 if(selectionTools){selectionButton=button('Add to vocab',addSelection,'','Add the selected words to your vocab');selectionButton.onmousedown=e=>e.preventDefault();selectionTools.append(selectionButton)}
 document.addEventListener('keydown',event=>{
  if(event.code!=='KeyV'||!event.shiftKey||event.altKey||!(event.metaKey||event.ctrlKey)||event.isComposing||document.querySelector('dialog[open]'))return;
  if(!inLanguageNote())return;
  event.preventDefault();
  if(panel&&!panel.hidden&&!getSelection()?.toString().trim())show(false);else addSelection();
 });
 // The drawer belongs to language notes: it tucks away elsewhere and comes back when you return to one.
 function sync(){
  const here=inLanguageNote();
  if(toggle)toggle.hidden=!here;if(selectionButton)selectionButton.hidden=!here;
  if(!here){if(panel&&!panel.hidden){panel.hidden=true;document.body.classList.remove('vocab-open')}return}
  if(panel&&!panel.hidden&&drawerSubject!==noteSubject())show(true,false);
 }
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-view']});
 const baseRender=render;render=function(){baseRender();sync()};
 if(pref('open',false))setTimeout(()=>{if(inLanguageNote())show(true,false)},400);
 window.marginVocab={add,show,words:()=>store(),wordsOf,languageOf};
})();
