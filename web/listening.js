// Listening practice for a language subject, a tab on the subject's page: add a voice message (an iMessage voice note, a Voice Memo, an mp4/m4a…), listen as often as you
// like, write what you heard in Russian, then in English, and check. The Mac drafts the words so you have something to
// check against; if you have the correct text (a transcript, or what the speaker tells you they said), add it and that is used instead. Scoring: listening-model.js.
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

 let ctx='',pendingSubject='',wantClip='',host=null,lastField='ru',caret={},fields={},selected=null,audio=null,urls=new Map(),mark={a:null,b:null},loop=false,checked=null,pending=new Set(),notice='',autoPaused=false,resumeTimer=0;

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
 // Clips made before subjects could be languages belong to the first language subject that opens them.
 function adopt(subjectId){let changed=false;for(const clip of clips())if(!clip.projectId){clip.projectId=subjectId;changed=true}if(changed)persist()}
 // Opening a voice message means going to the subject's Listening tab with that message chosen.
 function open(subjectId,id){
  ctx=subjectId;wantClip=id||'';
  if(window.marginSubjectTab)window.marginSubjectTab(subjectId,'listening');
 }
 // The tab itself: built when the subject page shows it.
 window.marginListeningPage=subject=>{
  if(!subject?.language)return document.createTextNode('');
  ctx=subject.id;adopt(subject.id);
  host=el('div','listening-page');
  const keep=selected&&selected.projectId===subject.id?selected:null;
  selected=mine().find(c=>c.id===wantClip)||keep||mine()[0]||null;wantClip='';
  checked=null;mark={a:null,b:null};loop=false;notice='';
  host.addEventListener('keydown',event=>{if(event.key==='Escape'&&event.target.matches?.('.listening-text')&&audio){event.preventDefault();togglePlay(false)}});
  paint(true);if(selected)load(selected);
  return host;
 };
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
 function paint(force=false){
  if(!host||(!force&&!host.isConnected))return;
  // Keep the caret where it was if something (a draft arriving) repaints while you are typing.
  const focus=host.contains(document.activeElement)?document.activeElement:null,place=focus?.dataset?.field?{field:focus.dataset.field,start:focus.selectionStart,end:focus.selectionEnd}:null;
  host.replaceChildren();
  const head=el('div','listening-head');head.append(el('h2','','Listening · '+langOf().name),button('+ Add a voice message',()=>{pendingSubject=ctx;post({type:'chooseAudio'})},'primary','Add a voice message from a file'));
  host.append(head);
  if(notice)host.append(el('p','listening-notice',notice));
  if(!mine().length){
   const empty=el('div','listening-empty');
   empty.append(el('p','','Add a voice message and practise: listen, write what you hear in '+langOf().name+', then in English, and check.'),el('small','','Works with iMessage voice messages, Voice Memos and most audio or video files.'));
   host.append(empty);return;
  }
  const body=el('div','listening-body'),rail=el('div','listening-rail'),pane=el('div','listening-pane');
  for(const clip of mine()){
   const best=clip.attempts.reduce((m,a)=>Math.max(m,a.percent),-1);
   const item=el('button','listening-clip'+(clip===selected?' is-selected':''));item.type='button';
   item.append(el('strong','',clip.name),el('small','',prettyDate(clip.added)+' · '+clock(clip.duration)+(best>=0?' · best '+best+'%':'')));
   item.onclick=()=>{if(selected!==clip){selected=clip;checked=null;mark={a:null,b:null};loop=false;paint();load(clip)}};
   rail.append(item);
  }
  body.append(rail,pane);host.append(body);
  if(selected)practice(pane,selected);
  if(place&&fields[place.field]?.isConnected){const f=fields[place.field];f.focus({preventScroll:true});f.setSelectionRange(place.start,place.end)}
  if(checked&&!checked.none&&!place)pane.querySelector('.listening-results')?.scrollIntoView({block:'nearest'});
 }

 // ── Practising one message ─────────────────────────────────────────────────
 let playerNodes=null;
 // Pausing backs up a little (so you hear the end of what you were writing again), and handing the keyboard back
 // to the box you were typing in means a pause is one click, or one Esc, and you carry on writing.
 const rewindOptions=[0,1,2,3,5];
 // With 'Pause while I type', the audio stops when you start writing and carries on a moment after you stop.
 function typed(){
  if(!pref('autopause',false)||!audio)return;
  if(!audio.paused){audio.pause();autoPaused=true;const back=pref('rewind',2);if(back)audio.currentTime=Math.max(0,audio.currentTime-Math.min(back,2))}
  if(autoPaused){clearTimeout(resumeTimer);resumeTimer=setTimeout(()=>{if(autoPaused&&audio&&host?.isConnected){autoPaused=false;audio.play()}},1800)}
 }
 function togglePlay(refocus=true){
  if(!audio)return;
  clearTimeout(resumeTimer);autoPaused=false;
  if(audio.paused)audio.play();
  else{audio.pause();const back=pref('rewind',2);if(back)audio.currentTime=Math.max(0,audio.currentTime-back)}
  if(refocus)returnToText();
 }
 function returnToText(){
  const field=fields[lastField]||fields.ru;if(!field?.isConnected||document.activeElement===field)return;
  field.focus({preventScroll:true});
  const at=caret[lastField];const end=field.value.length;field.setSelectionRange(Math.min(at??end,end),Math.min(at??end,end));
 }
 function player(clip){
  const box=el('div','listening-player');
  const play=button('▶',()=>togglePlay(),'listening-play','Play or pause (Esc while typing)');play.onmousedown=event=>event.preventDefault();
  const back=button('↺ 3s',()=>{if(audio){audio.currentTime=Math.max(0,audio.currentTime-3);audio.play();returnToText()}},'','Hear the last three seconds again');back.onmousedown=event=>event.preventDefault();
  const bar=el('input','listening-seek');bar.type='range';bar.min='0';bar.max=String(Math.max(1,Math.round((clip.duration||1)*10)));bar.value='0';bar.setAttribute('aria-label','Position');
  bar.oninput=()=>{if(audio)audio.currentTime=bar.value/10};
  const time=el('span','listening-time','0:00 / '+clock(clip.duration));
  const speeds=el('div','listening-speeds');
  for(const rate of [1,.75,.5]){const b=button(rate+'×',()=>{remember('speed',rate);if(audio)audio.playbackRate=rate;syncPlayer()},'listening-chip');b.dataset.rate=String(rate);speeds.append(b)}
  const markers=el('div','listening-marks');
  const a=button('A',()=>{mark.a=mark.a==null&&audio?audio.currentTime:null;syncPlayer()},'listening-chip','Mark the start of a part to repeat');
  const bb=button('B',()=>{mark.b=mark.b==null&&audio?audio.currentTime:null;syncPlayer()},'listening-chip','Mark the end of a part to repeat');
  const again=button('Repeat A–B',()=>{loop=!loop;if(loop&&mark.a!=null&&audio){audio.currentTime=mark.a;audio.play()}syncPlayer()},'listening-chip','Play just the part between A and B, over and over');
  const rewind=button('',()=>{const index=rewindOptions.indexOf(pref('rewind',2));remember('rewind',rewindOptions[(index+1)%rewindOptions.length]);syncPlayer()},'listening-chip','When you pause, the audio backs up this far');
  const auto=button('Pause while I type',()=>{remember('autopause',!pref('autopause',false));if(!pref('autopause',false)){clearTimeout(resumeTimer);autoPaused=false}syncPlayer()},'listening-chip','Pauses when you start typing and carries on a moment after you stop');
  for(const chip of [a,bb,again,rewind,auto])chip.onmousedown=event=>event.preventDefault();
  markers.append(a,bb,again,rewind,auto);
  box.append(play,back,bar,time,speeds,markers);
  playerNodes={play,bar,time,speeds,a,bb,again,rewind,auto,clip,built:false};setTimeout(()=>{if(playerNodes)playerNodes.built=true});
  return box;
 }
 function syncPlayer(){
  const n=playerNodes;if(!n)return;
  // Leaving the tab stops the audio; a page that is still being put together just gets its labels.
  if(!n.play.isConnected&&audio&&!audio.paused&&n.built)audio.pause();
  const now=audio?.currentTime||0;
  n.play.textContent=audio&&!audio.paused?'❚❚':'▶';n.play.disabled=!audio;
  n.bar.value=String(Math.round(now*10));n.time.textContent=clock(now)+' / '+clock(audio?.duration||n.clip.duration);
  for(const b of n.speeds.children)b.setAttribute('aria-pressed',String(Math.abs((audio?.playbackRate||pref('speed',1))-Number(b.dataset.rate))<.01));
  n.a.setAttribute('aria-pressed',String(mark.a!=null));n.bb.setAttribute('aria-pressed',String(mark.b!=null));n.a.title=mark.a!=null?'Start at '+clock(mark.a)+' (click to clear)':'Mark the start of a part to repeat';
  n.bb.title=mark.b!=null?'End at '+clock(mark.b)+' (click to clear)':'Mark the end of a part to repeat';
  n.again.setAttribute('aria-pressed',String(loop));n.again.disabled=mark.a==null||mark.b==null;
  const back=pref('rewind',2);n.rewind.textContent=back?'Back up '+back+'s on pause':'No back-up on pause';n.rewind.setAttribute('aria-pressed',String(back>0));
  n.auto.setAttribute('aria-pressed',String(!!pref('autopause',false)));
 }
 const reference=clip=>clip.reference?.trim()?{text:clip.reference.trim(),source:'given'}:clip.draft?.text?.trim()?{text:clip.draft.text.trim(),source:'draft'}:null;

 function practice(pane,clip){
  const titleRow=el('div','listening-title');
  const name=el('input','listening-name');name.value=clip.name;name.setAttribute('aria-label','Name');name.onchange=()=>{clip.name=name.value.trim()||'Voice message';persist();paint()};
  let armed=false,timer=0;
  const del=button('🗑',()=>{if(!armed){armed=true;del.textContent='Delete?';del.classList.add('is-armed');timer=setTimeout(()=>{armed=false;del.textContent='🗑';del.classList.remove('is-armed')},3000);return}
   clearTimeout(timer);post({type:'deleteAudio',id:clip.id});state.listening=clips().filter(c=>c!==clip);persist();audio?.pause();audio=null;selected=mine()[0]||null;checked=null;paint();if(selected)load(selected)},'listening-delete','Delete this voice message');
  titleRow.append(name,del);pane.append(titleRow,player(clip));

  // 1 · Russian
  const ruBox=el('section','listening-step');ruBox.append(el('h3','','1 · Write what you hear in '+langOf().name));
  const ru=el('textarea','listening-text');ru.dataset.field='ru';fields.ru=ru;ru.rows=3;ru.value=clip.work.ru||'';ru.placeholder=langOf().code==='ru'?'Что она говорит?':'What do you hear?';ru.lang=langOf().code;ru.setAttribute('aria-label','What you heard, in Russian');ru.spellcheck=false;
  const russian=langOf().code==='ru';
  const latin=button('Type Latin → Кириллица',()=>{const on=latin.getAttribute('aria-pressed')!=='true';latin.setAttribute('aria-pressed',String(on));remember('translit',on)},'listening-chip','Type Russian with a Latin keyboard: privet becomes привет');
  latin.setAttribute('aria-pressed',String(pref('translit',true)));
  if(russian)Translit.attach(ru,()=>latin.getAttribute('aria-pressed')==='true');
  ru.oninput=()=>{clip.work.ru=ru.value;persist();typed()};
  ruBox.append(ru);
  if(russian){
   const guide=Translit.help(),keys=button('Keys ?',()=>{guide.hidden=!guide.hidden;keys.setAttribute('aria-pressed',String(!guide.hidden))},'listening-chip','Which keys type which letters');keys.setAttribute('aria-pressed','false');
   const row=el('div','listening-chips');row.append(latin,keys);ruBox.append(row,guide);
  }

  // 2 · English
  const enBox=el('section','listening-step');enBox.append(el('h3','','2 · Say it in English'));
  const en=el('textarea','listening-text');en.dataset.field='en';fields.en=en;en.rows=3;en.value=clip.work.en||'';en.placeholder='What does it mean?';en.setAttribute('aria-label','Your English translation');en.oninput=()=>{clip.work.en=en.value;persist();typed()};
  enBox.append(en);
  for(const [name,field] of [['ru',ru],['en',en]]){
   field.addEventListener('focus',()=>{lastField=name});
   for(const type of ['keyup','mouseup','blur'])field.addEventListener(type,()=>{caret[name]=field.selectionStart});
  }
  const tip=el('small','listening-hint','Esc plays or pauses without leaving the box you are typing in.');
  pane.append(ruBox,enBox,tip);

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
   if(!ref)check.append(el('small','listening-hint',pending.has(clip.id)?'Drafting the words on this Mac…':'No words to check against yet. Draft them below, or add the correct text.'));
  }
  else if(checked.none)check.append(el('small','listening-hint','No words to check against yet. Draft them below, or add the correct text.'),button('Back',()=>{checked=null;paint()}));
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

 // Where the right words come from: text you add yourself, or the Mac's draft.
 function reference_box(clip){
  const box=el('section','listening-step listening-reference');box.append(el('h3','','The words'));
  if(pending.has(clip.id))box.append(el('small','listening-hint','Drafting the words on this Mac…'));
  else if(clip.draft){
   const note=clip.draft.onDevice?'Drafted on this Mac. It can be wrong, so listen and correct it if you can.':'Drafted using Apple\'s servers. It can be wrong, so listen and correct it if you can.';
   box.append(el('small','listening-hint',clip.reference?'The Mac\'s draft (not used, since you added the correct text):':note));
   // Speech is about two words a second. A draft far shorter than the audio has probably missed most of it.
   const heard=M.words(clip.draft.text).length;
   if(!clip.reference&&clip.duration>=6&&heard<clip.duration*.7){
    const warn=el('div','listening-warning');
    warn.append(el('span','',heard?'This draft is short for a '+clock(clip.duration)+' message: the Mac may have missed parts of it.':'The Mac did not pick up any words.'));
    if(clip.draft.onDevice)warn.append(button('Try with Apple\'s servers',()=>draft(clip,true),'','Sends this audio to Apple for a better draft'));
    warn.append(button('Try again',()=>draft(clip)));
    box.append(warn,el('small','listening-hint','Or type the correct text below and it will be used instead.'));
   }
   if(!checked||checked.none)box.append(el('p','listening-draft',clip.draft.text||'(no speech found)'));
  }
  else if(clip.draftError){
   box.append(el('p','listening-notice',clip.draftError.message));
   if(clip.draftError.code===11)box.append(el('small','listening-hint','To keep it all on this Mac: System Settings → Keyboard → Dictation → Languages → add Russian, then try again.'),button('Use Apple\'s servers this once',()=>draft(clip,true),'','Sends this voice message to Apple to be transcribed'),button('Try again',()=>draft(clip),''));
   else box.append(button('Try again',()=>draft(clip)));
  }
  else box.append(button('Draft the words on this Mac',()=>draft(clip)));
  const given=el('textarea','listening-text');given.rows=2;given.lang=langOf().code;given.value=clip.reference||'';given.placeholder='The correct text, if you have it (optional)';given.setAttribute('aria-label','The correct text');given.spellcheck=false;
  given.onchange=()=>{clip.reference=given.value;persist();if(checked&&!checked.none)checked=null;paint()};
  box.append(given);
  return box;
 }

 function results(clip,state_){
  const {result,source}=state_,box=el('div','listening-results');
  box.append(el('div','listening-score',result.percent+'%'),el('small','listening-hint',source==='draft'?'Compared with the Mac\'s draft, which can be wrong.':'Compared with the correct text.'));
  const line=el('p','listening-line');line.lang=langOf().code;
  const timed=source==='draft'&&clip.draft?.words?.length===result.words.length?clip.draft.words:null;
  result.words.forEach((item,index)=>{
   const w=el('button','listening-word is-'+item.state,item.word);w.type='button';
   w.title=item.state==='right'?'Add to vocab':item.state==='missed'?'You missed this · add to vocab':(item.state==='close'?'Close: you wrote “':'You wrote “')+item.written+'” · add to vocab';
   if(item.written&&item.state!=='right'){const fix=el('small','',item.written);w.append(fix)}
   w.onclick=()=>{
    if(timed&&audio){audio.currentTime=timed[index].start||0;audio.play()}
    window.marginVocab?.add({term:item.word.toLowerCase(),projectId:ctx});toast?.('Added “'+item.word.toLowerCase()+'” to your vocab');
   };
   line.append(w,' ');
  });
  box.append(line);
  if(result.extra.length)box.append(el('small','listening-hint','Words you wrote that aren\'t in the text: '+result.extra.join(', ')));
  const learn=M.toLearn(result);
  const actions=el('div','listening-actions');
  if(learn.length)actions.append(button('Add the '+learn.length+' to learn to vocab',()=>{for(const word of learn)window.marginVocab?.add({term:word,projectId:ctx});toast?.('Added '+learn.length+' words to your vocab')},'primary'));
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
 window.marginListening={open,clips,paint};
})();
