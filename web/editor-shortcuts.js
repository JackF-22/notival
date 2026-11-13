/* One shortcut definition drives both execution and the visible menu hints. */
(()=>{
 const mac=/Mac|iPhone|iPad/.test(navigator.platform),primary=mac?'⌘':'Ctrl+',option=mac?'⌥':'Alt+',shift=mac?'⇧':'Shift+';
 const shortcuts=[
  {command:'inlineequation',code:'KeyE',shift:true,label:primary+shift+'E'},
  {command:'highlight',code:'KeyH',shift:true,label:primary+shift+'H'},
  {command:'equation',code:'KeyE',alt:true,label:primary+option+'E'},
  {command:'table',code:'KeyT',alt:true,label:primary+option+'T'},
  {command:'image',code:'KeyI',alt:true,label:primary+option+'I'},
  {command:'task',code:'KeyL',alt:true,label:primary+option+'L'},
  {command:'quote',code:'KeyQ',alt:true,label:primary+option+'Q'},
  ...['p','h1','h2','h3'].map((value,index)=>({command:'heading',value,code:'Digit'+index,alt:true,label:primary+option+index}))
 ];
 for(const entry of shortcuts){
  if(entry.command==='heading'){const option=document.querySelector(`#heading-style option[value="${entry.value}"]`);option.textContent+=' · '+entry.label;entry.run=()=>RichEditor.command('heading',entry.value);continue}
  const button=document.querySelector(`[data-command="${entry.command}"]`);if(!button)continue;entry.run=()=>button.click();const hint=document.createElement('kbd');hint.className='shortcut-hint';hint.textContent=entry.label;hint.setAttribute('aria-hidden','true');const title=button.getAttribute('aria-label')||button.textContent;button.append(hint);button.title=title+' ('+entry.label+')';button.setAttribute('aria-keyshortcuts',(mac?'Meta':'Control')+'+'+(entry.alt?'Alt+':'Shift+')+entry.code.slice(3));
 }
 const heading=document.querySelector('#heading-style');
 function showStyle(){const selection=getSelection();if(!selection?.anchorNode)return;const node=selection.anchorNode.nodeType===Node.ELEMENT_NODE?selection.anchorNode:selection.anchorNode.parentElement;if(!node.closest?.('#editor .rich-text'))return;const paragraph=node.closest('h1,h2,h3,p,div,li,blockquote,td,th');heading.value=/^H[1-3]$/.test(paragraph?.tagName)?paragraph.tagName.toLowerCase():'p'}
 document.addEventListener('selectionchange',showStyle);document.querySelector('#editor').addEventListener('focusin',showStyle);
 window.notivalFormat=command=>{if(!['bold','italic','underline'].includes(command)||document.querySelector('dialog[open]'))return;const target=document.activeElement;if(!target?.closest?.('#editor .rich-text,#format-bar,#selection-tools'))return;RichEditor.command(command)};
 document.addEventListener('keydown',event=>{if(event.isComposing||event.altKey||event.shiftKey||!(mac?event.metaKey:event.ctrlKey)||event.target.closest?.('.equation.editing'))return;const command={KeyB:'bold',KeyI:'italic',KeyU:'underline'}[event.code];if(!command||!event.target.closest?.('#editor .rich-text'))return;event.preventDefault();event.stopImmediatePropagation();window.notivalFormat(command)},true);
 document.addEventListener('keydown',event=>{if(event.code!=='KeyM'||!event.shiftKey||event.altKey||!(mac?event.metaKey&&!event.ctrlKey:event.ctrlKey&&!event.metaKey)||event.isComposing||document.querySelector('dialog[open]')||document.body.dataset.view!=='note'||!current())return;event.preventDefault();setMode(mode==='map'?'write':'map')});
 // Connect passages: ⌘⌥K starts or stops drawing connections.
 {const connect=document.querySelector('#connect-passages'),label=primary+option+'K';
  if(connect){connect.title=(connect.title?connect.title+' · ':'')+label;connect.setAttribute('aria-keyshortcuts',(mac?'Meta':'Control')+'+Alt+K')}
  document.addEventListener('keydown',event=>{
   if(event.code!=='KeyK'||!event.altKey||event.shiftKey||event.isComposing||!(mac?event.metaKey&&!event.ctrlKey:event.ctrlKey&&!event.metaKey))return;
   if(!connect||document.querySelector('dialog[open]')||document.body.dataset.view!=='note'||mode!=='write'||!current())return;
   event.preventDefault();event.stopImmediatePropagation();connect.click();
  },true);
 }
 // Also expose the existing cell shortcuts beside their actions after relocation.
 for(const [selector,label] of [['[data-add="code"]',primary+shift+'C'],['[data-add="text"]',primary+shift+'T']]){const button=document.querySelector(selector);if(button&&!button.querySelector('kbd')){const hint=document.createElement('kbd');hint.className='shortcut-hint';hint.textContent=label;button.append(hint)}}
 document.addEventListener('keydown',event=>{
  if(event.isComposing||event.repeat||event.getModifierState?.('AltGraph')||document.querySelector('dialog[open]')||!current()||mode!=='write'||document.body.dataset.view!=='note')return;
  if(mac?(!event.metaKey||event.ctrlKey):(!event.ctrlKey||event.metaKey))return;
  const entry=shortcuts.find(s=>event.code===s.code&&event.shiftKey===!!s.shift&&event.altKey===!!s.alt);if(!entry?.run)return;
  const target=event.target;if(!target.closest?.('#editor .rich-text,#format-bar')||target.closest('.equation.editing'))return;
  const activeEditor=RichEditor.active();if(!activeEditor?.editor.isConnected||!current().blocks.includes(activeEditor.block))return;
  event.preventDefault();event.stopImmediatePropagation();entry.run();
 },true);
})();
