import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {readdirSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

// No fixed purple left in the files that draw connections, drag bars and labels, or picture controls
const web=new URL('../web/',import.meta.url).pathname;
const stragglers=readdirSync(web).filter(name=>/\.(css|js)$/.test(name)&&name!=='editor-surface.css'&&readFileSync(web+name,'utf8').includes('986cff'));
assert.deepEqual(stragglers,[],'hardcoded purple in: '+stragglers);

const profile=await mkdtemp('/private/tmp/margin-accent-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile
],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let buffer='',id=0;const waiting=new Map();
browser.stdio[4].on('data',bytes=>{buffer+=bytes;while(buffer.includes('\0')){const i=buffer.indexOf('\0'),raw=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!raw)continue;const message=JSON.parse(raw),pending=waiting.get(message.id);if(pending){waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result)}}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Timeout '+method)),20000);waiting.set(key,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id:key,method,params,sessionId})+'\0')});
const shots=process.env.ACCENT_SHOTS;
try{
  const {targetId}=await call('Target.createTarget',{url:new URL('../web/index.html',import.meta.url).href});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value};
  for(let i=0;i<100;i++){if(await evaluate('typeof state!=="undefined" && !!state && document.readyState==="complete" && typeof marginConnectionColors!=="undefined"'))break;await new Promise(r=>setTimeout(r,50))}
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async name=>{if(!shots)return;const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);(await import('node:fs')).writeFileSync(shots+'/'+name+'.png',Buffer.from(data,'base64'))};
  await evaluate('document.querySelector("#launch-screen")?.remove()');
  await evaluate(`(()=>{state.notes=[{id:'n',title:'Colours',updated:Date.now(),pinned:false,nodes:[],blocks:[{id:'a',type:'text',text:'x',html:'<p>One line</p><ul><li>a bullet</li></ul><p>Another</p>'}]}];active='n';render();setMode('write')})()`);
  await wait(250);

  await evaluate(`document.head.append(Object.assign(document.createElement('style'),{textContent:'*{transition:none!important}'}))`);
  const palettes={Violet:['#635ad6','#b2aaff'],Ocean:['#2369a8','#83b9ef'],Forest:['#357449','#8eca9d'],Teal:['#137c78','#77cfca'],Rose:['#ad4266','#f29db8'],Graphite:['#515862','#bdc4ce']};
  const rgbOf=hex=>{const n=parseInt(hex.slice(1),16);return `rgb(${n>>16&255}, ${n>>8&255}, ${n&255})`};
  const hue=([r,g,b])=>{r/=255;g/=255;b/=255;const max=Math.max(r,g,b),d=max-Math.min(r,g,b);if(!d)return 0;const h=max===r?((g-b)/d+(g<b?6:0)):max===g?(b-r)/d+2:(r-g)/d+4;return h*60};
  // things the app draws while you drag or connect, built by hand so they can be measured
  await evaluate(`(()=>{const add=(tag,cls,parent=document.body)=>{const n=document.createElement(tag);n.className=cls;n.id='probe-'+cls.split(' ')[0];parent.append(n);return n};
    add('div','line-drop');add('div','layout-drop');add('div','connection-mode-badge');add('div','line-ghost');add('div','layout-ghost');
    const bar=add('div','image-align');const b=document.createElement('button');b.className='on';bar.append(b);
    add('div','image-resizer');add('div','image-handle');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');document.body.append(svg);const edge=document.createElementNS('http://www.w3.org/2000/svg','path');edge.setAttribute('class','passage-edge');svg.append(edge);
    const pressed=document.createElement('button');pressed.id='connect-passages';pressed.className='probe-connect';pressed.setAttribute('aria-pressed','true');document.body.append(pressed)})()`);

  for(const dark of [false,true])for(const [name,[day,night]] of Object.entries(palettes)){
    const hex=dark?night:day,want=rgbOf(hex);
    await evaluate(`(()=>{document.documentElement.dataset.appearance=${JSON.stringify(dark?'night':'day')};document.documentElement.style.setProperty('--green',${JSON.stringify(hex)})})()`);
    const seen=await evaluate(`(()=>{const css=(sel,prop)=>getComputedStyle(document.querySelector(sel))[prop];return {
      accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      lineDrop:css('.line-drop','backgroundColor'),layoutDrop:css('.layout-drop','backgroundColor'),
      lineGhost:css('.line-ghost','borderTopColor'),layoutGhost:css('.layout-ghost','borderTopColor'),
      imagePressed:css('.image-align button.on','backgroundColor'),imageText:css('.image-align button.on','color'),
      frame:css('.image-resizer','borderTopColor'),handle:css('.image-handle','borderTopColor'),
      edge:getComputedStyle(document.querySelector('.passage-edge')).stroke,
      badge:css('.connection-mode-badge','backgroundColor'),badgeText:css('.connection-mode-badge','color'),
      connect:getComputedStyle(document.querySelector('.probe-connect')).borderTopColor}})()`);
    const label=name+(dark?' night':' day');
    assert.equal(seen.accent,hex,label+': --accent follows the palette');
    for(const key of ['lineDrop','layoutDrop','lineGhost','layoutGhost','imagePressed','frame','handle','connect','badge'])assert.equal(seen[key],want,label+': '+key+' is '+seen[key]);
    assert.equal(seen.edge,want,label+': connection lines');
    assert.equal(seen.imageText,dark?'rgb(22, 21, 31)':'rgb(255, 255, 255)',label+': text on the accent stays readable');
    // the canvas colours (a different code path) follow it too, and the partner colour stays distinct
    const canvas=await evaluate(`(()=>{const c=marginConnectionColors();return c})()`);
    const rgb=want.match(/\d+/g).map(Number);
    assert.equal(canvas.accent,`rgb(${rgb.join(',')})`,label+': canvas accent');
    assert.equal(seen.badgeText,dark?'rgb(22, 21, 31)':'rgb(255, 255, 255)',label+': the mode badge is readable');
    assert.equal(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--accent-partner').trim()`),canvas.partner,label+': the dialog marker shares the canvas partner colour');
    const partner=canvas.partner.match(/\d+/g).map(Number);
    const gap=Math.abs(hue(partner)-hue(rgb))%360;
    assert((gap>180?360-gap:gap)>=50||name==='Graphite',label+': the partner colour is distinguishable ('+canvas.partner+' vs '+canvas.accent+')');
    assert.match(canvas.fill,/^rgba\(\d+,\d+,\d+,0\.16\)$/);
  }

  // what it looks like: Rose in day, then Forest at night
  await evaluate(`(()=>{document.querySelectorAll('[id^=probe-],.probe-connect').forEach(n=>n.remove())})()`);
  await evaluate(`(()=>{document.documentElement.dataset.appearance='day';document.documentElement.style.setProperty('--green','#ad4266');document.querySelector('#connect-passages').click()})()`);await wait(150);
  await shot('connections-rose');
  console.log('PASS: connections, drag bars and labels, and picture frames follow the chosen palette in day and night (all six palettes), keep readable text, and the connection partner colour stays distinct.');
}finally{browser.kill();for(const pending of waiting.values())clearTimeout(pending.timer);await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
