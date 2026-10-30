const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const regionKey=(id,part='target')=>`${id}|${part}`;
export function regions(boxes){return boxes.flatMap(b=>(b.action==='move'?[{id:b.id,part:'source',g:b.src},{id:b.id,part:'target',g:b}]:[{id:b.id,part:'target',g:b}]).filter(r=>r.g).map(r=>({...r,key:regionKey(r.id,r.part)})));}
export function targetsFor(all,selected,guides,settings){
 const result={x:[],y:[]};
 if(settings.guides)for(const g of guides)result[g.axis].push({axis:g.axis,position:g.position,kind:'guide',id:g.id});
 if(settings.boxes)for(const r of all)if(!selected.has(r.key)){for(const [axis,length]of [['x','w'],['y','h']])for(const t of [0,.5,1])result[axis].push({axis,position:r.g[axis]+r.g[length]*t,kind:'box',id:r.key});}
 return result;
}
export function moveGroup(before,dx,dy,targets,screen,tolerance=6){
 const limits={x:[Math.max(...before.map(b=>-b.x)),Math.min(...before.map(b=>1-b.x-b.w))],y:[Math.max(...before.map(b=>-b.y)),Math.min(...before.map(b=>1-b.y-b.h))]};
 const delta={x:clamp(dx,...limits.x),y:clamp(dy,...limits.y)},snaps=[];
 for(const [axis,length]of [['x','w'],['y','h']]){let best=null;for(const b of before)for(const t of [0,.5,1])for(const target of targets[axis]||[]){const d=target.position-(b[axis]+b[length]*t+delta[axis]),distance=Math.abs(d)*screen[axis],next=delta[axis]+d;if(distance<=tolerance&&next>=limits[axis][0]-1e-10&&next<=limits[axis][1]+1e-10&&(!best||distance<best.distance))best={distance,delta:next,target};}if(best){delta[axis]=clamp(best.delta,...limits[axis]);snaps.push(best.target);}}
 return{geometries:before.map(b=>({...b,x:b.x+delta.x,y:b.y+delta.y})),snaps};
}
const active=(handle,axis)=>axis==='x'?/[we]/.test(handle):/[ns]/.test(handle);
const negative=(handle,axis)=>handle.includes(axis==='x'?'w':'n');
function normal(before,h,dx,dy,min){
 const delta={x:dx,y:dy};
 for(const [axis,length]of [['x','w'],['y','h']]){if(!active(h,axis)){delta[axis]=0;continue;}const neg=negative(h,axis),low=Math.max(...before.map(b=>neg?-b[axis]:min[length]-b[length])),high=Math.min(...before.map(b=>neg?b[length]-min[length]:1-b[axis]-b[length]));delta[axis]=clamp(delta[axis],low,high);}
 return{delta,geometries:before.map(b=>{const r={...b};for(const [axis,length]of [['x','w'],['y','h']])if(active(h,axis)){if(negative(h,axis)){r[axis]+=delta[axis];r[length]-=delta[axis];}else r[length]+=delta[axis];}return r;})};
}
function anchor(b,h){return{x:h.includes('w')?b.x+b.w:h.includes('e')?b.x:b.x+b.w/2,y:h.includes('n')?b.y+b.h:h.includes('s')?b.y:b.y+b.h/2,cx:h.includes('w')?1:h.includes('e')?0:.5,cy:h.includes('n')?1:h.includes('s')?0:.5};}
function scaleLimits(before,h,min){let low=0,high=Infinity;for(const b of before){const a=anchor(b,h);low=Math.max(low,min.w/Math.max(b.w,1e-12),min.h/Math.max(b.h,1e-12));for(const [axis,length,c]of [['x','w',a.cx],['y','h',a.cy]]){if(c>0)high=Math.min(high,a[axis]/(b[length]*c));if(c<1)high=Math.min(high,(1-a[axis])/(b[length]*(1-c)));}}return[low,Math.max(low,high)];}
const scaled=(before,h,s)=>before.map(b=>{const a=anchor(b,h),w=b.w*s,height=b.h*s;return{...b,x:a.x-w*a.cx,y:a.y-height*a.cy,w,h:height};});
export function resizeGroup(before,h,dx,dy,locked,targets,screen,min={w:.001,h:.001},tolerance=6){
 if(!locked){let current=normal(before,h,dx,dy,min),snaps=[];const desired={...current.delta};
  for(const [axis,length]of [['x','w'],['y','h']]){if(!active(h,axis))continue;let best=null;for(let i=0;i<before.length;i++){const b=current.geometries[i],edge=b[axis]+(negative(h,axis)?0:b[length]);for(const target of targets[axis]||[]){const d=target.position-edge,distance=Math.abs(d)*screen[axis];if(distance<=tolerance&&(!best||distance<best.distance))best={distance,delta:current.delta[axis]+d,target};}}if(best){desired[axis]=best.delta;snaps.push(best.target);}}
  current=normal(before,h,desired.x,desired.y,min);snaps=snaps.filter(t=>current.geometries.some(b=>Math.abs(b[t.axis]+(negative(h,t.axis)?0:b[t.axis==='x'?'w':'h'])-t.position)<1e-8));return{geometries:current.geometries,snaps};
 }
 const b=before[0],useX=active(h,'x'),useY=active(h,'y'),sx=(negative(h,'x')?-1:1)*dx,sy=(negative(h,'y')?-1:1)*dy;
 const wx=b.w*screen.x,hy=b.h*screen.y;let s=1+(useX&&useY?(sx*screen.x*wx+sy*screen.y*hy)/Math.max(1e-12,wx*wx+hy*hy):useX?sx/Math.max(b.w,1e-12):sy/Math.max(b.h,1e-12));
 const [low,high]=scaleLimits(before,h,min);s=clamp(s,low,high);const initial=scaled(before,h,s);let best=null;
 for(let i=0;i<before.length;i++)for(const [axis,length]of [['x','w'],['y','h']]){if(!active(h,axis))continue;const edge=initial[i][axis]+(negative(h,axis)?0:initial[i][length]),a=anchor(before[i],h),derivative=(negative(h,axis)?-1:1)*before[i][length];for(const target of targets[axis]||[]){const distance=Math.abs(target.position-edge)*screen[axis],factor=(target.position-a[axis])/derivative;if(distance<=tolerance&&factor>=low-1e-10&&factor<=high+1e-10&&(!best||distance<best.distance))best={distance,factor,target};}}
 if(best)s=clamp(best.factor,low,high);return{geometries:scaled(before,h,s),snaps:best?[best.target]:[]};
}
