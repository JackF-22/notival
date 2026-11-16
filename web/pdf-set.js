/* A note can carry several PDFs. `pdfPath` and `pdfName` stay the PDF shown beside the note; `pdfs` is the full set, in the order they were attached. */
const PDFSet=(()=>{
 const nameOf=(path,name)=>name||String(path).split('/').pop()||'PDF';
 function list(note){
  const seen=new Set(),out=[];
  for(const item of [...(note?.pdfs||[]),...(note?.pdfPath?[{path:note.pdfPath,name:note.pdfName}]:[])]){
   if(!item||typeof item.path!=='string'||seen.has(item.path))continue;
   seen.add(item.path);out.push({path:item.path,name:nameOf(item.path,item.name)});
  }
  return out;
 }
 function has(note,path){return list(note).some(item=>item.path===path)}
 // Adds the PDF if it is new and makes it the one shown.
 function activate(note,path,name){
  const items=list(note),found=items.find(item=>item.path===path);
  if(!found)items.push({path,name:nameOf(path,name)});
  note.pdfs=items;note.pdfPath=path;note.pdfName=(found||items[items.length-1]).name;
  return note;
 }
 // Drops one PDF; the previous one in the set takes over, or none is left.
 function remove(note,path){
  const items=list(note),at=items.findIndex(item=>item.path===path);if(at<0)return note;
  items.splice(at,1);note.pdfs=items;
  if(note.pdfPath===path){const next=items[Math.min(at,items.length-1)]||null;note.pdfPath=next?.path||null;note.pdfName=next?.name||null}
  return note;
 }
 // The PDF a step forward (1) or back (-1) from the one shown, wrapping around; null when there is nothing else to go to.
 function step(note,direction){
  const items=list(note);if(items.length<2)return null;
  const at=Math.max(0,items.findIndex(item=>item.path===note.pdfPath));
  return items[(at+(direction<0?-1:1)+items.length)%items.length];
 }
 function position(note){const items=list(note);return {index:Math.max(0,items.findIndex(item=>item.path===note?.pdfPath)),count:items.length}}
 return {list,has,activate,remove,step,position};
})();
if(typeof module!=='undefined')module.exports=PDFSet;
