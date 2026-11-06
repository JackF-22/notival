// A study set as one Markdown document: the student's own notes, ready to hand to an AI for test prep.
const AIPack=(()=>{
 const flat=text=>String(text||'').replace(/\s+/g,' ').trim();
 const open=flag=>flag.status!=='resolved';
 const instructions=[
  'I am preparing for a test. Everything below is my own notes from lectures and reading. Please use them as the source of truth.',
  '',
  '1. Start by asking which format I want: a practice test with an answer key, or being quizzed one question at a time.',
  '2. Base questions on my notes. If something I will be tested on looks thin or missing, tell me instead of filling the gap silently.',
  '3. Pay extra attention to the passages I flagged as unclear.',
  '4. After I answer, explain what I got wrong and why.',
  '',
  'If I ask you for questions to keep, write each one in exactly this form so I can import them into my notes app, with a blank line between questions:',
  '',
  'Q: the question',
  'A: the answer',
  '',
  'For a fill-in-the-blank, write one sentence and put the hidden word in double braces, like: The {{mitochondrion}} makes most of a cell’s ATP.'
 ];
 function block(b){
  const text=String(b.text||'').trim();if(!text)return '';
  if(b.type==='code')return '```'+(b.language&&b.language!=='text'?b.language:'')+'\n'+text+'\n```';
  return text;
 }
 // Notes keep the heading levels the student wrote, pushed below the document's own headings.
 function demote(markdown,by){return markdown.replace(/^(#{1,6})(\s)/gm,(m,hashes,space)=>'#'.repeat(Math.min(6,hashes.length+by))+space)}
 function noteSection(note,level){
  const title=note.title?.trim()||'Untitled note',body=(note.blocks||[]).map(block).filter(Boolean).join('\n\n');
  return '#'.repeat(level)+' '+title+'\n\n'+(body?demote(body,level):'_This note is empty._');
 }
 function flagLines(notes){
  const lines=[];
  for(const note of notes)for(const flag of note.flags||[]){
   const label='“'+flat(flag.quote)+'” (in '+(note.title?.trim()||'Untitled note')+')';
   if(open(flag))lines.push('- Unclear: '+label+(flag.comment?' — '+flat(flag.comment):''));
   else lines.push('- Cleared up: '+label+' — '+flat(flag.clarification));
  }
  return lines;
 }
 function build({subject,title,date,topics=[],notes=[],materials=[],units=null}){
  const unitList=units||subject?.units||[],out=['# Test prep: '+title];
  const facts=[subject?.name&&'Subject: '+subject.name,date&&'Test date: '+new Date(date+'T12:00:00').toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})].filter(Boolean);
  if(facts.length)out.push(facts.join(' · '));
  out.push('## What I want from you',instructions.join('\n'));
  if(topics.length)out.push('## Topics I need to cover',topics.map(t=>'- ['+(t.done?'x':' ')+'] '+t.title).join('\n'));
  const sections=[];
  for(const unit of unitList){
   const inUnit=notes.filter(n=>n.unitId===unit.id);if(!inUnit.length)continue;
   sections.push('### '+unit.name+'\n\n'+inUnit.map(n=>noteSection(n,4)).join('\n\n'));
  }
  const loose=notes.filter(n=>!unitList.some(u=>u.id===n.unitId));
  if(loose.length)sections.push((sections.length?'### Other notes\n\n':'')+loose.map(n=>noteSection(n,sections.length?4:3)).join('\n\n'));
  out.push('## My notes',sections.join('\n\n')||'_No notes yet._');
  const flags=flagLines(notes);if(flags.length)out.push('## Passages I flagged',flags.join('\n'));
  if(materials.length)out.push('## Files not included here','These are in my materials, but only my notes are in this document:\n\n'+materials.map(m=>'- '+m.name).join('\n'));
  return out.join('\n\n')+'\n';
 }
 return {build};
})();
