const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const context={};vm.createContext(context);
const load=file=>vm.runInContext(fs.readFileSync(file,'utf8'),context);
load('web/math/katex.min.js');load('web/math-syntax.js');
const P=vm.runInContext(fs.readFileSync('web/procedure-model.js','utf8')+';ProcedureModel',context);
const katex=vm.runInContext('katex',context);
// objects built inside the sandbox have another realm's prototypes; compare them as plain data
const parse=P.parse;P.parse=source=>JSON.parse(JSON.stringify(parse(source)));

// The algorithm from the paper
const beam=`Algorithm: Beam Search
Input: Beam width $k$, language model $p_{LM}$, vocabulary $\\Sigma$, max length $L_{\\max}$
Output: Best completed sequence

Initialize beam <- {(ε, 0)}  // start with empty sequence and score 0
Initialize completed <- ∅  // store finished sequences
while True do
  candidates <- ∅
  foreach (x, s) ∈ beam do
    foreach y ∈ Σ do
      xy <- x + y
      s' <- s + log p(y | x)
      candidates <- candidates ∪ {(xy, s')}  // extend each hypothesis
  beam <- top-k(candidates)
  completed <- completed ∪ {(x, s) ∈ beam : stop(x)}  // collect EOS-terminated sequences`;

// ── Reading it ──
const tree=P.parse(beam);
assert.deepEqual(tree.title,{kind:'Algorithm',name:'Beam Search'});
assert.deepEqual(tree.headers.map(h=>h.label),['Input','Output']);
assert.equal(tree.headers[1].text,'Best completed sequence');
assert.equal(tree.body.length,3,'two initialisations and the while loop at the top level');
const loop=tree.body[2];assert.equal(loop.text,'while True do');
assert.deepEqual(loop.children.map(c=>c.text.split(' ')[0]),['candidates','foreach','beam','completed'].map((w,i)=>i===1?'foreach':w));
assert.equal(loop.children[1].children[0].children.length,3,'three steps inside the inner loop');
// tabs and uneven indentation still nest sensibly
const odd=P.parse('a\n\tb\n\t\tc\n\td\ne');
assert.deepEqual(odd.body.map(n=>[n.text,n.children.map(c=>c.text+'['+c.children.map(g=>g.text)+']')]),[['a',['b[c]','d[]']],['e',[]]]);
// header lines only count at the top; later "Input:" is just a step
assert.equal(P.parse('Algorithm: X\nInput: y\n\nInput: z').headers.length,1);
assert.equal(P.parse('Input: y\nstep one').body.length,1);
// no title is fine; blank lines inside the steps are ignored
assert.equal(P.parse('x <- 1\n\ny <- 2').body.length,2);
assert.deepEqual(P.parse(''),{title:null,headers:[],body:[]});
assert.equal(P.parse('Function: gcd').title.kind,'Function');

// ── Drawing it ──
const out=P.html(beam,{number:1,katex});
assert.match(out,/<div class="proc-title"><b>Algorithm 1<\/b> Beam Search<\/div>/);
assert.match(out,/<b>Input:<\/b> Beam width <span class="katex">/,'maths in the header is typeset');
assert.match(out,/<b>while<\/b> <i>True<\/i> <b>do<\/b>/,'while … do in bold, True in italic');
assert.match(out,/<b>foreach<\/b> \(x, s\) ∈ beam <b>do<\/b>/);
assert.match(out,/Initialize beam ←/,'<- becomes an arrow');
assert.match(out,/<span class="proc-comment">\/\/ start with empty sequence and score 0<\/span>/,'comments are set apart');
assert.equal((out.match(/class="proc-block"/g)||[]).length,3,'three nested blocks get a guide line (while, foreach, foreach)');
assert(!out.includes('proc-no'),'no line numbers unless asked');
assert.equal((P.html(beam,{numbered:true,katex}).match(/class="proc-no"/g)||[]).length,11,'eleven numbered steps');
assert.match(P.html(beam,{numbered:true,katex}),/<span class="proc-no" aria-hidden="true">1<\/span><span class="proc-text">Initialize beam/);
// numbering of the box itself
assert.match(P.html('Procedure: A\nx <- 1',{number:3}),/<b>Procedure 3<\/b> A/);
assert.equal(P.label('Algorithm: Beam Search',2),'Algorithm 2: Beam Search');

