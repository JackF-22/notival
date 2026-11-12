// A small 3D engine, just enough to draw a house: boxes, upright cylinders and cones, and spheres, with sunlight and soft
// shadows, procedural materials (wood boards, tile, carpet, fabric, grass), shiny highlights, translucent glass, fog, and a
// perspective or top-down camera. Written for Notival's memory palace; no libraries.
//
//   const mesh=new Mini3D.Mesh();  mesh.box(cx,y0,cz,w,h,d,'#hex',{rot,top,mat});  mesh.cylinder(cx,y0,cz,r,h,'#hex');
//   const view=Mini3D.create(canvas);  view.set('solid',mesh);  view.draw({view:matrix,proj:matrix,eye:[x,y,z],layers:['solid']});
const Mini3D=(()=>{
 // ── Matrices (column-major, like WebGL expects) ──────────────────────────────
 const multiply=(a,b)=>{const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s}return o};
 function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),o=new Float32Array(16);o[0]=f/aspect;o[5]=f;o[10]=(far+near)/(near-far);o[11]=-1;o[14]=2*far*near/(near-far);return o}
 function ortho(l,r,b,t,n,f){const o=new Float32Array(16);o[0]=2/(r-l);o[5]=2/(t-b);o[10]=-2/(f-n);o[12]=-(r+l)/(r-l);o[13]=-(t+b)/(t-b);o[14]=-(f+n)/(f-n);o[15]=1;return o}
 function lookAt(eye,target,up){
  let fx=target[0]-eye[0],fy=target[1]-eye[1],fz=target[2]-eye[2],fl=Math.hypot(fx,fy,fz)||1;fx/=fl;fy/=fl;fz/=fl;
  let sx=fy*up[2]-fz*up[1],sy=fz*up[0]-fx*up[2],sz=fx*up[1]-fy*up[0],sl=Math.hypot(sx,sy,sz)||1;sx/=sl;sy/=sl;sz/=sl;
  const ux=sy*fz-sz*fy,uy=sz*fx-sx*fz,uz=sx*fy-sy*fx,o=new Float32Array(16);
  o[0]=sx;o[4]=sy;o[8]=sz;o[1]=ux;o[5]=uy;o[9]=uz;o[2]=-fx;o[6]=-fy;o[10]=-fz;
  o[12]=-(sx*eye[0]+sy*eye[1]+sz*eye[2]);o[13]=-(ux*eye[0]+uy*eye[1]+uz*eye[2]);o[14]=fx*eye[0]+fy*eye[1]+fz*eye[2];o[15]=1;return o;
 }
 // A point through a view-projection matrix: {x,y} in -1..1, w>0 when it is in front of the camera.
 function transform(m,x,y,z){const w=m[3]*x+m[7]*y+m[11]*z+m[15];return {x:(m[0]*x+m[4]*y+m[8]*z+m[12])/w,y:(m[1]*x+m[5]*y+m[9]*z+m[13])/w,w}}
 function parse(hex,alpha=1){
  const n=parseInt(String(hex).replace('#','').slice(0,6),16);
  return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255,alpha];
 }
 // What a surface is made of: patterns drawn by the graphics card, so no pictures are needed.
 const MATERIAL={plain:0,wood:1,tile:2,carpet:3,paint:4,fabric:5,timber:6,rug:7,glass:8,grass:9,metal:10,ceramic:11,screen:12,leaf:13,brick:14,paper:15};

 // ── Geometry: triangles with a normal, a colour and a material each ──────────
 // (x y z, nx ny nz, r g b a, material)
 class Mesh{
  constructor(){this.data=[];this.count=0;this.mat=0}
  clear(){this.data=[];this.count=0}
  vertex(x,y,z,nx,ny,nz,c){this.data.push(x,y,z,nx,ny,nz,c[0],c[1],c[2],c[3],this.mat);this.count++}
  tri(a,b,c,n,colour){this.vertex(...a,...n,colour);this.vertex(...b,...n,colour);this.vertex(...c,...n,colour)}
  quad(a,b,c,d,n,colour){this.tri(a,b,c,n,colour);this.tri(a,c,d,n,colour)}
  // Draw something with a material, then put the old one back.
  using(mat,draw){const before=this.mat;if(mat!=null)this.mat=typeof mat==='string'?(MATERIAL[mat]??0):mat;draw();this.mat=before}
  // A box standing on y0, centred on (cx,cz), turned about the vertical axis by `rot` degrees around (px,pz).
  box(cx,y0,cz,w,h,d,colour,{rot=0,pivot=[cx,cz],alpha=1,top,bottom=false,mat}={}){
   this.using(mat,()=>{
    const base=parse(colour,alpha),t=top?parse(top,alpha):null,r=rot*Math.PI/180,cs=Math.cos(r),sn=Math.sin(r);
    const x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2,y1=y0+h;
    const at=(x,y,z)=>{const dx=x-pivot[0],dz=z-pivot[1];return [pivot[0]+dx*cs+dz*sn,y,pivot[1]-dx*sn+dz*cs]};
    const nrm=(x,y,z)=>[x*cs+z*sn,y,-x*sn+z*cs];
    this.quad(at(x0,y1,z1),at(x1,y1,z1),at(x1,y1,z0),at(x0,y1,z0),nrm(0,1,0),t||base);
    if(bottom)this.quad(at(x0,y0,z0),at(x1,y0,z0),at(x1,y0,z1),at(x0,y0,z1),nrm(0,-1,0),base);
    this.quad(at(x0,y0,z1),at(x1,y0,z1),at(x1,y1,z1),at(x0,y1,z1),nrm(0,0,1),base);
    this.quad(at(x1,y0,z0),at(x0,y0,z0),at(x0,y1,z0),at(x1,y1,z0),nrm(0,0,-1),base);
    this.quad(at(x1,y0,z1),at(x1,y0,z0),at(x1,y1,z0),at(x1,y1,z1),nrm(1,0,0),base);
    this.quad(at(x0,y0,z0),at(x0,y0,z1),at(x0,y1,z1),at(x0,y1,z0),nrm(-1,0,0),base);
   });
  }
  // An upright cylinder, or a cone / tapering pot when `topRadius` is different.
  cylinder(cx,y0,cz,radius,h,colour,{segments=14,alpha=1,top,rot=0,pivot=[cx,cz],topRadius=radius,mat,cap=true}={}){
   this.using(mat,()=>{
    const base=parse(colour,alpha),t=top?parse(top,alpha):base,y1=y0+h,r=rot*Math.PI/180,cs=Math.cos(r),sn=Math.sin(r);
    const at=(x,y,z)=>{const dx=x-pivot[0],dz=z-pivot[1];return [pivot[0]+dx*cs+dz*sn,y,pivot[1]-dx*sn+dz*cs]};
    const nrm=(x,y,z)=>[x*cs+z*sn,y,-x*sn+z*cs];
    const slope=(radius-topRadius)/Math.max(h,1e-6);
    for(let i=0;i<segments;i++){
     const a0=i/segments*Math.PI*2,a1=(i+1)/segments*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
     const p0=[cx+c0*radius,cz+s0*radius],p1=[cx+c1*radius,cz+s1*radius],q0=[cx+c0*topRadius,cz+s0*topRadius],q1=[cx+c1*topRadius,cz+s1*topRadius];
     // the side is shaded smoothly: each end carries its own normal (tilted for a cone)
     const n0=nrm(c0,slope,s0),n1=nrm(c1,slope,s1),A=at(p0[0],y0,p0[1]),Bv=at(p1[0],y0,p1[1]),Cv=at(q1[0],y1,q1[1]),Dv=at(q0[0],y1,q0[1]);
     this.vertex(...A,...n0,base);this.vertex(...Bv,...n1,base);this.vertex(...Cv,...n1,base);
     this.vertex(...A,...n0,base);this.vertex(...Cv,...n1,base);this.vertex(...Dv,...n0,base);
     if(cap&&topRadius>1e-4)this.tri(at(cx,y1,cz),at(q1[0],y1,q1[1]),at(q0[0],y1,q0[1]),nrm(0,1,0),t);
    }
   });
  }
  // A sphere (or an egg: give different radii).
  sphere(cx,cy,cz,radius,colour,{segments=12,rings=8,alpha=1,scaleY=1,mat}={}){
   this.using(mat,()=>{
    const c=parse(colour,alpha),pt=(a,b)=>{const x=Math.cos(a)*Math.sin(b),y=Math.cos(b),z=Math.sin(a)*Math.sin(b);return [[cx+x*radius,cy+y*radius*scaleY,cz+z*radius],[x,y/scaleY,z]]};
    for(let i=0;i<segments;i++)for(let j=0;j<rings;j++){
     const a0=i/segments*Math.PI*2,a1=(i+1)/segments*Math.PI*2,b0=j/rings*Math.PI,b1=(j+1)/rings*Math.PI;
     const p=[pt(a0,b0),pt(a1,b0),pt(a1,b1),pt(a0,b1)];
     if(j>0){this.vertex(...p[0][0],...p[0][1],c);this.vertex(...p[2][0],...p[2][1],c);this.vertex(...p[1][0],...p[1][1],c)}
     if(j<rings-1){this.vertex(...p[0][0],...p[0][1],c);this.vertex(...p[3][0],...p[3][1],c);this.vertex(...p[2][0],...p[2][1],c)}
    }
   });
  }
  // A small octahedron (a diamond): used to mark places in the house.
  diamond(cx,cy,cz,r,colour,{tall=1.5}={}){
   const c=parse(colour),top=[cx,cy+r*tall,cz],bot=[cx,cy-r*tall,cz],p=[[cx+r,cy,cz],[cx,cy,cz+r],[cx-r,cy,cz],[cx,cy,cz-r]];
   const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],sub=(u,v)=>[u[0]-v[0],u[1]-v[1],u[2]-v[2]];
   const face=(A,B,C)=>{const n=cross(sub(B,A),sub(C,A)),l=Math.hypot(...n)||1;this.tri(A,B,C,[n[0]/l,n[1]/l,n[2]/l],c)};
   for(let i=0;i<4;i++){const a=p[i],b=p[(i+1)%4];face(top,b,a);face(bot,a,b)}
  }
  // A flat rectangle lying on the floor facing up.
  floor(x0,z0,x1,z1,y,colour,alpha=1,mat){this.using(mat,()=>this.quad([x0,y,z1],[x1,y,z1],[x1,y,z0],[x0,y,z0],[0,1,0],parse(colour,alpha)))}
  // A flat disc lying on the floor (soft pools of light).
  disc(cx,cz,radius,y,colour,alpha=1,segments=20){const c=parse(colour,alpha);for(let i=0;i<segments;i++){const a0=i/segments*Math.PI*2,a1=(i+1)/segments*Math.PI*2;this.tri([cx,y,cz],[cx+Math.cos(a1)*radius,y,cz+Math.sin(a1)*radius],[cx+Math.cos(a0)*radius,y,cz+Math.sin(a0)*radius],[0,1,0],c)}}
  // A flat rectangle hanging down (ceilings).
  ceiling(x0,z0,x1,z1,y,colour,mat){this.using(mat,()=>this.quad([x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1],[0,-.4,0],parse(colour)))}
  // Lines: pairs of points, drawn unlit.
  line(a,b,colour){const c=parse(colour);this.vertex(...a,0,0,0,c);this.vertex(...b,0,0,0,c)}
 }

 // ── The renderer ─────────────────────────────────────────────────────────────
 const VERTEX=`attribute vec3 aPos;attribute vec3 aNormal;attribute vec4 aColor;attribute float aMat;
  uniform mat4 uMatrix;uniform mat4 uLightMatrix;
  varying vec3 vWorld;varying vec3 vNormal;varying vec4 vColor;varying float vMat;varying vec4 vShadow;
  void main(){gl_Position=uMatrix*vec4(aPos,1.0);vWorld=aPos;vNormal=aNormal;vColor=aColor;vMat=aMat;vShadow=uLightMatrix*vec4(aPos,1.0);}`;
 const FRAGMENT=`#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  varying vec3 vWorld;varying vec3 vNormal;varying vec4 vColor;varying float vMat;varying vec4 vShadow;
  uniform vec3 uLight;uniform vec3 uSun;uniform vec3 uSky;uniform vec3 uGround;uniform float uAmbient;uniform float uGain;
  uniform vec3 uEye;uniform vec3 uFogColor;uniform vec2 uFog;
  uniform float uShadowOn;uniform sampler2D uShadowMap;uniform float uTexel;uniform float uStrength;uniform float uPatterns;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}
  float unpack(vec4 c){return dot(c,vec4(1.0,1.0/255.0,1.0/65025.0,1.0/16581375.0));}
  bool is(float m){return abs(vMat-m)<0.5;}
  void main(){
   vec3 albedo=vColor.rgb;
   bool lit=length(vNormal)>0.01;
   vec2 fp=vWorld.xz;vec2 wp=vec2(vWorld.x+vWorld.z,vWorld.y);
   // on a level surface texture runs across the floor; on an upright one it runs up the wall
   if(lit&&abs(normalize(vNormal).y)>0.7)wp=fp;
   float shine=0.0;
   if(lit&&uPatterns>0.5){
    if(is(1.0)){ // wood boards
     float row=floor(fp.y/0.14);float off=hash(vec2(row,3.1))*1.4;float col=floor((fp.x+off)/1.5);
     albedo*=0.88+0.22*hash(vec2(row,col));
     float gx=fract((fp.x+off)/1.5);float gz=fract(fp.y/0.14);
     float seam=smoothstep(0.0,0.025,gz)*smoothstep(0.0,0.025,1.0-gz)*smoothstep(0.0,0.006,gx)*smoothstep(0.0,0.006,1.0-gx);
     albedo*=mix(0.62,1.0,seam)*(0.94+0.1*noise(vec2(fp.x*5.0+row*7.0,fp.y*55.0)));shine=0.25;
    }else if(is(2.0)){ // tile
     vec2 g=fp/0.45;vec2 c=floor(g);vec2 f=fract(g);
     float grout=1.0-step(0.025,f.x)*step(0.025,f.y)*step(f.x,0.975)*step(f.y,0.975);
     albedo=mix(albedo*(0.95+0.08*hash(c)),vec3(0.78,0.77,0.74),grout);shine=0.45;
    }else if(is(3.0)){ // carpet
     albedo*=0.9+0.16*noise(fp*70.0)+0.04*noise(fp*9.0);
    }else if(is(4.0)){ // painted wall
     albedo*=(0.965+0.04*noise(wp*2.5))*mix(0.9,1.0,smoothstep(0.0,1.4,vWorld.y));
    }else if(is(5.0)){ // fabric
     albedo*=0.9+0.16*noise(wp*130.0)+0.05*noise(wp*14.0);
    }else if(is(6.0)){ // wood grain
     albedo*=0.88+0.2*noise(vec2(vWorld.x*2.0+vWorld.z*2.0,vWorld.y*34.0+vWorld.x*3.0))+0.05*noise(vec2(vWorld.x*30.0+vWorld.z*30.0,vWorld.y*8.0));shine=0.12;
    }else if(is(7.0)){ // rug weave
     albedo*=0.86+0.1*sin(fp.x*90.0)*sin(fp.y*90.0)+0.1*noise(fp*50.0);
    }else if(is(9.0)){ // grass
     albedo*=0.78+0.32*noise(fp*1.3)+0.14*noise(fp*11.0);
    }else if(is(10.0)){ shine=0.9;albedo*=0.97+0.05*noise(vec2(vWorld.y*60.0,vWorld.x*3.0+vWorld.z*3.0));
    }else if(is(11.0)){ shine=0.7;
    }else if(is(12.0)){ shine=1.0;
    }else if(is(13.0)){ albedo*=0.8+0.34*noise(wp*7.0);
    }else if(is(14.0)){ // brick
     vec2 b=vec2((vWorld.x+vWorld.z)/0.24,vWorld.y/0.075);float r=floor(b.y);b.x+=mod(r,2.0)*0.5;vec2 f=fract(b);
     float mortar=1.0-step(0.06,f.x)*step(0.12,f.y);albedo=mix(albedo*(0.85+0.3*hash(floor(b))),vec3(0.75,0.72,0.68),mortar);
    }else if(is(15.0)){ albedo*=0.97+0.05*noise(wp*60.0);
    }
   }
   vec3 rgb=albedo;
   if(lit){
    vec3 n=normalize(vNormal);
    float ndl=max(dot(n,uLight),0.0);
    float shadow=1.0;
    if(uShadowOn>0.5){
     vec3 sc=vShadow.xyz/vShadow.w*0.5+0.5;
     if(sc.x>0.0&&sc.x<1.0&&sc.y>0.0&&sc.y<1.0&&sc.z<1.0){
      float bias=0.0035+0.006*(1.0-ndl);float sum=0.0;
      for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){float d=unpack(texture2D(uShadowMap,sc.xy+vec2(float(i),float(j))*uTexel));sum+=(sc.z-bias<=d)?1.0:0.0;}
      shadow=mix(1.0-uStrength,1.0,sum/9.0);
     }
    }
    // colours blend in linear light, then go back to what a screen expects
    vec3 base=pow(albedo,vec3(2.2));
    vec3 ambient=mix(uGround,uSky,0.5+0.5*n.y)*uAmbient;
    vec3 colour=base*(ambient+uSun*ndl*shadow);
    if(shine>0.0){vec3 V=normalize(uEye-vWorld);vec3 H=normalize(uLight+V);float s=pow(max(dot(n,H),0.0),48.0);colour+=uSun*s*ndl*shadow*shine*0.7;}
    rgb=pow(min(colour*uGain,vec3(1.0)),vec3(1.0/2.2));
   }
   float f=clamp((distance(vWorld,uEye)-uFog.x)/(uFog.y-uFog.x),0.0,1.0);
   gl_FragColor=vec4(mix(rgb,uFogColor,f),vColor.a);
  }`;
 const DEPTH_VERTEX=`attribute vec3 aPos;uniform mat4 uLightMatrix;varying float vDepth;
  void main(){vec4 p=uLightMatrix*vec4(aPos,1.0);gl_Position=p;vDepth=p.z/p.w*0.5+0.5;}`;
 const DEPTH_FRAGMENT=`precision highp float;varying float vDepth;
  void main(){vec4 enc=vec4(1.0,255.0,65025.0,16581375.0)*vDepth;enc=fract(enc);enc-=enc.yzww*vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0);gl_FragColor=enc;}`;
 const linear=c=>[Math.pow(c[0],2.2),Math.pow(c[1],2.2),Math.pow(c[2],2.2)];

 function create(canvas){
  const gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true})||canvas.getContext('experimental-webgl');
  if(!gl)return null;
  const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s};
  const link=(vs,fs)=>{const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p};
  const program=link(VERTEX,FRAGMENT),depth=link(DEPTH_VERTEX,DEPTH_FRAGMENT);
  const U=name=>gl.getUniformLocation(program,name);
  const loc={pos:gl.getAttribLocation(program,'aPos'),normal:gl.getAttribLocation(program,'aNormal'),color:gl.getAttribLocation(program,'aColor'),mat:gl.getAttribLocation(program,'aMat'),
   matrix:U('uMatrix'),lightMatrix:U('uLightMatrix'),eye:U('uEye'),light:U('uLight'),sun:U('uSun'),sky:U('uSky'),ground:U('uGround'),ambient:U('uAmbient'),gain:U('uGain'),fogColor:U('uFogColor'),fog:U('uFog'),
   shadowOn:U('uShadowOn'),patterns:U('uPatterns'),shadowMap:U('uShadowMap'),texel:U('uTexel'),strength:U('uStrength')};
  const dloc={pos:gl.getAttribLocation(depth,'aPos'),lightMatrix:gl.getUniformLocation(depth,'uLightMatrix')};
  const buffers=new Map(),STRIDE=44;
  // the shadow map: where the sun can see, drawn into a texture
  const SHADOW=2048;let shadow=null;
  function makeShadow(){
   const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,SHADOW,SHADOW,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   const depthBuffer=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depthBuffer);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,SHADOW,SHADOW);
   const frame=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,frame);
   gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depthBuffer);
   const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   return ok?{texture,frame,depthBuffer}:null;
  }
  // Hand a mesh to the graphics card under a name; a mesh set again replaces the old one.
  function set(name,mesh,mode='triangles'){
   let entry=buffers.get(name);if(!entry){entry={buffer:gl.createBuffer(),count:0,mode};buffers.set(name,entry)}
   gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.data),gl.DYNAMIC_DRAW);entry.count=mesh.count;entry.mode=mode;
  }
  function size(){
   const ratio=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(canvas.clientWidth*ratio)),h=Math.max(1,Math.round(canvas.clientHeight*ratio));
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  }
  function bind(entry,depthOnly){
   gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);
   if(depthOnly){gl.enableVertexAttribArray(dloc.pos);gl.vertexAttribPointer(dloc.pos,3,gl.FLOAT,false,STRIDE,0);return}
   gl.enableVertexAttribArray(loc.pos);gl.vertexAttribPointer(loc.pos,3,gl.FLOAT,false,STRIDE,0);
   gl.enableVertexAttribArray(loc.normal);gl.vertexAttribPointer(loc.normal,3,gl.FLOAT,false,STRIDE,12);
   gl.enableVertexAttribArray(loc.color);gl.vertexAttribPointer(loc.color,4,gl.FLOAT,false,STRIDE,24);
   gl.enableVertexAttribArray(loc.mat);gl.vertexAttribPointer(loc.mat,1,gl.FLOAT,false,STRIDE,40);
  }
  // Draw what was set. `layers` lists names in drawing order; names ending in '~' are translucent (no depth writing) and
  // names ending in '!' are drawn on top of everything. `shadow` = {matrix, casters:[names], strength} switches on sun shadows.
  function draw({view,proj,eye,clear=[.95,.95,.93],layers,light=[.38,.82,.42],sun=[1,.96,.88],sky=[.62,.72,.9],ground=[.5,.46,.4],ambient=.6,gain=1,fog=null,shadows=null,patterns=true}){
   size();
   let shadowing=false;
   if(shadows){
    if(!shadow)shadow=makeShadow()||false;
    if(shadow){
     shadowing=true;gl.bindFramebuffer(gl.FRAMEBUFFER,shadow.frame);gl.viewport(0,0,SHADOW,SHADOW);gl.clearColor(1,1,1,1);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
     gl.useProgram(depth);gl.uniformMatrix4fv(dloc.lightMatrix,false,shadows.matrix);
     for(const name of shadows.casters){const entry=buffers.get(name);if(!entry||!entry.count)continue;bind(entry,true);gl.drawArrays(gl.TRIANGLES,0,entry.count)}
     gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
   }
   gl.viewport(0,0,canvas.width,canvas.height);
   gl.clearColor(clear[0],clear[1],clear[2],1);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.useProgram(program);gl.uniformMatrix4fv(loc.matrix,false,multiply(proj,view));gl.uniform3fv(loc.eye,eye);
   gl.uniformMatrix4fv(loc.lightMatrix,false,shadows?shadows.matrix:new Float32Array(16));
   const l=Math.hypot(...light);gl.uniform3f(loc.light,light[0]/l,light[1]/l,light[2]/l);gl.uniform3fv(loc.sun,sun);gl.uniform3fv(loc.sky,linear(sky));gl.uniform3fv(loc.ground,linear(ground));
   gl.uniform1f(loc.ambient,ambient);gl.uniform1f(loc.gain,gain);
   gl.uniform3fv(loc.fogColor,fog?fog.color:clear);gl.uniform2f(loc.fog,fog?fog.start:1e6,fog?fog.end:2e6);
   gl.uniform1f(loc.shadowOn,shadowing?1:0);gl.uniform1f(loc.patterns,patterns?1:0);gl.uniform1f(loc.texel,1/SHADOW);gl.uniform1f(loc.strength,shadows?.strength??.8);
   if(shadowing){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,shadow.texture);gl.uniform1i(loc.shadowMap,0)}
   for(const name of layers){
    const entry=buffers.get(name.replace(/[~!]$/,''));if(!entry||!entry.count)continue;
    const soft=name.endsWith('~'),top=name.endsWith('!');
    if(soft||top){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)}else gl.disable(gl.BLEND);
    gl.depthMask(!soft&&!top);if(top)gl.disable(gl.DEPTH_TEST);else gl.enable(gl.DEPTH_TEST);
    bind(entry);gl.drawArrays(entry.mode==='lines'?gl.LINES:gl.TRIANGLES,0,entry.count);
   }
   gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
  }
  function dispose(){for(const e of buffers.values())gl.deleteBuffer(e.buffer);buffers.clear();gl.deleteProgram(program);gl.deleteProgram(depth)}
  return {gl,set,draw,dispose,size,canvas};
 }
 return {Mesh,create,perspective,ortho,lookAt,multiply,transform,parse,MATERIAL};
})();
if(typeof module!=='undefined')module.exports=Mini3D;
