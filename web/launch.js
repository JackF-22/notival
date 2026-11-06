(()=>{
 const initial=document.querySelector('#launch-screen');if(!initial)return;const template=initial.cloneNode(true);let dispose;
 function play(waitForData=false){
  dispose?.();const screen=initial.isConnected?initial:template.cloneNode(true);if(!screen.isConnected)document.body.append(screen);screen.classList.remove('is-leaving');
  const started=performance.now(),reduced=matchMedia('(prefers-reduced-motion: reduce)');let ready=!waitForData,leaving=false,finishTimer,removeTimer;
  function remove(){clearTimeout(failSafe);clearTimeout(finishTimer);clearTimeout(removeTimer);screen.remove();window.removeEventListener('notival-ready',finish);document.removeEventListener('pointerdown',skip);document.removeEventListener('keydown',skip);window.removeEventListener('error',fail)}
  function leave(){if(leaving)return;leaving=true;screen.classList.add('is-leaving');removeTimer=setTimeout(remove,reduced.matches?0:280)}
  function finish(){ready=true;clearTimeout(finishTimer);finishTimer=setTimeout(leave,reduced.matches?0:Math.max(0,1050-(performance.now()-started)))}
  function skip(){if(ready&&performance.now()-started>450){leave();remove()}}
  function fail(){leave();remove()}
  const failSafe=setTimeout(fail,3500);dispose=remove;window.addEventListener('notival-ready',finish);document.addEventListener('pointerdown',skip);document.addEventListener('keydown',skip);if(ready)finish();
 }
 window.notivalReplayLaunch=()=>play(false);play(true);
})();