// ── Symbols and keywords ──
const line=(text,withKatex)=>P.inline(text,withKatex);
assert.equal(line('a <- b'),'a ← b');assert.equal(line('x != y'),'x ≠ y');assert.equal(line('x <= 3 and y >= 4'),'x ≤ 3 and y ≥ 4');
assert.equal(line('f -> g'),'f → g');assert.equal(line('a <-> b'),'a ↔ b');
assert.equal(line('if x > 0 then'),'<b>if</b> x &gt; 0 <b>then</b>');
assert.equal(line('if a and not b then'),'<b>if</b> a <b>and</b> <b>not</b> b <b>then</b>');
assert.equal(line('for i = 1 to n do'),'<b>for</b> i = 1 <b>to</b> n <b>do</b>');
assert.equal(line('else if x < 0 then'),'<b>else if</b> x &lt; 0 <b>then</b>');
assert.equal(line('return result'),'<b>return</b> result');
assert.equal(line('repeat'),'<b>repeat</b>');assert.equal(line('end if'),'<b>end if</b>');
// ordinary sentences are left alone: no keywords hiding in prose
assert.equal(line('Add the item to the list and do nothing else'),'Add the item to the list and do nothing else');
assert.equal(line('Initialize the format string'),'Initialize the format string');
assert.equal(line('endpoint <- 3'),'endpoint ← 3');
// comments, URLs and html in text
assert.equal(line('x <- 1 // set x'),'x ← 1 <span class="proc-comment">// set x</span>');
assert.equal(line('// just a note'),'<span class="proc-comment">// just a note</span>');
assert.equal(line('fetch http://example.com/a'),'fetch http://example.com/a');
assert.equal(line('a <b>bold</b> & more'),'a &lt;b&gt;bold&lt;/b&gt; &amp; more');
assert.equal(line('price $5 and then $10'),'price $5 and then $10','prices are not maths');
assert.match(line('area <- $\\pi r^2$',katex),/area ← <span class="katex">/);
assert.equal(line('x <- $a<b$ // $c$'),'x ← <i>a&lt;b</i> <span class="proc-comment">// <i>c</i></span>','without katex, maths shows as italic source');
// titles and headers don't get keyword treatment
assert.match(P.html('Algorithm: Return Policy\nInput: for each item\n\nx <- 1',{katex}),/<b>Algorithm 1<\/b> Return Policy/);
assert(!P.html('Algorithm: Return Policy',{katex}).includes('<b>Return</b>'));
// nothing you type can inject markup
{const hostile=P.html('Algorithm: <script>alert(1)</script>\nInput: <img onerror=x>\n\n<img src=x onerror=y>',{katex});
assert(!/<(script|img)\b/i.test(hostile),'no live tags');assert(hostile.includes('&lt;script&gt;')&&hostile.includes('&lt;img'),'shown as text')}
assert.match(P.html(''),/proc-empty/);

// ── Writing it: where the next line starts ──
assert.equal(P.nextIndent('while True do'),'  ');
assert.equal(P.nextIndent('    foreach y ∈ Σ do  // loop'),'      ');
assert.equal(P.nextIndent('  if x then'),'    ');assert.equal(P.nextIndent('else'),'  ');assert.equal(P.nextIndent('repeat'),'  ');
assert.equal(P.nextIndent('  x <- 1'),'  ');assert.equal(P.nextIndent('Input: a thing:'),'');assert.equal(P.nextIndent('Algorithm: Do'),'');

