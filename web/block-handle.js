/* A small handle beside each line of the note: it shows what the line is and turns it into something else. */
(()=>{
 const root=document.querySelector('#editor');if(!root)return;
 const handle=document.createElement('button');handle.type='button';handle.id='block-handle';handle.hidden=true;handle.setAttribute('aria-haspopup','menu');
 document.body.append(handle);
 const kinds=[['p','Text','¶'],['h1','Heading 1','H1'],['h2','Heading 2','H2'],['h3','Heading 3','H3'],['ul','Bulleted list','•'],['ol','Numbered list','1.'],['task','Checklist','☑'],['quote','Quote','❞'],['code','Code block','</>']];
 const symbol=Object.fromEntries(kinds.map(([id,,mark])=>[id,mark])),label=Object.fromEntries(kinds.map(([id,name])=>[id,name]));
 let unit=null,editor=null,timer=0,menu=null;
 const isList=el=>el?.tagName==='UL'||el?.tagName==='OL';
 // The thing the handle belongs to: a top-level block, or one top-level list item.
 function unitAt(rich,node){
  let el=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;if(!el||!rich.contains(el))return null;
  // A line is a direct child of the text, or of one of its columns.
  const inner=el;while(el&&el.parentElement!==rich&&!el.parentElement?.classList?.contains('col'))el=el.parentElement;if(!el)return null;
  if(el.classList.contains('cols')||el.classList.contains('col'))return null;
  if(isList(el)){let item=inner.closest('li');while(item&&item.parentElement!==el)item=item.parentElement;return item||null}
  return el;
 }
 function kindOf(el){
  if(!el)return null;
  if(el.classList.contains('cols')||el.classList.contains('col'))return null;
  if(el.tagName==='LI')return el.parentElement.tagName==='UL'?'ul':'ol';
  if(/^H[1-3]$/.test(el.tagName))return el.tagName.toLowerCase();
  if(el.tagName==='BLOCKQUOTE')return 'quote';
  if(el.tagName==='PRE')return 'code';
  if(el.classList.contains('task-row'))return 'task';
  if(/^(P|DIV)$/.test(el.tagName)&&!el.classList.contains('equation')&&!el.classList.contains('procedure'))return 'p';
  return null;
 }
 function place(){
  if(!unit?.isConnected||!editor){handle.hidden=true;return}
  const kind=kindOf(unit);if(!kind){handle.hidden=true;return}
  const box=unit.getBoundingClientRect(),home=editor.getBoundingClientRect(),size=getComputedStyle(unit);
  const line=parseFloat(size.lineHeight)||(parseFloat(size.fontSize)||15)*1.6;
  handle.textContent=symbol[kind];handle.title='Click to turn this line into… (now: '+label[kind]+') · drag it beside another line to make columns';handle.setAttribute('aria-label',handle.title);
  // A line in a column carries its handle in the gap just to its left, not out at the edge of the cell.
  Object.assign(handle.style,{left:Math.max(6,unit.closest('.col')?box.left-34:home.left-40)+'px',top:(box.top+Math.max(0,(line-24)/2))+'px'});handle.hidden=false;
 }
 // What the drag-to-columns code needs to know about the line the handle is on.
 window.marginBlockHandle={handle,unit:()=>unit,editor:()=>editor,menuOpen:()=>!!menu,hide:()=>{handle.hidden=true}};
 const show=(rich,node)=>{const next=unitAt(rich,node);if(!next||!kindOf(next))return false;clearTimeout(timer);unit=next;editor=rich;if(!menu)place();return true};
 const hideSoon=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!menu){handle.hidden=true;unit=null}},350)};
 root.addEventListener('mousemove',event=>{
  const rich=event.target.closest?.('.rich-text');
  if(rich&&!event.target.closest('.equation,table,img,.procedure')){if(!show(rich,event.target))hideSoon()}
  else if(!menu)hideSoon();
 });
 root.addEventListener('mouseleave',()=>{if(!menu)hideSoon()});
 root.addEventListener('keydown',()=>{if(!menu){clearTimeout(timer);handle.hidden=true}},true);
 handle.addEventListener('pointerenter',()=>clearTimeout(timer));handle.addEventListener('pointerleave',()=>{if(!menu)hideSoon()});
 handle.onmousedown=event=>event.preventDefault();
 for(const type of ['scroll','resize'])window.addEventListener(type,()=>{if(menu){closeMenu()}place()},true);
 // ---- conversion ----
 const keepInline=el=>{
  if(el.tagName==='LI')return [...el.childNodes].filter(n=>!(n.nodeType===Node.ELEMENT_NODE&&isList(n)));
  if(el.classList.contains('task-row'))return [...(el.querySelector('span')?.childNodes||[])];
  if(el.tagName==='PRE')return [document.createTextNode(el.textContent)];
  return [...el.childNodes];
 };
 const empty=el=>!el.textContent.trim()&&!el.querySelector('br,img');
 function make(kind,nodes){
  if(/^(p|h[1-3])$/.test(kind)){const el=document.createElement(kind);el.append(...nodes);if(empty(el))el.append(document.createElement('br'));return el}
  if(kind==='quote'){const el=document.createElement('blockquote');el.append(...nodes);if(empty(el))el.append(document.createElement('br'));return el}
  if(kind==='code'){const pre=document.createElement('pre'),code=document.createElement('code');code.textContent=nodes.map(n=>n.textContent).join('');pre.append(code);return pre}
  if(kind==='task'){const row=document.createElement('div');row.className='task-row';row.dataset.task='open';const box=document.createElement('input');box.type='checkbox';box.contentEditable='false';const text=document.createElement('span');text.append(...nodes);if(empty(text))text.append(document.createElement('br'));row.append(box,text);return row}
  const list=document.createElement(kind),item=document.createElement('li');item.append(...nodes);if(empty(item))item.append(document.createElement('br'));list.append(item);return list;
 }
 function convert(rich,item,kind){
  if(!item.isConnected||kindOf(item)===kind)return;
  let landing;
  if(item.tagName==='LI'){
   const list=item.parentElement;
   if(kind==='ul'||kind==='ol'){const swapped=document.createElement(kind);while(list.firstChild)swapped.append(list.firstChild);list.replaceWith(swapped);landing=item}
   else{
    const items=[...list.children],at=items.indexOf(item),nested=[...item.children].filter(isList),parts=[];
    if(at>0){const before=list.cloneNode(false);before.append(...items.slice(0,at));parts.push(before)}
    const made=make(kind,keepInline(item));parts.push(made,...nested);
    if(at<items.length-1){const after=list.cloneNode(false);after.append(...items.slice(at+1));parts.push(after)}
    list.replaceWith(...parts);landing=made;
   }
  }else{const made=make(kind,keepInline(item));item.replaceWith(made);landing=made}
  rich.focus();
  const target=isList(landing)?landing.lastElementChild:landing.classList?.contains('task-row')?landing.querySelector('span'):landing,range=document.createRange();
  range.selectNodeContents(landing.tagName==='PRE'?landing.querySelector('code'):target);range.collapse(false);
  const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
  unit=landing.tagName==='LI'||isList(landing)?(isList(landing)?landing.firstElementChild:landing):landing;
  rich.dispatchEvent(new Event('input',{bubbles:true}));
  requestAnimationFrame(place);
 }
 // ---- menu ----
 function closeMenu(){menu?.remove();menu=null;handle.setAttribute('aria-expanded','false')}
 handle.addEventListener('click',()=>{
  if(menu){closeMenu();return}
  const rich=editor,item=unit;if(!rich||!item)return;
  const current=kindOf(item);
  menu=document.createElement('div');menu.className='table-menu block-menu';menu.setAttribute('role','menu');
  for(const [id,name,mark] of kinds){
   const row=document.createElement('button');row.type='button';row.setAttribute('role','menuitemradio');row.setAttribute('aria-checked',String(id===current));
   const badge=document.createElement('span');badge.className='block-menu-mark';badge.textContent=mark;row.append(badge,document.createTextNode(name));if(id===current)row.classList.add('current');
   row.onmousedown=e=>e.preventDefault();row.onclick=()=>{closeMenu();convert(rich,item,id)};menu.append(row);
  }
  // Moving a line next to another, for people who would rather click than drag.
  // Other features add their own entries for a line (linking it to another, say) through marginBlockMenuExtras.
  const layout=[...(window.LineColumns?.menuItems(rich,item)||[]),...(window.marginBlockMenuExtras||[]).flatMap(extra=>extra(rich,item)||[])];
  if(layout.length){
   const rule=document.createElement('div');rule.className='block-menu-rule';rule.setAttribute('role','separator');menu.append(rule);
   for(const [name,mark,run] of layout){
    const row=document.createElement('button');row.type='button';row.setAttribute('role','menuitem');
    const badge=document.createElement('span');badge.className='block-menu-mark';badge.textContent=mark;row.append(badge,document.createTextNode(name));
    row.onmousedown=e=>e.preventDefault();row.onclick=()=>{closeMenu();run()};menu.append(row);
   }
  }
  document.body.append(menu);handle.setAttribute('aria-expanded','true');
  const box=handle.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(box.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(box.bottom+6,innerHeight-menu.offsetHeight-8))+'px';
  const close=event=>{if(event.type==='keydown'&&event.key!=='Escape')return;if(event.type==='pointerdown'&&(menu?.contains(event.target)||handle.contains(event.target)))return;closeMenu();for(const type of ['pointerdown','keydown','blur'])window.removeEventListener(type,close,true)};
  for(const type of ['pointerdown','keydown','blur'])window.addEventListener(type,close,true);
  menu.querySelector('.current')?.scrollIntoView?.({block:'nearest'});
 });
})();
