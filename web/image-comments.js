/* Comments attach to a stable image ID rather than its changing position. */
(()=>{
 const editor=document.querySelector('#editor'),dialog=document.createElement('dialog');dialog.className='image-comment-dialog';document.body.append(dialog);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;return b};
 let target=null,editing=null;
 function imageTarget(image){const note=current(),wrap=image.closest('#editor .block'),block=note?.blocks[[...editor.querySelectorAll(".block")].indexOf(wrap)];return block&&image.closest('.rich-text')?{note,block,image,wrap}:null}
 function open(image){const next=imageTarget(image);if(!next)return;target=next;editing=null;draw();if(!dialog.open)dialog.showModal();dialog.querySelector('textarea')?.focus()}
 function draw(){if(!target)return;const {image,block}=target;dialog.replaceChildren();const header=el('div',undefined,'image-comment-heading');header.append(el('h2','Image comments'),button('Close',()=>dialog.close()));dialog.append(header);
  const preview=el('img');preview.src=image.src;preview.alt=image.alt||'Image being discussed';preview.className='comment-image-preview';dialog.append(preview);
  const comments=(block.imageComments||[]).filter(c=>c.imageId===image.dataset.imageId),list=el('div',undefined,'image-comment-list');
  if(!comments.length)list.append(el('p','Add an explanation, a question, or something to revisit.','image-comment-empty'));
  for(const comment of comments){const row=el('section',undefined,'image-comment-row');row.append(el('p',comment.text),button('Edit',()=>{editing=comment;draw();dialog.querySelector('textarea').focus()}),button('Remove',()=>{const index=block.imageComments.indexOf(comment);block.imageComments.splice(index,1);persist();editing=null;draw();refresh();offerUndo('Image comment removed',()=>{block.imageComments.splice(Math.min(index,block.imageComments.length),0,comment);persist();refresh();if(dialog.open)draw()})}));list.append(row)}dialog.append(list);
  const form=el('form'),label=el('label',editing?'Edit comment':'New comment'),text=el('textarea');text.required=true;text.maxLength=10000;text.value=editing?.text||'';text.setAttribute('aria-label','Image comment');label.append(text);form.append(label);const actions=el('div',undefined,'image-comment-actions');if(editing)actions.append(button('Cancel edit',()=>{editing=null;draw()}));const save=el('button',editing?'Save changes':'Add comment','primary');save.type='submit';actions.append(save);form.append(actions);
  form.onsubmit=e=>{e.preventDefault();const value=text.value.trim();if(!value)return;const {note,block,image}=target;if(current()!==note||!note.blocks.includes(block)||!image.isConnected){toast('Reopen the image to add your comment.');return}
   if(!image.dataset.imageId){image.dataset.imageId=uid();const rich=image.closest('.rich-text');block.html=RichEditor.cleanHTML(rich.innerHTML);block.text=RichEditor.toMarkdown(rich)}
   block.imageComments??=[];if(editing){editing.text=value;editing.updated=Date.now()}else block.imageComments.push({id:uid(),imageId:image.dataset.imageId,text:value,created:Date.now()});persist();editing=null;draw();refresh();dialog.querySelector('textarea').focus();
  };dialog.append(form);
 }
 // Comments are opened by double-clicking a picture (or Enter on it); there is no extra button under the note.
 function refresh(){const note=current();if(!note)return;for(const [i,wrap] of [...editor.querySelectorAll(".block")].entries()){const block=note.blocks[i],images=[...wrap.querySelectorAll('.rich-text img')];wrap.querySelector('.image-comments-actions')?.remove();
   for(const image of images){const count=(block?.imageComments||[]).filter(c=>c.imageId===image.dataset.imageId).length;image.tabIndex=0;image.setAttribute('contenteditable','false');image.setAttribute('role','button');image.title=(count?count+' comment'+(count===1?'':'s')+' · ':'')+'Double-click to comment on this image';image.setAttribute('aria-label',(image.alt||'Image')+' · Open comments');if(count)image.dataset.comments=String(count);else delete image.dataset.comments}
  }}
 editor.addEventListener('dblclick',e=>{const image=e.target.closest('.rich-text img');if(image){e.preventDefault();e.stopImmediatePropagation();open(image)}},true);
 editor.addEventListener('keydown',e=>{if(e.target.matches('.rich-text img')&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();open(e.target)}});
 let queued=false;new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;refresh()})}}).observe(editor,{childList:true,subtree:true});
 dialog.addEventListener('close',()=>{const image=target?.image;target=null;editing=null;if(image?.isConnected)image.focus()});refresh();
})();
