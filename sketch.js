import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

const host = document.querySelector('#scene');
const statusEl = document.querySelector('#status');
const startBtn = document.querySelector('#start');
const video = document.querySelector('#webcam');
const scoreEl = document.querySelector('#score');
const poppedEl = document.querySelector('#popped');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#09051d');
scene.fog = new THREE.FogExp2('#09051d', 0.022);
const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 100);
camera.position.set(0, 0, 17);
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
host.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x9eafff, 1.5));
const keyLight = new THREE.PointLight(0xffffff, 150);
keyLight.position.set(-5, 7, 12); scene.add(keyLight);
const pinkLight = new THREE.PointLight(0x7c3cff, 90);
pinkLight.position.set(7, -4, 4); scene.add(pinkLight);

const starGeo = new THREE.BufferGeometry();
const starCount = 850;
const starPositions = new Float32Array(starCount*3);
for(let i=0;i<starCount;i++){
  starPositions[i*3]=(Math.random()-.5)*42;
  starPositions[i*3+1]=(Math.random()-.5)*26;
  starPositions[i*3+2]=(Math.random()-.5)*18-4;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions,3));
const stars = new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xcbd5ff,size:.045,transparent:true,opacity:.8}));
scene.add(stars);

const palette = [0xff4f75,0x28d7ee,0xffc857,0x9a70ff,0x62f59c,0xff83d5,0xff884a,0x75a7ff];
const balloons = [];
const pops = [];
let score=0, popped=0, handLandmarker=null, lastVideoTime=-1, cameraReady=false;
let hands=[], previousHands=[], lastGestureAt=0;
const raycaster = new THREE.Raycaster();

function makeBalloon(x,y,z,color){
  const group = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial({color, roughness:.22, metalness:.02, clearcoat:.9, clearcoatRoughness:.12});
  const geometry = new THREE.SphereGeometry(0.58,32,24);
  geometry.scale(.82,1.08,.82);
  const ball = new THREE.Mesh(geometry,material);
  group.add(ball);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(.105,.2,12),material);
  knot.rotation.x=Math.PI; knot.position.y=-.66; group.add(knot);
  const points=[new THREE.Vector3(0,-.72,0),new THREE.Vector3(.05,-1.05,0),new THREE.Vector3(-.08,-1.35,0),new THREE.Vector3(.02,-1.65,0)];
  const string = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.012,5,false),new THREE.MeshBasicMaterial({color:0xd7e5ff,transparent:true,opacity:.7}));
  group.add(string);
  group.position.set(x,y,z);
  scene.add(group);
  const b={group,ball,material,baseX:x,baseY:y,phase:Math.random()*10,vx:(Math.random()-.5)*.018,vy:(Math.random()-.5)*.012,alive:true,radius:.75};
  balloons.push(b); return b;
}
function refill(){
  for(let i=0;i<22;i++){
    const x=(Math.random()-.5)*18;
    const y=(Math.random()-.5)*10;
    const z=(Math.random()-.5)*5;
    makeBalloon(x,y,z,palette[Math.floor(Math.random()*palette.length)]);
  }
}
refill();

