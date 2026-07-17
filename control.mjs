import initJolt from 'jolt-physics/wasm-compat';
import { makeTower, makeMortar, components, Castle, LAYER_STATIC, LAYER_MOVING, NUM_LAYERS } from './castle.mjs';
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
  const fs=new Jolt.BoxShape(V(80,0.5,80),0.05,null);
  const cfg=new Jolt.BodyCreationSettings(fs,RV(0,-0.5,0),QI(),Jolt.EMotionType_Static,LAYER_STATIC);
  cfg.mFriction=0.9; const f=bi.CreateBody(cfg); bi.AddBody(f.GetID(),Jolt.EActivation_DontActivate); Jolt.destroy(cfg);
  return j;
}
const DT=1/60;
console.log('CONTROL: build the tower, fire NOTHING, watch it for 10 seconds.\n');
for (const spec of [
  {label:'squat  (6.0m x  8.0m)', outerR:3.0, wall:0.9, courses:20, courseH:0.40, brickL:0.60, rings:2},
  {label:'slender(4.4m x 12.0m)', outerR:2.2, wall:0.8, courses:30, courseH:0.40, brickL:0.55, rings:2},
]) {
  const j=world(); const bs=makeTower(spec); const ls=makeMortar(bs);
  const c=new Castle(Jolt,j,bs,ls); const n=c.rebuild();
  const h0=c.bannerHeight();
  let slept=-1;
  for(let f=0;f<600;f++){ j.Step(DT,1); if(slept<0&&c.awake()===0) slept=f*DT; }
  const h1=c.bannerHeight();
  console.log(`${spec.label}  bodies=${n}  banner ${h0.toFixed(2)}m -> ${h1.toFixed(2)}m  ` +
    `drop ${((h0-h1)*1000).toFixed(0)}mm  ${slept>=0?`asleep @${slept.toFixed(1)}s`:'NEVER SLEPT'}  ` +
    `${h1 < h0-0.5 ? '<<< FELL OVER BY ITSELF' : 'stands'}`);
  Jolt.destroy(j);
}
