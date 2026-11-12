import {renderScene} from '/art/scene.js';
import {setSound,soundCue} from '/art/audio.js';

const app=document.querySelector('#app'), $=(q)=>document.querySelector(q);
const dirs={
 A:{name:'Glass Atlas',place:'The optical room',type:'Optical study',desc:'Turn the brass objective and travel into a hand-illustrated tissue section.',unit:'focus steps',tag:'Optics',other:'B'},
 B:{name:'Night Culture',place:'The culture room',type:'Culture study',desc:'Keep a midnight dish with a tiny spore tender. Uncommon finds send up a forest of filaments.',unit:'growth marks',tag:'Mycology',other:'A'}
};
const param=new URLSearchParams(location.search).get('study'), concept=Object.hasOwn(dirs,param)?param:null, dir=dirs[concept];
const motionPref=matchMedia('(prefers-reduced-motion: reduce)');
function read(k,fallback){try{return localStorage.getItem('penicillion:'+k)??fallback;}catch{return fallback;}}
function save(k,v){try{localStorage.setItem('penicillion:'+k,v);}catch{}}
let sound=read('sound','off')==='on', still=read('still','off')==='on', state=null, phaseAt=0, offsetAt=0, serverAt=0, busy=false, expiring=false, version=0, nextSyncAt=0;
const reduced=()=>still||motionPref.matches;
const words='<img class="wordmark" src="/wordmark.svg" alt="Penicillion">';
const mark=id=>'<svg class="pixel-mark" aria-hidden="true" focusable="false"><use href="/marks.svg#'+id+'"></use></svg>';
const arrow=mark('right');
const icon=(name)=>({audio:'<path d="M2 9h4l5-4v14l-5-4H2z M15 8q5 4 0 8 M18 5q8 7 0 14"/>',silent:'<path d="M2 9h4l5-4v14l-5-4H2z M16 9l6 6m0-6-6 6"/>',still:'<path d="M3 5h18v14H3z M7 15l4-4 3 3 2-2 2 3"/>',move:'<path d="M2 7h8M4 12h5m-7 5h8m3-13 9 8-9 8z"/>'})[name];
const svg=n=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+icon(n)+'</svg>';
const say=s=>{$('#announce').textContent=s;};
const pad=n=>String(n).padStart(2,'0');
function elem(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}
function sceneLabel(c,phase,points,total){
 const crown=Boolean(state?.results?.some(r=>r.points===100));
 const progress=total?' '+total+' '+dirs[c].unit+' recorded.':'';
 if(c==='A'){
   if(phase==='landing'||phase==='prompt'||!total)return 'A brass microscope on a moonlit slide table.'+progress;
   return (total>=60?'An engraved tissue section fills the atlas plate.':'A small tissue section comes into focus.')+(crown?' A gold seal marks the plate.':'')+progress;
 }
 if(phase==='landing'||!total)return 'A small spore keeper tends a dish under the bench lamp.';
 return (total>=60?'Branching filaments and brush-like towers rise from the glass.':'Small colonies dot the spore keeper’s dish.')+(crown?' A coral arch spans the culture.':'')+progress;
}
function renderAt(canvas,c,phase='landing',points=0,total=0,now=performance.now(),start=0){
 if(!canvas||!canvas.clientWidth||!canvas.clientHeight)return;
 renderScene(canvas,{concept:c,phase,points,total,marks:(state?.results??[]).map(r=>r.points),time:reduced()?0:now,elapsed:reduced()?3000:Math.max(0,now-start),reduced:reduced(),portrait:canvas.clientWidth/canvas.clientHeight<1.7});
}
function chooser(){
 document.body.dataset.view='chooser';
 const cards=Object.entries(dirs).map(([k,d])=>`<article class="print-card ${k}"><a class="card-link" href="/?study=${k}" aria-label="Play ${d.name}"><div class="card-art"><canvas id="art-${k}" role="img" aria-label="${sceneLabel(k,'landing',0,0)}"></canvas><span class="figure mono">Fig. 0${k==='A'?'1':'2'}</span></div><div class="caption"><div class="card-meta mono"><span class="swatches" aria-hidden="true"><i></i><i></i><i></i></span>${d.type}</div><div class="card-title"><span class="alpha">${k}</span><h2>${d.name}</h2></div><p>${d.desc}</p><div class="card-bottom"><span>Play this study</span>${arrow}</div></div></a></article>`).join('');
 app.innerHTML=`<div class="chooser wrap"><div class="intro"><div class="eyebrow"><span class="rule"></span> A medical word game <span class="rule"></span></div><h1>${words}</h1><p>Rarer correct answers earn more. <em>What comes to mind?</em></p></div><div class="shelf-title"><h2 class="mono">${mark('cross')} Choose a playable study</h2><span class="mono catalog-ref">Collection 01 / 02 studies</span></div><aside class="bench-note"><span class="note-label mono">Bench note</span><p>Two 25-second tries per study. <strong>Try scalpel / try rongeur</strong> to compare a familiar find with a specialist one.</p></aside><div class="cards">${cards}</div><footer class="colophon mono"><span>Penicillion · Concept edition</span><span>Guest play / Unranked</span></footer></div>`;
}
function playShell(){
 document.body.dataset.view='game';document.body.dataset.theme=concept;document.title=dir.name+' · Penicillion';
 app.innerHTML=`<div class="game wrap"><nav class="game-nav"><a href="/" class="back">${mark('left')} All studies</a><div class="switches"><button id="sound" type="button"></button><button id="motion" type="button"></button></div></nav><div class="game-head"><div class="eyebrow">Study ${concept} <span>/</span> Daily Rounds</div><div class="heading-row"><h1>${dir.name}</h1><span class="issue mono">Trial issue 00</span></div></div><section class="instrument" aria-label="${dir.name} play area"><div class="scene-wrap"><canvas id="scene" role="img"></canvas><div class="scene-hud"><span class="hud-name mono"><i></i> ${dir.place}</span><span id="hud-progress" class="mono"></span></div><div id="scenestamp" class="scene-stamp mono"></div></div><div id="dock" class="dock" aria-busy="true"><p>Preparing your bench…</p></div></section><div class="game-foot mono"><span>Penicillion <b>/</b> Guest study</span><span>Unranked</span></div></div>`;
 $('#sound').addEventListener('click',()=>{sound=!sound;save('sound',sound?'on':'off');setSound(sound);settings();});
 $('#motion').addEventListener('click',()=>{still=!still;save('still',still?'on':'off');settings();});
 settings();motionPref.addEventListener('change',settings);
}
function settings(){
 const s=$('#sound'),m=$('#motion');if(!s||!m)return;
 s.innerHTML=svg(sound?'audio':'silent')+' Sound: '+(sound?'on':'off');s.setAttribute('aria-pressed',sound);s.title='Toggle sound';
 m.innerHTML=svg(reduced()?'still':'move')+' '+(reduced()?'Static scene':'Motion on');m.setAttribute('aria-pressed',reduced());m.title=motionPref.matches?'Using your reduced motion preference':'Toggle static scenery';
 m.disabled=motionPref.matches;
}
function primary(text,id){return `<button type="button" class="btn primary" id="${id}">${text} ${arrow}</button>`;}
function on(id,fn){document.getElementById(id).addEventListener('click',fn);}
function showError(msg){
 if(!$('#error'))$('#dock').append(elem('p','form-error'));const e=$('#error')??$('#dock .form-error');e.id='error';e.setAttribute('role','alert');e.textContent=msg;
}
function activateAudio(){if(sound)setSound(true);}
function update(stateIn,{soundEvent=false,focus=false}={}){
 const old=state, same=old&&old.phase===stateIn.phase&&old.roundId===stateIn.roundId;
 state=stateIn;offsetAt=performance.now();serverAt=stateIn.serverNow;
 if(!same){phaseAt=performance.now();}else if(state.phase==='prompt'&&$('#answer')){
   if(state.feedback){$('#note').textContent=state.feedback;$('#answer').setAttribute('aria-invalid','true');$('#answer').focus({preventScroll:true});$('#answer').select();}
   return;
 }
 const res=state.results.at(-1), pts=res?.points??0;
 const dock=$('#dock');dock.setAttribute('aria-busy','false');document.body.dataset.phase=state.phase;
 $('#scene').setAttribute('aria-label',sceneLabel(concept,state.phase,pts,state.total));
 $('#hud-progress').textContent=state.phase==='landing'?'PLATE '+concept+'–00':state.total+' '+dir.unit;
 $('#scenestamp').innerHTML=state.phase==='reveal'&&pts>=85?mark('spark')+' Specialist find':'';
 const take=`Take ${pad(state.take)} / 02`, pips='<span class="pips" aria-hidden="true"><i class="lit"></i><i class="'+(state.take===2?'lit':'')+'"></i></span>';
 if(state.phase==='landing'){
  dock.innerHTML=`<div class="landing-dock"><div><div class="label">Penicillion <b>/</b> Study ${concept}</div><h2>Daily Rounds</h2><p>Rarer correct answers earn more. Try the same prompt twice to see how your finds change the scene.</p></div><div class="action-stack">${primary('Play as guest','start')}<span class="mono">2 takes · 25 seconds each</span></div></div>`;
  on('start',()=>command('start'));
 }else if(state.phase==='prompt'){
  dock.innerHTML=`<div class="prompt-layout"><div class="question"><div class="label">${pips} ${take} <b>/</b> Instruments</div><h2 id="question"></h2><p id="scope"></p></div><form id="entry" novalidate><div class="form-top"><label for="answer" class="label">Your answer</label><span id="clock" role="timer" aria-live="off">25 s</span></div><div class="input-row"><input id="answer" maxlength="80" autocomplete="off" autocapitalize="off" enterkeyhint="go" spellcheck="false" placeholder="Instrument name" aria-describedby="scope note"><button class="btn primary" type="submit">Submit</button></div><progress id="fuse" value="25" max="25" aria-label="Time remaining"></progress><div class="under-input"><span id="note" role="status"></span><button type="button" id="skip" class="link-btn">Skip take</button></div></form></div>`;
  $('#question').textContent=state.prompt;$('#scope').textContent=state.scope;
  $('#entry').addEventListener('submit',e=>{e.preventDefault();const val=$('#answer').value.trim();if(!val){$('#note').textContent='Type a tool name first.';$('#answer').focus();return;}command('answer',val);});
  on('skip',()=>command('skip'));
  if(focus&&matchMedia('(pointer:fine)').matches)$('#answer').focus({preventScroll:true});
  say(take+'. '+state.prompt);
 }else if(state.phase==='reveal'){
  const good=res.status==='accepted', last=state.take===2, name=good?res.term:res.status==='timeout'?'Time’s up':'Take skipped';
  dock.innerHTML=`<div class="reward"><div class="award"><span class="label">${take} · Award</span><strong></strong><span class="points-label mono">Points</span></div><div class="finding"><div class="label" id="tier"></div><h2></h2><p class="fact"></p><details class="rationale"><summary>Field notes &amp; source</summary><div></div></details></div><div class="reveal-action">${primary(last?'View specimen log':'Next take','next')}<span class="mono">Read at your pace</span></div></div>`;
  $('.award strong').textContent='+'+pts;$('#tier').textContent=good?res.tier:'Unscored';$('.finding h2').textContent=name;$('.fact').textContent=good?res.fact:(res.status==='timeout'?'The clock ran out. Your earlier finds are safe.':'You left this entry blank. Your earlier finds are safe.');
  if(good){const detail=$('.rationale div');detail.append(elem('p','',res.reason));const a=elem('a','',res.source.label);a.insertAdjacentHTML('beforeend',mark('out'));a.href=res.source.url;a.target='_blank';a.rel='noopener noreferrer';detail.append(a);}else $('.rationale').remove();
  on('next',()=>command('next'));if(focus)$('#next').focus({preventScroll:true});if(sound&&soundEvent&&good)soundCue(concept,'accept',pts);
  say(name+'. '+(good?res.tier+'. ':'')+pts+' points. '+state.total+' '+dir.unit+'.');
 }else if(state.phase==='recap'){
  dock.innerHTML=`<div class="recap"><div><div class="label">Study ${concept} · Complete</div><h2>Specimen log</h2><p id="final-score"></p></div><ol class="entries"></ol><div class="recap-actions"><a class="btn primary" href="/?study=${dir.other}">Try ${dirs[dir.other].name} ${arrow}</a><button id="replay" class="link-btn">Replay this study</button></div></div>`;
  $('#final-score').append(elem('strong','',state.total),' / 200 points');
  for(const [i,r] of state.results.entries()){const li=elem('li');li.append(elem('span','index mono',pad(i+1)),elem('span','recap-term',r.status==='accepted'?r.term:r.status==='timeout'?'Time expired':'Skipped'),elem('span','recap-tier',r.points?r.tier:'Unscored'),elem('b','mono','+'+r.points));$('.entries').append(li);}
  on('replay',()=>command('replay'));if(sound&&soundEvent)soundCue(concept,'recap',state.total);say('Specimen log: '+state.total+' points from two takes.');if(focus)$('.recap-actions a').focus({preventScroll:true});
 }
 renderAt($('#scene'),concept,state.phase,pts,state.total,performance.now(),phaseAt);
}
async function sync({initial=false}={}){
 const v=version;
 try{
 const r=await fetch('/api/demo/'+concept,{cache:'no-store'});if(!r.ok)throw Error();
 const s=await r.json();if(v===version&&!busy)update(s,{focus:initial?false:state?.phase!==s.phase});
 }catch{if(initial){$('#dock').innerHTML='<p>The local bench could not open.</p><button type="button" class="btn" id="retry">Try again</button>';on('retry',()=>sync({initial:true}));}else showError('Connection interrupted. Reconnecting to your saved take…');}
}
async function command(action,answer){
 if(busy||!state)return;activateAudio();busy=true;version++;
 const data={action,commandId:crypto.randomUUID()};if(['answer','skip','next'].includes(action))data.roundId=state.roundId;if(answer)data.answer=answer;
 const activeForm=$('#entry');if(activeForm){$('#answer').readOnly=true;$('#entry button[type=submit]').disabled=true;$('#skip').disabled=true;}$('#dock').setAttribute('aria-busy','true');
 try{
 const r=await fetch('/api/demo/'+concept,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const s=await r.json();
 if(r.ok||s.state){update(r.ok?s:s.state,{soundEvent:r.ok,focus:true});if(r.ok&&action!=='answer'&&state.phase==='prompt')say('New take. '+state.prompt);}else showError(s.error??'Please try again.');
 }catch{showError('The local bench did not respond. Checking your saved take…');setTimeout(()=>sync(),700);}
 finally{busy=false;$('#dock').setAttribute('aria-busy','false');if($('#entry')){$('#answer').readOnly=false;$('#entry button[type=submit]').disabled=false;$('#skip').disabled=false;}}
}
let lastPaint=-Infinity;
function frame(t){
 if(!document.hidden){
 if(t-lastPaint>=(reduced()?350:85)){
 lastPaint=t;
 if(concept){if(state)renderAt($('#scene'),concept,state.phase,state.results.at(-1)?.points??0,state.total,t,phaseAt);}
 else{for(const id of ['A','B'])renderAt($('#art-'+id),id,'landing',0,0,t,0);}
 }
 if(concept&&state?.phase==='prompt'){
 const left=Math.max(0,(state.deadline-(serverAt+performance.now()-offsetAt))/1000);
 if($('#clock')){$('#clock').textContent=Math.ceil(left)+' s';$('#clock').classList.toggle('low',left<=5);$('#fuse').value=left;}
 if(!left&&!busy&&!expiring&&t>nextSyncAt){expiring=true;nextSyncAt=t+800;sync().finally(()=>{expiring=false;});}
 }
 }
 requestAnimationFrame(frame);
}
if(!concept)chooser();else {playShell();sync({initial:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)sync();});window.addEventListener('pageshow',e=>{if(e.persisted)sync();});}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat)e.preventDefault();else if(e.key==='Enter'&&!e.isComposing&&state?.phase==='reveal'&&(e.target===document.body||e.target===$('#dock'))){e.preventDefault();command('next');}});
requestAnimationFrame(frame);

// Some mobile browsers resize only the visual viewport for their keyboard.
// Collapse the same chrome there without moving or blurring the answer field.
function fitKeyboard(){
 const v=window.visualViewport;
 const compact=Boolean(v&&window.innerWidth<=640&&v.scale<1.1&&
   document.activeElement?.id==='answer'&&v.height<window.innerHeight-85);
 document.body.classList.toggle('keyboard-fit',compact);
 if(compact)requestAnimationFrame(()=>{
   const button=document.querySelector('#entry button[type=submit]');
   if(!button)return;
   const overflow=button.getBoundingClientRect().bottom-(v.offsetTop+v.height-8);
   if(overflow>0)window.scrollBy(0,Math.ceil(overflow));
 });
}
if(concept&&window.visualViewport){
 window.visualViewport.addEventListener('resize',fitKeyboard);
 document.addEventListener('focusin',fitKeyboard);
 document.addEventListener('focusout',()=>requestAnimationFrame(fitKeyboard));
}
