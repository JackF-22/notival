/* A note with an attached PDF that is not open shows a strip in the margin: click anywhere on it to open the PDF beside the note. */
(()=>{
 const edge=document.createElement('button');edge.type='button';edge.id='pdf-edge';edge.hidden=true;
 edge.innerHTML='<svg class="pdf-edge-chevron" viewBox="0 0 12 20" width="14" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2 2 10l8 8"/></svg><svg class="pdf-edge-file" viewBox="0 0 24 30" width="26" height="32" aria-hidden="true"><path d="M3 1.5h12l6 6v21H3z" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15 1.5v6h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><text x="12" y="21" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" font-family="-apple-system,Helvetica,sans-serif">PDF</text></svg><span class="pdf-edge-label">Open PDF</span>';
 document.body.append(edge);
 const article=document.querySelector('article');
 function wanted(){const note=current();return !!note&&!!note.pdfPath&&openPDFPath!==note.pdfPath&&mode==='write'&&document.body.dataset.view==='note'&&!document.body.classList.contains('focus-writing')}
 function place(){
  if(!wanted()){edge.hidden=true;return}
  const note=current(),box=article.getBoundingClientRect(),column=document.querySelector('#note-column')?.getBoundingClientRect();
  // The strip fills the white space between the sidebar and the note text.
  const width=Math.min(84,Math.floor(((column?.left??box.left+60)-box.left)-12));
  if(width<44||box.height<120){edge.hidden=true;return}
  Object.assign(edge.style,{left:box.left+'px',top:box.top+'px',width:width+'px',height:box.height+'px'});
  edge.title='Open '+(note.pdfName||'the attached PDF')+' beside this note';edge.setAttribute('aria-label',edge.title);edge.hidden=false;
 }
 edge.onclick=()=>{
  const note=current();if(!note?.pdfPath)return;
  native({type:'showPDF',path:note.pdfPath});openPDFPath=note.pdfPath;
  if(typeof collapseSidebarForPDF==='function')collapseSidebarForPDF();
  renderPDFStatus(note);requestAnimationFrame(()=>{renderNoteRail();place()});place();
 };
 new ResizeObserver(place).observe(article);window.addEventListener('resize',place);article.addEventListener('scroll',place,{passive:true});
 document.querySelector('aside')?.addEventListener('transitionend',place);
 const baseRender=render;render=function(...args){const result=baseRender.apply(this,args);place();return result};
 const baseMode=setMode;setMode=function(next){const result=baseMode.call(this,next);place();return result};
 for(const name of ['marginPDFOpened','marginPDFClosed']){const base=window[name];if(typeof base==='function')window[name]=function(...args){const result=base.apply(this,args);place();return result}}
 new MutationObserver(place).observe(document.body,{attributes:true,attributeFilter:['class','data-view']});
 place();
})();
