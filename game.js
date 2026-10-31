import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// ============================== 설정 ==============================
const CFG = {
  camOffset: new THREE.Vector3(10.5, 12.5, 10.5),
  heroSpeed: 8.5, workerSpeed: 5.5, custSpeed: 4.5,
  huntInterval: 2.5, cookTime: 1.8, eatTime: 2.5, custSpawn: 1.0,
  queueMax: 10, meatMax: 4, stewMax: 4, carryMax: 3,
  offlineCapMin: 120,
};
const PADS = [
  { id:'worker1', label:'일꾼 고용', cost:50,  pos:[-5.5,-3.5] },
  { id:'table2',  label:'식탁 확장', cost:120, pos:[6.5,-4.0] },
  { id:'hunt2',   label:'사냥터 가속', cost:80, pos:[-8.5,2.5] },
  { id:'fire2',   label:'모닥불 강화', cost:100,pos:[-1.0,6.5] },
  { id:'worker2', label:'일꾼 고용 2', cost:220,pos:[-5.5,-6.5] },
  { id:'table3',  label:'식탁 확장 2', cost:300,pos:[9.5,-1.0] },
  { id:'worker3', label:'일꾼 고용 3', cost:380,pos:[-9.5,-8.5] },
  { id:'hunt3',   label:'사냥터 가속 2', cost:200,pos:[-11.5,4.8] },
  { id:'bag1',    label:'큰 가방 (5개 운반)', cost:150,pos:[-2.5,-7.5] },
  { id:'table4',  label:'식탁 확장 3', cost:450,pos:[13.5,6.5] },
  { id:'table5',  label:'식탁 확장 4', cost:700,pos:[16.5,-0.5] },
];

// ============================== 상태 ==============================
const SAVE_KEY='snowcamp_v3';
let S = { coins:20, unlocked:{}, served:0, ts:Date.now() };
try { const d=JSON.parse(localStorage.getItem(SAVE_KEY)); if(d&&typeof d.coins==='number') S={...S,...d}; } catch(e){}
function save(){ S.ts=Date.now(); try{localStorage.setItem(SAVE_KEY,JSON.stringify(S));}catch(e){} }
function fmt(n){ return n>=1000 ? (n/1000).toFixed(1)+'k' : Math.floor(n); }

// ============================== three 기본 ==============================
const app=document.getElementById('app');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xbfd2ea);
scene.fog=new THREE.Fog(0xbfd2ea, 34, 70);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,200);
function fitCam(){ const a=innerWidth/innerHeight, s=8.2; camera.left=-s*a; camera.right=s*a; camera.top=s; camera.bottom=-s; camera.updateProjectionMatrix(); }
fitCam(); addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);fitCam();});
const hemi=new THREE.HemisphereLight(0xeaf2ff,0x9fb4d8,0.95); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff3e0,2.0);
sun.position.set(12,20,6); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.bias=-0.0004;
scene.add(sun); scene.add(sun.target);

// ============================== 에셋 로딩 ==============================
const FILES=['Rogue_Hooded','Rogue','Mage','Knight','Barbarian','pine1','pine2','ctree','rock','bush','log','stump','table','table_small','chair','counter','pot','steak','menu','torch','barrel','coins'];
const loader=new GLTFLoader();
const LIB={}; let loaded=0;
const barEl=document.querySelector('#bar>div');
function loadAll(){ return Promise.all(FILES.map(f=>new Promise((res,rej)=>{
  loader.load('assets/'+f+'.glb',g=>{ LIB[f]=g; loaded++; barEl.style.width=(loaded/FILES.length*100)+'%'; res(); },undefined,e=>{console.error('load fail',f,e); rej(e);});
}))); }

// ============================== SFX ==============================
let AC=null;
function audio(){ if(!AC){ try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){} } if(AC&&AC.state==='suspended')AC.resume(); return AC; }
function beep(f0,f1,dur,type='square',vol=0.06,delay=0){
  const ac=audio(); if(!ac)return;
  const t=ac.currentTime+delay;
  const o=ac.createOscillator(), g=ac.createGain();
  o.type=type; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(Math.max(f1,1),t+dur);
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t+dur+0.02);
}
const sfx={
  pickup(){ beep(500,880,0.09,'square',0.05); },
  drop(){ beep(420,300,0.08,'triangle',0.06); },
  coin(){ beep(1100,1100,0.07,'sine',0.07); beep(1560,1560,0.09,'sine',0.06,0.06); },
  unlock(){ [523,659,784,1046].forEach((f,i)=>beep(f,f,0.11,'triangle',0.07,i*0.07)); },
  serve(){ beep(700,990,0.08,'sine',0.05); },
};

