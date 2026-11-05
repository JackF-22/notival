const PDFNotes=(()=>{
 function blockFromCapture(data,id){
  if(!data||typeof data.path!=='string'||!data.path.startsWith('/')||!Number.isInteger(data.page)||data.page<1)return null;
  const quote=data.kind==='quote',comment=data.kind==='comment',highlight=data.kind==='highlight',raw=(quote||comment||highlight)?String(data.text||'').trim():'',body=comment?String(data.comment||'').trim():'';
  if((quote||comment||highlight)&&!raw||comment&&!body)return null;
  return {
   id,type:'text',text:(quote||highlight)?raw.split('\n').map(line=>'> '+line).join('\n'):body,
   pdfRef:{path:data.path,name:String(data.name||'PDF'),page:data.page,quote:(quote||comment||highlight)?raw:null,bounds:data.bounds||null,kind:highlight?'highlight':comment?'comment':quote?'quote':'thought'}
  };
 }
 return {blockFromCapture};
})();
