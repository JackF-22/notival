// The languages a subject can be about, and the picker used wherever a subject is made or changed.
const NotivalLanguages=(()=>{
 const list=[{code:'ru',name:'Russian',locale:'ru-RU'},{code:'es',name:'Spanish',locale:'es-ES'},{code:'fr',name:'French',locale:'fr-FR'},{code:'de',name:'German',locale:'de-DE'},{code:'it',name:'Italian',locale:'it-IT'},{code:'pt',name:'Portuguese',locale:'pt-BR'},{code:'uk',name:'Ukrainian',locale:'uk-UA'},{code:'pl',name:'Polish',locale:'pl-PL'},{code:'ja',name:'Japanese',locale:'ja-JP'},{code:'zh',name:'Chinese (Mandarin)',locale:'zh-CN'},{code:'ko',name:'Korean',locale:'ko-KR'},{code:'ar',name:'Arabic',locale:'ar-SA'}];
 // A drop-down in a small block: element to add to a form, value() for what was chosen, and suggest(name) to pre-select
 // a language when the subject's name is one ("Russian"), until the person has chosen for themselves.
 function field(current){
  const wrap=document.createElement('label');wrap.className='language-field';
  const caption=document.createElement('small');caption.textContent='LANGUAGE LEARNING';
  const pick=document.createElement('select');pick.setAttribute('aria-label','Language');
  const none=document.createElement('option');none.value='';none.textContent='Not a language subject';pick.append(none);
  for(const language of list){const option=document.createElement('option');option.value=language.code;option.textContent=language.name;pick.append(option)}
  pick.value=current?.code||'';
  const hint=document.createElement('small');hint.className='language-hint';
  const explain=()=>{hint.textContent=pick.value?'Adds Vocab and Listening practice to this subject and its notes.':''};
  let touched=!!current;pick.addEventListener('change',()=>{touched=true;explain()});explain();
  wrap.append(caption,pick,hint);
  return {
   element:wrap,
   value:()=>list.find(language=>language.code===pick.value)||null,
   suggest:name=>{if(touched)return;const match=list.find(language=>language.name.toLowerCase()===String(name||'').trim().toLowerCase());pick.value=match?.code||'';explain()}
  };
 }
 return {list,field};
})();
