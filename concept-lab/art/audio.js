// Original short synthesized cues. Sound begins only after the host receives a gesture.
let audio=null, master=null, enabled=false;

export function setSound(on,volume=.45) {
  enabled=Boolean(on);
  if(!audio&&!enabled)return;
  try {
    if(!audio) {
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      audio=new Audio();
      master=audio.createGain(); master.connect(audio.destination);
    }
    master.gain.setTargetAtTime(enabled?Math.max(0,Math.min(1,volume))*.2:0,audio.currentTime,.008);
    if(enabled&&audio.state==='suspended')audio.resume().catch(()=>{});
  } catch {
    enabled=false;
  }
}

function note(hz,delay,length,level,type='sine') {
  const start=audio.currentTime+delay, osc=audio.createOscillator(), envelope=audio.createGain();
  osc.type=type; osc.frequency.value=hz; 
  envelope.gain.setValueAtTime(.0001,start);
  envelope.gain.exponentialRampToValueAtTime(level,start+.012);
  envelope.gain.exponentialRampToValueAtTime(.0001,start+length);
  osc.connect(envelope); envelope.connect(master);
  osc.start(start); osc.stop(start+length+.01);
  osc.onended=()=>{osc.disconnect();envelope.disconnect();};
}

export function soundCue(concept,kind,points=0) {
  if(!enabled||!audio||audio.state!=='running')return;
  if(kind==='recap') {
    [293.66,369.99,440,587.33].forEach((hz,i)=>note(hz,.035*i,.6,.22));
    return;
  }
  if(kind!=='accept'||points<=0)return;
  if(concept==='A') {
    note(1174.66,0,.095,.45); note(294.33,.10,.2,.27,'triangle');
    note(points>=60?739.99:440,.23,.36,.40);
    if(points>=60)note(987.77,.36,.4,.18);
  } else {
    note(246.94,0,.13,.4,'triangle'); note(329.63,.11,.25,.4);
    if(points>=60){note(440,.23,.30,.35);note(659.26,.36,.4,.24);}
  }
}
