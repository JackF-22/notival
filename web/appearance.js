(() => {
 const palettes={Violet:['#635ad6','#b2aaff'],Ocean:['#2369a8','#83b9ef'],Forest:['#357449','#8eca9d'],Teal:['#137c78','#77cfca'],Rose:['#ad4266','#f29db8'],Graphite:['#515862','#bdc4ce']};
 let prefs;try{prefs=JSON.parse(localStorage.getItem('margin-appearance'))||{}}catch{prefs={}}
 const system=matchMedia('(prefers-color-scheme: dark)');
 // The native PDF header follows the same palette and day or night mode.
 function sendTheme(){
  try{
   const bridge=window.webkit?.messageHandlers?.margin;if(!bridge)return;
   // Palette values can be expressions like color-mix(), so ask the browser for the final colour of each.
   const probe=document.createElement('span');probe.style.cssText='position:absolute;visibility:hidden;pointer-events:none';document.body.append(probe);
   const hex=name=>{
    probe.style.color='';probe.style.color='var('+name+')';
    const value=getComputedStyle(probe).color,numbers=(value.match(/-?[\d.]+/g)||[]).map(Number);
    if(numbers.length<3)return '';
    const channel=/^color\(/.test(value)?numbers.slice(0,3).map(n=>Math.round(n*255)):numbers.slice(0,3).map(Math.round);
    return '#'+channel.map(n=>Math.max(0,Math.min(255,n)).toString(16).padStart(2,'0')).join('');
   };
   const message={type:'theme',background:hex('--bg'),ink:hex('--ink'),muted:hex('--muted'),line:hex('--line'),soft:hex('--soft'),accent:hex('--green'),dark:document.documentElement.dataset.appearance==='night'};
   probe.remove();bridge.postMessage(message);
  }catch{}
 }
 function apply(){const dark=prefs.mode==='night'||prefs.mode!=='day'&&system.matches;const root=document.documentElement;root.dataset.appearance=dark?'night':'day';root.style.setProperty('--green',(palettes[prefs.palette]||palettes.Violet)[dark?1:0]);try{localStorage.setItem('margin-appearance',JSON.stringify(prefs))}catch{}requestAnimationFrame(sendTheme)}
 const button=document.createElement('button');button.textContent='Appearance';button.title='Colors and day or night mode';document.querySelector('.header-actions').prepend(button);
 const dialog=document.createElement('dialog');dialog.className='appearance-dialog';document.body.append(dialog);
 button.textContent='◐';button.setAttribute('aria-label','Customize appearance');button.className='appearance-trigger';
 function gallery(){dialog.replaceChildren();const title=document.createElement('h2');title.textContent='Your space, your palette';dialog.append(title);const modes=document.createElement('div');modes.className='appearance-modes';for(const [mode,label] of [['system','◐ System'],['day','☀ Day'],['night','☾ Night']]){const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-pressed',String((prefs.mode||'system')===mode));b.onclick=()=>{prefs.mode=mode;apply();gallery()};modes.append(b)}dialog.append(modes);const grid=document.createElement('div');grid.className='theme-gallery';for(const [name,colors] of Object.entries(palettes)){const b=document.createElement('button');b.className='theme-preview';b.setAttribute('aria-pressed',String((prefs.palette||'Violet')===name));b.style.setProperty('--preview-accent',colors[0]);const preview=document.createElement('span');preview.className='mini-workspace';preview.innerHTML='<i></i><span><b></b><em></em><em></em><em></em></span>';preview.setAttribute('aria-hidden','true');const label=document.createElement('strong');label.textContent=name;b.append(preview,label);b.onclick=()=>{prefs.palette=name;apply();gallery()};grid.append(b)}dialog.append(grid);
  // Where Open PDF and Attach materials look for files.
  const sourceTitle=document.createElement('h3');sourceTitle.textContent='Choose files from';sourceTitle.className='file-source-title';dialog.append(sourceTitle);
  const sources=document.createElement('div');sources.className='appearance-modes file-source';
  const current=localStorage.getItem('notival-file-source')||'foliose';
  for(const [value,label,hint] of [['foliose','Foliose','Opens Foliose; double-click a file there'],['finder','Finder','The standard macOS file picker']]){
   const b=document.createElement('button');b.textContent=label;b.title=hint;b.setAttribute('aria-pressed',String(current===value));
   b.onclick=()=>{try{localStorage.setItem('notival-file-source',value)}catch{}if(window.webkit?.messageHandlers?.margin)window.webkit.messageHandlers.margin.postMessage({type:'setFileSource',value});gallery()};sources.append(b);
  }
  dialog.append(sources);const sourceNote=document.createElement('p');sourceNote.className='file-source-note';sourceNote.textContent=current==='foliose'?'Open PDF and Attach materials open Foliose. Double-click a file there to bring it into Notival. Falls back to Finder if Foliose is not installed.':'Open PDF and Attach materials use the standard Finder file picker.';dialog.append(sourceNote);
  const close=document.createElement('button');close.textContent='Done';close.className='primary';close.onclick=()=>dialog.close();dialog.append(close)}
 button.onclick=()=>{gallery();dialog.showModal()};system.addEventListener('change',apply);apply();window.addEventListener('load',()=>setTimeout(sendTheme,150));try{const saved=localStorage.getItem('notival-file-source');if(saved&&window.webkit?.messageHandlers?.margin)window.webkit.messageHandlers.margin.postMessage({type:'setFileSource',value:saved})}catch{}
})();
