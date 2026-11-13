// Story practice: a story is a list of sentences in the language you are learning, each with its English. You are shown
// one side and write the other (or copy the language out as it is shown). Grading lines your words up against the
// reference and every other wording that is accepted. Pure functions, no window; the page is stories.js.
const StoriesModel=(()=>{
 const Words=typeof ListeningModel!=='undefined'?ListeningModel:require('./listening-model.js');
 // to-target: read English, write the language. to-native: read the language, write English. copy: write what you see.
 const DIRECTIONS=['to-target','to-native','copy'];
 const PASS=85,REVIEW=60;
 // A sentence is {t: in the language, n: in English, tAlt: [], nAlt: []}.
 const shown=(sentence,direction)=>direction==='to-target'?sentence.n:sentence.t;
 const writes=(direction,lang='ru')=>direction==='to-native'?'en':lang;
 // What is accepted: the reference, the wordings the story lists, and any you told the app were also right.
 function accepted(sentence,direction,extra=[]){
  const base=direction==='to-target'?[sentence.t,...(sentence.tAlt||[])]:direction==='to-native'?[sentence.n,...(sentence.nAlt||[])]:[sentence.t];
  return [...base,...extra].filter(Boolean);
 }
 // Copying is exact: a word with the wrong ending is wrong, not nearly right.
 function gradeSentence(sentence,typed,{direction='to-target',extra=[]}={}){
  const options=accepted(sentence,direction,extra),strict=direction==='copy';
  const written=String(typed||'');
  if(!Words.words(written).length)return {percent:0,words:Words.compare(options[0],'').words,extra:[],reference:options[0],state:'empty'};
  let best=null;
  for(const reference of options){
   const comparison=Words.compare(reference,written);
   const points=comparison.words.reduce((sum,item)=>sum+(item.state==='right'?1:item.state==='close'&&!strict?.5:0),0);
   const percent=comparison.total?Math.round(points/(comparison.total+comparison.extra.length*.35)*100):0;
   if(!best||percent>best.percent)best={percent,words:comparison.words,extra:comparison.extra,reference};
  }
  best.state=best.percent>=PASS?'good':best.percent>=REVIEW?'near':'review';
  return best;
 }
 // The whole story so far: results is a list of {percent} (null for a sentence not tried), in order.
 function summarize(results){
  const done=results.filter(Boolean),total=results.length;
  const average=done.length?Math.round(done.reduce((sum,r)=>sum+r.percent,0)/done.length):0;
  return {done:done.length,total,percent:average,perfect:done.filter(r=>r.percent===100).length,passed:done.filter(r=>r.percent>=PASS).length,
   weak:results.map((r,i)=>r&&r.percent<PASS?i:-1).filter(i=>i>=0)};
 }
 // A run of correct sentences in a row, ending at the latest one.
 function streak(results){let n=0;for(let i=results.length-1;i>=0;i--){if(results[i]&&results[i].percent>=PASS)n++;else if(results[i])break}return n}
 // Split text into sentences at . ! ? … (and a closing quote or bracket) followed by a space or the end.
 function sentences(text){
  return String(text||'').replace(/\s+/g,' ').trim().split(/(?<=[.!?…]["»”')\]]?)\s+/u).map(s=>s.trim()).filter(Boolean);
 }
 // A story you paste: the language's text and its English, split into sentences and lined up one for one.
 function pair(target,native){
  const t=sentences(target),n=sentences(native);
  return {sentences:t.map((line,i)=>({t:line,n:n[i]||''})),targetCount:t.length,nativeCount:n.length,ok:t.length>0&&t.length===n.length};
 }
 // Each story ends up with an id, a title and clean sentences; anything unusable is dropped.
 function clean(story){
  const sentencesOf=(story.sentences||[]).map(s=>({t:String(s.t||'').trim(),n:String(s.n||'').trim(),tAlt:(s.tAlt||[]).map(String).filter(Boolean),nAlt:(s.nAlt||[]).map(String).filter(Boolean)})).filter(s=>s.t&&s.n);
  return {...story,title:String(story.title||'Untitled story').trim()||'Untitled story',sentences:sentencesOf};
 }
 const valid=story=>!!story&&story.sentences.length>0;
 // A weak sentence becomes a question for Recall: the shown side asks, the reference answers.
 function toQuestion(sentence,direction,lang='ru'){
  const ask=direction==='to-target'?'How do you say “'+sentence.n+'”?':direction==='to-native'?'What does “'+sentence.t+'” mean?':'Write it out: “'+sentence.t+'”';
  return {type:'qa',prompt:ask,answer:direction==='to-native'?sentence.n:sentence.t,origin:'made',story:true,lang};
 }
 // The words worth learning from one result (missed, wrong or close).
 const toLearn=result=>Words.toLearn({words:result.words});
 // ── Writing the whole story at once ───────────────────────────────────────
 // Everything typed so far is lined up against the story, word by word, as you go. Each sentence may match any of its
 // accepted wordings; the word being typed is not judged until it is finished; words you have not reached stay pending.
 const value=(a,b,strict)=>{const v=Words.similar(a.key,b.key);return strict&&v<1?0:v};
 // The best way to line two word lists up: the pairs {r, t, v} that match, in order (v is 1 for exact, .5 for close).
 function align(ref,typed,strict=false){
  const n=ref.length,m=typed.length,score=Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){const v=value(ref[i],typed[j],strict);score[i][j]=Math.max(score[i+1][j],score[i][j+1],v?score[i+1][j+1]+v:0)}
  const pairs=[];let i=0,j=0;
  while(i<n&&j<m){
   const v=value(ref[i],typed[j],strict);
   if(v&&score[i][j]===score[i+1][j+1]+v){pairs.push({r:i,t:j,v});i++;j++}
   else if(score[i][j]===score[i+1][j])i++;else j++;
  }
  return pairs;
 }
 // How well one wording of a sentence matches the typed words from `from` on, and where its match ends.
 function reach(ref,typed,from,strict){
  const n=ref.length,m=typed.length-from,f=Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){const v=value(ref[i-1],typed[from+j-1],strict);f[i][j]=Math.max(f[i-1][j],f[i][j-1],v?f[i-1][j-1]+v:0)}
  const score=f[n][m];let end=0;if(score>0){end=1;while(f[n][end]<score)end++}
  return {score,end:from+end};
 }
 // The wording each sentence is held to: of its accepted wordings, the one the typed words fit best, in order.
 function wordings(sentences,direction,typed,extraFor,strict){
  let at=0;
  return sentences.map((sentence,index)=>{
   const options=accepted(sentence,direction,extraFor(index));
   let pick={text:options[0],score:-1,end:at};
   if(at<typed.length)for(const text of options){const hit=reach(Words.words(text),typed,at,strict);if(hit.score>pick.score)pick={text,score:hit.score,end:hit.end}}
   // nothing matched: whatever was typed here took the place of this sentence
   if(at<typed.length&&pick.score<=0)pick.end=Math.min(typed.length,at+Words.words(pick.text).length);
   at=Math.max(at,pick.end);
   return pick.text;
  });
 }
 // The state of everything typed. `final` means you are done: words not reached count as missed.
 function trace(sentences,direction,text,{extraFor=()=>[],final=false}={}){
  const strict=direction==='copy',typedWords=Words.words(text),texts=wordings(sentences,direction,typedWords,extraFor,strict);
  const ref=[];texts.forEach((t,k)=>Words.words(t).forEach(w=>ref.push({...w,sentence:k})));
  const pairs=align(ref,typedWords,strict);
  const r=ref.map(()=>({state:'pending'})),t=typedWords.map(word=>({state:'extra',raw:word.raw,sentence:0}));
  let prevR=-1,prevT=-1;
  const gap=(toR,toT,atEnd)=>{
   const refs=[],typed=[];for(let i=prevR+1;i<toR;i++)refs.push(i);for(let j=prevT+1;j<toT;j++)typed.push(j);
   const k=Math.min(refs.length,typed.length),near=prevR>=0?ref[prevR].sentence:0;
   for(let x=0;x<k;x++){r[refs[x]]={state:'wrong',written:typedWords[typed[x]].raw};t[typed[x]]={state:'wrong',raw:typedWords[typed[x]].raw,ref:ref[refs[x]].raw,i:refs[x],sentence:ref[refs[x]].sentence}}
   for(let x=k;x<typed.length;x++)t[typed[x]]={state:'extra',raw:typedWords[typed[x]].raw,sentence:near};
   for(let x=k;x<refs.length;x++)r[refs[x]]={state:atEnd&&!final?'pending':'missed'};
  };
  for(const p of pairs){
   gap(p.r,p.t,false);
   const state=p.v===1?'right':'close';
   r[p.r]={state,written:typedWords[p.t].raw};t[p.t]={state,raw:typedWords[p.t].raw,ref:ref[p.r].raw,i:p.r,sentence:ref[p.r].sentence};prevR=p.r;prevT=p.t;
  }
  gap(ref.length,typedWords.length,true);
  // the word at the caret is not judged until you move on from it
  const last=typedWords.length-1;
  if(!final&&last>=0&&!/[\s.,!?;:…»"')\]]$/u.test(text)&&(t[last].state==='wrong'||t[last].state==='extra')){
   if(t[last].i!=null)r[t[last].i]={state:'pending'};
   t[last]={state:'typing',raw:t[last].raw,sentence:t[last].sentence};
  }
  const point=x=>x.state==='right'?1:x.state==='close'?.5:0;
  const extras=t.filter(x=>x.state==='extra').length,frontier=r.reduce((at,x,i)=>x.state==='pending'?at:i,-1);
  const points=r.reduce((sum,x)=>sum+point(x),0);
  const percent=judged=>judged?Math.round(points/(judged+extras*.35)*100):0;
  const sentenceResults=sentences.map((_,k)=>{
   const idx=ref.map((w,i)=>w.sentence===k?i:-1).filter(i=>i>=0),own=t.filter(x=>x.sentence===k&&x.state!=='typing');
   const words=idx.map(i=>({word:ref[i].raw,state:r[i].state==='pending'?'missed':r[i].state,written:r[i].written}));
   const extra=own.filter(x=>x.state==='extra').map(x=>x.raw),got=idx.reduce((sum,i)=>sum+point(r[i]),0);
   const pct=words.length?Math.round(got/(words.length+extra.length*.35)*100):0,wrote=idx.some(i=>r[i].written);
   return {percent:pct,words,extra,reference:texts[k],typed:idx.filter(i=>r[i].written).map(i=>r[i].written).join(' '),
    state:!wrote?'empty':pct>=PASS?'good':pct>=REVIEW?'near':'review',covered:idx.some(i=>r[i].state!=='pending')};
  });
  return {typed:t,refs:r.map((x,i)=>({...x,word:ref[i].raw,sentence:ref[i].sentence})),texts,sentences:sentenceResults,words:typedWords.length,total:ref.length,frontier,
   percent:percent(frontier+1),finalPercent:percent(ref.length),extras,
   missed:r.filter(x=>x.state==='missed').length,wrong:r.filter(x=>x.state==='wrong').length};
 }
 // Alternate wordings are kept per story sentence and side: "storyId:3:t".
 const key=(storyId,index,side)=>storyId+':'+index+':'+side;
 return {DIRECTIONS,PASS,REVIEW,align,trace,shown,writes,accepted,gradeSentence,summarize,streak,sentences,pair,clean,valid,toQuestion,toLearn,key};
})();
if(typeof module!=='undefined')module.exports=StoriesModel;
