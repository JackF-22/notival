const {readFileSync}=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');const path=require('node:path');
// A small stand-in for VS Code: enough of its API for the extension to run, recording what it does.
const code=`import x from 'y';
/** Adds two numbers. */
export function add(a, b) {
  return a + b;
}

class Cart {
  total() {
    return 0;
  }
}
`;
const uri={path:'/project/demo.js',scheme:'file',toString:()=> 'file:///project/demo.js'};
const lines=code.split('\n');
const doc={uri,languageId:'javascript',lineCount:lines.length,getText:range=>range?'const x = 1;':code,lineAt:i=>({text:lines[i]})};
let statusBar,statusMessage,opened,highlight,thread,error,info,handler,clipboard='';const commands={},providers={},events={},stored={};
class Emitter{constructor(){this.event=fn=>{this.fn=fn;return {dispose(){}}}}fire(){this.fn&&this.fn()}}
let symbols=[];const editor={document:doc,selection:{isEmpty:false,start:{line:2,character:0},end:{line:3,character:0},active:{line:3}},revealRange(){},setDecorations:(d,r)=>highlight=r};
const vscode={StatusBarAlignment:{Right:2},EventEmitter:Emitter,TreeItem:class{constructor(label,state){this.label=label;this.collapsibleState=state}},TreeItemCollapsibleState:{None:0,Collapsed:1,Expanded:2},ThemeIcon:class{constructor(id){this.id=id}},
 window:{createStatusBarItem(){return statusBar={show(){this.shown=true},dispose(){}}},setStatusBarMessage(text){statusMessage=text},activeTextEditor:editor,createTextEditorDecorationType:()=>({dispose(){}}),showInformationMessage:m=>info=m,showWarningMessage:m=>info=m,showErrorMessage:m=>error=m,registerUriHandler:h=>(handler=h,{}),
  registerTreeDataProvider:(id,p)=>(providers[id]=p,{dispose(){}}),onDidChangeActiveTextEditor:()=>({dispose(){}}),showTextDocument:async()=>editor},
 comments:{createCommentController:()=>({createCommentThread:(u,range,comments)=>(thread={uri:u,range,comments,dispose(){}}),dispose(){}})},
 commands:{registerCommand:(name,fn)=>(commands[name]=fn,{dispose(){}}),executeCommand:async name=>name==='vscode.executeDocumentSymbolProvider'?symbols:undefined},
 workspace:{asRelativePath:()=> 'demo.js',openTextDocument:async()=>doc,onDidChangeTextDocument:()=>({dispose(){}}),onDidSaveTextDocument:()=>({dispose(){}})},
 env:{openExternal:async u=>opened=u,clipboard:{writeText:async t=>clipboard=t}},Uri:{parse:value=>value.startsWith('file:')?uri:value},Range:class{constructor(...args){this.args=args}},TextEditorRevealType:{InCenter:1},CommentMode:{Preview:1}};
