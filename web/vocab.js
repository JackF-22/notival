// A vocab drawer for any note: slide it out, add a word (typed, or from the words you've selected), look things up,
// quiz yourself, and tuck it away again. Words live in state.vocab; Russian typing comes from translit.js.
(()=>{
 const $=selector=>document.querySelector(selector);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const button=(label,onclick,cls='',title='')=>{const b=el('button',cls,label);b.type='button';b.onclick=onclick;if(title){b.title=title;b.setAttribute('aria-label',title)}return b};
 const store=()=>(state.vocab??=[]);
 const pref=(key,fallback)=>{try{const raw=localStorage.getItem('notival.vocab.'+key);return raw==null?fallback:JSON.parse(raw)}catch{return fallback}};
 const remember=(key,value)=>{try{localStorage.setItem('notival.vocab.'+key,JSON.stringify(value))}catch{}};
 const subjectOf=()=>current()?.projectId||'';
 let panel=null,list=null,termInput=null,meaningInput=null,search=null,quizBox=null,filter='',allWords=pref('all',false),quiz=null;

 const visible=()=>store().filter(word=>(allWords||!subjectOf()||word.projectId===subjectOf())&&(!filter||(word.term+' '+word.meaning).toLowerCase().includes(filter)));
 const norm=text=>String(text||'').trim().replace(/\s+/g,' ');

 function add({term,meaning='',projectId,noteId}={}){
  term=norm(term);meaning=norm(meaning);if(!term)return null;
  const existing=store().find(word=>word.term.toLowerCase()===term.toLowerCase()&&(word.projectId||'')===(projectId??subjectOf()));
  if(existing){if(meaning&&!existing.meaning){existing.meaning=meaning;persist();paint()}return existing}
  const word={id:uid(),term,meaning,projectId:projectId??subjectOf(),noteId:noteId??(current()?.id||''),added:Date.now()};
  store().unshift(word);persist();paint();return word;
 }
 function remove(word){state.vocab=store().filter(item=>item!==word);persist();paint()}

 // ── The drawer ─────────────────────────────────────────────────────────────
 function build(){
  panel=el('aside');panel.id='vocab-panel';panel.setAttribute('aria-label','Vocab');panel.hidden=true;
  const head=el('div','vocab-head');head.append(el('h2','','Vocab'));
  const russian=button('РУ',()=>{russian.setAttribute('aria-pressed',String(russian.getAttribute('aria-pressed')!=='true'));remember('translit',russian.getAttribute('aria-pressed')==='true')},'vocab-chip','Type Russian with a Latin keyboard (privet → привет)');
  russian.setAttribute('aria-pressed',String(pref('translit',false)));
  const quizButton=button('Quiz',()=>startQuiz(),'vocab-chip','Test yourself on these words');
  head.append(russian,quizButton,button('✕',()=>show(false),'vocab-close','Hide vocab'));
  const form=el('div','vocab-form');
  termInput=el('input');termInput.placeholder='Word or phrase';termInput.setAttribute('aria-label','Word or phrase');termInput.spellcheck=false;
  meaningInput=el('input');meaningInput.placeholder='Meaning';meaningInput.setAttribute('aria-label','Meaning');
  for(const field of [termInput,meaningInput])Translit.attach(field,()=>russian.getAttribute('aria-pressed')==='true'&&field===termInput);
  const submit=()=>{if(!termInput.value.trim())return termInput.focus();add({term:termInput.value,meaning:meaningInput.value});termInput.value='';meaningInput.value='';termInput.focus()};
  termInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();meaningInput.focus()}});
  meaningInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submit()}});
  form.append(termInput,meaningInput,button('Add',submit,'vocab-add primary'));
  const tools=el('div','vocab-tools');
  search=el('input');search.type='search';search.placeholder='Search';search.setAttribute('aria-label','Search vocab');search.oninput=()=>{filter=search.value.trim().toLowerCase();paint()};
  const scope=button('',()=>{allWords=!allWords;remember('all',allWords);paint()},'vocab-chip');scope.id='vocab-scope';
  tools.append(search,scope);
  list=el('div','vocab-list');quizBox=el('div','vocab-quiz');quizBox.hidden=true;
  panel.append(head,form,tools,list,quizBox);document.body.append(panel);
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();show(false)}});
 }
 function paint(){
  if(!panel)return;
  const words=visible(),scope=panel.querySelector('#vocab-scope'),subject=subjectOf();
  scope.hidden=!subject;scope.textContent=allWords?'All subjects':'This subject';scope.title=allWords?'Showing words from every subject':'Showing words from this note\'s subject';
  list.replaceChildren();
  if(!words.length)list.append(el('p','vocab-empty',filter?'No matches':'No words yet'));
  for(const word of words)list.append(row(word));
  panel.querySelector('.vocab-head h2').textContent='Vocab'+(store().length?' · '+words.length:'');
 }
 function row(word){
  const r=el('div','vocab-row');
  const text=el('div','vocab-text');
  const term=el('strong','',word.term),meaning=el('span','',word.meaning||'—');
  if(!word.meaning)meaning.className='is-blank';
  text.append(term,meaning);
  // Click a word to change it.
  text.onclick=()=>{
   const a=el('input'),b=el('input');a.value=word.term;b.value=word.meaning;a.setAttribute('aria-label','Word');b.setAttribute('aria-label','Meaning');b.placeholder='Meaning';
   Translit.attach(a,()=>panel.querySelector('.vocab-head .vocab-chip').getAttribute('aria-pressed')==='true');
   const edit=el('div','vocab-edit');edit.append(a,b);text.replaceWith(edit);a.focus();a.select();
   const save=()=>{if(!edit.isConnected)return;word.term=norm(a.value)||word.term;word.meaning=norm(b.value);persist();paint()};
   for(const field of [a,b])field.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();save()}if(event.key==='Escape'){event.stopPropagation();paint()}});
   edit.addEventListener('focusout',()=>setTimeout(()=>{if(edit.isConnected&&!edit.contains(document.activeElement))save()},0));
  };
  r.append(text,button('✕',()=>remove(word),'vocab-remove','Remove “'+word.term+'”'));
  return r;
 }
 function show(open,focus=true){
  if(!panel)build();
  panel.hidden=!open;document.body.classList.toggle('vocab-open',open);remember('open',open);
  const toggle=$('#note-vocab');if(toggle)toggle.setAttribute('aria-pressed',String(open));
  if(open){paint();if(focus)termInput.focus()}
 }
 // The words you've selected go straight into the Word box, ready for a meaning.
 function addSelection(){
  const selection=getSelection(),text=norm(selection?.toString());
  show(true,false);
  if(text&&text.length<=80){termInput.value=text;meaningInput.focus()}else termInput.focus();
 }

 // ── Quiz: the meaning, then the word; mark what you knew ───────────────────
 function startQuiz(){
  const pool=visible().filter(word=>word.meaning);
  if(pool.length<2){toast?.('Add at least two words with meanings to quiz yourself.');return}
  quiz={queue:[...pool].sort(()=>Math.random()-.5),index:0,known:0,missed:[],flip:false};paintQuiz();
 }
 function paintQuiz(){
  quizBox.replaceChildren();list.hidden=!!quiz;quizBox.hidden=!quiz;panel.querySelector('.vocab-form').hidden=!!quiz;panel.querySelector('.vocab-tools').hidden=!!quiz;
  if(!quiz)return paint();
  if(quiz.index>=quiz.queue.length){
   quizBox.append(el('p','vocab-score',quiz.known+' of '+quiz.queue.length+' known'));
   if(quiz.missed.length)quizBox.append(button('Practise the '+quiz.missed.length+' you missed',()=>{quiz={queue:quiz.missed.sort(()=>Math.random()-.5),index:0,known:0,missed:[],flip:false};paintQuiz()},'primary'));
   quizBox.append(button('Done',()=>{quiz=null;paintQuiz()}));return;
  }
  const word=quiz.queue[quiz.index];
  quizBox.append(el('small','vocab-progress',(quiz.index+1)+' / '+quiz.queue.length),el('div','vocab-card',quiz.flip?word.term:word.meaning));
  if(!quiz.flip)quizBox.append(button('Show the word',()=>{quiz.flip=true;paintQuiz()},'primary'));
  else{const row=el('div','vocab-grade');row.append(button('Missed it',()=>{quiz.missed.push(word);quiz.index++;quiz.flip=false;paintQuiz()}),button('Knew it',()=>{quiz.known++;quiz.index++;quiz.flip=false;paintQuiz()},'primary'));quizBox.append(row)}
  quizBox.append(button('Stop',()=>{quiz=null;paintQuiz()},'vocab-stop'));
 }

 // ── Ways in ────────────────────────────────────────────────────────────────
 const actions=$('.toolbar-actions');
 if(actions){
  const toggle=button('Vocab',()=>show(panel?.hidden!==false),'','Vocab drawer (⌘⇧V)');toggle.id='note-vocab';toggle.setAttribute('aria-pressed','false');
  const questions=$('#note-questions');if(questions)questions.after(toggle);else actions.prepend(toggle);
 }
 const selectionTools=$('#selection-tools');
 if(selectionTools){const b=button('Add to vocab',addSelection,'','Add the selected words to your vocab');b.onmousedown=e=>e.preventDefault();selectionTools.append(b)}
 document.addEventListener('keydown',event=>{
  if(event.code!=='KeyV'||!event.shiftKey||event.altKey||!(event.metaKey||event.ctrlKey)||event.isComposing||document.querySelector('dialog[open]'))return;
  if(document.body.dataset.view!=='note')return;
  event.preventDefault();
  if(!panel?.hidden&&!getSelection()?.toString().trim())show(false);else addSelection();
 });
 // The drawer belongs to notes: it hides itself elsewhere and comes back when you return.
 const sync=()=>{const inNote=document.body.dataset.view==='note'&&!!current();if(!panel)return;panel.style.display=inNote?'':'none';if(inNote)paint()};
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-view']});
 const baseRender=render;render=function(){baseRender();sync();const toggle=$('#note-vocab');if(toggle)toggle.hidden=!(document.body.dataset.view==='note')};
 if(pref('open',false))setTimeout(()=>{if(current())show(true,false)},400);
 window.marginVocab={add,show,words:()=>store()};
})();
