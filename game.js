import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// ============================== 설정 ==============================
const CFG = {
  camOffset: new THREE.Vector3(11.5, 14.5, 11.5),
  heroSpeed: 8.5, workerSpeed: 5.5, custSpeed: 4.5,
  huntInterval: 2.5, cookTime: 1.8, eatTime: 2.5, custSpawn: 1.0,
  queueMax: 10, meatMax: 4, stewMax: 4, carryMax: 3,
  offlineCapMin: 120,
};
const PAD_DEFS=[
  { id:'table',  label:'카운터 확장',  pos:[6.5,-5.0],  base:[120,300,600],        mult:2.2, icon:'table' },
  { id:'hunter', label:'재료 알바 고용', pos:[-3.5,-5.2], base:[50,220,380,600,850],  mult:1.6, icon:'hunter' },
  { id:'server', label:'서빙 알바 고용', pos:[-7.0,-5.8], base:[50,220,380,600,850],  mult:1.6, icon:'server' },
  { id:'hunt',   label:'재료 입고',  pos:[-8.9,-1.5], base:[80,200,400,700],        mult:1.7, icon:'steak' },
  { id:'fire',   label:'주방 강화', pos:[1.25,7.7], base:[100,250,500],           mult:1.7, icon:'Large_Pot_Filled' },
  { id:'bag',    label:'큰 쟁반',   pos:[-3.0,-8.0],  base:[150],                   mult:1.8, icon:'bag' },
];
// 무한 레벨: 가격은 지수 곡선으로 계속 상승, 발판은 사라지지 않음
function costAt(def,lv){ const b=def.base; return lv<b.length ? b[lv] : Math.round(b[b.length-1]*Math.pow(def.mult,lv-b.length+1)); }
function huntIv(lv){ const a=[2.5,1.4,0.8,0.6,0.45]; return lv<a.length?a[lv]:Math.max(0.25,a[a.length-1]*Math.pow(0.85,lv-a.length+1)); }
function fireCt(lv){ const a=[1.8,1.0,0.7,0.5]; return lv<a.length?a[lv]:Math.max(0.3,a[a.length-1]*Math.pow(0.85,lv-a.length+1)); }

// ============================== 상태 ==============================
const SAVE_KEY='snowcamp_v3';
let S = { coins:20, unlocked:{}, served:0, ts:Date.now() };
try { const d=JSON.parse(localStorage.getItem(SAVE_KEY)); if(d&&typeof d.coins==='number') S={...S,...d}; } catch(e){}
function save(){ S.ts=Date.now(); try{localStorage.setItem(SAVE_KEY,JSON.stringify(S));}catch(e){} }
// 구버전 세이브 → 레벨제 마이그레이션
if(!S.lv){
  const u=S.unlocked||{};
  S.lv={ table:(u.table2?1:0)+(u.table3?1:0)+(u.table4?1:0)+(u.table5?1:0),
         worker:(u.worker1?1:0)+(u.worker2?1:0)+(u.worker3?1:0),
         hunt:(u.hunt2?1:0)+(u.hunt3?1:0), fire:(u.fire2?1:0), bag:(u.bag1?1:0) };
  delete S.unlocked; save();
}
if(!S.lvT){ S.lv.table=Math.min(3,Math.floor((S.lv.table||0)/2)); S.lvT=true; save(); }
if(S.lv.worker!==undefined){ const n=S.lv.worker||0; S.lv.hunter=Math.ceil(n/2); S.lv.server=Math.floor(n/2); delete S.lv.worker; save(); }
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
scene.background=new THREE.Color(0xf3e3c8);
scene.fog=new THREE.Fog(0xf3e3c8, 36, 75);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,200);
function fitCam(){ const a=innerWidth/innerHeight, s=11.2; camera.left=-s*a; camera.right=s*a; camera.top=s; camera.bottom=-s; camera.updateProjectionMatrix(); }
fitCam(); addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);fitCam();});
const hemi=new THREE.HemisphereLight(0xeaf2ff,0x9fb4d8,0.95); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff3e0,2.0);
sun.position.set(12,20,6); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.bias=-0.0004;
scene.add(sun); scene.add(sun.target);

