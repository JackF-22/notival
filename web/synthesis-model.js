const SynthesisModel=(()=>{
 function blocks(draft,id){
  const s=draft.synthesis;
  const retained=draft.blocks.filter(b=>!b.synthesisGenerated||b.text!==b.synthesisText).map(b=>({...b,synthesisGenerated:false}));
  const stableID=key=>draft.blocks.find(b=>b.synthesisGenerated&&b.synthesisKey===key&&b.text===b.synthesisText)?.id||id();
  const generated=[{id:stableID('conclusion'),synthesisKey:'conclusion',type:'text',text:'# '+(s.question||'My conclusion')+'\n\n'+s.conclusion},...s.evidence.map(e=>({id:stableID(e.id||e.noteId+':'+e.blockId+':'+e.quote),synthesisKey:e.id||e.noteId+':'+e.blockId+':'+e.quote,type:'text',text:'## '+e.relation+' · '+e.title+'\n\n> '+e.quote.replace(/\n/g,'\n> ')+(e.reason?'\n\n'+e.reason:''),sourceNoteId:e.noteId,sourceBlockId:e.blockId}))];
  return generated.map(b=>({...b,synthesisGenerated:true,synthesisText:b.text})).concat(retained);
 }
 return {blocks};
})();
