import {seeded,clamp} from './pixels.js';

const ink='#171c29', deep='#161f2b', shade='#293646', sea='#70ceac', milk='#d9edbf', coral='#ee957d';
const glyphs=['010110010010111','110001010100111','110001010001110','101101111001001','111100110001110','011100110101010','111001010010010'];

function jar(p,x,base,w,h,lit) {
  p.local(x,base-h,()=>{
    const neck=Math.round(w*.48), wall=lit?'#62837e':'#3f5561', inside=lit?'#3f6462':'#344253';
    p.polygon([-neck/2,0,neck/2,0,neck/2,4,w/2,7,w/2,h-2,w/2-1,h,-w/2+1,h,-w/2,h-2,-w/2,7,-neck/2,4],wall);
    p.polygon([-neck/2+1,2,neck/2-1,2,neck/2-1,5,w/2-1,8,w/2-1,h-2,-w/2+1,h-2,-w/2+1,8,-neck/2+1,5],inside);
    p.rect(-neck/2-1,-1,neck+2,3,lit?'#a58066':'#675566');
    p.rect(-w/2+2,9,1,Math.max(2,h-14),lit?'#8fa396':'#677384');
    p.rect(-w/2+4,h-7,Math.max(1,w-7),3,lit?'#bca787':'#7c7b7b');
  });
}