// ============================== 유틸 ==============================
function cloneAsset(name){ const src=LIB[name]; const o=skeletonClone(src.scene); o.traverse(m=>{ if(m.isMesh){m.castShadow=true;m.receiveShadow=true;} }); return o; }
function staticAsset(name,x,z,ry=0,s=1,y=0){ const o=cloneAsset(name); o.position.set(x,y,z); o.rotation.y=ry; o.scale.multiplyScalar(s); scene.add(o); return o; }
function textSprite(text,{size=42,fg='#fff',bg='rgba(20,28,44,.75)',pad=18}={}){
  const c=document.createElement('canvas'); const g=c.getContext('2d');
  g.font=`700 ${size}px -apple-system,'Segoe UI',sans-serif`;
  const w=Math.ceil(g.measureText(text).width)+pad*2, h=size+pad*2;
  c.width=w*2; c.height=h*2; g.scale(2,2);
  g.font=`700 ${size}px -apple-system,'Segoe UI',sans-serif`;
  g.fillStyle=bg; const r=h/2;
  g.beginPath(); g.roundRect(0,0,w,h,r); g.fill();
  g.fillStyle=fg; g.textBaseline='middle'; g.textAlign='center'; g.fillText(text,w/2,h/2+2);
  const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));
  sp.scale.set(w/h*0.9,0.9,1); return sp;
}
function playAnim(rig,name,fade=0.18){
  if(rig.current===name) return;
  const next=rig.actions[name]; if(!next) return;
  const prev=rig.actions[rig.current];
  next.reset().fadeIn(fade).play(); if(prev) prev.fadeOut(fade);
  rig.current=name;
}
function makeRig(name,x,z,ry=0){
  const obj=cloneAsset(name); obj.position.set(x,0,z); obj.rotation.y=ry; scene.add(obj);
  const mixer=new THREE.AnimationMixer(obj);
  const actions={}; for(const clip of LIB[name].animations){ actions[clip.name]=mixer.clipAction(clip); }
  const rig={obj,mixer,actions,current:null};
  playAnim(rig,'Idle',0);
  return rig;
}

