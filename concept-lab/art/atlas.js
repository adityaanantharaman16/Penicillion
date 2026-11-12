import {clamp,seeded} from './pixels.js';

const ink='#252e31', charcoal='#3d4743', deep='#223732';
const darkBrass='#89582f', brass='#c68c48', gold='#efc674', light='#fff2b9';
const mint='#c8dec4', verdigris='#618a80', ivory='#fff2cc';

function apothecaryBottle(p,x,y,w,h,glass) {
  p.local(x,y,()=>{
    const neck=Math.round(w*.45), lip=Math.round(w*.56), shoulder=Math.round(h*.28);
    p.rect(-neck/2,0,neck,shoulder+1,ink);
    p.rect(-lip/2,-1,lip,3,darkBrass);
    p.rect(-lip/2,0,lip,1,brass);
    p.polygon([-neck/2,shoulder-2, -w/2,shoulder+2, -w/2,h-2, -w/2+2,h, w/2-1,h, w/2,h-2, w/2,shoulder+2, neck/2,shoulder-2],ink);
    p.polygon([-neck/2+1,shoulder-1,-w/2+1,shoulder+3,-w/2+1,h-2,w/2-2,h-2,w/2-1,shoulder+3,neck/2-1,shoulder-1],glass);
    p.rect(-w/2+2,shoulder+3,1,h-shoulder-7,mint);
    if(w>8) {
      p.rect(-w/2+2,h*.58,w-4,h*.25,'#e4c394');
      p.rect(-w/2+3,h*.58+2,w-7,1,'#735e47');
    }
  });
}

function books(p,x,y) {
  p.local(x,y,()=>{
    for(const [start,w,h,binding] of [[0,27,6,'#335a55'],[2,30,5,'#925f42'],[-1,25,6,'#526e67']]) {
      p.rect(start,-h,w,h,ink); p.rect(start+1,-h+1,w-2,h-2,binding);
      p.rect(start+4,-h+1,w-7,h-2,'#cfbd95'); p.rect(start+5,-2,w-9,1,'#a49a79');
      p.c.translate(0,-h);
    }
  });
}

