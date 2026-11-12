// A very small 3D engine, just enough to draw a house: boxes and upright cylinders with simple lighting, translucent
// glass and soft shadows, fog, and a perspective or top-down camera. Written for Notival's memory palace; no libraries.
//
//   const mesh=new Mini3D.Mesh();  mesh.box(cx,y0,cz,w,h,d,'#hex',{rot,top});  mesh.cylinder(cx,y0,cz,r,h,'#hex');
//   const view=Mini3D.create(canvas);  view.set('solid',mesh);  view.draw({view:matrix,proj:matrix,eye:[x,y,z]});
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

 // ── Geometry: triangles with a normal and a colour each (x y z, nx ny nz, r g b a) ──
 class Mesh{
  constructor(){this.data=[];this.count=0}
  clear(){this.data=[];this.count=0}
  vertex(x,y,z,nx,ny,nz,c){this.data.push(x,y,z,nx,ny,nz,c[0],c[1],c[2],c[3]);this.count++}
  tri(a,b,c,n,colour){this.vertex(...a,...n,colour);this.vertex(...b,...n,colour);this.vertex(...c,...n,colour)}
  quad(a,b,c,d,n,colour){this.tri(a,b,c,n,colour);this.tri(a,c,d,n,colour)}
  // A box standing on y0, centred on (cx,cz), turned about the vertical axis by `rot` degrees around (px,pz). Faces can be
  // coloured differently: top, and `sides`.
  box(cx,y0,cz,w,h,d,colour,{rot=0,pivot=[cx,cz],alpha=1,top,bottom=false}={}){
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
  }
  cylinder(cx,y0,cz,radius,h,colour,{segments=14,alpha=1,top,rot=0,pivot=[cx,cz]}={}){
   const base=parse(colour,alpha),t=top?parse(top,alpha):base,y1=y0+h,r=rot*Math.PI/180,cs=Math.cos(r),sn=Math.sin(r);
   const at=(x,y,z)=>{const dx=x-pivot[0],dz=z-pivot[1];return [pivot[0]+dx*cs+dz*sn,y,pivot[1]-dx*sn+dz*cs]};
   const nrm=(x,y,z)=>[x*cs+z*sn,y,-x*sn+z*cs];
   for(let i=0;i<segments;i++){
    const a0=i/segments*Math.PI*2,a1=(i+1)/segments*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
    const p0=[cx+c0*radius,cz+s0*radius],p1=[cx+c1*radius,cz+s1*radius];
    // the side is shaded smoothly: each end carries its own normal
    const n0=nrm(c0,0,s0),n1=nrm(c1,0,s1),A=at(p0[0],y0,p0[1]),Bv=at(p1[0],y0,p1[1]),Cv=at(p1[0],y1,p1[1]),Dv=at(p0[0],y1,p0[1]);
    this.vertex(...A,...n0,base);this.vertex(...Bv,...n1,base);this.vertex(...Cv,...n1,base);
    this.vertex(...A,...n0,base);this.vertex(...Cv,...n1,base);this.vertex(...Dv,...n0,base);
    this.tri(at(cx,y1,cz),at(p1[0],y1,p1[1]),at(p0[0],y1,p0[1]),nrm(0,1,0),t);
   }
  }
  // A small octahedron (a diamond): used to mark places in the house.
  diamond(cx,cy,cz,r,colour,{tall=1.5}={}){
   const c=parse(colour),top=[cx,cy+r*tall,cz],bot=[cx,cy-r*tall,cz],p=[[cx+r,cy,cz],[cx,cy,cz+r],[cx-r,cy,cz],[cx,cy,cz-r]];
   const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],sub=(u,v)=>[u[0]-v[0],u[1]-v[1],u[2]-v[2]];
   const face=(A,B,C)=>{const n=cross(sub(B,A),sub(C,A)),l=Math.hypot(...n)||1;this.tri(A,B,C,[n[0]/l,n[1]/l,n[2]/l],c)};
   for(let i=0;i<4;i++){const a=p[i],b=p[(i+1)%4];face(top,b,a);face(bot,a,b)}
  }
  // A flat rectangle lying on the floor facing up.
  floor(x0,z0,x1,z1,y,colour,alpha=1){this.quad([x0,y,z1],[x1,y,z1],[x1,y,z0],[x0,y,z0],[0,1,0],parse(colour,alpha))}
  // A flat rectangle hanging down (ceilings).
  ceiling(x0,z0,x1,z1,y,colour){this.quad([x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1],[0,.6,0],parse(colour))}
  // Lines: pairs of points, drawn unlit.
  line(a,b,colour){const c=parse(colour);this.vertex(...a,0,0,0,c);this.vertex(...b,0,0,0,c)}
 }

 // ── The renderer ─────────────────────────────────────────────────────────────
 const VERTEX=`attribute vec3 aPos;attribute vec3 aNormal;attribute vec4 aColor;uniform mat4 uMatrix;uniform vec3 uEye;
  varying vec3 vNormal;varying vec4 vColor;varying float vDist;
  void main(){gl_Position=uMatrix*vec4(aPos,1.0);vNormal=aNormal;vColor=aColor;vDist=distance(aPos,uEye);}`;
 const FRAGMENT=`precision mediump float;varying vec3 vNormal;varying vec4 vColor;varying float vDist;
  uniform vec3 uLight;uniform float uAmbient;uniform float uGain;uniform vec3 uFogColor;uniform vec2 uFog;
  void main(){
   vec3 rgb=vColor.rgb;
   if(length(vNormal)>0.01){
    vec3 n=normalize(vNormal);float d=max(dot(n,uLight),0.0);float sky=0.86+0.14*n.y;
    rgb=min(rgb*(uAmbient*sky+(1.0-uAmbient)*d*1.1)*uGain,vec3(1.0));
   }
   float f=clamp((vDist-uFog.x)/(uFog.y-uFog.x),0.0,1.0);
   gl_FragColor=vec4(mix(rgb,uFogColor,f),vColor.a);
  }`;
 function create(canvas){
  const gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true})||canvas.getContext('experimental-webgl');
  if(!gl)return null;
  const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s};
  const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  const loc={pos:gl.getAttribLocation(program,'aPos'),normal:gl.getAttribLocation(program,'aNormal'),color:gl.getAttribLocation(program,'aColor'),
   matrix:gl.getUniformLocation(program,'uMatrix'),eye:gl.getUniformLocation(program,'uEye'),light:gl.getUniformLocation(program,'uLight'),ambient:gl.getUniformLocation(program,'uAmbient'),gain:gl.getUniformLocation(program,'uGain'),fogColor:gl.getUniformLocation(program,'uFogColor'),fog:gl.getUniformLocation(program,'uFog')};
  const buffers=new Map();
  const STRIDE=40;
  // Hand a mesh to the graphics card under a name; a mesh set again replaces the old one.
  function set(name,mesh,mode='triangles'){
   let entry=buffers.get(name);if(!entry){entry={buffer:gl.createBuffer(),count:0,mode};buffers.set(name,entry)}
   gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.data),gl.DYNAMIC_DRAW);entry.count=mesh.count;entry.mode=mode;
  }
  function size(){
   const ratio=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(canvas.clientWidth*ratio)),h=Math.max(1,Math.round(canvas.clientHeight*ratio));
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  }
  function bind(entry){
   gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);
   gl.enableVertexAttribArray(loc.pos);gl.vertexAttribPointer(loc.pos,3,gl.FLOAT,false,STRIDE,0);
   gl.enableVertexAttribArray(loc.normal);gl.vertexAttribPointer(loc.normal,3,gl.FLOAT,false,STRIDE,12);
   gl.enableVertexAttribArray(loc.color);gl.vertexAttribPointer(loc.color,4,gl.FLOAT,false,STRIDE,24);
  }
  // Draw what was set. `layers` lists names in drawing order; names ending in '~' are translucent (no depth writing) and
  // names ending in '!' are drawn on top of everything.
  function draw({view,proj,eye,clear=[.95,.95,.93],layers,light=[.38,.82,.42],ambient=.58,gain=1.1,fog=null}){
   size();gl.viewport(0,0,canvas.width,canvas.height);
   gl.clearColor(clear[0],clear[1],clear[2],1);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.useProgram(program);gl.uniformMatrix4fv(loc.matrix,false,multiply(proj,view));gl.uniform3fv(loc.eye,eye);
   const l=Math.hypot(...light);gl.uniform3f(loc.light,light[0]/l,light[1]/l,light[2]/l);gl.uniform1f(loc.ambient,ambient);gl.uniform1f(loc.gain,gain);
   gl.uniform3fv(loc.fogColor,fog?fog.color:clear);gl.uniform2f(loc.fog,fog?fog.start:1e6,fog?fog.end:2e6);
   for(const name of layers){
    const entry=buffers.get(name.replace(/[~!]$/,''));if(!entry||!entry.count)continue;
    const soft=name.endsWith('~'),top=name.endsWith('!');
    if(soft||top){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)}else gl.disable(gl.BLEND);
    gl.depthMask(!soft&&!top);if(top)gl.disable(gl.DEPTH_TEST);else gl.enable(gl.DEPTH_TEST);
    bind(entry);gl.drawArrays(entry.mode==='lines'?gl.LINES:gl.TRIANGLES,0,entry.count);
   }
   gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
  }
  function dispose(){for(const e of buffers.values())gl.deleteBuffer(e.buffer);buffers.clear();gl.deleteProgram(program)}
  return {gl,set,draw,dispose,size,canvas};
 }
 return {Mesh,create,perspective,ortho,lookAt,multiply,transform,parse};
})();
if(typeof module!=='undefined')module.exports=Mini3D;
