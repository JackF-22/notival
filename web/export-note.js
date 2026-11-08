/* Share a note: lay it out as a clean document and hand it to the Mac to save as a PDF or a Word file. */
(()=>{
 const esc=text=>String(text??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const css=`
  *{box-sizing:border-box}
  body{margin:0;color:#1f2430;font:11.5pt/1.6 "Iowan Old Style","Palatino","Georgia",serif;-webkit-print-color-adjust:exact}
  header.note-head{margin:0 0 22pt;padding-bottom:12pt;border-bottom:1pt solid #c9ccd6}
  h1.note-title{margin:0 0 4pt;font:700 25pt/1.2 -apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;letter-spacing:-.4pt}
  .note-meta{margin:0;color:#6b7080;font:9.5pt -apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif}
  h1,h2,h3{font-family:-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;line-height:1.25;break-after:avoid}
  h1{font-size:18pt;margin:20pt 0 6pt}h2{font-size:14.5pt;margin:16pt 0 5pt}h3{font-size:12pt;margin:12pt 0 4pt}
  p,div{margin:0 0 6pt}ul,ol{margin:0 0 8pt;padding-left:22pt}li{margin:0 0 2pt}
  blockquote{margin:8pt 0;padding:2pt 0 2pt 12pt;border-left:2.5pt solid #b9bdd0;color:#4a4f60}
  img{max-width:100%;height:auto;break-inside:avoid}
  table{border-collapse:collapse;margin:8pt 0;max-width:100%;break-inside:avoid}
  td,th{border:.75pt solid #b9bdd0;padding:4pt 7pt;vertical-align:top}th{background:#f0f1f7}
  pre{margin:8pt 0;padding:9pt 11pt;background:#f4f5f9;border:.75pt solid #dcdfe8;border-radius:4pt;font:9pt/1.5 Menlo,Monaco,Courier,monospace;white-space:pre-wrap;word-wrap:break-word;break-inside:avoid}
  code{font-family:Menlo,Monaco,Courier,monospace;font-size:.9em}
  .task-row{margin:0 0 3pt}
  .display-equation{margin:8pt 0;text-align:center}
  .procedure{margin:10pt 0;font:11pt/1.5 'Times New Roman',Times,serif;border-top:1.6pt solid #000;border-bottom:.8pt solid #000;page-break-inside:avoid}.procedure b{font-weight:700}.procedure .proc-title{padding:2pt 0 3pt;border-bottom:.6pt solid #000}.procedure .proc-head{padding:4pt 0 2pt}.procedure .proc-body{padding:3pt 0 5pt}.procedure .proc-block{margin-left:5pt;padding-left:13pt;border-left:.6pt solid #000}.procedure .proc-comment{font:9pt/1.4 Menlo,Courier,monospace;margin-left:4pt}.procedure .proc-no{display:inline-block;width:16pt;color:#666;font-size:8.5pt}.procedure .proc-edit{display:none}
  .cols{display:flex;gap:22pt;margin:6pt 0;align-items:flex-start}.cols>.col{flex:1 1 0;min-width:0}.cols>.col>:first-child{margin-top:0}.cols>.col>:last-child{margin-bottom:0}
  .cell{margin:0 0 10pt}
  .cell.pdf-note{padding-left:10pt;border-left:2.5pt solid #b8aef0}
  h1.guide-note-title{margin:30pt 0 8pt;padding-top:14pt;border-top:1pt solid #c9ccd6;font-size:19pt}
  .guide-pdfs{margin:0 0 6pt;padding-left:18pt;font:10pt -apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif}
  .source{margin:0 0 6pt;color:#6b7080;font:9pt -apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif}
 `;
 // One block of the note, cleaned up for reading rather than editing.
 let procedures=0;   // "Algorithm 1, 2, …" run through the whole note
 function cell(block,format,note){
  if(block.type==='code'){
   const pre=document.createElement('pre');pre.textContent=block.text||'';
   const box=document.createElement('div');box.className='cell';box.append(pre);return box;
  }
  const box=document.createElement('div');box.className='cell'+(block.pdfRef?' pdf-note':'');
  box.innerHTML=block.html?RichEditor.cleanHTML(block.html):(RichEditor.fromMarkdown?RichEditor.fromMarkdown(block.text||''):esc(block.text));
  box.querySelectorAll('.equation').forEach(item=>{
   const source=item.dataset.equation||'',display=item.classList.contains('display-equation');
   if(format==='pdf'&&typeof katex!=='undefined'){
    try{item.innerHTML=katex.renderToString(MathSyntax.katexSource(source),{displayMode:display,throwOnError:false,trust:false,output:'html'});return}catch{}
   }
   item.textContent=display?source:source;item.style.fontStyle='italic';
  });
  box.querySelectorAll('.procedure').forEach(item=>{
   procedures++;item.removeAttribute('contenteditable');
   item.innerHTML=ProcedureModel.html(item.dataset.procedure||'',{number:procedures,numbered:item.dataset.numbered==='1',katex:typeof katex!=='undefined'?katex:null});
  });
  box.querySelectorAll('.task-row').forEach(row=>{
   const done=row.dataset.task==='done'||!!row.querySelector('input:checked');
   row.querySelector('input')?.replaceWith(document.createTextNode(done?'☑ ':'☐ '));
  });
  // Braces, side notes and shapes drawn around the text go beside the lines they belong to.
  window.marginAnnotations?.decorate(box,note,format);
  box.querySelectorAll('[contenteditable]').forEach(item=>item.removeAttribute('contenteditable'));
  box.querySelectorAll('button,.image-handle,.resize-handle,.cell-copy,.word-count,.block-tools').forEach(item=>item.remove());
  return box;
 }
 function build(note,format){
  const project=state.projects?.find(item=>item.id===note.projectId);
  const date=new Date(note.updated||Date.now()).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});
  const meta=[project?.name,date].filter(Boolean).join('  ·  ');
  const body=document.createElement('div');
  procedures=0;note.blocks.forEach(block=>body.append(cell(block,format,note)));
  const title=note.title?.trim()||'Untitled note';
  const katexCSS=format==='pdf'?'<link rel="stylesheet" href="math/katex.min.css">':'';
  return {title,html:`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${katexCSS}<style>${css}${window.marginAnnotations?.exportCSS||''}</style></head><body><header class="note-head"><h1 class="note-title">${esc(title)}</h1><p class="note-meta">${esc(meta)}</p></header>${body.innerHTML}</body></html>`};
 }
 // An end-of-unit study guide: the unit's notes in order, then a list of the PDFs the app appends after them.
 function buildGuide(title,subtitle,notes,pdfNames=[]){
  const body=document.createElement('div');
  for(const note of notes){
   const heading=document.createElement('h1');heading.className='guide-note-title';heading.textContent=note.title?.trim()||'Untitled note';body.append(heading);
   procedures=0;note.blocks.forEach(block=>body.append(cell(block,'pdf',note)));
  }
  const list=pdfNames.length?`<h2>Attached PDFs</h2><ul class="guide-pdfs">${pdfNames.map(name=>`<li>${esc(name)}</li>`).join('')}</ul>`:'';
  const name=title?.trim()||'Study guide';
  return {title:name,html:`<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><link rel="stylesheet" href="math/katex.min.css"><style>${css}${window.marginAnnotations?.exportCSS||''}</style></head><body><header class="note-head"><h1 class="note-title">${esc(name)}</h1><p class="note-meta">${esc(subtitle||'')}</p></header>${list}${body.innerHTML}</body></html>`};
 }
 function sendGuide(title,subtitle,notes,pdfs){
  const channel=window.webkit?.messageHandlers?.margin;
  if(!channel){window.toast?.('Export works in the Notival app');return}
  const doc=buildGuide(title,subtitle,notes,pdfs.map(item=>item.name));
  channel.postMessage({type:'exportGuide',title:doc.title,html:doc.html,pdfs:pdfs.map(item=>item.path)});
 }
 function send(format,note=current()){
  if(!note)return;
  const channel=window.webkit?.messageHandlers?.margin;
  const doc=build(note,format);
  if(!channel){window.toast?.('Export works in the Notival app');return}
  channel.postMessage({type:'exportNote',format,title:doc.title,html:doc.html});
 }
 window.NotivalExport={build,send,buildGuide,sendGuide};

 const header=document.querySelector('.header-actions');if(!header)return;
 const share=document.createElement('button');share.id='share-note';share.type='button';share.title='Export this note as a PDF or Word document';share.setAttribute('aria-label','Export note');share.setAttribute('aria-haspopup','menu');
 share.innerHTML='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10V1.8M5 4.6 8 1.6l3 3M3.5 7.5v5.2c0 .5.4.8.8.8h7.4c.4 0 .8-.3.8-.8V7.5"/></svg><span>Share</span>';
 const after=document.querySelector('#delete');after?.parentElement===header?header.insertBefore(share,after):header.append(share);
 const menu=document.createElement('div');menu.id='share-menu';menu.setAttribute('role','menu');menu.hidden=true;document.body.append(menu);
 for(const [label,format] of [['Export as PDF','pdf'],['Export as Word document','docx']]){
  const item=document.createElement('button');item.type='button';item.setAttribute('role','menuitem');item.textContent=label;item.onclick=()=>{menu.hidden=true;send(format)};menu.append(item);
 }
 share.onclick=event=>{
  event.stopPropagation();if(!menu.hidden){menu.hidden=true;return}
  const box=share.getBoundingClientRect();menu.hidden=false;
  menu.style.top=box.bottom+6+'px';menu.style.left=Math.max(8,box.right-menu.offsetWidth)+'px';
 };
 document.addEventListener('click',()=>{menu.hidden=true});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')menu.hidden=true});
 const article=document.querySelector('article');
 const sync=()=>{const open=!!current()&&!article.hidden;share.hidden=!open;if(!open)menu.hidden=true};
 new MutationObserver(sync).observe(article,{attributes:true,attributeFilter:['hidden']});
 const baseRender=render;render=function(...args){const result=baseRender.apply(this,args);sync();return result};sync();
})();
