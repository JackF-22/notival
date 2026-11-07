// Procedures: pseudocode and step-by-step methods, written as plain indented text and drawn like the algorithm
// boxes in a paper. Pure functions; the editor window lives in procedure-editor.js.
//
//   Algorithm: Beam Search                      a title (also Procedure:, Function:)
//   Input: Beam width $k$, vocabulary $\Sigma$  Input / Output / Requires / Ensures lines, bold label
//   Output: Best completed sequence
//                                               a blank line, then the steps; indentation is nesting
//   beam <- {(ε, 0)}  // start empty            <- becomes ←, // starts a comment, $…$ is typeset maths
//   while True do
//     foreach y ∈ Σ do
//       xy <- x + y
const ProcedureModel=(()=>{
 const esc=text=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const TITLE=/^(algorithm|procedure|function|routine|method)\s*[:：]\s*(.*)$/i;
 const HEADER=/^(input|output|requires?|ensures?|given|returns?|goal|data|result)\s*[:：]\s*(.*)$/i;
 const cap=word=>word.charAt(0).toUpperCase()+word.slice(1).toLowerCase();

 // ── Reading the text ───────────────────────────────────────────────────────
 // {title:{kind,name}|null, headers:[{label,text}], body:[{text,children}]}
 function parse(source){
  const lines=String(source||'').replace(/\r/g,'').replace(/\t/g,'    ').split('\n').map(line=>line.replace(/\s+$/,''));
  let title=null,head=true;const headers=[],root=[],stack=[{indent:-1,children:root}];
  for(const line of lines){
   const trimmed=line.trim();
   if(head){
    if(!trimmed){if(headers.length)head=false;continue}      // a blank line after Input/Output starts the steps
    const t=!title&&!headers.length&&trimmed.match(TITLE);
    if(t){title={kind:cap(t[1]),name:t[2].trim()};continue}
    const h=line.search(/\S/)===0&&trimmed.match(HEADER);
    if(h){headers.push({label:cap(h[1]),text:h[2].trim()});continue}
    head=false;
   }
   if(!trimmed)continue;
   const indent=line.search(/\S/),node={text:trimmed,children:[]};
   while(stack.at(-1).indent>=indent)stack.pop();
   stack.at(-1).children.push(node);stack.push({indent,children:node.children});
  }
  return {title,headers,body:root};
 }

 // ── Dressing one line ──────────────────────────────────────────────────────
 const LEADING=/^(else\s+if|elseif|elif|else|for\s+each|foreach|for|while|repeat|until|if|return|break|continue|function|procedure|call|print|end(?:\s+(?:if|for|while|function|procedure))?)\b/i;
 const CONTROL=/^(else\s+if|elseif|elif|for\s+each|foreach|for|while|until|if)\b/i;
 const FOR=/^(for\s+each|foreach|for)\b/i;
 const OPERATORS=[[/<->/g,'↔'],[/<-/g,'←'],[/->/g,'→'],[/!=/g,'≠'],[/<=/g,'≤'],[/>=/g,'≥'],[/=>/g,'⇒']];
 // `katex` is optional: without it, maths is shown as italic source.
 function inline(text,katex,{keywords=true}={}){
  const held=[],hold=html=>{held.push(html);return '\u0001'+(held.length-1)+'\u0002'};
  const math=source=>{
   if(katex){try{return hold(katex.renderToString(typeof MathSyntax!=='undefined'?MathSyntax.katexSource(source):source,{throwOnError:false,trust:false,output:'html'}))}catch{}}
   return hold('<i>'+esc(source)+'</i>');
  };
  let work=typeof MathSyntax!=='undefined'?MathSyntax.inlineMath(String(text),math):String(text);
  // a comment runs from `//` (at the start, or after a space) to the end of the line
  const cut=work.search(/(^|\s)\/\//);
  let comment='';
  if(cut>=0){comment=work.slice(cut).trim().replace(/^\/\/\s?/,'');work=work.slice(0,cut)}
  for(const [pattern,symbol] of OPERATORS)work=work.replace(pattern,symbol);
  let html=esc(work);
  const control=keywords&&CONTROL.test(html.trim()),loop=keywords&&FOR.test(html.trim());
  if(keywords)html=html.replace(LEADING,word=>`<b>${word}</b>`);
  // inside a control line the words that belong to its grammar are keywords too
  if(control)html=html.replace(/\b(then|do|and|or|not)\b/gi,'<b>$1</b>');
  if(loop)html=html.replace(/\b(to|downto|step|in)\b/gi,'<b>$1</b>');
  else if(keywords&&(/\b(do|then)\s*$/i.test(html)||/^\s*(repeat|else)\b/i.test(html)))html=html.replace(/\b(then|do)\s*$/i,'<b>$1</b>');
  if(keywords)html=html.replace(/\b(True|False|Null|None|Nil|NULL|true|false|null|nil)\b/g,'<i>$1</i>');
  const restore=value=>value.replace(/\u0001(\d+)\u0002/g,(_,index)=>held[Number(index)]);
  html=restore(html);
  if(comment)html+=(html?' ':'')+`<span class="proc-comment">// ${restore(esc(comment))}</span>`;
  return html;
 }

 // ── The box ────────────────────────────────────────────────────────────────
 // number is the "1" in "Algorithm 1": the box's place among the note's procedures.
 function html(source,{number=1,numbered=false,katex=null}={}){
  const {title,headers,body}=parse(source);
  if(!title&&!headers.length&&!body.length)return '<div class="proc-empty">Empty procedure. Double-click to write one.</div>';
  const parts=[];
  if(title)parts.push(`<div class="proc-title"><b>${esc(title.kind)} ${number}</b> ${inline(title.name,katex,{keywords:false})}</div>`);
  if(headers.length)parts.push(`<div class="proc-head">${headers.map(item=>`<div class="proc-io"><b>${esc(item.label)}:</b> ${inline(item.text,katex,{keywords:false})}</div>`).join('')}</div>`);
  if(body.length){
   let count=0;
   const lines=nodes=>nodes.map(node=>{
    count++;
    const line=`<div class="proc-line">${numbered?`<span class="proc-no" aria-hidden="true">${count}</span>`:''}<span class="proc-text">${inline(node.text,katex)}</span></div>`;
    return line+(node.children.length?`<div class="proc-block">${lines(node.children)}</div>`:'');
   }).join('');
   parts.push(`<div class="proc-body">${lines(body)}</div>`);
  }
  return parts.join('');
 }
 const label=(source,number=1)=>{const {title}=parse(source);return title?`${title.kind} ${number}: ${title.name}`:`Procedure ${number}`};

 // ── Writing it ─────────────────────────────────────────────────────────────
 // The indentation for the line after `line`: the same, and one step deeper after do / then / else / repeat / a colon.
 function nextIndent(line,step='  '){
  const indent=String(line).match(/^[ \t]*/)[0];
  const code=String(line).replace(/\s*\/\/.*$/,'').trim();
  return /(\bdo|\bthen|\belse|\brepeat|:)$/i.test(code)&&!HEADER.test(code)&&!TITLE.test(code)?indent+step:indent;
 }
 const starter='Algorithm: Name\nInput: what goes in\nOutput: what comes out\n\nresult <- ∅\nforeach x ∈ items do\n  if x > 0 then\n    result <- result ∪ {x}  // keep positives\nreturn result';

 return {parse,inline,html,label,nextIndent,starter};
})();
if(typeof module!=='undefined')module.exports=ProcedureModel;
