// The structure of a source file: its functions, classes and sections, with the lines each one covers. VS Code's own
// language support is used first; this reads the text directly for files it knows nothing about. No VS Code APIs here.
//
// A node is {name, kind, start, end, detail, children}: lines are 0-based and inclusive; kind is one of
// class, method, function, interface, enum, struct, namespace, section.

const BRACE_LANGUAGES=new Set(['javascript','javascriptreact','typescript','typescriptreact','c','cpp','csharp','java','swift','go','rust','kotlin','php','objective-c','objective-cpp','dart','scala']);
const KEYWORDS=new Set(['if','for','while','switch','catch','return','else','do','try','with','sizeof','typeof','await','new','delete','throw']);

const CLASSY=/^\s*(?:@\w+\s+)*(?:(?:export|default|public|private|protected|internal|open|final|abstract|static|sealed|partial|data|pub)\s+)*(class|interface|enum|struct|protocol|extension|trait|impl|namespace|object|record)\s+([A-Za-z_][\w.<>:, ]*?)\s*(?:[<:({\[]|extends\b|implements\b|where\b|for\b|$)/;
const FUNC_KEYWORD=/^\s*(?:@\w+\s+)*(?:(?:export|default|public|private|protected|internal|open|final|static|override|async|pub|unsafe|mutating|nonmutating|convenience|required|suspend|inline|operator|extern)\s+)*(?:function\*?|func|fn|fun)\s*(?:\([^)]*\)\s*)?([A-Za-z_$][\w$]*)/;
const ARROW=/^\s*(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=>/;
const METHOD=/^\s+(?:(?:public|private|protected|static|async|get|set|override|readonly|final|abstract)\s+)*\*?([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*(?::\s*[^{]+)?\{\s*$/;
const CFUNC=/^[A-Za-z_][\w\s\*&:<>,]*?[\s\*&]([A-Za-z_]\w*)\s*\([^;]*\)\s*(?:const\s*)?\{?\s*$/;
const PYTHON=/^(\s*)(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/;
const SHELL=/^\s*(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{?/;
const HEADING=/^(#{1,6})\s+(.+?)\s*#*\s*$/;

// The line a block closes on, matching { } from where it opens, ignoring braces inside strings and comments.
function closeOf(lines,start){
 let depth=0,opened=false,inBlock=false;
 for(let i=start;i<lines.length&&i<start+4000;i++){
  const line=lines[i];let quote='';
  for(let k=0;k<line.length;k++){
   const c=line[k],n=line[k+1];
   if(inBlock){if(c==='*'&&n==='/'){inBlock=false;k++}continue}
   if(quote){if(c==='\\')k++;else if(c===quote)quote='';continue}
   if(c==='/'&&n==='/')break;
   if(c==='/'&&n==='*'){inBlock=true;k++;continue}
   if(c==='"'||c==="'"||c==='`'){quote=c;continue}
   if(c==='{'){depth++;opened=true}
   else if(c==='}'&&opened){depth--;if(depth===0)return i}
  }
  // a header that never opens a brace within a few lines is a one-liner (an arrow function, a prototype)
  if(!opened){
   const next=(lines[i+1]||'').trim();
   // no brace yet: only a header carried onto more lines (a long parameter list, a brace on its own line) goes on looking
   if(/;\s*$/.test(line)||i>=start+3||!(next.startsWith('{')||/[,(]\s*$/.test(line)||/^[\w.:<>\[\]?,\s*&)-]*\{?\s*$/.test(next)&&/[,(]\s*$/.test(line)))return start;
  }
 }
 return opened?lines.length-1:start;
}
// Python: a block runs while the lines after it are indented more than its header.
function indentEnd(lines,start,indent){
 let end=start;
 for(let i=start+1;i<lines.length;i++){
  if(!lines[i].trim())continue;
  if(lines[i].match(/^\s*/)[0].length<=indent)break;
  end=i;
 }
 return end;
}
const sizeOf=node=>node.end-node.start+1;

function nest(nodes){
 nodes.sort((a,b)=>a.start-b.start||b.end-a.end);
 const roots=[],stack=[];
 for(const node of nodes){
  while(stack.length&&node.start>stack.at(-1).end)stack.pop();
  (stack.length?stack.at(-1).children:roots).push(node);
  stack.push(node);
 }
 return roots;
}

function detect(text,languageId=''){
 const lines=String(text||'').split(/\r?\n/),found=[];
 const add=(name,kind,start,end)=>found.push({name,kind,start,end,detail:(end-start+1)+' line'+(end===start?'':'s'),children:[]});
 if(languageId==='markdown'||languageId==='plaintext'&&false){
  const heads=[];let fence=false;
  lines.forEach((line,i)=>{if(/^\s*(```|~~~)/.test(line)){fence=!fence;return}if(fence)return;const m=line.match(HEADING);if(m)heads.push({level:m[1].length,name:m[2],start:i})});
  heads.forEach((h,k)=>{let end=lines.length-1;for(let j=k+1;j<heads.length;j++)if(heads[j].level<=h.level){end=heads[j].start-1;break}while(end>h.start&&!lines[end].trim())end--;add(h.name,'section',h.start,end)});
  return nest(found);
 }
 if(languageId==='python'){
  lines.forEach((line,i)=>{const m=line.match(PYTHON);if(!m)return;const indent=m[1].length;add(m[3],m[2]==='class'?'class':indent?'method':'function',i,indentEnd(lines,i,indent))});
  return nest(found);
 }
 if(languageId==='shellscript'||languageId==='shell'){
  lines.forEach((line,i)=>{const m=line.match(SHELL);if(m&&!KEYWORDS.has(m[1]))add(m[1],'function',i,closeOf(lines,i))});
  return nest(found);
 }
 if(!BRACE_LANGUAGES.has(languageId))return [];
 const cfamily=['c','cpp','objective-c','objective-cpp','csharp','java','php','dart'].includes(languageId);
 let depth=0;
 lines.forEach((line,i)=>{
  if(/^\s*(\/\/|\*|\/\*|#)/.test(line)){return}
  let m;
  if((m=line.match(CLASSY))&&!/;\s*$/.test(line)){add(m[2].trim().replace(/\s+/g,' '),m[1]==='interface'||m[1]==='protocol'||m[1]==='trait'?'interface':m[1]==='enum'?'enum':m[1]==='struct'?'struct':m[1]==='namespace'||m[1]==='extension'||m[1]==='impl'?'namespace':'class',i,closeOf(lines,i));return}
  if((m=line.match(FUNC_KEYWORD))){const inside=found.some(f=>f.start<i&&f.end>=i&&f.kind!=='function'&&f.kind!=='method');add(m[1],inside?'method':'function',i,closeOf(lines,i));return}
  if((m=line.match(ARROW))){add(m[1],'function',i,closeOf(lines,i));return}
  const insideClass=found.some(f=>f.start<i&&f.end>=i&&f.kind!=='function'&&f.kind!=='method');
  if(insideClass&&(m=line.match(METHOD))&&!KEYWORDS.has(m[1])){add(m[1],'method',i,closeOf(lines,i));return}
  if(cfamily&&!insideClass&&(m=line.match(CFUNC))&&!KEYWORDS.has(m[1])&&!/^\s*(return|else|case|typedef|using|import)\b/.test(line)&&!/=/.test(line.split('(')[0])){add(m[1],'function',i,closeOf(lines,i))}
 });
 return nest(found);
}

// Doc comments and decorators just above a block belong to it when it is copied.
function withLeadingComments(lines,start){
 let s=start;
 while(s>0&&/^\s*(\/\/|\/\*|\*|#|@\w|---|""")/.test(lines[s-1]))s--;
 return s;
}

// The innermost node holding a line, or null.
function enclosing(nodes,line){
 for(const node of nodes){
  if(line>=node.start&&line<=node.end)return enclosing(node.children,line)||node;
 }
 return null;
}

const api={detect,withLeadingComments,enclosing,sizeOf,closeOf,nest};
if(typeof module!=='undefined')module.exports=api;
