/* Shared by subject creation and customization. The icons themselves live in icon-library.js. */
const ProjectIcons=(()=>{
 function create(value,onchange,input=null){
  const section=document.createElement('div');section.className='project-icon-picker';section.setAttribute('role','group');section.setAttribute('aria-label','Project icons');
  const search=document.createElement('input');search.type='search';search.placeholder='Search icons: biology, music, law…';search.setAttribute('aria-label','Search icons');search.className='icon-search';
  const category=document.createElement('select');category.setAttribute('aria-label','Icon category');for(const name of ['All icons',...IconLibrary.names()]){const option=document.createElement('option');option.textContent=name;category.append(option)}
  const grid=document.createElement('div');grid.className='project-choices icon-choices expanded-icon-choices';
  const custom=input||document.createElement('input');custom.value=value;custom.maxLength=12;if(!input){custom.setAttribute('aria-label','Custom subject icon');custom.placeholder='Or enter your own emoji';section.append(custom)}
  function draw(){
   grid.replaceChildren();
   const icons=IconLibrary.search(search.value).filter(icon=>category.value==='All icons'||icon.group===category.value);
   for(const {emoji,label} of icons){const button=document.createElement('button');button.type='button';button.textContent=emoji;button.title=label;button.setAttribute('aria-label',label);const chosen=custom.value.trim()===emoji;button.setAttribute('aria-pressed',String(chosen));button.classList.toggle('selected',chosen);button.onclick=()=>{custom.value=emoji;onchange(emoji);draw()};grid.append(button)}
   if(!icons.length){const none=document.createElement('p');none.className='icon-none';none.textContent='No icons match. You can type any emoji below.';grid.append(none)}
  }
  custom.addEventListener('input',()=>{onchange(custom.value.trim());draw()});search.addEventListener('input',draw);category.onchange=draw;
  const filters=document.createElement('div');filters.className='icon-filters';filters.append(search,category);
  section.prepend(filters,grid);draw();return section;
 }
 return {create};
})();
