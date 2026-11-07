// How math is written in a note's Markdown, and how LaTeX from other places is tidied before it is shown.
// Pure functions: rich-editor.js calls them while turning Markdown into cells and latex-tidy callers use them on OCR output.
const MathSyntax=(()=>{
 const ENVIRONMENTS='equation|equation\\*|align|align\\*|alignat|alignat\\*|gather|gather\\*|multline|multline\\*|eqnarray|eqnarray\\*|flalign|flalign\\*';
 const OPEN=new RegExp('^\\\\begin\\{('+ENVIRONMENTS+')\\}');
 // KaTeX has no multline/eqnarray; these are the closest environments it does have.
 const SUBSTITUTE={multline:'gathered','multline*':'gathered',eqnarray:'aligned','eqnarray*':'aligned',flalign:'aligned','flalign*':'aligned'};

 // Source for KaTeX: environments it does not know become ones it does; a lone `equation` wrapper is just the formula.
 function katexSource(source){
  let text=String(source).trim();
  const m=text.match(new RegExp('^\\\\begin\\{('+ENVIRONMENTS+')\\}([\\s\\S]*)\\\\end\\{\\1\\}$'));
  if(!m)return text;
  const name=m[1],body=m[2].trim();
  if(name==='equation'||name==='equation*')return body;
  if(SUBSTITUTE[name])return '\\begin{'+SUBSTITUTE[name]+'}'+body.replace(/&=&/g,'&=')+'\\end{'+SUBSTITUTE[name]+'}';
  return text;
 }

 // Does a display equation start at lines[i]? Returns {source,next} (next = first line after it) or null.
 // Accepts $$ … $$ (alone, one-liner, or hugging the content), \[ … \], and \begin{align}… environments.
 function displayAt(lines,i){
  const first=lines[i].trim();
  for(const [open,close] of [['$$','$$'],['\\[','\\]']]){
   if(!first.startsWith(open))continue;
   const rest=first.slice(open.length);
   if(rest.trim().endsWith(close)&&rest.trim().length>close.length){
    const source=rest.trim().slice(0,-close.length).trim();
    return source&&!(open==='$$'&&source.includes('$$'))?{source,next:i+1}:null;
   }
   const body=[rest];let j=i+1;
   while(j<lines.length&&!lines[j].trim().endsWith(close)){body.push(lines[j]);j++}
   if(j>=lines.length)return null;           // never closed: leave it as ordinary text
   const last=lines[j].trim();body.push(last.slice(0,-close.length));
   const source=body.join('\n').trim();
   return source?{source,next:j+1}:null;
  }
  const env=first.match(OPEN);
  if(env){
   const body=[];let j=i;const end='\\end{'+env[1]+'}';
   while(j<lines.length){body.push(lines[j]);if(lines[j].includes(end))break;j++}
   if(j>=lines.length)return null;
   return {source:body.join('\n').trim(),next:j+1};
  }
  return null;
 }

 // Replace inline math in raw (unescaped) text. `$…$` follows the usual rules so prices are left alone:
 // no space just inside the dollar signs, and no digit straight after the closing one. `\(…\)` also counts.
 function inlineMath(text,keep){
  let out='',i=0;const s=String(text);
  while(i<s.length){
   const c=s[i];
   if(c==='\\'&&s[i+1]==='$'){out+='\\$';i+=2;continue}
   if(c==='\\'&&s[i+1]==='('){
    const end=s.indexOf('\\)',i+2);
    if(end>i+2&&!s.slice(i+2,end).includes('\n')){out+=keep(s.slice(i+2,end).trim());i=end+2;continue}
   }
   if(c==='$'&&s[i+1]==='$'){
    // $$…$$ in the middle of a sentence still reads as math, just not as its own block
    const end=s.indexOf('$$',i+2);
    if(end>i+2&&!s.slice(i+2,end).includes('\n')&&s.slice(i+2,end).trim()){out+=keep(s.slice(i+2,end).trim());i=end+2;continue}
   }
   // "$5 or", "$10." and "$1,200" are prices; a number only opens math when it carries on into math ($5x$, $2^n$, $10$).
   const price=c==='$'&&/^\$\d[\d,]*(?:\.\d+)?(?![\w\\^_{(.$]|\.\d)/.test(s.slice(i,i+24));
   if(c==='$'&&!price&&s[i+1]!=='$'&&s[i+1]&&!/\s/.test(s[i+1])){
    let j=i+1,found=-1;
    while(j<s.length){
     if(s[j]==='\n')break;
     if(s[j]==='\\'){j+=2;continue}
     if(s[j]==='$'&&!/\s/.test(s[j-1])&&!/\d/.test(s[j+1]||'')){found=j;break}
     j++;
    }
    if(found>0){out+=keep(s.slice(i+1,found));i=found+1;continue}
   }
   out+=c;i++;
  }
  return out;
 }

 // ── Tidying LaTeX that came from recognition ───────────────────────────────
 // The model spaces every token ("x ^ { 2 }"). Close that up so the source is readable and easy to correct.
 function tidyLatex(latex){
  const source=String(latex),tokens=[];
  for(let i=0;i<source.length;){
   const rest=source.slice(i),word=rest.match(/^\\(?:text|textrm|textit|textbf|mbox|hbox)\s*\{/);
   if(word){
    // Words in text mode keep their spaces.
    let depth=1,j=word[0].length;while(j<rest.length&&depth){if(rest[j]==='{')depth++;else if(rest[j]==='}')depth--;j++}
    tokens.push(word[0].replace(/\s+/g,'')+rest.slice(word[0].length,j-1).replace(/\s+/g,' ').trim()+(depth?'':'}'));i+=j;continue;
   }
   const m=rest.match(/^(?:\\[A-Za-z]+|\\.|\s+|.)/s);tokens.push(m[0]);i+=m[0].length;
  }
  const kept=tokens.filter(t=>!/^\s+$/.test(t));
  let out='';
  kept.forEach((token,k)=>{
   out+=token;
   const next=kept[k+1];
   // `\alpha b` needs its space; `\alpha(` and `\alpha^` do not.
   if(/^\\[A-Za-z]+$/.test(token)&&next&&/^[A-Za-z]/.test(next))out+=' ';
  });
  // x^{2} -> x^2, a_{i} -> a_i when the braces hold a single letter or digit
  out=out.replace(/([\^_])\{([A-Za-z0-9])\}/g,'$1$2');
  // \mathrm { Var } style: no space was kept, so only the braces remain; text-like commands keep a plain word
  out=out.replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\s*/g,'');
  return out;
 }
 return {displayAt,inlineMath,katexSource,tidyLatex};
})();
if(typeof module!=='undefined')module.exports=MathSyntax;