// ============================== 월드 꾸미기 ==============================
function buildWorld(){
  // 눈 지형
  const geo=new THREE.CylinderGeometry(26,26.8,1.2,64);
  const mat=new THREE.MeshStandardMaterial({color:0xe9eefb,roughness:0.95});
  const ground=new THREE.Mesh(geo,mat); ground.position.y=-0.6; ground.receiveShadow=true; scene.add(ground);
  const driftM=new THREE.MeshStandardMaterial({color:0xf2f5fd,roughness:1});
  [[-8,5,2.2],[6,-6,2.6],[-4,-8,1.8],[9,6,1.9],[3,9,1.5],[-14,-12,2.8],[15,-10,2.4],[-16,10,2.6],[12,14,2.2],[19,5,2.0],[-19,-3,2.3],[5,-17,2.5],[-6,17,2.1]].forEach(([x,z,s])=>{
    const d=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),driftM);
    d.scale.set(s,s*0.9,s*0.32); d.position.set(x,-0.15,z); d.receiveShadow=true; scene.add(d);
  });
  // 얼음 패치
  const iceM=new THREE.MeshStandardMaterial({color:0xd3e4f7,roughness:0.35});
  [[-5,-6,2.6],[6.5,7.5,2.0],[9,-5,1.6],[-9.5,-1,1.8],[-15,-8,3.0],[13,11,2.4],[-13,13,2.2],[18,-6,2.0],[3,-14,2.6],[-18,4,2.0]].forEach(([x,z,r],i)=>{
    const ice=new THREE.Mesh(new THREE.CircleGeometry(r,24),iceM);
    ice.rotation.x=-Math.PI/2; ice.position.set(x,0.012,z); ice.receiveShadow=true; scene.add(ice);
  });
  // 가장자리 나무/바위
  const ring=[[-12,-8,'pine1',.55],[-13,-1,'pine2',.6],[-11,6,'pine1',.5],[-6,11,'pine2',.55],[2,12,'pine1',.6],[9,10,'ctree',.55],[12,4,'pine2',.5],[13,-4,'pine1',.55],[8,-11,'pine2',.6],[0,-13,'pine1',.5],[-8,-11,'ctree',.55]];
  ring.forEach(([x,z,t,s],i)=>staticAsset(t,x,z,i*1.7,s));
  // 외곽 링 (넓어진 맵)
  const outer=[];
  const kinds=['pine1','pine2','ctree'];
  for(let i=0;i<26;i++){
    const a=i/26*Math.PI*2+0.13;
    const r=22.5+Math.sin(i*2.7)*1.6;
    outer.push([Math.cos(a)*r,Math.sin(a)*r,kinds[i%3],0.5+(i%4)*0.08]);
  }
  outer.forEach(([x,z,t,s],i)=>staticAsset(t,x,z,i*0.9,s));
  // 중간 링 장식
  [[-17,-14,'pine2',.6],[16,12,'pine1',.55],[-18,8,'ctree',.6],[14,-15,'pine2',.55],[-4,-19,'pine1',.6],[7,18,'ctree',.55],[20,-8,'pine2',.5],[-20,-6,'pine1',.55]].forEach(([x,z,t,s],i)=>staticAsset(t,x,z,i*1.3,s));
  staticAsset('bush',-14,2,0,.9); staticAsset('bush',16,-12,1,.85); staticAsset('rock',-12,-14,0.4,.9); staticAsset('rock',18,9,2.1,.8);
  staticAsset('stump',-16,-4,0.8,.9); staticAsset('log',12,-13,1.9,.9); staticAsset('bush',-9,15,0,1); staticAsset('rock',6,16,1.2,.7);
  staticAsset('torch',-6,-6,0,1); staticAsset('torch',8,8,0,1); staticAsset('torch',14,3,0,1); staticAsset('torch',-14,6,0,1);
  staticAsset('pine2',-6.5,7.5,0.8,.45); staticAsset('pine1',7.5,7,2.2,.4); staticAsset('ctree',-8.5,-4.5,1.1,.42); staticAsset('bush',-3,8.8,0,.9); staticAsset('bush',9,-6.5,1,.8); staticAsset('rock',-6,-6.5,2.6,.6); staticAsset('stump',6.5,9.5,0.3,.8);
  staticAsset('rock',-11.5,3.5,0.4,.9); staticAsset('rock',10.5,-8,2.1,.8); staticAsset('rock',4,11.5,1.2,.7);
  staticAsset('stump',-9,8.5,0.8,.9); staticAsset('log',-10,-6,1.9,.9); staticAsset('bush',-7,-9.5,0,1);
  staticAsset('torch',-3.4,-1.6,0,1); staticAsset('torch',4.2,-3.2,0,1); staticAsset('torch',-1.5,4.8,0,1);
}
// 모닥불 (절차적)
function buildCampfire(x,z){
  const g=new THREE.Group(); g.position.set(x,0,z);
  const stoneM=new THREE.MeshStandardMaterial({color:0x8a8f9c,roughness:.9});
  for(let i=0;i<7;i++){ const a=i/7*Math.PI*2;
    const st=new THREE.Mesh(new THREE.IcosahedronGeometry(0.24,0),stoneM);
    st.scale.y=0.7; st.position.set(Math.cos(a)*0.8,0.1,Math.sin(a)*0.8); st.castShadow=true; g.add(st); }
  const logM=new THREE.MeshStandardMaterial({color:0x5a3a1e,roughness:.9});
  for(let i=0;i<4;i++){ const a=i/4*Math.PI*2+0.4;
    const lg=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.13,1.1,6),logM);
    lg.position.set(Math.cos(a)*0.2,0.3,Math.sin(a)*0.2); lg.rotation.set(0.9,a,0.5); lg.castShadow=true; g.add(lg); }
  const flameM=new THREE.MeshStandardMaterial({color:0xff7a1a,emissive:0xff5a00,emissiveIntensity:2.4,roughness:.4});
  const f1=new THREE.Mesh(new THREE.ConeGeometry(0.34,1.0,8),flameM); f1.position.y=0.85; g.add(f1);
  const f2=new THREE.Mesh(new THREE.ConeGeometry(0.18,0.6,8),new THREE.MeshStandardMaterial({color:0xffd23f,emissive:0xffc21a,emissiveIntensity:3,roughness:.4})); f2.position.y=0.95; g.add(f2);
  const pl=new THREE.PointLight(0xff8a30,30,9,1.8); pl.position.set(0,1.4,0); g.add(pl);
  g.userData.flicker=(t)=>{ const n=Math.sin(t*11)+Math.sin(t*17+1.3); f1.scale.setScalar(1+n*0.08); f2.scale.setScalar(1-n*0.12); pl.intensity=28+n*5; };
  scene.add(g); return g;
}

// ============================== 게임 오브젝트 ==============================
const HUNT={pos:new THREE.Vector3(-8,0,2), stock:[], iv:CFG.huntInterval, t:0};
const FIRE={pos:new THREE.Vector3(-2,0,2), raw:0, stew:0, cooking:0, ct:CFG.cookTime};
const TABLES=[ {pos:new THREE.Vector3(5,0,3), built:true, cust:null, stew:0, eating:0},
               {pos:new THREE.Vector3(8,0,1), built:false, cust:null, stew:0, eating:0, padId:'table2'},
               {pos:new THREE.Vector3(10.5,0,4.5), built:false, cust:null, stew:0, eating:0, padId:'table3'},
               {pos:new THREE.Vector3(12,0,6.5), built:false, cust:null, stew:0, eating:0, padId:'table4'},
               {pos:new THREE.Vector3(15,0,0.5), built:false, cust:null, stew:0, eating:0, padId:'table5'} ];
let workers=[], pads=[], hero, campfire, custT=0, stockMeshes=[], stewMeshes=[], coinFx=[];

