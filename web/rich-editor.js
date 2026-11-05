// Margin keeps Markdown for search and portable backups, and safe HTML for
// editing. Older plain-text blocks are rendered as Markdown on first open.
const RichEditor = (() => {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeURL = value => /^(https?:|file:|mailto:)/i.test(value.trim()) || /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=]+$/i.test(value.trim()) ? value.trim() : '';
  const inline = source => {
    const links = [];
    let value = String(source).replace(/(!?)\[([^\]]*)\]\(([^)]+)\)/g, (match, image, label, url) => {
      const safe=safeURL(url);
      if(!safe)return match;
      links.push(image ? `<img src="${escape(safe)}" alt="${escape(label)}">` : `<a href="${escape(safe)}">${escape(label)}</a>`);
      return `\u0001${links.length-1}\u0002`;
    });
    value = escape(value);
    value = value.replace(/\$([^$\n]+)\$/g, (_, source) => {links.push(`<span class="equation inline-equation" data-equation="${escape(source)}" contenteditable="false">${escape(source)}</span>`);return `\u0001${links.length-1}\u0002`});
    value = value.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/~~(.+?)~~/g, '<s>$1</s>');
    value = value.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return value.replace(/\u0001(\d+)\u0002/g, (_, index) => links[Number(index)]);
  };
  function fromMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const output = [];
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^```/.test(line)) {
        const code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        if (i < lines.length) i++;
        output.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`); continue;
      }
      if (line.trim()==='$$') {
        const equation=[];i++;
        while(i<lines.length && lines[i].trim()!=='$$') equation.push(lines[i++]);
        if(i<lines.length)i++;
        const source=equation.join('\n');
        output.push(`<div class="equation display-equation" data-equation="${escape(source)}" contenteditable="false">${escape(source)}</div>`);continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) { output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); i++; continue; }
      if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) { output.push('<hr>'); i++; continue; }
      if (/^\|.+\|$/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i+1] || '')) {
        const rows = [line];
        i += 2;
        while (i < lines.length && /^\|.+\|$/.test(lines[i])) rows.push(lines[i++]);
        output.push('<table><tbody>' + rows.map((row, index) => '<tr>' + row.slice(1,-1).split('|').map(cell => `<${index ? 'td' : 'th'}>${inline(cell.trim())}</${index ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</tbody></table>'); continue;
      }
      const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
      if (task) { output.push(`<div class="task-row" data-task="${task[1].toLowerCase()==='x'?'done':'open'}"><input type="checkbox" ${task[1].toLowerCase()==='x'?'checked':''}><span>${inline(task[2])}</span></div>`); i++; continue; }
      const bullet = line.match(/^\s*[-*+]\s+(.+)$/), numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (bullet || numbered) {
        const tag = bullet ? 'ul' : 'ol', items = [];
        while (i < lines.length) {
          const item = lines[i].match(bullet ? /^\s*[-*+]\s+(.+)$/ : /^\s*\d+[.)]\s+(.+)$/);
          if (!item) break; items.push(`<li>${inline(item[1])}</li>`); i++;
        }
        output.push(`<${tag}>${items.join('')}</${tag}>`); continue;
      }
      if (/^>\s?/.test(line)) { const quote=[]; while (i<lines.length && /^>\s?/.test(lines[i])) quote.push(inline(lines[i++].replace(/^>\s?/,''))); output.push(`<blockquote>${quote.join('<br>')}</blockquote>`); continue; }
      const paragraph=[];
      while (i<lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>\s?|\s*[-*+]\s|\s*\d+[.)]\s|\|.+\|$)/.test(lines[i])) paragraph.push(inline(lines[i++]));
      if (!paragraph.length) paragraph.push(inline(lines[i++]));
      output.push(`<p>${paragraph.join('<br>')}</p>`);
    }
    return output.join('') || '<p><br></p>';
  }
  const allowed = new Set(['P','DIV','BR','H1','H2','H3','H4','H5','H6','STRONG','B','EM','I','U','S','STRIKE','CODE','PRE','BLOCKQUOTE','UL','OL','LI','HR','TABLE','TBODY','THEAD','TR','TH','TD','A','IMG','SPAN','INPUT']);
  function cleanHTML(html) {
    const holder = document.createElement('div'); holder.innerHTML = String(html || '');
    function clean(node) {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        if (!allowed.has(child.tagName)) { clean(child); child.replaceWith(...child.childNodes); continue; }
        if(child.classList.contains('equation') && (child.tagName==='DIV'||child.tagName==='SPAN')) {
          const source=child.getAttribute('data-equation')||'';
          const inline=child.tagName==='SPAN';
          for(const attribute of [...child.attributes])child.removeAttribute(attribute.name);
          child.className=inline?'equation inline-equation':'equation display-equation';
          child.dataset.equation=source;
          child.setAttribute('contenteditable','false');
          child.textContent=source;
          continue;
        }
        const href=child.tagName==='A' ? safeURL(child.getAttribute('href')||'') : '';
        const src=child.tagName==='IMG' ? safeURL(child.getAttribute('src')||'') : '';
        const alt=child.tagName==='IMG' ? child.getAttribute('alt')||'' : '';
        const task=child.classList.contains('task-row');
        const checked=child.tagName==='INPUT' && child.hasAttribute('checked');
        for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
        if (child.tagName === 'A' && href) child.setAttribute('href',href);
        if (child.tagName === 'IMG') { if(src){child.setAttribute('src',src);child.setAttribute('alt',alt);} else {child.remove();continue;} }
        if (child.tagName === 'INPUT') {child.setAttribute('type','checkbox'); child.setAttribute('contenteditable','false');if(checked)child.setAttribute('checked','');}
        if (task) {child.className='task-row';child.dataset.task=child.querySelector('input:checked')?'done':'open';}
        clean(child);
      }
    }
    clean(holder);
    return holder.innerHTML;
  }
  function toMarkdown(root) {
    const children = node => [...node.childNodes].map(walk).join('');
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\u00a0/g,' ');
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const content = children(node), tag = node.tagName;
      if (tag==='BR') return '\n';
      if (node.classList.contains('equation'))return tag==='SPAN'?`$${node.dataset.equation||''}$`:`$$\n${node.dataset.equation||''}\n$$\n\n`;
      if (tag==='STRONG'||tag==='B') return `**${content}**`;
      if (tag==='EM'||tag==='I') return `*${content}*`;
      if (tag==='S'||tag==='STRIKE') return `~~${content}~~`;
      if (tag==='CODE' && node.parentElement?.tagName!=='PRE') return `\`${content}\``;
      if (tag==='A') return `[${content}](${safeURL(node.getAttribute('href')||'')})`;
      if (tag==='IMG') return `![${node.getAttribute('alt')||''}](${safeURL(node.getAttribute('src')||'')})`;
      if (tag==='INPUT') return '';
      if (tag==='H1'||tag==='H2'||tag==='H3'||tag==='H4'||tag==='H5'||tag==='H6') return content.trim() ? `${'#'.repeat(Number(tag[1]))} ${content}\n\n` : '';
      if (tag==='P') return `${content}\n\n`;
      if (tag==='HR') return '---\n\n';
      if (tag==='PRE') return `\`\`\`\n${node.textContent}\n\`\`\`\n\n`;
      if (tag==='BLOCKQUOTE') return content.split('\n').map(line=>'> '+line).join('\n')+'\n\n';
      if (tag==='LI') return content.trim()+'\n';
      if (tag==='UL'||tag==='OL') return [...node.children].map((item,index)=>`${tag==='UL'?'-':`${index+1}.`} ${children(item).trim()}\n`).join('')+'\n';
      if (tag==='TABLE') return [...node.querySelectorAll('tr')].map((row,index)=>{const values=[...row.children].map(cell=>children(cell).replace(/\|/g,'\\|'));return `| ${values.join(' | ')} |\n`+(index===0?`| ${values.map(()=> '---').join(' | ')} |\n`:'')}).join('')+'\n';
      if (tag==='DIV' && node.classList.contains('task-row')) return `- [${node.querySelector('input')?.checked?'x':' '}] ${node.querySelector('span')?.textContent||content}\n`;
      return content + (tag==='DIV'?'\n':'');
    }
    return [...root.childNodes].map(walk).join('').replace(/\n{3,}/g,'\n\n').trim();
  }
  let focused = null;
  const slashOptions=[
    ['heading1','Heading 1','Large section title','heading', 'h1'],
    ['heading2','Heading 2','Section title','heading', 'h2'],
    ['heading3','Heading 3','Small section title','heading', 'h3'],
    ['bullet','Bullet list','Start a bulleted list','insertUnorderedList'],
    ['numbered','Numbered list','Start a numbered list','insertOrderedList'],
    ['checklist','Checklist','Add a task box','task'],
    ['quote','Quote','Indented quotation','quote'],
    ['code','Code block','Monospace block','code'],
    ['table','Table','Insert rows and columns','table'],
    ['equation','Equation','Write LaTeX','equation'],
    ['inlineequation','Inline equation','LaTeX within a sentence','inlineequation'],
    ['link','Link','Link selected text','link'],
    ['image','Image','Insert an image','image'],
    ['divider','Divider','Horizontal rule','rule'],
    ['lecture','Lecture notes','Switch to the lecture layout','template','lecture'],
    ['reading','Reading notes','Switch to the reading layout','template','reading'],
    ['assignment','Assignment','Switch to the assignment layout','template','assignment'],
    ['cornell','Cornell notes','Switch to the Cornell layout','template','cornell']
  ];
  let slashMenu=null;
  function ensureSlashMenu(){if(!slashMenu){slashMenu=document.createElement('div');slashMenu.className='slash-menu';slashMenu.setAttribute('role','listbox');slashMenu.hidden=true;document.body.append(slashMenu);}return slashMenu;}
  let slash=null;
  function hideSlash(){slash=null;if(slashMenu){slashMenu.hidden=true;slashMenu.replaceChildren();}}
  function updateSlash(editor){
    const selection=window.getSelection(),node=selection?.anchorNode;
    if(!selection?.isCollapsed||!node||node.nodeType!==Node.TEXT_NODE||!editor.contains(node)){hideSlash();return;}
    const before=node.textContent.slice(0,selection.anchorOffset);
    const match=before.match(/(?:^|\s)([\\/])([a-z0-9]*)$/i);
    if(!match){hideSlash();return;}
    const query=match[2].toLowerCase();
    const options=slashOptions.filter(option=>`${option[0]} ${option[1]} ${option[2]}`.toLowerCase().includes(query));
    if(!options.length){hideSlash();return;}
    const slashMenu=ensureSlashMenu();
    const start=selection.anchorOffset-match[1].length-match[2].length;
    slash={editor,node,start,end:selection.anchorOffset,options,index:0};
    slashMenu.replaceChildren();
    options.forEach((option,index)=>{
      const item=document.createElement('button');item.type='button';item.setAttribute('role','option');item.className=index===0?'selected':'';
      const name=document.createElement('strong');name.textContent=option[1];const description=document.createElement('small');description.textContent=option[2];
      item.append(name,description);item.onmousedown=event=>event.preventDefault();item.onclick=()=>chooseSlash(index);slashMenu.append(item);
    });
    const range=selection.getRangeAt(0).cloneRange(),rect=range.getBoundingClientRect();
    slashMenu.style.left=`${Math.min(Math.max(12,rect.left),window.innerWidth-275)}px`;
    slashMenu.style.top=`${Math.max(12,Math.min(rect.bottom+8,window.innerHeight-340))}px`;
    slashMenu.hidden=false;
  }
  function chooseSlash(index){
    if(!slash)return;
    const {editor,node,start,end,options}=slash,option=options[index];
    let block=node.parentElement;
    while(block && block.parentElement!==editor)block=block.parentElement;
    const range=document.createRange();range.setStart(node,start);range.setEnd(node,end);range.deleteContents();range.collapse(true);
    editor.focus();const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    if(focused)focused.range=range.cloneRange();
    hideSlash();
    if(option[3]==='heading'){
      const tag=option[4].toUpperCase();
      const heading=document.createElement(tag);
      if(block && block!==editor && /^(P|DIV|H[1-6])$/.test(block.tagName)){
        while(block.firstChild)heading.append(block.firstChild);
        block.replaceWith(heading);
      }else{
        heading.append(document.createElement('br'));
        editor.append(heading);
      }
      heading.normalize();
      if(!heading.textContent.trim() && !heading.querySelector('br'))heading.append(document.createElement('br'));
      range.selectNodeContents(heading);range.collapse(false);
      selection.removeAllRanges();selection.addRange(range);
      if(focused)focused.range=range.cloneRange();
      editor.dispatchEvent(new Event('input',{bubbles:true}));
    }else command(option[3],option[4]);
  }
  document.addEventListener('selectionchange',()=>{
    if(!focused?.editor.isConnected)return;
    const selection=window.getSelection();
    if(selection?.rangeCount && focused.editor.contains(selection.anchorNode))focused.range=selection.getRangeAt(0).cloneRange();
  });
  const templates={
    lecture:'# Lecture notes\n\n## Main ideas\n\n- \n\n## Questions\n\n- [ ] Review these ideas\n',
    reading:'# Reading notes\n\n## Source\n\n## Key points\n\n- \n\n## My take\n',
    assignment:'# Assignment\n\n## Goal\n\n## Plan\n\n- [ ] First step\n\n## References\n',
    cornell:'# Cornell notes\n\n## Cues and questions\n\n- \n\n## Detailed notes\n\n## Summary from memory\n\n## Review checklist\n\n- [ ] Explain the key ideas without looking\n'
  };
  function renderMath(root) {
    if(typeof katex==='undefined')return;
    for(const item of root.querySelectorAll('.equation')) {
      item.title='Click to select · Delete to remove · Double-click to edit';
      try{katex.render(item.dataset.equation||'',item,{displayMode:item.classList.contains('display-equation'),throwOnError:false,trust:false,maxExpand:1000,maxSize:20});}
      catch{item.textContent=item.dataset.equation||'';}
    }
  }
  function equationAtCaret(editor, key) {
    const selection=window.getSelection();
    if(!selection?.rangeCount)return null;
    const range=selection.getRangeAt(0);
    if(!editor.contains(range.startContainer))return null;
    const inside=(range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement)?.closest?.('.equation');
    if(inside && editor.contains(inside))return inside;
    if(!range.collapsed){
      if(range.startContainer===range.endContainer && range.startContainer.nodeType===Node.ELEMENT_NODE && range.endOffset===range.startOffset+1){
        const selected=range.startContainer.childNodes[range.startOffset];
        return selected?.classList?.contains('equation')?selected:null;
      }
      return null;
    }
    const backward=key==='Backspace';
    let node=range.startContainer,offset=range.startOffset;
    while(node && node!==editor){
      if(node.nodeType===Node.TEXT_NODE){
        if(backward && offset===1 && /^[ \u00a0]$/.test(node.textContent[0]||'') && node.previousSibling?.classList?.contains('equation'))return node.previousSibling;
        if(backward?offset>0:offset<node.textContent.length)return null;
      }else{
        const adjacent=node.childNodes[backward?offset-1:offset];
        if(adjacent)return adjacent.nodeType===Node.ELEMENT_NODE && adjacent.classList.contains('equation')?adjacent:null;
      }
      const parent=node.parentNode;
      if(!parent || !editor.contains(parent))return null;
      const index=[...parent.childNodes].indexOf(node);
      offset=index+(backward?0:1);node=parent;
    }
    const adjacent=editor.childNodes[backward?offset-1:offset];
    return adjacent?.nodeType===Node.ELEMENT_NODE && adjacent.classList.contains('equation')?adjacent:null;
  }
  function placeCaretByEquation(editor, equation, after) {
    const range=document.createRange();
    if(equation.classList.contains('display-equation')){
      let target=after?equation.nextElementSibling:equation.previousElementSibling;
      if(!target || !target.isContentEditable || target.classList.contains('equation')){
        target=document.createElement('p');target.append(document.createElement('br'));
        equation[after?'after':'before'](target);
      }
      range.selectNodeContents(target);range.collapse(after);
    }else{
      let neighbor=after?equation.nextSibling:equation.previousSibling;
      if(neighbor?.nodeType!==Node.TEXT_NODE){
        neighbor=document.createTextNode('\u00a0');equation[after?'after':'before'](neighbor);
      }
      range.setStart(neighbor,after?0:neighbor.textContent.length);range.collapse(true);
    }
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    if(focused?.editor===editor)focused.range=range.cloneRange();
  }
  function deleteEquation(editor, equation) {
    placeCaretByEquation(editor,equation,true);
    equation.remove();
    if(focused?.selectedEquation===equation)focused.selectedEquation=null;
    editor.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function convertListMarker(editor) {
    const selection=window.getSelection();
    if(!selection?.isCollapsed||!selection.rangeCount)return false;
    const range=selection.getRangeAt(0),node=range.startContainer;
    if(node.nodeType!==Node.TEXT_NODE||!editor.contains(node)||range.startOffset!==node.textContent.length)return false;
    let block=node.parentElement;
    while(block&&block.parentElement!==editor)block=block.parentElement;
    if(!block||!/^(P|DIV)$/.test(block.tagName)||block.textContent!==node.textContent)return false;
    const marker=node.textContent,tag=/^[-*+]$/.test(marker)?'UL':/^\d+[.)]$/.test(marker)?'OL':null;
    if(!tag)return false;
    const list=document.createElement(tag),item=document.createElement('li');item.append(document.createElement('br'));list.append(item);block.replaceWith(list);
    const caret=document.createRange();caret.selectNodeContents(item);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);
    if(focused?.editor===editor)focused.range=caret.cloneRange();
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  }
  function mount(block, wrap, onChange) {
    const editor=document.createElement('div'); editor.className='rich-text'; editor.contentEditable='true'; editor.spellcheck=true;
    editor.setAttribute('role','textbox'); editor.setAttribute('aria-label','Rich note text'); editor.setAttribute('aria-multiline','true');
    editor.innerHTML=block.html ? cleanHTML(block.html) : fromMarkdown(block.text);
    editor.setAttribute('data-placeholder','Click here to write…');
    renderMath(editor);
    editor.onfocus=()=>{focused={editor,block,onChange};};
    editor.onblur=()=>{editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));if(focused?.editor===editor)focused.selectedEquation=null;};
    editor.oninput=()=>{editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));if(focused?.editor===editor)focused.selectedEquation=null;block.html=cleanHTML(editor.innerHTML);block.text=toMarkdown(editor);onChange();updateSlash(editor);};
    editor.onbeforeinput=event=>{
      if(event.inputType==='insertText'&&event.data===' '&&convertListMarker(editor)){event.preventDefault();hideSlash();return;}
      const key=event.inputType==='deleteContentBackward'?'Backspace':event.inputType==='deleteContentForward'?'Delete':null;
      if(!key)return;
      const equation=focused?.editor===editor && focused.selectedEquation?.isConnected?focused.selectedEquation:equationAtCaret(editor,key);
      if(equation){event.preventDefault();hideSlash();deleteEquation(editor,equation);}
    };
    editor.onpaste=event=>{event.preventDefault();const image=[...event.clipboardData.items].find(item=>item.type.startsWith('image/'))?.getAsFile();if(image){insertImage(image);return;}document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));};
    editor.onmousedown=event=>{if(event.target.closest('.equation'))event.preventDefault();};
    editor.onclick=event=>{
      if(event.target.tagName==='INPUT'&&event.target.type==='checkbox'){event.target.toggleAttribute('checked',event.target.checked);editor.dispatchEvent(new Event('input',{bubbles:true}));}
      const equation=event.target.closest('.equation');
      if(equation && editor.contains(equation)){
        editor.focus();editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));
        equation.classList.add('selected');if(focused?.editor===editor)focused.selectedEquation=equation;
        placeCaretByEquation(editor,equation,true);
      }else{editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));if(focused?.editor===editor)focused.selectedEquation=null;}
      const link=event.target.closest('a');if(link&&(event.metaKey||event.ctrlKey)){event.preventDefault();if(window.webkit?.messageHandlers?.margin)window.webkit.messageHandlers.margin.postMessage({type:'openURL',url:link.href});else window.open(link.href,'_blank');}
    };
    editor.ondblclick=event=>{const equation=event.target.closest('.equation');if(!equation)return;const source=prompt('Edit equation (LaTeX)',equation.dataset.equation||'');if(source===null)return;equation.dataset.equation=source;renderMath(equation.parentElement);editor.dispatchEvent(new Event('input',{bubbles:true}));};
    editor.onkeydown=event=>{
      if((event.key==='Backspace'||event.key==='Delete') && !event.metaKey && !event.ctrlKey && !event.altKey){
        const equation=focused?.editor===editor && focused.selectedEquation?.isConnected?focused.selectedEquation:equationAtCaret(editor,event.key);
        if(equation){event.preventDefault();hideSlash();deleteEquation(editor,equation);return;}
      }
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
        const equation=equationAtCaret(editor,event.key==='ArrowLeft'?'Backspace':'Delete');
        if(equation){event.preventDefault();placeCaretByEquation(editor,equation,event.key==='ArrowRight');}
      }
      if(focused?.editor===editor && !['Backspace','Delete'].includes(event.key)){
        editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));focused.selectedEquation=null;
      }
      if(slash?.editor===editor){
        if(event.key==='Escape'){event.preventDefault();hideSlash();return;}
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();slash.index=(slash.index+(event.key==='ArrowDown'?1:-1)+slash.options.length)%slash.options.length;[...slashMenu.children].forEach((item,index)=>item.classList.toggle('selected',index===slash.index));return;}
        if(event.key==='Enter'){event.preventDefault();chooseSlash(slash.index);return;}
      }
      const cell=window.getSelection()?.anchorNode?.parentElement?.closest('td,th');
      if(event.key==='Tab'&&cell){event.preventDefault();const cells=[...editor.querySelectorAll('td,th')], next=cells[cells.indexOf(cell)+(event.shiftKey?-1:1)];if(next){const range=document.createRange();range.selectNodeContents(next);range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}}
    };
    wrap.addEventListener('click',event=>{
      if(event.target===wrap || event.target===editor){
        editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));if(focused?.editor===editor)focused.selectedEquation=null;
        editor.focus();const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      }
    });
    wrap.append(editor); return editor;
  }
  function command(name,value) {
    if(!focused?.editor.isConnected){focused=null;document.querySelector('.rich-text')?.focus();if(!focused)return;}
    const {editor,block,onChange}=focused; editor.focus();
    if(focused.range && editor.contains(focused.range.startContainer)){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(focused.range);}
    if(name==='link'){const url=prompt('Link URL (https://, file://, or mailto:)');if(!url)return;if(!safeURL(url)){alert('Use an https, file, or mailto link.');return;}document.execCommand('createLink',false,url);}
    else if(name==='table'){const rowInput=prompt('Rows','3');if(rowInput===null)return;const columnInput=prompt('Columns','3');if(columnInput===null)return;const rows=Math.min(20,Math.max(1,Number(rowInput)||1)), cols=Math.min(10,Math.max(1,Number(columnInput)||1));document.execCommand('insertHTML',false,`<table><tbody>${Array.from({length:rows},()=>'<tr>'+Array.from({length:cols},()=>'<td><br></td>').join('')+'</tr>').join('')}</tbody></table><p><br></p>`);}
    else if(name==='task')document.execCommand('insertHTML',false,'<div class="task-row" data-task="open"><input type="checkbox" contenteditable="false"><span>Task</span></div><p><br></p>');
    else if(name==='equation'||name==='inlineequation'){
      const inline=name==='inlineequation',source=prompt(inline?'Inline equation (LaTeX)':'Equation (LaTeX)',inline?'x^2':'x^2 + y^2 = z^2');
      if(source===null)return;
      editor.focus();
      if(focused.range && editor.contains(focused.range.startContainer)){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(focused.range);}
      document.execCommand('insertHTML',false,inline
        ?`<span class="equation inline-equation" data-equation="${escape(source)}" contenteditable="false">${escape(source)}</span>&nbsp;`
        :`<div class="equation display-equation" data-equation="${escape(source)}" contenteditable="false">${escape(source)}</div><p><br></p>`);
      renderMath(editor);
    }
    else if(name==='template'){
      if(!templates[value])return;
      const range=document.createRange();range.selectNodeContents(editor);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      document.execCommand('insertHTML',false,fromMarkdown(templates[value]));
      const end=document.createRange();end.selectNodeContents(editor);end.collapse(false);selection.removeAllRanges();selection.addRange(end);focused.range=end.cloneRange();
    }
    else if(name==='image'){document.querySelector('#image-picker')?.click();return;}
    else if(name==='rule')document.execCommand('insertHorizontalRule');
    else if(name==='code')document.execCommand('formatBlock',false,'pre');
    else if(name==='heading')document.execCommand('formatBlock',false,value);
    else if(name==='quote')document.execCommand('formatBlock',false,'blockquote');
    else document.execCommand(name,false,value||null);
    block.html=cleanHTML(editor.innerHTML);block.text=toMarkdown(editor);onChange();
  }
  function insertImage(file) {
    if(!focused?.editor.isConnected)return;
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>2_000_000){alert('Choose a PNG, JPEG, WebP, or GIF smaller than 2 MB.');return;}
    const target={...focused};
    const reader=new FileReader();
    reader.onload=()=>{if(typeof reader.result!=='string'||!safeURL(reader.result)||!target.editor.isConnected)return;const {editor,block,onChange}=target;editor.focus();if(target.range && editor.contains(target.range.startContainer)){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(target.range);}document.execCommand('insertHTML',false,`<img src="${reader.result}" alt="Image"><p><br></p>`);block.html=cleanHTML(editor.innerHTML);block.text=toMarkdown(editor);onChange();};
    reader.readAsDataURL(file);
  }
  function active() { return focused; }
  function reset(){focused=null;hideSlash();}
  return {fromMarkdown,toMarkdown,cleanHTML,mount,command,insertImage,active,reset,equationAtCaret,convertListMarker};
})();
