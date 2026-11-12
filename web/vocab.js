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
 function add({term,meaning='',projectId,noteId}={}){
  projectId??=noteSubject();if(!projectId)return null;
  term=norm(term);meaning=norm(meaning);if(!term)return null;
  const existing=store().find(word=>word.term.toLowerCase()===term.toLowerCase()&&word.projectId===projectId);
  if(existing){if(meaning&&!existing.meaning){existing.meaning=meaning;persist();refreshAll()}return existing}
  const word={id:uid(),term,meaning,projectId,noteId:noteId??(current()?.id||''),added:Date.now()};
  store().unshift(word);persist();refreshAll();return word;
 }
 function remove(word){state.vocab=store().filter(item=>item!==word);persist();refreshAll()}
 // Words made before subjects could be languages belong to the first language subject that asks for them.
 function adopt(subjectId){let changed=false;for(const word of store())if(!word.projectId){word.projectId=subjectId;changed=true}if(changed)persist()}

 // ── One vocab list, for one subject; used inline on the subject page and inside the drawer ────────────────────
 function view(subjectId,{drawer=false,onClose}={}){
  adopt(subjectId);
  const root=el('div','vocab-view'+(drawer?' is-drawer':''));
  let filter='',quiz=null,termInput,meaningInput,list,quizBox,search,form,tools,title,russian=null,guide=null;
  const lang=languageOf(subjectId),isRussian=lang?.code==='ru';
  const head=el('div','vocab-head');title=el('h2');head.append(title);
  if(isRussian){
   russian=button('РУ',()=>{russian.setAttribute('aria-pressed',String(russian.getAttribute('aria-pressed')!=='true'));remember('translit',russian.getAttribute('aria-pressed')==='true')},'vocab-chip','Type Russian with a Latin keyboard (privet → привет)');
   russian.setAttribute('aria-pressed',String(pref('translit',true)));head.append(russian);
   const keys=button('?',()=>{guide.hidden=!guide.hidden;keys.setAttribute('aria-pressed',String(!guide.hidden))},'vocab-chip vocab-keys','Which keys type which letters');keys.setAttribute('aria-pressed','false');head.append(keys);
   guide=Translit.help();
  }
  head.append(button('Quiz',()=>startQuiz(),'vocab-chip','Test yourself on these words'));
  if(drawer)head.append(button('✕',()=>onClose?.(),'vocab-close','Hide vocab'));
  const translit=()=>!!russian&&russian.getAttribute('aria-pressed')==='true';
  form=el('div','vocab-form');
  termInput=el('input');termInput.placeholder='Word or phrase';termInput.setAttribute('aria-label','Word or phrase');termInput.spellcheck=false;if(lang)termInput.lang=lang.code;
  meaningInput=el('input');meaningInput.placeholder='Meaning';meaningInput.setAttribute('aria-label','Meaning');
  Translit.attach(termInput,translit);
  const submit=()=>{if(!termInput.value.trim())return termInput.focus();add({term:termInput.value,meaning:meaningInput.value,projectId:subjectId});termInput.value='';meaningInput.value='';termInput.focus()};
  termInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();meaningInput.focus()}});
  meaningInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submit()}});
  form.append(termInput,meaningInput,button('Add',submit,'vocab-add primary'));
  tools=el('div','vocab-tools');
  search=el('input');search.type='search';search.placeholder='Search';search.setAttribute('aria-label','Search vocab');search.oninput=()=>{filter=search.value.trim().toLowerCase();refresh()};
  tools.append(search);
  list=el('div','vocab-list');quizBox=el('div','vocab-quiz');quizBox.hidden=true;
  root.append(head,...(guide?[guide]:[]),form,tools,list,quizBox);

  const visible=()=>wordsOf(subjectId).filter(word=>!filter||(word.term+' '+word.meaning).toLowerCase().includes(filter));
  function refresh(){
   if(quiz)return paintQuiz();
   const words=visible();
   title.textContent='Vocab'+(wordsOf(subjectId).length?' · '+words.length:'');
   tools.hidden=wordsOf(subjectId).length<6&&!filter;
   list.replaceChildren();
   if(!words.length)list.append(el('p','vocab-empty',filter?'No matches':'No words yet'));
   for(const word of words)list.append(row(word));
  }
  function row(word){
   const r=el('div','vocab-row'),text=el('div','vocab-text');
   const meaning=el('span','',word.meaning||'—');if(!word.meaning)meaning.className='is-blank';
   text.append(el('strong','',word.term),meaning);
   // Click a word to change it.
   text.onclick=()=>{
    const a=el('input'),b=el('input');a.value=word.term;b.value=word.meaning;a.setAttribute('aria-label','Word');b.setAttribute('aria-label','Meaning');b.placeholder='Meaning';
    Translit.attach(a,translit);
    const edit=el('div','vocab-edit');edit.append(a,b);text.replaceWith(edit);a.focus();a.select();
    const save=()=>{if(!edit.isConnected)return;word.term=norm(a.value)||word.term;word.meaning=norm(b.value);persist();refreshAll()};
    for(const field of [a,b])field.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();save()}if(event.key==='Escape'){event.stopPropagation();refresh()}});
    edit.addEventListener('focusout',()=>setTimeout(()=>{if(edit.isConnected&&!edit.contains(document.activeElement))save()},0));
   };
   r.append(text,button('✕',()=>remove(word),'vocab-remove','Remove “'+word.term+'”'));
   return r;
  }
  // ── Quiz: the meaning, then the word; mark what you knew ─────────────────
  function startQuiz(){
   const pool=visible().filter(word=>word.meaning);
   if(pool.length<2){toast?.('Add at least two words with meanings to quiz yourself.');return}
   quiz={queue:[...pool].sort(()=>Math.random()-.5),index:0,known:0,missed:[],flip:false};paintQuiz();
  }
  function paintQuiz(){
   quizBox.replaceChildren();list.hidden=!!quiz;quizBox.hidden=!quiz;form.hidden=!!quiz;tools.hidden=!!quiz||(wordsOf(subjectId).length<6&&!filter);
   if(!quiz)return refresh();
   if(quiz.index>=quiz.queue.length){
    quizBox.append(el('p','vocab-score',quiz.known+' of '+quiz.queue.length+' known'));
    if(quiz.missed.length)quizBox.append(button('Practise the '+quiz.missed.length+' you missed',()=>{quiz={queue:quiz.missed.sort(()=>Math.random()-.5),index:0,known:0,missed:[],flip:false};paintQuiz()},'primary'));
    quizBox.append(button('Done',()=>{quiz=null;paintQuiz()}));return;
   }
   const word=quiz.queue[quiz.index];
   quizBox.append(el('small','vocab-progress',(quiz.index+1)+' / '+quiz.queue.length),el('div','vocab-card',quiz.flip?word.term:word.meaning));
   if(!quiz.flip)quizBox.append(button('Show the word',()=>{quiz.flip=true;paintQuiz()},'primary'));
   else{const grade=el('div','vocab-grade');grade.append(button('Missed it',()=>{quiz.missed.push(word);quiz.index++;quiz.flip=false;paintQuiz()}),button('Knew it',()=>{quiz.known++;quiz.index++;quiz.flip=false;paintQuiz()},'primary'));quizBox.append(grade)}
   quizBox.append(button('Stop',()=>{quiz=null;paintQuiz()},'vocab-stop'));
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
