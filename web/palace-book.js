// The book reader for a memory palace: a book (or notebook, or letter) pulled off a shelf, held up in front of you and read
// by turning its pages. Pure screen work: it takes a title, some pages of text and a colour, and gives back a handle.
//
//   PalaceBook.open({title, detail, pages:[{text}], color, origin:{x,y}, mount, onClose}) -> {close, next, prev, spread, sheets}
//
// A book is a run of "sheets": the cover, then each page. A spread shows two of them side by side (the cover alone at first),
// and a turning leaf carries one sheet on its front and the next on its back.
const PalaceBook=(()=>{
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const dark=hex=>{const m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex||'');if(!m)return true;return (.299*parseInt(m[1],16)+.587*parseInt(m[2],16)+.114*parseInt(m[3],16))<150};
 const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const TURN=650;

 function open({title='',detail='',pages=[],color='#3f6f8f',origin=null,mount=document.body,onClose}){
  const written=pages.map(p=>String(p?.text??p??''));
  const sheets=[{cover:true},...(written.length?written:['']).map(text=>({text}))];
  if(sheets.length%2===0)sheets.push({text:'',end:true});   // the last spread always has a right-hand page
  const last=Math.floor((sheets.length-1)/2);
  let k=0,busy=false,closed=false;

  const scrim=el('div','pb-scrim'),book=el('div','pb-book'),left=el('div','pb-side pb-left'),right=el('div','pb-side pb-right');
  scrim.setAttribute('role','dialog');scrim.setAttribute('aria-label',title||'Book');
  book.append(left,right);
  const face=sheet=>{
   const page=el('div','pb-page');
   if(!sheet){page.classList.add('is-none');return page}
   if(sheet.cover){
    page.classList.add('pb-cover',dark(color)?'is-dark':'is-light');page.style.background=color;
    page.append(el('div','pb-cover-title',title||'Untitled'));if(detail)page.append(el('div','pb-cover-detail',detail));
    return page;
   }
   const n=sheets.indexOf(sheet);
   page.append(sheet.text?el('div','pb-text',sheet.text):el('div','pb-text is-empty',sheet.end?'':'Nothing written on this page yet.'),el('div','pb-number',sheet.end?'':String(n)));
   return page;
  };
  const sheetAt=i=>i>=0&&i<sheets.length?sheets[i]:null;
  const paint=()=>{
   left.replaceChildren(face(k>0?sheetAt(2*k-1):null));right.replaceChildren(face(sheetAt(2*k)));
   book.classList.toggle('is-closed',k===0);
   counter.textContent=k===0?'Cover':'Pages '+(2*k-1)+(sheetAt(2*k)&&!sheetAt(2*k).end?'–'+(2*k):'')+' of '+written.length;
   prevButton.disabled=k===0;nextButton.disabled=k>=last;
  };

  const counter=el('div','pb-counter'),prevButton=el('button','pb-turn pb-prev','‹'),nextButton=el('button','pb-turn pb-next','›'),closeButton=el('button','pb-close','✕');
  for(const b of [prevButton,nextButton,closeButton])b.type='button';
  prevButton.setAttribute('aria-label','Previous page');nextButton.setAttribute('aria-label','Next page');closeButton.setAttribute('aria-label','Put the book back');
  const bar=el('div','pb-bar');bar.append(prevButton,counter,nextButton);
  scrim.append(closeButton,book,bar);

  function turn(dir){
   if(busy||closed)return false;
   const to=k+dir;if(to<0||to>last)return false;
   busy=true;
   if(reduced()){k=to;paint();busy=false;return true}
   const leaf=el('div','pb-leaf'),front=el('div','pb-face pb-front'),back=el('div','pb-face pb-back');
   if(dir>0){
    // the right-hand sheet lifts and lands on the left; the next right-hand sheet is already waiting underneath
    front.append(face(sheetAt(2*k)));back.append(face(sheetAt(2*k+1)));right.replaceChildren(face(sheetAt(2*k+2)));
   }else{
    front.append(face(sheetAt(2*k-2)));back.append(face(sheetAt(2*k-1)));left.replaceChildren(face(to>0?sheetAt(2*to-1):null));
   }
   leaf.append(front,back);book.append(leaf);
   leaf.style.transform=dir>0?'rotateY(0deg)':'rotateY(-180deg)';
   book.classList.toggle('is-closed',to===0);
   void leaf.offsetWidth;
   leaf.style.transition='transform '+TURN+'ms cubic-bezier(.45,.05,.25,1)';leaf.style.transform=dir>0?'rotateY(-180deg)':'rotateY(0deg)';
   let finished=false;
   const done=()=>{if(finished)return;finished=true;leaf.remove();k=to;paint();busy=false};
   leaf.addEventListener('transitionend',done,{once:true});setTimeout(done,TURN+150);
   return true;
  }
  const next=()=>turn(1),prev=()=>turn(-1);
  nextButton.onclick=next;prevButton.onclick=prev;
  // a click on a page turns it: the right-hand one forwards, the left-hand one back
  right.onclick=next;left.onclick=prev;

  const keydown=event=>{
   if(event.key==='ArrowRight'||event.key==='PageDown'||event.key===' '){event.preventDefault();event.stopPropagation();next()}
   else if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();event.stopPropagation();prev()}
   else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}
  };
  window.addEventListener('keydown',keydown,true);

  // Coming off the shelf: from where it sat on screen to the middle, turning to face you. Going back is the same in reverse.
  const away=()=>{
   const w=window.innerWidth,h=window.innerHeight,ox=origin?origin.x:w/2,oy=origin?origin.y:h*1.1;
   return 'translate('+Math.round(ox-w/2)+'px,'+Math.round(oy-h/2)+'px) scale(.06) rotateY(-75deg)';
  };
  paint();
  mount.append(scrim);
  if(reduced()){scrim.classList.add('is-in')}
  else{
   book.style.transform=away();book.style.opacity='0';
   void book.offsetWidth;
   scrim.classList.add('is-in');book.style.transition='transform .75s cubic-bezier(.2,.8,.2,1),opacity .4s ease';book.style.transform='';book.style.opacity='1';
  }
  function close(){
   if(closed)return;closed=true;window.removeEventListener('keydown',keydown,true);
   const finish=()=>{scrim.remove();onClose?.()};
   if(reduced()){finish();return}
   scrim.classList.remove('is-in');book.style.transition='transform .55s cubic-bezier(.5,0,.8,.4),opacity .5s ease';book.style.transform=away();book.style.opacity='0';
   setTimeout(finish,560);
  }
  closeButton.onclick=close;
  scrim.addEventListener('pointerdown',event=>{if(event.target===scrim)close()});
  return {close,next,prev,spread:()=>k,sheets:()=>sheets.length,root:scrim,isBusy:()=>busy};
 }

 // ── Making pages out of other things ────────────────────────────────────────
 // Text into pages of about `size` characters, breaking at paragraphs, then sentences, then words.
 function paginate(text,size=420){
  const pieces=String(text||'').split(/\n{1,}/).map(s=>s.trim()).filter(Boolean),out=[];let page='';
  const push=()=>{if(page.trim())out.push({text:page.trim()});page=''};
  const add=chunk=>{if(page&&(page+'\n\n'+chunk).length>size)push();page=page?page+'\n\n'+chunk:chunk};
  for(const piece of pieces){
   if(piece.length<=size){add(piece);continue}
   let run='';
   for(const sentence of piece.match(/[^.!?]+[.!?]*\s*/g)||[piece]){
    if(sentence.length>size){if(run){add(run.trim());run=''}for(const word of sentence.split(/\s+/)){if((run+' '+word).length>size){add(run.trim());run=''}run+=(run?' ':'')+word}continue}
    if((run+sentence).length>size){add(run.trim());run=''}run+=sentence;
   }
   if(run.trim())add(run.trim());
  }
  push();return out;
 }
 // A list of {title, detail} into pages: `per` entries to a page, one line each.
 const listPages=(items,per=8)=>{const out=[];for(let i=0;i<items.length;i+=per)out.push({text:items.slice(i,i+per).map(it=>it.detail?it.title+' — '+it.detail:it.title).join('\n')});return out};

 return {open,paginate,listPages};
})();
if(typeof module!=='undefined')module.exports=PalaceBook;
