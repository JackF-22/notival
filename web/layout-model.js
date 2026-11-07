// The page layout of a note: which cells sit side by side. Pure functions over `note.blocks`.
// A row is a run of adjacent cells that share a `row` id. Cell order in `blocks` is always the reading order
// (left to right, then top to bottom), so anything that walks the blocks in order stays correct.
const LayoutModel=(()=>{
 const MAX_COLUMNS=3;
 const sameRow=(a,b)=>!!a&&!!b&&!!a.row&&a.row===b.row;

 // The note as rows. A cell on its own is a row of one.
 function rows(blocks){
  const out=[];
  for(const block of blocks){
   const last=out.at(-1);
   if(last&&sameRow(last.cells.at(-1),block))last.cells.push(block);else out.push({cells:[block]});
  }
  return out;
 }
 const rowOf=(blocks,id)=>rows(blocks).find(r=>r.cells.some(b=>b.id===id));

 // Repair anything that isn't a clean row: lone cells, rows split apart by edits, rows wider than the limit.
 // Returns true if it changed anything.
 function tidy(blocks,newId){
  let changed=false;const seen=new Set();
  for(const run of rows(blocks)){
   const id=run.cells[0].row;if(!id)continue;
   // A row past the limit breaks into rows of at most three; cells split from their row get a row of their own.
   for(let i=0;i<run.cells.length;i+=MAX_COLUMNS){
    const chunk=run.cells.slice(i,i+MAX_COLUMNS),key=i===0&&!seen.has(id)?id:newId();
    if(key!==id)changed=true;
    seen.add(key);
    for(const cell of chunk){
     if(chunk.length<2){if(cell.row){delete cell.row;changed=true}}
     else cell.row=key;
    }
   }
  }
  return changed;
 }

 // May `id` be dropped on `side` (left | right | above | below) of `targetId`?
 function check(blocks,id,targetId,side){
  if(id===targetId)return {ok:false,reason:'self'};
  const cell=blocks.find(b=>b.id===id),target=blocks.find(b=>b.id===targetId);
  if(!cell||!target)return {ok:false,reason:'missing'};
  if(side==='left'||side==='right'){
   const there=rowOf(blocks,targetId).cells.filter(b=>b.id!==id);
   if(there.length>=MAX_COLUMNS)return {ok:false,reason:'full'};
  }
  return {ok:true};
 }

 // Move a cell. Dropping left/right of a cell puts them in one row; above/below puts the cell on its own line
 // above or below the target's whole row. Returns {ok,reason}.
 function move(blocks,id,targetId,side,newId){
  const verdict=check(blocks,id,targetId,side);if(!verdict.ok)return verdict;
  const cell=blocks.find(b=>b.id===id),target=blocks.find(b=>b.id===targetId);
  const group=rowOf(blocks,targetId).cells.filter(b=>b.id!==id);
  blocks.splice(blocks.indexOf(cell),1);
  delete cell.row;
  let at;
  if(side==='left'||side==='right'){
   if(!target.row)target.row=newId();
   cell.row=target.row;
   at=blocks.indexOf(target)+(side==='right'?1:0);
  }else{
   const edge=side==='above'?group[0]||target:group.at(-1)||target;
   at=blocks.indexOf(edge)+(side==='below'?1:0);
  }
  blocks.splice(at,0,cell);
  tidy(blocks,newId);
  return {ok:true};
 }

 // Step a cell one place through the layout, for keyboard users. dir: up | down | left | right.
 function nudge(blocks,id,dir,newId){
  const list=rows(blocks),at=list.findIndex(r=>r.cells.some(b=>b.id===id));if(at<0)return {ok:false,reason:'missing'};
  const row=list[at],col=row.cells.findIndex(b=>b.id===id);
  if(dir==='up'||dir==='down'){
   // Inside a row, up/down lifts the cell out above or below that row; on its own it steps past the neighbouring row.
   const other=row.cells.find(b=>b.id!==id),next=list[at+(dir==='up'?-1:1)];
   if(other)return move(blocks,id,other.id,dir==='up'?'above':'below',newId);
   return next?move(blocks,id,next.cells[0].id,dir==='up'?'above':'below',newId):{ok:false,reason:'edge'};
  }
  if(dir==='left'){
   if(col>0)return move(blocks,id,row.cells[col-1].id,'left',newId);
   const prev=list[at-1];return prev?move(blocks,id,prev.cells.at(-1).id,'right',newId):{ok:false,reason:'edge'};
  }
  if(col<row.cells.length-1)return move(blocks,id,row.cells[col+1].id,'right',newId);
  const after=list[at+1];
  return row.cells.length===1&&after?move(blocks,id,after.cells[0].id,'left',newId):{ok:false,reason:'edge'};
 }
 return {MAX_COLUMNS,rows,rowOf,tidy,check,move,nudge};
})();
if(typeof module!=='undefined')module.exports=LayoutModel;
