// Bring questions back from an AI chat: paste its reply, keep the ones worth having.
(()=>{
 const M=QuestionImportModel;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n};
 const btn=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.onclick=fn;return b};
 const dialog=el('dialog',undefined,'student-dialog qimport-dialog');document.body.append(dialog);
 const plural=(n,word)=>n+' '+word+(n===1?'':'s');

 function open({project=null,unitId=null,note=null,onDone=null}={}){
  const target={projectId:note?.projectId||project?.id||'',unitId:note?.unitId||unitId||'',noteId:note?.id||''};
  dialog.replaceChildren(el('h2','Import questions'),el('p','Ask your AI for questions (Copy for AI on a test pack tells it how to answer), then paste what it wrote. Nothing is added until you choose.','qimport-lead'));
  const form=el('form');dialog.append(form);
  const paste=el('textarea');paste.placeholder='Q: What does the Krebs cycle produce?\nA: …\n\nThe {{mitochondrion}} makes most of a cell’s ATP.';paste.setAttribute('aria-label','Pasted questions');paste.rows=7;form.append(paste);

  const where=el('div',undefined,'qimport-where');
  const subject=el('select'),unit=el('select'),noteSelect=el('select');
  subject.setAttribute('aria-label','Subject');unit.setAttribute('aria-label','Unit');noteSelect.setAttribute('aria-label','Attach to a note');
  const option=(value,label)=>{const o=el('option',label);o.value=value;return o};
  subject.append(option('','No subject'),...state.projects.map(p=>option(p.id,(p.icon||'')+' '+p.name)));
  function fill(){
   const s=state.projects.find(p=>p.id===subject.value);
   unit.replaceChildren(option('','Whole subject'),...(s?.units||[]).map(u=>option(u.id,u.name)));unit.disabled=!s;
   if(![...unit.options].some(o=>o.value===target.unitId))target.unitId='';unit.value=target.unitId;
   const notes=s?state.notes.filter(n=>n.projectId===s.id&&(!unit.value||n.unitId===unit.value)&&!n.synthesis):[];
   noteSelect.replaceChildren(option('','Not attached to a note'),...notes.map(n=>option(n.id,n.title||'Untitled note')));noteSelect.disabled=!notes.length;
   if(![...noteSelect.options].some(o=>o.value===target.noteId))target.noteId='';noteSelect.value=target.noteId;
  }
  subject.value=target.projectId;fill();
  subject.onchange=()=>{target.unitId='';target.noteId='';fill()};unit.onchange=()=>{target.unitId=unit.value;target.noteId='';fill()};noteSelect.onchange=()=>{target.noteId=noteSelect.value};
  for(const [label,select] of [['Subject',subject],['Unit',unit],['Note',noteSelect]]){const l=el('label',label);l.append(select);where.append(l)}
  form.append(where);

  const list=el('div',undefined,'qimport-list');list.setAttribute('aria-live','polite');form.append(list);
  const actions=el('div',undefined,'student-actions');actions.append(btn('Cancel',()=>dialog.close()));
  const add=el('button','Add questions','primary');add.type='submit';add.disabled=true;actions.append(add);form.append(actions);

  let rows=[];
  const have=()=>RecallModel.collectAll(state,{}).map(i=>RecallModel.promptText(i));
  function recount(){const n=rows.filter(r=>r.check.checked).length;add.textContent=n?'Add '+plural(n,'question'):'Add questions';add.disabled=!n}
  function preview(){
   list.replaceChildren();rows=[];
   const found=M.parse(paste.value,{existing:have()});
   if(!paste.value.trim()){recount();return}
   if(!found.length){list.append(el('p','I couldn’t find any questions in that. They should look like “Q: …” then “A: …”, or a sentence with a {{hidden word}}.','qimport-empty'));recount();return}
   const fresh=found.filter(i=>!i.duplicate).length;
   list.append(el('p',plural(found.length,'question')+' found'+(fresh<found.length?' · '+(found.length-fresh)+' you already have':'')+'.','qimport-summary'));
   for(const item of found){
    const row=el('label',undefined,'qimport-row'+(item.duplicate?' dupe':'')),check=document.createElement('input');check.type='checkbox';check.checked=!item.duplicate;check.onchange=recount;
    const body=el('div');body.append(el('strong',M.label(item)));
    body.append(el('small',item.type==='cloze'?'Fill in the blank · '+item.blank:(item.answer.length>140?item.answer.slice(0,140)+'…':item.answer)));
    if(item.duplicate)body.append(el('em','Already in your questions'));
    row.append(check,body);list.append(row);rows.push({check,item});
   }
   recount();
  }
  paste.oninput=preview;
  form.onsubmit=e=>{
   e.preventDefault();state.items??=[];let n=0;
   const note=state.notes.find(x=>x.id===target.noteId);
   for(const {check,item} of rows){
    if(!check.checked)continue;
    const fields=item.type==='cloze'?{type:'cloze',text:item.text,blank:item.blank}:{type:'qa',prompt:item.prompt,answer:item.answer};
    const made=RecallModel.newItem({...fields,projectId:subject.value||null,unitId:unit.value||null,noteId:note?.id||null,imported:true});
    if(RecallModel.validItem(made)){state.items.push(made);n++}
   }
   if(!n)return;
   persist();dialog.close();toast(plural(n,'question')+' added'+(subject.value?'':' to your questions'));
   document.querySelector('#workspace-home')?.dataset.hub==='study'?window.marginStudyHubRefresh?.():window.marginRefreshStudentHome?.();onDone?.(n);
  };
  if(!dialog.open)dialog.showModal();paste.focus();
 }
 window.marginImportQuestions=open;
})();
