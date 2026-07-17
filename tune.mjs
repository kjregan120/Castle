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
const SPEC={outerR:2.2,wall:0.8,courses:30,courseH:0.40,brickL:0.55,rings:2};
const SHELL={calibre:0.30,mass:150,speed:95,crater:1.30,blastR:2.5,power:2.2,impulse:800};
const MUZZLE=[-26,1.0,0];
const DT=1/60;
function ballistic(f,t,sp){const dx=t[0]-f[0],dy=t[1]-f[1],dz=t[2]-f[2],d=Math.hypot(dx,dz),g=9.81;
  const disc=sp**4-g*(g*d*d+2*dy*sp*sp); if(disc<0){const L=Math.hypot(dx,dy,dz);return[dx/L,dy/L,dz/L];}
  const a=Math.atan2(sp*sp-Math.sqrt(disc),g*d); return [dx/d*Math.cos(a),Math.sin(a),dz/d*Math.cos(a)];}

console.log('Tower is 4.4m wide. How big should a shell be?\n');
console.log('crater  blastR   shells   fragments   verdict');
console.log('-'.repeat(56));
for (const S of [
  {crater:1.30, blastR:2.50},
  {crater:0.90, blastR:1.80},
  {crater:0.70, blastR:1.40},
  {crater:0.55, blastR:1.10},
  {crater:0.45, blastR:0.90},
]) {
  const SH = { ...SHELL, crater:S.crater, blastR:S.blastR };
  const crush = 2.2;
  const j=world(), bricks=makeTower(SPEC), links=makeMortar(bricks);
  const c=new Castle(Jolt,j,bricks,links);
  c.installImpactFracture(6.0,1.6,2.4);
  c.crushFactor=crush;
  c.rebuild();
  for(let f=0;f<60;f++) j.Step(DT,1);
  let shells=0, won=false;
  const angs=[0,-0.4,0.4,-0.8,0.8,-1.2,1.2,-1.6,1.6,-2.0,2.0,0.2];
  for (const a of angs) {
    if (won) break;
    shells++;
    const aim=[Math.cos(a)*SPEC.outerR*0.95, 0.9, Math.sin(a)*SPEC.outerR*0.95];
    c.fire(MUZZLE, ballistic(MUZZLE,aim,SH.speed), SH);
    for(let f=0;f<700;f++){ j.Step(DT,1); c.applyImpacts(); c.applyHits(); if(f>40 && c.awake()===0) break; }
    won = c.bannerDown();
  }
  const v = !won ? 'never falls'
    : shells<=2 ? 'too easy'
    : shells<=6 ? '<-- good siege'
    : 'a grind';
  console.log(`${S.crater.toFixed(2).padStart(6)}  ${S.blastR.toFixed(2).padStart(6)}  ${String(won?shells:'--').padStart(7)}   ${String(c.bodies.length).padStart(9)}   ${v}`);
  Jolt.destroy(j);
}