// ── LaTeX written without dollar signs ──
const bare=line('beam \\leftarrow \\{(\\epsilon, 0)\\}',katex);
assert(!bare.includes('\\'),'no raw backslashes left: '+bare);assert((bare.match(/class="katex"/g)||[]).length>=2,'commands are typeset');
assert(bare.includes('⟩')===false&&bare.startsWith('beam '),'the plain word stays plain');
assert.match(line('y \\in \\Sigma',katex),/^y <span class="katex">.*<\/span> <span class="katex">/);
assert.match(line('foreach y \\in \\Sigma do',katex),/^<b>foreach<\/b> y <span class="katex">.*<\/span> <span class="katex">.*<\/span> <b>do<\/b>$/s,'keywords still work around it');
assert.equal(line('copy C:\\Users\\me',katex),'copy C:\\Users\\me','not LaTeX, so left as typed');
assert.equal(line('x \\in S'),'x \\in S','without a maths engine it is left alone');
assert.equal(line('a \\left( b',katex),'a \\left( b','unreadable LaTeX is left as typed, not as an error');
assert.match(line('x <- 1 // uses \\epsilon',katex),/proc-comment">\/\/ uses <span class="katex">/,'in comments too');
assert.match(P.html('Algorithm: T\nInput: all \\Sigma\n\nx <- 1',{katex}),/<b>Input:<\/b> all <span class="katex">/,'in the header too');
assert(!P.html('Algorithm: Fine\nx \\gets y \\cup \\{z\\}',{katex}).includes('katex-error'));

// ── Pasting a LaTeX algorithm ──
const euclid=`\\begin{algorithm}
\\caption{Euclid}
\\begin{algorithmic}[1]
\\Require integers $a, b$
\\Ensure $\\gcd(a,b)$
\\While{$b \\neq 0$}
  \\State $t \\gets b$
  \\State $b \\gets a \\bmod b$ \\Comment{remainder}
  \\State $a \\gets t$
\\EndWhile
\\If{$a < 0$} \\State $a \\gets -a$ \\EndIf
\\State \\Return $a$
\\end{algorithmic}
\\end{algorithm}`;
assert(P.looksLikeLatex(euclid)&&P.looksLikeLatex('\\State x')&&!P.looksLikeLatex('Algorithm: X\nx <- 1\n\\alpha b'));
assert.equal(P.fromLatex(euclid),`Algorithm: Euclid
Input: integers $a, b$
Output: $\\gcd(a,b)$

while $b \\neq 0$ do
  $t \\gets b$
  $b \\gets a \\bmod b$  // remainder
  $a \\gets t$
if $a < 0$ then
  $a \\gets -a$
return $a$`);
assert.equal(P.fromLatex('\\State $x \\gets 0$\n\\If{$x > 0$}\n \\State A\n\\ElsIf{$x < 0$}\n \\State B\n\\Else\n \\State C\n\\EndIf'),
 '$x \\gets 0$\nif $x > 0$ then\n  A\nelse if $x < 0$ then\n  B\nelse\n  C');
assert.equal(P.fromLatex('\\Repeat \\State step \\State \\Call{Work}{$n$} \\Until{$n = 0$}'),'repeat\n  step\n  Work($n$)\nuntil $n = 0$');
assert.equal(P.fromLatex('\\Function{Gcd}{$a,b$} \\State \\Return $a$ \\EndFunction \\State done'),'function Gcd($a,b$)\n  return $a$\ndone');
assert.equal(P.fromLatex('\\For{$i=1$ to $n$} \\ForAll{$x \\in S$} \\State go \\EndFor \\EndFor'),'for $i=1$ to $n$ do\n  for all $x \\in S$ do\n    go');
assert.equal(P.fromLatex('% only a comment\n\\State a % trailing\n\\State b'),'a\nb','LaTeX comments are dropped');
assert.equal(P.fromLatex('\\EndIf \\EndIf \\State x'),'x','stray ends never indent below zero');
// what comes out reads back as a procedure
const read=P.parse(P.fromLatex(euclid));
assert.equal(read.title.name,'Euclid');assert.equal(read.body.length,3);assert.equal(read.body[0].children.length,3);
assert.match(P.html(P.fromLatex(euclid),{katex}),/<b>while<\/b> .*<b>do<\/b>/s);

console.log('PASS: procedures — title, Input/Output, nesting by indentation, arrows, keywords without hiding in prose, comments, typeset maths, bare LaTeX commands, LaTeX algorithm import, line numbers, safe output, smart indent.');
