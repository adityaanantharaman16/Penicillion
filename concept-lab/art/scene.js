import {Pixels,clamp} from './pixels.js';
import {atlasBench,atlasField,microscope} from './atlas.js';
import {cultureRoom,cultureDish} from './culture.js';

const backgrounds=new Map();
const lastPaints=new WeakMap();

function background(p,w,concept,lit) {
  const key=[w,concept,lit].join('/');
  let layer=backgrounds.get(key);
  if(!layer) {
    layer=document.createElement('canvas'); layer.width=w; layer.height=152;
    const paint=new Pixels(layer.getContext('2d'));
    if(concept==='A') atlasBench(paint,w); else cultureRoom(paint,w,lit);
    // Bound retained surfaces during resizing and rotation.
    if(backgrounds.size>=12) backgrounds.delete(backgrounds.keys().next().value);
    backgrounds.set(key,layer);
  }
  p.c.drawImage(layer,0,0);
}

function atlas(p,w,state) {
  const finished=state.phase==='reveal'||state.phase==='recap';
  const flash=finished&&state.points>0&&state.phase!=='recap';
  const progress=state.reduced||!flash?1:clamp(state.elapsed/1100);
  const held=finished&&state.total>0;
  if(!held||progress<.35) {
    background(p,w,'A',false);
    microscope(p,w,state);
    if(state.total>0&&!flash) {
      const slide=Math.min(28,Math.round(state.total/5));
      p.local(Math.round(w*.5)-48,131,()=>{
        p.polygon([0,0,14,-3,35,-1,21,3],'#526d62'); p.line(4,0,17,-2,'#decc9a');
        p.rect(slide,0,4,1,'#e3b873');
      });
      if(state.total>=60) {
        p.local(Math.round(w*.5)+67,126,()=>{
          p.polygon([-16,-26,13,-25,20,2,-10,4],'#806749');
          p.polygon([-17,-27,12,-26,18,1,-11,3],'#efdab1');
          p.oval(0,-13,8,9,'#446456'); p.ring(0,-13,6,7,'#d4b56a');
          p.ring(0,-13,4,4,'#bb9658'); p.rect(-4,-1,13,1,'#b29a76');
        });
      }
    }
  } else {
    const points=state.phase==='recap'?state.total:state.points;
    atlasField(p,w,{...state,points},progress);
  }
  // A brief iris closes across the view as the objective clicks into place.
  // Halfway through the shutter, the optics cut from the desk to the specimen.
  if(flash&&progress>.17&&progress<.59) {
    const a=progress<.35?(progress-.17)/.18:1-(progress-.35)/.24;
    const shutter=Math.round(77*a);
    p.rect(0,0,w,shutter,'#223a35');
    p.rect(0,152-shutter,w,shutter,'#223a35');
    if(shutter>2) {
      p.rect(0,shutter-1,w,1,'#617466');
      p.rect(0,152-shutter,w,1,'#617466');
    }
  }
}

export function renderScene(canvas,input) {
  const cssW=canvas.clientWidth||320, cssH=canvas.clientHeight||152;
  const w=Math.max(96,Math.min(1100,Math.round(cssW/cssH*152)));
  const state={phase:'landing',points:0,total:0,time:0,elapsed:0,reduced:false,marks:[],...input};
  const onReveal=state.phase==='reveal', moving=onReveal&&!state.reduced&&state.elapsed<1150;
  const pose=state.reduced?0:Math.floor(state.time/(state.concept==='A'?540:570))%4;
  const signature=[state.concept,w,state.phase,state.points,state.total,state.reduced,pose,moving?Math.floor(state.elapsed/45):'settled',...(state.marks||[])].join('/');
  if(lastPaints.get(canvas)===signature)return;
  lastPaints.set(canvas,signature);
  if(canvas.width!==w)canvas.width=w;
  if(canvas.height!==152)canvas.height=152;
  const c=canvas.getContext('2d',{alpha:false});
  c.imageSmoothingEnabled=false;
  const p=new Pixels(c);
  if(state.concept==='A') atlas(p,w,state);
  else {
    const lit=state.total>=60&&(state.phase==='recap'||state.phase==='prompt'||state.reduced||state.elapsed>450);
    background(p,w,'B',lit);
    cultureDish(p,w,state);
  }
}
