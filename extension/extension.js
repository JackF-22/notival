const vscode = require('vscode');
const outline = require('./outline.js');
function activate(context) {
 const decoration = vscode.window.createTextEditorDecorationType({backgroundColor:'rgba(137,173,111,0.20)',border:'1px solid rgba(137,173,111,0.6)',isWholeLine:true});
 const comments = vscode.comments.createCommentController('margin','Notival');
 const threads=[];
 const bar=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,50);bar.text='$(notebook) Notival';bar.tooltip='Select code, then click to send it to your Notival notebook';bar.command='margin.capture';bar.show();context.subscriptions.push(bar);
 context.subscriptions.push(vscode.commands.registerCommand('margin.help',()=>vscode.commands.executeCommand('workbench.action.openWalkthrough','margin.margin-companion#margin.start',false)));
 // ── Sending code to Notival, and remembering what was sent ────────────────
 const captures=()=>context.globalState.get('margin.captures',[]);
 const captureTree=new vscode.EventEmitter();
 async function send(doc,start,end,text){
  const capture={title:doc.uri.path.split('/').pop()+' · '+(start+1),text,language:doc.languageId,source:{uri:doc.uri.toString(),name:vscode.workspace.asRelativePath(doc.uri),start,end}};
  const payload=Buffer.from(JSON.stringify(capture)).toString('base64');
  if(payload.length>100000){vscode.window.showWarningMessage('Capture a shorter snippet (under about 70 KB).');return false}
  await vscode.env.openExternal(vscode.Uri.parse('notival://capture?payload='+encodeURIComponent(payload)));
  vscode.window.setStatusBarMessage('Sent '+(end-start+1)+' line(s) to Notival',3000);
  const list=captures().filter(c=>!(c.uri===capture.source.uri&&c.start===start&&c.end===end));
  list.unshift({id:String(Date.now())+Math.random().toString(36).slice(2,6),uri:capture.source.uri,name:capture.source.name,start,end,preview:text.split(/\r?\n/).find(l=>l.trim())?.trim().slice(0,80)||'(blank)',at:Date.now()});
  await context.globalState.update('margin.captures',list.slice(0,100));captureTree.fire();
  return true;
 }
 context.subscriptions.push(decoration,comments,{dispose(){threads.forEach(t=>t.dispose())}},vscode.commands.registerCommand('margin.capture',async()=>{
  const editor=vscode.window.activeTextEditor;if(!editor||editor.selection.isEmpty){vscode.window.showInformationMessage('Select a few lines to capture into Notival.');return}
  const selection=editor.selection,doc=editor.document;
  await send(doc,selection.start.line,selection.end.line,doc.getText(selection));
 }),vscode.window.registerUriHandler({async handleUri(uri){
  try {
   const raw=new URLSearchParams(uri.query).get('payload');if(!raw||raw.length>200000)throw Error('Invalid payload');
   const message=JSON.parse(Buffer.from(raw,'base64').toString());const source=message.source;
   if(!source||!Number.isInteger(source.start)||!Number.isInteger(source.end)||source.start<0||source.end<source.start)throw Error('Invalid source range');
   const file=vscode.Uri.parse(source.uri);if(!['file','vscode-remote'].includes(file.scheme))throw Error('Unsupported source');
   const doc=await vscode.workspace.openTextDocument(file);if(source.end>=doc.lineCount)throw Error('Source lines have changed. Capture the selection again.');
   const range=new vscode.Range(source.start,0,source.end,doc.lineAt(source.end).text.length);
   const editor=await vscode.window.showTextDocument(doc);editor.revealRange(range,vscode.TextEditorRevealType.InCenter);editor.setDecorations(decoration,[range]);
   if(message.type==='comment'&&typeof message.text==='string'&&message.text.trim()){
    const thread=comments.createCommentThread(file,range,[{body:message.text,mode:vscode.CommentMode.Preview,author:{name:'Notival'}}]);thread.label='Notival note';threads.push(thread);
   }
  } catch(error){vscode.window.showErrorMessage('Notival: '+error.message)}
 }}));

 // ── The sidebar: this file's structure, and what has been sent ───────────
 const KIND_ICON={class:'symbol-class',method:'symbol-method',function:'symbol-function',interface:'symbol-interface',enum:'symbol-enum',struct:'symbol-struct',namespace:'symbol-namespace',section:'symbol-key',variable:'symbol-variable'};
 const SYMBOL_ICON={1:'namespace',2:'namespace',3:'namespace',4:'class',5:'method',8:'method',9:'enum',10:'interface',11:'function',22:'struct',6:'variable',7:'variable',12:'variable',13:'variable'};
 const STRUCTURAL=new Set([1,2,3,4,5,8,9,10,11,22]),FUNCTIONISH=new Set([5,8,11]),VARIABLE=new Set([6,7,12,13]);
 const lineCount=n=>(n.end-n.start+1)+' line'+(n.end===n.start?'':'s');
 // VS Code's own symbol list becomes our nodes, keeping classes, functions and top-level values and dropping local clutter.
 function fromSymbol(sym,depth,insideFunction){
  const kind=sym.kind,range=sym.range||sym.location?.range;if(!range)return null;
  if(!STRUCTURAL.has(kind)&&!(VARIABLE.has(kind)&&depth===0))return null;
  const children=(sym.children||[]).map(c=>fromSymbol(c,depth+1,insideFunction||FUNCTIONISH.has(kind))).filter(Boolean);
  const node={name:String(sym.name).replace(/\s+/g,' '),kind:SYMBOL_ICON[kind]||'function',start:range.start.line,end:range.end.line,children};
  node.detail=lineCount(node);return node;
 }
 async function structureOf(doc){
  let found=[];
  try{
   const list=await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider',doc.uri);
   if(Array.isArray(list)&&list.length){
    const nodes=list.map(sym=>fromSymbol(sym,0,false)).filter(Boolean);
    found=list[0].location?outline.nest(nodes):nodes;
   }
  }catch{}
  return found.length?found:outline.detect(doc.getText(),doc.languageId);
 }
 const linesOf=doc=>doc.getText().split(/\r?\n/);
 const codeOf=(doc,node)=>{const lines=linesOf(doc);return lines.slice(outline.withLeadingComments(lines,node.start),node.end+1).join('\n')};
 const fence=(doc,node)=>{const body=codeOf(doc,node),ticks=body.includes('```')?'````':'```';return '`'+vscode.workspace.asRelativePath(doc.uri)+'` (lines '+(node.start+1)+'–'+(node.end+1)+')\n\n'+ticks+doc.languageId+'\n'+body+'\n'+ticks+'\n'};

 const view={doc:null,nodes:[],emitter:new vscode.EventEmitter()};
 let refreshTimer=null;
 async function refreshOutline(){
  const editor=vscode.window.activeTextEditor,doc=editor?.document||view.doc;
  if(!doc||doc.uri.scheme==='output'||doc.uri.scheme==='vscode-userdata'){return}
  view.doc=doc;view.nodes=await structureOf(doc);view.emitter.fire();
 }
 const later=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshOutline,350)};
 const outlineProvider={
  onDidChangeTreeData:view.emitter.event,
  getChildren:node=>node?node.children:view.nodes,
  getTreeItem(node){
   const item=new vscode.TreeItem(node.name,node.children.length?vscode.TreeItemCollapsibleState.Expanded:vscode.TreeItemCollapsibleState.None);
   item.description=node.detail;item.iconPath=new vscode.ThemeIcon(KIND_ICON[node.kind]||'symbol-misc');item.contextValue='margin.symbol';
   item.tooltip=node.name+' · lines '+(node.start+1)+'–'+(node.end+1)+' · click to go there';
   item.command={command:'margin.reveal',title:'Go to',arguments:[node]};return item;
  }
 };
 const ago=at=>{const m=Math.round((Date.now()-at)/60000);return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago'};
 const capturesProvider={
  onDidChangeTreeData:captureTree.event,
  getChildren(node){
   if(node)return node.children;
   const groups=new Map();for(const c of captures()){if(!groups.has(c.name))groups.set(c.name,{group:true,name:c.name,children:[]});groups.get(c.name).children.push(c)}
   return [...groups.values()];
  },
  getTreeItem(node){
   if(node.group){const item=new vscode.TreeItem(node.name,vscode.TreeItemCollapsibleState.Expanded);item.description=node.children.length+' sent';item.iconPath=new vscode.ThemeIcon('file-code');item.contextValue='margin.captureGroup';return item}
   const item=new vscode.TreeItem((node.start+1)+(node.end>node.start?'–'+(node.end+1):'')+'  '+node.preview,vscode.TreeItemCollapsibleState.None);
   item.description=ago(node.at);item.iconPath=new vscode.ThemeIcon('arrow-right');item.contextValue='margin.capture';item.tooltip='Sent to Notival '+ago(node.at)+' · click to go to the lines';
   item.command={command:'margin.revealCapture',title:'Go to',arguments:[node]};return item;
  }
 };
 async function openAt(uri,start,end){
  const doc=await vscode.workspace.openTextDocument(uri);
  if(end>=doc.lineCount){vscode.window.showWarningMessage('Those lines have changed since they were sent.');return}
  const range=new vscode.Range(start,0,end,doc.lineAt(end).text.length);
  const editor=await vscode.window.showTextDocument(doc);editor.revealRange(range,vscode.TextEditorRevealType.InCenter);editor.setDecorations(decoration,[range]);
  setTimeout(()=>{try{editor.setDecorations(decoration,[])}catch{}},2500);
 }
 const docFor=node=>view.doc;
 const nodeAtCursor=()=>{const editor=vscode.window.activeTextEditor;if(!editor)return null;return outline.enclosing(view.nodes,editor.selection.active.line)};
 const copy=async(text,message)=>{await vscode.env.clipboard.writeText(text);vscode.window.setStatusBarMessage(message,3000)};
 const reg=(name,fn)=>context.subscriptions.push(vscode.commands.registerCommand(name,fn));
 reg('margin.refresh',refreshOutline);
 reg('margin.reveal',node=>node&&view.doc&&openAt(view.doc.uri,node.start,node.end));
 reg('margin.copy',node=>node&&copy(codeOf(docFor(node),node),'Copied '+node.name+' ('+lineCount(node)+')'));
 reg('margin.copyMarkdown',node=>node&&copy(fence(docFor(node),node),'Copied '+node.name+' as Markdown'));
 reg('margin.copySignature',node=>{if(!node)return;const doc=docFor(node),line=linesOf(doc)[node.start].trim().replace(/\s*\{$/,'');return copy(line,'Copied the signature of '+node.name)});
 reg('margin.send',node=>node&&send(docFor(node),node.start,node.end,codeOf(docFor(node),node)));
 reg('margin.copyHere',async()=>{await refreshOutline();const node=nodeAtCursor();if(!node){vscode.window.showInformationMessage('Put the cursor inside a function or class first.');return}return copy(codeOf(view.doc,node),'Copied '+node.name+' ('+lineCount(node)+')')});
 reg('margin.sendHere',async()=>{await refreshOutline();const node=nodeAtCursor();if(!node){vscode.window.showInformationMessage('Put the cursor inside a function or class first.');return}return send(view.doc,node.start,node.end,codeOf(view.doc,node))});
 reg('margin.revealCapture',c=>c&&openAt(vscode.Uri.parse(c.uri),c.start,c.end));
 reg('margin.removeCapture',async c=>{if(!c)return;await context.globalState.update('margin.captures',captures().filter(x=>x.id!==c.id));captureTree.fire()});
 reg('margin.clearCaptures',async()=>{await context.globalState.update('margin.captures',[]);captureTree.fire()});
 context.subscriptions.push(
  vscode.window.registerTreeDataProvider('margin.outline',outlineProvider),
  vscode.window.registerTreeDataProvider('margin.captures',capturesProvider),
  vscode.window.onDidChangeActiveTextEditor(later),
  vscode.workspace.onDidChangeTextDocument(e=>{if(view.doc&&e.document===view.doc)later()}),
  vscode.workspace.onDidSaveTextDocument(later)
 );
 refreshOutline();
}
exports.activate=activate;
