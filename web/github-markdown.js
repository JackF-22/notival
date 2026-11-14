// A note as GitHub-flavoured Markdown: what you write in Notival comes out the way GitHub reads it, so a note can be
// dropped into a repository as a README or a doc without anyone writing Markdown by hand. Headings, lists, task lists,
// tables, code (with its language), links, maths ($…$) and pictures are all handled; pictures are returned as files to
// save beside the .md. Needs the page (it reads the note's HTML) and RichEditor.cleanHTML.
const GithubMarkdown=(()=>{
 const BLOCKS=/^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|PRE|TABLE|HR|LI|FIGURE|SECTION)$/;
 const EXT={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
 const alnum=ch=>!!ch&&/[\p{L}\p{N}]/u.test(ch);
 const slug=text=>String(text||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32);
 function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
 const fenceFor=text=>'`'.repeat(Math.max(3,...[...String(text).matchAll(/`+/g)].map(m=>m[0].length+1)));
 const attr=text=>String(text).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

 // Characters in the text that Markdown would otherwise read as formatting. Underscores inside a word are left alone
 // (GitHub does not read them as emphasis), so snake_case_names stay readable in the source.
 function escapeText(text,{table=false}={}){
  const s=String(text).replace(/\u00a0/g,' ');let out='';
  for(let i=0;i<s.length;i++){
   const c=s[i],prev=s[i-1]||'',next=s[i+1]||'';
   if(c==='\\'){out+=/[!-/:-@[-`{-~]/.test(next)?'\\\\':'\\';continue}
   if(c==='`'||c==='*'||c==='$'){out+='\\'+c;continue}
   if(c==='~'&&(next==='~'||prev==='~')){out+='\\~';continue}
   if(c==='_'&&!(alnum(prev)&&alnum(next))){out+='\\_';continue}
   if(c==='<'&&/[A-Za-z/!?]/.test(next)){out+='\\<';continue}
   if(c===']'&&/[(\[:]/.test(next)){out+='\\]';continue}
   if(c==='&'&&/^#?\w+;/.test(s.slice(i+1))){out+='\\&';continue}
   if(c==='|'&&table){out+='\\|';continue}
   out+=c;
  }
  return out;
 }
 // A line that starts like a heading, quote, list or rule has to be told it is just text.
 function lineStart(line){
  let m;
  if((m=line.match(/^(\s*)#{1,6}(\s|$)/)))return m[1]+'\\'+line.slice(m[1].length);
  if((m=line.match(/^(\s*)>/)))return m[1]+'\\'+line.slice(m[1].length);
  if((m=line.match(/^(\s*)[-+](\s|$)/)))return m[1]+'\\'+line.slice(m[1].length);
  if((m=line.match(/^(\s*)(\d{1,9})([.)])(\s|$)/)))return m[1]+m[2]+'\\'+line.slice(m[1].length+m[2].length);
  if(/^\s*([-=_*])\1{2,}\s*$/.test(line))return line.replace(/^(\s*)(.)/,'$1\\$2');
  return line;
 }
 const paragraph=text=>{
  const lines=String(text).replace(/(\\\n)+$/,'').trim().split('\n').map(line=>lineStart(line.replace(/\s+$/,'')));
  return lines.join('\n').trim();
 };
 // Spaces at the edges go outside the marks, because "** word**" is not bold.
 const wrap=(open,inner,close=open)=>{const m=inner.match(/^(\s*)([\s\S]*?)(\s*)$/);return m[2]?m[1]+open+m[2]+close+m[3]:inner};
 function codeSpan(text){
  const body=String(text).replace(/\n/g,' '),fence='`'.repeat(Math.max(1,...[...body.matchAll(/`+/g)].map(m=>m[0].length+1)));
  const pad=/^`|`$/.test(body)?' ':'';return fence+pad+body+pad+fence;
 }
 const linkTarget=href=>String(href).trim().replace(/ /g,'%20').replace(/\(/g,'%28').replace(/\)/g,'%29');
 const safeLink=href=>/^(https?:|mailto:|#|\.{0,2}\/|[\w.-]+\/?[\w./#-]*$)/i.test(String(href||'').trim());

 // ── Pictures: a picture pasted into a note is kept inside it; here it becomes a file next to the Markdown ──
 function image(node,ctx){
  const src=node.getAttribute('src')||'',alt=(node.getAttribute('alt')||'').replace(/[\[\]\n]/g,' ').trim();
  let path=src;
  const data=src.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/s);
  if(data){
   let file=ctx.images.get(src);
   if(!file){file={name:(slug(alt)||'image')+'-'+hash(src).slice(0,6)+'.'+EXT[data[1]],mime:data[1],data:data[2]};ctx.images.set(src,file)}
   path=ctx.imagesDir+'/'+file.name;
  }else if(!/^https?:/i.test(src))return alt?escapeText(alt):'';
  const width=Number(node.dataset.width);
  if(width>=5&&width<100)return `<img src="${attr(path)}" alt="${attr(alt)}" width="${Math.round(width)}%">`;
  return `![${alt}](${linkTarget(path)})`;
 }

 // ── Inline ──
 function inlineNode(node,ctx){
  if(node.nodeType===3)return escapeText(node.textContent,ctx);
  if(node.nodeType!==1)return '';
  const tag=node.tagName,inner=()=>inline(node,ctx);
  if(tag==='BR')return ctx.table?'<br>':'\\\n';
  if(node.classList.contains('equation'))return '$'+String(node.dataset.equation||'').trim()+'$';
  if(tag==='STRONG'||tag==='B')return wrap('**',inner());
  if(tag==='EM'||tag==='I')return wrap('*',inner());
  if(tag==='S'||tag==='STRIKE'||tag==='DEL')return wrap('~~',inner());
  if(tag==='MARK')return wrap('<mark>',inner(),'</mark>');
  if(tag==='U'||tag==='INS')return wrap('<ins>',inner(),'</ins>');
  if(tag==='SUP')return wrap('<sup>',inner(),'</sup>');
  if(tag==='SUB')return wrap('<sub>',inner(),'</sub>');
  if(tag==='CODE')return node.textContent?codeSpan(node.textContent):'';
  if(tag==='IMG')return image(node,ctx);
  if(tag==='INPUT')return '';
  if(tag==='A'){
   const href=node.getAttribute('href')||'',text=inner();
   if(!safeLink(href))return text;
   return text.trim()?`[${text}](${linkTarget(href)})`:`<${href}>`;
  }
  return inner();
 }
 // Pieces of a line are joined with one space where two meet (a bold word's space and the text's own).
 const joinInline=pieces=>pieces.reduce((out,piece)=>out+(out.endsWith(' ')&&piece.startsWith(' ')?piece.slice(1):piece),'');
 const inline=(node,ctx)=>joinInline([...node.childNodes].map(child=>inlineNode(child,ctx)));

 // ── Blocks ──
 const isBlock=node=>node.nodeType===1&&(BLOCKS.test(node.tagName)||node.classList.contains('task-row')||(node.classList.contains('equation')&&node.tagName!=='SPAN'));
 function blocks(parent,ctx){
  const out=[];let run=[];
  const flush=()=>{const text=paragraph(joinInline(run.map(node=>inlineNode(node,ctx))));if(text)out.push(text);run=[]};
  for(const node of parent.childNodes){
   if(isBlock(node)){flush();out.push(...[].concat(block(node,ctx)||[]))}else run.push(node);
  }
  flush();return out;
 }
 function block(node,ctx){
  const tag=node.tagName,cls=node.classList;
  if(/^H[1-6]$/.test(tag)){const text=inline(node,{...ctx,table:true}).replace(/<br>/g,' ').replace(/\s+/g,' ').trim();return text?'#'.repeat(Math.min(6,Number(tag[1])+ctx.demote))+' '+text:null}
  if(cls.contains('task-row')){const done=!!node.querySelector('input')?.checked,text=escapeText(node.querySelector('span')?.textContent||node.textContent||'').trim();return `- [${done?'x':' '}] ${text}`}
  if(cls.contains('equation')){const eq=String(node.dataset.equation||'').trim();return eq?`$$\n${eq}\n$$`:null}
  if(cls.contains('procedure')){
   const steps=String(node.dataset.procedure||'').split('\n').map(line=>line.trim()).filter(Boolean),numbered=node.dataset.numbered==='1';
   return steps.length?steps.map((step,i)=>(numbered?(i+1)+'. ':'- ')+escapeText(step)).join('\n'):null;
  }
  if(cls.contains('cols'))return [...node.children].flatMap(col=>blocks(col,ctx));
  if(tag==='UL'||tag==='OL')return list(node,ctx);
  if(tag==='BLOCKQUOTE'){const text=blocks(node,ctx).join('\n\n');return text?text.split('\n').map(line=>line?'> '+line:'>').join('\n'):null}
  if(tag==='PRE'){
   const code=node.textContent.replace(/\n$/,''),lang=node.dataset.language||(node.className.match(/language-([\w+#-]+)/)||[])[1]||'';
   if(!code.trim())return null;const fence=fenceFor(code);return `${fence}${lang}\n${code}\n${fence}`;
  }
  if(tag==='TABLE')return table(node,ctx);
  if(tag==='HR')return '---';
  return blocks(node,ctx);
 }
 const indent=(text,pad)=>text.split('\n').map((line,i)=>i&&line?pad+line:line).join('\n');
 function list(node,ctx){
  const ordered=node.tagName==='OL';let n=Number(node.getAttribute('start'))||1;const items=[];
  for(const item of node.children){
   if(item.tagName!=='LI')continue;
   const marker=ordered?(n++)+'. ':'- ',pad=' '.repeat(marker.length);
   let run=[],head='';const nested=[];
   const flush=()=>{if(run.length){head+=joinInline(run.map(child=>inlineNode(child,ctx)));run=[]}};
   for(const child of item.childNodes){
    if(isBlock(child)){flush();for(const chunk of [].concat(block(child,ctx)||[]))nested.push({chunk,list:/^(UL|OL)$/.test(child.tagName)})}
    else run.push(child);
   }
   flush();
   const box=item.querySelector(':scope > input[type=checkbox]'),text=paragraph(head).replace(/^([-+]|\d+[.)])(\s)/,'\\$1$2');
   let out=marker+(box?(box.checked?'[x] ':'[ ] '):'')+indent(text,pad);
   for(const part of nested)out+=(part.list?'\n':'\n\n')+pad+indent(part.chunk,pad);
   items.push(out);
  }
  return items.join('\n');
 }
 function table(node,ctx){
  const cellCtx={...ctx,table:true},rows=[...node.querySelectorAll('tr')];
  if(!rows.length)return null;
  const text=cell=>{
   const parts=[];let run=[];
   const flush=()=>{const t=joinInline(run.map(n=>inlineNode(n,cellCtx))).trim();if(t)parts.push(t);run=[]};
   for(const child of cell.childNodes){if(child.nodeType===1&&BLOCKS.test(child.tagName)){flush();const t=inline(child,cellCtx).trim();if(t)parts.push(t)}else run.push(child)}
   flush();return parts.join('<br>').replace(/\n/g,' ');
  };
  const grid=rows.map(row=>[...row.children].map(text)),columns=Math.max(...grid.map(row=>row.length));
  for(const row of grid)while(row.length<columns)row.push('');
  const widths=Array.from({length:columns},(_,i)=>Math.max(3,...grid.map(row=>row[i].length)));
  const align=[...rows[0].children].map(cell=>(cell.style?.textAlign||cell.getAttribute('align')||'').toLowerCase());
  const rule=widths.map((w,i)=>align[i]==='center'?':'+'-'.repeat(w-2)+':':align[i]==='right'?'-'.repeat(w-1)+':':align[i]==='left'?':'+'-'.repeat(w-1):'-'.repeat(w));
  const line=cells=>'| '+cells.map((c,i)=>c+' '.repeat(widths[i]-c.length)).join(' | ')+' |';
  return [line(grid[0]),'| '+rule.join(' | ')+' |',...grid.slice(1).map(line)].join('\n');
 }

 // Task lines that follow one another are one list; everything else is separated by a blank line.
 const isTask=chunk=>/^- \[[ x]\] /.test(chunk);
 function join(chunks){
  let out='';
  chunks.forEach((chunk,i)=>{out+=(i?(isTask(chunk)&&isTask(chunks[i-1])?'\n':'\n\n'):'')+chunk});
  return out;
 }

 // The note, as {markdown, images:[{name,mime,data}], words}. `title` puts the note's name at the top as the heading.
 function fromNote(note,{title=true,imagesDir='images'}={}){
  const ctx={images:new Map(),imagesDir,demote:0,table:false},parts=[];
  for(const block of note.blocks||[]){
   if(block.type==='code'){parts.push({code:block});continue}
   const holder=document.createElement('div');
   holder.innerHTML=block.html?RichEditor.cleanHTML(block.html):RichEditor.fromMarkdown(block.text||'');
   parts.push({holder});
  }
  // One top-level heading per page: if the note has its own, it steps down once when the title is put above it.
  const name=String(note.title||'').trim(),useTitle=title&&!!name;
  if(useTitle&&parts.some(part=>part.holder?.querySelector('h1')))ctx.demote=1;
  const chunks=[];
  if(useTitle)chunks.push('# '+escapeText(name));
  for(const part of parts){
   if(part.code){
    const text=String(part.code.text||'').replace(/\n+$/,'');if(!text.trim())continue;
    const fence=fenceFor(text),lang=part.code.language&&part.code.language!=='text'?part.code.language:'';
    chunks.push(`${fence}${lang}\n${text}\n${fence}`);
   }else chunks.push(...blocks(part.holder,ctx));
  }
  const markdown=join(chunks).replace(/\n{3,}/g,'\n\n').trim()+'\n';
  const words=(markdown.replace(/```[\s\S]*?```/g,' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)||[]).length;
  return {markdown,images:[...ctx.images.values()],words};
 }
 return {fromNote,escapeText};
})();
if(typeof module!=='undefined')module.exports=GithubMarkdown;