export function cultureRoom(p,w,lit) {
  const cx=Math.round(w/2), rng=seeded(84);
  p.rect(0,0,w,152,lit?'#263645':'#222b3d');
  // Individual wall tiles recede into the dark side of an incubation room.
  for(let row=0;row<5;row++) {
    const y=row*17-5;
    p.rect(0,y,w,1,lit?'#394352':'#31394a');
    for(let x=-18+(row%2)*21;x<w;x+=42) p.rect(x,y,1,17,lit?'#384450':'#2f3849');
  }
  const leftShelf = Math.max(-18,cx-157);
  for(const y of [31,60]) {
    let x=leftShelf+6;
    for(let n=0;n<7;n++) {
      const wid=6+Math.round(rng()*6), hei=10+Math.round(rng()*12);
      if(x>cx-43) break;
      jar(p,x,y,wid,hei,lit); x+=wid+4;
    }
    p.rect(leftShelf,y+1,Math.max(48,cx-39-leftShelf),4,'#171e2c'); 
    p.rect(leftShelf,y+1,Math.max(48,cx-39-leftShelf),1,'#5c5261');
    p.polygon([leftShelf+7,y+5,leftShelf+16,y+5,leftShelf+7,y+13],'#17202d');
  }
  // Recessed cabinet door and a little analogue dial on its face.
  const cabX=cx+62, cabW=Math.max(33,w-cabX-10);
  p.rect(cabX,3,cabW,65,'#151e2c'); p.rect(cabX+2,5,cabW-4,61,'#3b4251');
  p.rect(cabX+5,9,cabW-10,55,'#2d3949'); p.rect(cabX+9,14,cabW-18,15,'#1c2837');
  for(let i=0;i<Math.min(11,Math.floor(cabW/5));i++) p.rect(cabX+12+i*4,17,1,8,'#445462');
  if(cabW>52) {
    const paneX=cabX+29,paneW=cabW-47;
    p.rect(paneX-2,34,paneW+4,25,'#202c39'); p.rect(paneX,36,paneW,21,lit?'#547475':'#3d575c');
    for(let i=0;i<Math.floor(paneW/14);i++) {
      const x=paneX+7+i*14;
      p.oval(x,51,5,2,lit?'#b9c6a4':'#829995');
      p.oval(x,49,5,2,lit?'#97bb9d':'#698e84'); p.line(x-3,53,x+4,53,'#4d7471');
    }
    p.path([paneX,39,paneX+6,36],'#718c87'); p.path([paneX,43,paneX+12,36],'#627e7a');
  }
  p.oval(cabX+15,44,7,7,'#59646a'); p.oval(cabX+15,44,5,5,'#9b9a82');
  p.line(cabX+15,44,cabX+18,41,'#493a42'); p.rect(cabX+15,43,2,2,'#493a42');
  p.rect(cabX+cabW-12,38,3,12,'#68767a'); p.rect(cabX+cabW-11,39,1,8,'#a3a68e');
  const lamp=cx-13;
  p.rect(lamp-2,0,3,11,'#17202d'); p.rect(lamp-4,9,8,4,'#777673');
  p.polygon([lamp-9,13,lamp+8,13,lamp+18,24,lamp-19,24],'#14222b');
  p.polygon([lamp-7,13,lamp+7,13,lamp+15,22,lamp-15,22],'#637a76');
  p.polygon([lamp-7,14,lamp,14,lamp-6,21,lamp-13,21],'#95a995');
  p.oval(lamp,24,18,3,'#a79878'); p.oval(lamp,24,15,2,'#ffe4a4');
  p.c.save(); p.c.globalAlpha=lit?.13:.07;
  p.polygon([lamp-14,26,lamp+14,26,lamp+51,81,lamp-59,81],'#c3dfb9');
  p.c.restore();
  for(let i=0;i<23;i++) {
    const y=32+rng()*43, x=lamp+(rng()-.5)*(y-8);
    p.rect(x,y,1,1,lit?'#698681':'#586a6c');
  }
  // Slightly raked steel worktop and a wooden front rail.
  p.rect(0,75,w,7,'#172430'); p.rect(0,76,w,1,'#788185');
  p.rect(0,82,w,53,lit?'#40585a':'#334751'); p.rect(0,82,w,1,'#556c6d');
  for(const y of [92,113,131]) p.rect(0,y,w,1,lit?'#456060':'#3a5058');
  for(let i=0;i<120;i++) {
    const x=rng()*w,y=83+rng()*49;
    p.rect(x,y,1+Math.floor(rng()*5),1,i%5===0?'#647577':'#3e535a');
  }
  p.rect(0,135,w,17,'#202e39'); p.rect(0,135,w,2,'#687a76'); p.rect(0,138,w,2,'#182632');
  // A rack of miniature inoculation tubes, offset from the hero dish.
  p.local(cx-117,81,()=>{
    for(let i=0;i<4;i++) {
      p.rect(i*5,-14-i%2*3,3,15,'#7f9493'); p.rect(i*5+1,-11-i%2*3,1,8,'#c2c9b0');
      p.rect(i*5,-3,3,4,i%2?'#967c76':'#6da497'); p.rect(i*5-1,-15-i%2*3,5,1,'#45525f');
    }
    p.rect(-3,-4,24,2,'#a3826c'); p.rect(-3,1,24,2,'#5a5860');
  });
}

function brush(p,x,y,scale,angle,colorA,colorB) {
  const topX=x+Math.sin(angle)*scale*5, topY=y-Math.cos(angle)*scale*6;
  const spread=2.1*scale;
  p.line(x,y,topX,topY,colorA,Math.max(1,Math.round(scale)));
  for(let i=-1;i<=1;i++) {
    const tipX=topX+i*spread+Math.sin(angle)*scale*2;
    const tipY=topY-(i===0?4:3)*scale;
    p.line(topX,topY,tipX,tipY,colorA);
    p.oval(tipX,tipY,scale*1.5,scale*1.7,colorA);
    p.rect(tipX-1,tipY-1,Math.max(1,Math.round(scale)),1,colorB);
  }
}

