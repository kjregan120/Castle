import initJolt from 'jolt-physics/wasm-compat';
import { makeTower, makeMortar, Castle, LAYER_STATIC, LAYER_MOVING, NUM_LAYERS } from './castle.mjs';
const Jolt = await initJolt();
const V=(x,y,z)=>new Jolt.Vec3(x,y,z), RV=(x,y,z)=>new Jolt.RVec3(x,y,z), QI=()=>Jolt.Quat.prototype.sIdentity();
function world(){
  const of=new Jolt.ObjectLayerPairFilterTable(NUM_LAYERS); of.EnableCollision(0,1); of.EnableCollision(1,1);
  const bp=new Jolt.BroadPhaseLayerInterfaceTable(NUM_LAYERS,2);
  bp.MapObjectToBroadPhaseLayer(0,new Jolt.BroadPhaseLayer(0)); bp.MapObjectToBroadPhaseLayer(1,new Jolt.BroadPhaseLayer(1));
  const s=new Jolt.JoltSettings(); s.mObjectLayerPairFilter=of; s.mBroadPhaseLayerInterface=bp;
  s.mObjectVsBroadPhaseLayerFilter=new Jolt.ObjectVsBroadPhaseLayerFilterTable(s.mBroadPhaseLayerInterface,2,s.mObjectLayerPairFilter,NUM_LAYERS);
  const j=new Jolt.JoltInterface(s); Jolt.destroy(s);
  const bi=j.GetPhysicsSystem().GetBodyInterface();
  const fs=new Jolt.BoxShape(V(90,0.5,90),0.05,null);
  const cfg=new Jolt.BodyCreationSettings(fs,RV(0,-0.5,0),QI(),Jolt.EMotionType_Static,LAYER_STATIC);
  cfg.mFriction=0.9; const f=bi.CreateBody(cfg); bi.AddBody(f.GetID(),Jolt.EActivation_DontActivate); Jolt.destroy(cfg);
  return j;
}
const SHELL={name:'shell',calibre:0.30,mass:150,speed:95,crater:1.30,blastR:2.5,power:2.2,impulse:800};
const SPEC={outerR:2.2,wall:0.8,courses:30,courseH:0.40,brickL:0.55,rings:2};
const MUZZLE=[-26,1.0,0];
function ballistic(from,to,speed){
  const dx=to[0]-from[0], dy=to[1]-from[1], dz=to[2]-from[2];
  const d=Math.hypot(dx,dz), g=9.81;
  const disc=speed**4-g*(g*d*d+2*dy*speed*speed);
  if(disc<0){const L=Math.hypot(dx,dy,dz); return [dx/L,dy/L,dz/L];}
  const ang=Math.atan2(speed*speed-Math.sqrt(disc), g*d);
  return [dx/d*Math.cos(ang), Math.sin(ang), dz/d*Math.cos(ang)];
}
const j=world(), bricks=makeTower(SPEC), links=makeMortar(bricks);
const c=new Castle(Jolt,j,bricks,links);
c.installImpactFracture(6.0,1.6,2.4);
c.rebuild();
const DT=1/60;
for(let f=0;f<60;f++) j.Step(DT,1);
console.log('CANNON TEST — real projectile bodies, ballistic arc, aimed at the base\n');
console.log('shot  flight   hit at              stone  bodies   banner');
console.log('-'.repeat(66));
/* Walk the aim around the base. Hitting the same hole twice does nothing --
   the later rounds fly into the cave the earlier ones dug. (This used to pass
   with a fixed aim only because the bricks were laid as radial spokes with
   gaps between them; laid as a proper running bond, the tower is a real tower
   and one shell will not do it.) */
const AIM=k=>[-2.2*Math.cos(k*0.45), 0.9, 2.2*Math.sin(k*0.45)];
let won=false;
for(let shot=1; shot<=6 && !won; shot++){
  const dir=ballistic(MUZZLE,AIM(shot-1),SHELL.speed);
  c.fire(MUZZLE,dir,SHELL);
  let flight=0, hitAt=null;
  for(let f=0;f<600;f++){
    j.Step(DT,1);
    c.applyImpacts();
    const hits=c.applyHits();
    c.commitDamage();
    if(hits.length && !hitAt){ hitAt=hits[0].at; flight=f*DT; }
    if(hitAt && c.awake()===0) break;
  }
  const bh=c.bannerHeight(); won=c.bannerDown();
  console.log(`${String(shot).padStart(3)}  ${flight.toFixed(2)}s  `+
    (hitAt?`(${hitAt[0].toFixed(1)},${hitAt[1].toFixed(1)},${hitAt[2].toFixed(1)})`:'MISS').padEnd(20)+
    `${String(c.destroyedBricks).padStart(5)} ${String(c.bodies.length).padStart(7)}  ${bh.toFixed(2)}m`+
    (won?'   <<< BANNER DOWN':''));
}
console.log('\n'+(won?'  cannon works: aimed round, ballistic arc, tower down.':'  tower survived 6 rounds.'));
