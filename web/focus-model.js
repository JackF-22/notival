// Class mode's bookkeeping: how long you stayed with a class, and how that becomes a tree.
// Pure functions over a plain session object, so they can be tested without a window.
//
// Leaving is allowed. Time away simply doesn't grow the tree. Time you said was a lookup is neutral:
// it counts for neither side, so stepping out to check a word never hurts you.
const FocusModel=(()=>{
 const SECOND=1000,MINUTE=60*SECOND;
 const GAP=10*SECOND;            // a longer silence between ticks means the computer slept, not that you left
 const AWAY_MIN=15*SECOND;       // shorter glances away aren't worth calling "away"
 const LOOKUP_WINDOW=3*MINUTE;   // how long "I'm looking something up" covers
 const FULL_GROWTH=50*MINUTE;    // focused time for a tree to reach full size

 // plannedMs is how long the class is meant to run (0 = open-ended). The clock for it is the wall clock:
 // a class doesn't pause while you are looking something up.
 function start({id,subjectId=null,noteId=null,now=Date.now(),seed=Math.floor(Math.random()*2**31),plannedMs=0,wordsAtStart=0,plant}){
  return {id:id||'class-'+now.toString(36),subjectId,noteId,startedAt:now,last:now,seed,plant:plantOf(plant||pick(seed)).id,plannedMs,wordsAtStart,wordsAdded:0,
   focusedMs:0,awayMs:0,lookupMs:0,unobservedMs:0,awayCount:0,lookups:0,
   away:null,lastEpisode:null,lookupUntil:0,parked:[]};
 }

 // Close the current time away, counting it and remembering it so it can be reclassified.
 function endAway(s){
  const episode=s.away;if(!episode)return null;
  s.away=null;
  if(episode.awayMs>=AWAY_MIN)s.awayCount++;
  if(episode.lookupMs>0)s.lookups++;
  s.lookupUntil=0;
  s.lastEpisode={ms:episode.ms,awayMs:episode.awayMs,lookupMs:episode.lookupMs};
  return s.lastEpisode;
 }

 // Move the clock to `now`, given whether the window had your attention during that time.
 function advance(s,now,focused){
  const delta=now-s.last;
  if(delta<=0)return s;               // the clock never runs backwards
  s.last=now;
  if(delta>GAP){s.unobservedMs+=delta;return s}
  if(focused){endAway(s);s.focusedMs+=delta;return s}
  s.away??={since:now-delta,ms:0,awayMs:0,lookupMs:0};
  s.away.ms+=delta;
  if(now<=s.lookupUntil){s.lookupMs+=delta;s.away.lookupMs+=delta}
  else{s.awayMs+=delta;s.away.awayMs+=delta}
  return s;
 }

 // "I'm about to look something up": the next time away, for a few minutes, is neutral.
 function beginLookup(s,now){s.lookupUntil=now+LOOKUP_WINDOW;return s}

 // "That was a lookup" on coming back: the last time away stops counting against you.
 function reclassify(s){
  const e=s.lastEpisode;if(!e||!e.awayMs)return false;
  s.awayMs-=e.awayMs;s.lookupMs+=e.awayMs;
  if(e.awayMs>=AWAY_MIN)s.awayCount--;
  if(!e.lookupMs)s.lookups++;
  e.lookupMs+=e.awayMs;e.awayMs=0;
  return true;
 }

 const elapsed=(s,now)=>Math.max(0,now-s.startedAt);
 // Time left in the planned class, or null when the class has no set length. Negative once it has run over.
 const remaining=(s,now)=>s.plannedMs?s.plannedMs-elapsed(s,now):null;
 const extend=(s,ms)=>{s.plannedMs=(s.plannedMs||elapsed(s,s.last))+ms;return s};
 const progress=(s,now)=>s.plannedMs?Math.min(1,elapsed(s,now)/s.plannedMs):0;

 const ratio=s=>{const total=s.focusedMs+s.awayMs;return total?s.focusedMs/total:1};

 // How big the tree is, 0..1. Quick early growth so the first minutes show something.
 const growth=focusedMs=>Math.min(1,Math.max(0,focusedMs/FULL_GROWTH))**.6;
 // What you can grow. `stages` name the six steps from seed to full size; `yield` is what a well-grown one gives
 // at harvest (trees and flowers give nothing to eat, they are just lovely).
 const STAGE_LIMITS=[1,5,15,30,50];
 const PLANTS=[
  {id:'tree',name:'Oak tree',stages:['Seed','Sprout','Sapling','Young tree','Tree','Grand tree'],yield:null},
  {id:'sunflower',name:'Sunflower',stages:['Seed','Sprout','Seedling','Budding','Blooming','Full bloom'],yield:{noun:'sunflower',nouns:'sunflowers',per:1}},
  {id:'tomato',name:'Tomato',stages:['Seed','Sprout','Seedling','Flowering','Fruiting','Ripe'],yield:{noun:'tomato',nouns:'tomatoes',per:4}},
  {id:'carrot',name:'Carrot',stages:['Seed','Sprout','Seedling','Leafy','Swelling','Ready to pull'],yield:{noun:'carrot',nouns:'carrots',per:1}},
  {id:'strawberry',name:'Strawberry',stages:['Seed','Sprout','Seedling','Flowering','Berries forming','Ripe'],yield:{noun:'strawberry',nouns:'strawberries',per:6}},
  {id:'lettuce',name:'Lettuce',stages:['Seed','Sprout','Seedling','Leafy','Heading','Full head'],yield:{noun:'lettuce',nouns:'lettuces',per:1}},
 ];
 const plantOf=id=>PLANTS.find(p=>p.id===id)||PLANTS[0];
 const pick=seed=>PLANTS[Math.abs(seed|0)%PLANTS.length].id;
 const RIPE=.7;                  // how grown a plant must be before there is anything to harvest
 function stageIndex(focusedMs){
  const minutes=focusedMs/MINUTE;
  const i=STAGE_LIMITS.findIndex(limit=>minutes<limit);
  return i<0?STAGE_LIMITS.length:i;
 }
 const stage=(focusedMs,plant='tree')=>plantOf(plant).stages[stageIndex(focusedMs)];
 // What a finished plant gives: {plant, noun, count}, or null when it is too young or is not a crop.
 function harvest(record){
  const kind=plantOf(record.plant);
  if(!kind.yield||growth(record.focusedMs)<RIPE)return null;
  const count=Math.max(1,Math.round(kind.yield.per*(.5+.5*(record.ratio??1))));
  return {plant:kind.id,count,noun:count===1?kind.yield.noun:kind.yield.nouns};
 }
 // The next stage and how much more focus it takes, or null once the plant is fully grown.
 function nextStage(focusedMs,plant='tree'){
  const index=stageIndex(focusedMs);
  if(index>=STAGE_LIMITS.length)return null;
  return {name:plantOf(plant).stages[index+1],inMs:Math.ceil(STAGE_LIMITS[index]*MINUTE-focusedMs)};
 }
 // How the plant is doing right now: thriving while you are here, resting while you look something up,
 // thirsty once you have been away long enough to count. It perks up the moment you are back.
 function mood(s,now){
  if(!s.away)return 'thriving';
  if(now<=s.lookupUntil||s.away.lookupMs>0&&!s.away.awayMs)return 'resting';
  return s.away.awayMs>=AWAY_MIN?'thirsty':'thriving';
 }
 // How full the foliage is: a class you stayed with is lush, one you drifted from is sparse.
 const density=r=>.25+.75*Math.max(0,Math.min(1,r));

 function finish(s,now){
  advance(s,now,true);                // ending a class means you are here, so the last stretch is focus
  endAway(s);
  return {id:s.id,subjectId:s.subjectId,noteId:s.noteId,startedAt:s.startedAt,endedAt:now,seed:s.seed,plant:s.plant||'tree',plannedMs:s.plannedMs||0,wordsAdded:s.wordsAdded||0,
   focusedMs:s.focusedMs,awayMs:s.awayMs,lookupMs:s.lookupMs,awayCount:s.awayCount,lookups:s.lookups,
   ratio:+ratio(s).toFixed(3),parked:s.parked.slice()};
 }

 function duration(ms){
  const total=Math.round(ms/SECOND),h=Math.floor(total/3600),m=Math.floor(total%3600/60),sec=total%60;
  return h?h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'):m+':'+String(sec).padStart(2,'0');
 }
 const minutesLabel=ms=>{const m=Math.round(ms/MINUTE);return m<60?m+' min':Math.floor(m/60)+' h '+(m%60?m%60+' min':'')};

 // A sentence about how it went. Descriptive, never scolding.
 function verdict(record){
  if(record.focusedMs<MINUTE)return 'A short one. The numbers mean more over a full class.';
  const pct=Math.round(record.ratio*100);
  if(record.ratio>=.9)return 'Rooted: you stayed with it '+pct+'% of the time.';
  if(record.ratio>=.7)return 'Steady: with it '+pct+'% of the time'+(record.awayCount?', away '+record.awayCount+(record.awayCount===1?' time.':' times.'):'.');
  if(record.ratio>=.45)return 'Patchy: '+pct+'% of the time. It happens. The tree remembers the part you were there for.';
  return 'Windswept: '+pct+'% this time. A shorter session may be an easier place to start.';
 }

 // The "After class" section the wrap-up adds to the note. Only what was filled in appears; nothing at all → ''.
 function wrapUp({date='',summary='',unclear=[],parked=[]}={}){
  const lines=list=>list.map(item=>String(item).replace(/\s+/g,' ').trim()).filter(Boolean);
  const sum=String(summary).replace(/\s+/g,' ').trim(),open=lines(unclear),later=lines(parked);
  if(!sum&&!open.length&&!later.length)return '';
  const parts=['## After class'+(date?' · '+date:'')];
  if(sum)parts.push('**Summary:** '+sum);
  if(open.length)parts.push('**Still unclear**',open.map(item=>'- '+item).join('\n'));
  if(later.length)parts.push('**To look into**',later.map(item=>'- '+item).join('\n'));
  return parts.join('\n\n');
 }

 // Totals for the garden: this week, and how each subject is going.
 function gardenStats(sessions,now=Date.now()){
  const weekStart=now-7*24*60*MINUTE,bySubject=new Map();let week=0,weekCount=0;
  for(const r of sessions){
   if(r.endedAt>=weekStart){week+=r.focusedMs;weekCount++}
   const key=r.subjectId||'',e=bySubject.get(key)||{subjectId:r.subjectId||null,count:0,focusedMs:0,awayMs:0};
   e.count++;e.focusedMs+=r.focusedMs;e.awayMs+=r.awayMs;bySubject.set(key,e);
  }
  const subjects=[...bySubject.values()].map(e=>({...e,ratio:e.focusedMs+e.awayMs?e.focusedMs/(e.focusedMs+e.awayMs):1})).sort((a,b)=>b.focusedMs-a.focusedMs);
  const yields=new Map();
  for(const r of sessions){const h=harvest(r);if(h)yields.set(h.plant,(yields.get(h.plant)||0)+h.count)}
  const harvested=PLANTS.filter(p=>yields.has(p.id)).map(p=>({plant:p.id,count:yields.get(p.id),noun:yields.get(p.id)===1?p.yield.noun:p.yield.nouns}));
  return {weekFocusedMs:week,weekCount,subjects,total:sessions.length,harvested};
 }

 return {SECOND,MINUTE,GAP,AWAY_MIN,LOOKUP_WINDOW,elapsed,remaining,extend,progress,start,advance,beginLookup,reclassify,ratio,PLANTS,plantOf,pick,RIPE,harvest,growth,stage,nextStage,mood,density,finish,duration,minutesLabel,verdict,wrapUp,gardenStats};
})();
if(typeof module!=='undefined')module.exports=FocusModel;