export function keeper(p,x,y,frame,celebrate) {
  p.local(x,y,()=>{
    const bob=(frame===1||frame===2)?-1:0;
    p.oval(2,1,15,3,'#233c43');
    // Boots, little coat pockets and a coral scarf are legible between the stems.
    p.polygon([-10,-6,-3,-6,-3,1,-13,1,-13,-2],ink);
    p.polygon([3,-6,10,-6,13,-2,13,1,4,1],ink);
    p.rect(-11,-2,6,1,'#a88275'); p.rect(6,-2,5,1,'#a88275');
    p.c.translate(0,bob);
    p.polygon([-6,-23,6,-23,10,-19,13,-9,12,-4,-10,-4,-13,-7,-11,-18],ink);
    p.polygon([-6,-21,5,-21,9,-17,11,-7,4,-7,1,-9,-2,-6,-11,-7,-9,-17],'#92b3a1');
    p.polygon([-5,-20,1,-16,5,-20,6,-8,-2,-6,-3,-15],'#e4dfb9');
    p.rect(7,-13,3,2,'#517c77'); p.line(-8,-13,-7,-8,'#557c74');
    p.polygon([-10,-25,8,-25,9,-20,4,-18,-1,-19,-6,-17,-9,-20],ink);
    p.polygon([-9,-24,7,-24,7,-21,3,-20,-2,-21,-7,-19],coral);
    p.polygon([6,-21,12,-21,15,-18,19,-18,16,-15,11,-16,7,-19],'#d87970');
    // Teardrop-shaped face with a crown of branching brush heads.
    p.polygon([-13,-34,-10,-40,-4,-43,4,-43,11,-40,14,-34,13,-28,9,-25,3,-22,-5,-23,-10,-25,-14,-29],ink);
    p.polygon([-12,-33,-9,-39,-3,-41,4,-41,10,-38,12,-33,11,-28,7,-25,1,-24,-5,-25,-11,-28],'#a8d5af');
    p.polygon([-10,-36,-5,-39,1,-39,2,-36,-3,-34,-7,-31,-11,-31],'#e1e7ba');
    p.polygon([7,-39,10,-37,12,-33,11,-28,7,-25,3,-24,5,-27,8,-29], '#69aa94');
    const eyeH=frame===3?1:3;
    p.rect(-8,-32,2,eyeH,ink); p.rect(1,-32,2,eyeH,ink);
    p.rect(-10,-28,3,1,'#d78d7e'); p.rect(3,-28,3,1,'#d78d7e'); p.rect(-4,-27,3,1,'#41756d');
    p.path([-9,-38,-14,-43,-14,-49],'#5d9e88',2); brush(p,-14,-46,.9,-.63,'#75b89b','#c5e8b8');
    p.path([-4,-40,-6,-46,-5,-49],'#75b89b',2); brush(p,-5,-47,1.05,-.22,'#94cfaa','#d8eac1');
    p.path([1,-41,3,-46,6,-50],sea,2); brush(p,5,-48,1.06,.27,'#8ec9a3','#d6eac0');
    p.path([6,-39,11,-42,14,-46],'#6aa88f',2); brush(p,13,-44,.85,.66,'#7dbc9c','#cce7b5');
    // Outstretched forearm holds a loop over the glass.
    const hand=celebrate?-23:-14;
    p.path([-9,-19,-13,-17,-16,hand],'#21333a',4);
    p.path([-9,-19,-13,-17,-15,hand],'#abc6aa',2);
    p.line(-16,hand,-28,hand+3,'#35434b',2); p.line(-17,hand,-28,hand+2,'#cdb99c');
    p.ring(-30,hand+3,2,1,'#d6c8a6'); p.oval(-16,hand,2,2,sea);
  });
}

function colony(p,x,y,radius,accent=true) {
  const rng=seeded(Math.round(radius)*19);
  const rx=radius, ry=radius*.56, colors=accent?['#4b8f7c','#76be94','#b5da9e','#cee5a9']:['#997b6e','#cc937a','#e5b98a','#f3dbac'];
  for(let i=0;i<4;i++) {
    const k=1-i*.22, points=[];
    for(let j=0;j<48;j++) {
      const a=j*Math.PI/24, r=k*(1+.13*Math.sin(a*7)+.05*Math.sin(a*12));
      points.push(x+Math.cos(a)*rx*r,y+Math.sin(a)*ry*r);
    }
    p.polygon(points,colors[i]);
  }
  for(let i=0;i<radius*2;i++) {
    const a=rng()*Math.PI*2,r=Math.sqrt(rng())*.8;
    p.rect(x+Math.cos(a)*rx*r,y+Math.sin(a)*ry*r,1,1,i%5===0?'#eef0bd':'#8db993');
  }
}

