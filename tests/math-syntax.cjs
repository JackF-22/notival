const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const M=require('../web/math-syntax.js');
const katex=vm.runInNewContext(fs.readFileSync('web/math/katex.min.js','utf8')+';katex',{});
const mathml=latex=>katex.renderToString(M.katexSource(latex),{output:'mathml',displayMode:true,throwOnError:true}).replace(/<annotation[\s\S]*?<\/annotation>/g,'');

// ── Display equations: every common way of writing one ──────────────────────
const at=(text,i=0)=>M.displayAt(text.split('\n'),i);
assert.deepEqual(at('$$\nx^2\n$$'),{source:'x^2',next:3});                      // delimiters on their own lines
assert.deepEqual(at('$$x^2+y^2=z^2$$'),{source:'x^2+y^2=z^2',next:1});          // all on one line
assert.deepEqual(at('$$ \\frac{a}{b} $$'),{source:'\\frac{a}{b}',next:1});
assert.deepEqual(at('$$a=1\nb=2$$'),{source:'a=1\nb=2',next:2});                // delimiters hugging the content
assert.deepEqual(at('\\[ x^2 \\]'),{source:'x^2',next:1});
assert.deepEqual(at('\\[\nx^2\n\\]'),{source:'x^2',next:3});
assert.equal(at('\\begin{align}\na&=b\\\\\nc&=d\n\\end{align}').source,'\\begin{align}\na&=b\\\\\nc&=d\n\\end{align}');
assert.equal(at('\\begin{equation}x=1\\end{equation}').next,1);
// Text after the block is left for the next line; a missing closer doesn't swallow the note
assert.deepEqual(at('$$\nx\n$$\nafter',0),{source:'x',next:3});
assert.equal(at('$$\nnever closed\nand more text'),null);
assert.equal(at('$$$$'),null);
assert.equal(at('Just a sentence'),null);
assert.equal(at('\\begin{tabular}a\\end{tabular}'),null);                      // only math environments

// ── Inline math: prices stay prices ─────────────────────────────────────────
const inline=text=>{const found=[];const rest=M.inlineMath(text,eq=>{found.push(eq);return '<'+found.length+'>'});return {rest,found}};
assert.deepEqual(inline('Let $x^2$ be given'),{rest:'Let <1> be given',found:['x^2']});
assert.deepEqual(inline('It costs $5 and then $10 more.'),{rest:'It costs $5 and then $10 more.',found:[]});
assert.deepEqual(inline('Pay $5 or $x$ please'),{rest:'Pay $5 or <1> please',found:['x']});
assert.deepEqual(inline('Escaped \\$5 and \\$6'),{rest:'Escaped \\$5 and \\$6',found:[]});
assert.deepEqual(inline('Use \\(a+b\\) here'),{rest:'Use <1> here',found:['a+b']});
assert.deepEqual(inline('Then $$x=1$$ holds'),{rest:'Then <1> holds',found:['x=1']});
assert.deepEqual(inline('$a<b$ and $\\begin{pmatrix}a&b\\end{pmatrix}$'),{rest:'<1> and <2>',found:['a<b','\\begin{pmatrix}a&b\\end{pmatrix}']});  // raw text, so & and < are untouched
assert.deepEqual(inline('$ spaced $ stays'),{rest:'$ spaced $ stays',found:[]});
assert.deepEqual(inline('dollar $ alone'),{rest:'dollar $ alone',found:[]});
assert.deepEqual(inline('$a\\$b$'),{rest:'<1>',found:['a\\$b']});             // an escaped dollar inside a formula

// ── KaTeX-ready source ──────────────────────────────────────────────────────
assert.equal(M.katexSource('\\begin{equation}x=1\\end{equation}'),'x=1');
assert(M.katexSource('\\begin{multline}a\\\\b\\end{multline}').startsWith('\\begin{gathered}'));
assert(M.katexSource('\\begin{eqnarray}a&=&b\\end{eqnarray}').startsWith('\\begin{aligned}a&=b'));
assert.equal(M.katexSource('x^2'),'x^2');
for(const source of ['\\begin{multline}a\\\\b\\end{multline}','\\begin{eqnarray}a&=&b\\\\c&=&d\\end{eqnarray}','\\begin{align*}a&=b\\end{align*}','\\begin{flalign}a&=b\\end{flalign}'])
 assert.doesNotThrow(()=>mathml(source),source);

// ── Tidying recognised LaTeX ────────────────────────────────────────────────
assert.equal(M.tidyLatex('x ^ { 2 } + y _ { i }'),'x^2+y_i');
assert.equal(M.tidyLatex('\\frac { a } { b }'),'\\frac{a}{b}');
assert.equal(M.tidyLatex('\\alpha b'),'\\alpha b');                              // a command still needs the space before a letter
assert.equal(M.tidyLatex('\\alpha ( x )'),'\\alpha(x)');
assert.equal(M.tidyLatex('\\text { rate of change } = k'),'\\text{rate of change}=k');   // words keep their spaces
assert.equal(M.tidyLatex('x ^ { 10 }'),'x^{10}');                                // multi-character exponents keep braces
assert.equal(M.tidyLatex('\\displaystyle \\int_0^1 x \\, dx'),'\\int_0^1x\\,dx');
assert.equal(M.tidyLatex('a \\\\ b'),'a\\\\b');
// Tidying never changes what an equation looks like
for(const raw of ['E=m c^{2}','{\\frac{-b\\pm\\sqrt{b^{2}-4a c}}{2a}}','\\operatorname{Var}(X)=E[X^{2}]-(E[X])^{2}','\\int_{0}^{1}x^{2}\\,d x=\\frac{1}{3}','\\sum_{n=1}^{\\infty}\\frac{1}{n^{2}}','\\left(\\frac{a}{b}\\right)^{n}','\\lim_{x\\to0}\\frac{\\sin x}{x}','\\Delta G=\\Delta H-T\\Delta S','\\nabla\\cdot\\mathbf{E}=\\frac{\\rho}{\\varepsilon_{0}}'])
 assert.equal(mathml(M.tidyLatex(raw)).replace(/<mrow>|<\/mrow>/g,''),mathml(raw).replace(/<mrow>|<\/mrow>/g,''),raw);

console.log('PASS: math syntax — display forms, price-safe inline math, KaTeX-ready environments, tidying that never changes the rendering.');