export function atlasBench(p,w) {
  const center=Math.round(w*.5), windowW=Math.max(148,Math.round(w*.77));
  const left=center-windowW/2, right=center+windowW/2;
  p.rect(0,0,w,152,'#8c8772');
  // A glazed bay with blue-hour hills beyond it, seen from the darker reading room.
  p.rect(left-7,0,windowW+14,104,'#484d45');
  p.rect(left-4,0,windowW+8,99,'#a49c7d');
  p.rect(left,0,windowW,95,'#90b7af');
  const sky=['#96bbb4','#abcac0','#c0d6c4','#d8dfc3','#e0dfbd'];
  sky.forEach((c,i)=>p.rect(left,16+i*13,windowW,15,c));
  const moon=center-Math.round(Math.min(73,windowW*.32));
  p.oval(moon,26,16,16,'#d4dbb9'); p.oval(moon,26,13,13,'#fff0c4');
  p.oval(moon-4,23,3,2,'#f1e5bb'); p.oval(moon+5,30,2,2,'#f1e5bb');
  const rng=seeded(43);
  for(let i=0;i<50;i++) {
    const x=left+rng()*windowW,y=rng()*58;
    p.rect(x,y,1,1,'#e0e5c9');
  }
  for(const [peak,color,y] of [[17,'#97bcb1',79],[14,'#7ea49b',86],[9,'#688c84',91]]) {
    let x=left;
    while(x<right) {
      const span=4+Math.round(rng()*6);
      const edge=y-peak*(.50+.35*Math.sin(x*.055+y)+.15*Math.sin(x*.17));
      p.rect(x,edge,Math.min(span,right-x),95-edge,color); x+=span;
    }
  }
  // Window mullions, transom and their glancing reflection.
  for(const x of [left,center-windowW*.20,center+windowW*.22,right-4]) {
    p.rect(x,0,4,96,'#61756a'); p.rect(x+1,0,1,95,'#b8bea1'); p.rect(x+4,0,1,94,'#a3bda9');
  }
  p.rect(left,51,windowW,3,'#728779'); p.rect(left,54,windowW,1,'#d1d4b1');
  p.rect(left-6,95,windowW+12,5,'#605e4d');
  p.rect(left-5,95,windowW+10,2,'#cab58c'); p.rect(left,97,windowW,1,'#e8d2a3');
  // Books and stain bottles frame the bay. The centre of the window stays open.
  for (const side of [0,1]) {
    const shelfX=side?right+5:0, shelfW=side?w-shelfX:left-5;
    p.rect(shelfX,0,shelfW,101,'#4a554b');
    for(const yy of [33,67,98]) {
      for(let x=shelfX+3;x<shelfX+shelfW-4;) {
        const bw=3+Math.floor(rng()*5), bh=8+Math.floor(rng()*16);
        if(x+bw>shelfX+shelfW-1) break;
        const colors=['#71847a','#8f8067','#65786d','#a28a67','#96765b'];
        const col=colors[Math.floor(rng()*colors.length)];
        p.rect(x,yy-bh,bw,bh,col); p.rect(x+1,yy-bh+2,Math.max(1,bw-2),1,'#c2a77e');
        if(bw>5) p.rect(x+1,yy-5,bw-2,1,'#b0a389');
        x+=bw+1;
      }
      p.rect(shelfX,yy,shelfW,4,'#37473f'); p.rect(shelfX,yy,shelfW,1,'#a09774');
    }
  }
  p.rect(0,101,w,51,'#b2936d'); p.rect(0,102,w,4,'#c5a77d');
  p.polygon([left,103,center-12,103,center-54,142,left-46,142],'#d9c298');
  p.polygon([center+8,103,right,103,right-16,142,center-28,142],'#d3b991');
  for(let i=0;i<110;i++) {
    const x=rng()*w, y=106+rng()*35;
    p.rect(x,y,1+rng()*9,1,i%4===0?'#debf93':'#b39772');
  }
  p.rect(0,142,w,2,'#e1bf8c'); p.rect(0,144,w,8,'#785b48'); p.rect(0,147,w,1,'#927352');
  books(p,center-106,123);
  apothecaryBottle(p,center+89,96,12,24,'#49776e');
  apothecaryBottle(p,center+105,98,10,20,'#9e7545');
  // A slanting fountain pen and broad open folio, viewed foreshortened on the desk.
  p.local(center+64,130,()=>{
    p.polygon([-19,0,0,-6,11,-7,34,-4,47,3,22,5,7,9,-20,6],'#665b48');
    p.polygon([-20,-1,-2,-7,10,-7,14,1,7,6,-21,4],'#f4e1b1');
    p.polygon([10,-7,28,-8,39,-5,45,1,23,2,7,6,14,0],'#e5d2a5');
    for(const y of [-3,-1,1]) {
      p.line(-12,y+2,4,y-2,'#c7ad85'); p.line(17,y,31,y-2,'#bba47b');
    }
    p.line(25,-10,43,0,'#31443d',2); p.line(23,-11,27,-9,'#bd9453');
  });
}

function barrel(p,x,y,x2,y2,width,colors) {
  const dx=x2-x,dy=y2-y, len=Math.hypot(dx,dy);
  const nx=-dy/len,ny=dx/len;
  const bands=[[-.5,.5,colors[0]],[-.41,.39,colors[1]],[-.27,.19,colors[2]],[-.17,-.05,colors[3]]];
  for (const [a,b,col] of bands) {
    p.polygon([x+width*a*nx,y+width*a*ny,x2+width*a*nx,y2+width*a*ny,
      x2+width*b*nx,y2+width*b*ny,x+width*b*nx,y+width*b*ny],col);
  }
}

