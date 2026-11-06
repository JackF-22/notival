// Turns an AI's reply (or any pasted text) into recall questions. Forgiving about formatting, strict about content.
const QuestionImportModel=(()=>{
 const squash=text=>String(text||'').replace(/\s+/g,' ').trim();
 const norm=text=>squash(text).toLowerCase().replace(/[^\p{L}\p{N} ]/gu,'');
 // "Q1.", "**Question 2:**", "- Q:" and friends all count as a question marker; same for answers.
 const marker=(kind)=>new RegExp('^\\s*(?:[-*+•]\\s+|\\d+[.)]\\s+)?(?:\\*\\*|__)?\\s*'+(kind==='q'?'(?:Q(?:uestion)?|Prompt)':'(?:A(?:nswer)?|Ans)')+'\\s*\\d*\\s*[.:：)\\-–]?\\s*(?:\\*\\*|__)?\\s*[:：]?\\s*(?:\\*\\*|__)?\\s*','i');
 const q=marker('q'),a=marker('a');
 const clean=line=>line.replace(/^\s*>\s?/,'').replace(/\*\*/g,'').replace(/__/g,'').trimEnd();
 function unfence(text){return String(text).replace(/```[a-zA-Z]*\n([\s\S]*?)```/g,'$1')}
 function fromJSON(text){
  const start=text.search(/[\[{]/);if(start<0)return null;
  try{
   const data=JSON.parse(text.slice(start,text.lastIndexOf(text[start]==='['?']':'}')+1));
   const list=Array.isArray(data)?data:(data.questions||data.items||null);if(!Array.isArray(list))return null;
   return list.map(i=>({prompt:i.question??i.prompt??i.q??i.front,answer:i.answer??i.a??i.back,text:i.text})).filter(i=>i.text||i.prompt);
  }catch{return null}
 }
 function parse(input,{existing=[]}={}){
  const raw=unfence(String(input||'')).replace(/\r/g,'');
  const found=[];
  const json=/"(?:question|prompt|q|front|text)"\s*:/.test(raw)?fromJSON(raw):null;
  if(json)for(const i of json){
   if(i.text&&/\{\{.+?\}\}/.test(i.text))found.push({type:'cloze',text:i.text});
   else if(i.prompt&&i.answer)found.push({type:'qa',prompt:i.prompt,answer:String(i.answer)});
  }
  else{
   const lines=raw.split('\n').map(clean);
   let cur=null;const flush=()=>{if(cur&&cur.prompt&&cur.answer.trim())found.push({type:'qa',prompt:cur.prompt,answer:cur.answer.trim()});cur=null};
   for(const line of lines){
    if(!line.trim()){if(cur&&cur.stage==='a'&&cur.answer.trim())flush();continue}
    if(q.test(line)){flush();cur={prompt:line.replace(q,'').trim(),answer:'',stage:'q'};
     const inline=cur.prompt.match(/^(.+?\?)\s+(?:A(?:nswer)?\s*[:：]\s*)(.+)$/i);if(inline){cur.prompt=inline[1];cur.answer=inline[2];cur.stage='a'}continue}
    if(cur&&cur.stage==='q'&&a.test(line)&&/^\s*(?:[-*+•]\s+|\d+[.)]\s+)?A(?:nswer)?\s*\d*\s*[.:：)\-–]|^\s*Ans\b/i.test(line)){cur.answer=line.replace(a,'').trim();cur.stage='a';continue}
    if(cur){if(cur.stage==='q')cur.prompt+=' '+line.trim();else cur.answer+=(cur.answer?'\n':'')+line.trim();continue}
    // Outside a Q/A pair: a line with {{blank}} is a fill-in-the-blank.
    const clozeLine=line.replace(/^\s*(?:[-*+•]\s+|\d+[.)]\s+)?(?:C(?:loze)?\s*[:：]\s*)?/i,'').trim();
    if(/\{\{[^{}]+\}\}/.test(clozeLine))found.push({type:'cloze',text:clozeLine});
   }
   flush();
  }
  const seen=new Set(existing.map(norm).filter(Boolean)),out=[];
  for(const item of found){
   const item2=item.type==='cloze'?cloze(item.text):{type:'qa',prompt:squash(item.prompt),answer:String(item.answer).trim()};
   if(!item2)continue;
   const key=norm(item2.type==='cloze'?item2.text:item2.prompt);if(!key)continue;
   out.push({...item2,duplicate:seen.has(key)});seen.add(key);
  }
  return out;
 }
 // One {{blank}} per question: the first hidden word becomes the blank, the rest of the braces are plain text again.
 function cloze(text){
  const matches=[...String(text).matchAll(/\{\{([^{}]+)\}\}/g)];if(!matches.length)return null;
  const blank=squash(matches[0][1]);let n=0;
  const plain=squash(String(text).replace(/\{\{([^{}]+)\}\}/g,(m,inner)=>n++?inner:inner));
  return blank&&plain.includes(blank)?{type:'cloze',text:plain,blank}:null;
 }
 const label=item=>item.type==='cloze'?item.text.replace(item.blank,'[…]'):item.prompt;
 return {parse,label,norm};
})();
