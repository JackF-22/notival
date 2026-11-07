// Draws a tree for a class. The same seed always gives the same tree; focus decides how big it is,
// and how much you stayed decides how full: a drifting class leaves bare branches and fallen leaves.
const TreeArt=(()=>{
 const random=seed=>{let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
 const GROUND=92;

 function hsl(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec(hex||'');const n=m?parseInt(m[1],16):0x4a9d6f;
  const r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;
  let h=0,s=0;
  if(d){s=d/(1-Math.abs(2*l-1));h=max===r?((g-b)/d+(g<b?6:0)):max===g?(b-r)/d+2:(r-g)/d+4;h*=60}
  return {h,s:Math.max(.35,Math.min(.7,s)),l:Math.max(.3,Math.min(.5,l))};
 }

 // The tree as shapes: {branches:[{x1,y1,x2,y2,w}], leaves:[{x,y,r,l}], fallen:[{x,y,r,l}]}.
 function build({seed=1,growth=1,density=1}){
  const rand=random(seed),branches=[],leaves=[],fallen=[];
  const g=Math.max(0,Math.min(1,growth)),d=Math.max(0,Math.min(1,density));
  if(g<.02)return {shape:'seed',branches,leaves,fallen};
  if(g<.07){
   // A sprout: a short stem and two leaves.
   branches.push({x1:50,y1:GROUND,x2:50,y2:GROUND-8-g*80,w:1.6});
   const top=GROUND-8-g*80;
   leaves.push({x:46,y:top+1,r:3.2,l:0},{x:54,y:top-1,r:3.2,l:.08});
   return {shape:'sprout',branches,leaves,fallen};
  }
  const depth=Math.min(5,1+Math.floor(g*4.6)),trunk=8+g*16.5,spread=.42+rand()*.18,tip=2+g*2.6;
  const grow=(x,y,angle,length,width,level)=>{
   const x2=x+Math.sin(angle)*length,y2=y-Math.cos(angle)*length;
   branches.push({x1:x,y1:y,x2,y2,w:width});
   if(level>0){
    const kids=level>2&&rand()<.25?3:2;
    for(let i=0;i<kids;i++){
     const side=kids===3?i-1:(i?1:-1);
     grow(x2,y2,angle+side*(spread+(rand()-.5)*.25)+(rand()-.5)*.1,length*(.7+rand()*.08),Math.max(.5,width*.68),level-1);
    }
    // Some leaves along the way, fewer on a sparse tree.
    if(level<=2&&rand()<d*.6)leaves.push({x:x2+(rand()-.5)*3,y:y2+(rand()-.5)*3,r:tip*(.7+rand()*.3),l:(rand()-.5)*.1});
   }else{
    const count=Math.max(0,Math.round(d*3.2+rand()*.8-.2));
    for(let i=0;i<count;i++)leaves.push({x:x2+(rand()-.5)*5,y:y2+(rand()-.5)*5,r:tip*(.75+rand()*.5),l:(rand()-.5)*.12});
   }
  };
  grow(50,GROUND,(rand()-.5)*.06,trunk,Math.max(1.4,2+g*3.2),depth);
  // Time away shows as leaves on the ground.
  const drop=Math.round((1-d)*9*g);
  for(let i=0;i<drop;i++)fallen.push({x:50+(rand()-.5)*44,y:GROUND+1+rand()*3,r:1.1+rand()*.9,l:(rand()-.5)*.1});
  return {shape:'tree',branches,leaves,fallen};
 }

 function svg(options,{size=120,label=''}={}){
  const shape=build(options),{h,s,l}=hsl(options.color),fmt=n=>Math.round(n*10)/10;
  const fill=lightness=>`hsl(${Math.round(h)} ${Math.round(s*100)}% ${Math.round(Math.max(.18,Math.min(.7,l+lightness))*100)}%)`;
  const parts=[`<ellipse cx="50" cy="${GROUND+2}" rx="30" ry="3.2" fill="#8a7a5c" opacity=".22"/>`];
  if(shape.shape==='seed')parts.push(`<ellipse cx="50" cy="${GROUND-1}" rx="6" ry="3" fill="#7a5a3c"/><ellipse cx="50" cy="${GROUND-2.5}" rx="2.2" ry="1.4" fill="#a9824f"/>`);
  for(const b of shape.branches)parts.push(`<line x1="${fmt(b.x1)}" y1="${fmt(b.y1)}" x2="${fmt(b.x2)}" y2="${fmt(b.y2)}" stroke="#7a5a3c" stroke-width="${fmt(b.w)}" stroke-linecap="round"/>`);
  for(const f of shape.fallen)parts.push(`<circle cx="${fmt(f.x)}" cy="${fmt(f.y)}" r="${fmt(f.r)}" fill="${fill(f.l-.08)}" opacity=".8"/>`);
  for(const leaf of shape.leaves)parts.push(`<circle cx="${fmt(leaf.x)}" cy="${fmt(leaf.y)}" r="${fmt(leaf.r)}" fill="${fill(leaf.l)}" opacity=".92"/>`);
  // Young trees are small; zoom the frame so a sprout is still something to look at.
  const g=Math.max(0,Math.min(1,options.growth??1)),frame=g<.07?'28 56 44 44':g<.3?'15 32 70 70':'0 0 100 100';
  return `<svg viewBox="${frame}" width="${size}" height="${size}" role="img" aria-label="${label||'A tree'}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
 }
 return {build,svg};
})();
if(typeof module!=='undefined')module.exports=TreeArt;
