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
  { id:'table',  label:'식탁 업그레이드',  pos:[4.5,-3.0],  costs:[120,300,600], icon:'table' },
  { id:'hunter', label:'고기 알바 고용', pos:[-3.0,-4.0], costs:[50,220,380],                    icon:'hunter' },
  { id:'server', label:'서빙 알바 고용', pos:[-7.0,-4.5], costs:[50,220,380],                    icon:'server' },
  { id:'hunt',   label:'사냥 가속',  pos:[-5.5,-1.0], costs:[80,200,400,700],                  icon:'steak' },
  { id:'fire',   label:'모닥불 강화', pos:[2.0,5.2],  costs:[100,250,500],                     icon:'pot' },
  { id:'bag',    label:'큰 가방',   pos:[-3.0,-8.0],  costs:[150],                             icon:'bag' },
];
const HUNT_IV=[2.5,1.4,0.8,0.6,0.45];
const FIRE_CT=[1.8,1.0,0.7,0.5];

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
scene.background=new THREE.Color(0xbfd2ea);
scene.fog=new THREE.Fog(0xbfd2ea, 34, 70);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,200);
function fitCam(){ const a=innerWidth/innerHeight, s=11.2; camera.left=-s*a; camera.right=s*a; camera.top=s; camera.bottom=-s; camera.updateProjectionMatrix(); }
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
  const geo=new THREE.CylinderGeometry(30,30.8,1.2,64);
  const mat=new THREE.MeshStandardMaterial({color:0xe9eefb,roughness:0.95});
  const ground=new THREE.Mesh(geo,mat); ground.position.y=-0.6; ground.receiveShadow=true; scene.add(ground);
  // 얼음 패치 (바닥 무늬만, 안쪽 최소)
  const iceM=new THREE.MeshStandardMaterial({color:0xd3e4f7,roughness:0.35});
  [[-6,-7,2.4],[-15,3,2.6],[16,-4,2.2],[4,-24,2.6],[-17,14,2.4],[18,12,2.2]].forEach(([x,z,r])=>{
    const ice=new THREE.Mesh(new THREE.CircleGeometry(r,24),iceM);
    ice.rotation.x=-Math.PI/2; ice.position.set(x,0.012,z); ice.receiveShadow=true; scene.add(ice);
  });
  // 마을 안 조명 토치만 유지
  staticAsset('torch',-3.4,-1.6,0,1); staticAsset('torch',4.2,-3.2,0,1); staticAsset('torch',-1.5,4.8,0,1); staticAsset('torch',3.5,8,0,1);
  buildFence();
}
// ============================== 울타리 마을 ==============================
// 둥근 사각형 마을 경계: x[-11.5,11.5], z[-21.5,27.5], 코너 r=5 / 남쪽 게이트 |x|<2.4
const FENCE={hx:11.5, cz:3, hz:24.5, r:5, gate:2.4};
function fencePerimeter(){
  // {x,z,tx,tz} 점열: 접선(tx,tz) 기준, 바깥 법선은 (tz,-tx) 부호 보정
  const {hx,cz,hz,r,gate}=FENCE;
  const step=1.7, pts=[];
  const push=(x,z,tx,tz)=>pts.push({x,z,tx,tz});
  const line=(x1,z1,x2,z2,skipGate)=>{
    const len=Math.hypot(x2-x1,z2-z1), n=Math.max(1,Math.round(len/step));
    for(let i=0;i<=n;i++){
      const t=i/n, x=x1+(x2-x1)*t, z=z1+(z2-z1)*t;
      if(skipGate && Math.abs(x)<gate) continue;
      push(x,z,(x2-x1)/len,(z2-z1)/len);
    }
  };
  const arc=(cx,cz2,a0,a1)=>{
    const len=Math.abs(a1-a0)*r, n=Math.max(2,Math.round(len/step));
    for(let i=0;i<=n;i++){
      const a=a0+(a1-a0)*(i/n);
      push(cx+Math.cos(a)*r, cz2+Math.sin(a)*r, -Math.sin(a)*Math.sign(a1-a0), Math.cos(a)*Math.sign(a1-a0));
    }
  };
  const zS=cz-hz, zN=cz+hz;
  // 남(→), 동(↑), 북(←), 서(↓) - 반시계
  line(-(hx-r),zS, hx-r,zS, true);                    // 남쪽 (게이트 포함)
  arc(hx-r, zS+r, -Math.PI/2, 0);                     // SE 코너
  line(hx, zS+r, hx, zN-r);                           // 동쪽
  arc(hx-r, zN-r, 0, Math.PI/2);                      // NE 코너
  line(hx-r, zN, -(hx-r), zN);                        // 북쪽
  arc(-(hx-r), zN-r, Math.PI/2, Math.PI);             // NW 코너
  line(-hx, zN-r, -hx, zS+r);                         // 서쪽
  arc(-(hx-r), zS+r, Math.PI, Math.PI*1.5);           // SW 코너
  // 바깥 법선 계산 (마을 중심 반대 방향)
  pts.forEach(p=>{
    let nx=p.tz, nz=-p.tx;
    const dx=p.x-0, dz=p.z-cz;
    if(nx*dx+nz*dz<0){ nx=-nx; nz=-nz; }
    p.nx=nx; p.nz=nz;
  });
  return pts;
}
function buildFence(){
  const pts=fencePerimeter();
  const postM=new THREE.MeshStandardMaterial({color:0x7a4a26,roughness:.85});
  const railM=new THREE.MeshStandardMaterial({color:0x9c6a3c,roughness:.85});
  const postG=new THREE.CylinderGeometry(0.09,0.115,1.0,7);
  const railG=new THREE.BoxGeometry(0.075,0.11,1);
  const posts=new THREE.InstancedMesh(postG,postM,pts.length);
  const rails=new THREE.InstancedMesh(railG,railM,pts.length*2);
  posts.castShadow=true; rails.castShadow=true;
  const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), up=new THREE.Vector3(0,1,0), sc=new THREE.Vector3(1,1,1);
  let ri=0;
  for(let i=0;i<pts.length;i++){
    const p=pts[i];
    m4.compose(new THREE.Vector3(p.x,0.5,p.z), q.identity(), sc.set(1,1,1));
    posts.setMatrixAt(i,m4);
    // 레일: 다음 점까지 (마지막 점은 첫 점과 연결하지 않음 - 게이트/시계열 끊김 방지를 위해 i+1까지만)
    if(i<pts.length-1){
      const n=pts[i+1];
      const mx=(p.x+n.x)/2, mz=(p.z+n.z)/2;
      const len=Math.hypot(n.x-p.x,n.z-p.z);
      if(len<2.6){ // 게이트 건너뛰기 연결 방지
        const ang=Math.atan2(n.x-p.x,n.z-p.z);
        q.setFromAxisAngle(up,ang);
        for(const h of [0.32,0.68]){
          m4.compose(new THREE.Vector3(mx,h,mz), q, sc.set(1,1,len));
          rails.setMatrixAt(ri++,m4);
        }
      }
    }
  }
  rails.count=ri;
  scene.add(posts); scene.add(rails);
  // 게이트 기둥 2개 + 토치
  const gateM=new THREE.MeshStandardMaterial({color:0x6b3f20,roughness:.8});
  for(const gx of [-FENCE.gate,FENCE.gate]){
    const gp=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.19,1.5,8),gateM);
    gp.position.set(gx,0.75,FENCE.cz-FENCE.hz); gp.castShadow=true; scene.add(gp);
    staticAsset('torch',gx*1.6,FENCE.cz-FENCE.hz-1.2,0,1);
  }
  // 울타리 바깥 자연 배경 (나무/바위/눈언덕) — 안쪽에는 일절 배치하지 않음
  const kinds=['pine1','pine2','ctree','rock','bush'];
  let seed=7;
  const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  for(let i=0;i<pts.length;i+=2){
    const p=pts[i];
    if(Math.abs(p.x)<6 && p.nz<-0.7) continue; // 게이트 앞은 뚫어줌
    const d=2.6+rnd()*4.5;
    const x=p.x+p.nx*d + (-p.nz)*(rnd()-0.5)*1.6;
    const z=p.z+p.nz*d + (p.nx)*(rnd()-0.5)*1.6;
    if(Math.hypot(x,z)>28.5) continue;
    staticAsset(kinds[Math.floor(rnd()*kinds.length)], x, z, rnd()*6.28, 0.45+rnd()*0.25);
    if(rnd()<0.3){ // 바깥에만 눈언덕
      const d2=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),new THREE.MeshStandardMaterial({color:0xf2f5fd,roughness:1}));
      const ss=1.8+rnd()*1.4; d2.scale.set(ss,ss*0.9,ss*0.32);
      d2.position.set(x+(rnd()-0.5)*3,-0.15,z+(rnd()-0.5)*3); d2.receiveShadow=true; scene.add(d2);
    }
  }
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
const TABLE_TIERS=[
  {seats:2, scale:0.85, rug:2.4, color:0xd8b08c},
  {seats:4, scale:1.05, rug:3.0, color:0xd09a70},
  {seats:6, scale:1.25, rug:3.5, color:0xc47a58},
  {seats:8, scale:1.45, rug:4.0, color:0xb45c48},
];
const TABLES=[ {pos:new THREE.Vector3(6.5,0,-2), tier:0, custs:[], stew:0, group:null},
               {pos:new THREE.Vector3(6.5,0,7),  tier:0, custs:[], stew:0, group:null} ];
