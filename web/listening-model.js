// Checking what someone heard: lines the words up with what was said and scores the match. Pure functions, no window.
const ListeningModel=(()=>{
 // Words as they are compared: lower case, ё as е, no stress marks or punctuation.
 const normalize=word=>String(word||'').normalize('NFC').replace(/[\u0300\u0301]/g,'').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,'');
 // The words of a text, each with the text as written and the form used to compare.
 function words(text){
  return (String(text||'').match(/[\p{L}\p{N}][\p{L}\p{N}\u0300\u0301'’-]*/gu)||[]).map(raw=>({raw,key:normalize(raw)})).filter(word=>word.key);
 }
 const similar=(a,b)=>{
  if(a===b)return 1;
  // one slip in a long word (an ending, a stray letter) is "close", which for Russian is the case-ending mistake
  const [short,long]=a.length<=b.length?[a,b]:[b,a];
  if(long.length-short.length>1||long.length<4)return 0;
  let i=0,j=0,misses=0;
  while(i<short.length&&j<long.length){
   if(short[i]===long[j]){i++;j++;continue}
   if(++misses>1)return 0;
   if(short.length===long.length){i++;j++}else j++;
  }
  return misses+(long.length-j)+(short.length-i)<=1?.5:0;
 };
 // Align what was written with what was said. Each said word is 'right', 'close' (nearly), 'wrong' (a different
 // word stood there) or 'missed'; words written that matched nothing are 'extra'.
 function compare(said,written){
  const a=words(said),b=words(written),n=a.length,m=b.length;
  // longest chain of matching words, close ones counting a little less than exact ones
  const score=Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){
   const same=similar(a[i].key,b[j].key);
   score[i][j]=Math.max(score[i+1][j],score[i][j+1],same?score[i+1][j+1]+same:0);
  }
  const result=[],extra=[];let i=0,j=0;
  while(i<n){
   const same=j<m?similar(a[i].key,b[j].key):0;
   if(same&&score[i][j]===score[i+1][j+1]+same){result.push({word:a[i].raw,state:same===1?'right':'close',written:b[j].raw});i++;j++}
   else if(j<m&&score[i][j]===score[i][j+1]&&(i>=n||score[i][j]!==score[i+1][j])){extra.push(b[j].raw);j++}
   else{result.push({word:a[i].raw,state:'missed'});i++}
  }
  while(j<m)extra.push(b[j++].raw);
  // A missed word with an unmatched written word beside it is a different word, not a gap.
  let spare=[...extra];
  for(const item of result)if(item.state==='missed'&&spare.length){item.state='wrong';item.written=spare.shift()}
  const points=result.reduce((sum,item)=>sum+(item.state==='right'?1:item.state==='close'?.5:0),0);
  return {words:result,extra:spare,total:n,percent:n?Math.round(points/n*100):0};
 }
 // The words worth learning from a check: the ones missed, wrong or close.
 const toLearn=comparison=>[...new Set(comparison.words.filter(item=>item.state==='missed'||item.state==='wrong'||item.state==='close').map(item=>item.word.toLowerCase()))];
 return {normalize,words,compare,toLearn};
})();
if(typeof module!=='undefined')module.exports=ListeningModel;
