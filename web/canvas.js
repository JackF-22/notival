/* Canvas: pair subjects with courses and keep assignments in the to-do lists, from the Canvas calendar feed. Read-only; the secret link lives in the macOS Keychain. */
(()=>{
 const bridge=()=>window.webkit?.messageHandlers?.margin;
 const pending=new Map();let nextId=1,syncing=false,tokenWaiter=null;
 const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node};
 const button=(label,fn,className)=>{const b=el('button',label,className);b.type='button';b.onclick=fn;return b};
 const connected=()=>!!state?.canvas?.base;
 // ---- transport: the app fetches the feed (so the secret link stays in the Keychain); a plain browser fetches directly for development ----
 let memoryFeed='';
 window.marginCanvasResponse=data=>{const wait=pending.get(data.id);if(!wait)return;pending.delete(data.id);data.error?wait.reject(new Error(data.error)):wait.resolve({status:data.status,body:data.body})};
 window.marginCanvasSecretSaved=data=>{tokenWaiter?.(data);tokenWaiter=null};
 function requestFeed({url,base}){
  if(bridge())return new Promise((resolve,reject)=>{
   const id=nextId++;pending.set(id,{resolve,reject});bridge().postMessage({type:'canvasFeed',id,...(url?{url}:{base})});
   setTimeout(()=>{if(pending.delete(id))reject(new Error('Canvas took too long to answer.'))},45000);
  });
  return fetch(url||memoryFeed).then(async r=>({status:r.status,body:await r.text()}));
 }
 async function readFeed(source){
  const response=await requestFeed(source);
  if(response.status===404||response.status===401||response.status===403)throw Object.assign(new Error('Canvas didn’t recognize that calendar link. If you reset your feed in Canvas, copy the new link.'),{reconnect:true});
  if(response.status<200||response.status>=300)throw new Error('Canvas answered with an error ('+response.status+').');
  if(!/BEGIN:VCALENDAR/.test(response.body))throw new Error('That link didn’t return a calendar. Copy the Calendar Feed link from Canvas.');
  return CanvasModel.eventsToAssignments(CanvasModel.parseICS(response.body));
 }
 // ---- connecting ----
 async function connect(link){
  const feed=CanvasModel.normalizeFeedURL(link);
  if(!feed)throw new Error('Paste the Calendar Feed link from Canvas. It starts with https:// and ends in .ics.');
  const checked=await readFeed({url:feed.url});
  if(bridge()){
   const saved=await new Promise(resolve=>{tokenWaiter=resolve;bridge().postMessage({type:'canvasSecret',action:'set',base:feed.base,secret:feed.url})});
   if(!saved?.ok)throw new Error('Notival couldn’t save the link to your Keychain.');
  }else memoryFeed=feed.url;
  state.canvas={base:feed.base,connectedAt:Date.now()};persist();
  return checked;
 }
 function disconnect(){
  const base=state.canvas?.base;
  if(base&&bridge())bridge().postMessage({type:'canvasSecret',action:'clear',base});
  memoryFeed='';state.canvas=null;persist();refreshView();
 }
 // ---- syncing ----
 async function sync({quiet=false}={}){
  if(syncing||!connected())return null;
  syncing=true;
  try{
   const subjects=state.projects.filter(s=>s.canvas?.courseId);
   if(!subjects.length){if(!quiet)toast('Pair a subject with a Canvas course first.');return {added:0,updated:0}}
   let assignments;
   try{assignments=await readFeed({base:state.canvas.base})}
   catch(error){
    if(error.reconnect){state.canvas.needsReconnect=true;persist();toast(error.message)}
    else if(!quiet)toast(error.message);
    return null;
   }
   let added=0,updated=0;
   for(const subject of subjects){
    StudentModel.initialize(subject);
    const stats=CanvasModel.merge(subject,assignments.filter(a=>String(a.course_id)===String(subject.canvas.courseId)));
    added+=stats.added;updated+=stats.updated;
   }
   state.canvas.lastSync=Date.now();delete state.canvas.needsReconnect;persist();refreshView();
   if(!quiet||added||updated)toast(added||updated?`Canvas: ${added} new, ${updated} updated`:'Canvas is up to date');
   return {added,updated};
  }finally{syncing=false}
 }
 function refreshView(){if(document.body.dataset.view==='home')window.marginRefreshStudentHome?.()}
 // ---- dialogs ----
 const dialog=el('dialog',undefined,'canvas-dialog');document.body.append(dialog);
 const open=()=>{if(!dialog.open)dialog.showModal()};
 function showConnect(message=''){
  dialog.replaceChildren();
  const form=el('form');
  form.append(el('h2','Connect Canvas'),el('p','Notival reads the due dates from your Canvas calendar and adds them to your to-do lists. It can’t change anything in Canvas.','canvas-lede'));
  const link=el('input');link.placeholder='https://school.instructure.com/feeds/calendars/user_….ics';link.autocomplete='off';link.spellcheck=false;link.setAttribute('aria-label','Canvas calendar feed link');
  const field=el('label','Calendar feed link');field.append(link);
  const help=el('details',undefined,'canvas-help'),summary=el('summary','Where do I find the link?');
  help.open=!state.canvas;
  help.append(summary,el('p','In Canvas, open Calendar. In the sidebar on the right, choose Calendar Feed and copy the link it shows. It ends in .ics.'),el('p','The link works like a password for your calendar, so Notival keeps it in your Mac’s Keychain, not in your notes or backups. It doesn’t expire, and you can reset it in Canvas at any time.'),el('p','Canvas doesn’t share whether you’ve turned an assignment in, so tick tasks off yourself.'));
  const error=el('p',message,'canvas-error');error.setAttribute('role','alert');error.hidden=!message;
  const actions=el('div',undefined,'project-dialog-actions'),submit=el('button','Connect','primary');submit.type='submit';
  actions.append(button('Cancel',()=>dialog.close()),submit);
  form.append(field,help,error,actions);
  form.onsubmit=async event=>{
   event.preventDefault();submit.disabled=true;submit.textContent='Connecting…';error.hidden=true;
   try{const assignments=await connect(link.value);await showPairing(true,assignments)}
   catch(problem){submit.disabled=false;submit.textContent='Connect';error.textContent=problem.message;error.hidden=false}
  };
  dialog.append(form);open();link.focus();
 }
 async function showPairing(fresh=false,known=null){
  dialog.replaceChildren(el('h2','Pair subjects with courses'),el('p','Reading your calendar…','canvas-lede'));open();
  let courses;
  try{courses=CanvasModel.feedCourses(known||await readFeed({base:state.canvas.base}))}
  catch(error){if(error.reconnect)return showConnect(error.message);dialog.replaceChildren(el('h2','Couldn’t read your calendar'),el('p',error.message,'canvas-error'),button('Close',()=>dialog.close(),'primary'));return}
  if(!courses.length){dialog.replaceChildren(el('h2','No courses yet'),el('p','Your Canvas calendar doesn’t list any assignments with due dates yet. Once your instructors add some, pair your subjects here.','canvas-lede'),button('Close',()=>dialog.close(),'primary'));return}
  const suggested=CanvasModel.suggestPairing(state.projects,courses);
  const form=el('form');
  form.append(el('h2','Pair subjects with courses'),el('p',fresh?'Connected. Choose the Canvas course for each subject.':'Choose the Canvas course for each subject.','canvas-lede'));
  const rows=el('div',undefined,'canvas-pairs'),selects=[];
  for(const subject of state.projects){
   const row=el('label',undefined,'canvas-pair'),name=el('span',(subject.icon?subject.icon+' ':'')+subject.name),select=el('select');
   select.setAttribute('aria-label','Canvas course for '+subject.name);
   const none=el('option','Not paired');none.value='';select.append(none);
   for(const course of courses){const option=el('option',course.name);option.value=String(course.id);select.append(option)}
   select.value=String(subject.canvas?.courseId||suggested[subject.id]||'');
   if(select.value===''&&subject.canvas?.courseId){const missing=el('option',subject.canvas.name||'Course '+subject.canvas.courseId);missing.value=String(subject.canvas.courseId);select.append(missing);select.value=missing.value}
   row.append(name,select);rows.append(row);selects.push({subject,select});
  }
  if(!state.projects.length)rows.append(el('p','You don’t have any subjects yet. Create one, or add a subject for each course below.','canvas-lede'));
  const create=el('label',undefined,'canvas-create'),box=el('input');box.type='checkbox';create.append(box,document.createTextNode(' Add a subject for each course that isn’t paired'));
  const actions=el('div',undefined,'project-dialog-actions'),save=el('button','Save and sync','primary');save.type='submit';
  actions.append(button('Cancel',()=>dialog.close()),save);
  form.append(rows,create,actions);
  form.onsubmit=async event=>{
   event.preventDefault();
   const used=new Set();
   for(const {subject,select} of selects){
    const course=courses.find(c=>String(c.id)===select.value);
    if(course){subject.canvas={courseId:String(course.id),name:course.name};used.add(String(course.id))}
    else if(select.value&&subject.canvas)used.add(String(subject.canvas.courseId));
    else delete subject.canvas;
   }
   if(box.checked)for(const course of courses){
    if(used.has(String(course.id)))continue;
    const subject={id:uid(),name:course.name,description:'',color:'#7669dd',icon:'🎓',units:[],materials:[],packs:[],assessments:[],checklist:[],canvas:{courseId:String(course.id),name:course.name}};
    StudentModel.initialize(subject);state.projects.push(subject);
   }
   persist();dialog.close();refreshView();await sync();
  };
  dialog.replaceChildren(form);open();
 }
 function showManage(){
  dialog.replaceChildren();
  const canvas=state.canvas,paired=state.projects.filter(s=>s.canvas?.courseId);
  dialog.append(el('h2','Canvas'),
   el('p','Connected to '+canvas.base.replace(/^https?:\/\//,'')+'.','canvas-lede'),
   el('p',canvas.lastSync?'Last synced '+new Date(canvas.lastSync).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'})+'.':'Not synced yet.','canvas-lede'));
  if(canvas.needsReconnect)dialog.append(el('p','Canvas didn’t recognize the saved calendar link. Connect again with the current link.','canvas-error'));
  const list=el('ul',undefined,'canvas-paired');
  for(const subject of paired)list.append(el('li',`${subject.name}: ${subject.canvas.name||'course '+subject.canvas.courseId}`));
  if(!paired.length)list.append(el('li','No subjects are paired yet.'));
  dialog.append(list);
  const actions=el('div',undefined,'project-dialog-actions');
  actions.append(button('Disconnect',()=>{disconnect();dialog.close();toast('Canvas disconnected. Your tasks stay.')},'canvas-danger'),button('New link',()=>showConnect()),button('Pair subjects',()=>showPairing()),button('Sync now',async()=>{dialog.close();await sync()},'primary'));
  dialog.append(actions);open();
 }
 // ---- the control shown in to-do headings ----
 window.marginCanvasControl=subject=>{
  const wrap=el('span',undefined,'canvas-control');
  if(!connected()){wrap.append(button('Connect Canvas',()=>showConnect(),'canvas-button'));return wrap}
  if(subject&&!subject.canvas?.courseId){wrap.append(button('Pair with Canvas',()=>showPairing(),'canvas-button'));return wrap}
  const syncButton=button('Sync Canvas',async()=>{syncButton.disabled=true;syncButton.textContent='Syncing…';try{await sync()}finally{syncButton.disabled=false;syncButton.textContent='Sync Canvas'}},'canvas-button');
  syncButton.title=state.canvas.lastSync?'Last synced '+new Date(state.canvas.lastSync).toLocaleString():'Not synced yet';
  const settings=button('⚙',()=>showManage(),'canvas-gear');settings.title='Canvas settings';settings.setAttribute('aria-label','Canvas settings');
  wrap.append(syncButton,settings);return wrap;
 };
 window.marginOpenExternal=url=>{
  if(!/^https?:\/\//i.test(String(url||'')))return;
  const channel=bridge();channel?channel.postMessage({type:'openURL',url}):window.open(url,'_blank','noopener');
 };
 window.marginCanvas={connect,sync,disconnect,showConnect,showPairing,showManage};
 // Keep things fresh without asking: shortly after launch, then every half hour while the app is open.
 const stale=()=>!state.canvas?.lastSync||Date.now()-state.canvas.lastSync>30*60*1000;
 setTimeout(()=>{if(connected()&&stale())sync({quiet:true})},4000);
 setInterval(()=>{if(connected()&&stale())sync({quiet:true})},5*60*1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&connected()&&stale())sync({quiet:true})});
})();
