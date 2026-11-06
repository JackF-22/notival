const http=require('node:http'),{execFileSync,spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
try{execFileSync('swiftc',['--version'],{stdio:'ignore'})}catch{console.log('SKIP: swiftc is not available');process.exit(0)}
const seen=[];
const server=http.createServer((req,res)=>{
 seen.push({url:req.url,auth:req.headers.authorization,accept:req.headers.accept,method:req.method});
 if(req.url==='/feeds/calendars/user_secret123.ics'){
  res.writeHead(200,{'content-type':'text/calendar'});
  res.end('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:event-assignment-1\r\nSUMMARY:Lab 3 [BIOL 101]\r\nDTSTART:20261108T235900Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n');return;
 }
 res.writeHead(404,{'content-type':'text/plain'});res.end('not found');
});
server.listen(0,'127.0.0.1',()=>{
 const port=server.address().port,dir=fs.mkdtempSync(path.join(os.tmpdir(),'notival-canvas-')),binary=path.join(dir,'canvas-test');
 try{
  execFileSync('swiftc',['-module-cache-path',path.join(dir,'cache'),'native/canvas.swift','tests/swift-canvas/main.swift','-o',binary],{stdio:'inherit'});
  const child=spawn(binary,[String(port)],{stdio:['ignore','pipe','inherit']});
  let output='';child.stdout.on('data',d=>output+=d);
  child.on('close',code=>{
   server.close();fs.rmSync(dir,{recursive:true,force:true});
   assert.equal(output.trim(),'OK',output);assert.equal(code,0);
   const first=seen.find(r=>r.url==='/feeds/calendars/user_secret123.ics');
   assert.equal(first.auth,undefined,'the secret link is the only credential; no token header is sent');assert.match(first.accept,/text\/calendar/);assert.equal(first.method,'GET');
   assert.ok(!seen.some(r=>r.url.startsWith('/api/')),'a blocked request never reached the server');
   console.log('PASS: Keychain storage of the feed link, request restrictions, and error handling in the native Canvas client.');
  });
 }catch(error){server.close();fs.rmSync(dir,{recursive:true,force:true});throw error}
});
