// Stories: a tab on language subjects. Read a short story one sentence at a time and write it in the other language
// (or copy it out), checked word by word as you go; weak sentences and words go on to Recall and Vocab. Your own stories
// live in state.stories, finished runs in state.storyRuns, wordings you told it were also right in state.storyAccepted.
// Grading: stories-model.js. Starter stories: stories-data.js. Russian typing: translit.js. Hearing: marginSpeak (recall.js).
(()=>{
 const M=StoriesModel,$=s=>document.querySelector(s);
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
 const button=(label,onclick,cls='',title='')=>{const b=el('button',cls,label);b.type='button';b.onclick=onclick;if(title){b.title=title;b.setAttribute('aria-label',title)}return b};
 const own=()=>(state.stories??=[]);
 const runs=()=>(state.storyRuns??=[]);
 const acceptedStore=()=>(state.storyAccepted??={});
 const pref=(key,fallback)=>{try{const raw=localStorage.getItem('notival.stories.'+key);return raw==null?fallback:JSON.parse(raw)}catch{return fallback}};
 const remember=(key,value)=>{try{localStorage.setItem('notival.stories.'+key,JSON.stringify(value))}catch{}};
 const subjectOf=id=>(state?.projects||[]).find(p=>p.id===id)||null;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

 let ctx='',host=null,view='library',session=null;
 const langOf=()=>subjectOf(ctx)?.language||{code:'ru',name:'Russian',locale:'ru-RU'};
 const storiesHere=()=>[...StoriesData.forLanguage(langOf().code),...own().filter(s=>s.projectId===ctx)].map(M.clean).filter(M.valid);
 const directionOf=()=>{const d=pref('direction','to-target');return M.DIRECTIONS.includes(d)?d:'to-target'};
 const styleOf=()=>pref('style','steps')==='whole'?'whole':'steps';
 const labels=()=>({'to-target':'English → '+langOf().name,'to-native':langOf().name+' → English','copy':'Copy it out'});
 const best=story=>runs().filter(r=>r.storyId===story.id&&r.projectId===ctx).reduce((m,r)=>Math.max(m,r.percent),-1);
 const tried=story=>runs().some(r=>r.storyId===story.id&&r.projectId===ctx);
 // What to read next: a story you have not tried, otherwise the one you did worst on.
 const nextUp=after=>{
  const all=storiesHere(),from=after?all.findIndex(s=>s.id===after.id)+1:0,ordered=[...all.slice(from),...all.slice(0,from)].filter(s=>!after||s.id!==after.id);
  return ordered.find(s=>!tried(s))||ordered.sort((a,b)=>best(a)-best(b))[0]||null;
 };
 const canSpeak=()=>!!window.marginSpeak?.available?.();
 const say=text=>{if(pref('sound',true)&&canSpeak())window.marginSpeak(text,langOf().code)};

 // ── Ways in ────────────────────────────────────────────────────────────────
 function open(subjectId,storyId){
  ctx=subjectId;
  if(storyId){const story=storiesHere().find(s=>s.id===storyId);if(story)begin(story,false)}
  if(window.marginSubjectTab)window.marginSubjectTab(subjectId,'stories');
 }
 window.marginStoriesPage=subject=>{
  if(!subject?.language)return document.createTextNode('');
  if(ctx!==subject.id){ctx=subject.id;if(!session||session.projectId!==ctx){session=null;view='library'}}
  host=el('div','stories-page');
  if(!session&&view!=='library'&&view!=='add')view='library';
  paint();
  return host;
 };
 function paint(){
  if(!host)return;
  host.replaceChildren();
  if(view==='play'&&session)play();else if(view==='write'&&session)write();else if(view==='done'&&session)done();else if(view==='add')compose();else library();
 }

 // ── The library ────────────────────────────────────────────────────────────
 function library(){
  const lang=langOf(),head=el('div','stories-head');
  head.append(el('h2','','Stories'),button('+ Add a story',()=>{view='add';paint()},'','Add a story of your own'));
  host.append(head);
  const bar=el('div','stories-modes');
  for(const [id,label] of Object.entries(labels())){
   const chip=button(label,()=>{remember('direction',id);paint()},'stories-chip');chip.setAttribute('aria-pressed',String(directionOf()===id));bar.append(chip);
  }
  if(canSpeak()){const sound=button('Sound',()=>{remember('sound',!pref('sound',true));sound.setAttribute('aria-pressed',String(pref('sound',true)))},'stories-chip','Read sentences aloud');sound.setAttribute('aria-pressed',String(pref('sound',true)));bar.append(sound)}
  host.append(bar);
  const styles=el('div','stories-modes stories-styles');
  for(const [id,label,tip] of [['steps','Sentence by sentence','One sentence at a time, checked as you go'],['whole','Whole story','Type the whole story in one go, with feedback as you type']]){
   const chip=button(label,()=>{remember('style',id);paint()},'stories-chip',tip);chip.setAttribute('aria-pressed',String(styleOf()===id));styles.append(chip);
  }
  host.append(styles);
  const whole=styleOf()==='whole';
  host.append(el('p','stories-lede',(directionOf()==='to-target'?'You read the English and write '+(whole?'the whole story':'each sentence')+' in '+lang.name+'.':directionOf()==='to-native'?'You read '+(whole?'the story':'each sentence')+' in '+lang.name+' and write what it means.':'You write '+(whole?'the story':'each sentence')+' out exactly as you see it, to train spelling and typing.')+(whole?' Feedback appears as you type.':'')));
  const all=storiesHere();
  if(!all.length){host.append(el('p','stories-empty','There are no starter stories for '+lang.name+' yet. Add one of your own: paste the text and its English.'));return}
  const go=nextUp(null);
  if(go)host.append(button(tried(go)?'Keep going · '+go.title:'Start · '+go.title,()=>begin(go),'primary stories-go'));
  const grid=el('div','stories-grid');
  for(const story of all){
   const card=el('div','stories-card'),pick=button('',()=>begin(story),'stories-open');
   const score=best(story);
   pick.append(el('strong','',story.title),el('small','',story.sentences.length+' sentences'+(story.level?' · '+story.level:'')),el('small','stories-best',score>=0?'Best '+score+'%':'Not tried yet'));
   if(score>=M.PASS)card.classList.add('is-done');
   card.append(pick);
   if(story.projectId){const remove=button('×',()=>{if(!remove.classList.contains('is-armed')){remove.classList.add('is-armed');remove.textContent='Delete story?';return}state.stories=own().filter(s=>s.id!==story.id);persist();paint()},'stories-remove','Delete this story');card.append(remove)}
   grid.append(card);
  }
  host.append(grid);
 }

 // ── Adding a story ─────────────────────────────────────────────────────────
 function compose(){
  const lang=langOf(),form=el('form','stories-compose');
  form.append(el('h2','',  'Add a story'),el('p','stories-lede','Paste the story in '+lang.name+' and its English. Each is split into sentences and lined up one for one.'));
  const title=el('input','stories-title');title.placeholder='Title';title.setAttribute('aria-label','Story title');
  const target=el('textarea','stories-text');target.rows=6;target.placeholder=lang.name+' text';target.setAttribute('aria-label',lang.name+' text');target.lang=lang.code;target.spellcheck=false;
  const native=el('textarea','stories-text');native.rows=6;native.placeholder='English text';native.setAttribute('aria-label','English text');
  if(lang.code==='ru')Translit.attach(target);
  const count=el('p','stories-count'),save=button('Save story',()=>{},'primary');save.type='submit';
  const update=()=>{const p=M.pair(target.value,native.value);count.textContent=p.targetCount||p.nativeCount?lang.name+': '+p.targetCount+' sentences · English: '+p.nativeCount+(p.ok?' · lined up ✓':' · the counts must match'):'';count.classList.toggle('is-bad',!!(p.targetCount||p.nativeCount)&&!p.ok);save.disabled=!p.ok||!title.value.trim()};
  for(const f of [title,target,native])f.addEventListener('input',update);update();
  form.onsubmit=event=>{
   event.preventDefault();const p=M.pair(target.value,native.value);if(!p.ok)return;
   own().push({id:'story-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),projectId:ctx,title:title.value.trim(),level:'',sentences:p.sentences,created:Date.now()});
   persist();view='library';paint();toast?.('Story saved');
  };
  const actions=el('div','stories-actions');actions.append(save,button('Cancel',()=>{view='library';paint()}));
  form.append(title,el('h3','',lang.name),target,el('h3','','English'),native,count,actions);
  host.append(form);requestAnimationFrame(()=>title.focus());
 }

 // ── Reading and writing ────────────────────────────────────────────────────
 function begin(story,repaint=true){
  const direction=directionOf(),style=styleOf();
  session={projectId:ctx,story,direction,style,index:0,results:story.sentences.map(()=>null),checked:false,typed:style==='whole'?(state.storyDrafts?.[story.id+':'+direction]||''):''};
  view=style==='whole'?'write':'play';if(repaint)paint();
 }
 const extraFor=(story,index,direction)=>acceptedStore()[M.key(story.id,index,direction==='to-native'?'n':'t')]||[];
 const writesTarget=()=>M.writes(session.direction,langOf().code)!=='en';

 function play(){
  const {story,direction,index}=session,sentence=story.sentences[index],lang=langOf(),names=labels();
  const top=el('div','stories-top');
  const back=button('←',()=>{session=null;view='library';paint()},'stories-back','Back to the stories');
  const meta=el('div','stories-meta');meta.append(el('strong','',story.title),el('small','',names[direction]));
  const stats=el('div','stories-stats'),sum=M.summarize(session.results),streak=M.streak(session.results);
  stats.append(el('span','stories-streak'+(streak>=3?' is-hot':''),streak>=2?streak+' in a row':''),el('span','stories-score',sum.done?sum.percent+'%':''));
  top.append(back,meta,stats);host.append(top);

  const bar=el('div','stories-progress');bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(story.sentences.length));bar.setAttribute('aria-valuenow',String(sum.done));
  session.results.forEach((r,i)=>{const seg=el('span','stories-seg'+(r?' is-'+r.state:'')+(i===index?' is-current':''));bar.append(seg)});
  host.append(bar);

  const card=el('section','stories-card-main'+(session.checked?' is-checked':''));
  card.append(el('small','stories-step','Sentence '+(index+1)+' of '+story.sentences.length+' · '+(direction==='to-target'?'write it in '+lang.name:direction==='to-native'?'write what it means':'copy it out')));
  const prompt=el('p','stories-prompt');prompt.append(M.shown(sentence,direction));
  const shownIsTarget=direction!=='to-target';
  if(shownIsTarget)prompt.lang=lang.code;
  if(shownIsTarget&&canSpeak()){const speak=button('🔊',()=>window.marginSpeak(M.shown(sentence,direction),lang.code),'stories-speak','Hear it');prompt.append(speak)}
  card.append(prompt);

  const input=el('textarea','stories-input');input.rows=2;input.value=session.typed||'';input.spellcheck=false;
  input.placeholder=writesTarget()?(lang.code==='ru'?'Напишите по-русски…':'Write it in '+lang.name+'…'):'Write it in English…';
  input.setAttribute('aria-label','Your sentence');if(writesTarget())input.lang=lang.code;
  let latin=null;
  if(writesTarget()&&lang.code==='ru'){
   latin=button('Latin → Кириллица',()=>{const on=latin.getAttribute('aria-pressed')!=='true';latin.setAttribute('aria-pressed',String(on));remember('translit',on);input.focus()},'stories-chip','Type Russian with a Latin keyboard: privet becomes привет');
   latin.setAttribute('aria-pressed',String(pref('translit',true)));
   Translit.attach(input,()=>latin.getAttribute('aria-pressed')==='true');
  }
  input.oninput=()=>{session.typed=input.value};
  input.readOnly=session.checked;
  card.append(input);

  if(!session.checked){
   const row=el('div','stories-row');
   if(latin){const guide=Translit.help(),keys=button('Keys ?',()=>{guide.hidden=!guide.hidden;keys.setAttribute('aria-pressed',String(!guide.hidden))},'stories-chip','Which keys type which letters');keys.setAttribute('aria-pressed','false');row.append(latin,keys);card.append(row,guide)}
   const actions=el('div','stories-actions');
   actions.append(button('Check',check,'primary stories-check'),button('Show answer',()=>{session.typed='';input.value='';check()},'stories-skip'));
   card.append(actions,el('small','stories-hint','Enter to check · Shift+Enter for a new line'));
   input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();check()}});
  }else result(card,sentence);
  host.append(card);

  if(!session.checked){requestAnimationFrame(()=>input.focus());if(shownIsTarget)say(M.shown(sentence,direction))}
 }

 function check(){
  const {story,direction,index}=session,sentence=story.sentences[index];
  const graded=M.gradeSentence(sentence,session.typed||'',{direction,extra:extraFor(story,index,direction)});
  session.results[index]={...graded,typed:session.typed||''};session.checked=true;
  paint();
  if(direction==='to-target'||direction==='copy')say(graded.reference);
 }

 function result(card,sentence){
  const {story,direction,index}=session,r=session.results[index],lang=langOf();
  const panel=el('div','stories-result is-'+r.state);
  const head=el('div','stories-verdict');
  const percent=el('strong','stories-percent','0%');percent.dataset.value=r.percent;
  head.append(percent,el('span','',r.state==='good'?(r.percent===100?'Perfect':'Got it'):r.state==='near'?'Close':r.state==='empty'?'Here is the answer':'Worth another look'));
  panel.append(head);
  // The reference, word by word: what you had right, nearly right, got wrong or left out.
  const words=el('p','stories-words');if(writesTarget())words.lang=lang.code;
  for(const item of r.words){
   const chip=el('span','stories-word is-'+item.state,item.word);
   if(item.written&&item.state!=='right')chip.title='You wrote: '+item.written;
   words.append(chip,' ');
   if(item.written&&(item.state==='wrong'||item.state==='close'))chip.append(el('small','stories-wrote',item.written));
  }
  panel.append(words);
  if(r.extra?.length)panel.append(el('p','stories-extra','Extra: '+r.extra.join(' ')));
  if(r.reference&&r.state!=='good'&&r.reference!==sentence.t&&r.reference!==sentence.n)panel.append(el('small','stories-ref','Closest accepted wording above.'));
  card.append(panel);
  const actions=el('div','stories-actions'),last=index===story.sentences.length-1;
  if(r.state!=='empty'&&r.percent<100&&direction!=='copy')actions.append(button('That’s also correct',()=>accept(),'stories-also','Count what you wrote as right from now on'));
  if(writesTarget()&&canSpeak())actions.append(button('🔊 Hear it',()=>window.marginSpeak(r.reference,lang.code),'stories-skip'));
  const next=button(last?'Finish':'Next →',advance,'primary stories-next');actions.append(next);
  card.append(actions);
  requestAnimationFrame(()=>next.focus());
  // the score counts up
  const target=r.percent,start=performance.now();
  if(reduced()||target===0)percent.textContent=target+'%';
  else{const tick=now=>{const t=Math.min(1,(now-start)/450);percent.textContent=Math.round(target*(1-Math.pow(1-t,3)))+'%';if(t<1&&percent.isConnected)requestAnimationFrame(tick);else percent.textContent=target+'%'};requestAnimationFrame(tick)}
 }

 function accept(){
  const {story,direction,index}=session,r=session.results[index],side=direction==='to-native'?'n':'t',k=M.key(story.id,index,side);
  const list=acceptedStore()[k]??=[];if(!list.includes(r.typed))list.push(r.typed);
  persist();
  session.results[index]={...M.gradeSentence(story.sentences[index],r.typed,{direction,extra:list}),typed:r.typed};
  toast?.('Saved: that wording counts now');paint();
 }

 function advance(){
  if(session.index>=session.story.sentences.length-1){finish();return}
  session.index++;session.typed='';session.checked=false;paint();
 }

 function finish(){
  const sum=M.summarize(session.results);
  runs().push({id:'run-'+Date.now().toString(36),storyId:session.story.id,projectId:session.projectId,direction:session.direction,style:session.style||'steps',percent:sum.percent,at:Date.now()});
  if(runs().length>500)state.storyRuns=runs().slice(-500);
  persist();window.marginUnderstandingRefresh?.();
  view='done';session.finished=sum;paint();
 }

 // ── Writing the whole story ────────────────────────────────────────────────
 // One big box. As you type, each word you have written is marked right, close or wrong against the story, words you
 // skipped show up where they belong, and the sentences fill in along the progress bar. The score so far counts only what you have reached.
 const draftKey=()=>session.story.id+':'+session.direction;
 const saveDraft=()=>{state.storyDrafts??={};if(session.typed.trim())state.storyDrafts[draftKey()]=session.typed;else delete state.storyDrafts[draftKey()];persist()};
 const extraList=story=>index=>extraFor(story,index,session.direction);
 function write(){
  const {story,direction}=session,lang=langOf(),names=labels(),shownIsTarget=direction!=='to-target';
  const top=el('div','stories-top');
  const back=button('←',()=>{clearTimeout(session.saver);saveDraft();session=null;view='library';paint()},'stories-back','Back to the stories (your draft is kept)');
  const meta=el('div','stories-meta');meta.append(el('strong','',story.title),el('small','',names[direction]+' · whole story'));
  const stats=el('div','stories-stats'),score=el('span','stories-score'),count=el('span','stories-streak');stats.append(count,score);
  top.append(back,meta,stats);host.append(top);
  const bar=el('div','stories-progress');story.sentences.forEach(()=>bar.append(el('span','stories-seg')));host.append(bar);

  // what to read
  const source=el('section','stories-source');
  const text=el('p','stories-source-text');if(shownIsTarget)text.lang=lang.code;
  story.sentences.forEach((sentence,i)=>{
   const span=el('span','stories-src',M.shown(sentence,direction));span.dataset.index=i;
   if(shownIsTarget&&canSpeak()){span.title='Click to hear this sentence';span.onclick=()=>window.marginSpeak(M.shown(sentence,direction),lang.code)}
   text.append(span,' ');
  });
  const head=el('div','stories-source-head');head.append(el('small','stories-step',direction==='to-target'?'Read it, then write the whole story in '+lang.name:direction==='to-native'?'Read it, then write what it says in English':'Copy the whole story out'));
  if(shownIsTarget&&canSpeak())head.append(button('🔊 Hear it',()=>window.marginSpeak(story.sentences.map(x=>x.t).join(' '),lang.code),'stories-skip','Hear the whole story'));
  source.append(head,text);host.append(source);

  // where to write
  const input=el('textarea','stories-input stories-big');input.rows=4;input.value=session.typed||'';input.spellcheck=false;input.setAttribute('aria-label','Your story');
  input.placeholder=direction==='to-native'?'Write it in English…':lang.code==='ru'?'Напишите историю по-русски…':'Write the story in '+lang.name+'…';
  if(direction!=='to-native')input.lang=lang.code;
  host.append(input);
  const row=el('div','stories-row');
  if(direction!=='to-native'&&lang.code==='ru'){
   const latin=button('Latin → Кириллица',()=>{const on=latin.getAttribute('aria-pressed')!=='true';latin.setAttribute('aria-pressed',String(on));remember('translit',on);input.focus()},'stories-chip','Type Russian with a Latin keyboard: privet becomes привет');
   latin.setAttribute('aria-pressed',String(pref('translit',true)));Translit.attach(input,()=>latin.getAttribute('aria-pressed')==='true');
   const guide=Translit.help(),keys=button('Keys ?',()=>{guide.hidden=!guide.hidden;keys.setAttribute('aria-pressed',String(!guide.hidden))},'stories-chip','Which keys type which letters');keys.setAttribute('aria-pressed','false');
   row.append(latin,keys);host.append(row,guide);
  }
  const hints=button('Show corrections',()=>{remember('corrections',!pref('corrections',true));hints.setAttribute('aria-pressed',String(pref('corrections',true)));renderLive()},'stories-chip','Show the right word under a wrong one, and the words you skipped');
  hints.setAttribute('aria-pressed',String(pref('corrections',true)));row.append(hints);if(!row.isConnected)host.append(row);

  // how it is going
  const live=el('section','stories-live');live.setAttribute('aria-live','off');host.append(live);
  const actions=el('div','stories-actions');
  actions.append(button('Finish',finishWhole,'primary stories-check','Grade the whole story (⌘Enter)'),button('Start over',()=>{if(session.typed&&!confirm('Clear what you have written?'))return;session.typed='';input.value='';saveDraft();renderLive();input.focus()},'stories-skip'));
  host.append(actions,el('small','stories-hint','Feedback updates as you type · ⌘Enter to finish · your draft is kept if you leave'));

  function renderLive(){
   const t=M.trace(story.sentences,direction,session.typed||'',{extraFor:extraList(story)}),corrections=pref('corrections',true);
   live.replaceChildren();
   if(!t.words){live.append(el('p','stories-live-empty','Start typing and each word is checked as you go.'))}
   else{
    const words=el('p','stories-words');if(direction!=='to-native')words.lang=lang.code;
    // words you skipped are shown where they belong, just before the word that follows them
    let lastRef=-1;
    const missedBetween=upto=>{for(let i=lastRef+1;i<upto;i++)if(t.refs[i].state==='missed'){const chip=el('span','stories-word is-missed',corrections?t.refs[i].word:'…');chip.title='You skipped a word';words.append(chip,' ')}};
    for(const item of t.typed){
     if(item.i!=null){missedBetween(item.i);lastRef=Math.max(lastRef,item.i)}
     const chip=el('span','stories-word is-'+item.state,item.raw);
     if(corrections&&(item.state==='wrong'||item.state==='close')&&item.ref)chip.append(el('small','stories-wrote stories-fix',item.ref));
     if(item.state==='extra')chip.title='Not in the story';
     words.append(chip,' ');
    }
    missedBetween(t.refs.length);
    live.append(words);
   }
   // the sentences fill in as you reach them
   const reached=t.frontier<0?0:t.refs[t.frontier].sentence;
   [...bar.children].forEach((seg,i)=>{const r=t.sentences[i];seg.className='stories-seg'+(t.words&&i<reached&&r.covered?' is-'+(r.state==='empty'?'review':r.state):'')+(t.words&&i===reached||!t.words&&i===0?' is-current':'')});
   bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuenow',String(reached));bar.setAttribute('aria-valuemax',String(story.sentences.length));
   [...text.children].forEach(span=>{if(span.dataset?.index!=null)span.classList.toggle('is-here',t.words>0&&Number(span.dataset.index)===reached)});
   count.textContent=t.words?t.words+' words'+(t.missed?' · '+t.missed+' skipped':''):'';
   score.textContent=t.words?t.percent+'%':'';
  }
  const mine=session;
  input.oninput=()=>{session.typed=input.value;clearTimeout(session.saver);session.saver=setTimeout(()=>{if(session===mine&&view==='write')saveDraft()},600);renderLive()};
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();finishWhole()}});
  renderLive();requestAnimationFrame(()=>input.focus());
 }

 function finishWhole(){
  if(!(session.typed||'').trim()){toast?.('Write something first');return}
  clearTimeout(session.saver);
  const t=M.trace(session.story.sentences,session.direction,session.typed,{extraFor:extraList(session.story),final:true});
  session.results=t.sentences.map(r=>({...r,typed:r.typed}));
  if(state.storyDrafts)delete state.storyDrafts[draftKey()];
  finish();
 }

 // ── The end of a story ─────────────────────────────────────────────────────
 function done(){
  const {story,direction}=session,sum=session.finished||M.summarize(session.results),lang=langOf();
  const box=el('section','stories-done');
  const ring=el('div','stories-ring');ring.style.setProperty('--pct',sum.percent);ring.append(el('strong','',sum.percent+'%'));
  box.append(el('small','stories-eyebrow',story.title),ring,el('h2','',sum.percent>=95?'Flawless.':sum.percent>=M.PASS?'Nicely done.':sum.percent>=M.REVIEW?'Getting there.':'A good first read.'),
   el('p','stories-lede',sum.perfect+' of '+sum.total+' sentences perfect · '+sum.passed+' passed'));
  const weak=sum.weak;
  if(weak.length){
   const list=el('div','stories-weak');list.append(el('h3','',weak.length===1?'One sentence to revisit':weak.length+' sentences to revisit'));
   for(const i of weak){
    const sentence=story.sentences[i],r=session.results[i],row=el('div','stories-weak-row');
    row.append(el('small','',M.shown(sentence,direction)),el('p','',r.reference||''));
    if(r.typed)row.append(el('small','stories-wrote-line','You wrote: '+r.typed));
    list.append(row);
   }
   box.append(list);
  }
  const actions=el('div','stories-actions');
  if(weak.length){
   const recall=button('Add the '+weak.length+' to Recall',()=>{
    state.items??=[];let added=0;
    for(const i of weak){const q=M.toQuestion(story.sentences[i],direction,lang.code);if(state.items.some(x=>x.projectId===ctx&&x.prompt===q.prompt))continue;state.items.push(RecallModel.newItem({...q,projectId:ctx}));added++}
    persist();recall.disabled=true;recall.textContent=added?'Added to Recall ✓':'Already in Recall ✓';window.marginUnderstandingRefresh?.();
   },'stories-skip','Turn the weak sentences into Recall questions');
   actions.append(recall);
   const learn=direction==='to-native'?[]:[...new Set(weak.flatMap(i=>M.toLearn(session.results[i]).map(w=>[w,story.sentences[i].t])))];
   const unique=[...new Map(learn.map(([w,s])=>[w,s])).entries()];
   if(unique.length&&window.marginVocab){const vocab=button('Add the '+unique.length+' words to Vocab',()=>{for(const [word,sentence] of unique)window.marginVocab.add({term:word,sentence,projectId:ctx});vocab.disabled=true;vocab.textContent='Added to Vocab ✓'},'stories-skip');actions.append(vocab)}
  }
  const upcoming=nextUp(story);
  actions.append(button('Read it again',()=>begin(story),'stories-skip'),button('All stories',()=>{session=null;view='library';paint()},'stories-skip'));
  if(upcoming&&upcoming.id!==story.id)actions.append(button('Next · '+upcoming.title,()=>begin(upcoming),'primary stories-next'));
  box.append(actions);host.append(box);
 }

 // ── On the subject's page ──────────────────────────────────────────────────
 window.marginStoriesWidget=subject=>{
  if(!subject?.language)return null;
  const before=ctx;ctx=subject.id;const go=nextUp(null),all=storiesHere();ctx=before;
  if(!all.length)return null;
  const box=el('section','subject-stories'),head=el('div','widget-heading');
  const finished=all.filter(s=>runs().some(r=>r.storyId===s.id&&r.projectId===subject.id&&r.percent>=M.PASS)).length;
  head.append(el('h2','','Stories'),el('small','stories-widget-count',finished+' of '+all.length+' read'));
  box.append(head);
  if(go)box.append(button(go.title,()=>open(subject.id,go.id),'stories-widget-go'),button('All stories',()=>open(subject.id),'stories-widget-all'));
  return box;
 };
 window.marginStories={open,paint};
})();