// ============================== 에셋 로딩 ==============================
const FILES=['Rogue_Hooded','Rogue','Mage','Knight','Barbarian','pine1','pine2','ctree','rock','bush','steak','menu','coins','Ramen','Udon','Gyoza','Dango','Chukaman','Large_Pot_Filled','Oven','Counter_Straight','Counter_End','Stool','Wood_Floor','Red_Wood_Wall','Shoji_Wall','Japanese_Door','Torii_Gate','Wall_with_Shelves','Kitchen','Sushi_Truck','Hanging_Lantern','Post_Lantern','Red_Lantern'];
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
  // 따뜻한 야외 바닥
  const geo=new THREE.CylinderGeometry(30,30.8,1.2,64);
  const mat=new THREE.MeshStandardMaterial({color:0xd9cdb2,roughness:0.95});
  const ground=new THREE.Mesh(geo,mat); ground.position.y=-0.6; ground.receiveShadow=true; scene.add(ground);
  // 가게 내부 우드 플로어 (4x4 타일)
  for(let ix=0;ix<5;ix++) for(let iz=0;iz<4;iz++)
    staticAsset('Wood_Floor', -8+ix*4, -6+iz*4, 0, 1, -0.06);
  // 벽: 북쪽 + 양옆 (홍목), 남쪽은 거리로 개방
  for(let i=0;i<10;i++) staticAsset('Red_Wood_Wall', -8.4+i*1.87, 9.6, 0, 0.5);
  for(let i=0;i<8;i++){ staticAsset('Red_Wood_Wall', -9.6, -4.2+i*1.87, Math.PI/2, 0.5); staticAsset('Red_Wood_Wall', 10.6, -4.2+i*1.87, Math.PI/2, 0.5); }
  staticAsset('Shoji_Wall', -9.6, 5.5, Math.PI/2, 0.5); staticAsset('Shoji_Wall', 10.6, 5.5, Math.PI/2, 0.5);
  staticAsset('Wall_with_Shelves', -2.2, 9.55, 0, 0.5);
  staticAsset('Japanese_Door', 2.0, 9.55, 0, 0.5);
  // 입구: 토리이 + 포스트 랜턴 + 빨간 제등
  staticAsset('Torii_Gate', 0, -10.6, 0, 0.55);
  staticAsset('Post_Lantern', -2.6, -9.6, 0, 0.7); staticAsset('Post_Lantern', 2.6, -9.6, 0, 0.7);
  staticAsset('Red_Lantern', -1.1, -10.6, 0, 1.2, 2.2); staticAsset('Red_Lantern', 1.1, -10.6, 0, 1.2, 2.2);
  // 바깥 나무/바위 장식
  staticAsset('pine1', -14, -7, 0.4, 1.1); staticAsset('pine2', 14.5, 5, 2.1, 1); staticAsset('ctree', -13.5, 12, 1.2, 0.9);
  staticAsset('bush', 12.5, -8, 0, 1); staticAsset('rock', -12.5, -2.5, 0.7, 1); staticAsset('bush', -11.5, 16, 0, 1);
  staticAsset('menu', 3.6, -8.6, -0.4, 1);
}

const HUNT={pos:new THREE.Vector3(-7.5,0,8.8), stock:[], iv:CFG.huntInterval, t:0};
const FIRE={pos:new THREE.Vector3(-3,0,8.6), raw:0, stew:0, cooking:0, ct:CFG.cookTime};
const TABLE_TIERS0=[
  {seats:2, scale:0.85, rug:2.4, color:0xd8b08c},
  {seats:4, scale:1.05, rug:3.0, color:0xd09a70},
  {seats:6, scale:1.25, rug:3.5, color:0xc47a58},
  {seats:8, scale:1.45, rug:4.0, color:0xb45c48},
];
function tierDef(lv){
  if(lv<TABLE_TIERS0.length) return TABLE_TIERS0[lv];
  return {seats:8+(lv-3), scale:Math.min(1.6,1.45+0.05*(lv-3)), rug:Math.min(4.4,4.0+0.1*(lv-3)), color:0xb45c48};
}
const TABLES=[ {pos:new THREE.Vector3(-4.5,0,6.5), tier:0, custs:[], stew:0, group:null, colBoxes:[]},
               {pos:new THREE.Vector3(6.5,0,6.5),  tier:0, custs:[], stew:0, group:null, colBoxes:[]} ];
const OBSTACLES=[];
function seatCap(t){ return tierDef(t.tier).seats; }
const ROW_D=3.8, SP=1.3; // 열 간격, 좌석 간격(넓게)
function rowCount(t){ return Math.min(3, Math.ceil(seatCap(t)/3)); }
function perRow(t){ return Math.ceil(seatCap(t)/rowCount(t)); }
function rowSeats(t,r){ return Math.min(perRow(t), seatCap(t)-r*perRow(t)); }
function seatPos(t,i){
  const pr=perRow(t), r=Math.floor(i/pr), col=i%pr, rc=rowSeats(t,r);
  return new THREE.Vector3(t.pos.x+(col-(rc-1)/2)*SP, 0, t.pos.z-r*ROW_D-1.4);
}
let workers=[], pads=[], hero, campfire, custT=0, stockMeshes=[], stewMeshes=[], coinFx=[];