function buildStations(){
  // 사냥터
  staticAsset('log',HUNT.pos.x-0.8,HUNT.pos.z+0.6,0.6,1);
  staticAsset('stump',HUNT.pos.x+0.9,HUNT.pos.z-0.5,0.2,1);
  staticAsset('steak',HUNT.pos.x,HUNT.pos.z+1.6,0.3,1);
  // 모닥불 + 요리
  campfire=buildCampfire(FIRE.pos.x,FIRE.pos.z);
  staticAsset('counter',FIRE.pos.x+2.2,FIRE.pos.z+1.8,Math.PI,1);
  staticAsset('pot',FIRE.pos.x+2.2,FIRE.pos.z+1.2,0,1);
  // 식탁
  TABLES.forEach((t,i)=>{ if(t.built) buildTable(t); });
  staticAsset('coins',7.2,4.4,0,0.8);
  staticAsset('barrel',-4.2,4.6,0.5,1); staticAsset('barrel',3.2,5.8,2.4,1);
  staticAsset('menu',1.6,4.6,-0.5,1);
  staticAsset('log',7.8,-3.2,1.2,0.8); staticAsset('stump',9.2,-2.4,0.9,0.7);
  staticAsset('bush',-10.5,7,0.4,.8); staticAsset('rock',11,6.5,0.9,.7);
  // 장작 더미 (모닥불 옆)
  staticAsset('log',FIRE.pos.x-1.6,FIRE.pos.z+1.4,0.3,0.9);
  staticAsset('log',FIRE.pos.x-1.9,FIRE.pos.z+1.7,1.2,0.9);
}
function buildTable(t){
  t.built=true;
  const rug=new THREE.Mesh(new THREE.CircleGeometry(2.3,36),new THREE.MeshStandardMaterial({color:0xd8b08c,roughness:1}));
  rug.rotation.x=-Math.PI/2; rug.position.set(t.pos.x,0.015,t.pos.z); rug.receiveShadow=true; scene.add(rug);
  staticAsset('table',t.pos.x,t.pos.z,Math.random()*3,1);
  staticAsset('chair',t.pos.x-1.4,t.pos.z-1.0,2.2,1);
  staticAsset('chair',t.pos.x+1.4,t.pos.z+1.0,-0.7,1);
}
// 발판
const PAD_ICONS={ worker1:'Rogue', worker2:'Mage', worker3:'Barbarian',
  table2:'table', table3:'table', table4:'table', table5:'table',
  hunt2:'steak', hunt3:'steak', fire2:'pot', bag1:'bag' };
function padIcon(p){
  const k=PAD_ICONS[p.id];
  if(k==='bag'){
    const grp=new THREE.Group();
    const a=cloneAsset('steak'); a.scale.setScalar(0.5); a.position.set(-0.28,0,0); grp.add(a);
    const b=cloneAsset('steak'); b.scale.setScalar(0.5); b.position.set(0.28,0.1,0); b.rotation.y=1.2; grp.add(b);
    const c=cloneAsset('steak'); c.scale.setScalar(0.5); c.position.set(0,0.5,0); c.rotation.y=2.4; grp.add(c);
    return grp;
  }
  if(k==='table'){
    const grp=new THREE.Group();
    const t=cloneAsset('table'); t.scale.setScalar(0.55); grp.add(t);
    const ch=cloneAsset('chair'); ch.scale.setScalar(0.55); ch.position.set(0.9,0,0.6); ch.rotation.y=-0.7; grp.add(ch);
    return grp;
  }
  const m=cloneAsset(k);
  if(k==='Rogue'||k==='Mage'||k==='Barbarian'){ m.scale.setScalar(0.62); }
  else m.scale.setScalar(0.6);
  return m;
}
function makePad(p){
  const g=new THREE.Group(); g.position.set(p.pos[0],0.02,p.pos[1]);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.7,1.05,40),new THREE.MeshBasicMaterial({color:0xffd34d,transparent:true,opacity:.95,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2; g.add(ring);
  const fill=new THREE.Mesh(new THREE.CircleGeometry(0.7,40),new THREE.MeshBasicMaterial({color:0xffd34d,transparent:true,opacity:.25,side:THREE.DoubleSide}));
  fill.rotation.x=-Math.PI/2; g.add(fill);
  
  const icon=padIcon(p); icon.position.y=1.7; g.add(icon);
  g.userData={pad:p,fill,ring,icon,progress:0};
  scene.add(g); pads.push(g);
}
function unlockPad(g){
  sfx.unlock();
  const p=g.userData.pad; S.unlocked[p.id]=true; save();
  scene.remove(g); pads=pads.filter(x=>x!==g);
  toast(`✅ ${p.label} 완료!`);
  if(p.id==='worker1'||p.id==='worker2') hireWorker();
  if(p.id==='table2') buildTable(TABLES[1]);
  if(p.id==='table3') buildTable(TABLES[2]);
  if(p.id==='table4') buildTable(TABLES[3]);
  if(p.id==='table5') buildTable(TABLES[4]);
  if(p.id==='worker3') hireWorker();
  if(p.id==='hunt2') HUNT.iv=1.4;
  if(p.id==='hunt3') HUNT.iv=0.8;
  if(p.id==='bag1') CFG.carryMax=5;
  if(p.id==='fire2'){ FIRE.ct=1.0; campfire.scale.setScalar(1.25); }
  pop(g.position,0xffd34d);
}
function hireWorker(){
  const kinds=['Rogue','Mage'];
  const rig=makeRig(kinds[workers.length%kinds.length], FIRE.pos.x+1.5, FIRE.pos.z-1.5, Math.PI);
  workers.push({rig, state:'idle', carry:null, carryObj:null, t:0, target:new THREE.Vector3()});
}
// 이펙트
function pop(pos,color){
  const m=new THREE.Mesh(new THREE.SphereGeometry(0.3,10,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));
  m.position.copy(pos).add(new THREE.Vector3(0,1,0)); scene.add(m);
  coinFx.push({m,t:0});
}
let toastTimer=null;
function toast(msg){ const el=document.getElementById('toast'); el.textContent=msg; el.style.opacity=1; clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.style.opacity=0,1800); }

