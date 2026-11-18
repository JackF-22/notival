// Draws what you grow in class. Every plant is a pure function of its seed, how much you focused (growth, 0..1) and how
// much you stayed (density, 0..1): the same inputs always give the same plant. Growth is continuous, so a plant never
// jumps; leaves unfurl, fruit swells and ripens. Time away shows as sparse foliage and dry leaves on the bed.
const GardenArt=(()=>{
 const random=seed=>{let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
 const clamp=(v,lo=0,hi=1)=>Math.min(hi,Math.max(lo,v));
 const ease=t=>t*t*(3-2*t);
 const part=(g,from,to)=>ease(clamp((g-from)/(to-from)));      // 0 until `from`, 1 from `to`, smooth between
 const fmt=n=>Math.round(n*10)/10;
 const GROUND=84;                                                 // the top of the soil
 const hex=n=>[n>>16&255,n>>8&255,n&255];
 const mix=(a,b,t)=>{const [r1,g1,b1]=hex(a),[r2,g2,b2]=hex(b);return '#'+[r1+(r2-r1)*t,g1+(g2-g1)*t,b1+(b2-b1)*t].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')};
 let serial=0;

 // ── Shapes ───────────────────────────────────────────────────────────────────
 // A leaf growing from (x,y), pointing `angle` degrees from straight up. Dark at the base, light at the tip.
 const leaf=(x,y,angle,len,wid,fill='url(#L)',vein=true)=>len<.4?'':
  `<g transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(angle)})"><path d="M0 0C${fmt(wid)} ${fmt(-len*.2)} ${fmt(wid*.8)} ${fmt(-len*.8)} 0 ${fmt(-len)}C${fmt(-wid*.8)} ${fmt(-len*.8)} ${fmt(-wid)} ${fmt(-len*.2)} 0 0Z" fill="${fill}"/>${vein?`<path d="M0 -.4L0 ${fmt(-len*.82)}" stroke="#fff" stroke-opacity=".28" stroke-width=".45" stroke-linecap="round"/>`:''}</g>`;
 const stem=(x1,y1,cx,cy,x2,y2,w,color='#4d9a52')=>`<path d="M${fmt(x1)} ${fmt(y1)}Q${fmt(cx)} ${fmt(cy)} ${fmt(x2)} ${fmt(y2)}" fill="none" stroke="${color}" stroke-width="${fmt(w)}" stroke-linecap="round"/>`;
 const dot=(x,y,r,fill,extra='')=>r<.2?'':`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="${fill}" ${extra}/>`;
 // Dry leaves on the bed: what a drifting class leaves behind.
 const litter=(g,d,rand)=>{
  let out='';const n=Math.round((1-d)*g*7);
  for(let i=0;i<n;i++)out+=`<ellipse cx="${fmt(50+(rand()-.5)*50)}" cy="${fmt(GROUND+.9+rand()*1.6)}" rx="${fmt(1.4+rand())}" ry=".7" fill="${mix(0xb08a4a,0x8a6a38,rand())}" opacity=".85" transform="rotate(${fmt((rand()-.5)*50)} 50 ${GROUND})"/>`;
  return out;
 };

 // The raised bed every plant sits in, with the front panel showing the soil.
 const bed=()=>`<ellipse cx="50" cy="97.6" rx="36" ry="2.2" fill="#000" opacity=".09"/>`+
  `<path d="M19 ${GROUND+2.5}a2.5 2.5 0 0 1 2.5-2.5h57a2.5 2.5 0 0 1 2.5 2.5v9.5a2.5 2.5 0 0 1-2.5 2.5h-57a2.5 2.5 0 0 1-2.5-2.5z" fill="url(#S)"/>`+
  `<path d="M19 ${GROUND+2.5}a2.5 2.5 0 0 1 2.5-2.5h57a2.5 2.5 0 0 1 2.5 2.5v.6h-62z" fill="#a98560"/>`+
  `<path d="M24 ${GROUND+5.2}h3M33 ${GROUND+8}h2.4M66 ${GROUND+6}h3.2M73 ${GROUND+9.4}h2.4M46 ${GROUND+10}h3" stroke="#000" stroke-opacity=".12" stroke-width="1" stroke-linecap="round"/>`;

 const defs=id=>`<defs>
  <linearGradient id="S${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b6b4a"/><stop offset="1" stop-color="#5f4631"/></linearGradient>
  <linearGradient id="L${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#3f8a4c"/><stop offset="1" stop-color="#86c46e"/></linearGradient>
  <linearGradient id="P${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f2a900"/><stop offset="1" stop-color="#ffd84a"/></linearGradient>
  <linearGradient id="C${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f59a3a"/><stop offset="1" stop-color="#e27a1c"/></linearGradient>
 </defs>`;

 // ── Seed and sprout: the same for everything, fading out as the real plant takes over ──
 function sprout(g,rand){
  const h=5+clamp(g/.12)*10,lean=(rand()-.5)*3,top=GROUND-h,size=2.4+clamp(g/.12)*3.2;
  return stem(50,GROUND,50,GROUND-h*.55,50+lean,top,1.5)+leaf(50+lean,top+1.5,-62,size*1.5,size*.85)+leaf(50+lean,top+1.5,62,size*1.5,size*.85);
 }
 const seedShape=()=>`<ellipse cx="50" cy="${GROUND-.4}" rx="3.2" ry="1.9" fill="#8a6540"/><ellipse cx="49" cy="${GROUND-1}" rx="1.3" ry=".7" fill="#c9a56a" opacity=".8"/>`;

 // ── Species ──────────────────────────────────────────────────────────────────
 const species={
  sunflower(g,d,rand){
   const top=GROUND-(10+52*Math.pow(g,.85)),lean=(rand()-.5)*5*part(g,.3,1),hx=50+lean;
   let out=stem(50,GROUND,50-lean*.3,(GROUND+top)/2,hx,top,1.7+g*1.6,'#559e55');
   const leaves=2+Math.round(d*3);
   for(let i=0;i<leaves;i++){
    const f=.22+i*.15,side=i%2?1:-1,at=part(g,i*.07,i*.07+.22),y=GROUND-(GROUND-top)*f,x=50+(hx-50)*f*f;
    out+=leaf(x,y,side*(62-i*5),(5+g*10)*at,(3+g*4.2)*at);
   }
   const open=part(g,.68,1),bud=part(g,.4,.62),R=2+bud*2+open*2.4;
   if(g>.4){
    const petals=14,len=2+open*7.2,wid=1.2+open*1.6;
    out+=`<g transform="translate(${fmt(hx)} ${fmt(top)}) rotate(${fmt(lean*2.4)})">`;
    out+=leaf(0,R*.5,0,0,0);
    for(let i=0;i<petals;i++)out+=`<ellipse cx="0" cy="${fmt(-(R+len*.45))}" rx="${fmt(wid)}" ry="${fmt(len*.55)}" fill="url(#P)" opacity="${fmt(.55+open*.45)}" transform="rotate(${fmt(i*360/petals+(i%2)*4)})"/>`;
    out+=dot(0,0,R,'#6b4423')+dot(0,0,R*.62,'#4a2d17',`opacity=".9"`);
    if(open>.4)for(let i=0;i<10;i++){const a=i*2.4,r=Math.sqrt(i/10)*R*.82;out+=dot(Math.cos(a)*r,Math.sin(a)*r,.45,'#c9a24a','opacity=".8"')}
    if(open<.5)out+=`<path d="M${fmt(-R)} ${fmt(R*.2)}Q0 ${fmt(R*1.5)} ${fmt(R)} ${fmt(R*.2)}" fill="none" stroke="#4d9a52" stroke-width="1.6" stroke-linecap="round" opacity="${fmt(1-open*2)}"/>`;
    out+='</g>';
   }
   return out;
  },
  tomato(g,d,rand){
   const top=GROUND-(10+50*Math.pow(g,.85));let out='';
   if(g>.2)out+=`<line x1="58" y1="${GROUND}" x2="58" y2="${fmt(GROUND-56*part(g,.1,.6))}" stroke="#cfae78" stroke-width="1.3" stroke-linecap="round"/>`;
   const lean=(rand()-.5)*5;
   out+=stem(50,GROUND,49+lean*.3,(GROUND+top)/2,51+lean,top,1.7+g*.9);
   const branches=3+Math.round(d*2),spots=[];
   for(let j=0;j<branches;j++){
    const f=.2+j*(.7/branches),side=j%2?1:-1,y=GROUND-(GROUND-top)*f,x=50+(f-.5)*2*.8,at=part(g,j*.08,j*.08+.3),L=(8+g*5)*at;
    const ex=x+side*L,ey=y-L*.35;
    out+=stem(x,y,x+side*L*.5,y-L*.1,ex,ey,.9);
    const wobble=(rand()-.5)*16;
    for(const a of [-50,-12,28,64])out+=leaf(ex,ey,side*(a+side*30)+wobble,(4.2+g*3)*at,(2.1+g)*at);
    if(j>0)spots.push({x:x+side*L*.55,y:y-L*.1,side,j});
    if(j>=1&&g>.34){const fl=part(g,.34,.46)*(1-part(g,.58,.72));out+=dot(ex+side*1.5,ey-1,1.5*fl,'#ffd84a')+dot(ex+side*1.5,ey-1,.6*fl,'#e79a00')}
   }
   const count=1+Math.round(d*3);
   spots.slice(0,count+1).forEach((s,k)=>{
    const grow=part(g,.52+k*.04,.8+k*.03),r=(1+grow*3.4)*(grow>0?1:0),ripe=part(g,.7+k*.03,1);
    if(r<.3)return;
    const color=ripe<.5?mix(0x86b94f,0xf0a030,ripe*2):mix(0xf0a030,0xe0453a,(ripe-.5)*2),cy=s.y+2.6+r;
    out+=`<path d="M${fmt(s.x)} ${fmt(s.y)}L${fmt(s.x)} ${fmt(cy-r)}" stroke="#4d9a52" stroke-width=".7"/>`;
    out+=dot(s.x,cy,r,color)+`<ellipse cx="${fmt(s.x-r*.35)}" cy="${fmt(cy-r*.35)}" rx="${fmt(r*.28)}" ry="${fmt(r*.18)}" fill="#fff" opacity=".4" transform="rotate(-30 ${fmt(s.x-r*.35)} ${fmt(cy-r*.35)})"/>`;
    out+=leaf(s.x,cy-r*.85,-50,r*.9,r*.4,'#3f8a4c',false)+leaf(s.x,cy-r*.85,50,r*.9,r*.4,'#3f8a4c',false);
   });
   return out;
  },
  carrot(g,d,rand){
   let out='';const fronds=2+Math.round(part(g,.05,.8)*(2+d*3));
   for(let i=0;i<fronds;i++){
    const t=fronds===1?0:i/(fronds-1)-.5,ang=t*86+(rand()-.5)*10,len=(8+g*30)*(.78+rand()*.22)*part(g,.03+i*.02,.4+i*.03);
    if(len<1)continue;
    const rad=ang*Math.PI/180,x2=50+Math.sin(rad)*len*.7,y2=GROUND-Math.cos(rad)*len;
    out+=stem(50+t*3,GROUND,50+Math.sin(rad)*len*.2,GROUND-len*.55,x2,y2,.8,'#4f9d52');
    for(let m=1;m<=4;m++){
     const f=.25+m*.18,bx=50+t*3+(x2-50-t*3)*f*f*1.2,by=GROUND-(GROUND-y2)*f,sz=(3.2+g*3.4)*(1-m*.1)*clamp(len/12);
     out+=leaf(bx,by,ang-48,sz,sz*.38,'#5fae5a',false)+leaf(bx,by,ang+48,sz,sz*.38,'#5fae5a',false);
    }
    out+=leaf(x2,y2,ang,(3.4+g*3.2)*clamp(len/12),1.2,'#6cbc62',false);
   }
   const gr=part(g,.12,1),w=1.1+gr*4.2,L=1+gr*10.4,shoulder=part(g,.38,.7);
   const root=`<path d="M${fmt(50-w)} ${GROUND+1.2}Q${fmt(50-w*.9)} ${fmt(GROUND+1+L*.6)} 50 ${fmt(GROUND+1.2+L)}Q${fmt(50+w*.9)} ${fmt(GROUND+1+L*.6)} ${fmt(50+w)} ${GROUND+1.2}Z" fill="url(#C)"/>`+
    (gr>.35?`<path d="M${fmt(50-w*.7)} ${fmt(GROUND+3+L*.2)}h${fmt(w*.7)}M${fmt(50+w*.1)} ${fmt(GROUND+5.5+L*.2)}h${fmt(w*.55)}" stroke="#b85d10" stroke-opacity=".5" stroke-width=".5" stroke-linecap="round"/>`:'');
   // The root lives in the soil, so it is drawn after the bed (see `after`).
   return {above:out+(shoulder>0?`<ellipse cx="50" cy="${GROUND}" rx="${fmt(w*.85)}" ry="${fmt(1.9*shoulder)}" fill="#f08a24"/>`:''),front:root};
  },
  strawberry(g,d,rand){
   let out='';const stalks=3+Math.round(d*2);
   for(let i=0;i<stalks;i++){
    const t=i/(stalks-1)-.5,ang=t*118+(rand()-.5)*14,at=part(g,.04+i*.03,.38+i*.03),len=(8+g*18)*at;
    if(len<1)continue;
    const rad=ang*Math.PI/180,x2=50+Math.sin(rad)*len,y2=GROUND-2-Math.cos(rad)*len*.8;
    out+=stem(50,GROUND,50+Math.sin(rad)*len*.4,GROUND-len*.8,x2,y2,.9,'#5aa356');
    const s=(5.4+g*5.4)*at;
    for(const a of [-38,0,38])out+=leaf(x2,y2,ang+a,s,s*.62,'url(#L)');
   }
   const bloom=part(g,.38,.5)*(1-part(g,.66,.82));
   if(bloom>.05)for(const k of [-1,1]){
    const x=50+k*9,y=GROUND-9-bloom*3;
    out+=stem(50,GROUND,50+k*3,GROUND-7,x,y,.5)+[0,72,144,216,288].map(a=>`<ellipse cx="${fmt(x)}" cy="${fmt(y-1.7*bloom)}" rx="${fmt(1.2*bloom)}" ry="${fmt(1.7*bloom)}" fill="#fff" transform="rotate(${a} ${fmt(x)} ${fmt(y)})"/>`).join('')+dot(x,y,.9*bloom,'#f2b81c');
   }
   const berries=2+Math.round(d*3);
   for(let k=0;k<berries;k++){
    const side=k%2?1:-1,x=50+side*(8+Math.floor(k/2)*7+rand()*2),grow=part(g,.6+k*.03,.84+k*.02),r=1+grow*3.1,ripe=part(g,.72+k*.03,1);
    if(grow<.05)continue;
    const color=ripe<.5?mix(0xe8f0c8,0xf4a2a0,ripe*2):mix(0xf4a2a0,0xd8283c,(ripe-.5)*2),y=GROUND-r*.7;
    out+=stem(50,GROUND-1,50+side*3,GROUND-7,x,y-r*.7,.5)+
     `<path d="M${fmt(x)} ${fmt(y+r*1.05)}C${fmt(x-r*1.3)} ${fmt(y+r*.4)} ${fmt(x-r*1.1)} ${fmt(y-r*.9)} ${fmt(x)} ${fmt(y-r*.8)}C${fmt(x+r*1.1)} ${fmt(y-r*.9)} ${fmt(x+r*1.3)} ${fmt(y+r*.4)} ${fmt(x)} ${fmt(y+r*1.05)}Z" fill="${color}"/>`+
     leaf(x,y-r*.7,-60,r*.9,r*.4,'#3f8a4c',false)+leaf(x,y-r*.7,60,r*.9,r*.4,'#3f8a4c',false);
    if(ripe>.4)for(const [sx,sy] of [[-.4,0],[.4,-.2],[0,.5],[-.2,-.5]])out+=dot(x+sx*r,y+sy*r,.3,'#ffe27a','opacity=".85"');
   }
   return out;
  },
  lettuce(g,d,rand){
   let out='';const layers=4;
   for(let L=0;L<layers;L++){
    const at=part(g,L*.16,L*.16+.34),n=6+L,color=mix(0x4f9a4c,0xc4e68a,L/(layers-1));
    for(let k=0;k<n;k++){
     const t=n===1?0:k/(n-1)-.5,ang=t*(150-L*28)+(rand()-.5)*10,len=(7+g*17)*(1-L*.16)*(.82+rand()*.18)*at;
     if(len<.6)continue;
     out+=leaf(50+t*(8-L*1.6),GROUND-L*1.1,ang,len,len*.62,`url(#T${L})`,false);
    }
   }
   const head=part(g,.62,1);
   if(head>0)out+=`<ellipse cx="50" cy="${fmt(GROUND-3-head*4)}" rx="${fmt(3+head*5)}" ry="${fmt(2+head*6)}" fill="#bfe58a"/><path d="M50 ${fmt(GROUND-2)}Q${fmt(50-head*3)} ${fmt(GROUND-5-head*4)} 50 ${fmt(GROUND-3-head*9)}M50 ${fmt(GROUND-2)}Q${fmt(50+head*3)} ${fmt(GROUND-5-head*4)} 50 ${fmt(GROUND-3-head*9)}" stroke="#8fc15c" stroke-width=".5" fill="none" opacity=".8"/>`;
   return out;
  },
 };

 // The frame zooms out as the plant grows, smoothly, so a seedling is still worth looking at.
 const frame=g=>{const side=68+32*part(g,0,.75);return `${fmt(50-side/2)} ${fmt(100-side)} ${fmt(side)} ${fmt(side)}`};
 const LABELS={tree:'An oak tree',sunflower:'A sunflower',tomato:'A tomato plant',carrot:'A carrot',strawberry:'A strawberry plant',lettuce:'A lettuce'};

 // `still` skips the sway so a grid of many plants is calm and cheap.
 function svg({plant='tree',seed=1,growth=1,density=1,color},{size=120,label='',still=false}={}){
  const g=clamp(growth),d=clamp(density),rand=random(seed),id=++serial;
  const comeIn=part(g,.04,.08),goOut=1-part(g,.065,.09);                    // the plant arrives before the seedling leaves
  let above='',front='';
  if(g<.02)above=seedShape();
  else{
   if(g<.09)above+=`<g opacity="${fmt(goOut)}">${sprout(g,random(seed+7))}</g>`;
   if(g>=.04){
    // The oak is the original tree drawing, set down on this bed.
    const drawn=plant==='tree'?(g>=.07?`<g transform="translate(50 ${GROUND}) scale(.8) translate(-50 ${-TreeArt.GROUND})">${TreeArt.body({seed,growth:g,density:d,color},{shadow:false})}</g>`:''):species[plant]?.(g,d,rand);
    const result=drawn&&typeof drawn==='object'?drawn:{above:drawn||''};
    above+=`<g opacity="${fmt(comeIn)}">${result.above}</g>`;front=result.front||'';
   }
  }
  const sway=still?'':` class="plant-sway" style="animation-delay:-${fmt(Date.now()/1000%9)}s"`;
  const markup=defs(id)+bed()+`<g${sway}>${above+litter(g,d,rand)}</g>`+front;
  return `<svg viewBox="${frame(g)}" width="${size}" height="${size}" role="img" aria-label="${label||LABELS[plant]||'A plant'}" xmlns="http://www.w3.org/2000/svg">${scope(markup,id,plant)}</svg>`;
 }

 // Gradient ids must be unique per drawing, because many are on the page at once.
 function scope(markup,id,plant){
  let out=markup.replace(/url\(#([SLPC])\)/g,`url(#$1${id})`).replace(/url\(#T(\d)\)/g,`url(#T$1_${id})`);
  if(plant==='lettuce')out=out.replace('</defs>',[0,1,2,3].map(L=>`<linearGradient id="T${L}_${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${mix(0x3a7e45,0x9ecf6a,L/3)}"/><stop offset="1" stop-color="${mix(0x6cb15a,0xd4f29a,L/3)}"/></linearGradient>`).join('')+'</defs>');
  return out;
 }
 return {svg,frame};
})();
if(typeof module!=='undefined')module.exports=GardenArt;
