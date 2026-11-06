const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
try{execFileSync('swiftc',['--version'],{stdio:'ignore'})}catch{console.log('SKIP: swiftc is not available');process.exit(0)}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'notival-find-')),binary=path.join(dir,'find-test');
try{
 execFileSync('swiftc',['-module-cache-path',path.join(dir,'cache'),'native/pdf_find.swift','tests/swift-pdf/main.swift','-o',binary,'-framework','PDFKit','-framework','AppKit','-framework','CoreText'],{stdio:'inherit'});
 const output=execFileSync(binary,{encoding:'utf8',timeout:60000});
 assert.equal(output.trim(),'OK',output);
 console.log('PASS: the PDF finder counts matches across pages, ignores case and accents, steps with wrap-around, and clears.');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
