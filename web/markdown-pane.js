// Markdown for GitHub: a pane beside the note that shows, as you write, exactly the Markdown GitHub would get, with one
// click to copy it or save it as a .md file in a project (pictures go in an images folder beside it). A note can be
// linked to a file, such as README.md, and kept up to date as you write. The conversion is github-markdown.js; the
// Mac side that writes the files is native/markdown.swift.
(()=>{
 const G=GithubMarkdown,header=document.querySelector('.header-actions');
 if(!header)return;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
 const button=(label,onclick,cls='',title='')=>{const b=el('button',cls,label);b.type='button';b.onclick=onclick;if(title){b.title=title;b.setAttribute('aria-label',title)}return b};
 const post=message=>window.__notivalHost?window.__notivalHost(message):native(message);
 const pref=(key,fallback)=>{try{const raw=localStorage.getItem('notival.markdown.'+key);return raw==null?fallback:JSON.parse(raw)}catch{return fallback}};
 const remember=(key,value)=>{try{localStorage.setItem('notival.markdown.'+key,JSON.stringify(value))}catch{}};
 const IMAGES='images',written=new Map();
 let last=null,timer=0,syncTimer=0,status='';

 // ── The pane ───────────────────────────────────────────────────────────────
 const toggle=button('',()=>setOpen(!pane.classList.contains('is-open')),'','Markdown for GitHub: see and save this note as Markdown');
 toggle.id='markdown-note';toggle.setAttribute('aria-haspopup','dialog');toggle.append(el('span','','MD'));
 const after=document.querySelector('#share-note')||document.querySelector('#delete');
 after?.parentElement===header?header.insertBefore(toggle,after):header.append(toggle);
 const pane=el('aside');pane.id='markdown-pane';pane.setAttribute('aria-label','Markdown for GitHub');pane.hidden=true;
 const head=el('div','md-head'),close=button('✕',()=>setOpen(false),'md-close','Close the Markdown pane');
 const heading=el('div','md-title');heading.append(el('strong','','Markdown for GitHub'),el('small','','Write normally. This is what GitHub gets.'));
 head.append(heading,close);
 const options=el('div','md-options');
 const titleBox=el('input');titleBox.type='checkbox';titleBox.id='md-title-heading';
 const titleLabel=el('label');titleLabel.append(titleBox,' Note title as the top heading');
 options.append(titleLabel);
 const source=el('pre','md-source');source.tabIndex=0;source.setAttribute('aria-label','The Markdown');
 const stats=el('p','md-stats');
 const actions=el('div','md-actions');
 const copy=button('Copy Markdown',()=>copyMarkdown(),'primary');
 const save=button('Save as .md…',()=>saveFile(false));
 actions.append(copy,save);
 const link=el('div','md-link');
 const note=el('p','md-note');
 pane.append(head,options,source,stats,actions,link,note);document.body.append(pane);

 function setOpen(open){
  pane.classList.toggle('is-open',open);pane.hidden=!open;document.body.classList.toggle('md-open',open);toggle.setAttribute('aria-pressed',String(open));
  remember('open',open);if(open)refresh();
 }
 const noteNow=()=>document.querySelector('article')?.hidden?null:current();

 // ── What the pane shows ────────────────────────────────────────────────────
 function refresh(){
  const n=noteNow();
  const open=pane.classList.contains('is-open');
  toggle.hidden=!n;pane.hidden=!(open&&n);document.body.classList.toggle('md-open',open&&!!n);
  if(!open||!n)return;
  titleBox.checked=n.mdTitle!==false;
  last=G.fromNote(n,{title:n.mdTitle!==false,imagesDir:IMAGES});
  source.textContent=last.markdown;
  const pictures=last.images.length;
  stats.textContent=last.words+' word'+(last.words===1?'':'s')+(pictures?' · '+pictures+' picture'+(pictures===1?'':'s')+' saved in an “'+IMAGES+'” folder beside the file':'');
  paintLink(n);scheduleSync(n);
 }
 function paintLink(n){
  link.replaceChildren();
  save.textContent=n.mdPath?'Save as a new file…':'Save as .md…';
  if(!n.mdPath){note.textContent=status;return}
  const name=n.mdPath.split('/').pop(),row=el('div','md-linked');
  row.append(el('span','md-file','Linked to '+name),button('Show',()=>post({type:'revealFile',path:n.mdPath}),'md-small','Show the file in Finder'),button('Unlink',()=>{delete n.mdPath;delete n.mdSync;written.delete(n.id);status='';persist();refresh()},'md-small','Stop updating this file'));
  const sync=el('label','md-sync'),box=el('input');box.type='checkbox';box.checked=!!n.mdSync;
  box.onchange=()=>{n.mdSync=box.checked;persist();if(n.mdSync){written.delete(n.id);writeLinked(n)}else status='';paintLink(n)};
  sync.append(box,' Keep '+name+' updated as I write');
  link.append(row,sync,button('Update '+name+' now',()=>writeLinked(n,true),'md-small md-now'));
  note.textContent=status;
 }

 // ── Copying and saving ─────────────────────────────────────────────────────
 function copyMarkdown(){
  if(!last)return;
  const pictures=last.images.length,message=pictures?'Markdown copied. Its '+pictures+' picture'+(pictures===1?'':'s')+' are saved with Save as .md.':'Markdown copied';
  if(window.__notivalHost||(typeof bridge!=='undefined'&&bridge))post({type:'copy',text:last.markdown,message});
  else navigator.clipboard?.writeText(last.markdown).then(()=>window.toast?.(message),()=>window.toast?.('Select the Markdown and copy it manually.'));
 }
 function payload(n){return {noteId:n.id,title:n.title||'Notes',text:last.markdown,images:last.images,imagesDir:IMAGES}}
 function saveFile(){const n=noteNow();if(!n||!last)return;post({type:'saveMarkdown',...payload(n)})}
 function writeLinked(n,loud=false){
  if(!n.mdPath||!last)return;
  if(!loud&&written.get(n.id)===last.markdown)return;
  written.set(n.id,last.markdown);post({type:'writeMarkdown',path:n.mdPath,...payload(n),loud});
 }
 // While a file is kept updated, it is rewritten a moment after you stop typing.
 function scheduleSync(n){
  clearTimeout(syncTimer);
  if(!n.mdPath||!n.mdSync)return;
  syncTimer=setTimeout(()=>{const now=noteNow();if(now&&now.id===n.id)writeLinked(n)},1200);
 }
 window.marginMarkdownSaved=data=>{
  const n=(state.notes||[]).find(item=>item.id===data?.noteId);if(!n)return;
  if(data.error){status=data.error;n.mdSync=false;persist();paintLink(n);if(noteNow()?.id===n.id)window.toast?.(data.error);return}
  if(data.path&&n.mdPath!==data.path){n.mdPath=data.path;n.mdSync=n.mdSync??false;persist()}
  written.set(n.id,last?.markdown);
  status='Saved '+data.name+' · '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+(data.images?' · '+data.images+' picture'+(data.images===1?'':'s'):'');
  if(!data.quiet)window.toast?.('Saved “'+data.name+'”');
  if(noteNow()?.id===n.id)paintLink(n);
 };

 titleBox.onchange=()=>{const n=noteNow();if(!n)return;n.mdTitle=titleBox.checked;persist();refresh()};
 // Keep it live: as the note or its title changes, and when another note opens.
 const later=()=>{clearTimeout(timer);timer=setTimeout(refresh,160)};
 document.addEventListener('input',event=>{if(event.target.closest?.('#editor,#title'))later()},true);
 const baseRender=render;render=function(...args){const result=baseRender.apply(this,args);later();return result};
 new MutationObserver(later).observe(document.querySelector('article'),{attributes:true,attributeFilter:['hidden']});
 window.NotivalMarkdown={refresh,setOpen,get last(){return last}};
// the pane comes back open if it was left open
 if(pref('open',false)){pane.classList.add('is-open');toggle.setAttribute('aria-pressed','true');refresh()}
})();
