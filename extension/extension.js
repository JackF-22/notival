const vscode = require('vscode');
function activate(context) {
 const decoration = vscode.window.createTextEditorDecorationType({backgroundColor:'rgba(137,173,111,0.20)',border:'1px solid rgba(137,173,111,0.6)',isWholeLine:true});
 const comments = vscode.comments.createCommentController('margin','Notival');
 const threads=[];
 context.subscriptions.push(decoration,comments,{dispose(){threads.forEach(t=>t.dispose())}},vscode.commands.registerCommand('margin.capture',async()=>{
  const editor=vscode.window.activeTextEditor;if(!editor||editor.selection.isEmpty){vscode.window.showInformationMessage('Select a few lines to capture into Notival.');return}
  const selection=editor.selection,doc=editor.document;
  const capture={title:doc.uri.path.split('/').pop()+' · '+(selection.start.line+1),text:doc.getText(selection),language:doc.languageId,source:{uri:doc.uri.toString(),name:vscode.workspace.asRelativePath(doc.uri),start:selection.start.line,end:selection.end.line}};
  const payload=Buffer.from(JSON.stringify(capture)).toString('base64');
  if(payload.length>100000){vscode.window.showWarningMessage('Capture a shorter snippet (under about 70 KB).');return}
  await vscode.env.openExternal(vscode.Uri.parse('notival://capture?payload='+encodeURIComponent(payload)));
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
}
exports.activate=activate;
