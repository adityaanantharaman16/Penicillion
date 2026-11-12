// Raster primitives for the two 152-pixel-high stage sets. Each stroke lands on the grid.
export class Pixels {
  constructor(context) { this.c = context; }

  rect(x, y, w, h, color) {
    this.c.fillStyle = color;
    this.c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  line(x, y, x2, y2, color, size = 1) {
    x = Math.round(x); y = Math.round(y);
    x2 = Math.round(x2); y2 = Math.round(y2);
    const dx = Math.abs(x2 - x), dy = -Math.abs(y2 - y);
    const sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1;
    let error = dx + dy;
    this.c.fillStyle = color;
    while (true) {
      this.c.fillRect(x,y,size,size);
      if (x === x2 && y === y2) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
  }

  path(points, color, size = 1) {
    for (let i = 2; i < points.length; i += 2)
      this.line(points[i-2], points[i-1], points[i], points[i+1], color, size);
  }

  polygon(points, color) {
    const ys = points.filter((_,i) => i % 2);
    this.c.fillStyle = color;
    for (let y = Math.ceil(Math.min(...ys)); y < Math.max(...ys); y++) {
      const cuts = [], scan = y + 0.5;
      for (let i = 0, j = points.length-2; i < points.length; j=i, i+=2) {
        const x1 = points[j], y1 = points[j+1], x2 = points[i], y2 = points[i+1];
        if ((y1 <= scan && y2 > scan) || (y2 <= scan && y1 > scan))
          cuts.push(x1 + (scan-y1) * (x2-x1) / (y2-y1));
      }
      cuts.sort((a,b) => a-b);
      for (let i = 0; i+1 < cuts.length; i+=2) {
        const x = Math.ceil(cuts[i]-0.5);
        this.c.fillRect(x, y, Math.ceil(cuts[i+1]-0.5)-x, 1);
      }
    }
  }

  oval(x, y, rx, ry, color) {
    x=Math.round(x); y=Math.round(y); rx=Math.max(1,Math.round(rx)); ry=Math.max(1,Math.round(ry));
    this.c.fillStyle=color;
    for (let row=-ry; row<=ry; row++) {
      const span=Math.floor(rx*Math.sqrt(Math.max(0,1-(row*row)/((ry+0.35)*(ry+0.35)))));
      this.c.fillRect(x-span,y+row,span*2+1,1);
    }
  }

  ring(x,y,rx,ry,color,from=0,to=Math.PI*2) {
    const count=Math.ceil((to-from)*Math.max(rx,ry));
    let px=x+rx*Math.cos(from), py=y+ry*Math.sin(from);
    for(let i=1;i<=count;i++) {
      const t=from+(to-from)*i/count;
      const nx=x+rx*Math.cos(t), ny=y+ry*Math.sin(t);
      this.line(px,py,nx,ny,color); px=nx; py=ny;
    }
  }

  local(x,y,fn) { this.c.save(); this.c.translate(Math.round(x),Math.round(y)); fn(); this.c.restore(); }
}

// Seeded ornaments keep every shelf, grain line and specimen consistent between poses.
export function seeded(seed) {
  return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed / 4294967296; };
}

export function clamp(value, min=0, max=1) { return Math.min(max,Math.max(min,value)); }
