/* Three short local notes; audio starts only after a player gesture. */
window.MotionGameSound={create(scope=window){
 let context,enabled=true;
 return{
  get enabled(){return enabled;},
  unlock(){if(!enabled)return;try{const Audio=scope.AudioContext||scope.webkitAudioContext;if(!Audio)return;context??=new Audio();if(context.state==='suspended')context.resume()?.catch?.(()=>{});}catch{}},
  toggle(){enabled=!enabled;if(!enabled){try{context?.suspend()?.catch?.(()=>{});}catch{}}else this.unlock();return enabled;},
  holeIn(){if(!enabled||context?.state!=='running')return false;try{const t=context.currentTime;for(const[i,hz]of[523.25,659.25,783.99].entries()){const oscillator=context.createOscillator(),gain=context.createGain(),start=t+i*.13;oscillator.type='sine';oscillator.frequency.setValueAtTime(hz,start);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.12,start+.015);gain.gain.exponentialRampToValueAtTime(.001,start+.24);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+.26);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}return true;}catch{return false;}}
 };
}};