function buildStations(){
  // 식자재 트럭 (주방 뒤편 재료 공급처)
  staticAsset('Sushi_Truck', HUNT.pos.x-0.3, HUNT.pos.z+0.2, Math.PI*0.5, 0.32);
  // 주방 (카운터 뒤 분리 구역): 조리 냄비 + 오븐 + 키친 플로어
  campfire=buildKitchen(FIRE.pos.x,FIRE.pos.z);
  staticAsset('Oven', 0.5, 8.9, Math.PI, 0.55);
  staticAsset('Kitchen', -3, 8.8, 0, 0.5, 0.05);
  staticAsset('Kitchen', -7, 8.8, 0, 0.5, 0.05);
  // 카운터 좌석 (카운터 자체가 주방과 홀을 분리)
  TABLES.forEach(t=>buildTable(t));
  staticAsset('coins',8.8,-5.0,0,0.8);
  // 장애물 (영웅 충돌용): 벽/기물
  OBSTACLES.push(
    {x1:-10.6,z1:9.35,x2:11,z2:10.5},      // 북벽
    {x1:-10.6,z1:-5.5,x2:-9.35,z2:10},     // 서벽
    {x1:10.35,z1:-5.5,x2:11.6,z2:10},      // 동벽
    {x1:-8.8,z1:7.6,x2:-6.2,z2:9.6},       // 트럭
    {x1:-0.25,z1:8.15,x2:1.25,z2:9.65},    // 오븐
    {x1:-3.6,z1:8.0,x2:-2.4,z2:9.2},       // 육수 냄비
    {x1:1.35,z1:-10.85,x2:1.85,z2:-10.35}, // 토리이 기둥
    {x1:-1.85,z1:-10.85,x2:-1.35,z2:-10.35},
    {x1:3.15,z1:-9.05,x2:4.05,z2:-8.15},   // 메뉴판
    {x1:8.3,z1:-5.5,x2:9.3,z2:-4.5}      // 코인
  );
}
function buildKitchen(x,z){
  const g=new THREE.Group(); g.position.set(x,0,z);
  const pot=cloneAsset('Large_Pot_Filled'); pot.scale.setScalar(0.85); g.add(pot);
  const pl=new THREE.PointLight(0xffa050,22,8,1.8); pl.position.set(0,1.8,0); g.add(pl);
  g.userData.flicker=(t)=>{ const n=Math.sin(t*9)+Math.sin(t*13+1.3); pl.intensity=20+n*3; };
  scene.add(g); return g;
}
function buildTable(t){
  if(t.group){ scene.remove(t.group); }
  for(const b of t.colBoxes||[]){ const bi=OBSTACLES.indexOf(b); if(bi>=0)OBSTACLES.splice(bi,1); }
  t.colBoxes=[];
  const tier=tierDef(t.tier);
  const n=tier.seats, rows=rowCount(t), pr=perRow(t);
  const g=new THREE.Group(); g.position.copy(t.pos);
  const divM=new THREE.MeshStandardMaterial({color:0x6b4426,roughness:.9});
  for(let r=0;r<rows;r++){
    const rc=rowSeats(t,r), rz=-r*ROW_D;
    const rug=new THREE.Mesh(new THREE.BoxGeometry(rc*SP+1.8,0.04,3.4),new THREE.MeshStandardMaterial({color:tier.color,roughness:1}));
    rug.position.set(0,0.02,rz-0.35); rug.receiveShadow=true; g.add(rug);
    const cw=rc*SP+0.7;
    const ct=cloneAsset('Counter_Straight'); ct.scale.set(cw/4,0.62,0.7); ct.position.set(0,0,rz); g.add(ct);
    for(let i=0;i<rc;i++){
      const st=cloneAsset('Stool'); st.scale.setScalar(0.75); st.position.set((i-(rc-1)/2)*SP,0,rz-1.4); g.add(st);
    }
    // 이치란식 1인석 칸막이
    for(let i=0;i<rc-1;i++){
      const d=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.8,1.05),divM);
      d.position.set((i-(rc-1)/2+0.5)*SP,1.19+0.4,rz-0.45); d.castShadow=true; g.add(d);
    }
    const hl=cloneAsset('Hanging_Lantern'); hl.position.set(0,2.7,rz); g.add(hl);
    if(t.tier>=2){ const ra=cloneAsset('Ramen'); ra.scale.setScalar(0.6); ra.position.set(0,1.19,rz-0.1); g.add(ra); }
    t.colBoxes.push({x1:t.pos.x-cw/2-0.15, z1:t.pos.z+rz-0.8, x2:t.pos.x+cw/2+0.15, z2:t.pos.z+rz+0.8});
  }
  OBSTACLES.push(...t.colBoxes);
  scene.add(g); t.group=g;
  while(t.custs.length<n) t.custs.push(null);
  t.custs=t.custs.slice(0,n);
  t.custs.forEach((c,i)=>{ if(c){ const sp2=seatPos(t,i); c.rig.obj.position.set(sp2.x,0,sp2.z); } });
  buildRoads();
}
// 도로 (입구/세로/열별 통로)
let roadGroup=null;
function buildRoads(){
  if(roadGroup){ scene.remove(roadGroup); }
  roadGroup=new THREE.Group(); scene.add(roadGroup);
  const roadMat=new THREE.MeshStandardMaterial({color:0xbcab8c,roughness:1});
  const edgeMat=new THREE.MeshStandardMaterial({color:0x8f7d61,roughness:1});
  const mkRoad=(x,z,w,l)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,0.06,l),roadMat); m.position.set(x,0.16,z); m.receiveShadow=true; roadGroup.add(m);
    const horiz=w>l;
    for(const s of [-1,1]){
      const e=new THREE.Mesh(new THREE.BoxGeometry(horiz?w:0.12,0.07,horiz?0.12:l),edgeMat);
      e.position.set(horiz?x:x+s*(w/2-0.06), 0.17, horiz?z+s*(l/2-0.06):z); roadGroup.add(e);
    }
  };
  mkRoad(0,-8,2,5.5);         // 입구 도로
  mkRoad(2,-0.55,1.6,10.1);   // 세로 도로 (줄 -> 카운터 홀)
  const mr=Math.max(...TABLES.map(rowCount));
  for(let r=0;r<mr;r++) mkRoad(0.75, 4.2-r*ROW_D, 18.5, 1.6); // 열별 통로
}
// 발판
function padIcon(k){
  if(k==='bag'){
    const grp=new THREE.Group();
    const a=cloneAsset('steak'); a.scale.setScalar(0.5); a.position.set(-0.28,0,0); grp.add(a);
    const b=cloneAsset('steak'); b.scale.setScalar(0.5); b.position.set(0.28,0.1,0); b.rotation.y=1.2; grp.add(b);
    const c=cloneAsset('steak'); c.scale.setScalar(0.5); c.position.set(0,0.5,0); c.rotation.y=2.4; grp.add(c);
    return grp;
  }
  if(k==='table'){
    const grp=new THREE.Group();
    const t=cloneAsset('Counter_Straight'); t.scale.set(0.16,0.3,0.35); grp.add(t);
    const ch=cloneAsset('Stool'); ch.scale.setScalar(0.4); ch.position.set(0.75,0,0.35); grp.add(ch);
    return grp;
  }
  if(k==='hunter'){ const m=cloneAsset('Rogue'); m.scale.setScalar(0.62); return m; }
  if(k==='server'){ const m=cloneAsset('Mage'); m.scale.setScalar(0.62); return m; }
  const m=cloneAsset(k); m.scale.setScalar(0.6); return m;
}
function makePad(def){
  const lv=S.lv[def.id]||0;
  const cost=costAt(def,lv);
  const g=new THREE.Group(); g.position.set(def.pos[0],0.02,def.pos[1]);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.7,1.05,40),new THREE.MeshBasicMaterial({color:0xffd34d,transparent:true,opacity:.95,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2; g.add(ring);
  const fill=new THREE.Mesh(new THREE.CircleGeometry(0.7,40),new THREE.MeshBasicMaterial({color:0xffd34d,transparent:true,opacity:.25,side:THREE.DoubleSide}));
  fill.rotation.x=-Math.PI/2; g.add(fill);
  const icon=padIcon(def.icon); icon.position.y=1.8; g.add(icon);
  const costLb=textSprite(`🪙${cost}`,{size:44}); costLb.position.y=0.9; g.add(costLb);
  g.userData={def,cost,fill,ring,icon,costLb,progress:0};
  scene.add(g); pads.push(g);
}
function applyPadLevel(id,lv){
  if(id==='table'){ TABLES.forEach(t=>{ t.tier=lv; buildTable(t); }); }
  if(id==='hunter') hireWorker('hunter');
  if(id==='server') hireWorker('server');
  if(id==='hunt') HUNT.iv=huntIv(lv);
  if(id==='fire'){ FIRE.ct=fireCt(lv); campfire.scale.setScalar(1+0.18*Math.min(lv,6)); }
  if(id==='bag') CFG.carryMax=4+lv;
}
function purchasePad(g){
  sfx.unlock();
  const def=g.userData.def;
  const lv=(S.lv[def.id]||0)+1; S.lv[def.id]=lv; save();
  toast(`✅ ${def.label} Lv.${lv}!`);
  applyPadLevel(def.id,lv);
  pop(g.position,0xffd34d);
  g.userData.cost=costAt(def,lv); g.userData.progress=0;
  g.userData.fill.scale.setScalar(0.2);
  g.remove(g.userData.costLb);
  g.userData.costLb=textSprite(`🪙${costAt(def,lv)}`,{size:44}); g.userData.costLb.position.y=0.9; g.add(g.userData.costLb);
}
function hireWorker(role){
  const rig=makeRig(role==='hunter'?'Rogue':'Mage', FIRE.pos.x+1.5, FIRE.pos.z-1.5, Math.PI);
  workers.push({rig, role, state:'idle', carry:null, carryObj:null, t:0, target:new THREE.Vector3()});
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
// 모바일 텍스트 선택/콜아웃 방지
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('selectstart',e=>e.preventDefault());
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('gesturechange',e=>e.preventDefault());
document.addEventListener('gestureend',e=>e.preventDefault());
// iOS Safari는 user-scalable=no를 무시하므로 JS로 핀치/더블탭 줌 차단
document.addEventListener('touchmove',e=>{ if(e.touches.length>1) e.preventDefault(); },{passive:false});
document.addEventListener('touchend',e=>{ e.preventDefault(); },{passive:false});
document.addEventListener('dblclick',e=>e.preventDefault());
addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
const joy=document.getElementById('joy'), knob=document.getElementById('joyknob');
let joyVec={x:0,y:0}, joyId=null;
addEventListener('touchstart',e=>{ joy.style.display='block'; const t=e.changedTouches[0]; joyId=t.identifier; joy.style.left=(t.clientX-60)+'px'; joy.style.top=(t.clientY-60)+'px'; joy.style.bottom='auto'; },{passive:true});
addEventListener('touchmove',e=>{ for(const t of e.changedTouches){ if(t.identifier===joyId){ const r=joy.getBoundingClientRect(); let dx=t.clientX-(r.left+60), dy=t.clientY-(r.top+60); const l=Math.hypot(dx,dy); if(l>44){dx*=44/l;dy*=44/l;} knob.style.left=(35+dx)+'px'; knob.style.top=(35+dy)+'px'; joyVec={x:dx/44,y:dy/44}; } } },{passive:true});
addEventListener('touchend',e=>{ for(const t of e.changedTouches){ if(t.identifier===joyId){ joyId=null; joyVec={x:0,y:0}; knob.style.left='35px'; knob.style.top='35px'; } } },{passive:true});

// ============================== 로직 ==============================
const camTarget=new THREE.Vector3(0,0,0);
function collideHero(){
  const p=hero.rig.obj.position, r=0.35;
  for(const b of OBSTACLES){
    const nx=Math.max(b.x1,Math.min(b.x2,p.x)), nz=Math.max(b.z1,Math.min(b.z2,p.z));
    const dx=p.x-nx, dz=p.z-nz, d2=dx*dx+dz*dz;
    if(d2<r*r){
      if(d2>1e-6){ const d=Math.sqrt(d2); p.x=nx+dx/d*r; p.z=nz+dz/d*r; }
      else {
        const px=Math.min(p.x-b.x1,b.x2-p.x), pz=Math.min(p.z-b.z1,b.z2-p.z);
        if(px<pz) p.x=(p.x-b.x1<b.x2-p.x)?b.x1-r:b.x2+r;
        else      p.z=(p.z-b.z1<b.z2-p.z)?b.z1-r:b.z2+r;
      }
    }
  }
}
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
    const p=hero.rig.obj.position;
    p.x=Math.max(-10.9,Math.min(10.9,p.x));
    p.z=Math.max(-20.9,Math.min(26.9,p.z));
    for(const [cx,cz] of [[6.4,-16.4],[6.4,22.4],[-6.4,-16.4],[-6.4,22.4]]){
      if((p.x-cx)*Math.sign(cx)>0 && (p.z-cz)*Math.sign(cz)>0){
        const dx=p.x-cx,dz=p.z-cz,l=Math.hypot(dx,dz);
        if(l>4.5){ p.x=cx+dx/l*4.5; p.z=cz+dz/l*4.5; }
      }
    }
    collideHero();
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
  return cloneAsset(kind==='meat'?'steak':'Ramen');
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
    m.position.set(HUNT.pos.x+0.4+i*0.7, 0, HUNT.pos.z-1.9); m.rotation.y=i*1.3; scene.add(m); stockMeshes.push(m);
  });
}
function refreshStew(){
  stewMeshes.forEach(m=>scene.remove(m)); stewMeshes=[];
  for(let i=0;i<FIRE.stew;i++){
    const m=cloneAsset('Ramen'); m.scale.setScalar(0.5);
    m.position.set(FIRE.pos.x+1.2+i*0.7, 0, FIRE.pos.z-0.7); scene.add(m); stewMeshes.push(m);
  }
}
const _sv2=new THREE.Vector3();
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
  } else if(hero.carry && hero.carry.kind==='stew' && hero.dropCd<=0){
    let best=null, bd=2.2;
    for(const t of TABLES){ if(t.stew<seatCap(t)){
      for(let r=0;r<rowCount(t);r++){ const d=dist(hp,_sv2.set(t.pos.x,0,t.pos.z-r*ROW_D+1.0)); if(d<bd){ bd=d; best=t; } }
    } }
    if(best){
      const n=Math.min(hero.carry.n,seatCap(best)-best.stew); best.stew+=n; hero.carry.n-=n;
      if(hero.carry.n<=0)hero.carry=null;
      updateHeroCarry(); pop(best.pos,0x9fdf7a); sfx.drop(); hero.dropCd=0.45;
    }
  }
}
// 일꾼 AI
function pickServeTable(){
  let best=null,bs=1e9;
  for(const t of TABLES){
    if(t.stew>=seatCap(t)) continue;
    const waiting=t.custs.filter(c=>c&&c.state==='wait').length;
    const score=-waiting*100+t.stew*10+TABLES.indexOf(t);
    if(score<bs){ bs=score; best=t; }
  }
  return best;
}
const _sv=new THREE.Vector3();
function updateWorker(w,dt){
  const o=w.rig.obj;
  const go=(v)=>{ w.target.copy(v); };
  if(w.state==='idle'){
    if(w.role==='server'){
      if(w.carry==='stew' && TABLES.some(t=>t.stew<seatCap(t))) { w.state='toTable'; }
      else if(FIRE.stew>0 && TABLES.some(t=>t.stew<seatCap(t))) { w.state='toStew'; }
      else playAnim(w.rig,'Idle');
    } else {
      if(w.carry==='meat') { w.state='toFire'; }
      else if(HUNT.stock.length>0 && FIRE.raw<CFG.stewMax) { w.state='toMeat'; }
      else playAnim(w.rig,'Idle');
    }
  }
  if(w.state==='toStew'){ go(FIRE.pos); if(step(w,dt)){ if(FIRE.stew>0){FIRE.stew--; setWorkerCarry(w,'stew'); playAnim(w.rig,'PickUp'); refreshStew(); w.state='toTable';} else w.state='idle'; } }
  else if(w.state==='toMeat'){ go(HUNT.pos); if(step(w,dt)){ if(HUNT.stock.length>0){HUNT.stock.pop(); setWorkerCarry(w,'meat'); playAnim(w.rig,'PickUp'); refreshStock(); w.state='toFire';} else w.state='idle'; } }
  else if(w.state==='toFire'){ go(FIRE.pos); if(step(w,dt)){ FIRE.raw++; setWorkerCarry(w,null); pop(FIRE.pos,0xff8a30); w.state='idle'; } }
  else if(w.state==='toTable'){
    const t=pickServeTable();
    if(!t){ w.state='idle'; }
    else { go(_sv.set(t.pos.x,0,t.pos.z+0.9)); if(step(w,dt)){ if(t.stew<seatCap(t)){ t.stew++; setWorkerCarry(w,null); pop(t.pos,0x9fdf7a); sfx.serve(); } w.state='idle'; } }
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
const QA=new THREE.Vector3(2.0,0,-5.5);          // 줄 머리
const QD=new THREE.Vector3(-0.127,0,-0.992);     // 줄 방향 (입구 쪽)
function queueSlot(k){ return new THREE.Vector3(QA.x+QD.x*1.7*k, 0, QA.z+QD.z*1.7*k); }
function spawnCustomer(){
  const kinds=['Knight','Barbarian','Mage','Rogue'];
  const rig=makeRig(kinds[Math.floor(Math.random()*kinds.length)], ENTR.x+(Math.random()-0.5)*2, ENTR.z, 0);
  const c={rig, state:'toQueue', t:0, table:null, pay:0, wp:[]};
  customers.push(c); queue.push(c);
}
function walkWp(c,dt){
  const o=c.rig.obj;
  while(c.wp&&c.wp.length){
    const d=new THREE.Vector3().subVectors(c.wp[0],o.position); d.y=0;
    if(d.length()<0.35){ c.wp.shift(); continue; }
    d.normalize(); o.position.addScaledVector(d,CFG.custSpeed*dt); o.rotation.y=Math.atan2(d.x,d.z); playAnim(c.rig,'Walking_A');
    return true;
  }
  return false;
}
function updateCustomers(dt){
  custT+=dt;
  // 수요는 항상 넘침: 줄이 차지 않았으면 계속 도착
  // 수요 스케일: 좌석이 늘수록 손님이 더 자주, 더 많이 옴
  const seats=TABLES.reduce((a,t)=>a+seatCap(t),0);
  const spawnIv=Math.max(0.25, CFG.custSpawn*4/seats);
  const qmax=CFG.queueMax+Math.floor(seats/2);
  const cmax=Math.min(60, seats+qmax+6);
  if(custT>=spawnIv && queue.length<qmax && customers.length<cmax){
    custT=0; spawnCustomer();
  }
  // 빈 좌석이 있으면 줄 맨 앞 손님 착석
  for(const t of TABLES){
    for(let i=0;i<t.custs.length;i++){
      if(!t.custs[i] && queue.length>0){
        const c=queue.shift(); t.custs[i]=c; c.table=t; c.seatIdx=i; c.state='toSeat';
        const spp=seatPos(t,i); c.sx=spp.x; c.aisleZ=spp.z-0.9;
        c.wp=[new THREE.Vector3(2,0,c.aisleZ), new THREE.Vector3(spp.x,0,c.aisleZ)];
      }
    }
  }
  for(let i=customers.length-1;i>=0;i--){
    const c=customers[i]; const o=c.rig.obj;
    if(c.state==='toQueue'){
      if(walkWp(c,dt)) continue;
      const slot=queueSlot(queue.indexOf(c));
      const d=new THREE.Vector3().subVectors(slot,o.position); d.y=0;
      if(d.length()<0.35){ playAnim(c.rig,'Idle'); o.rotation.y=Math.atan2(QA.x-o.position.x,QA.z+4-o.position.z); }
      else { d.normalize(); o.position.addScaledVector(d,CFG.custSpeed*dt); o.rotation.y=Math.atan2(d.x,d.z); playAnim(c.rig,'Walking_A'); }
    }
    if(c.state==='wait'){
      if(!c.bubble){ c.bubble=textSprite('🍜',{size:40,bg:'rgba(255,255,255,.85)'}); c.bubble.position.copy(seatPos(c.table,c.seatIdx)).add(new THREE.Vector3(0,2.3,0)); scene.add(c.bubble); }
      c.bubble.position.y=2.3+Math.sin(clockT*3)*0.1;
    } else if(c.bubble){ scene.remove(c.bubble); c.bubble=null; }
    if(c.state==='toSeat'){
      if(walkWp(c,dt)) continue;
      const sp=seatPos(c.table,c.seatIdx);
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
        if(c.table){ c.table.custs[c.seatIdx]=null; c.table=null; c.seatIdx=null; }  // 일어나는 순간 좌석 해제 → 다음 손님 즉시 배정
        c.state='leave'; playAnim(c.rig,'Cheer');
        c.cheerT=0;
        c.wp=[new THREE.Vector3(c.sx!=null?c.sx:0,0,c.aisleZ!=null?c.aisleZ:4.2), new THREE.Vector3(2,0,c.aisleZ!=null?c.aisleZ:4.2), new THREE.Vector3(2,0,-6), new THREE.Vector3(0,0,-8)];
      }
    }
    else if(c.state==='leave'){
      c.cheerT=(c.cheerT||0)+dt;
      if(c.cheerT<0.9) continue;
      if(walkWp(c,dt)) continue;
      const d=new THREE.Vector3().subVectors(EXIT,o.position); d.y=0;
      if(d.length()<0.8){ if(c.table){ c.table.custs[c.seatIdx]=null; } const qi=queue.indexOf(c); if(qi>=0)queue.splice(qi,1); scene.remove(o); customers.splice(i,1); continue; }
      d.normalize(); o.position.addScaledVector(d,CFG.custSpeed*dt); o.rotation.y=Math.atan2(d.x,d.z); playAnim(c.rig,'Walking_A');
    }
  }
}
// 발판
function updatePads(dt){
  for(const g of [...pads]){
    const cost=g.userData.cost;
    const near=dist(hero.rig.obj.position,g.position)<1.35;
    g.userData.ring.material.opacity = near?1:(0.7+Math.sin(clockT*3)*0.2);
    if(near && S.coins>0){
      const rate=Math.max(60,cost*1.4);
      const pay=Math.min(rate*dt, S.coins, cost-g.userData.progress);
      S.coins-=pay; g.userData.progress+=pay;
      g.userData.fill.scale.setScalar(0.2+0.8*(g.userData.progress/cost));
      if(g.userData.progress>=cost-0.001) purchasePad(g);
    }
  }
}
// 오프라인 정산
function offlineSettle(){
  const mins=(Date.now()-(S.ts||Date.now()))/60000;
  if(mins<3) return;
  const seats=TABLES.reduce((a,t)=>a+seatCap(t),0);
  const gain=Math.floor(Math.min(mins,CFG.offlineCapMin)*seats*1.0);
  if(gain>0){ S.coins+=gain; save(); setTimeout(()=>toast(`오프라인 수익 +${gain} 🪙`),600); }
}

// 눈 입자
// ============================== 메인 루프 ==============================
let clockT=0, lastTs=0, saveT=0;
function loop(ts){
  requestAnimationFrame(loop);
  const dt=Math.min((ts-lastTs)/1000,0.05)||0.016; lastTs=ts; clockT+=dt;
  if(hero.dropCd>0)hero.dropCd-=dt;
  updateHero(dt); updateStations(dt); updatePads(dt);
  workers.forEach(w=>updateWorker(w,dt));
  updateCustomers(dt);
  tryHeroPickupDrop();
  campfire.userData.flicker(clockT);
  pads.forEach(g=>{ if(g.userData.icon){ g.userData.icon.position.y=1.7+Math.sin(clockT*2.6+g.position.x)*0.16; g.userData.icon.rotation.y+=dt*0.9; } });
  hero.carryObjs.forEach((m,i)=>m.position.y=2.1+i*0.42+Math.sin(clockT*4)*0.08);
  workers.forEach(w=>{ if(w.carryObj) w.carryObj.position.y=2.4+Math.sin(clockT*4+1)*0.12; });
  [hero.rig,...workers.map(w=>w.rig),...customers.map(c=>c.rig)].forEach(r=>r.mixer.update(dt));
  for(let i=coinFx.length-1;i>=0;i--){ const f=coinFx[i]; f.t+=dt; f.m.position.y+=dt*(f.isText?1.2:2); if(f.m.material){f.m.material.opacity=Math.max(0,0.9-f.t);} if(!f.isText)f.m.scale.setScalar(1+f.t*2); if(f.t>0.9){scene.remove(f.m);coinFx.splice(i,1);} }
  saveT+=dt; if(saveT>3){saveT=0;save();}
  document.getElementById('coins').textContent=fmt(S.coins);
  renderer.render(scene,camera);
}

// ============================== 시작 ==============================
loadAll().then(()=>{
  buildWorld(); buildStations();
  hero={rig:makeRig('Rogue_Hooded',0,-1.5,0), carry:null, carryObjs:[], dropCd:0};
  // 저장 복원 (레벨제)
  if(S.lv.table>0){ TABLES.forEach(t=>{ t.tier=S.lv.table; buildTable(t); }); }
  for(let i=0;i<(S.lv.hunter||0);i++) hireWorker('hunter');
  for(let i=0;i<(S.lv.server||0);i++) hireWorker('server');
  if(S.lv.hunt) HUNT.iv=huntIv(S.lv.hunt);
  if(S.lv.fire){ FIRE.ct=fireCt(S.lv.fire); campfire.scale.setScalar(1+0.18*Math.min(S.lv.fire,6)); }
  if(S.lv.bag) CFG.carryMax=4+S.lv.bag;
  PAD_DEFS.forEach(makePad);
  offlineSettle();
  setTimeout(()=>toast('WASD/방향키 또는 드래그로 이동 · 발판을 밟아 확장!'),1200);
  const l=document.getElementById('loading'); l.style.opacity=0; setTimeout(()=>l.remove(),500);
  window.__g={S,CFG,PAD_DEFS,get hero(){return hero},workers,HUNT,FIRE,TABLES,get customers(){return customers},get queue(){return queue},pads,get pads(){return pads}};
  requestAnimationFrame(loop);
}).catch(e=>{
  document.querySelector('#loading p').textContent='에셋 로딩 실패: '+e.message;
});