function hyphae(p,cx,cy,rx,ry,strength) {
  const rng=seeded(317); 
  for(let i=0;i<22;i++) {
    const angle=i*Math.PI/11+(rng()-.5)*.15;
    const length=clamp(strength)*(0.69+rng()*.27);
    let x=cx,y=cy;
    for(let j=1;j<=12;j++) {
      const distance=length*j/12;
      const a=angle+.09*Math.sin(j*.7+i*.5);
      const nx=cx+Math.cos(a)*rx*distance, ny=cy+Math.sin(a)*ry*distance;
      p.line(x,y,nx,ny,j<5?'#d7e7ad':'#a1cc9e');
      const twig=a+(j%2?1:-1)*.64;
      const tx=x+Math.cos(twig)*rx*.11*length, ty=y+Math.sin(twig)*ry*.16*length;
      if(j%2===0) {
        p.line(x,y,tx,ty,'#87bda0'); p.line(tx,ty,tx+Math.cos(twig+.7)*rx*.045*length,ty+Math.sin(twig+.7)*ry*.08*length,'#78a98d');
      }
      if(j===12) p.rect(nx,ny,2,1,'#c5e3ab');
      x=nx;y=ny;
    }
  }
}

function sporophore(p,x,y,h,tilt) {
  if(h<2) return;
  const end=x+tilt;
  p.path([x,y,x-1,y-h*.35,end-1,y-h*.7,end,y-h],'#548f83',2);
  p.path([x,y-1,x,y-h*.38,end,y-h*.75,end,y-h],'#c0dda6');
  for(let i=-1;i<=1;i++) {
    const forkX=end+i*h*.21, forkY=y-h*(i===0?1.18:1.08);
    p.line(end,y-h*.78,forkX,forkY,'#a4d5a4',2);
    brush(p,forkX,forkY,h*.026,i*.25,'#a2cea0','#edf0bb');
  }
}