export function moth(p,x,y,frame) {
  p.local(x,y,()=>{
    if(frame===1) {
      p.polygon([-6,-1,-8,-5,-4,-6,0,-1,4,-6,8,-5,6,0,1,2,-1,2],'#4c5c49');
      p.line(-6,-4,-2,0,'#f7d78a',2); p.line(2,-1,6,-4,'#f7d78a',2);
    } else {
      p.polygon([-8,-2,-8,-6,-2,-3,0,0,3,-4,8,-7,8,-2,5,2,2,3,0,2,-3,4,-6,1],ink);
      p.polygon([-7,-4,-2,-2,0,1,-3,2,-6,0],'#e7b36b');
      p.polygon([1,1,4,-3,7,-5,6,-1,3,2],'#f2cf84');
      p.rect(-5,-1,1,1,ivory); p.rect(4,-1,1,1,ivory);
    }
    p.rect(0,-1,1,4,ink);
  });
}

export function microscope(p,w,state) {
  const cx=Math.round(w*.5);
  const click=state.phase==='reveal'&&state.elapsed<230&&!state.reduced?2:0;
  p.local(cx,8,()=>{
    p.oval(5,120,49,5,'#978467'); p.oval(4,120,35,3,'#776c55');
    // Heavy horseshoe foot; the lighter front bevel outlines the hollow.
    p.polygon([-36,112,-14,106,11,103,27,105,33,110,35,118,29,122,16,123,-1,120,-19,125,-37,123,-40,120],ink);
    p.polygon([-36,112,-13,108,11,105,26,106,31,110,31,116,26,117,14,117,0,115,-18,120,-36,119],charcoal);
    p.path([-36,114,-17,114,-2,110,17,108,27,109],'#8b9478');
    p.path([-35,121,-19,122,-1,117,14,120,27,119],brass);
    // Cast yoke; an open crescent of window is visible between it and the objective.
    p.polygon([-5,107,4,100,12,89,17,76,16,65,11,56,1,51,-12,48,-17,45,-17,36,-9,31,1,32,16,39,27,50,33,66,35,79,31,92,22,102,17,112],ink);
    p.polygon([-3,105,8,99,17,88,21,76,20,63,15,52,6,46,-10,43,-13,39,-9,34,0,34,14,40,25,51,30,66,32,78,28,90,19,101,14,109],darkBrass);
    p.polygon([4,103,17,91,24,77,23,64,17,51,8,44,-10,40,-9,35,0,35,14,41,24,52,28,66,29,78,25,89,16,101,12,106],brass);
    p.path([-9,35,0,35,13,41,23,52,27,65],gold,2);
    p.path([26,78,24,86,18,96,12,101],gold);
    // Focusing joint, coarse knurling and concentric screw.
    p.oval(15,52,12,12,ink); p.oval(15,51,10,10,darkBrass); p.oval(14,50,8,8,gold);
    for(let i=0;i<16;i++) {
      const a=i*Math.PI/8; p.rect(15+Math.cos(a)*9,51+Math.sin(a)*9,1,2,'#8f7143');
    }
    p.oval(15,51,6,6,'#b48247'); p.oval(14,50,4,4,'#e5b466'); p.line(12,52,16,48,ink);
    // Two linked barrels and the rotating objective assembly beneath their junction.
    const warm=[ink,darkBrass,brass,light], black=[ink,'#344441','#657767','#9aab8d'];
    barrel(p,-28,15,-6,48,14,warm); barrel(p,-26,19,-22,25,17,black);
    barrel(p,-33,7,-27,17,11,black); barrel(p,-35,6,-32,11,17,black);
    barrel(p,-29,15,-27,18,15,warm); barrel(p,-11,42,-8,47,17,warm);
    p.local(0,click,()=>{
      barrel(p,-7,46,-3,52,16,black);
      barrel(p,-11,51,-16,62,6,warm); barrel(p,-5,52,-5,68,8,black);
      barrel(p,-5,56,-5,63,8,warm); p.rect(-8,65,6,4,'#313c3a'); p.rect(-7,68,4,2,verdigris);
      barrel(p,-1,51,5,60,6,warm);
    });
    // Stage, coverslip, spring clips, and substage mirror on its articulated arm.
    p.polygon([-31,76,-2,70,20,73,13,79,-18,84,-33,81],ink);
    p.polygon([-31,75,-2,69,20,72,11,77,-20,81,-32,79],'#65796c');
    p.polygon([-21,75,-3,71,11,73,-9,77],mint); p.rect(-8,73,5,2,'#be856b');
    p.line(-25,77,-14,75,gold); p.line(5,73,10,72,gold);
    p.line(-16,83,-11,96,ink,3); p.line(-11,96,-3,98,ink,3); p.line(-3,98,9,90,ink,3);
    p.polygon([-15,94,-6,87,4,85,8,88,7,92,-4,99,-14,99,-17,97],ink);
    p.polygon([-14,94,-5,88,4,87,6,89,4,92,-5,97,-14,97],verdigris);
    p.polygon([-12,94,-4,89,4,88,0,92,-8,96],mint);
    // An atlas moth has made its home on the focus arm.
    const frame=state.reduced?0:Math.floor(state.time/540)%4;
    moth(p,32,78+(frame===2?1:0),frame===3?1:0);
  });
}

