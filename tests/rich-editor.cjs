const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');
const assert = require('node:assert/strict');

let range;
const context={document:{addEventListener(){}},Node:{TEXT_NODE:3,ELEMENT_NODE:1},window:{getSelection:()=>({rangeCount:1,getRangeAt:()=>range})}};
const editor = runInNewContext(readFileSync('web/math-syntax.js','utf8')+'\n'+readFileSync('web/rich-editor.js','utf8')+'\nRichEditor',context);
const imported = editor.fromMarkdown('# **Biology**\n\n- [ ] Review\n\n| Name | Value |\n| --- | --- |\n| Alpha | Beta |\n\n$$\nx^2 + y^2\n$$');
assert.match(imported, /<h1><strong>Biology<\/strong><\/h1>/);
assert.match(imported, /class="task-row"/);
assert.match(imported, /<table>/);
assert.match(imported, /data-equation="x\^2 \+ y\^2"/);
const unsafe = editor.fromMarkdown('[Open](javascript:alert(1)) <script>alert(1)</script>');
assert.doesNotMatch(unsafe, /href="javascript:|<script>/);
assert.match(editor.fromMarkdown('An *idea* with **weight** and $x^2$.'), /<em>idea<\/em>.*<strong>weight<\/strong>.*inline-equation/);
const emptyHeading={nodeType:1,tagName:'H1',classList:{contains:()=>false},childNodes:[{nodeType:1,tagName:'BR',childNodes:[]}]};
assert.equal(editor.toMarkdown({childNodes:[emptyHeading]}),'');
const element=(name,children=[])=>{
 const node={nodeType:1,tagName:name,childNodes:children,classList:{contains:value=>value==='equation'&&name==='EQUATION'},contains(other){return other===this||this.childNodes.some(child=>child.contains?.(other))}};
 for(const [index,child] of children.entries()){child.parentNode=node;child.previousSibling=children[index-1]||null;child.nextSibling=children[index+1]||null;}
 return node;
};
const textNode=value=>({nodeType:3,textContent:value,contains(other){return other===this}});
const equation=element('EQUATION'),before=textNode('Before '),after=textNode(' after');
const paragraph=element('P',[before,equation,after]),root=element('DIV',[paragraph]);
range={collapsed:true,startContainer:after,startOffset:0};
assert.equal(editor.equationAtCaret(root,'Backspace'),equation);
range={collapsed:true,startContainer:before,startOffset:before.textContent.length};
assert.equal(editor.equationAtCaret(root,'Delete'),equation);
range={collapsed:true,startContainer:after,startOffset:1};
assert.equal(editor.equationAtCaret(root,'Backspace'),equation);
range={collapsed:true,startContainer:after,startOffset:2};
assert.equal(editor.equationAtCaret(root,'Backspace'),null);
const display=element('EQUATION'),following=element('P',[element('BR')]),displayRoot=element('DIV',[display,following]);
range={collapsed:true,startContainer:following,startOffset:0};
assert.equal(editor.equationAtCaret(displayRoot,'Backspace'),display);
range={collapsed:false,startContainer:displayRoot,endContainer:displayRoot,startOffset:0,endOffset:1};
assert.equal(editor.equationAtCaret(displayRoot,'Delete'),display);
console.log('PASS: Markdown rendering, safe links, and equation deletion at the caret.');
