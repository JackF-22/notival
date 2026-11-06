// Regions of a note flagged as unclear. A flag stays open until the student writes what cleared it up.
// The text itself carries only <span data-flag="id">; everything else lives on note.flags.
const FlagsModel=(()=>{
 const squash=text=>String(text||'').replace(/\s+/g,' ').trim();
 const isOpen=flag=>flag.status!=='resolved';
 function create(note,{blockId=null,quote,comment='',now=Date.now()}){
  const text=squash(quote);if(!text)return null;
  const flag={id:'flag-'+now.toString(36)+Math.random().toString(36).slice(2,7),blockId,quote:text.slice(0,500),comment:squash(comment),status:'open',created:now};
  (note.flags??=[]).push(flag);return flag;
 }
 // A flag cannot be resolved without a clarifying comment.
 function resolve(flag,clarification,now=Date.now()){
  const text=String(clarification||'').trim();if(!text)return false;
  Object.assign(flag,{status:'resolved',clarification:text,resolvedAt:now});return true;
 }
 function reopen(flag){flag.status='open';delete flag.resolvedAt}
 function remove(note,flag){const i=(note.flags||[]).indexOf(flag);if(i>=0)note.flags.splice(i,1);return i>=0}
 function entries(notes,{projectId=null}={}){
  return notes.filter(n=>!projectId||n.projectId===projectId).flatMap(note=>(note.flags||[]).map(flag=>({note,flag})));
 }
 const open=(notes,scope)=>entries(notes,scope).filter(e=>isOpen(e.flag)).sort((a,b)=>b.flag.created-a.flag.created);
 const resolved=(notes,scope)=>entries(notes,scope).filter(e=>!isOpen(e.flag)).sort((a,b)=>(b.flag.resolvedAt||0)-(a.flag.resolvedAt||0));
 const count=(notes,scope)=>open(notes,scope).length;
 const openCount=note=>(note?.flags||[]).filter(isOpen).length;
 // A question to offer once a flag has been cleared up.
 function draftQuestion(flag){
  return {type:'qa',prompt:flag.comment||'What does “'+(flag.quote.length>80?flag.quote.slice(0,80)+'…':flag.quote)+'” mean?',answer:flag.clarification||'',quote:flag.quote,blockId:flag.blockId};
 }
 return {create,resolve,reopen,remove,entries,open,resolved,count,openCount,isOpen,draftQuestion};
})();