// ============================== 주인공 ==============================
const keys={};
addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
const joy=document.getElementById('joy'), knob=document.getElementById('joyknob');
let joyVec={x:0,y:0}, joyId=null;
addEventListener('touchstart',e=>{ joy.style.display='block'; const t=e.changedTouches[0]; joyId=t.identifier; joy.style.left=(t.clientX-60)+'px'; joy.style.top=(t.clientY-60)+'px'; joy.style.bottom='auto'; },{passive:true});
addEventListener('touchmove',e=>{ for(const t of e.changedTouches){ if(t.identifier===joyId){ const r=joy.getBoundingClientRect(); let dx=t.clientX-(r.left+60), dy=t.clientY-(r.top+60); const l=Math.hypot(dx,dy); if(l>44){dx*=44/l;dy*=44/l;} knob.style.left=(35+dx)+'px'; knob.style.top=(35+dy)+'px'; joyVec={x:dx/44,y:dy/44}; } } },{passive:true});
addEventListener('touchend',e=>{ for(const t of e.changedTouches){ if(t.identifier===joyId){ joyId=null; joyVec={x:0,y:0}; knob.style.left='35px'; knob.style.top='35px'; } } },{passive:true});

// ============================== 로직 ==============================
const camTarget=new THREE.Vector3(0,0,0);
function updateHero(dt){
  let kx=0,ky=0; // 화면 기준 입력
  if(keys['w']||keys['arrowup'])ky-=1; if(keys['s']||keys['arrowdown'])ky+=1;
  if(keys['a']||keys['arrowleft'])kx-=1; if(keys['d']||keys['arrowright'])kx+=1;
  kx+=joyVec.x; ky+=joyVec.y;
  // 화면 입력 -> 아이소 월드 방향
  let vx=(kx+ky)*0.7071, vz=(ky-kx)*0.7071;
  const len=Math.hypot(vx,vz);
  if(len>0.05){
    vx/=Math.max(len,1); vz/=Math.max(len,1);
    hero.rig.obj.position.x+=vx*CFG.heroSpeed*dt;
    hero.rig.obj.position.z+=vz*CFG.heroSpeed*dt;
    const r=Math.hypot(hero.rig.obj.position.x,hero.rig.obj.position.z);
    if(r>24.5){ hero.rig.obj.position.x*=24.5/r; hero.rig.obj.position.z*=24.5/r; }
    hero.rig.obj.rotation.y=Math.atan2(vx,vz);
    playAnim(hero.rig,'Running_A');
  } else playAnim(hero.rig,'Idle');
  // 카메라
  camTarget.lerp(hero.rig.obj.position,1-Math.pow(0.001,dt));
  camera.position.copy(camTarget).add(CFG.camOffset);
  camera.lookAt(camTarget.x,0.5,camTarget.z);
}
function dist(a,b){ return Math.hypot(a.x-b.x,a.z-b.z); }

