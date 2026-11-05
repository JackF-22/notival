(() => {
 let pending=null;
 const button=document.createElement('button');button.id='add-ipad-drawing';button.textContent='✎ iPad drawing';button.title='Draw on iPad and insert at the caret (or after the selected cell)';button.onmousedown=event=>event.preventDefault();document.querySelector('#format-bar').append(button);
 button.onclick=()=>{const note=current();if(!note||document.body.dataset.view!=='note')return;if(!bridge){toast('iPad drawing is available in the Mac app. You can also insert an exported image.');return}const focused=RichEditor.active(),target=focused&&note.blocks.includes(focused.block)?focused:null;pending={requestID:uid(),noteID:note.id,blockID:target?.block.id,editor:target?.editor,range:target?.range?.cloneRange()};native({type:'addDrawing',requestID:pending.requestID})};
 window.marginDrawingCancelled=()=>{pending=null};
 window.marginDrawingReceived=data=>{if(!pending||data?.requestID!==pending.requestID||!/^data:image\/png;base64,[a-z\d+/=]+$/i.test(data.image||'')||data.image.length>11_000_000)return;const target=pending;pending=null;const note=state.notes.find(item=>item.id===target.noteID);if(!note){toast('Drawing was not inserted because its note was removed.');return}const block=note.blocks.find(item=>item.id===target.blockID);const html=`<img src="${data.image}" alt="iPad drawing">`;
  if(block&&target.editor?.isConnected&&target.range&&target.editor.contains(target.range.startContainer)){target.editor.focus();const selection=window.getSelection();selection.removeAllRanges();selection.addRange(target.range);document.execCommand('insertHTML',false,html);target.editor.dispatchEvent(new Event('input',{bubbles:true}))}
  else{const index=block?note.blocks.indexOf(block)+1:note.blocks.length;note.blocks.splice(index,0,{id:uid(),type:'text',text:`![iPad drawing](${data.image})`,html:`<p>${html}</p><p><br></p>`});note.updated=Date.now();persist();if(current()?.id===note.id)render()}
  toast('Drawing added to '+(note.title||'your note'));
 };
})();
