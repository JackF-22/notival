// Margin keeps Markdown for search and portable backups, and safe HTML for
// editing. Older plain-text blocks are rendered as Markdown on first open.
const RichEditor = (() => {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeURL = value => /^(https?:|file:|mailto:)/i.test(value.trim()) || /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=]+$/i.test(value.trim()) ? value.trim() : '';
  const inline = source => {
    const links = [];
    // Math first, from the raw text, so `<` and `&` inside a formula are escaped exactly once.
    let value = MathSyntax.inlineMath(String(source), equation => {links.push(`<span class="equation inline-equation" data-equation="${escape(equation)}" contenteditable="false">${escape(equation)}</span>`);return `\u0001${links.length-1}\u0002`});
    value = value.replace(/(!?)\[([^\]]*)\]\(([^)]+)\)/g, (match, image, label, url) => {
      const safe=safeURL(url);
      if(!safe)return match;
      links.push(image ? `<img src="${escape(safe)}" alt="${escape(label)}">` : `<a href="${escape(safe)}">${escape(label)}</a>`);
      return `\u0001${links.length-1}\u0002`;
    });
    value = escape(value);
    value = value.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/==(.+?)==/g, '<mark data-hl="yellow">$1</mark>');
    value = value.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return value.replace(/\u0001(\d+)\u0002/g, (_, index) => links[Number(index)]);
  };
  const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/, taskItem = /^\s*[-*]\s+\[[ xX]\]/;
  // Indentation decides nesting, so a list can go as deep as the writer indents it.
  function parseList(lines, start) {
    let top = null, levels = [], i = start;
    while (i < lines.length) {
      if (levels.length && /^\s+\$\$\s*$/.test(lines[i])) {
        const source = []; let j = i + 1;
        while (j < lines.length && !/^\s+\$\$\s*$/.test(lines[j])) source.push(lines[j++].replace(/^\s+/, ''));
        const owner = levels.at(-1).list.items.at(-1);
        if (owner && j < lines.length) { owner.equations.push(source.join('\n')); i = j + 1; continue; }
      }
      const match = lines[i].match(listItem);
      if (!match || taskItem.test(lines[i])) break;
      const indent = match[1].replace(/\t/g, '    ').length, tag = /\d/.test(match[2]) ? 'ol' : 'ul';
      const make = tag => ({tag, items: [], start: tag === 'ol' ? parseInt(match[2], 10) : 1});
      while (levels.length && levels.at(-1).indent > indent) levels.pop();
      if (!levels.length) {
        if (top && tag !== top.tag) break;
        top ||= make(tag); levels = [{indent, list: top}];
      } else if (levels.at(-1).indent < indent) {
        const parent = levels.at(-1).list.items.at(-1);
        const child = make(tag); parent.children.push(child); levels.push({indent, list: child});
      } else if (levels.length === 1 && levels[0].list.tag !== tag) break;
      levels.at(-1).list.items.push({html: inline(match[3]), children: [], equations: []});
      i++;
    }
    const render = list => `<${list.tag}${list.start > 1 ? ` start="${list.start}"` : ''}>${list.items.map(item => `<li>${item.html}${item.equations.map(source => `<div class="equation display-equation" data-equation="${escape(source)}" contenteditable="false">${escape(source)}</div>`).join('')}${item.children.map(render).join('')}</li>`).join('')}</${list.tag}>`;
    return {html: render(top), next: i};
  }
  function fromMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const output = [];
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^```/.test(line)) {
        const info = line.slice(3).trim(), code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        if (i < lines.length) i++;
        if (/^procedure\b/i.test(info)) output.push(`<div class="procedure" data-procedure="${escape(code.join('\n'))}"${/\bnumbered\b/i.test(info) ? ' data-numbered="1"' : ''} contenteditable="false"></div>`);
        else output.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
        continue;
      }
      if (/^:::columns\s*$/.test(line.trim())) {
        const columns = []; let current = null; i++;
        while (i < lines.length && lines[i].trim() !== ':::') {
          if (/^:::col\s*$/.test(lines[i].trim())) { current = []; columns.push(current); }
          else if (current) current.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        const made = columns.filter(col => col.join('').trim());
        if (made.length >= 2) output.push(`<div class="cols" data-n="${Math.min(3, made.length)}">${made.slice(0, 3).map(col => `<div class="col">${fromMarkdown(col.join('\n'))}</div>`).join('')}</div>`);
        else for (const col of made) output.push(fromMarkdown(col.join('\n')));
        continue;
      }
      const display = MathSyntax.displayAt(lines, i);
      if (display) {
        output.push(`<div class="equation display-equation" data-equation="${escape(display.source)}" contenteditable="false">${escape(display.source)}</div>`);
        i = display.next; continue;
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
      if (listItem.test(line)) {
        const parsed = parseList(lines, i);
        i = parsed.next; output.push(parsed.html); continue;
      }
      if (/^>\s?/.test(line)) { const quote=[]; while (i<lines.length && /^>\s?/.test(lines[i])) quote.push(inline(lines[i++].replace(/^>\s?/,''))); output.push(`<blockquote>${quote.join('<br>')}</blockquote>`); continue; }
      const paragraph=[];
      while (i<lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>\s?|\s*[-*+]\s|\s*\d+[.)]\s|\|.+\|$)/.test(lines[i])) paragraph.push(inline(lines[i++]));
      if (!paragraph.length) paragraph.push(inline(lines[i++]));
      output.push(`<p>${paragraph.join('<br>')}</p>`);
    }
    return output.join('') || '<p><br></p>';
  }
  const highlightColors=['yellow','green','blue','pink'];
  const allowed = new Set(['P','DIV','BR','H1','H2','H3','H4','H5','H6','STRONG','B','EM','I','U','S','STRIKE','CODE','PRE','BLOCKQUOTE','UL','OL','LI','HR','TABLE','TBODY','THEAD','TR','TH','TD','A','IMG','SPAN','INPUT','MARK']);
  function cleanHTML(html) {
    const holder = document.createElement('div'); holder.innerHTML = String(html || '');
    function clean(node) {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        if (!allowed.has(child.tagName)) { clean(child); child.replaceWith(...child.childNodes); continue; }
        if(child.classList.contains('equation') && (child.tagName==='DIV'||child.tagName==='SPAN')) {
          const source=child.getAttribute('data-equation')||'';
          const passageId=child.getAttribute('data-passage-id');
          const inline=child.tagName==='SPAN';
          for(const attribute of [...child.attributes])child.removeAttribute(attribute.name);
          child.className=inline?'equation inline-equation':'equation display-equation';
          child.dataset.equation=source;
          if(passageId&&/^[a-zA-Z0-9_-]{1,100}$/.test(passageId))child.dataset.passageId=passageId;
          child.setAttribute('contenteditable','false');
          child.textContent=source;
          continue;
        }
        // A procedure keeps only its steps; the box is drawn again from them when the note opens.
        if(child.tagName==='DIV'&&child.classList.contains('procedure')) {
          const steps=String(child.getAttribute('data-procedure')||'').slice(0,20000),numbered=child.getAttribute('data-numbered')==='1';
          for(const attribute of [...child.attributes])child.removeAttribute(attribute.name);
          child.className='procedure';child.dataset.procedure=steps;if(numbered)child.dataset.numbered='1';
          child.setAttribute('contenteditable','false');child.textContent='';
          continue;
        }
        // Lines set side by side: a group of two or three columns, each holding ordinary blocks.
        if(child.tagName==='DIV'&&(child.classList.contains('cols')||child.classList.contains('col'))) {
          const group=child.classList.contains('cols');
          for(const attribute of [...child.attributes])child.removeAttribute(attribute.name);
          child.className=group?'cols':'col';
          clean(child);
          if(group)child.dataset.n=String(Math.max(2,Math.min(3,[...child.children].filter(item=>item.classList.contains('col')).length)));
          continue;
        }
        const href=child.tagName==='A' ? safeURL(child.getAttribute('href')||'') : '';
        const src=child.tagName==='IMG' ? safeURL(child.getAttribute('src')||'') : '';
        const alt=child.tagName==='IMG' ? child.getAttribute('alt')||'' : '';
        const task=child.classList.contains('task-row');
        const passageId=child.getAttribute('data-passage-id');
        const flagId=child.tagName==='SPAN'?child.getAttribute('data-flag'):null;
        const lineLink=child.tagName==='SPAN'?child.getAttribute('data-line-link'):null;
        const imageId=child.tagName==='IMG'?child.getAttribute('data-image-id'):null;
        const alignment=/^(P|DIV|H[1-6]|LI|TD|TH|BLOCKQUOTE|PRE)$/.test(child.tagName)?(child.style.textAlign||child.getAttribute('align')||''):'';
        const checked=child.tagName==='INPUT' && child.hasAttribute('checked');
        const widths=child.tagName==='TABLE'?child.getAttribute('data-widths')||'':'';
        const indent=/^(P|DIV|H[1-6]|BLOCKQUOTE)$/.test(child.tagName)?child.getAttribute('data-indent')||'':'';
        const listStart=child.tagName==='OL'?child.getAttribute('start')||'':'';
        const highlight=child.tagName==='MARK'?child.getAttribute('data-hl')||'':'';
        const imageWidth=child.tagName==='IMG'?child.getAttribute('data-width')||'':'';
        const imageAlign=child.tagName==='IMG'?child.getAttribute('data-align')||'':'';
        for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
        if(child.tagName==='MARK')child.dataset.hl=highlightColors.includes(highlight)?highlight:'yellow';
        if(/^\d+(\.\d+)?(,\d+(\.\d+)?)*$/.test(widths))child.dataset.widths=widths;
        if(/^[1-6]$/.test(indent))child.dataset.indent=indent;
        if(/^\d{1,4}$/.test(listStart)&&+listStart>1)child.setAttribute('start',String(+listStart));
        if(['left','center','right','justify'].includes(alignment))child.style.textAlign=alignment;
        if (passageId && /^[a-zA-Z0-9_-]{1,100}$/.test(passageId)) child.dataset.passageId=passageId;
        if (flagId && /^[a-zA-Z0-9_-]{1,100}$/.test(flagId)) child.dataset.flag=flagId;
        if (lineLink && /^[a-zA-Z0-9_-]{1,100}$/.test(lineLink)) child.dataset.lineLink=lineLink;
        if (child.tagName === 'A' && href) child.setAttribute('href',href);
        if (child.tagName === 'IMG') { if(src){child.setAttribute('src',src);child.setAttribute('alt',alt);if(imageId&&/^[a-zA-Z0-9_-]{1,100}$/.test(imageId))child.dataset.imageId=imageId;if(/^\d{1,3}(\.\d)?$/.test(imageWidth)&&+imageWidth>=5&&+imageWidth<=100)child.dataset.width=imageWidth;if(['left','right','center'].includes(imageAlign))child.dataset.align=imageAlign;} else {child.remove();continue;} }
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
    const isList = node => node.nodeType === Node.ELEMENT_NODE && (node.tagName==='UL'||node.tagName==='OL');
    function list(node, depth) {
      let number = node.tagName==='OL' && Number(node.getAttribute('start')) > 1 ? Number(node.getAttribute('start')) - 1 : 0;
      return [...node.children].map(item => {
        if (isList(item)) return list(item, depth+1);
        if (item.tagName!=='LI') return '';
        number++;
        const isDisplay = child => child.nodeType === Node.ELEMENT_NODE && child.classList.contains('display-equation');
        const own = [...item.childNodes].filter(child => !isList(child) && !isDisplay(child)).map(walk).join('').trim();
        const pad = '    '.repeat(depth);
        const equations = [...item.children].filter(isDisplay).map(eq => `${pad}    $$\n${(eq.dataset.equation || '').split('\n').map(line => `${pad}    ${line}`).join('\n')}\n${pad}    $$\n`).join('');
        const nested = [...item.children].filter(isList).map(child => list(child, depth+1)).join('');
        return `${pad}${node.tagName==='UL'?'-':`${number}.`} ${own}\n${equations}${nested}`;
      }).join('');
    }
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\u00a0/g,' ');
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const content = children(node), tag = node.tagName;
      if (tag==='BR') return '\n';
      if (node.classList.contains('equation'))return tag==='SPAN'?`$${node.dataset.equation||''}$`:`$$\n${node.dataset.equation||''}\n$$\n\n`;
      // A procedure is a fenced block whose text is the steps as written, so it stays readable anywhere.
      if (tag==='DIV' && node.classList.contains('procedure')) { const steps=String(node.dataset.procedure||'').replace(/^```/gm,' ```'); return steps.trim() ? `\`\`\`procedure${node.dataset.numbered==='1'?' numbered':''}\n${steps}\n\`\`\`\n\n` : ''; }
      // Columns are written as marker lines with a blank line around each, so every reader of the text still sees plain paragraphs.
      if (tag==='DIV' && node.classList.contains('cols')) return `:::columns\n\n${[...node.children].filter(col=>col.classList.contains('col')).map(col=>`:::col\n\n${toMarkdown(col)}\n\n`).join('')}:::\n\n`;
      if (tag==='STRONG'||tag==='B') return `**${content}**`;
      if (tag==='EM'||tag==='I') return `*${content}*`;
      if (tag==='S'||tag==='STRIKE') return `~~${content}~~`;
      if (tag==='MARK') return `==${content}==`;
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
      if (tag==='UL'||tag==='OL') return list(node,0)+'\n';
      if (tag==='TABLE') return [...node.querySelectorAll('tr')].map((row,index)=>{const values=[...row.children].map(cell=>children(cell).replace(/\|/g,'\\|'));return `| ${values.join(' | ')} |\n`+(index===0?`| ${values.map(()=> '---').join(' | ')} |\n`:'')}).join('')+'\n';
      if (tag==='DIV' && node.classList.contains('task-row')) return `- [${node.querySelector('input')?.checked?'x':' '}] ${node.querySelector('span')?.textContent||content}\n`;
      return content + (tag==='DIV'?'\n':'');
    }
    return [...root.childNodes].map(walk).join('').replace(/\n{3,}/g,'\n\n').trim();
  }
  let focused = null;
  // Where the writer last typed or clicked. Focus moving elsewhere (a PDF pane, a dialog) can reset the live selection, this cannot.
  let lastCaret = null;
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
    ['procedure','Procedure','Pseudocode or steps, typeset like a paper','procedure'],
    ['inlineequation','Inline equation','LaTeX within a sentence','inlineequation'],
    ['wordcount','Word count','Show or hide a live word count for this block','wordcount'],
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
    editor.focus({preventScroll:true});const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
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
    for(const item of root.querySelectorAll('.equation:not(.editing)'))renderOne(item);
    window.ProcedureBox?.render(root);
    for(const table of root.querySelectorAll('table'))applyTableWidths(table);
    for(const picture of root.querySelectorAll('img[data-width]'))picture.style.width=picture.dataset.width+'%';
  }
  // Backspace at the very start of the first bullet of a list that sits under something you can't type into (an
  // equation, a procedure, a table, columns): the browser would try to merge into it and do nothing, so the bullet
  // simply becomes a plain line, keeping its text and any sub-bullets.
  function unbulletAtStart(editor) {
    const selection=window.getSelection();if(!selection?.rangeCount||!selection.isCollapsed)return false;
    const anchor=selection.anchorNode,item=(anchor?.nodeType===Node.ELEMENT_NODE?anchor:anchor?.parentElement)?.closest?.('li');
    if(!item||!editor.contains(item))return false;
    const list=item.parentElement;
    if(list.firstElementChild!==item||!(list.parentElement===editor||list.parentElement?.classList.contains('col')))return false;
    const above=list.previousElementSibling;
    if(!above||!(above.matches('.equation,.procedure,.cols,table,hr')||above.isContentEditable===false))return false;
    const before=document.createRange();before.selectNodeContents(item);before.setEnd(selection.anchorNode,selection.anchorOffset);
    if(before.toString().replace(/[\u200b]/g,'')!==''||before.cloneContents().querySelector('img,.equation'))return false;
    const line=document.createElement('p'),nested=[...item.children].filter(child=>/^(UL|OL)$/.test(child.tagName));
    for(const child of [...item.childNodes])if(!nested.includes(child))line.append(child);
    if(!line.textContent.trim()&&!line.querySelector('img,.equation'))line.replaceChildren(document.createElement('br'));
    list.before(line);line.after(...nested);item.remove();if(!list.children.length)list.remove();
    const range=document.createRange();range.selectNodeContents(line);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
    return true;
  }
  // Delete at the very end of the last bullet, with an equation (or another block you can't type into) right after
  // the list: the browser would merge it away. Returns that block so it can be selected instead.
  function blockAfterBullet(editor) {
    const selection=window.getSelection();if(!selection?.rangeCount||!selection.isCollapsed)return null;
    const anchor=selection.anchorNode,item=(anchor?.nodeType===Node.ELEMENT_NODE?anchor:anchor?.parentElement)?.closest?.('li');
    if(!item||!editor.contains(item))return null;
    let list=item.parentElement,outer=item;
    while(list&&/^(UL|OL)$/.test(list.tagName)&&list.lastElementChild===outer&&list.parentElement?.tagName==='LI'){outer=list.parentElement;list=outer.parentElement}
    if(!list||list.lastElementChild!==outer)return null;
    const next=list.nextElementSibling;
    if(!next||!(next.matches('.equation,.procedure,.cols,table,hr')||next.isContentEditable===false))return null;
    const after=document.createRange();after.selectNodeContents(item);after.setStart(selection.anchorNode,selection.anchorOffset);
    if(after.toString().replace(/[\u200b]/g,'')!==''||after.cloneContents().querySelector('img,.equation,li'))return null;
    return next;
  }
  // Tab on an ordinary line (not a bullet) indents the whole line, as in a word processor, and Shift-Tab brings it
  // back. The depth lives on the line itself, so pressing Enter carries it on to the next line.
  const maxIndent=6;
  function indentableLines(editor) {
    const selection=window.getSelection();if(!selection?.rangeCount)return [];
    const range=selection.getRangeAt(0);
    const lineOf=node=>{let line=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;while(line&&line!==editor&&line.parentElement!==editor&&!line.parentElement?.classList.contains('col'))line=line.parentElement;return line&&line!==editor&&editor.contains(line)?line:null};
    const first=lineOf(range.startContainer),last=lineOf(range.endContainer);if(!first)return [];
    const lines=[first];
    if(last&&last!==first&&last.parentElement===first.parentElement)for(let line=first.nextElementSibling;line;line=line.nextElementSibling){lines.push(line);if(line===last)break;}
    return lines.filter(line=>/^(P|DIV|H[1-6]|BLOCKQUOTE)$/.test(line.tagName)&&!line.matches('.equation,.procedure,.cols,.col,.task-row'));
  }
  function shiftIndent(line,step) {
    const depth=Math.max(0,Math.min(maxIndent,(Number(line.dataset.indent)||0)+step));
    if(depth===(Number(line.dataset.indent)||0))return false;
    if(depth)line.dataset.indent=String(depth);else delete line.dataset.indent;
    return true;
  }
  // `info` (optional) learns whether the caret had to leave its own line to reach the equation, and which line that was.
  function equationAtCaret(editor, key, info) {
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
      // At the edge of a bullet, Backspace and Delete belong to the list (un-bullet, merge items), never to a neighbour.
      if(node.nodeType===Node.ELEMENT_NODE&&node.tagName==='LI'){
        // Backspace at the start of a bullet under one that ends in a display equation would merge the two and lose the equation.
        const above=backward&&offset===0?node.previousElementSibling:null,last=above?.tagName==='LI'?[...above.children].filter(child=>child.tagName!=='BR').at(-1):null;
        if(last?.classList.contains('display-equation')){if(info)info.crossed=true;return last;}
        return null;
      }
      if(info&&node.nodeType===Node.ELEMENT_NODE&&/^(P|DIV|H[1-6]|BLOCKQUOTE|PRE)$/.test(node.tagName)&&!node.classList.contains('equation')){info.crossed=true;info.block??=node;}
      const parent=node.parentNode;
      if(!parent || !editor.contains(parent))return null;
      const index=[...parent.childNodes].indexOf(node);
      offset=index+(backward?0:1);node=parent;
    }
    const adjacent=editor.childNodes[backward?offset-1:offset];
    return adjacent?.nodeType===Node.ELEMENT_NODE && adjacent.classList.contains('equation')?adjacent:null;
  }
  // A display equation alone on its own bullet, right under another bullet, is part of that bullet: move it there so
  // the list numbering carries on past it (1, equation, 2) instead of counting the equation as a step.
  function tuckIntoItemAbove(equation) {
    const item=equation.parentElement,above=item?.previousElementSibling;
    if(item?.tagName!=='LI'||above?.tagName!=='LI')return false;
    const rest=[...item.childNodes].filter(node=>node!==equation);
    if(rest.some(node=>node.nodeType===Node.ELEMENT_NODE?!/^BR$/.test(node.tagName):node.textContent.replace(/[\s\u200b\u00a0]/g,'')))return false;
    above.insertBefore(equation,[...above.children].find(isListElement)||null);item.remove();
    return true;
  }
  // Where the caret goes when it steps onto a neighbouring block: into a list's first or last bullet, or a table's first or last cell.
  function caretTarget(node, end) {
    if(node.tagName==='TABLE'){const cells=node.querySelectorAll('td,th');return cells[end?cells.length-1:0]||node;}
    if(/^(UL|OL)$/.test(node.tagName)){
      let item=end?node.lastElementChild:node.firstElementChild;
      while(end&&item){const nested=[...item.children].filter(child=>/^(UL|OL)$/.test(child.tagName)).at(-1)?.lastElementChild;if(!nested)break;item=nested;}
      return item||node;
    }
    return node;
  }
  function placeCaretByEquation(editor, equation, after) {
    const range=document.createRange();
    if(equation.classList.contains('display-equation')&&equation.parentElement?.tagName==='LI'){
      // Inside a list item: moving on means the next bullet (made if needed); moving back means the item's own text.
      const item=equation.parentElement;
      if(after){
        let next=item.nextElementSibling;
        if(next?.tagName!=='LI'){next=document.createElement('li');next.append(document.createElement('br'));item.after(next)}
        range.setStart(next,0);range.collapse(true);
      }else{
        const text=[...item.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.data.length);
        if(text)range.setStart(text,text.data.length);else range.setStart(item,0);
        range.collapse(true);
      }
    }else if(equation.classList.contains('display-equation')){
      let target=after?equation.nextElementSibling:equation.previousElementSibling;
      if(!target || !target.isContentEditable || target.classList.contains('equation')){
        target=document.createElement('p');target.append(document.createElement('br'));
        equation[after?'after':'before'](target);
      }
      target=caretTarget(target,!after);
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
    const item=equation.parentElement?.tagName==='LI'?equation.parentElement:null,own=item&&[...item.childNodes].find(node=>node!==equation&&node.nodeType===Node.TEXT_NODE&&node.data.trim());
    const next=equation.nextElementSibling,before=equation.previousElementSibling;
    if(equation.classList.contains('display-equation')&&own){
      // The bullet keeps its text, so the caret stays at the end of it rather than jumping to the next bullet.
      const range=document.createRange();range.setStart(own,own.data.length);range.collapse(true);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);if(focused?.editor===editor)focused.range=range.cloneRange();
    }else if(equation.classList.contains('display-equation')&&!item&&!(next&&next.isContentEditable&&!next.classList.contains('equation'))&&before&&before.isContentEditable&&!before.classList.contains('equation')){
      placeCaretByEquation(editor,equation,false);
    }else placeCaretByEquation(editor,equation,true);
    equation.remove();
    if(focused?.selectedEquation===equation)focused.selectedEquation=null;
    editor.dispatchEvent(new Event('input',{bubbles:true}));
  }
  // A display equation is a block: clicking or arrowing onto it selects it (nothing new is made), and then the arrows,
  // Enter or typing carry on from it, while Backspace and Delete remove it.
  function clearEquationSelection(editor) {
    editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));
    if(focused?.editor===editor)focused.selectedEquation=null;
  }
  function selectEquation(editor, equation) {
    clearEquationSelection(editor);
    equation.classList.add('selected');
    const range=document.createRange();range.setStartAfter(equation);range.collapse(true);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    if(focused?.editor===editor){focused.selectedEquation=equation;focused.range=range.cloneRange();}
  }
  const pickedDisplayEquation = editor => {
    const equation=focused?.editor===editor?focused.selectedEquation:null;
    return equation?.isConnected&&equation.classList.contains('display-equation')?equation:null;
  };
  function stepFromEquation(editor, equation, after) {
    const neighbor=equation.parentElement?.tagName==='LI'?null:after?equation.nextElementSibling:equation.previousElementSibling;
    if(neighbor?.classList.contains('display-equation')){selectEquation(editor,neighbor);return;}
    clearEquationSelection(editor);placeCaretByEquation(editor,equation,after);
  }
  function lineAfterEquation(editor, equation) {
    const item=equation.parentElement?.tagName==='LI'?equation.parentElement:null,line=document.createElement(item?'li':'p');
    line.append(document.createElement('br'));(item||equation).after(line);
    clearEquationSelection(editor);
    const range=document.createRange();range.setStart(line,0);range.collapse(true);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    if(focused?.editor===editor)focused.range=range.cloneRange();
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
    const item=document.createElement('li');item.append(document.createElement('br'));
    const number=tag==='OL'?parseInt(marker,10):1;
    // "2." under a numbered list that a display equation broke off carries that list on: the equations tuck in under the
    // item above (where they belong) and the new line takes the next number. Typing "1." always starts afresh.
    let joined=null;
    if(number>1){
      const between=[];let previous=block.previousElementSibling;
      const blank=node=>/^(P|DIV)$/.test(node.tagName)&&!node.classList.contains('equation')&&!node.textContent.trim()&&!node.querySelector('img,.equation');
      while(previous&&(previous.classList.contains('display-equation')||blank(previous))){between.unshift(previous);previous=previous.previousElementSibling}
      if(previous?.tagName==='OL'&&previous.lastElementChild?.tagName==='LI'){
        const owner=previous.lastElementChild,nested=[...owner.children].find(isListElement)||null;
        for(const node of between)if(node.classList.contains('display-equation'))owner.insertBefore(node,nested);else node.remove();
        previous.append(item);block.remove();joined=previous;
      }
    }
    if(!joined){const list=document.createElement(tag);if(number>1)list.setAttribute('start',String(Math.min(number,9999)));list.append(item);block.replaceWith(list);}
    const caret=document.createRange();caret.selectNodeContents(item);caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);
    if(focused?.editor===editor)focused.range=caret.cloneRange();
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  }
  const symbolShortcuts={'<=>':'⇔','<->':'↔','+/-':'±','->':'→','<-':'←','=>':'⇒','<=':'≤','>=':'≥','!=':'≠','~=':'≈'};
  function convertSymbol(editor){
    const selection=window.getSelection();if(!selection?.rangeCount||!selection.isCollapsed)return false;
    const range=selection.getRangeAt(0),node=range.startContainer;if(node.nodeType!==Node.TEXT_NODE||!editor.contains(node)||node.parentElement.closest('code,pre,.equation,a'))return false;
    const before=node.textContent.slice(0,range.startOffset);const shortcut=Object.keys(symbolShortcuts).find(key=>before.endsWith(key));if(!shortcut)return false;
    // Leave URLs and attached operators literal; arrow prose may follow a word.
    const prefix=before.slice(0,-shortcut.length);if(/(?:https?:|file:|www\.)\S*$/i.test(before)||(/^[<>=!~]/.test(shortcut)&&prefix&&/[^\s\p{L}\p{N})\]]/u.test(prefix.at(-1))))return false;
    const replacement=range.cloneRange();replacement.setStart(node,range.startOffset-shortcut.length);// Replacing a selection inherits the styling of its first character, so remember what the caret was typing in and put that back.
    const formats=['bold','italic','underline','strikeThrough'],wanted=formats.map(format=>document.queryCommandState(format));
    selection.removeAllRanges();selection.addRange(replacement);
    const inserted=symbolShortcuts[shortcut]+' ';document.execCommand('insertText',false,inserted);
    const after=selection.rangeCount&&selection.getRangeAt(0);
    if(after&&after.collapsed&&after.startContainer.nodeType===Node.TEXT_NODE&&after.startOffset>=inserted.length){
      const end=after.startContainer,offset=after.startOffset,span=document.createRange();span.setStart(end,offset-inserted.length);span.setEnd(end,offset);
      selection.removeAllRanges();selection.addRange(span);
      formats.forEach((format,index)=>{if(document.queryCommandState(format)!==wanted[index])document.execCommand(format)});
      if(!end.isConnected)return true;const caret=document.createRange();caret.setStart(end,Math.min(offset,end.textContent.length));caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);
    }
    return true;
  }

  // ---- Lists: Tab nests as deep as the writer likes; CSS picks the marker by depth. ----
  const selectionAt = (node, offset) => { const range=document.createRange(); range.setStart(node,offset); range.collapse(true); const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return range; };
  const keepingCaret = change => {
    const selection=window.getSelection(), range=selection.rangeCount?selection.getRangeAt(0):null;
    const saved=range&&{node:range.startContainer,offset:range.startOffset,endNode:range.endContainer,endOffset:range.endOffset};
    change();
    if(saved){const next=document.createRange();next.setStart(saved.node,saved.offset);next.setEnd(saved.endNode,saved.endOffset);selection.removeAllRanges();selection.addRange(next);}
  };
  const isListElement = node => node?.nodeType===Node.ELEMENT_NODE && (node.tagName==='UL'||node.tagName==='OL');
  function indentItem(item) {
    const previous=item.previousElementSibling;
    if(previous?.tagName!=='LI')return false;
    let nested=[...previous.children].reverse().find(isListElement);
    if(!nested){nested=document.createElement(item.parentElement.tagName);previous.append(nested);}
    keepingCaret(()=>nested.append(item));
    return true;
  }
  function outdentItem(item) {
    const list=item.parentElement, owner=list?.parentElement;
    if(owner?.tagName!=='LI')return false;
    keepingCaret(()=>{
      const later=[];for(let next=item.nextElementSibling;next;next=next.nextElementSibling)later.push(next);
      if(later.length){let tail=[...item.children].reverse().find(isListElement);if(!tail){tail=document.createElement(list.tagName);item.append(tail);}later.forEach(node=>tail.append(node));}
      owner.after(item);
      if(!list.children.length)list.remove();
    });
    return true;
  }
  // A bullet with nothing written in it, even if it still holds leftovers you can't see (a stray invisible character,
  // empty bold, the shell of a flag). The browser would count those as text and keep the list going.
  const blankItem = item => !item.textContent.replace(/[\s\u200b\u00a0]/g,'') && !item.querySelector('img,.equation,li,input,table');
  // Enter (or Backspace) on an empty top-level bullet ends the list there: the bullet becomes a plain line, and any
  // bullets after it carry on below as their own list, keeping their numbers.
  function leaveList(item) {
    const list=item.parentElement,line=document.createElement('p');line.append(document.createElement('br'));
    const later=[];for(let next=item.nextElementSibling;next;next=next.nextElementSibling)later.push(next);
    list.after(line);
    if(later.length){
      const rest=document.createElement(list.tagName);
      if(list.tagName==='OL'){const number=(Number(list.getAttribute('start'))||1)+[...list.children].filter(child=>child.tagName==='LI').indexOf(item);if(number>1)rest.setAttribute('start',String(number));}
      rest.append(...later);line.after(rest);
    }
    item.remove();if(!list.querySelector('li'))list.remove();
    selectionAt(line,0);
    return line;
  }
  const listItemAt = editor => { const node=window.getSelection()?.anchorNode; const item=(node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement)?.closest('li'); return item&&editor.contains(item)?item:null; };

  // ---- Tables ----
  const tableCellAt = editor => { const node=window.getSelection()?.anchorNode; const cell=(node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement)?.closest('td,th'); return cell&&editor.contains(cell)?cell:null; };
  function applyTableWidths(table) {
    const widths=(table.dataset.widths||'').split(',').map(Number), count=table.rows[0]?.cells.length||0;
    table.querySelector(':scope > colgroup')?.remove();
    if(widths.length!==count||widths.some(value=>!(value>0))){table.classList.remove('sized');return;}
    const group=document.createElement('colgroup');
    for(const width of widths){const col=document.createElement('col');col.style.width=width+'%';group.append(col);}
    table.prepend(group);table.classList.add('sized');
  }
  // A table must be a direct child of the note. If a block command wrapped one in a heading or paragraph, lift it out so it keeps its own styling.
  function hoistTables(editor) {
    window.LineColumns?.tidy(editor);   // columns that emptied out or lost a partner stop being columns
    for(const table of editor.querySelectorAll('table')){
      let guard=0;
      while(table.parentElement!==editor&&guard++<8){
        const parent=table.parentElement;
        if(!parent||/^(TD|TH)$/.test(parent.tagName)||!editor.contains(parent))break;
        if(!/^(P|DIV|H[1-6]|BLOCKQUOTE|LI|PRE|SPAN|B|I|STRONG|EM|U|S)$/.test(parent.tagName))break;
        if(parent.tagName==='LI'){break;}
        const tail=parent.cloneNode(false);
        while(table.nextSibling)tail.append(table.nextSibling);
        parent.after(table);
        if(tail.childNodes.length&&tail.textContent.trim())table.after(tail);
        if(!parent.textContent.trim()&&!parent.querySelector('img,table,.equation'))parent.remove();
      }
    }
    // Something editable must always follow a table, picture, divider or equation, or there is nowhere to click and keep typing.
    if(!editor.lastElementChild||endsInMedia(editor.lastElementChild))editor.append(Object.assign(document.createElement('p'),{innerHTML:'<br>'}));
  }
  // Put the caret at the very end of the note's text, inside the last editable line (never between blocks).
  function caretToEnd(editor) {
    hoistTables(editor);
    let node=editor.lastElementChild;
    while(node?.lastElementChild&&!/^(IMG|BR|TABLE)$/.test(node.lastElementChild.tagName)&&!node.lastElementChild.classList.contains('equation'))node=node.lastElementChild;
    const range=document.createRange();range.selectNodeContents(node||editor);range.collapse(false);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    if(focused?.editor===editor)focused.range=range.cloneRange();
  }
  function endsInMedia(element) {
    if(['TABLE','IMG','HR'].includes(element.tagName)||element.classList.contains('equation')||element.classList.contains('cols')||element.classList.contains('procedure'))return true;
    if(!/^(P|DIV)$/.test(element.tagName))return false;
    const last=[...element.childNodes].reverse().find(node=>!(node.nodeType===Node.TEXT_NODE&&!node.textContent.trim())&&node.nodeName!=='BR');
    return last?.nodeName==='IMG'||(last?.nodeType===Node.ELEMENT_NODE&&last.classList.contains('inline-equation')&&false);
  }
  const pictureOnly = block => block&&/^(P|DIV)$/.test(block.tagName)&&!block.textContent.trim()&&!!block.querySelector('img')||block?.tagName==='IMG';
  // Backspace on the empty line below a picture selects the picture first; a second Backspace removes it.
  function backspaceBelowPicture(editor, event) {
    if(event.key!=='Backspace'||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return false;
    const selection=window.getSelection();if(!selection.rangeCount||!selection.isCollapsed)return false;
    let block=selection.anchorNode;block=block.nodeType===Node.ELEMENT_NODE?block:block.parentElement;
    while(block&&block.parentElement!==editor)block=block.parentElement;
    const before=block?.previousElementSibling;
    if(!block||!/^(P|DIV)$/.test(block.tagName)||block.textContent.trim()||block.querySelector('img,table,.equation')||!pictureOnly(before))return false;
    event.preventDefault();
    const picture=before.tagName==='IMG'?before:before.querySelector('img'),range=document.createRange();range.selectNode(picture);selection.removeAllRanges();selection.addRange(range);
    return true;
  }
  function removeTable(editor, table) {
    // Leave the caret on an empty line where the table was, so typing continues from the same spot.
    const blank=node=>node&&/^(P|DIV)$/.test(node.tagName)&&!node.textContent.trim()&&!node.querySelector('img,table,.equation,hr');
    let target=blank(table.nextElementSibling)?table.nextElementSibling:blank(table.previousElementSibling)?table.previousElementSibling:null;
    if(!target){target=document.createElement('p');target.innerHTML='<br>';table.after(target);}
    table.remove();
    const range=document.createRange();range.setStart(target,0);range.collapse(true);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
  }
  // Backspace on the line just below a table: an empty table goes away; otherwise step into its last cell.
  function backspaceBelowTable(editor, event) {
    if(event.key!=='Backspace'||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return false;
    const selection=window.getSelection();if(!selection.rangeCount||!selection.isCollapsed)return false;
    let block=selection.anchorNode;block=block.nodeType===Node.ELEMENT_NODE?block:block.parentElement;
    while(block&&block.parentElement!==editor)block=block.parentElement;
    const table=block?.previousElementSibling;
    if(!block||table?.tagName!=='TABLE'||block.tagName==='TABLE')return false;
    const probe=document.createRange();probe.selectNodeContents(block);probe.setEnd(selection.anchorNode,selection.anchorOffset);
    if(probe.toString().length||probe.cloneContents().querySelector('img,.equation'))return false;
    event.preventDefault();
    if([...table.querySelectorAll('td,th')].every(emptyCell)){
      table.remove();
      const range=document.createRange();range.setStart(block,0);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
    }else{
      const last=table.rows[table.rows.length-1].cells[table.rows[table.rows.length-1].cells.length-1],range=document.createRange();
      range.selectNodeContents(last);range.collapse(false);selection.removeAllRanges();selection.addRange(range);
    }
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  }
  function addTableRow(table) {
    const last=table.rows[table.rows.length-1], row=document.createElement('tr');
    for(let i=0;i<last.cells.length;i++){const cell=document.createElement('td');cell.innerHTML='<br>';row.append(cell);}
    last.after(row);return row;
  }
  const emptyCell = cell => !cell.textContent.replace(/[​ \s]/g,'')&&!cell.querySelector('img,.equation,table');
  // Backspace in a blank row removes the row; the last row takes the whole table with it.
  function deleteBlankRow(editor, event) {
    if(event.key!=='Backspace'&&event.key!=='Delete')return false;
    const selection=window.getSelection(), cell=tableCellAt(editor);
    if(!cell||!selection.isCollapsed)return false;
    const row=cell.parentElement, table=row.closest('table');
    if(![...row.cells].every(emptyCell))return false;
    if(table.rows.length>1&&cell!==row.cells[0])return false;
    event.preventDefault();
    if(table.rows.length===1){removeTable(editor,table);}
    else{
      const neighbor=row.previousElementSibling||row.nextElementSibling, goBack=!!row.previousElementSibling;
      row.remove();
      const target=goBack?neighbor.cells[neighbor.cells.length-1]:neighbor.cells[0], range=document.createRange();
      range.selectNodeContents(target);range.collapse(!goBack);selection.removeAllRanges();selection.addRange(range);
    }
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  }
  function columnEdge(editor, event) {
    const cell=event.target.closest?.('td,th');
    if(!cell||!editor.contains(cell))return null;
    const box=cell.getBoundingClientRect(), table=cell.closest('table');
    if(cell.nextElementSibling&&Math.abs(event.clientX-box.right)<=5)return {table,index:cell.cellIndex};
    if(cell.previousElementSibling&&Math.abs(event.clientX-box.left)<=5)return {table,index:cell.cellIndex-1};
    return null;
  }
  function startColumnDrag(editor, edge, event) {
    const {table,index}=edge, cells=[...table.rows[0].cells], total=table.getBoundingClientRect().width||1;
    const start=cells.map(cell=>cell.getBoundingClientRect().width/total*100), origin=event.clientX, minimum=6;
    const apply=widths=>{table.dataset.widths=widths.map(width=>width.toFixed(2)).join(',');applyTableWidths(table);};
    apply(start);
    const move=moved=>{
      const shift=Math.max(minimum-start[index],Math.min(start[index+1]-minimum,(moved.clientX-origin)/total*100));
      const widths=start.slice();widths[index]+=shift;widths[index+1]-=shift;apply(widths);
    };
    const finish=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',finish);document.body.classList.remove('resizing-table');editor.dispatchEvent(new Event('input',{bubbles:true}));};
    document.body.classList.add('resizing-table');
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',finish);
  }

  // ---- Equations edit in place, with a live preview of the rendered LaTeX. ----
  function renderOne(item) {
    if(typeof katex==='undefined'){item.textContent=item.dataset.equation||'';return;}
    item.title='Click to select · Delete to remove · Double-click to edit';
    try{katex.render(MathSyntax.katexSource(item.dataset.equation||''),item,{displayMode:item.classList.contains('display-equation'),throwOnError:false,trust:false,maxExpand:1000,maxSize:20});}
    catch{item.textContent=item.dataset.equation||'';}
  }
  function editEquation(editor, {equation=null, display=false, source='', insert}) {
    if(equation){display=equation.classList.contains('display-equation');source=equation.dataset.equation||'';}
    const region=document.createElement(display?'div':'span');
    region.className=`equation ${display?'display-equation':'inline-equation'} editing`;region.contentEditable='false';region.dataset.equation=source;
    const field=document.createElement(display?'textarea':'input');
    field.className='equation-source';field.value=source;field.spellcheck=false;field.setAttribute('aria-label','LaTeX source');field.placeholder='LaTeX';
    if(!display){field.type='text';field.autocomplete='off';}
    const preview=document.createElement('span');preview.className='equation-preview';preview.setAttribute('aria-live','polite');
    region.append(field,preview);
    if(display){const hint=document.createElement('small');hint.className='equation-hint';hint.textContent='↵ done · ⌘↵ new line · esc cancel';region.append(hint)}
    if(equation)equation.replaceWith(region);else insert(region);
    let finished=false;
    const refresh=()=>{
      region.dataset.equation=field.value;
      if(display)field.rows=Math.max(1,field.value.split('\n').length);else field.style.width=Math.max(3,field.value.length+1)+'ch';
      preview.className='equation-preview';preview.textContent='';
      if(!field.value.trim()){preview.classList.add('empty');preview.textContent='Preview';return;}
      if(typeof katex==='undefined'){preview.textContent=field.value;return;}
      try{katex.render(MathSyntax.katexSource(field.value),preview,{displayMode:display,throwOnError:false,trust:false,maxExpand:1000,maxSize:20});}catch{preview.textContent=field.value;}
      if(preview.querySelector('.katex-error'))preview.classList.add('invalid');
    };
    const finish=(commit,side='after')=>{
      if(finished)return;finished=true;
      const value=field.value,scroller=editor.closest('article'),scrollTop=scroller?.scrollTop;
      editor.focus({preventScroll:true});
      if(!commit||!value.trim()){
        if(equation&&!commit){const restored=equation;restored.dataset.equation=source;region.replaceWith(restored);renderOne(restored);placeCaretByEquation(editor,restored,true);}
        else if(display)placeCaretByEquation(editor,region,true),region.remove();
        else{
          // An empty inline equation just disappears: the caret stays exactly where it was typing, with no stray spacing left behind.
          const before=region.previousSibling,after=region.nextSibling,range=document.createRange();
          if(before?.nodeType===Node.TEXT_NODE)range.setStart(before,before.data.length);
          else if(after?.nodeType===Node.TEXT_NODE)range.setStart(after,0);
          else range.setStart(region.parentNode,[...region.parentNode.childNodes].indexOf(region));
          range.collapse(true);region.remove();
          const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
          if(focused?.editor===editor)focused.range=range.cloneRange();
        }
      }else{
        const fixed=document.createElement(display?'div':'span');
        fixed.className=display?'equation display-equation':'equation inline-equation';fixed.dataset.equation=value;fixed.contentEditable='false';
        if(equation?.dataset.passageId)fixed.dataset.passageId=equation.dataset.passageId;
        region.replaceWith(fixed);renderOne(fixed);
        if(display)tuckIntoItemAbove(fixed);
        placeCaretByEquation(editor,fixed,side!=='before');
      }
      editor.dispatchEvent(new Event('input',{bubbles:true}));
      // The engine may scroll while it re-places the caret, so hold the page where it was for a moment.
      if(scroller&&scrollTop!==undefined){const hold=()=>{if(Math.abs(scroller.scrollTop-scrollTop)>1)scroller.scrollTop=scrollTop};hold();requestAnimationFrame(hold);setTimeout(hold,60);setTimeout(hold,200)}
    };
    field.addEventListener('input',refresh);
    for(const type of ['beforeinput','paste','copy','cut','compositionstart'])field.addEventListener(type,event=>event.stopPropagation());
    field.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.isComposing)return;
      const atStart=field.selectionStart===0&&field.selectionEnd===0, atEnd=field.selectionStart===field.value.length&&field.selectionEnd===field.value.length;
      if(event.key==='Escape'){event.preventDefault();finish(false);}
      else if(event.key==='Enter'&&display&&(event.metaKey||event.ctrlKey||event.shiftKey)){
        // ⌘↵ adds a line inside a display equation; plain ↵ finishes it.
        event.preventDefault();field.setRangeText('\n',field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new Event('input',{bubbles:true}));
      }
      else if((event.key==='Backspace'||event.key==='Delete')&&!field.value){event.preventDefault();finish(true);}
      else if(event.key==='Tab'||event.key==='Enter'){event.preventDefault();finish(true);}
      else if(event.key==='ArrowRight'&&atEnd){event.preventDefault();finish(true);}
      else if(event.key==='ArrowLeft'&&atStart){event.preventDefault();finish(true,'before');}
    });
    field.addEventListener('blur',()=>setTimeout(()=>{if(!finished&&document.hasFocus())finish(true);},0));
    region.addEventListener('mousedown',event=>{if(event.target!==field){event.preventDefault();field.focus();}});
    refresh();field.focus();
    if(equation)field.select();else field.setSelectionRange(field.value.length,field.value.length);
    return region;
  }
  // ---- Highlighting: a <mark> in one of four colours. Choosing the colour a passage already has takes it off again. ----
  function highlight(editor, color) {
    const selection=window.getSelection();
    if(!selection?.rangeCount||selection.isCollapsed||!editor.contains(selection.anchorNode))return false;
    color=highlightColors.includes(color)?color:'yellow';
    const range=selection.getRangeAt(0),touching=[...editor.querySelectorAll('mark')].filter(mark=>range.intersectsNode(mark));
    const same=touching.length>0&&touching.every(mark=>(mark.dataset.hl||'yellow')===color);
    if(touching.length){
      // Unwrapping moves text between parents; remember which text the selection covered so it can be put back.
      const texts=[],walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
      for(let node=walker.nextNode();node;node=walker.nextNode()){
        if(!range.intersectsNode(node)||(node===range.startContainer&&range.startOffset>=node.data.length)||(node===range.endContainer&&range.endOffset===0))continue;
        texts.push(node);
      }
      const from=texts[0]===range.startContainer?range.startOffset:0,to=texts.at(-1)===range.endContainer?range.endOffset:texts.at(-1)?.data.length;
      for(const mark of touching)mark.replaceWith(...mark.childNodes);
      if(texts.length){const keep=document.createRange();keep.setStart(texts[0],from);keep.setEnd(texts.at(-1),to);selection.removeAllRanges();selection.addRange(keep);}
    }
    if(same)return true;
    // The browser knows how to paint across lines and blocks, so let it, with a colour no one else uses, then turn that paint into marks.
    document.execCommand('hiliteColor',false,'rgb(1, 2, 3)');
    const made=[];
    for(const painted of editor.querySelectorAll('[style]')){
      if(painted.style.backgroundColor!=='rgb(1, 2, 3)')continue;
      painted.style.removeProperty('background-color');
      if(painted.tagName==='SPAN'){
        const mark=document.createElement('mark');mark.dataset.hl=color;mark.append(...painted.childNodes);painted.replaceWith(mark);made.push(mark);
      }else{
        const mark=document.createElement('mark');mark.dataset.hl=color;mark.append(...painted.childNodes);painted.append(mark);made.push(mark);
        if(!painted.getAttribute('style'))painted.removeAttribute('style');
      }
    }
    // Marks next to each other of one colour read as one.
    for(const mark of editor.querySelectorAll('mark')){
      const next=mark.nextSibling;
      if(next?.nodeName==='MARK'&&next.dataset.hl===mark.dataset.hl){mark.append(...next.childNodes);next.remove();}
    }
    // Keep the passage selected, so another colour (or the same one, to take it off) applies straight away.
    const first=made.find(mark=>mark.isConnected),last=made.findLast(mark=>mark.isConnected);
    if(first&&last){
      const keep=document.createRange();keep.setStart(first,0);keep.setEnd(last,last.childNodes.length);
      selection.removeAllRanges();selection.addRange(keep);
    }
    return true;
  }
  // Swap a plain-text block for another tag without letting the browser rewrap neighbouring tables.
  function setBlockTag(editor, tag) {
    const selection=window.getSelection();if(!selection.rangeCount)return false;
    const range=selection.getRangeAt(0);let block=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;
    while(block&&block.parentElement!==editor)block=block.parentElement;
    if(!block||block===editor)return false;
    if(block.tagName==='TABLE')return true;
    if(!/^(P|DIV|H[1-6])$/.test(block.tagName)||block.classList.contains('equation')||block.classList.contains('task-row'))return false;
    if(block.tagName===tag.toUpperCase())return true;
    const next=document.createElement(tag);
    if(block.style.textAlign)next.style.textAlign=block.style.textAlign;
    const {startContainer:sc,startOffset:so,endContainer:ec,endOffset:eo}=range;
    while(block.firstChild)next.append(block.firstChild);
    if(!next.firstChild)next.append(document.createElement('br'));
    block.replaceWith(next);
    const fix=(node,offset)=>node===block?[next,Math.min(offset,next.childNodes.length)]:[node,offset];
    const [a,ao]=fix(sc,so),[b,bo]=fix(ec,eo),restored=document.createRange();restored.setStart(a,ao);restored.setEnd(b,bo);selection.removeAllRanges();selection.addRange(restored);
    return true;
  }
  // ---- Pictures resize from their corners; the width is kept as a share of the note column. ----
  let resizer=null,pictureTarget=null,resizing=false,resizerTimer=0;
  function ensureResizer(){
    if(resizer)return resizer;
    resizer=document.createElement('div');resizer.className='image-resizer';resizer.hidden=true;
    for(const corner of ['nw','ne','sw','se']){
      const handle=document.createElement('div');handle.className='image-handle';handle.dataset.corner=corner;handle.title='Drag to resize';
      handle.addEventListener('pointerenter',()=>clearTimeout(resizerTimer));handle.addEventListener('pointerleave',()=>hideResizer());
      handle.addEventListener('pointerdown',event=>startPictureResize(event,corner));resizer.append(handle);
    }
    // Where the picture sits: in the line of text, or floated so the text flows beside it.
    const bar=document.createElement('div');bar.className='image-align';bar.setAttribute('role','group');bar.setAttribute('aria-label','Picture position');
    for(const [value,name,mark] of [['','In line with text','▤'],['left','Picture left, text wraps','◧'],['center','Picture centred','▥'],['right','Picture right, text wraps','◨']]){
      const b=document.createElement('button');b.type='button';b.textContent=mark;b.title=name;b.setAttribute('aria-label',name);b.dataset.align=value;
      b.onmousedown=e=>e.preventDefault();
      b.onclick=()=>{const picture=pictureTarget;if(!picture?.isConnected)return;if(value)picture.dataset.align=value;else delete picture.dataset.align;markAlign(picture);placeResizer(picture);picture.closest('.rich-text')?.dispatchEvent(new Event('input',{bubbles:true}))};
      bar.append(b);
    }
    bar.addEventListener('pointerenter',()=>clearTimeout(resizerTimer));bar.addEventListener('pointerleave',()=>hideResizer());
    resizer.append(bar);
    document.body.append(resizer);
    const reposition=()=>{if(resizer.hidden)return;if(!pictureTarget?.isConnected){resizer.hidden=true;return}placeResizer(pictureTarget)};
    window.addEventListener('scroll',reposition,true);window.addEventListener('resize',reposition);
    return resizer;
  }
  function placeResizer(picture){const r=picture.getBoundingClientRect();Object.assign(resizer.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'})}
  function markAlign(picture){for(const b of resizer.querySelectorAll('.image-align button')){const on=b.dataset.align===(picture.dataset.align||'');b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))}}
  function showResizer(picture){ensureResizer();clearTimeout(resizerTimer);pictureTarget=picture;placeResizer(picture);markAlign(picture);resizer.hidden=false}
  function hideResizer(){clearTimeout(resizerTimer);resizerTimer=setTimeout(()=>{if(!resizing&&resizer){resizer.hidden=true;pictureTarget=null}},300)}
  function startPictureResize(event,corner){
    const picture=pictureTarget;if(!picture||event.button!==0)return;
    event.preventDefault();event.stopPropagation();resizing=true;
    const editor=picture.closest('.rich-text'),style=getComputedStyle(editor),available=editor.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0);
    const startX=event.clientX,startWidth=picture.getBoundingClientRect().width,direction=corner.includes('e')?1:-1;
    const move=e=>{
      const width=Math.max(available*0.08,Math.min(available,startWidth+direction*(e.clientX-startX))),percent=Math.round(width/available*1000)/10;
      picture.dataset.width=String(percent);picture.style.width=percent+'%';placeResizer(picture);
    };
    const done=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',done);document.removeEventListener('pointercancel',done);resizing=false;editor.dispatchEvent(new Event('input',{bubbles:true}));hideResizer()};
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',done);document.addEventListener('pointercancel',done);
  }
  // An inline equation is not editable text, so each one needs a text node after it or the caret has nowhere to sit beside it.
  function ensureEquationAnchors(root) {
    for(const equation of root.querySelectorAll('.inline-equation:not(.editing)')){
      const next=equation.nextSibling;
      if(next?.nodeType===Node.TEXT_NODE)continue;
      equation.after(document.createTextNode('\u00a0'));
    }
  }
  // Browsers sometimes leave a non-breaking space between words, which glues them together and stops the line from re-wrapping.
  function normalizeSpaces(editor) {
    const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()){
      if(!node.data.includes('\u00a0')||node.parentElement.closest('pre,code,.equation'))continue;
      const pattern=/[^\s\u00a0]\u00a0(?=[^\s\u00a0])/g;let match;
      while((match=pattern.exec(node.data)))node.replaceData(match.index+1,1,' ');
    }
  }

  // ---- Right-click menu for table rows and columns ----
  let tableMenu=null;
  function hideTableMenu(){if(tableMenu){tableMenu.remove();tableMenu=null;}}
  function placeInCell(cell){const range=document.createRange();range.selectNodeContents(cell);range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}
  function newCell(like){const cell=document.createElement(like.tagName.toLowerCase());cell.innerHTML='<br>';return cell;}
  const tableActions=[
    ['Insert row above',cell=>{const row=cell.parentElement,copy=document.createElement('tr');for(const like of row.cells){const made=document.createElement(row.rowIndex===0&&like.tagName==='TH'?'td':like.tagName.toLowerCase());made.innerHTML='<br>';copy.append(made);}row.before(copy);return copy.cells[cell.cellIndex];}],
    ['Insert row below',cell=>{const row=cell.parentElement,copy=document.createElement('tr');for(const like of row.cells){const made=document.createElement(like.tagName==='TH'&&row.rowIndex===0?'td':like.tagName.toLowerCase());made.innerHTML='<br>';copy.append(made);}row.after(copy);return copy.cells[cell.cellIndex];}],
    ['Insert column left',cell=>{const index=cell.cellIndex,table=cell.closest('table');for(const row of table.rows)row.cells[Math.min(index,row.cells.length-1)].before(newCell(row.cells[Math.min(index,row.cells.length-1)]));delete table.dataset.widths;applyTableWidths(table);return cell.parentElement.cells[index];}],
    ['Insert column right',cell=>{const index=cell.cellIndex,table=cell.closest('table');for(const row of table.rows)row.cells[Math.min(index,row.cells.length-1)].after(newCell(row.cells[Math.min(index,row.cells.length-1)]));delete table.dataset.widths;applyTableWidths(table);return cell.parentElement.cells[index+1];}],
    null,
    ['Delete row',(cell,editor)=>{const row=cell.parentElement,table=row.closest('table');if(table.rows.length===1){removeTable(editor,table);return false;}const next=row.nextElementSibling||row.previousElementSibling;row.remove();return next.cells[Math.min(cell.cellIndex,next.cells.length-1)];}],
    ['Delete column',(cell,editor)=>{const index=cell.cellIndex,table=cell.closest('table');if(cell.parentElement.cells.length===1){removeTable(editor,table);return false;}for(const row of table.rows)row.cells[Math.min(index,row.cells.length-1)].remove();delete table.dataset.widths;applyTableWidths(table);const row=table.rows[Math.min(cell.parentElement.rowIndex,table.rows.length-1)];return row.cells[Math.min(index,row.cells.length-1)];}],
    ['Delete table',(cell,editor)=>{removeTable(editor,cell.closest('table'));return false;},true]
  ];
  function showTableMenu(editor, cell, x, y) {
    hideTableMenu();
    const menu=document.createElement('div');menu.className='table-menu';menu.setAttribute('role','menu');
    for(const entry of tableActions){
      if(!entry){const rule=document.createElement('hr');menu.append(rule);continue;}
      const [label,run,danger]=entry,item=document.createElement('button');item.type='button';item.setAttribute('role','menuitem');item.textContent=label;if(danger)item.className='danger';
      item.onmousedown=event=>event.preventDefault();
      item.onclick=()=>{hideTableMenu();editor.focus({preventScroll:true});const target=run(cell,editor);if(target)placeInCell(target);editor.dispatchEvent(new Event('input',{bubbles:true}));};
      menu.append(item);
    }
    document.body.append(menu);tableMenu=menu;
    menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';
    const close=event=>{if(event.type==='keydown'&&event.key!=='Escape')return;if(event.type==='pointerdown'&&menu.contains(event.target))return;hideTableMenu();for(const type of ['pointerdown','keydown','scroll','blur'])window.removeEventListener(type,close,true);};
    for(const type of ['pointerdown','keydown','scroll','blur'])window.addEventListener(type,close,true);
  }
  const histories=new WeakMap();
  function mount(block, wrap, onChange) {
    const editor=document.createElement('div'); editor.className='rich-text'; editor.contentEditable='true'; editor.spellcheck=true;
    editor.setAttribute('role','textbox'); editor.setAttribute('aria-label','Rich note text'); editor.setAttribute('aria-multiline','true');
    editor.innerHTML=block.html ? cleanHTML(block.html) : fromMarkdown(block.text);
    editor.setAttribute('data-placeholder','Click here to write…');
    // The placeholder belongs to a truly empty note only: no text (even a stray bare text node) and no pictures, tables, lists or equations.
    const syncEmpty=()=>{const empty=!editor.textContent.replace(/[\u200b\u00a0\s]/g,'')&&!editor.querySelector('img,table,.equation,hr,ul,ol,pre,blockquote,.task-row');if(empty)editor.setAttribute('data-empty','');else editor.removeAttribute('data-empty')};
    new MutationObserver(syncEmpty).observe(editor,{childList:true,subtree:true,characterData:true});
    syncEmpty();
    renderMath(editor);ensureEquationAnchors(editor);hoistTables(editor);
    const remember=()=>{const selection=window.getSelection();if(selection?.rangeCount&&editor.contains(selection.anchorNode))lastCaret={editor,range:selection.getRangeAt(0).cloneRange()}};
    for(const type of ['keyup','mouseup','input','compositionend'])editor.addEventListener(type,remember);
    editor.onfocus=()=>{focused={editor,block,onChange};};
    editor.onblur=()=>{editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));if(focused?.editor===editor)focused.selectedEquation=null;};
    // Clicking in the empty space after a line that ends with an inline equation puts the caret at the end of that line.
    editor.addEventListener('mouseup',event=>{
      if(event.button!==0||event.detail>1)return;
      const selection=window.getSelection();if(!selection?.isCollapsed)return;
      for(const equation of editor.querySelectorAll('.inline-equation:not(.editing)')){
        const box=equation.getBoundingClientRect();
        if(event.clientY<box.top-2||event.clientY>box.bottom+2||event.clientX<=box.right)continue;
        let tail=equation.nextSibling;while(tail?.nodeType===Node.TEXT_NODE&&!tail.data.replace(/[\s\u00a0\u200b]/g,''))tail=tail.nextSibling;
        if(tail&&tail.nodeName!=='BR')continue;
        event.preventDefault();placeCaretByEquation(editor,equation,true);return;
      }
    });
    editor.oninput=()=>{editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));if(focused?.editor===editor)focused.selectedEquation=null;normalizeSpaces(editor);ensureEquationAnchors(editor);hoistTables(editor);block.html=cleanHTML(editor.innerHTML);block.text=toMarkdown(editor);onChange();updateSlash(editor);};
    // ── Undo and redo ──
    // The note keeps its own history. The browser's undo loses track once the page rewrites the text itself (equations,
    // lists, tables, pictures), so each stop is a saved copy of the note and ⌘Z puts one back. Typing in one go is one step.
    const strip=html=>html.replace(/ data-passage-id="[^"]*"/g,'');
    const caretAt=()=>{const s=window.getSelection();if(!s?.rangeCount||!editor.contains(s.anchorNode))return null;const r=document.createRange();r.selectNodeContents(editor);r.setEnd(s.anchorNode,s.anchorOffset);return r.toString().length};
    const putCaret=offset=>{
      if(offset==null)return;const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);let left=offset,node,last=null;
      while((node=walker.nextNode())){last=node;if(left<=node.data.length){const r=document.createRange();r.setStart(node,left);r.collapse(true);const s=window.getSelection();s.removeAllRanges();s.addRange(r);return}left-=node.data.length}
      if(last)caretToEnd(editor);
    };
    const past={undo:[],redo:[],present:{html:strip(cleanHTML(editor.innerHTML)),caret:null},at:0,kind:'',restoring:false};
    const record=event=>{
      if(past.restoring)return;
      const html=cleanHTML(editor.innerHTML);
      if(strip(html)===strip(past.present.html)){past.present.caret=caretAt();return}
      const kind=event?.inputType||'',typing=/^(insertText|deleteContent(Backward|Forward)|insertCompositionText)$/.test(kind),now=Date.now();
      if(!(typing&&kind===past.kind&&now-past.at<1000)){past.undo.push(past.present);if(past.undo.length>300)past.undo.shift()}
      past.present={html,caret:caretAt()};past.redo=[];past.at=now;past.kind=kind;
    };
    editor.addEventListener('input',record);
    // anything changed without an input event (a heading picked, a table resized) becomes a step of its own before the next change
    function sync(){
      if(past.restoring)return;const now=cleanHTML(editor.innerHTML);
      if(strip(now)!==strip(past.present.html)){past.undo.push(past.present);past.present={html:now,caret:caretAt()};past.redo=[];past.kind=''}
    }
    function travel(from,to){
      sync();
      const target=past[from].pop();if(!target)return false;
      past[to].push(past.present);past.present=target;past.kind='';
      // lines the margin notes are pinned to keep their ids, matched by their text
      const ids=new Map();for(const line of editor.querySelectorAll('[data-passage-id]'))if(!ids.has(line.textContent))ids.set(line.textContent,line.dataset.passageId);
      past.restoring=true;
      editor.innerHTML=cleanHTML(target.html);renderMath(editor);ensureEquationAnchors(editor);hoistTables(editor);
      for(const line of editor.querySelectorAll('p,li,h1,h2,h3,blockquote,div'))if(!line.dataset.passageId&&line.textContent.trim()&&ids.has(line.textContent)){line.dataset.passageId=ids.get(line.textContent);ids.delete(line.textContent)}
      block.html=cleanHTML(editor.innerHTML);block.text=toMarkdown(editor);onChange();
      editor.focus({preventScroll:true});putCaret(target.caret);
      past.restoring=false;hideSlash();return true;
    }
    histories.set(editor,{sync,undo:()=>travel('undo','redo'),redo:()=>travel('redo','undo')});
    editor.addEventListener('keydown',event=>{
      const mod=event.metaKey||event.ctrlKey;if(!mod||event.altKey)return;
      if(event.target!==editor&&event.target.closest?.('input,textarea,.equation.editing,.procedure'))return;   // a field inside the note has its own undo
      const key=event.key.toLowerCase();
      if(key==='z'||(key==='y'&&!event.metaKey)){event.preventDefault();event.stopPropagation();(key==='y'||event.shiftKey)?travel('redo','undo'):travel('undo','redo')}
    },true);
    editor.addEventListener('beforeinput',event=>{
      sync();
      if(event.target!==editor&&event.target.closest?.('input,textarea,.equation.editing,.procedure'))return;
      if(event.inputType==='historyUndo'){event.preventDefault();travel('undo','redo')}
      else if(event.inputType==='historyRedo'){event.preventDefault();travel('redo','undo')}
    },true);
    // Backspace or Delete beside an equation. Within a line it goes at once. Reached from the edge of another line it
    // is selected first, and a second press removes it, so a whole equation never vanishes from one keystroke
    // meant for the line below. An empty line in between simply goes.
    const equationKey=(key,event)=>{
      const picked=focused?.editor===editor&&focused.selectedEquation?.isConnected?focused.selectedEquation:null,info={};
      const equation=picked||equationAtCaret(editor,key,info);
      if(!equation)return false;
      event.preventDefault();hideSlash();
      if(picked||!info.crossed){deleteEquation(editor,equation);return true;}
      const line=info.block;
      if(line&&line.isConnected&&!line.textContent.trim()&&!line.querySelector('img,.equation,table,.procedure')){line.remove();editor.dispatchEvent(new Event('input',{bubbles:true}));}
      editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));
      equation.classList.add('selected');if(focused?.editor===editor)focused.selectedEquation=equation;
      return true;
    };
    editor.onbeforeinput=event=>{
      if(event.inputType==='insertText'&&event.data===' '&&convertListMarker(editor)){event.preventDefault();hideSlash();return;}
      if(event.inputType==='insertText'&&event.data===' '&&convertSymbol(editor)){event.preventDefault();hideSlash();return;}
      const picked=pickedDisplayEquation(editor);
      if(picked&&event.inputType==='insertText'&&event.data){event.preventDefault();hideSlash();clearEquationSelection(editor);placeCaretByEquation(editor,picked,true);document.execCommand('insertText',false,event.data);return;}
      const key=event.inputType==='deleteContentBackward'?'Backspace':event.inputType==='deleteContentForward'?'Delete':null;
      if(!key)return;
      equationKey(key,event);
    };
    editor.onpaste=event=>{
      const data=event.clipboardData;if(!data)return;event.preventDefault();
      const image=[...(data.items||[])].find(item=>item.type.startsWith('image/'))?.getAsFile();if(image){insertImage(image);return;}
      const html=data.getData('text/html');
      if(html){document.execCommand('insertHTML',false,cleanHTML(html));renderMath(editor);editor.dispatchEvent(new Event('input',{bubbles:true}));}
      else document.execCommand('insertText',false,data.getData('text/plain'));
    };
    editor.onmousedown=event=>{
      if(event.target.closest('.equation.editing'))return;
      if(event.button===0){const edge=columnEdge(editor,event);if(edge){event.preventDefault();startColumnDrag(editor,edge,event);return;}}
      if(event.target.closest('.equation'))event.preventDefault();
    };
    editor.onmousemove=event=>{
      if(!resizing){const picture=event.target.closest?.('img');if(picture&&editor.contains(picture))showResizer(picture);else if(pictureTarget&&!event.target.closest?.('.image-resizer'))hideResizer()}
      if(event.buttons)return;editor.classList.toggle('col-resize',!!columnEdge(editor,event));
    };
    editor.oncontextmenu=event=>{
      const cell=event.target.closest?.('td,th');
      if(!cell||!editor.contains(cell)||event.target.closest('.equation'))return;
      event.preventDefault();placeInCell(cell);showTableMenu(editor,cell,event.clientX,event.clientY);
    };
    editor.onmouseleave=()=>{editor.classList.remove('col-resize');if(pictureTarget)hideResizer()};
    editor.onclick=event=>{
      if(event.target.closest('.equation.editing'))return;
      if(event.target===editor&&editor.lastElementChild&&event.clientY>editor.lastElementChild.getBoundingClientRect().bottom){
        caretToEnd(editor);return;
      }
      if(event.target.tagName==='INPUT'&&event.target.type==='checkbox'){event.target.toggleAttribute('checked',event.target.checked);editor.dispatchEvent(new Event('input',{bubbles:true}));}
      const equation=event.target.closest('.equation');
      if(equation && editor.contains(equation)){
        editor.focus({preventScroll:true});
        if(equation.classList.contains('display-equation'))selectEquation(editor,equation);
        else{
          editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));
          equation.classList.add('selected');if(focused?.editor===editor)focused.selectedEquation=equation;
          placeCaretByEquation(editor,equation,true);
        }
      }else{editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));if(focused?.editor===editor)focused.selectedEquation=null;}
      const link=event.target.closest('a');if(link&&(event.metaKey||event.ctrlKey)){event.preventDefault();if(window.webkit?.messageHandlers?.margin)window.webkit.messageHandlers.margin.postMessage({type:'openURL',url:link.href});else window.open(link.href,'_blank');}
    };
    editor.ondblclick=event=>{
      const edge=columnEdge(editor,event);
      if(edge){event.preventDefault();delete edge.table.dataset.widths;applyTableWidths(edge.table);editor.dispatchEvent(new Event('input',{bubbles:true}));return;}
      const equation=event.target.closest('.equation:not(.editing)');if(!equation||!editor.contains(equation))return;
      event.preventDefault();editEquation(editor,{equation});
    };
    editor.onkeydown=event=>{
      if(event.target!==editor&&event.target.closest?.('.equation.editing'))return;
      if(deleteBlankRow(editor,event))return;
      if(backspaceBelowTable(editor,event))return;
      if(backspaceBelowPicture(editor,event))return;
      if(event.key==='Tab'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!slash){
        const item=listItemAt(editor);
        if(item){
          event.preventDefault();
          if(event.shiftKey?outdentItem(item):indentItem(item))editor.dispatchEvent(new Event('input',{bubbles:true}));
          return;
        }
        const anchor=window.getSelection()?.anchorNode,inCode=(anchor?.nodeType===Node.ELEMENT_NODE?anchor:anchor?.parentElement)?.closest?.('pre');
        if(inCode&&editor.contains(inCode)){event.preventDefault();if(!event.shiftKey)document.execCommand('insertText',false,'    ');return;}
        const lines=indentableLines(editor);
        if(lines.length){
          event.preventDefault();
          if(lines.map(line=>shiftIndent(line,event.shiftKey?-1:1)).some(Boolean))editor.dispatchEvent(new Event('input',{bubbles:true}));
          return;
        }
      }
      // Backspace at the very start of an indented line steps it back out before it joins the line above.
      if(event.key==='Backspace'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&window.getSelection()?.isCollapsed){
        const selection=window.getSelection(),[line]=indentableLines(editor);
        if(line?.dataset.indent){
          const probe=document.createRange();probe.selectNodeContents(line);probe.setEnd(selection.anchorNode,selection.anchorOffset);
          if(!probe.toString().replace(/[\u200b]/g,'').length&&!probe.cloneContents().querySelector('img,.equation')){event.preventDefault();shiftIndent(line,-1);editor.dispatchEvent(new Event('input',{bubbles:true}));return;}
        }
      }
      if(event.key==='Backspace'&&!event.metaKey&&!event.ctrlKey&&!event.altKey){
        const selection=window.getSelection(),item=listItemAt(editor);
        if(item&&selection.isCollapsed&&item.parentElement.parentElement?.tagName==='LI'){
          const probe=document.createRange();probe.selectNodeContents(item);probe.setEnd(selection.anchorNode,selection.anchorOffset);
          if(!probe.toString().replace(/[\u200b]/g,'').length&&!probe.cloneContents().querySelector('img,.equation')&&outdentItem(item)){event.preventDefault();editor.dispatchEvent(new Event('input',{bubbles:true}));return;}
        }
        if(item&&selection.isCollapsed&&item.parentElement.parentElement?.tagName!=='LI'&&blankItem(item)){event.preventDefault();hideSlash();leaveList(item);editor.dispatchEvent(new Event('input',{bubbles:true}));return;}
      }
      if(event.key==='Enter'&&!event.shiftKey&&!event.metaKey&&!event.ctrlKey){
        const item=listItemAt(editor);
        if(item&&item.parentElement.parentElement?.tagName==='LI'&&blankItem(item)&&outdentItem(item)){event.preventDefault();editor.dispatchEvent(new Event('input',{bubbles:true}));return;}
        if(item&&!slash&&item.parentElement.parentElement?.tagName!=='LI'&&blankItem(item)){event.preventDefault();leaveList(item);editor.dispatchEvent(new Event('input',{bubbles:true}));return;}
      }
      if((event.key==='Backspace'||event.key==='Delete') && !event.metaKey && !event.ctrlKey && !event.altKey){
        if(event.key==='Backspace'&&unbulletAtStart(editor)){event.preventDefault();hideSlash();editor.dispatchEvent(new Event('input',{bubbles:true}));return;}
        if(event.key==='Delete'){
          const below=blockAfterBullet(editor);
          if(below){
            event.preventDefault();hideSlash();
            if(below.classList.contains('equation')){
              if(focused?.editor===editor&&focused.selectedEquation===below){deleteEquation(editor,below);return;}
              editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));below.classList.add('selected');if(focused?.editor===editor)focused.selectedEquation=below;
            }
            return;
          }
        }
        if(equationKey(event.key,event))return;
      }
      const picked=pickedDisplayEquation(editor);
      if(picked&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&!slash?.editor){
        if(event.key==='ArrowDown'||event.key==='ArrowRight'||event.key==='ArrowUp'||event.key==='ArrowLeft'){event.preventDefault();stepFromEquation(editor,picked,event.key==='ArrowDown'||event.key==='ArrowRight');return;}
        if(event.key==='Enter'){event.preventDefault();lineAfterEquation(editor,picked);return;}
        if(event.key==='Escape'){event.preventDefault();clearEquationSelection(editor);return;}
      }
      // Each block is its own editor, so when the caret cannot move any further in this one (an equation can pin it there), carry on into the neighbouring block.
      if((event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='ArrowRight'||event.key==='ArrowLeft')&&!event.shiftKey&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!slash?.editor&&editor.closest('#editor')){
        const selection=window.getSelection(),down=event.key==='ArrowDown'||event.key==='ArrowRight';
        if(selection?.isCollapsed&&selection.rangeCount&&!equationAtCaret(editor,event.key==='ArrowLeft'?'Backspace':'Delete')){
          const anchor=selection.anchorNode,offset=selection.anchorOffset;
          selection.modify('move',down?'forward':'backward',event.key.endsWith('Down')||event.key.endsWith('Up')?'line':'character');
          const stuck=!editor.contains(selection.anchorNode)||(selection.anchorNode===anchor&&selection.anchorOffset===offset);
          if(!stuck){event.preventDefault();return}
          const editors=[...editor.closest('#editor').querySelectorAll('.rich-text')],next=editors[editors.indexOf(editor)+(down?1:-1)];
          if(next){
            event.preventDefault();next.focus({preventScroll:true});
            const range=document.createRange();range.selectNodeContents(next);range.collapse(down);selection.removeAllRanges();selection.addRange(range);
            next.scrollIntoView({block:'nearest'});
          }
          return;
        }
      }
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
        const equation=equationAtCaret(editor,event.key==='ArrowLeft'?'Backspace':'Delete');
        if(equation&&equation.classList.contains('display-equation')&&!event.shiftKey&&!equation.parentElement?.closest('li')){event.preventDefault();selectEquation(editor,equation);return;}
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
      const cell=tableCellAt(editor);
      if(event.key==='Tab'&&cell){event.preventDefault();const table=cell.closest('table'),cells=[...table.querySelectorAll('td,th')];let next=cells[cells.indexOf(cell)+(event.shiftKey?-1:1)];if(!next&&!event.shiftKey){next=addTableRow(table).cells[0];editor.dispatchEvent(new Event('input',{bubbles:true}));}if(next){const range=document.createRange();range.selectNodeContents(next);range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}}
    };
    wrap.addEventListener('mousedown',event=>{wrap._down={x:event.clientX,y:event.clientY}});
    wrap.addEventListener('click',event=>{
      // Browser text selection owns clicks inside the editor. Only focus empty card space.
      const selection=window.getSelection();
      const dragged=wrap._down&&Math.hypot(event.clientX-wrap._down.x,event.clientY-wrap._down.y)>4;
      if(event.target===wrap && !dragged){
        editor.querySelectorAll('.equation.selected').forEach(item=>item.classList.remove('selected'));if(focused?.editor===editor)focused.selectedEquation=null;
        editor.focus({preventScroll:true});caretToEnd(editor);
      }
    });
    wrap.append(editor); return editor;
  }
  function command(name,value) {
    if(name!=='undo'&&name!=='redo'&&focused?.editor.isConnected)histories.get(focused.editor)?.sync();
    if(name==='undo'||name==='redo'){const target=focused?.editor.isConnected?focused.editor:lastCaret?.editor;if(target?.isConnected){target.focus({preventScroll:true});histories.get(target)?.[name]()}return;}
    if(!focused?.editor.isConnected){focused=null;document.querySelector('.rich-text')?.focus();if(!focused)return;}
    const {editor,block,onChange}=focused,saved=focused.range,force=focused.forceRange;
    editor.focus({preventScroll:true});
    // Focusing the editor can replace `focused` and move the caret, so work from what was captured first.
    if(focused?.editor===editor)focused.forceRange=false;
    // Re-selecting the saved range would discard a pending typing style (bold/italic toggled at a bare caret).
    const live=window.getSelection();
    if((force||!(live?.rangeCount && editor.contains(live.anchorNode))) && saved && editor.contains(saved.startContainer)){live.removeAllRanges();live.addRange(saved);if(focused?.editor===editor)focused.range=saved.cloneRange();}
    if(name==='link'){const url=prompt('Link URL (https://, file://, or mailto:)');if(!url)return;if(!safeURL(url)){alert('Use an https, file, or mailto link.');return;}document.execCommand('createLink',false,url);}
    else if(name==='table'){
      if(!value){const now=window.getSelection(),caret=now.rangeCount&&editor.contains(now.anchorNode)?now.getRangeAt(0):focused.range,saved={editor,block,onChange,range:caret?.cloneRange()};window.marginChooseTable?.(size=>{if(!editor.isConnected)return;focused={...saved,forceRange:true};command('table',size)});return;}
      const rows=Math.min(50,Math.max(1,Math.floor(Number(value.rows)||1))),cols=Math.min(12,Math.max(1,Math.floor(Number(value.columns)||1))),marker=crypto.randomUUID();
      document.execCommand('insertHTML',false,`<table data-new-table="${marker}"><tbody>${Array.from({length:rows},()=>'<tr>'+Array.from({length:cols},()=>'<td><br></td>').join('')+'</tr>').join('')}</tbody></table><p><br></p>`);
      const table=editor.querySelector(`[data-new-table="${marker}"]`);if(table){table.removeAttribute('data-new-table');applyTableWidths(table);const range=document.createRange();range.selectNodeContents(table.querySelector('td'));range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);focused.range=range.cloneRange();}
    }
    else if(name==='task')document.execCommand('insertHTML',false,'<div class="task-row" data-task="open"><input type="checkbox" contenteditable="false"><span>Task</span></div><p><br></p>');
    else if(name==='procedure'){window.ProcedureBox?.insert(editor);return;}
    else if(name==='equation'||name==='inlineequation'){
      const inline=name==='inlineequation',selection=window.getSelection(),picked=typeof value==='string'&&value?value:selection.rangeCount&&!selection.isCollapsed?selection.toString():'';
      editEquation(editor,{display:!inline,source:picked,insert:region=>{
        const range=selection.rangeCount?selection.getRangeAt(0):null;
        if(inline){if(range){range.deleteContents();range.insertNode(region);}else editor.append(region);return;}
        const origin=range&&(range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement);
        // In a list, the equation becomes part of that item, sitting under its text and above any sub-list.
        const item=origin?.closest?.('li');
        if(item&&editor.contains(item)){
          const nested=[...item.children].find(child=>/^(UL|OL)$/.test(child.tagName));
          const filler=[...item.childNodes].filter(node=>node.nodeName==='BR'&&!nested&&item.textContent.trim()==='');
          filler.forEach(node=>node.remove());
          item.insertBefore(region,nested||null);return;
        }
        let anchor=origin;
        while(anchor&&anchor.parentElement!==editor)anchor=anchor.parentElement;
        if(!anchor||anchor===editor)editor.append(region);
        else if(anchor.tagName==='P'&&!anchor.textContent.trim()&&!anchor.querySelector('img,.equation'))anchor.replaceWith(region);
        else anchor.after(region);
      }});
      return;
    }
    else if(name==='template'){
      if(!templates[value])return;
      const range=document.createRange();range.selectNodeContents(editor);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      document.execCommand('insertHTML',false,fromMarkdown(templates[value]));
      const end=document.createRange();end.selectNodeContents(editor);end.collapse(false);selection.removeAllRanges();selection.addRange(end);focused.range=end.cloneRange();
    }
    else if(name==='wordcount'){block.wordCount=!block.wordCount;window.marginWordCountRefresh?.();onChange();return;}
    else if(name==='image'){document.querySelector('#image-picker')?.click();return;}
    else if(name==='highlight'){if(!highlight(editor,value))return;}
    else if(name==='rule')document.execCommand('insertHorizontalRule');
    else if(name==='code')document.execCommand('formatBlock',false,'pre');
    else if(name==='heading'){if(!['p','h1','h2','h3'].includes(value))return;if(!setBlockTag(editor,value))document.execCommand('formatBlock',false,value);hoistTables(editor);}
    else if(name==='quote')document.execCommand('formatBlock',false,'blockquote');
    else document.execCommand(name,false,value||null);
    block.html=cleanHTML(editor.innerHTML);block.text=toMarkdown(editor);onChange();
  }
  function insertImage(file, alt='Image') {
    if(!focused?.editor.isConnected)return;
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>2_000_000){alert('Choose a PNG, JPEG, WebP, or GIF smaller than 2 MB.');return;}
    const target={...focused};
    const reader=new FileReader();
    reader.onload=()=>{if(typeof reader.result!=='string'||!safeURL(reader.result)||!target.editor.isConnected)return;const {editor,block,onChange}=target;editor.focus({preventScroll:true});if(target.range && editor.contains(target.range.startContainer)){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(target.range);}const marker=crypto.randomUUID();document.execCommand('insertHTML',false,`<img src="${reader.result}" alt="${escape(alt)}" data-new-image="${marker}"><p><br></p>`);
      // Leave the caret on an empty line right below the picture, ready to keep typing.
      const picture=editor.querySelector(`[data-new-image="${marker}"]`);
      if(picture){
        picture.removeAttribute('data-new-image');
        let top=picture;while(top.parentElement&&top.parentElement!==editor)top=top.parentElement;
        let next=top.nextElementSibling;
        if(!next||!/^(P|DIV)$/.test(next.tagName)||next.textContent.trim()||next.querySelector('img,table,.equation')){next=document.createElement('p');next.innerHTML='<br>';top.after(next);}
        const range=document.createRange();range.setStart(next,0);range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
        if(focused?.editor===editor)focused.range=range.cloneRange();
        editor.focus({preventScroll:true});window.getSelection().removeAllRanges();window.getSelection().addRange(range);
        next.scrollIntoView({block:'nearest'});
      }
      block.html=cleanHTML(editor.innerHTML);block.text=toMarkdown(editor);onChange();};
    reader.readAsDataURL(file);
  }
  function active() { return focused; }
  function reset(){focused=null;hideSlash();}
  const rememberedCaret=()=>lastCaret;
  return {rememberedCaret,fromMarkdown,toMarkdown,cleanHTML,mount,command,insertImage,active,reset,equationAtCaret,convertListMarker};
})();