// 아이템 표시 (들고다니는 고기/스튜)
function carryMesh(kind){
  return cloneAsset(kind==='meat'?'steak':'pot');
}
function updateHeroCarry(){
  hero.carryObjs.forEach(m=>hero.rig.obj.remove(m)); hero.carryObjs=[];
  if(hero.carry){
    for(let i=0;i<hero.carry.n;i++){
      const m=carryMesh(hero.carry.kind); m.scale.setScalar(0.45); m.position.set(0,2.1+i*0.42,0); m.rotation.y=0.6+i*0.5;
      hero.rig.obj.add(m); hero.carryObjs.push(m);
    }
  }
}
function updateStations(dt){
  // 사냥터 생산
  HUNT.t+=dt;
  if(HUNT.t>=HUNT.iv && HUNT.stock.length<CFG.meatMax){ HUNT.t=0; HUNT.stock.push(1); refreshStock(); }
  // 요리
  if(FIRE.raw>0 && FIRE.stew<CFG.stewMax){
    FIRE.cooking+=dt;
    if(FIRE.cooking>=FIRE.ct){ FIRE.cooking=0; FIRE.raw--; FIRE.stew++; refreshStew(); }
  } else FIRE.cooking=0;
}
function refreshStock(){
  stockMeshes.forEach(m=>scene.remove(m)); stockMeshes=[];
  HUNT.stock.forEach((_,i)=>{
    const m=cloneAsset('steak'); m.scale.setScalar(0.55);
    m.position.set(HUNT.pos.x-1.1+i*0.75, 0, HUNT.pos.z-1.5); m.rotation.y=i*1.3; scene.add(m); stockMeshes.push(m);
  });
}
function refreshStew(){
  stewMeshes.forEach(m=>scene.remove(m)); stewMeshes=[];
  for(let i=0;i<FIRE.stew;i++){
    const m=cloneAsset('pot'); m.scale.setScalar(0.55);
    m.position.set(FIRE.pos.x+1.4+i*0.7, 0, FIRE.pos.z-1.2); scene.add(m); stewMeshes.push(m);
  }
}
function tryHeroPickupDrop(){
  const hp=hero.rig.obj.position;
  if(!hero.carry || (hero.carry.n<CFG.carryMax)){
    if(HUNT.stock.length>0 && dist(hp,HUNT.pos)<2.2 && (!hero.carry||hero.carry.kind==='meat')){
      HUNT.stock.pop();
      if(hero.carry)hero.carry.n++; else hero.carry={kind:'meat',n:1};
      playAnim(hero.rig,'PickUp'); updateHeroCarry(); refreshStock(); pop(hp,0xff6b6b); sfx.pickup();
    }
    else if(FIRE.stew>0 && dist(hp,FIRE.pos)<2.4 && (!hero.carry||hero.carry.kind==='stew')){
      FIRE.stew--;
      if(hero.carry)hero.carry.n++; else hero.carry={kind:'stew',n:1};
      playAnim(hero.rig,'PickUp'); updateHeroCarry(); refreshStew(); pop(hp,0xffa640); sfx.pickup();
    }
  }
  if(hero.carry && hero.carry.kind==='meat' && dist(hp,FIRE.pos)<2.2 && FIRE.raw<CFG.stewMax){
    const n=Math.min(hero.carry.n, CFG.stewMax-FIRE.raw); FIRE.raw+=n; hero.carry.n-=n;
    if(hero.carry.n<=0)hero.carry=null;
    updateHeroCarry(); pop(FIRE.pos,0xff8a30); sfx.drop();
  } else if(hero.carry && hero.carry.kind==='stew'){
    for(const t of TABLES){ if(t.built && t.stew<2 && dist(hp,t.pos)<2.0){
      const n=Math.min(hero.carry.n,2-t.stew); t.stew+=n; hero.carry.n-=n;
      if(hero.carry.n<=0)hero.carry=null;
      updateHeroCarry(); pop(t.pos,0x9fdf7a); sfx.drop(); break; } }
  }
}
// 일꾼 AI
function updateWorker(w,dt){
  const o=w.rig.obj;
  const go=(v)=>{ w.target.copy(v); };
  if(w.state==='idle'){
    if(FIRE.stew>0 && TABLES.some(t=>t.built&&t.stew<2)) { w.state='toStew'; }
    else if(HUNT.stock.length>0 && FIRE.raw<CFG.stewMax) { w.state='toMeat'; }
    else playAnim(w.rig,'Idle');
  }
  if(w.state==='toStew'){ go(FIRE.pos); if(step(w,dt)){ if(FIRE.stew>0){FIRE.stew--; setWorkerCarry(w,'stew'); playAnim(w.rig,'PickUp'); refreshStew(); w.state='toTable';} else w.state='idle'; } }
  else if(w.state==='toMeat'){ go(HUNT.pos); if(step(w,dt)){ if(HUNT.stock.length>0){HUNT.stock.pop(); setWorkerCarry(w,'meat'); playAnim(w.rig,'PickUp'); refreshStock(); w.state='toFire';} else w.state='idle'; } }
  else if(w.state==='toFire'){ go(FIRE.pos); if(step(w,dt)){ FIRE.raw++; setWorkerCarry(w,null); pop(FIRE.pos,0xff8a30); w.state='idle'; } }
  else if(w.state==='toTable'){
    const t=TABLES.find(t=>t.built&&t.stew<2);
    if(!t){ w.state='idle'; }
    else { go(t.pos); if(step(w,dt)){ t.stew++; setWorkerCarry(w,null); pop(t.pos,0x9fdf7a); sfx.serve(); w.state='idle'; } }
  }
}
function setWorkerCarry(w,kind){
  if(w.carryObj){ w.rig.obj.remove(w.carryObj); w.carryObj=null; }
  w.carry=kind;
  if(kind){ const m=carryMesh(kind); m.scale.setScalar(0.45); m.position.set(0,2.4,0); w.rig.obj.add(m); w.carryObj=m; }
}
function step(w,dt){
  const o=w.rig.obj; const d=new THREE.Vector3().subVectors(w.target,o.position); d.y=0;
  const l=d.length();
  if(l<1.3) return true;
  d.normalize(); o.position.addScaledVector(d,CFG.workerSpeed*dt);
  o.rotation.y=Math.atan2(d.x,d.z);
  playAnim(w.rig,'Walking_A');
  return false;
}
// 손님 (줄서기 경제: 수요는 항상 충분, 서빙 속도가 수익을 결정)
let customers=[], queue=[];
const ENTR=new THREE.Vector3(0,0,-24), EXIT=new THREE.Vector3(0,0,-25.5);
const QA=new THREE.Vector3(2.5,0,-4.5);          // 줄 머리
const QD=new THREE.Vector3(-0.127,0,-0.992);     // 줄 방향 (입구 쪽)
function queueSlot(k){ return new THREE.Vector3(QA.x+QD.x*1.7*k, 0, QA.z+QD.z*1.7*k); }
function spawnCustomer(){
  const kinds=['Knight','Barbarian','Mage','Rogue'];
  const rig=makeRig(kinds[Math.floor(Math.random()*kinds.length)], ENTR.x+(Math.random()-0.5)*2, ENTR.z, 0);
  const c={rig, state:'toQueue', t:0, table:null, pay:0};
  customers.push(c); queue.push(c);
}
function updateCustomers(dt){
  custT+=dt;
  // 수요는 항상 넘침: 줄이 차지 않았으면 계속 도착
  if(custT>=CFG.custSpawn && queue.length<CFG.queueMax && customers.length<24){
    custT=0; spawnCustomer();
  }
  // 빈 식탁이 있으면 줄 맨 앞 손님 착석
  const free=TABLES.filter(t=>t.built&&!t.cust);
  while(free.length>0 && queue.length>0){
    const c=queue.shift(); const t=free.shift();
    t.cust=c; c.table=t; c.state='toSeat';
  }
  for(let i=customers.length-1;i>=0;i--){
    const c=customers[i]; const o=c.rig.obj;
    if(c.state==='toQueue'){
      const slot=queueSlot(queue.indexOf(c));
      const d=new THREE.Vector3().subVectors(slot,o.position); d.y=0;
      if(d.length()<0.35){ playAnim(c.rig,'Idle'); o.rotation.y=Math.atan2(QA.x-o.position.x,QA.z+4-o.position.z); }
      else { d.normalize(); o.position.addScaledVector(d,CFG.custSpeed*dt); o.rotation.y=Math.atan2(d.x,d.z); playAnim(c.rig,'Walking_A'); }
    }
    if(c.state==='wait'){
      if(!c.bubble){ c.bubble=textSprite('🍲',{size:40,bg:'rgba(255,255,255,.85)'}); c.bubble.position.copy(c.table.pos).add(new THREE.Vector3(-1.4,2.3,-1.0)); scene.add(c.bubble); }
      c.bubble.position.y=2.3+Math.sin(clockT*3)*0.1;
    } else if(c.bubble){ scene.remove(c.bubble); c.bubble=null; }
    if(c.state==='toSeat'){
      const sp=new THREE.Vector3(c.table.pos.x-1.4,0,c.table.pos.z-1.0);
      const d=new THREE.Vector3().subVectors(sp,o.position); d.y=0;
      if(d.length()<0.3){ c.state='wait'; playAnim(c.rig,'Sit_Chair_Idle'); o.rotation.y=Math.atan2(c.table.pos.x-o.position.x,c.table.pos.z-o.position.z); }
      else { d.normalize(); o.position.addScaledVector(d,CFG.custSpeed*dt); o.rotation.y=Math.atan2(d.x,d.z); playAnim(c.rig,'Walking_A'); }
    }
    else if(c.state==='wait'){
      if(c.table.stew>0){ c.table.stew--; c.state='eat'; c.t=0; playAnim(c.rig,'Interact'); }
    }
    else if(c.state==='eat'){
      c.t+=dt;
      if(c.t>=CFG.eatTime){
        const gain=15+Math.floor(Math.random()*10);
        S.coins+=gain; S.served++; save(); pop(c.table.pos,0xffd34d);
        const ft=textSprite(`+${gain} 🪙`,{size:46,fg:'#ffd34d'}); ft.position.copy(c.table.pos).add(new THREE.Vector3(0,2.2,0)); scene.add(ft);
        coinFx.push({m:ft,t:0,isText:true});
        c.state='leave'; playAnim(c.rig,'Cheer');
        c.cheerT=0;
      }
    }
    else if(c.state==='leave'){
      c.cheerT=(c.cheerT||0)+dt;
      if(c.cheerT<0.9) continue;
      const d=new THREE.Vector3().subVectors(EXIT,o.position); d.y=0;
      if(d.length()<0.8){ if(c.table) c.table.cust=null; const qi=queue.indexOf(c); if(qi>=0)queue.splice(qi,1); scene.remove(o); customers.splice(i,1); continue; }
      d.normalize(); o.position.addScaledVector(d,CFG.custSpeed*dt); o.rotation.y=Math.atan2(d.x,d.z); playAnim(c.rig,'Walking_A');
    }
  }
}
// 발판
function updatePads(dt){
  for(const g of [...pads]){
    const p=g.userData.pad;
    const near=dist(hero.rig.obj.position,g.position)<1.35;
    g.userData.ring.material.opacity = near?1:(0.7+Math.sin(clockT*3)*0.2);
    if(near && S.coins>0){
      const rate=Math.max(30,p.cost*0.9); // 초당 소모
      const pay=Math.min(rate*dt, S.coins, p.cost-g.userData.progress);
      S.coins-=pay; g.userData.progress+=pay;
      g.userData.fill.scale.setScalar(0.2+0.8*(g.userData.progress/p.cost));
      if(g.userData.progress>=p.cost-0.001) unlockPad(g);
    }
  }
}
// 오프라인 정산
function offlineSettle(){
  const mins=(Date.now()-(S.ts||Date.now()))/60000;
  if(mins<3) return;
  const tables=TABLES.filter(t=>t.built).length;
  const gain=Math.floor(Math.min(mins,CFG.offlineCapMin)*tables*4.0);
  if(gain>0){ S.coins+=gain; save(); setTimeout(()=>toast(`오프라인 수익 +${gain} 🪙`),600); }
}

