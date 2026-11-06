/* Shared by subject creation and customization. */
const ProjectIcons=(()=>{
 const groups={
  'Study & organization':[['📁','Folder'],['📚','Books'],['📖','Open book'],['🎓','Graduation cap'],['📝','Notes'],['✏️','Pencil'],['📓','Notebook'],['📌','Pin'],['🗂️','Files'],['📋','Clipboard'],['🗓️','Calendar'],['🎯','Target']],
  'Science & nature':[['🔬','Microscope'],['🧬','DNA'],['🧪','Test tube'],['⚗️','Chemistry'],['🔭','Telescope'],['⚛️','Atom'],['🧲','Magnet'],['⚡','Electricity'],['🌱','Plant'],['🌿','Leaf'],['🦠','Microbiology'],['🧠','Brain'],['🫀','Heart'],['🦴','Anatomy'],['🌍','Earth'],['🌋','Volcano'],['🌊','Ocean'],['🪐','Planet']],
  'Math & technology':[['🧮','Abacus'],['📐','Geometry'],['📏','Ruler'],['♾️','Infinity'],['📊','Bar chart'],['📈','Growth chart'],['💻','Computer'],['⌨️','Keyboard'],['🤖','Robot'],['⚙️','Engineering'],['🔧','Wrench'],['🔌','Electronics'],['💾','Data'],['🛰️','Satellite'],['🏗️','Construction']],
  'Humanities & society':[['📜','History'],['🏛️','Classics'],['🏺','Archaeology'],['🗺️','Geography'],['🧭','Compass'],['⚖️','Law'],['🗳️','Politics'],['💬','Communication'],['🗣️','Language'],['🌐','Global studies'],['💭','Philosophy'],['💡','Idea'],['💼','Business'],['💰','Economics'],['🤝','Collaboration']],
  'Arts & creativity':[['🎨','Art'],['🖌️','Painting'],['🎭','Theater'],['🎵','Music'],['🎹','Piano'],['🎸','Guitar'],['🎻','Violin'],['🎬','Film'],['📷','Photography'],['✍️','Writing'],['🧵','Textiles'],['💃','Dance']],
  'Life & interests':[['⭐','Star'],['🚀','Rocket'],['☀️','Sun'],['🌙','Moon'],['🔥','Fire'],['☕','Coffee'],['🏃','Running'],['⚽','Soccer'],['🏀','Basketball'],['♟️','Chess'],['🎮','Games'],['🍎','Nutrition'],['🏠','Home'],['✈️','Travel'],['🛠️','Making']]
 };
 function create(value,onchange,input=null){
  const section=document.createElement('div');section.className='project-icon-picker';section.setAttribute('role','group');section.setAttribute('aria-label','Project icons');
  const category=document.createElement('select');category.setAttribute('aria-label','Icon category');for(const name of ['All icons',...Object.keys(groups)]){const option=document.createElement('option');option.textContent=name;category.append(option)}
  const grid=document.createElement('div');grid.className='project-choices icon-choices expanded-icon-choices';
  const custom=input||document.createElement('input');custom.value=value;custom.maxLength=12;if(!input){custom.setAttribute('aria-label','Custom subject icon');custom.placeholder='Or enter your own emoji';section.append(custom)}
  function draw(){grid.replaceChildren();for(const [group,icons] of Object.entries(groups)){if(category.value!=='All icons'&&category.value!==group)continue;for(const [emoji,label] of icons){const button=document.createElement('button');button.type='button';button.textContent=emoji;button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(custom.value.trim()===emoji));button.classList.toggle('selected',custom.value.trim()===emoji);button.onclick=()=>{custom.value=emoji;onchange(emoji);draw()};grid.append(button)}}}
  custom.addEventListener('input',()=>{onchange(custom.value.trim());draw()});category.onchange=draw;section.prepend(category,grid);draw();return section;
 }
 return {create};
})();
