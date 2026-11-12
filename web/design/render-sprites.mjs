// Export the actual game sprites as an editable strip of SVG pixel runs.
// Run from any working directory with Node 24.
import {writeFileSync} from 'node:fs';
import {Pixels} from '../art/pixels.js';
import {keeper} from '../art/culture.js';

const width=64*4, height=62;
const pixels=Array.from({length:height},()=>Array(width));
const stack=[];
const surface={
  x:0,y:0,fillStyle:'',
  save(){stack.push([this.x,this.y]);},
  restore(){[this.x,this.y]=stack.pop();},
  translate(x,y){this.x+=x;this.y+=y;},
  fillRect(x,y,w,h) {
    for(let row=this.y+y;row<this.y+y+h;row++)
      for(let col=this.x+x;col<this.x+x+w;col++)
        if(row>=0 && row<height && col>=0 && col<width) pixels[row][col]=this.fillStyle;
  }
};
const p=new Pixels(surface);
for(let frame=0;frame<4;frame++) {
  const x=frame*64+34;
  keeper(p,x,60,frame,false);
}
const byColor=new Map();
for(let y=0;y<height;y++) {
  for(let x=0;x<width;) {
    const color=pixels[y][x];
    let end=x+1;
    while(end<width&&pixels[y][end]===color)end++;
    if(color)byColor.set(color,(byColor.get(color)??'')+'M'+x+' '+y+'h'+(end-x)+'v1H'+x+'z');
    x=end;
  }
}
const paths=Array.from(byColor,([color,d])=>'<path fill="'+color+'" d="'+d+'"/>');
writeFileSync(new URL('./sprites.svg',import.meta.url),[
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="62" viewBox="0 0 256 62" shape-rendering="crispEdges">',
  '<title>Four idle poses for the Penicillion spore keeper</title>',...paths,'</svg>',''
].join('\n'));
