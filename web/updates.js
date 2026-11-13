// "Notival 1.1 is ready": the desktop app finds new releases (native/updater.swift) and this card offers them.
(()=>{
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
 const send=type=>window.webkit?.messageHandlers?.margin?.postMessage({type});
 let card=null;
 const close=()=>{card?.remove();card=null};
 function show({version,current,notes=''}){
  close();
  card=el('div');card.id='update-card';card.setAttribute('role','status');
  const head=el('div','update-head');head.append(el('strong','','Notival '+version+' is ready'),el('small','','You have '+current+'. Your notes stay exactly as they are.'));
  card.append(head);
  const lines=String(notes).split('\n').map(line=>line.replace(/^[-*#\s]+/,'').trim()).filter(Boolean).slice(0,8);
  if(lines.length){
   const more=el('details','update-notes');more.append(el('summary','','What\'s new'));
   const list=el('ul');for(const line of lines)list.append(el('li','',line));more.append(list);card.append(more);
  }
  const status=el('p','update-status');status.hidden=true;card.append(status);
  const actions=el('div','update-actions'),later=el('button','','Later'),go=el('button','primary','Update and restart');
  later.type=go.type='button';later.onclick=close;
  go.onclick=()=>{go.disabled=later.disabled=true;go.textContent='Updating…';send('installUpdate')};
  actions.append(later,go);card.append(actions);
  document.body.append(card);
 }
 window.notivalUpdateAvailable=show;
 window.notivalUpdateProgress=message=>{if(!card)return;const status=card.querySelector('.update-status');status.hidden=false;status.textContent=message};
 window.notivalUpdateFailed=message=>{
  if(!card)return;
  const status=card.querySelector('.update-status');status.hidden=false;status.textContent=message;status.classList.add('is-error');
  const go=card.querySelector('.update-actions .primary'),later=card.querySelector('.update-actions button');
  later.disabled=false;go.disabled=false;go.textContent='Open download page';go.onclick=()=>send('openUpdatePage');
 };
})();