export function cultureDish(p,w,state) {
  const rx=Math.min(84,Math.round(w*.32)), ry=Math.round(rx*.37);
  const cx=Math.round(w*.49)-8, cy=96, charX=cx+Math.round(rx*.88);
  const reveal=state.phase==='reveal'&&state.points>0;
  const progress=state.reduced||state.phase==='recap'?1:clamp((state.elapsed-160)/860);
  const prior=Math.max(0,state.total-(reveal?state.points:0));
  const growth=prior+(reveal?state.points*progress:0);
  const rare=growth>=60;
  const marks=state.marks??[];
  const crown=marks.some(n=>n===100)&&(state.phase!=='reveal'||state.points!==100||progress>.70);
  const frame=state.reduced?0:Math.floor(state.time/570)%4;
  keeper(p,charX,86,frame,rare&&progress>.55);
  p.oval(cx+3,cy+11,rx+2,ry,'#23383e'); p.oval(cx,cy+7,rx,ry,ink);
  p.rect(cx-rx,cy,rx*2+1,8,'#446e70');
  p.oval(cx,cy+5,rx,ry,'#71a39a'); p.oval(cx,cy+3,rx,ry,'#345f61');
  p.oval(cx,cy,rx+1,ry+1,'#152d38'); p.oval(cx,cy-1,rx,ry,'#98c6b0');
  p.oval(cx,cy-1,rx-3,ry-2,'#437674'); p.oval(cx,cy-1,rx-5,ry-3,'#224e51');
  p.oval(cx,cy-1,rx-7,ry-5,rare?'#456f5c':'#355d56');
  for(let i=0,rng=seeded(55);i<160;i++) {
    const a=rng()*Math.PI*2,r=Math.sqrt(rng())*.93;
    const x=cx+Math.cos(a)*(rx-6)*r,y=cy-1+Math.sin(a)*(ry-5)*r;
    p.rect(x,y,1+rng()*2,1,i%5===0?'#7d9e83':'#486f61');
  }
  // A quiet starter culture anchors the bare dish. The colony and its patient spread
  // have different silhouettes even when the sound is off and animation is disabled.
  colony(p,cx-11,cy-3,6);
  colony(p,cx+25,cy+1,3,false);
  if(growth>0) {
    const intensity=clamp(growth/100);
    if(growth>15) hyphae(p,cx-1,cy,rx-8,ry-6,clamp((growth-15)/75));
    const radius=4+Math.round(7*Math.sqrt(clamp(growth/30))+6*intensity);
    colony(p,cx,cy,radius);
    if(growth>75) colony(p,cx-rx*.46,cy+5,3+Math.min(9,(growth-75)*.20),false);
    if(rare) {
      const rise=clamp((growth-52)/33);
      sporophore(p,cx-8,cy-4,rise*(28+7*intensity),-4);
      sporophore(p,cx+7,cy-1,rise*24,5);
      sporophore(p,cx-22,cy+5,rise*15,-3);
      if(crown) {
        // The highest tier raises two curved stems that meet above the ordinary fans.
        p.path([cx-23,cy+4,cx-30,cy-15,cx-29,cy-34,cx-21,cy-48,cx-10,cy-54,cx-1,cy-55],'#8ac6a0',2);
        p.path([cx+24,cy+4,cx+30,cy-12,cx+27,cy-33,cx+18,cy-46,cx+7,cy-54,cx-1,cy-55],'#a4d4a5',2);
        for(const [dx,dy] of [[-25,-40],[-16,-50],[-2,-55],[14,-49],[24,-37]]) {
          brush(p,cx+dx,cy+dy,.80,dx*.035,'#d5a282','#f9d6a5');
        }
      }
      if(rise>.82) {
        const rng=seeded(198);
        for(let i=0;i<13;i++) {
          const drift=state.reduced?0:(Math.floor(state.time/650)+i)%3;
          p.rect(cx-20+rng()*41,cy-30-rng()*17-drift,1+i%2,1,'#bad6aa');
        }
      }
    }
  } else if(state.phase==='landing') {
    colony(p,cx+3,cy,11);
    sporophore(p,cx,cy-1,13,-1);
    colony(p,cx-rx*.4,cy+3,4,false);
  } else {
    colony(p,cx+1,cy,3);
  }
  p.ring(cx,cy+2,rx-1,ry, '#d0e1b9',.24,1.0); 
  p.ring(cx,cy+2,rx-1,ry, '#7ba79d',1.38,2.46);
  p.ring(cx,cy-1,rx-2,ry-1,'#c5ddbb',3.55,4.48);
  p.ring(cx,cy+6,rx-2,ry-1,'#598480',.48,2.43);
  for(const f of [.28,.6,.79]) p.rect(cx+rx*f,cy+ry*Math.sqrt(1-f*f)+1,2,3,'#a0c6af');
  // The incubation rail has seven numbered wells, including future unfilled positions.
  const spacing=13, start=cx-3*spacing;
  for(let i=0;i<7;i++) {
    const x=start+i*spacing, filled=i<marks.length;
    p.oval(x,139,4,2,'#111e2b'); p.ring(x,139,4,2,'#6f8f88');
    if(filled&&marks[i]>0) p.oval(x,139,2,1,marks[i]>=60?coral:sea);
    if(filled&&marks[i]===0) p.line(x-2,139,x+2,139,'#b7b1a3');
    const glyph=glyphs[i];
    for(let n=0;n<15;n++) if(glyph[n]==='1') p.rect(x-1+n%3,143+Math.floor(n/3),1,1,'#a5b6a4');
  }
}
