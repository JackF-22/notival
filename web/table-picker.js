/* A Foliose-style size grid, with pointer drawing and keyboard selection. */
(()=>{
 const dialog=document.createElement('dialog');dialog.className='table-picker';dialog.setAttribute('aria-labelledby','table-picker-title');
 dialog.innerHTML='<div class="table-picker-heading"><h2 id="table-picker-title">Insert table</h2><output aria-live="polite"></output></div><div class="table-size-grid" role="group" aria-label="Choose table size"></div><p>Move or drag across the grid to choose a size.</p><form><div class="table-size-fields"><label>Columns<input type="number" min="1" max="12" value="3" required aria-label="Table columns"></label><label>Rows<input type="number" min="1" max="50" value="3" required aria-label="Table rows"></label></div><div class="table-picker-actions"><button type="button">Cancel</button><button type="submit" class="primary">Insert table</button></div></form>';document.body.append(dialog);
 const grid=dialog.querySelector('.table-size-grid'),output=dialog.querySelector('output'),rowInput=dialog.querySelector('[aria-label="Table rows"]'),columnInput=dialog.querySelector('[aria-label="Table columns"]');let rows=0,columns=0,insert=null,dragging=false,origin=null,quiet=false;
 function update(r,c){rows=r;columns=c;if(r&&c){rowInput.value=rows;columnInput.value=columns;output.textContent=columns+' × '+rows}else output.textContent='Choose a size';for(const cell of grid.children){const selected=+cell.dataset.row<=rows&&+cell.dataset.column<=columns;cell.classList.toggle('is-selected',selected);cell.setAttribute('aria-pressed',String(selected))}}
 function commit(){if(!insert)return;const callback=insert,size={rows:rows||+rowInput.value||3,columns:columns||+columnInput.value||3};insert=null;dialog.close();callback(size)}
 for(let r=1;r<=8;r++)for(let c=1;c<=8;c++){const cell=document.createElement('button');cell.type='button';cell.dataset.row=r;cell.dataset.column=c;cell.setAttribute('aria-label',c+' columns, '+r+' rows');cell.onpointerenter=()=>{if(!dragging)update(r,c)};cell.onclick=e=>{if(e.detail===0){update(r,c);commit()}};cell.onfocus=()=>{if(!quiet)update(r,c)};grid.append(cell)}
 grid.onpointerdown=e=>{if(e.button!==0)return;const cell=e.target.closest('button');if(!cell)return;e.preventDefault();dragging=true;grid.setPointerCapture(e.pointerId);update(+cell.dataset.row,+cell.dataset.column)};
 function cellAt(e){const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('.table-size-grid button');return cell&&grid.contains(cell)?cell:null}
 grid.onpointermove=e=>{if(!dragging)return;const cell=cellAt(e);if(cell)update(+cell.dataset.row,+cell.dataset.column)};
 grid.onpointerup=e=>{if(!dragging)return;const cell=cellAt(e);dragging=false;if(grid.hasPointerCapture(e.pointerId))grid.releasePointerCapture(e.pointerId);if(cell){update(+cell.dataset.row,+cell.dataset.column);commit()}};
 grid.onpointercancel=grid.onlostpointercapture=()=>dragging=false;
 grid.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();commit();return}const directions={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]};if(directions[e.key]){e.preventDefault();const [r,c]=directions[e.key];const cell=document.activeElement.closest?.('.table-size-grid button');const row=cell?+cell.dataset.row:1,column=cell?+cell.dataset.column:1;const nr=Math.max(1,Math.min(8,row+r)),nc=Math.max(1,Math.min(8,column+c));update(nr,nc);grid.children[(nr-1)*8+nc-1].focus()}};
 // WebKit skips buttons when Tab is pressed, so walk the whole dialog in order ourselves: every grid cell, then the fields and buttons.
 dialog.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||e.altKey||e.ctrlKey||e.metaKey)return;
  const order=[...grid.children,columnInput,rowInput,...dialog.querySelectorAll('.table-picker-actions button')],index=order.indexOf(document.activeElement);
  e.preventDefault();order[(index+(e.shiftKey?-1:1)+order.length)%order.length].focus();
 });
 for(const input of [rowInput,columnInput])input.oninput=()=>{if(rowInput.validity.valid&&columnInput.validity.valid&&rowInput.value&&columnInput.value)update(+rowInput.value,+columnInput.value)};
 dialog.querySelector('form').onsubmit=e=>{e.preventDefault();if(rowInput.checkValidity()&&columnInput.checkValidity()){update(+rowInput.value,+columnInput.value);commit()}};
 dialog.querySelector('.table-picker-actions [type=button]').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{if(dialog.open)return;insert=null;dragging=false;if(origin?.isConnected&&!document.querySelector('dialog[open]'))origin.focus()});
 window.marginChooseTable=callback=>{if(dialog.open)return;insert=callback;origin=RichEditor.active()?.editor;rowInput.value=columnInput.value=3;update(0,0);quiet=true;dialog.showModal();grid.children[0].focus();quiet=false};
})();
