// Type Russian on any keyboard: Latin letters turn into Cyrillic as you type ("privet" becomes "привет").
// Each letter is mapped on its own, and a letter that completes a pair turns the pair into one ("с"+h → "ш",
// "ш"+"ч" → "щ", "й"+a → "я"), so the spelling is the usual phonetic one: sh ch zh shch yo yu ya kh ts(c).
// Type the apostrophe for ь and a double quote for ъ. Pure functions first, then the part that listens to a field.
const Translit=(()=>{
 // y is ы (as in "ty" → "ты"), j is й, and a vowel after ы makes the soft vowel: ya я, yu ю, yo ё, ye е.
 const single={a:'а',b:'б',v:'в',g:'г',d:'д',e:'е',z:'з',i:'и',j:'й',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',r:'р',s:'с',t:'т',u:'у',f:'ф',h:'х',c:'ц',y:'ы',w:'в',q:'к',x:'кс',"'":'ь','"':'ъ'};
 // previous Cyrillic letter + typed Latin letter → one letter in place of both
 const pair={'с.h':'ш','з.h':'ж','ц.h':'ч','к.h':'х','ы.a':'я','ы.u':'ю','ы.o':'ё','ы.e':'е','т.s':'ц'};
 const isLatin=char=>/^[A-Za-z'"]$/.test(char);
 const isUpper=char=>!!char&&char!==char.toLowerCase();
 // What typing `letter` after the text `before` does: take back `remove` characters, then add `add`.
 function next(before,letter){
  const lower=letter.toLowerCase(),prev=before.slice(-1),back=before.slice(-2,-1);
  // "shch": ш then ц then h becomes щ
  if(lower==='h'&&prev.toLowerCase()==='ц'&&back.toLowerCase()==='ш')return {remove:2,add:isUpper(back)?'Щ':'щ'};
  const joined=pair[prev.toLowerCase()+'.'+lower];
  if(joined)return {remove:1,add:isUpper(prev)?joined.toUpperCase():joined};
  const mapped=single[lower];if(!mapped)return null;
  return {remove:0,add:isUpper(letter)?mapped.charAt(0).toUpperCase()+mapped.slice(1):mapped};
 }
 // Whole strings, for tests and pasted text: "Privet, kak dela?" → "Привет, как дела?"
 function convert(text){
  let out='';
  for(const char of String(text)){
   if(!isLatin(char)){out+=char;continue}
   const step=next(out,char);
   if(!step){out+=char;continue}
   out=out.slice(0,out.length-step.remove)+step.add;
  }
  return out;
 }
 // Let a text field or textarea do this while `enabled()` is true.
 function attach(field,enabled=()=>true){
  field.addEventListener('beforeinput',event=>{
   if(event.inputType!=='insertText'||!event.data||event.data.length!==1||!isLatin(event.data)||!enabled()||event.isComposing)return;
   const start=field.selectionStart,end=field.selectionEnd,value=field.value;
   // A word ends at a space or the start; only the letters just before the caret matter.
   const before=value.slice(0,start),step=next(before,event.data);
   if(!step)return;
   event.preventDefault();
   const from=Math.max(0,start-step.remove);
   field.setRangeText(step.add,from,end,'end');
   field.dispatchEvent(new Event('input',{bubbles:true}));
  });
 }
 return {convert,next,attach,isLatin};
})();
if(typeof module!=='undefined')module.exports=Translit;
