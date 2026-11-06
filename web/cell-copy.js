/* A Copy button on every text cell: copies what you see, with formatting, and clean plain text for apps that want it. */
(()=>{
 const root=document.querySelector('#editor');if(!root)return;
 // Plain text for the clipboard: lists and tables keep their shape, equations come out as LaTeX.
 function plainOf(rich){
  const copy=rich.cloneNode(true);
  copy.querySelectorAll('.equation').forEach(item=>{
   const source=item.dataset.equation||'';
   item.replaceWith(document.createTextNode(item.classList.contains('display-equation')?`\n$$ ${source} $$\n`:`$${source}$`));
  });
  copy.querySelectorAll('input').forEach(item=>item.remove());
  copy.querySelectorAll('li').forEach(item=>{const depth=[...(function*(n){for(;n&&n!==copy;n=n.parentElement)if(n.tagName==='UL'||n.tagName==='OL')yield n})(item.parentElement)].length;item.prepend(document.createTextNode('  '.repeat(Math.max(0,depth-1))+(item.parentElement.tagName==='OL'?(Array.prototype.indexOf.call(item.parentElement.children,item)+1)+'. ':'• ')))});
  copy.querySelectorAll('li>ul,li>ol').forEach(list=>list.prepend('\n'));
  copy.querySelectorAll('td,th').forEach(item=>item.append('\t'));
  copy.querySelectorAll('br').forEach(item=>item.replaceWith('\n'));
  copy.querySelectorAll('p,div,li,h1,h2,h3,blockquote,pre,tr,.task-row').forEach(item=>item.append('\n'));
  // Items in a list are consecutive lines, with no blank line between a parent and its sub-items.
  return copy.textContent.replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{2,}(?=[ ]*(?:•|\d+\. ))/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 }
 function copyCell(rich){
  const html=RichEditor.cleanHTML(rich.innerHTML),plain=plainOf(rich),selection=getSelection();
  const saved=selection.rangeCount?selection.getRangeAt(0).cloneRange():null;
  // Let the browser's own copy do the work (it works from a click everywhere), and fill in exactly what goes on the clipboard.
  document.addEventListener('copy',event=>{event.preventDefault();event.clipboardData.setData('text/html',html);event.clipboardData.setData('text/plain',plain)},{once:true});
  const range=document.createRange();range.selectNodeContents(rich);selection.removeAllRanges();selection.addRange(range);
  let ok=false;try{ok=document.execCommand('copy')}catch{}
  selection.removeAllRanges();if(saved)selection.addRange(saved);
  if(!ok){
   // If the browser refuses, the app can still put plain text on the clipboard.
   const channel=window.webkit?.messageHandlers?.margin;
   if(channel){channel.postMessage({type:'copy',text:plain});ok=true}
  }
  return ok;
 }
 const svg=body=>`<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
 const ICON=svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 3.6V3.1A1.6 1.6 0 0 0 8.9 1.5H3.1A1.6 1.6 0 0 0 1.5 3.1v5.8a1.6 1.6 0 0 0 1.6 1.6h.4"/>'),CHECK=svg('<path d="M3 8.5l3.2 3.2L13 4.6"/>');
 function decorate(){
  const blocks=typeof current==='function'?current()?.blocks||[]:[];
  [...root.children].forEach((wrap,index)=>{
   const block=blocks[index],rich=wrap.querySelector('.rich-text'),tools=wrap.querySelector('.block-tools');
   if(!block||!rich||!tools||tools.querySelector('.cell-copy'))return;
   const button=document.createElement('button');button.type='button';button.className='cell-copy';button.innerHTML=ICON;
   button.title='Copy this cell, with its formatting';button.setAttribute('aria-label','Copy this cell');
   button.onmousedown=event=>event.preventDefault();
   let timer=0;
   button.onclick=()=>{
    const ok=copyCell(rich);button.innerHTML=ok?CHECK:ICON;button.title=ok?'Copied':'Couldn’t copy';clearTimeout(timer);timer=setTimeout(()=>{button.innerHTML=ICON;button.title='Copy this cell, with its formatting'},1300);
   };
   tools.insertBefore(button,tools.querySelector('.remove'));
  });
 }
 let pending=false;
 new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;decorate()})}).observe(root,{childList:true});
 decorate();
})();