function specimen(p,x,y,rx,ry,detail,seed) {
  const rng=seeded(seed);
  p.local(x,y,()=>{
    const bands=['#ad9a64','#dac783','#997b47','#deae60','#805f37','#d6a45b','#ecd386','#725a3b','#d4a05e'];
    const count=detail?9:4;
    for(let i=0;i<count;i++) {
      const k=1-i/(count+1), points=[];
      for(let j=0;j<64;j++) {
        const theta=j*Math.PI/32;
        const ripple=1+.035*Math.sin(theta*5+i*.3)+.025*Math.cos(theta*9+seed);
        points.push(Math.cos(theta)*rx*k*ripple,Math.sin(theta)*ry*k*ripple);
      }
      p.polygon(points,bands[i]);
      for(let j=0;j<(detail?16:5);j++) {
        const a=(j+rng()*.75)*Math.PI*2/(detail?16:5), b=a+.11+rng()*.07;
        p.line(Math.cos(a)*rx*k*.96,Math.sin(a)*ry*k*.96,Math.cos(b)*rx*k*.96,Math.sin(b)*ry*k*.96,'#6c593e');
      }
    }
    p.oval(0,0,rx*.15,ry*.17,'#274c4a'); p.oval(-1,-1,rx*.09,ry*.10,'#143534');
  });
}

function plateFrame(p,w) {
  p.rect(0,0,w,152,'#d1be96');
  p.rect(5,4,w-10,144,'#f4e4bd'); p.rect(8,7,w-16,1,'#b3a482');
  p.rect(8,144,w-16,1,'#b3a482');
  const rng=seeded(23);
  for(let i=0;i<w*2;i++) p.rect(rng()*w,6+rng()*140,1,1,'#e8d9b5');
  for(let i=0;i<4;i++) {
    const x=i%2?w-13:12, y=i<2?12:139;
    p.line(x-3,y,x+3,y,'#938468'); p.line(x,y-3,x,y+3,'#938468');
  }
}

