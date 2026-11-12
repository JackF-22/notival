// Listening practice for a language subject: add a voice message (an iMessage voice note, a Voice Memo, an mp4/m4a…), listen as often as you
// like, write what you heard in Russian, then in English, and check. The Mac drafts the words so you have something to
// check against; if she tells you what she actually said, paste it and that is used instead. Scoring: listening-model.js.
(()=>{
 const M=ListeningModel,$=s=>document.querySelector(s);
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
 const button=(label,onclick,cls='',title='')=>{const b=el('button',cls,label);b.type='button';b.onclick=onclick;if(title){b.title=title;b.setAttribute('aria-label',title)}return b};
 const clips=()=>(state.listening??=[]);
 const mine=()=>clips().filter(c=>c.projectId===ctx);
 const subjectOf=id=>(state?.projects||[]).find(p=>p.id===id)||null;
 const langOf=()=>subjectOf(ctx)?.language||{code:'ru',name:'Russian',locale:'ru-RU'};
 const post=message=>window.__notivalHost?window.__notivalHost(message):native(message);
 const pref=(key,fallback)=>{try{const raw=localStorage.getItem('notival.listening.'+key);return raw==null?fallback:JSON.parse(raw)}catch{return fallback}};
 const remember=(key,value)=>{try{localStorage.setItem('notival.listening.'+key,JSON.stringify(value))}catch{}};
 const clock=seconds=>{seconds=Math.max(0,Math.floor(seconds||0));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')};
 const prettyDate=time=>new Date(time).toLocaleDateString(undefined,{month:'short',day:'numeric'});

 let ctx='',pendingSubject='',dialog=null,selected=null,audio=null,urls=new Map(),mark={a:null,b:null},loop=false,checked=null,pending=new Set(),notice='';

 // ── Messages from the app ──────────────────────────────────────────────────
 window.marginAudioChosen=data=>{
  if(!data||data.cancelled)return;
  if(data.error){notice=data.error;paint();return}
  const clip={id:data.id,projectId:pendingSubject||ctx,name:data.name||'Voice message',duration:data.duration||0,added:Date.now(),draft:null,reference:'',attempts:[],work:{ru:'',en:''}};
  clips().unshift(clip);persist();open(clip.projectId,clip.id);draft(clip);
 };
 window.marginAudioData=data=>{
  if(!data)return;
  if(data.error){notice=data.error;paint();return}
  const bytes=Uint8Array.from(atob(data.data),c=>c.charCodeAt(0));
  urls.set(data.id,URL.createObjectURL(new Blob([bytes],{type:data.mime||'audio/mp4'})));
  if(selected?.id===data.id)attach();
 };
 window.marginTranscript=data=>{
  if(!data)return;
  const clip=clips().find(c=>c.id===data.id);pending.delete(data.id);if(!clip)return;
  if(data.error){clip.draftError={message:data.error,code:data.code||0};}
  else{clip.draft={text:data.text||'',words:data.words||[],onDevice:data.onDevice!==false};delete clip.draftError}
  persist();paint();
 };
 function draft(clip,allowServer=false){
  pending.add(clip.id);delete clip.draftError;paint();
  post({type:'transcribeAudio',id:clip.id,locale:(subjectOf(clip.projectId)?.language||langOf()).locale,allowServer});
 }

 // ── The screen ─────────────────────────────────────────────────────────────
 function build(){
  dialog=el('dialog','listening-dialog');dialog.setAttribute('aria-label','Listening practice');
  dialog.addEventListener('close',()=>{audio?.pause()});
  document.body.append(dialog);
 }
 // Clips made before subjects could be languages belong to the first language subject that opens them.
 function adopt(subjectId){let changed=false;for(const clip of clips())if(!clip.projectId){clip.projectId=subjectId;changed=true}if(changed)persist()}
 function open(subjectId,id){
  if(!dialog)build();
  ctx=subjectId;adopt(subjectId);
  selected=mine().find(c=>c.id===id)||mine()[0]||null;checked=null;mark={a:null,b:null};loop=false;notice='';
  if(!dialog.open)dialog.showModal();
  paint();if(selected)load(selected);
 }
 function load(clip){
  audio?.pause();audio=null;
  if(urls.has(clip.id))attach();else post({type:'loadAudio',id:clip.id});
 }
 function attach(){
  if(!selected||!urls.has(selected.id))return;
  audio=new Audio(urls.get(selected.id));audio.preservesPitch=true;audio.playbackRate=pref('speed',1);
  audio.ontimeupdate=()=>{
   if(loop&&mark.a!=null&&mark.b!=null&&audio.currentTime>=mark.b){audio.currentTime=mark.a}
   syncPlayer();
  };
  audio.onended=syncPlayer;audio.onplay=audio.onpause=syncPlayer;audio.onloadedmetadata=syncPlayer;
  syncPlayer();
 }
 function paint(){
  if(!dialog)return;
  const keepScroll=dialog.querySelector('.listening-pane')?.scrollTop||0;
  dialog.replaceChildren();
  const head=el('div','listening-head');head.append(el('h2','','Listening · '+langOf().name),button('+ Add a voice message',()=>{pendingSubject=ctx;post({type:'chooseAudio'})},'primary','Add a voice message from a file'),button('✕',()=>dialog.close(),'listening-close','Close'));
  dialog.append(head);
  if(notice)dialog.append(el('p','listening-notice',notice));
  if(!mine().length){
   const empty=el('div','listening-empty');
   empty.append(el('p','','Add a voice message and practise: listen, write what you hear in '+langOf().name+', then in English, and check.'),el('small','','Works with iMessage voice messages, Voice Memos and most audio or video files.'));
   dialog.append(empty);return;
  }
  const body=el('div','listening-body'),rail=el('div','listening-rail'),pane=el('div','listening-pane');
  for(const clip of mine()){
   const best=clip.attempts.reduce((m,a)=>Math.max(m,a.percent),-1);
   const item=el('button','listening-clip'+(clip===selected?' is-selected':''));item.type='button';
   item.append(el('strong','',clip.name),el('small','',prettyDate(clip.added)+' · '+clock(clip.duration)+(best>=0?' · best '+best+'%':'')));
   item.onclick=()=>{if(selected!==clip){selected=clip;checked=null;mark={a:null,b:null};loop=false;paint();load(clip)}};
   rail.append(item);
  }
  body.append(rail,pane);dialog.append(body);
  if(selected)practice(pane,selected);
  pane.scrollTop=keepScroll;
  if(checked&&!checked.none)pane.querySelector('.listening-results')?.scrollIntoView({block:'nearest'});
 }

 // ── Practising one message ─────────────────────────────────────────────────
 let playerNodes=null;
 function player(clip){
  const box=el('div','listening-player');
  const play=button('▶',()=>{if(!audio)return;audio.paused?audio.play():audio.pause()},'listening-play','Play or pause');
  const back=button('↺ 3s',()=>{if(audio){audio.currentTime=Math.max(0,audio.currentTime-3);audio.play()}},'','Hear the last three seconds again');
  const bar=el('input','listening-seek');bar.type='range';bar.min='0';bar.max=String(Math.max(1,Math.round((clip.duration||1)*10)));bar.value='0';bar.setAttribute('aria-label','Position');
  bar.oninput=()=>{if(audio)audio.currentTime=bar.value/10};
  const time=el('span','listening-time','0:00 / '+clock(clip.duration));
  const speeds=el('div','listening-speeds');
  for(const rate of [1,.75,.5]){const b=button(rate+'×',()=>{remember('speed',rate);if(audio)audio.playbackRate=rate;syncPlayer()},'listening-chip');b.dataset.rate=String(rate);speeds.append(b)}
  const markers=el('div','listening-marks');
  const a=button('A',()=>{mark.a=mark.a==null&&audio?audio.currentTime:null;syncPlayer()},'listening-chip','Mark the start of a part to repeat');
  const bb=button('B',()=>{mark.b=mark.b==null&&audio?audio.currentTime:null;syncPlayer()},'listening-chip','Mark the end of a part to repeat');
  const again=button('Repeat A–B',()=>{loop=!loop;if(loop&&mark.a!=null&&audio){audio.currentTime=mark.a;audio.play()}syncPlayer()},'listening-chip','Play just the part between A and B, over and over');
  markers.append(a,bb,again);
  box.append(play,back,bar,time,speeds,markers);
  playerNodes={play,bar,time,speeds,a,bb,again,clip};
  return box;
 }
 function syncPlayer(){
  const n=playerNodes;if(!n||!n.play.isConnected)return;
  const now=audio?.currentTime||0;
  n.play.textContent=audio&&!audio.paused?'❚❚':'▶';n.play.disabled=!audio;
  n.bar.value=String(Math.round(now*10));n.time.textContent=clock(now)+' / '+clock(audio?.duration||n.clip.duration);
  for(const b of n.speeds.children)b.setAttribute('aria-pressed',String(Math.abs((audio?.playbackRate||pref('speed',1))-Number(b.dataset.rate))<.01));
  n.a.setAttribute('aria-pressed',String(mark.a!=null));n.bb.setAttribute('aria-pressed',String(mark.b!=null));n.a.title=mark.a!=null?'Start at '+clock(mark.a)+' (click to clear)':'Mark the start of a part to repeat';
  n.bb.title=mark.b!=null?'End at '+clock(mark.b)+' (click to clear)':'Mark the end of a part to repeat';
  n.again.setAttribute('aria-pressed',String(loop));n.again.disabled=mark.a==null||mark.b==null;
 }
 const reference=clip=>clip.reference?.trim()?{text:clip.reference.trim(),source:'hers'}:clip.draft?.text?.trim()?{text:clip.draft.text.trim(),source:'draft'}:null;

 function practice(pane,clip){
  const titleRow=el('div','listening-title');
  const name=el('input','listening-name');name.value=clip.name;name.setAttribute('aria-label','Name');name.onchange=()=>{clip.name=name.value.trim()||'Voice message';persist();paint()};
  let armed=false,timer=0;
  const del=button('🗑',()=>{if(!armed){armed=true;del.textContent='Delete?';del.classList.add('is-armed');timer=setTimeout(()=>{armed=false;del.textContent='🗑';del.classList.remove('is-armed')},3000);return}
   clearTimeout(timer);post({type:'deleteAudio',id:clip.id});state.listening=clips().filter(c=>c!==clip);persist();audio?.pause();audio=null;selected=mine()[0]||null;checked=null;paint();if(selected)load(selected)},'listening-delete','Delete this voice message');
  titleRow.append(name,del);pane.append(titleRow,player(clip));

  // 1 · Russian
  const ruBox=el('section','listening-step');ruBox.append(el('h3','','1 · Write what you hear in '+langOf().name));
  const ru=el('textarea','listening-text');ru.rows=3;ru.value=clip.work.ru||'';ru.placeholder=langOf().code==='ru'?'Что она говорит?':'What do you hear?';ru.lang=langOf().code;ru.setAttribute('aria-label','What you heard, in Russian');ru.spellcheck=false;
  const russian=langOf().code==='ru';
  const latin=button('Type Latin → Кириллица',()=>{const on=latin.getAttribute('aria-pressed')!=='true';latin.setAttribute('aria-pressed',String(on));remember('translit',on)},'listening-chip','Type Russian with a Latin keyboard: privet becomes привет');
  latin.setAttribute('aria-pressed',String(pref('translit',true)));
  if(russian)Translit.attach(ru,()=>latin.getAttribute('aria-pressed')==='true');
  ru.oninput=()=>{clip.work.ru=ru.value;persist()};
  ruBox.append(ru);if(russian)ruBox.append(latin);

  // 2 · English
  const enBox=el('section','listening-step');enBox.append(el('h3','','2 · Say it in English'));
  const en=el('textarea','listening-text');en.rows=3;en.value=clip.work.en||'';en.placeholder='What does it mean?';en.setAttribute('aria-label','Your English translation');en.oninput=()=>{clip.work.en=en.value;persist()};
  enBox.append(en);
  pane.append(ruBox,enBox);

  // 3 · Check
  const check=el('section','listening-step');check.append(el('h3','','3 · Check'));
  const ref=reference(clip);
  if(!checked){
   check.append(button('Check my answer',()=>{
   const r=reference(clip);
   if(!r){notice='';checked={none:true};paint();return}
   const result=M.compare(r.text,clip.work.ru||'');
   clip.attempts.unshift({at:Date.now(),percent:result.percent,ru:clip.work.ru||'',en:clip.work.en||'',source:r.source});
   checked={result,source:r.source};persist();paint();
   },'primary listening-check'));
   if(!ref)check.append(el('small','listening-hint',pending.has(clip.id)?'Drafting the words on this Mac…':'No words to check against yet. Draft them below, or paste what she actually said.'));
  }
  else if(checked.none)check.append(el('small','listening-hint','No words to check against yet. Draft them below, or paste what she actually said.'),button('Back',()=>{checked=null;paint()}));
  else check.append(results(clip,checked));
  pane.append(check);
  pane.append(reference_box(clip));
  if(clip.attempts.length>1||(clip.attempts.length&&!checked)){
   const history=el('section','listening-step');history.append(el('h3','','Your attempts'));
   for(const a of clip.attempts.slice(0,6))history.append(el('div','listening-attempt',prettyDate(a.at)+' · '+a.percent+'%'+(a.source==='draft'?' (against the Mac\'s draft)':'')));
   pane.append(history);
  }
  syncPlayer();
 }

 // Where the right words come from: her own text, or the Mac's draft.
 function reference_box(clip){
  const box=el('section','listening-step listening-reference');box.append(el('h3','','The words'));
  if(pending.has(clip.id))box.append(el('small','listening-hint','Drafting the words on this Mac…'));
  else if(clip.draft){
   const note=clip.draft.onDevice?'Drafted on this Mac. It can be wrong, so trust her over it.':'Drafted using Apple\'s servers. It can be wrong, so trust her over it.';
   box.append(el('small','listening-hint',clip.reference?'The Mac\'s draft (not used, since you pasted her words):':note));
   if(!checked||checked.none)box.append(el('p','listening-draft',clip.draft.text||'(no speech found)'));
  }
  else if(clip.draftError){
   box.append(el('p','listening-notice',clip.draftError.message));
   if(clip.draftError.code===11)box.append(el('small','listening-hint','To keep it all on this Mac: System Settings → Keyboard → Dictation → Languages → add Russian, then try again.'),button('Use Apple\'s servers this once',()=>draft(clip,true),'','Sends this voice message to Apple to be transcribed'),button('Try again',()=>draft(clip),''));
   else box.append(button('Try again',()=>draft(clip)));
  }
  else box.append(button('Draft the words on this Mac',()=>draft(clip)));
  const hers=el('textarea','listening-text');hers.rows=2;hers.lang=langOf().code;hers.value=clip.reference||'';hers.placeholder='Paste what she actually said (optional)';hers.setAttribute('aria-label','What she actually said');hers.spellcheck=false;
  hers.onchange=()=>{clip.reference=hers.value;persist();if(checked&&!checked.none)checked=null;paint()};
  box.append(hers);
  return box;
 }

 function results(clip,state_){
  const {result,source}=state_,box=el('div','listening-results');
  box.append(el('div','listening-score',result.percent+'%'),el('small','listening-hint',source==='draft'?'Compared with the Mac\'s draft, which can be wrong.':'Compared with her words.'));
  const line=el('p','listening-line');line.lang=langOf().code;
  const timed=source==='draft'&&clip.draft?.words?.length===result.words.length?clip.draft.words:null;
  result.words.forEach((item,index)=>{
   const w=el('button','listening-word is-'+item.state,item.word);w.type='button';
   w.title=item.state==='right'?'Add to vocab':item.state==='missed'?'You missed this · add to vocab':(item.state==='close'?'Close: you wrote “':'You wrote “')+item.written+'” · add to vocab';
   if(item.written&&item.state!=='right'){const fix=el('small','',item.written);w.append(fix)}
   w.onclick=()=>{
    if(timed&&audio){audio.currentTime=timed[index].start||0;audio.play()}
    window.marginVocab?.add({term:item.word.toLowerCase()});window.marginVocab?.show?.(false);toast?.('Added “'+item.word.toLowerCase()+'” to your vocab');
   };
   line.append(w,' ');
  });
  box.append(line);
  if(result.extra.length)box.append(el('small','listening-hint','Words you wrote that she didn\'t say: '+result.extra.join(', ')));
  const learn=M.toLearn(result);
  const actions=el('div','listening-actions');
  if(learn.length)actions.append(button('Add the '+learn.length+' to learn to vocab',()=>{for(const word of learn)window.marginVocab?.add({term:word});toast?.('Added '+learn.length+' words to your vocab')},'primary'));
  actions.append(button('Try again',()=>{checked=null;paint()}));box.append(actions);
  if(clip.work.en?.trim())box.append(el('small','listening-hint','Your English:'),el('p','listening-english',clip.work.en));
  box.append(el('small','listening-hint','Tap a word to hear it (with the Mac’s draft) and add it to your vocab.'));
  return box;
 }

 // ── Ways in ────────────────────────────────────────────────────────────────
 // On a language subject's page: its voice messages and a way to start.
 window.marginListeningWidget=subject=>{
  if(!subject?.language)return null;
  const box=el('section','subject-listening'),head=el('div','widget-heading');
  head.append(el('h2','','Listening'),button('+ Add',()=>{ctx=subject.id;pendingSubject=subject.id;post({type:'chooseAudio'})},'','Add a voice message'));
  box.append(head);
  adopt(subject.id);
  const own=clips().filter(c=>c.projectId===subject.id);
  if(!own.length)box.append(el('p','listening-widget-empty','Add a voice message to practise listening and writing.'));
  for(const clip of own.slice(0,3)){
   const best=clip.attempts.reduce((m,a)=>Math.max(m,a.percent),-1);
   const row=el('button','listening-widget-clip');row.type='button';row.append(el('strong','',clip.name),el('small','',prettyDate(clip.added)+(best>=0?' · best '+best+'%':' · not tried yet')));
   row.onclick=()=>open(subject.id,clip.id);box.append(row);
  }
  if(own.length>3)box.append(button('All '+own.length+' voice messages',()=>open(subject.id),'listening-widget-all'));
  else if(own.length)box.append(button('Practise',()=>open(subject.id,own[0].id),'primary listening-widget-go'));
  return box;
 };
 // In a language subject's notes: a button next to Vocab.
 const noteSubject=()=>document.body.dataset.view==='note'?current()?.projectId||'':'';
 const noteButton=button('Listening',()=>open(noteSubject()),'','Practise listening for this subject');noteButton.id='note-listening';
 const vocabButton=$('#note-vocab');if(vocabButton)vocabButton.after(noteButton);else $('#note-questions')?.after(noteButton);
 const syncButton=()=>{noteButton.hidden=!subjectOf(noteSubject())?.language};
 const baseRender=render;render=function(){baseRender();syncButton()};syncButton();
 new MutationObserver(syncButton).observe(document.body,{attributes:true,attributeFilter:['data-view']});
 window.marginListening={open,clips,paint};
})();