// 눈 입자
let snow;
function buildSnow(){
  const N=700, pos=new Float32Array(N*3);
  for(let i=0;i<N;i++){ pos[i*3]=(Math.random()-0.5)*80; pos[i*3+1]=Math.random()*18; pos[i*3+2]=(Math.random()-0.5)*80; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  snow=new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:0.14,transparent:true,opacity:0.85,sizeAttenuation:true}));
  scene.add(snow);
}
function updateSnow(dt){
  const p=snow.geometry.attributes.position;
  for(let i=0;i<p.count;i++){ let y=p.getY(i)-dt*1.6; if(y<0)y=18; p.setY(i,y); p.setX(i,p.getX(i)+Math.sin(clockT*0.8+i)*dt*0.25); }
  p.needsUpdate=true;
}

// ============================== 메인 루프 ==============================
let clockT=0, lastTs=0, saveT=0;
function loop(ts){
  requestAnimationFrame(loop);
  const dt=Math.min((ts-lastTs)/1000,0.05)||0.016; lastTs=ts; clockT+=dt;
  updateHero(dt); updateStations(dt); updatePads(dt);
  workers.forEach(w=>updateWorker(w,dt));
  updateCustomers(dt);
  tryHeroPickupDrop();
  campfire.userData.flicker(clockT);
  pads.forEach(g=>{ if(g.userData.icon){ g.userData.icon.position.y=1.7+Math.sin(clockT*2.6+g.position.x)*0.16; g.userData.icon.rotation.y+=dt*0.9; } });
  hero.carryObjs.forEach((m,i)=>m.position.y=2.1+i*0.42+Math.sin(clockT*4)*0.08);
  workers.forEach(w=>{ if(w.carryObj) w.carryObj.position.y=2.4+Math.sin(clockT*4+1)*0.12; });
  updateSnow(dt);
  [hero.rig,...workers.map(w=>w.rig),...customers.map(c=>c.rig)].forEach(r=>r.mixer.update(dt));
  for(let i=coinFx.length-1;i>=0;i--){ const f=coinFx[i]; f.t+=dt; f.m.position.y+=dt*(f.isText?1.2:2); if(f.m.material){f.m.material.opacity=Math.max(0,0.9-f.t);} if(!f.isText)f.m.scale.setScalar(1+f.t*2); if(f.t>0.9){scene.remove(f.m);coinFx.splice(i,1);} }
  saveT+=dt; if(saveT>3){saveT=0;save();}
  document.getElementById('coins').textContent=fmt(S.coins);
  renderer.render(scene,camera);
}

