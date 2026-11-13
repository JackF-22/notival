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
 // Alternate wordings are kept per story sentence and side: "storyId:3:t".
 const key=(storyId,index,side)=>storyId+':'+index+':'+side;
 return {DIRECTIONS,PASS,REVIEW,shown,writes,accepted,gradeSentence,summarize,streak,sentences,pair,clean,valid,toQuestion,toLearn,key};
})();
if(typeof module!=='undefined')module.exports=StoriesModel;
