const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('web/app.js','utf8');const start=source.indexOf('window.marginImportBackup=');const end=source.indexOf("$('#run-all').onclick",start);
const state={projects:[],notes:[],trash:[],importedOrigins:[]};let saves=0;
const context={window:{},state,active:null,persist:()=>saves++,render(){},updateTrashCount(){},toast(){}};vm.runInNewContext(source.slice(start,end),context);
const subject={id:'bio',name:'Biology',units:[{id:'u1',name:'Cells'}],materials:[{id:'file',name:'Slides.pdf',path:'/tmp/Slides.pdf',unitId:'u1'}],packs:[{id:'test',title:'Midterm',unitIds:['u1'],topics:[{title:'Explain cells',done:true}]}]};
context.window.marginImportBackup({notes:[],projects:[subject]});assert.equal(state.projects.length,1);assert.equal(state.projects[0].packs[0].topics[0].done,true);assert.equal(saves,1);
const n={id:'note',title:'Cells',projectId:'bio',unitId:'u1',blocks:[{id:'b1',type:'text',text:'Original text'}],nodes:[]};context.window.marginImportBackup({notes:[n],projects:[subject]});assert.equal(state.notes.length,1);assert.equal(state.notes[0].unitId,'u1');assert.equal(state.projects.length,1);
context.window.marginImportBackup({notes:[{...n,title:'Changed backup'}],projects:[{...subject,name:'Changed subject'}]});assert.equal(state.notes[0].title,'Cells');assert.equal(state.projects[0].name,'Biology');
console.log('PASS: additive backup imports subject-only notebooks, units, materials, test packs, and note assignments without overwriting existing records.');