function burst(position,color){
  for(let i=0;i<26;i++){
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(.035+Math.random()*.035,6,6),new THREE.MeshBasicMaterial({color,transparent:true}));
    mesh.position.copy(position); scene.add(mesh);
    pops.push({mesh,v:new THREE.Vector3((Math.random()-.5)*.24,Math.random()*.22,(Math.random()-.5)*.16),life:1});
  }
}
function popBalloon(b){
  if(!b.alive)return;
  b.alive=false; burst(b.group.position,b.material.color);
  scene.remove(b.group); b.group.traverse(o=>{if(o.geometry)o.geometry.dispose(); if(o.material && o.material.dispose)o.material.dispose();});
  score+=10; popped++; scoreEl.textContent=String(score).padStart(3,'0'); poppedEl.textContent=`已捏爆 ${popped} 个`;
  if(balloons.filter(x=>x.alive).length<12){
    for(let i=0;i<8;i++) makeBalloon((Math.random()-.5)*18,(Math.random()-.5)*10,(Math.random()-.5)*4,palette[Math.floor(Math.random()*palette.length)]);
  }
}
function screenToWorld(nx,ny){
  const v=new THREE.Vector3((1-nx)*2-1, -(ny*2-1), .5);
  v.unproject(camera);
  const dir=v.sub(camera.position).normalize();
  const distance=(0-camera.position.z)/dir.z;
  return camera.position.clone().add(dir.multiplyScalar(distance));
}
function processHands(){
  if(!handLandmarker || video.readyState<2)return;
  if(video.currentTime===lastVideoTime)return;
  lastVideoTime=video.currentTime;
  const result=handLandmarker.detectForVideo(video,performance.now());
  const now=performance.now();
  const detected=(result.landmarks||[]).map((lm,i)=>{
    const index=lm[8], thumb=lm[4], wrist=lm[0], middle=lm[9];
    const pinch=Math.hypot(index.x-thumb.x,index.y-thumb.y)<.055;
    const p=screenToWorld(index.x,index.y);
    const palm=screenToWorld(middle.x,middle.y);
    const old=previousHands[i];
    const speed=old ? Math.hypot(p.x-old.x,p.y-old.y) : 0;
    return {x:p.x,y:p.y,pinch,speed,world:p, palm, handedness:result.handednesses?.[i]?.[0]?.categoryName||'Hand'};
  });
  // Pinching pops the closest balloon to the index/thumb midpoint; cooldown prevents repeated pops.
  for(const h of detected){
    if(h.pinch && now-lastGestureAt>320){
      const target=balloons.filter(b=>b.alive).sort((a,b)=>a.group.position.distanceTo(h.world)-b.group.position.distanceTo(h.world))[0];
      if(target && target.group.position.distanceTo(h.world)<1.65){popBalloon(target);lastGestureAt=now;}
    }
    // Fast hand movement applies a radial impulse to nearby balloons.
    if(h.speed>.38){
      for(const b of balloons.filter(b=>b.alive)){
        const dx=b.group.position.x-h.x, dy=b.group.position.y-h.y;
        const d=Math.hypot(dx,dy);
        if(d<4.0){b.vx+=dx/(d+.25)*.24;b.vy+=dy/(d+.25)*.24;}
      }
    }
  }
  hands=detected; previousHands=detected.map(h=>({x:h.x,y:h.y}));
  if(detected.length) statusEl.textContent=`识别到 ${detected.length} 只手　·　捏合手指捏爆气球，快速挥手把气球打飞`;
}
let startTime=performance.now();
function animate(t){
  requestAnimationFrame(animate);
  const time=(t-startTime)*.001;
  stars.rotation.y=time*.006;
  for(const b of balloons){
    if(!b.alive)continue;
    b.phase+=.01;
    b.group.position.x+=b.vx;
    b.group.position.y+=b.vy;
    b.group.position.x+=(b.baseX-b.group.position.x)*.002 + Math.sin(time*1.1+b.phase)*.0018;
    b.group.position.y+=(b.baseY-b.group.position.y)*.0015 + Math.sin(time*1.4+b.phase)*.002;
    b.vx*=.985; b.vy*=.985;
    if(Math.abs(b.group.position.x)>10)b.vx-=Math.sign(b.group.position.x)*.015;
    if(Math.abs(b.group.position.y)>6)b.vy-=Math.sign(b.group.position.y)*.015;
    b.group.rotation.z=Math.sin(time+b.phase)*.06;
  }
  for(let i=pops.length-1;i>=0;i--){
    const p=pops[i]; p.mesh.position.add(p.v); p.v.y-=.003; p.life-=.025;
    p.mesh.material.opacity=Math.max(0,p.life);
    if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();pops.splice(i,1);}
  }
  if(cameraReady) processHands();
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);

startBtn.addEventListener('click', async()=>{
  startBtn.disabled=true; startBtn.textContent='正在启动…';
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
    video.srcObject=stream; await video.play();
    statusEl.textContent='正在加载手势识别模型…';
    const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    handLandmarker=await HandLandmarker.createFromOptions(vision,{
      baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},
      runningMode:'VIDEO',numHands:2,
      minHandDetectionConfidence:.55,minHandPresenceConfidence:.5,minTrackingConfidence:.5
    });
    cameraReady=true; startBtn.remove();
    statusEl.textContent='摄像头已开启！捏合拇指和食指，或快速挥动手掌试试看。';
  }catch(err){
    console.error(err);
    startBtn.disabled=false; startBtn.textContent='重试开启摄像头';
    statusEl.textContent='启动失败：请用 localhost 打开页面、允许摄像头权限，并确认网络可加载模型。';
  }
});
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