function seatCap(t){ return TABLE_TIERS[t.tier].seats; }
function seatPos(t,i){
  const tier=TABLE_TIERS[t.tier], n=tier.seats;
  const a=-Math.PI/2 + i*(Math.PI*2/n), cr=1.5*tier.scale+0.35;
  return new THREE.Vector3(t.pos.x+Math.cos(a)*cr, 0, t.pos.z+Math.sin(a)*cr);
}
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
  TABLES.forEach(t=>buildTable(t));
  staticAsset('coins',3.5,1.5,0,0.8);
  staticAsset('barrel',-4.2,4.6,0.5,1);
  staticAsset('menu',-0.5,6.8,-0.5,1);
  // 장작 더미 (모닥불 옆)
  staticAsset('log',FIRE.pos.x-1.6,FIRE.pos.z+1.4,0.3,0.9);
  staticAsset('log',FIRE.pos.x-1.9,FIRE.pos.z+1.7,1.2,0.9);
}
function buildTable(t){
  if(t.group){ scene.remove(t.group); }
  const tier=TABLE_TIERS[t.tier];
  const g=new THREE.Group(); g.position.copy(t.pos);
  const rug=new THREE.Mesh(new THREE.CircleGeometry(tier.rug,40),new THREE.MeshStandardMaterial({color:tier.color,roughness:1}));
  rug.rotation.x=-Math.PI/2; rug.position.y=0.015; rug.receiveShadow=true; g.add(rug);
  const tb=cloneAsset('table'); tb.scale.setScalar(tier.scale); g.add(tb);
  for(let i=0;i<tier.seats;i++){
    const a=-Math.PI/2 + i*(Math.PI*2/tier.seats), cr=1.5*tier.scale+0.35;
    const ch=cloneAsset('chair'); ch.position.set(Math.cos(a)*cr,0,Math.sin(a)*cr); ch.rotation.y=a+Math.PI; g.add(ch);
  }
  if(t.tier>=2){ const deco=cloneAsset('pot'); deco.scale.setScalar(0.5); deco.position.set(0,1.05*tier.scale,0); g.add(deco); }
  scene.add(g); t.group=g;
  while(t.custs.length<tier.seats) t.custs.push(null);
  t.custs=t.custs.slice(0,tier.seats);
  t.custs.forEach((c,i)=>{ if(c){ const sp=seatPos(t,i); c.rig.obj.position.set(sp.x,0,sp.z); } });
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
    const t=cloneAsset('table'); t.scale.setScalar(0.55); grp.add(t);
    const ch=cloneAsset('chair'); ch.scale.setScalar(0.55); ch.position.set(0.9,0,0.6); ch.rotation.y=-0.7; grp.add(ch);
    return grp;
  }
  if(k==='hunter'){ const m=cloneAsset('Rogue'); m.scale.setScalar(0.62); return m; }
  if(k==='server'){ const m=cloneAsset('Mage'); m.scale.setScalar(0.62); return m; }
  const m=cloneAsset(k); m.scale.setScalar(0.6); return m;
}
function makePad(def){
  const lv=S.lv[def.id]||0;
  if(lv>=def.costs.length) return;
  const cost=def.costs[lv];
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
  if(id==='table'){ TABLES.forEach(t=>{ t.tier=Math.min(lv,TABLE_TIERS.length-1); buildTable(t); }); }
  if(id==='hunter') hireWorker('hunter');
  if(id==='server') hireWorker('server');
  if(id==='hunt') HUNT.iv=HUNT_IV[lv];
  if(id==='fire'){ FIRE.ct=FIRE_CT[lv]; campfire.scale.setScalar(1+0.18*lv); }
  if(id==='bag') CFG.carryMax=5;
}
function purchasePad(g){
  sfx.unlock();
  const def=g.userData.def;
  const lv=(S.lv[def.id]||0)+1; S.lv[def.id]=lv; save();
  toast(`✅ ${def.label} Lv.${lv}!`);
  applyPadLevel(def.id,lv);
  pop(g.position,0xffd34d);
  if(lv>=def.costs.length){ scene.remove(g); pads=pads.filter(x=>x!==g); return; }
  g.userData.cost=def.costs[lv]; g.userData.progress=0;
  g.userData.fill.scale.setScalar(0.2);
  g.remove(g.userData.costLb);
  g.userData.costLb=textSprite(`🪙${def.costs[lv]}`,{size:44}); g.userData.costLb.position.y=0.9; g.add(g.userData.costLb);
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
    const p=hero.rig.obj.position;
    p.x=Math.max(-10.9,Math.min(10.9,p.x));
    p.z=Math.max(-20.9,Math.min(26.9,p.z));
    for(const [cx,cz] of [[6.4,-16.4],[6.4,22.4],[-6.4,-16.4],[-6.4,22.4]]){
      if((p.x-cx)*Math.sign(cx)>0 && (p.z-cz)*Math.sign(cz)>0){
        const dx=p.x-cx,dz=p.z-cz,l=Math.hypot(dx,dz);
        if(l>4.5){ p.x=cx+dx/l*4.5; p.z=cz+dz/l*4.5; }
      }
    }
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
  } else if(hero.carry && hero.carry.kind==='stew' && hero.dropCd<=0){
    let best=null, bd=2.2;
    for(const t of TABLES){ if(t.stew<seatCap(t)){ const d=dist(hp,t.pos); if(d<bd){ bd=d; best=t; } } }
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
    else { go(t.pos); if(step(w,dt)){ if(t.stew<seatCap(t)){ t.stew++; setWorkerCarry(w,null); pop(t.pos,0x9fdf7a); sfx.serve(); } w.state='idle'; } }
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
  const c={rig, state:'toQueue', t:0, table:null, pay:0};
  customers.push(c); queue.push(c);
}
function updateCustomers(dt){
  custT+=dt;
  // 수요는 항상 넘침: 줄이 차지 않았으면 계속 도착
  if(custT>=CFG.custSpawn && queue.length<CFG.queueMax && customers.length<24){
    custT=0; spawnCustomer();
  }
  // 빈 좌석이 있으면 줄 맨 앞 손님 착석
  for(const t of TABLES){
    for(let i=0;i<t.custs.length;i++){
      if(!t.custs[i] && queue.length>0){
        const c=queue.shift(); t.custs[i]=c; c.table=t; c.seatIdx=i; c.state='toSeat';
      }
    }
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
      if(!c.bubble){ c.bubble=textSprite('🍲',{size:40,bg:'rgba(255,255,255,.85)'}); c.bubble.position.copy(seatPos(c.table,c.seatIdx)).add(new THREE.Vector3(0,2.3,0)); scene.add(c.bubble); }
      c.bubble.position.y=2.3+Math.sin(clockT*3)*0.1;
    } else if(c.bubble){ scene.remove(c.bubble); c.bubble=null; }
    if(c.state==='toSeat'){
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
      }
    }
    else if(c.state==='leave'){
      c.cheerT=(c.cheerT||0)+dt;
      if(c.cheerT<0.9) continue;
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
  if(hero.dropCd>0)hero.dropCd-=dt;
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
  hero={rig:makeRig('Rogue_Hooded',0,-1.5,0), carry:null, carryObjs:[], dropCd:0};
  // 저장 복원 (레벨제)
  if(S.lv.table>0){ TABLES.forEach(t=>{ t.tier=Math.min(S.lv.table,TABLE_TIERS.length-1); buildTable(t); }); }
  for(let i=0;i<(S.lv.hunter||0);i++) hireWorker('hunter');
  for(let i=0;i<(S.lv.server||0);i++) hireWorker('server');
  if(S.lv.hunt) HUNT.iv=HUNT_IV[S.lv.hunt];
  if(S.lv.fire){ FIRE.ct=FIRE_CT[S.lv.fire]; campfire.scale.setScalar(1+0.18*S.lv.fire); }
  if(S.lv.bag) CFG.carryMax=5;
  PAD_DEFS.forEach(makePad);
  offlineSettle();
  setTimeout(()=>toast('WASD/방향키 또는 드래그로 이동 · 발판을 밟아 확장!'),1200);
  const l=document.getElementById('loading'); l.style.opacity=0; setTimeout(()=>l.remove(),500);
  window.__g={S,CFG,PAD_DEFS,get hero(){return hero},workers,HUNT,FIRE,TABLES,get customers(){return customers},get queue(){return queue},pads,get pads(){return pads}};
  requestAnimationFrame(loop);
}).catch(e=>{
  document.querySelector('#loading p').textContent='에셋 로딩 실패: '+e.message;
});