// ============================== 시작 ==============================
loadAll().then(()=>{
  buildWorld(); buildStations(); buildSnow();
  hero={rig:makeRig('Rogue_Hooded',0,-4,0), carry:null, carryObjs:[]};
  // 저장 복원
  if(S.unlocked.worker1) hireWorker();
  if(S.unlocked.worker2) hireWorker();
  if(S.unlocked.table2) buildTable(TABLES[1]);
  if(S.unlocked.table3) buildTable(TABLES[2]);
  if(S.unlocked.table4) buildTable(TABLES[3]);
  if(S.unlocked.table5) buildTable(TABLES[4]);
  if(S.unlocked.worker3) hireWorker();
  if(S.unlocked.hunt2) HUNT.iv=1.4;
  if(S.unlocked.hunt3) HUNT.iv=0.8;
  if(S.unlocked.bag1) CFG.carryMax=5;
  if(S.unlocked.fire2) FIRE.ct=1.0;
  PADS.filter(p=>!S.unlocked[p.id]).forEach(makePad);
  offlineSettle();
  setTimeout(()=>toast('WASD/방향키 또는 드래그로 이동 · 발판을 밟아 확장!'),1200);
  const l=document.getElementById('loading'); l.style.opacity=0; setTimeout(()=>l.remove(),500);
  window.__g={S,CFG,get hero(){return hero},workers,HUNT,FIRE,TABLES,get customers(){return customers},get queue(){return queue},pads,get pads(){return pads}};
  requestAnimationFrame(loop);
}).catch(e=>{
  document.querySelector('#loading p').textContent='에셋 로딩 실패: '+e.message;
});
