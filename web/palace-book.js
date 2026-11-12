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
 // Text with $…$ (inline) or $$…$$ (display) comes back as a fragment with the LaTeX typeset; if KaTeX can't read an equation
 // its source is shown as typed.
 const MATH_SPLIT=/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/;
 function typeset(text){
  const out=document.createDocumentFragment();
  for(const part of String(text??'').split(MATH_SPLIT)){
   if(!part)continue;const m=part.match(/^(\$\$?)([\s\S]+?)\1$/);
   if(m&&typeof katex!=='undefined'){
    const box=el('span',m[1]==='$$'?'pb-math is-display':'pb-math');
    try{const source=m[2].trim();katex.render(window.MathSyntax?.katexSource?MathSyntax.katexSource(source):source,box,{displayMode:m[1]==='$$',throwOnError:true,trust:false,maxExpand:1000,maxSize:20})}catch{box.textContent=part;box.classList.add('is-source')}
    out.append(box);
   }else out.append(document.createTextNode(part));
  }
  return out;
 }

 // Snippets for people who do not write LaTeX by heart: each puts a ready-made equation at the cursor.
 const SNIPPETS=[['x²','$x^2$'],['a⁄b','$\\frac{a}{b}$'],['√','$\\sqrt{x}$'],['xₙ','$x_{n}$'],['Σ','$\\sum_{i=1}^{n} i$'],['∫','$\\int_{a}^{b} f(x)\\,dx$'],['lim','$\\lim_{x \\to 0} \\frac{\\sin x}{x}$'],['π','$\\pi$'],['θ','$\\theta$'],['Δ','$\\Delta$'],['∞','$\\infty$'],['≤','$\\leq$'],['→','$\\to$'],['Display','$$\n\n$$']];

 // open({title, detail, pages:[{text}], color, origin, mount, editable, edit, onChange({title,detail,pages}), onClose}) -> handle
 function open({title='',detail='',pages=[],color='#3f6f8f',origin=null,mount=document.body,editable=false,edit=false,page:startPage=0,onChange,onClose}){
  const written=pages.map(p=>String(p?.text??p??''));if(!written.length)written.push('');
  let sheets=[],last=0,k=0,busy=false,closed=false,editing=!!(editable&&edit),lastInput=null,timer=0;
  const rebuild=()=>{
   sheets=[{cover:true},...written.map((text,i)=>({text,index:i+1}))];
   if(sheets.length%2===0)sheets.push({text:'',end:true});   // the last spread always has a right-hand page
   last=Math.floor((sheets.length-1)/2);
  };
  rebuild();
  const flush=()=>{clearTimeout(timer);timer=0;onChange?.({title,detail,pages:written.map(text=>({text}))})};
  const changed=()=>{clearTimeout(timer);timer=setTimeout(flush,450)};

  const scrim=el('div','pb-scrim'),book=el('div','pb-book'),left=el('div','pb-side pb-left'),right=el('div','pb-side pb-right');
  scrim.setAttribute('role','dialog');scrim.setAttribute('aria-label',title||'Book');
  book.append(left,right);
  const input=(tag,cls,value,placeholder,label)=>{const n=el(tag,cls);n.value=value;n.placeholder=placeholder;n.setAttribute('aria-label',label);return n};
  const coverFace=page=>{
   page.classList.add('pb-cover',dark(color)?'is-dark':'is-light');page.style.background=color;
   if(editing){
    const t=input('input','pb-cover-input pb-cover-title',title,'Title of the book','Title'),d=input('input','pb-cover-input pb-cover-detail',detail,'A line under it (optional)','Subtitle');
    t.oninput=()=>{title=t.value;changed()};d.oninput=()=>{detail=d.value;changed()};
    page.append(t,d,el('div','pb-cover-hint','Click ✎ Write again to go back to reading'));return;
   }
   const heading=el('div','pb-cover-title');heading.append(typeset(title||'Untitled'));page.append(heading);
   if(detail){const sub=el('div','pb-cover-detail');sub.append(typeset(detail));page.append(sub)}
  };
  // A page you can write on: the text on top, and under it the same text with its equations drawn large.
  const editFace=(page,sheet)=>{
   page.classList.add('is-editing');
   const head=el('div','pb-edit-head'),del=el('button','pb-page-x','Remove page');del.type='button';del.onclick=event=>{event.stopPropagation();removePage(sheet.index)};
   head.append(el('span','','Page '+sheet.index),del);
   const ta=input('textarea','pb-input',sheet.text,'Write here. Put equations between dollar signs: $x^2$','Page '+sheet.index),live=el('div','pb-live pb-text');
   const draw=()=>{live.replaceChildren();if(ta.value.trim())live.append(typeset(ta.value));else live.append(el('span','pb-live-empty','What you type shows here, with equations drawn.'))};
   ta.oninput=()=>{sheet.text=ta.value;written[sheet.index-1]=ta.value;draw();changed()};
   ta.addEventListener('focus',()=>{lastInput=ta});ta.addEventListener('pointerdown',event=>event.stopPropagation());ta.addEventListener('click',event=>event.stopPropagation());
   draw();page.append(head,ta,live);
  };
  const face=sheet=>{
   const page=el('div','pb-page');
   if(!sheet){page.classList.add('is-none');return page}
   if(sheet.cover){coverFace(page);return page}
   if(editing&&!sheet.end){editFace(page,sheet);return page}
   const n=sheets.indexOf(sheet);
   const body=el('div','pb-text'+(sheet.text?'':' is-empty'));if(sheet.text)body.append(typeset(sheet.text));else body.textContent=sheet.end?'':'Nothing written on this page yet.';
   page.append(body,el('div','pb-number',sheet.end?'':String(n)));
   return page;
  };
  const sheetAt=i=>i>=0&&i<sheets.length?sheets[i]:null;
  const paint=()=>{
   left.replaceChildren(face(k>0?sheetAt(2*k-1):null));right.replaceChildren(face(sheetAt(2*k)));
   book.classList.toggle('is-closed',k===0);book.classList.toggle('is-editing',editing);scrim.classList.toggle('is-editing',editing);
   counter.textContent=k===0?'Cover':'Pages '+(2*k-1)+(sheetAt(2*k)&&!sheetAt(2*k).end?'–'+(2*k):'')+' of '+written.length;
   prevButton.disabled=k===0;nextButton.disabled=k>=last;
   writeButton.setAttribute('aria-pressed',String(editing));writeButton.textContent=editing?'✎ Reading':'✎ Write';snips.hidden=!editing;addButton.hidden=!editing;
  };

  const counter=el('div','pb-counter'),prevButton=el('button','pb-turn pb-prev','‹'),nextButton=el('button','pb-turn pb-next','›'),closeButton=el('button','pb-close','✕');
  const writeButton=el('button','pb-tool','✎ Write'),addButton=el('button','pb-tool','+ Page');
  for(const b of [prevButton,nextButton,closeButton,writeButton,addButton])b.type='button';
  prevButton.setAttribute('aria-label','Previous page');nextButton.setAttribute('aria-label','Next page');closeButton.setAttribute('aria-label','Put the book back');
  writeButton.hidden=!editable;
  const bar=el('div','pb-bar'),snips=el('div','pb-snips');
  bar.append(prevButton,counter,nextButton,writeButton,addButton);
  // equation snippets: one click puts a ready-made equation at the cursor in the page being written
  snips.append(el('span','pb-snips-label','Equations'));
  for(const [label,code] of SNIPPETS){
   const b=el('button','pb-snip',label);b.type='button';b.title=code.replace(/\n/g,' ');
   b.onmousedown=event=>event.preventDefault();   // keep the cursor where it is
   b.onclick=()=>{
    const ta=lastInput&&lastInput.isConnected?lastInput:scrim.querySelector('.pb-side .pb-input');if(!ta)return;
    const at=ta.selectionStart??ta.value.length,end=ta.selectionEnd??at;
    ta.value=ta.value.slice(0,at)+code+ta.value.slice(end);const inner=code.indexOf('{');ta.selectionStart=ta.selectionEnd=at+(code.startsWith('$$')?3:code.length);
    ta.focus();ta.dispatchEvent(new Event('input'));
   };
   snips.append(b);
  }
  scrim.append(closeButton,book,snips,bar);

  function removePage(index){
   if(written.length<=1){written[0]='';}else written.splice(index-1,1);
   rebuild();k=Math.min(k,last);paint();flush();
  }
  function addPage(){
   if(busy)return;written.push('');rebuild();const target=Math.ceil(written.length/2);
   const go=()=>{k=target;paint();flush();const ta=scrim.querySelector('.pb-side .pb-input:last-of-type');(scrim.querySelector('.pb-right .pb-input')||ta)?.focus()};
   if(k===target){paint();flush()}else{goto(written.length,go)}
  }
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
  // Go to the spread holding a page (1-based; 0 is the cover), turning one spread at a time.
  function goto(pageNumber,then){
   const target=pageNumber<=0?0:Math.ceil(pageNumber/2);
   const step=()=>{if(k===target){then?.();return}if(!turn(k<target?1:-1)){then?.();return}setTimeout(step,reduced()?0:TURN+60)};step();
  }
  const next=()=>turn(1),prev=()=>turn(-1);
  nextButton.onclick=next;prevButton.onclick=prev;addButton.onclick=addPage;
  writeButton.onclick=()=>setEdit(!editing);
  function setEdit(on){if(!editable)return;editing=on;paint();if(on)setTimeout(()=>scrim.querySelector('.pb-input,.pb-cover-input')?.focus(),30)}
  // reading: a click on a page turns it (the right-hand one forwards, the left-hand one back); writing: the pages are for typing
  right.onclick=()=>{if(!editing)next()};left.onclick=()=>{if(!editing)prev()};

  const typing=target=>target&&target.matches&&target.matches('input,textarea');
  const keydown=event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return}
   if(typing(event.target)){if((event.metaKey||event.ctrlKey)&&event.key==='ArrowRight'){event.preventDefault();next()}else if((event.metaKey||event.ctrlKey)&&event.key==='ArrowLeft'){event.preventDefault();prev()}event.stopPropagation();return}
   if(event.key==='ArrowRight'||event.key==='PageDown'||event.key===' '){event.preventDefault();event.stopPropagation();next()}
   else if(event.key==='ArrowLeft'||event.key==='PageUp'){event.preventDefault();event.stopPropagation();prev()}
  };
  window.addEventListener('keydown',keydown,true);

  // Coming off the shelf: from where it sat on screen to the middle, turning to face you. Going back is the same in reverse.
  const away=()=>{
   const w=window.innerWidth,h=window.innerHeight,ox=origin?origin.x:w/2,oy=origin?origin.y:h*1.1;
   return 'translate('+Math.round(ox-w/2)+'px,'+Math.round(oy-h/2)+'px) scale(.06) rotateY(-75deg)';
  };
  if(startPage>0)k=Math.min(last,Math.ceil(startPage/2));else if(editing)k=Math.min(last,1);   // writing starts on the first page
  paint();
  mount.append(scrim);
  if(reduced()){scrim.classList.add('is-in')}
  else{
   book.style.transform=away();book.style.opacity='0';
   void book.offsetWidth;
   scrim.classList.add('is-in');book.style.transition='transform .75s cubic-bezier(.2,.8,.2,1),opacity .4s ease';book.style.transform='';book.style.opacity='1';
  }
  if(editing)setTimeout(()=>scrim.querySelector('.pb-input,.pb-cover-input')?.focus(),400);
  function close(){
   if(closed)return;closed=true;if(timer)flush();window.removeEventListener('keydown',keydown,true);
   const finish=()=>{scrim.remove();onClose?.()};
   if(reduced()){finish();return}
   scrim.classList.remove('is-in');book.style.transition='transform .55s cubic-bezier(.5,0,.8,.4),opacity .5s ease';book.style.transform=away();book.style.opacity='0';
   setTimeout(finish,560);
  }
  closeButton.onclick=close;
  scrim.addEventListener('pointerdown',event=>{if(event.target===scrim)close()});
  return {close,next,prev,goto,setEdit,addPage,spread:()=>k,sheets:()=>sheets.length,pages:()=>written.slice(),root:scrim,isBusy:()=>busy,isEditing:()=>editing};
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

 return {open,paginate,listPages,typeset};
})();
if(typeof module!=='undefined')module.exports=PalaceBook;
