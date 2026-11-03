'use strict';
// Illustrated 2.5D renderer. All actor positions are ground-contact coordinates.
// Original 3D implementation retained in game-3d-legacy.js. Save key unchanged.
const SAVE_KEY='snowcamp_v3', canvas=document.querySelector('#game'), ctx=canvas.getContext('2d',{alpha:false});
let S={coins:20,served:0,ts:Date.now(),lv:{}};
try{const d=JSON.parse(localStorage.getItem(SAVE_KEY));if(d&&Number.isFinite(d.coins))S={...S,...d};}catch(e){}
// Keep one untouched copy for rollback before adding new fields.
try{if(!localStorage.getItem('snowcamp_v3_before_illustrated')&&localStorage.getItem(SAVE_KEY))localStorage.setItem('snowcamp_v3_before_illustrated',localStorage.getItem(SAVE_KEY));}catch(e){}
if(!S.lv){const u=S.unlocked||{};S.lv={table:['table2','table3','table4','table5'].filter(k=>u[k]).length,worker:['worker1','worker2','worker3'].filter(k=>u[k]).length,hunt:(u.hunt2?1:0)+(u.hunt3?1:0),fire:u.fire2?1:0,bag:u.bag1?1:0};}
if(!S.lvT){S.lv.table=Math.min(3,Math.floor((S.lv.table||0)/2));S.lvT=true;}
if(S.lv.worker!==undefined){S.lv.hunter=Math.ceil(S.lv.worker/2);S.lv.server=Math.floor(S.lv.worker/2);delete S.lv.worker;}
function save(){S.ts=Date.now();try{localStorage.setItem(SAVE_KEY,JSON.stringify(S));}catch(e){}}
const before=Date.now()-S.ts;let offline=before>180000?Math.floor(Math.min(before/60000,120)*12):0;if(offline)S.coins+=offline;
const BW=1418,BH=945,CL=[102.6,388.8],CT=[631.8,113.4],CB=[702,864],CR=[1333.8,453.6];
function P(a,b){return [0,1].map(i=>(1-a)*(1-b)*CL[i]+a*(1-b)*CT[i]+(1-a)*b*CB[i]+a*b*CR[i]);}
const assets={}, charNames=['taijo','mio','kenji','kato','jiro','yuuki','emma','goro','saki','sayaka','shota','rei','hana'];
const filenames={bg:'bg-big',booth:'b06-booth-ALT-new-take',pot:'b09-broth-pot',counter:'b10-prep-counter',shelf:'b12-bowl-shelf',truck:'b14-truck',noren:'b15-noren',sign:'b19-sign-aframe',torii:'b20-torii',coin:'b27-coin',table:'pad-table-counter-expansion',fire:'pad-fire-kitchen-boost',bag:'pad-bag-big-tray'};
const items=[],obstacles=[],seats=[],pads=[],actors=[],fx=[];
// Per-asset visible ground-footprint offsets, measured in each cropped sprite.
// Depth is separate from draw-bottom: no image-top/image-height ordering.
const anchors={booth:.085,counter:.070,shelf:.065,pot:.065,noren:0,torii:.035,sign:.060,truck:.070,table:0,fire:0,bag:0};
function prop(kind,x,y,w,collision){let q={kind,x,y,w};items.push(q);if(collision)obstacles.push([x,y-8,...collision]);return q;}
for(const a of [.12,.48,.84])for(let n=0;n<4;n++){const b=.42+n*.125,[x,y]=P(a,b);prop('booth',x,y+20,135);obstacles.push([x,y-8,44,24],[x-26,y+8,22,13]);if(n<3){const m=P(a,b+.0625);obstacles.push([m[0],m[1]-8,44,24]);}seats.push({x,y,guest:null,food:0,spot:[x-25,y+38],a,b});}
function kit(kind,a,b,w,hx,hy){const [x,y]=P(a,b);return prop(kind,x,y+6,w,[hx,hy]);}
kit('shelf',.14,.11,74,30,14);const c1=kit('counter',.32,.11,140,64,21);kit('pot',.5,.12,62,24,11);const c2=kit('counter',.68,.11,140,64,21);kit('pot',.84,.12,62,24,11);kit('shelf',.94,.12,74,30,14);kit('counter',.42,.31,112,50,18);kit('counter',.74,.31,112,50,18);
for(const c of [c1,c2]){const n=prop('noren',c.x,c.y-44,140);n.depthParent=c;}
prop('torii',183.6,691.2,255);prop('sign',356.4,709.2,70);prop('truck',1224,709.2,270);
const definitions=[{id:'table',name:'카운터 강화',a:.1,b:.94,base:[120,300,600],mult:2.2,kind:'table'}, {id:'fire',name:'주방 강화',a:.3,b:.94,base:[100,250,500],mult:1.7,kind:'fire'}, {id:'bag',name:'큰 쟁반',a:.5,b:.94,base:[150],mult:1.8,kind:'bag'}, {id:'hunter',name:'운반 알바',a:.7,b:.94,base:[50,220,380,600,850],mult:1.6,kind:'bag',badge:'📦'}, {id:'server',name:'서빙 알바',a:.9,b:.94,base:[50,220,380,600,850],mult:1.6,kind:'table',badge:'🍜'}, {id:'hunt',name:'재료 입고',a:.96,b:.62,base:[80,200,400,700],mult:1.7,kind:'bag',badge:'🥬'}];
function cost(d){const lv=S.lv[d.id]||0;return lv<d.base.length?d.base[lv]:Math.round(d.base.at(-1)*Math.pow(d.mult,lv-d.base.length+1));}
for(const d of definitions){const [x,y]=P(d.a,d.b);pads.push({...d,x,y,paid:S.padPaid?.[d.id]||0});}
const center=[(CL[0]+CT[0]+CB[0]+CR[0])/4,(CL[1]+CT[1]+CB[1]+CR[1])/4];
const floor=[CT,CR,CB,CL].map((p,i)=>p.map((v,j)=>v+(center[j]-v)*(i===0?.06:.035)));
function inside(x,y){let c=false;for(let i=0,j=floor.length-1;i<floor.length;j=i++){const [xi,yi]=floor[i],[xj,yj]=floor[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;}
function free(x,y,r=8){for(const [dx,dy]of [[0,0],[r,0],[-r,0],[0,r*.6],[0,-r*.6]])if(!inside(x+dx,y+dy))return false;return !obstacles.some(([cx,cy,rx,ry])=>((x-cx)/(rx+r))**2+((y-cy)/(ry+r*.6))**2<1);}
const CELL=10,GW=Math.ceil(BW/CELL),GH=Math.ceil(BH/CELL),grid=new Uint8Array(GW*GH);
const point=k=>[(k%GW)*CELL+CELL/2,Math.floor(k/GW)*CELL+CELL/2];
for(let k=0;k<grid.length;k++){const [x,y]=point(k);grid[k]=free(x,y)?1:0;}
// Remove isolated slivers. Every destination must belong to the same walkable floor.
let largest=[];const visited=new Uint8Array(grid.length);
for(let k=0;k<grid.length;k++)if(grid[k]&&!visited[k]){const q=[k];visited[k]=1;for(let i=0;i<q.length;i++){const p=q[i],x=p%GW,y=Math.floor(p/GW);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,n=ny*GW+nx;if(nx>=0&&nx<GW&&ny>=0&&ny<GH&&grid[n]&&!visited[n]){visited[n]=1;q.push(n);}}}if(q.length>largest.length)largest=q;}
grid.fill(0);for(const k of largest)grid[k]=1;
function nearest(x,y){let best=-1,bd=Infinity;for(const k of largest){const [px,py]=point(k),d=(px-x)**2+(py-y)**2;if(d<bd){bd=d;best=k;}}return best;}
const snap=p=>point(nearest(...p));
// A* with a binary heap, no diagonal corner cutting and segment validation.
function findPath(x,y,tx,ty){const start=nearest(x,y),end=nearest(tx,ty);if(start<0||end<0)return[];const heap=[],g=new Map([[start,0]]),prev=new Map(),done=new Set();
const h=k=>Math.hypot(k%GW-end%GW,Math.floor(k/GW)-Math.floor(end/GW));
function push(k,f){heap.push([k,f]);let i=heap.length-1;while(i){let p=(i-1)>>1;if(heap[p][1]<=f)break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}}
function pop(){const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;while(true){let l=2*i+1,r=l+1,j=i;if(l<heap.length&&heap[l][1]<heap[j][1])j=l;if(r<heap.length&&heap[r][1]<heap[j][1])j=r;if(j===i)break;[heap[i],heap[j]]=[heap[j],heap[i]];i=j;}}return top[0];}
push(start,h(start));while(heap.length){const k=pop();if(done.has(k))continue;done.add(k);if(k===end)break;const x=k%GW,y=Math.floor(k/GW);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,ny=y+dy,n=ny*GW+nx;if(nx<0||nx>=GW||ny<0||ny>=GH||!grid[n]||done.has(n))continue;if(dx&&dy&&(!grid[y*GW+nx]||!grid[ny*GW+x]))continue;const mid=[(x+nx)*CELL/2+CELL/2,(y+ny)*CELL/2+CELL/2];if(!free(...mid))continue;const ng=g.get(k)+Math.hypot(dx,dy);if(ng<(g.get(n)??Infinity)){g.set(n,ng);prev.set(n,k);push(n,ng+h(n));}}}
if(end!==start&&!prev.has(end))return[];let k=end,path=[point(k)];while(prev.has(k)){k=prev.get(k);path.push(point(k));}return path.reverse();}
const entry=snap(P(.04,.37)),supply=snap([1180,650]),rawDrop=snap(P(.89,.23)),pass=snap(P(.62,.26)),chefPos=snap(P(.81,.22));
for(const s of seats)s.spot=snap(s.spot);for(const p of pads)p.stand=snap([p.x,p.y]);
const queueSpots=[];for(let i=0;i<8;i++){const target=P(.035,.35+i*.065);let best=null,bd=Infinity;for(const k of largest){const q=point(k);if(queueSpots.some(p=>Math.hypot(p[0]-q[0],p[1]-q[1])<28))continue;const d=Math.hypot(q[0]-target[0],q[1]-target[1]);if(d<bd){bd=d;best=q;}}queueSpots.push(best||entry);}
let actorSeq=0;
function actor(char,pos,role){const o={id:++actorSeq,char,x:pos[0],y:pos[1],role,path:[],moving:false,flip:false,t:0,carry:null,phase:'idle',target:null};actors.push(o);return o;}
const hero=actor('mio',snap([500,425]),'hero');hero.carryN=0;
const chef=actor('taijo',chefPos,'chef');
function hire(role){return actor(role==='hunter'?'kenji':'mio',role==='hunter'?rawDrop:pass,role);}
// Starter staff keep the arcade-idle loop running. Saved hires are additive.
function syncStaff(){for(const role of ['hunter','server']){const want=1+Math.min(5,S.lv[role]||0);while(actors.filter(a=>a.role===role).length<want)hire(role);}}
syncStaff();
let raw=2,stock=3,ready=0,cookT=0,stockT=0,spawnT=0,time=0,saveT=0,overview=false,camX=0,camY=0,scale=1,W=innerWidth,H=innerHeight;
function route(a,p){a.path=findPath(a.x,a.y,...p);a.target=p;return a.path.length>0;}
function move(a,dt,speed){a.moving=false;let left=dt*speed;while(left>0&&a.path.length){const [x,y]=a.path[0],dx=x-a.x,dy=y-a.y,d=Math.hypot(dx,dy);a.flip=dx<-.05?true:dx>.05?false:a.flip;a.moving=true;if(d<=left){a.x=x;a.y=y;left-=d;a.path.shift();}else{a.x+=dx/d*left;a.y+=dy/d*left;left=0;}}}
function distance(a,p){return Math.hypot(a.x-p[0],a.y-p[1]);}
function toast(t){const el=document.querySelector('#toast');el.textContent=t;el.style.opacity=1;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.opacity=0,2600);}
function emit(x,y,text){fx.push({x,y,text,t:0});}
function hungry(){return seats.find(s=>s.guest&&['wait','arrive'].includes(s.guest.phase)&&!s.food&&!s.reserved)||seats.find(s=>!s.food&&!s.reserved);}
function staff(a,dt){const speed=82*(1+.12*(S.lv[a.role]||0));if(a.path.length){move(a,dt,speed);return;}a.moving=false;
if(a.role==='hunter'){if(a.phase==='take'){if(stock>0){a.carryN=Math.min(stock,3+(S.lv.bag||0));stock-=a.carryN;a.carry='📦';a.phase='drop';route(a,rawDrop);}else a.phase='idle';}else if(a.phase==='drop'){raw=Math.min(raw+(a.carryN||1),30);a.carry=null;a.phase='idle';}else if(stock>0&&raw<18){a.phase='take';route(a,supply);}}
if(a.role==='server'){if(a.phase==='take'){if(ready>0){ready--;a.carry='🍜';a.phase='deliver';a.seat=hungry();if(a.seat){a.seat.reserved=a.id;route(a,a.seat.spot);}else{ready++;a.carry=null;a.phase='idle';}}else a.phase='idle';}else if(a.phase==='deliver'){if(a.seat){a.seat.food=1;a.seat.reserved=null;emit(a.seat.x,a.seat.y-65,'🍜');}a.carry=null;a.phase='idle';}else if(ready>0&&hungry()){a.phase='take';route(a,pass);}}
}
function spawn(){if(actors.filter(a=>a.role==='customer').length>=20)return;const s=seats.find(s=>!s.guest);const o=actor(charNames[3+Math.floor(Math.random()*10)],entry,'customer');if(s){o.phase='arrive';o.seat=s;s.guest=o;route(o,s.spot);}else{o.phase='queue';const n=actors.filter(a=>a.phase==='queue').length-1;route(o,queueSpots[Math.min(n,7)]);}}
function customer(a,dt){if(a.path.length){move(a,dt,69);return;}a.moving=false;if(a.phase==='queue'){const s=seats.find(s=>!s.guest);if(s){a.seat=s;s.guest=a;a.phase='arrive';route(a,s.spot);}}else if(a.phase==='arrive'){a.phase='wait';a.t=0;}else if(a.phase==='wait'&&a.seat.food){a.seat.food=0;a.phase='eat';a.t=0;}else if(a.phase==='eat'){a.t+=dt;if(a.t>2.5/(1+.025*(S.lv.table||0))){const n=15+Math.floor(Math.random()*10)+3*(S.lv.table||0);S.coins+=n;S.served++;emit(a.x,a.y-65,'+'+n);a.seat.guest=null;a.seat=null;a.phase='leave';route(a,entry);save();}}else if(a.phase==='leave'){actors.splice(actors.indexOf(a),1);}}
let interactT=0;
function heroInteraction(dt){interactT-=dt;if(interactT>0)return;const cap=3+(S.lv.bag||0);if(distance(hero,supply)<35&&stock>0&&(!hero.carry||hero.carry==='📦')&&hero.carryN<cap){stock--;hero.carry='📦';hero.carryN++;interactT=.25;}
else if(distance(hero,rawDrop)<35&&hero.carry==='📦'){raw+=hero.carryN;hero.carry=null;hero.carryN=0;interactT=.3;toast('재료를 주방에 전달했어요');}
else if(distance(hero,pass)<32&&ready>0&&(!hero.carry||hero.carry==='🍜')&&hero.carryN<cap){ready--;hero.carry='🍜';hero.carryN++;interactT=.25;}
else if(hero.carry==='🍜'){const s=seats.find(s=>!s.food&&distance(hero,s.spot)<36);if(s){s.food=1;hero.carryN--;if(!hero.carryN)hero.carry=null;interactT=.3;}}
}
function update(dt){time+=dt;stockT+=dt;cookT+=dt;spawnT+=dt;saveT+=dt;
if(stockT>Math.max(.25,2.5*Math.pow(.7,S.lv.hunt||0))){stockT=0;stock=Math.min(stock+1,16);}
if(raw>0&&ready<16&&cookT>Math.max(.3,1.8*Math.pow(.7,S.lv.fire||0))){raw--;ready++;cookT=0;}
if(spawnT>Math.max(.45,1.2-.03*(S.lv.table||0))){spawnT=0;spawn();}
updateInput(dt);if(!hero.manualMove)move(hero,dt,145);heroInteraction(dt);
for(const a of [...actors]){if(a.role==='hunter'||a.role==='server')staff(a,dt);else if(a.role==='customer')customer(a,dt);}
for(const p of pads){const near=distance(hero,p.stand)<24&&!hero.moving;if(near&&S.coins>0){const c=cost(p),pay=Math.min(S.coins,c-p.paid,Math.max(60,c*1.4)*dt);S.coins-=pay;p.paid+=pay;S.padPaid={...S.padPaid,[p.id]:p.paid};if(p.paid>=c-.001){S.lv[p.id]=(S.lv[p.id]||0)+1;p.paid=0;S.padPaid[p.id]=0;syncStaff();toast(p.name+' Lv.'+S.lv[p.id]);emit(p.x,p.y-30,'✨');save();}}}
for(let i=fx.length-1;i>=0;i--){fx[i].t+=dt;if(fx[i].t>1.3)fx.splice(i,1);}
if(saveT>3){saveT=0;save();}document.querySelector('#coins').textContent=Math.floor(S.coins).toLocaleString();document.querySelector('#served').textContent=S.served.toLocaleString();}
function drawImage(kind,x,y,w,alpha=1){const im=assets[kind],h=w*im.height/im.width;ctx.globalAlpha=alpha;ctx.drawImage(im,x-w/2,y-h,w,h);ctx.globalAlpha=1;}
function depth(p){if(p.depthParent)return depth(p.depthParent)+.1;const im=assets[p.kind];return p.y-p.w*im.height/im.width*(anchors[p.kind]||0);}
function label(text,x,y,color='#fff4dc',size=14){ctx.font=`700 ${size}px -apple-system,sans-serif`;const w=ctx.measureText(text).width+14;ctx.fillStyle='#332216db';ctx.beginPath();ctx.roundRect(x-w/2,y-18,w,25,12);ctx.fill();ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,x,y);}
function drawActor(a){const im=assets[a.char],count=a.char==='mio'?8:4,active=a.moving||(a.role==='chef'&&raw>0),frame=active?Math.floor(time*(a.role==='chef'?5:9))%count:0;
const size=a.char==='shota'?65:79;ctx.save();ctx.translate(a.x,a.y);if(a.role==='hero'){ctx.strokeStyle='#ffe18c';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,15,7,0,0,Math.PI*2);ctx.stroke();}
ctx.fillStyle='#27170640';ctx.beginPath();ctx.ellipse(0,0,11,5,0,0,Math.PI*2);ctx.fill();if(a.flip)ctx.scale(-1,1);
// Alpha cells are normalized to 360x360, visible foot baseline is y=342.
ctx.drawImage(im,frame*360,0,360,360,-size/2,-size*342/360,size,size);ctx.restore();
if(a.carry)label(a.carry+(a.role==='hero'?a.carryN:''),a.x,a.y-size-5,'#ffe4a0',14);
if(a.role==='hero'){ctx.fillStyle='#ffe18c';ctx.beginPath();ctx.moveTo(a.x,a.y-size-13);ctx.lineTo(a.x-4,a.y-size-20);ctx.lineTo(a.x+4,a.y-size-20);ctx.fill();}
if(a.role==='customer'&&a.phase==='wait')label('🍜',a.x,a.y-size+4,'#fff',12);
if(a.role==='customer'&&a.phase==='eat'){ctx.fillStyle='#ffd17d';ctx.fillRect(a.x-14,a.y-size-10,28*Math.min(a.t/2.5,1),3);}}
function render(){ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.fillStyle='#302218';ctx.fillRect(0,0,W,H);
scale=overview?Math.min(W/BW,H/BH):Math.min(1.2,Math.max(.88,W/1250));const targetX=overview?(W-BW*scale)/2:Math.min(0,Math.max(W-BW*scale,W*.5-hero.x*scale)),targetY=overview?(H-BH*scale)/2:Math.min(0,Math.max(H-BH*scale,H*.56-hero.y*scale));camX=targetX;camY=targetY;
ctx.translate(camX,camY);ctx.scale(scale,scale);ctx.drawImage(assets.bg,0,0,BW,BH);
for(const p of pads){const near=distance(hero,p.stand)<24;ctx.fillStyle=near?'#ffe3a04d':'#fff1b51a';ctx.strokeStyle=near?'#ffe5a0':'#f6c87988';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y-7,30,15,0,0,Math.PI*2);ctx.fill();ctx.stroke();drawImage(p.kind,p.x,p.y,52);if(p.badge)label(p.badge,p.x,p.y-38,'#fff',12);label(Math.ceil(cost(p)-p.paid).toLocaleString(),p.x,p.y+16,'#ffdf8b',12);if(p.paid){ctx.fillStyle='#ffe19d';ctx.fillRect(p.x-24,p.y+26,48*p.paid/cost(p),3);}}
const sorted=[...items.map(p=>({z:depth(p),p})),...actors.map(a=>({z:a.y,a}))].sort((a,b)=>a.z-b.z);for(const d of sorted){if(d.p)drawImage(d.p.kind,d.p.x,d.p.y,d.p.w);else drawActor(d.a);}
for(const b of [.12]){const [x,y]=P(.5,b);for(let i=0;i<3;i++){const t=(time*.4+i*.33)%1;ctx.globalAlpha=(1-t)*.45;ctx.fillStyle='#fff3da';ctx.beginPath();ctx.ellipse(x+Math.sin(t*5+i)*6,y-65-t*34,4+t*8,7+t*7,0,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
label('📦 '+stock,supply[0],supply[1]-24,'#ffe7a8',12);label('🍜 '+ready,pass[0],pass[1]-32,'#ffe7a8',12);
for(const f of fx){ctx.globalAlpha=Math.max(0,1-f.t/1.3);ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.fillStyle='#ffe294';ctx.fillText(f.text,f.x,f.y-f.t*35);ctx.globalAlpha=1;}
if(hero.path.length){const p=hero.path.at(-1);ctx.strokeStyle='#fff1bb88';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(...p,9,5,0,0,Math.PI*2);ctx.stroke();}}
function resize(){W=innerWidth;H=innerHeight;canvas.width=W*devicePixelRatio;canvas.height=H*devicePixelRatio;}addEventListener('resize',resize);resize();
const keys={};addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key.startsWith('Arrow'))e.preventDefault();});addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);addEventListener('blur',()=>{for(const k in keys)keys[k]=false;pointer=null;});
let pointer=null;const joystick=document.querySelector('#joystick');
canvas.addEventListener('pointerdown',e=>{if(pointer)return;canvas.setPointerCapture(e.pointerId);pointer={id:e.pointerId,x:e.clientX,y:e.clientY,cx:e.clientX,cy:e.clientY,drag:false};});
canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;pointer.cx=e.clientX;pointer.cy=e.clientY;if(Math.hypot(pointer.cx-pointer.x,pointer.cy-pointer.y)>10){pointer.drag=true;joystick.style.display='block';joystick.style.left=pointer.x-48+'px';joystick.style.top=pointer.y-48+'px';const dx=pointer.cx-pointer.x,dy=pointer.cy-pointer.y,l=Math.max(1,Math.hypot(dx,dy)/30);joystick.firstElementChild.style.transform=`translate(${dx/l}px,${dy/l}px)`;}});
function up(e){if(!pointer||pointer.id!==e.pointerId)return;if(!pointer.drag){const x=(e.clientX-camX)/scale,y=(e.clientY-camY)/scale;route(hero,[x,y]);}pointer=null;joystick.style.display='none';}
canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',()=>{pointer=null;joystick.style.display='none';});
function updateInput(dt){let dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);if(pointer?.drag){dx=(pointer.cx-pointer.x)/35;dy=(pointer.cy-pointer.y)/35;}const n=Math.hypot(dx,dy);if(n>.05){hero.path=[];dx/=Math.max(1,n);dy/=Math.max(1,n);const x=hero.x+dx*145*dt,y=hero.y+dy*145*dt;if(free(x,y)){hero.x=x;hero.y=y;}else if(free(x,hero.y))hero.x=x;else if(free(hero.x,y))hero.y=y;hero.moving=true;hero.flip=dx<0;hero.manualMove=true;}else hero.manualMove=false;}
document.querySelector('#view').onclick=()=>{overview=!overview;document.querySelector('#view').setAttribute('aria-label',overview?'주인공 따라가기':'전체 지도 보기');};
for(const type of ['contextmenu','selectstart','gesturestart','gesturechange','gestureend','dblclick'])document.addEventListener(type,e=>e.preventDefault());document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
let last=0;function loop(now){const dt=Math.min(.05,(now-last)/1000)||.016;last=now;update(dt);if(hero.manualMove)hero.moving=true;render();requestAnimationFrame(loop);}
const urls=Object.entries(filenames).map(([id,f])=>[id,'assets/shop/'+f+'.png']).concat(charNames.map((id,i)=>[id,'assets/characters/alpha/char-'+String(i+1).padStart(2,'0')+'-'+id+'.png']));
let loaded=0;Promise.all(urls.map(([id,url])=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{assets[id]=im;document.querySelector('progress').value=++loaded/urls.length;resolve();};im.onerror=()=>reject(new Error(url));im.src=url;}))).then(()=>{document.querySelector('#loading').remove();save();toast(offline?'오프라인 수익 +'+offline:'초록 옷이 주인공이에요 · 바닥을 눌러 이동');window.__g={S,hero,actors,seats,pads,items,obstacles,free,findPath,point,grid,largest,entry,supply,rawDrop,pass,get stock(){return stock},get raw(){return raw},get ready(){return ready},get overview(){return overview},get camera(){return {x:camX,y:camY,scale}},version:42};requestAnimationFrame(loop);}).catch(e=>{document.querySelector('#loading p').textContent='그림을 불러오지 못했어요. 새로고침해 주세요.';console.error(e);});
addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