export function atlasField(p,w,state,progress) {
  const cx=Math.round(w/2), cy=75;
  const rare=state.total>=60, crown=(state.marks??[]).some(n=>n===100);
  if(rare) plateFrame(p,w);
  else p.rect(0,0,w,152,'#344e48');
  const R=rare?54:44;
  p.oval(cx+2,cy+3,R+11,R+11,rare?'#c9b995':'#2a403d');
  p.oval(cx,cy,R+11,R+11,ink); p.oval(cx,cy,R+9,R+9,brass);
  p.oval(cx,cy,R+7,R+7,rare?gold:'#c8ac73'); p.oval(cx,cy,R+6,R+6,darkBrass);
  p.oval(cx,cy,R+4,R+4,'#203432'); p.oval(cx,cy,R+1,R+1,'#54776a');
  p.oval(cx,cy,R,R,'#224946');
  for(let i=0;i<72;i++) {
    const a=i*Math.PI/36; const r1=R+7, r2=R+(i%6===0?10:8);
    p.line(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1,cx+Math.cos(a)*r2,cy+Math.sin(a)*r2,'#775f40');
  }
  const rng=seeded(26);
  for(let i=0;i<420;i++) {
    const x=(rng()*2-1)*R,y=(rng()*2-1)*R;
    if(x*x+y*y<(R-2)**2) p.rect(cx+x,cy+y,1+rng()*2,1,i%5===0?'#608675':'#345c53');
  }
  const settle=state.reduced?1:clamp((progress-.30)/.58);
  const magnify=.65+settle*.35;
  if(rare) {
    specimen(p,cx-11,cy-7,28*magnify,32*magnify,true,17);
    specimen(p,cx+23,cy+14,17*magnify,19*magnify,true,28);
    specimen(p,cx-20,cy+29,12*magnify,11*magnify,true,43);
    // Three pen leaders turn the locked final composition into a mounted atlas plate.
    const callout='#918468';
    p.path([cx+22,cy-18,cx+49,cy-40,cx+67,cy-43,cx+83,cy-43],callout);
    p.path([cx-22,cy+21,cx-46,cy+47,cx-66,cy+49,cx-80,cy+49],callout);
    p.rect(cx+82,cy-46,1,5,callout); p.rect(cx-82,cy+46,1,5,callout); p.rect(cx-84,cy+46,1,5,callout);
    if(state.total>90) {
      specimen(p,cx+14,cy-34,8,9,true,31);
      p.path([cx+17,cy-40,cx+45,cy-51,cx+56,cy-56,cx+71,cy-56],callout);
    }
    if(crown) {
      const sealX=Math.min(w-27,cx+79), sealY=119;
      p.polygon([sealX-8,sealY+4,sealX-10,sealY+22,sealX-5,sealY+19,sealX-2,sealY+23,sealX+1,sealY+7],'#8c4e40');
      p.polygon([sealX,sealY+6,sealX+2,sealY+24,sealX+7,sealY+18,sealX+12,sealY+19,sealX+8,sealY+3],'#ae6951');
      const rosette=[];
      for(let i=0;i<32;i++) {
        const a=i*Math.PI/16,r=i%2?10:13;
        rosette.push(sealX+Math.cos(a)*r,sealY+Math.sin(a)*r);
      }
      p.polygon(rosette,'#8c5e37'); p.oval(sealX,sealY-1,9,9,gold);
      p.ring(sealX,sealY-1,7,7,darkBrass);
      p.polygon([sealX,sealY-6,sealX+2,sealY-2,sealX+5,sealY-1,sealX+2,sealY+1,sealX,sealY+4,sealX-2,sealY+1,sealX-5,sealY-1,sealX-2,sealY-2],darkBrass);
    }
  } else {
    specimen(p,cx,cy,Math.max(4,13*magnify),Math.max(4,11*magnify),false,17);
    for(const [dx,dy] of [[-18,11],[19,-15],[15,19],[-20,-14]]) {
      p.oval(cx+dx,cy+dy,2,1,'#81a48c');
    }
    p.path([cx-R-9,cy,cx-R+6,cy],'#d5bf8c'); p.path([cx+R-6,cy,cx+R+9,cy],'#d5bf8c');
  }
  if(state.total>0) {
    const rail=Math.min(80,Math.round(w*.23)), x=cx-rail/2;
    p.rect(x,145,rail,2,rare?'#baac89':'#57746a');
    p.rect(x,145,Math.round(rail*clamp(state.total/200)),2,rare?darkBrass:gold);
  }
}