const context={exports:{},require:name=>name==='vscode'?vscode:require(path.join(__dirname,'../extension',name)),Buffer,URLSearchParams,setTimeout,clearTimeout};
vm.runInNewContext(readFileSync(__dirname+'/../extension/extension.js','utf8'),context);
const memento={get:(k,d)=>k in stored?stored[k]:d,update:async(k,v)=>{stored[k]=v}};
context.exports.activate({subscriptions:[],globalState:memento});
const names=async nodes=>(await Promise.all(nodes.map(async n=>[n.name,n.kind,n.start,n.end].join(':')+(n.children.length?' ['+(await names(n.children)).join(', ')+']':''))));
(async()=>{
 await new Promise(r=>setTimeout(r,20));
 // The old behaviour: a Notival button, capturing a selection, coming back to it, rejecting bad ranges
 assert.equal(statusBar.shown,true,'a Notival button sits in the status bar');assert.equal(statusBar.command,'margin.capture');assert.match(statusBar.text,/Notival/);
 await commands['margin.capture']();assert.match(statusMessage,/Sent 2 line\(s\) to Notival/,'it says what it sent');assert.match(opened,/^notival:\/\/capture/);
 const payload=JSON.parse(Buffer.from(new URL(opened).searchParams.get('payload'),'base64'));assert.equal(payload.text,'const x = 1;');assert.equal(payload.source.start,2);
 const action={type:'comment',source:payload.source,text:'Explain this pattern'};
 await handler.handleUri({query:'payload='+encodeURIComponent(Buffer.from(JSON.stringify(action)).toString('base64'))});assert.equal(highlight[0].args[0],2);assert.equal(thread.comments[0].body,'Explain this pattern');
 action.source.start=-1;await handler.handleUri({query:'payload='+encodeURIComponent(Buffer.from(JSON.stringify(action)).toString('base64'))});assert.match(error,/Invalid source range/);

 // The sidebar: the structure of the file (no language server here, so it is read from the text)
 const outline=providers['margin.outline'];assert.ok(outline,'a This file view');
 const roots=outline.getChildren();
 assert.deepEqual(await names(roots),['add:function:2:4','Cart:class:6:10 [total:method:7:9]'],'functions and classes, with methods inside');
 const item=outline.getTreeItem(roots[1]);assert.equal(item.label,'Cart');assert.equal(item.iconPath.id,'symbol-class');assert.equal(item.collapsibleState,2);assert.equal(item.command.command,'margin.reveal');assert.match(item.description,/5 lines/);
 // quick copy: the code, with the doc comment above it
 await commands['margin.copy'](roots[0]);assert.equal(clipboard,'/** Adds two numbers. */\nexport function add(a, b) {\n  return a + b;\n}','a function is copied with its doc comment');assert.match(statusMessage,/Copied add \(3 lines\)/);
 await commands['margin.copyMarkdown'](roots[0]);assert.match(clipboard,/^`demo\.js` \(lines 3–5\)\n\n```javascript\n\/\*\* Adds/,'or as a Markdown block');assert.match(clipboard,/}\n```\n$/);
 await commands['margin.copySignature'](roots[0]);assert.equal(clipboard,'export function add(a, b)','or just the signature');
 // the cursor decides which function "here" means
 editor.selection.active.line=8;editor.selection.isEmpty=true;await commands['margin.copyHere']();assert.match(clipboard,/^  total\(\) \{/,'copy the function around the cursor');
 editor.selection.active.line=0;await commands['margin.copyHere']();assert.match(info,/Put the cursor inside/,'and says so when the cursor is not in one');
 // sending a function to Notival, and the list of what was sent
 await commands['margin.send'](roots[0]);
 const sent=JSON.parse(Buffer.from(new URL(opened).searchParams.get('payload'),'base64'));assert.equal(sent.source.start,2);assert.equal(sent.source.end,4);assert.match(sent.text,/function add/);assert.equal(sent.language,'javascript');
 const list=providers['margin.captures'],groups=list.getChildren();
 assert.equal(groups.length,1,'sent code is grouped by file');assert.equal(groups[0].name,'demo.js');
 const sentItems=list.getChildren(groups[0]);assert.equal(sentItems.length,2,'the selection and the function are both listed');assert.match(list.getTreeItem(sentItems[0]).label,/3–5/);assert.equal(list.getTreeItem(sentItems[0]).command.command,'margin.revealCapture');
 await commands['margin.send'](roots[0]);assert.equal(list.getChildren(list.getChildren()[0]).length,2,'sending the same lines again does not repeat it');
 const now=list.getChildren(list.getChildren()[0]);
 await commands['margin.revealCapture'](now[0]);assert.equal(highlight[0].args[0],2,'clicking a sent item goes to its lines');
 await commands['margin.removeCapture'](now[0]);assert.equal(list.getChildren(list.getChildren()[0]).length,1,'an item can be removed');
 await commands['margin.clearCaptures']();assert.equal(list.getChildren().length,0,'or the whole list');

 // when VS Code has its own symbols, they are used, with local clutter left out
 const R=(a,b)=>({start:{line:a},end:{line:b}});
 symbols=[{name:'add',kind:11,range:R(2,4),children:[{name:'sum',kind:12,range:R(3,3),children:[]}]},{name:'Cart',kind:4,range:R(6,10),children:[{name:'items',kind:7,range:R(6,6),children:[]},{name:'total',kind:5,range:R(7,9),children:[]}]},{name:'VERSION',kind:13,range:R(1,1),children:[]}];
 await commands['margin.refresh']();
 assert.deepEqual(await names(outline.getChildren()),['add:function:2:4','Cart:class:6:10 [total:method:7:9]','VERSION:variable:1:1'],'VS Code symbols: methods and top-level values kept, locals and fields dropped');
 console.log('PASS: VS Code extension — capture, source links, comments, the sidebar outline, quick copy, sending a function, and the list of what was sent.');
})();
