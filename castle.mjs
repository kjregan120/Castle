/* ------------------------------------------------------------------
   CASTLE — core
   generator (courses of bricks)  ->  mortar graph  ->  union-find
   -> one rigid body per connected component.

   The mortar graph describes POTENTIAL fracture. It is not the
   simulation. An intact tower is ONE rigid body, not 1000.
------------------------------------------------------------------- */

export const LAYER_STATIC = 0, LAYER_MOVING = 1, NUM_LAYERS = 2;

/* ---------- 1. GENERATOR ------------------------------------------------
   Lay courses into the volume. Each course is rotated half a brick from the
   one below (running bond) so a crack cannot run straight down — interlock
   is emergent, we just lay the bricks like a mason would.
--------------------------------------------------------------------- */
export function makeTower(P = {}) {
  const {
    outerR = 3.0,        // outer radius, m
    wall = 0.9,          // wall thickness, m
    courses = 20,        // number of courses
    courseH = 0.40,      // brick height, m
    brickL = 0.60,       // brick length along the course, m
    rings = 2,           // rings of brick through the wall thickness
    baseY = 0,
    stagger = true
  } = P;

  const bricks = [];
  const ringDepth = wall / rings;

  for (let c = 0; c < courses; c++) {
    const y = baseY + courseH * (c + 0.5);

    for (let ring = 0; ring < rings; ring++) {
      // mid-radius of this ring
      const rMid = outerR - ringDepth * (ring + 0.5);
      const circ = 2 * Math.PI * rMid;
      const n = Math.max(6, Math.round(circ / brickL));
      const dTheta = (2 * Math.PI) / n;

      // running bond: half-brick offset on alternate courses, and rings are
      // offset from each other too so radial joints don't line up either
      const phase = (stagger ? (c % 2) * 0.5 : 0) + (ring % 2) * 0.25;

      for (let i = 0; i < n; i++) {
        const th = (i + phase) * dTheta;
        bricks.push({
          // world position
          p: [Math.cos(th) * rMid, y, Math.sin(th) * rMid],
          // box half-extents in brick-local space:
          //   x = tangential (length), y = up (height), z = radial (depth)
          h: [(rMid * dTheta) * 0.5 * 0.96, courseH * 0.5 * 0.96, ringDepth * 0.5 * 0.96],
          yaw: -th - Math.PI / 2,   // local +x runs along the course, +z radially outward
          course: c, ring, isBanner: false
        });
      }
    }
  }

  // the objective: a banner on the highest course, at the centre of the wall
  const topY = baseY + courseH * courses;
  const rMid = outerR - wall * 0.5;
  bricks.push({
    p: [rMid, topY + 1.2, 0],
    h: [0.06, 1.2, 0.06],
    yaw: 0, course: courses, ring: 0, isBanner: true, pole: true
  });
  bricks.push({
    p: [rMid, topY + 1.9, 0.45],
    h: [0.03, 0.45, 0.45],
    yaw: 0, course: courses, ring: 0, isBanner: true
  });

  return bricks;
}

/* ---------- 2. MORTAR GRAPH --------------------------------------------
   A link wherever two bricks touch. This is the fracture graph; it is also
   exactly the array that decides the win condition later.
--------------------------------------------------------------------- */
export function makeMortar(bricks, tol = 0.09) {
  const links = [];
  const n = bricks.length;

  // spatial hash on brick centres.
  // The cell MUST be at least the largest brick's diameter, or a ±1-cell scan
  // silently misses real contacts. The 2.4m flagpole is the tallest thing in
  // the tower, and with a fixed 1.2m cell its neighbours are 2 cells away --
  // the banner never bonded to the tower and just fell off it.
  const radiusOf = b => Math.hypot(b.h[0], b.h[1], b.h[2]);
  const cell = Math.max(...bricks.map(radiusOf)) * 2 + tol;
  const key = (a, b, c) => `${a},${b},${c}`;
  const hash = new Map();
  for (let i = 0; i < n; i++) {
    const k = key(
      Math.floor(bricks[i].p[0] / cell),
      Math.floor(bricks[i].p[1] / cell),
      Math.floor(bricks[i].p[2] / cell));
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push(i);
  }

  const radius = i => radiusOf(bricks[i]);

  for (let i = 0; i < n; i++) {
    const b = bricks[i];
    const cx = Math.floor(b.p[0] / cell), cy = Math.floor(b.p[1] / cell), cz = Math.floor(b.p[2] / cell);
    for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let cc = -1; cc <= 1; cc++) {
      const bucket = hash.get(key(cx + a, cy + bb, cz + cc));
      if (!bucket) continue;
      for (const j of bucket) {
        if (j <= i) continue;
        const o = bricks[j];
        // a powder keg is a loose barrel standing on a floor, not masonry.
        // Never mortar it in: it must be its own component so it can be
        // knocked over, buried, and crushed by the rubble it is under.
        if (b.isKeg || o.isKeg) continue;
        const d = Math.hypot(o.p[0] - b.p[0], o.p[1] - b.p[1], o.p[2] - b.p[2]);
        if (d > radius(i) + radius(j) + tol) continue;

        // contact area proxy: bricks that share a bed joint (course above/below)
        // are stronger than bricks that only share a vertical head joint
        const bed = Math.abs(b.course - o.course) === 1;
        links.push({
          a: i, b: j,
          p: [(b.p[0] + o.p[0]) / 2, (b.p[1] + o.p[1]) / 2, (b.p[2] + o.p[2]) / 2],
          strength: bed ? 1.0 : 0.55,
          alive: 1
        });
      }
    }
  }
  return links;
}

/* ---------- 3. UNION-FIND ---------------------------------------------- */
export function components(nBricks, links, alive = null) {
  const parent = new Int32Array(nBricks);
  for (let i = 0; i < nBricks; i++) parent[i] = i;
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (x, y) => { const a = find(x), b = find(y); if (a !== b) parent[a] = b; };

  for (const L of links) if (L.alive) union(L.a, L.b);

  const groups = new Map();
  for (let i = 0; i < nBricks; i++) {
    if (alive && !alive[i]) continue;          // destroyed stone is not a component
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  return [...groups.values()];
}

/* ---------- 4. PHYSICS -------------------------------------------------- */
export class Castle {
  constructor(Jolt, jolt, bricks, links) {
    this.Jolt = Jolt;
    this.jolt = jolt;
    this.physics = jolt.GetPhysicsSystem();
    this.bi = this.physics.GetBodyInterface();
    this.bricks = bricks;
    this.links = links;

    this.bodies = [];               // active Jolt bodies
    this.brickBody = new Int32Array(bricks.length).fill(-1);  // brick -> body index
    this.brickLocal = new Array(bricks.length);               // brick -> local offset in its body
    this.shapeCache = new Map();

    this.alive = new Uint8Array(bricks.length).fill(1);
    this.brokenLinks = 0;
    this.destroyedBricks = 0;
    this.rebuilds = 0;

    // powder
    this.kegQueue = [];             // lit, not yet gone off
    this.fused = new Set();         // lit once, ever
    this.booms = [];                // detonations this frame, for the renderer
    this.kegsBlown = 0;

    // applyImpacts()/applyHits() only queue damage; commitDamage() (see its
    // comment) applies it all in ONE settle+rebuild+blast pass, however many
    // times those two were called and however many Steps that spans.
    this._pendingSettle = false;
    this._pendingBlasts = [];
  }

  kegsLeft() {
    let n = 0;
    for (let i = 0; i < this.bricks.length; i++)
      if (this.bricks[i].isKeg && this.alive[i]) n++;
    return n;
  }

  /* ---------- POWDER: light the queue, and let it light itself --------
     A keg's blast is just another damage() call, so it craters stone, cracks
     mortar, and -- because damage() fuses any keg it reaches -- can light the
     next keg along. That is the chain, and it costs no special code: the
     magazine going up is the same event as a shell landing, only bigger.
     Returns the detonations, so the caller can draw the fireballs.        */
  resolveKegs() {
    if (!this.kegQueue.length) return [];
    const out = [];
    let guard = 0;
    while (this.kegQueue.length && guard++ < 200) {
      const i = this.kegQueue.shift();
      if (!this.alive[i]) continue;
      const K = this.bricks[i].keg;
      const W = this.world;
      const x = W[i*7], y = W[i*7+1], z = W[i*7+2];   // where the keg IS, not where it was
      this.alive[i] = 0;
      this.kegsBlown++;
      this.damage(x, y, z, K.blastR, K.power, K.crater);   // may fuse more kegs
      out.push({ at: [x, y, z], r: K.blastR, impulse: K.impulse });
    }
    return out;
  }

  _boxShape(h) {
    const k = h.map(v => v.toFixed(4)).join('_');
    if (!this.shapeCache.has(k)) {
      const J = this.Jolt;
      this.shapeCache.set(k, new J.BoxShape(new J.Vec3(h[0], h[1], h[2]), 0.02, null));
    }
    return this.shapeCache.get(k);
  }

  /* build one rigid body per connected component. THIS is the performance
     strategy: an intact tower is a single compound body with 1000 box
     children, not 1000 bodies with 1000 broadphase entries. */
  /* Bricks live in WORLD space, in this.world (x,y,z, qx,qy,qz,qw per brick).
     Rebuild reads the CURRENT pose of every brick, then re-groups them.

     It must NOT rebuild from bricks[i].p -- those are the generator's original
     positions and never change. Rebuilding from them teleports every fragment
     back into the intact tower and drops it again, so a collapse that breaks
     mortar 14 times visibly collapses 14 times. (Headless never saw this: the
     final banner height came out the same either way.)                       */
  _initWorld() {
    const n = this.bricks.length;
    this.world = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) {
      const b = this.bricks[i];
      const h = b.yaw * 0.5;
      this.world[i*7+0] = b.p[0]; this.world[i*7+1] = b.p[1]; this.world[i*7+2] = b.p[2];
      this.world[i*7+3] = 0; this.world[i*7+4] = Math.sin(h);
      this.world[i*7+5] = 0; this.world[i*7+6] = Math.cos(h);
    }
  }

  /* Freeze the live physics poses back into this.world.
     This is O(bricks) through WASM getters and it is NOT cheap -- and nothing
     moves between a Step and the next Step. settleStructure() was calling it
     ~48 times a frame (24 iterations x loadPass + tensionPass), each walking
     4400 bricks. So: capture once, mark it fresh, and only invalidate where
     the poses can actually have changed -- i.e. after Jolt has stepped. */
  _captureWorld() {
    if (!this.bodies.length) return;
    if (this._worldFresh) return;
    this.brickTransforms(this.world);
    this._worldFresh = true;
  }
  _poseDirty() { this._worldFresh = false; }

  /* Rebuild only what CHANGED.
     Mortar only ever breaks and stone only ever dies, so a component can only
     ever shrink or split -- it can never gain a brick. Therefore if a new
     group has the same brick COUNT as the body its first brick used to belong
     to, it is that same body, untouched, and we can leave it alone: no
     destroy, no compound rebuild, no lost sleep state, no lost contacts.
     Rebuilding all 4400 bricks because one shell chipped a corner cost a
     323 ms freeze. Now a shot rebuilds the two components it actually broke. */
  rebuild(inherit = null) {
    const J = this.Jolt;
    this.rebuilds++;
    this._poseDirty();

    if (!this.world) this._initWorld();
    else this._captureWorld();          // <-- carry the current pose forward

    const prevBodies = this.bodies;
    const prevCount = this.bodyCount || [];
    const prevBrickBody = this.brickBody.slice();

    const groups = components(this.bricks.length, this.links, this.alive);
    const W = this.world;

    // which of the old bodies survive verbatim?
    const claimed = new Uint8Array(prevBodies.length);
    const reuseOf = groups.map(g => {
      const pb = prevBrickBody[g[0]];
      if (pb < 0 || pb >= prevBodies.length) return -1;
      if (prevCount[pb] !== g.length || claimed[pb]) return -1;
      claimed[pb] = 1;
      return pb;
    });

    // velocities of the doomed ones, so their fragments inherit the motion
    const oldMotion = [];
    for (let i = 0; i < prevBodies.length; i++) {
      const b = prevBodies[i];
      const lv = b.GetLinearVelocity();
      const vx = lv.GetX(), vy = lv.GetY(), vz = lv.GetZ();      // copy: shared temp
      const av = b.GetAngularVelocity();
      const wx = av.GetX(), wy = av.GetY(), wz = av.GetZ();
      const cm = b.GetCenterOfMassPosition();
      oldMotion.push({ v:[vx,vy,vz], w:[wx,wy,wz], c:[cm.GetX(), cm.GetY(), cm.GetZ()] });
    }

    this.bodies = [];
    this.bodyCount = [];
    this.rebuiltBodies = 0;

    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];

      // untouched component: keep the body exactly as it is
      if (reuseOf[gi] >= 0) {
        const body = prevBodies[reuseOf[gi]];
        for (const i of g) this.brickBody[i] = this.bodies.length;   // brickLocal still valid
        this.bodyCount.push(g.length);
        this.bodies.push(body);
        continue;
      }
      this.rebuiltBodies++;
      let cx = 0, cy = 0, cz = 0;
      for (const i of g) { cx += W[i*7]; cy += W[i*7+1]; cz += W[i*7+2]; }
      cx /= g.length; cy /= g.length; cz /= g.length;

      const cs = new J.StaticCompoundShapeSettings();
      for (const i of g) {
        const lp = [W[i*7] - cx, W[i*7+1] - cy, W[i*7+2] - cz];
        const lq = [W[i*7+3], W[i*7+4], W[i*7+5], W[i*7+6]];
        this.brickLocal[i] = { p: lp, q: lq };
        cs.AddShapeShape(
          new J.Vec3(lp[0], lp[1], lp[2]),
          new J.Quat(lq[0], lq[1], lq[2], lq[3]),
          this._boxShape(this.bricks[i].h), 0);
        this.brickBody[i] = this.bodies.length;
      }

      const shape = cs.Create().Get();
      cs.Release();

      const cfg = new J.BodyCreationSettings(
        shape, new J.RVec3(cx, cy, cz), J.Quat.prototype.sIdentity(),
        J.EMotionType_Dynamic, LAYER_MOVING);
      cfg.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia;
      let mass = 0;
      for (const i of g) mass += this.bricks[i].isKeg ? 90 : 400;   // stone vs barrel
      cfg.mMassPropertiesOverride.mMass = mass;
      cfg.mFriction = 0.75;
      cfg.mRestitution = 0.02;
      cfg.mLinearDamping = 0.10;
      cfg.mAngularDamping = 0.25;

      const body = this.bi.CreateBody(cfg);
      J.destroy(cfg);

      if (inherit && oldMotion.length) {
        const pb = prevBrickBody[g[0]];
        if (pb >= 0 && pb < oldMotion.length && oldMotion[pb]) {
          const m = oldMotion[pb];
          const rx = cx - m.c[0], ry = cy - m.c[1], rz = cz - m.c[2];
          body.SetLinearVelocity(new J.Vec3(
            m.v[0] + (m.w[1]*rz - m.w[2]*ry),
            m.v[1] + (m.w[2]*rx - m.w[0]*rz),
            m.v[2] + (m.w[0]*ry - m.w[1]*rx)));
          body.SetAngularVelocity(new J.Vec3(m.w[0], m.w[1], m.w[2]));
        }
      }

      this.bi.AddBody(body.GetID(), J.EActivation_Activate);
      this.bodyCount.push(g.length);
      this.bodies.push(body);
    }

    // now the old bodies nobody claimed can go
    for (let i = 0; i < prevBodies.length; i++) {
      if (claimed[i]) continue;
      this.bi.RemoveBody(prevBodies[i].GetID());
      this.bi.DestroyBody(prevBodies[i].GetID());
    }

    if (this.h0 == null) this.h0 = this.bannerHeight();
    if (this.nominalLoad == null) this.loadPass();   // what does an INTACT tower carry?
    return groups.length;
  }

  /* --- damage: break mortar in a radius. This is the ONLY thing that
         creates fragments. Everything else is just rigid bodies. --- */
  /* Damage acts on where the stone IS, not where the generator first put it.
     bricks[i].p and links[].p are the ORIGINAL layout and never move; using
     them means that once anything shifts, shells crater empty air. */
  damage(px, py, pz, radius, power, craterR = radius * 0.5) {
    this._poseDirty();                     // called from outside: assume we just stepped
    if (!this.world) this._initWorld(); else this._captureWorld();
    const W = this.world;
    let broke = 0, gone = 0;

    // 0. powder. A keg inside the blast does not get quietly deleted -- it
    //    lights, and its own blast is what reaches the next one. Queued, not
    //    fired here: damage() is re-entrant and we must not recurse inside it.
    for (let i = 0; i < this.bricks.length; i++) {
      if (!this.alive[i] || !this.bricks[i].isKeg || this.fused.has(i)) continue;
      const d = Math.hypot(W[i*7] - px, W[i*7+1] - py, W[i*7+2] - pz);
      if (d < radius) { this.fused.add(i); this.kegQueue.push(i); }
    }

    // 1. the crater: stone inside it is GONE
    for (let i = 0; i < this.bricks.length; i++) {
      if (!this.alive[i] || this.bricks[i].isBanner || this.bricks[i].isKeg) continue;
      const d = Math.hypot(W[i*7] - px, W[i*7+1] - py, W[i*7+2] - pz);
      if (d < craterR) { this.alive[i] = 0; gone++; this.destroyedBricks++; }
    }

    // 2. beyond the crater, the shock cracks mortar
    const r2 = radius * radius;
    for (const L of this.links) {
      if (!L.alive) continue;
      if (!this.alive[L.a] || !this.alive[L.b]) { L.alive = 0; broke++; this.brokenLinks++; continue; }
      const mx = (W[L.a*7]   + W[L.b*7])   * 0.5;
      const my = (W[L.a*7+1] + W[L.b*7+1]) * 0.5;
      const mz = (W[L.a*7+2] + W[L.b*7+2]) * 0.5;
      const d2 = (mx-px)**2 + (my-py)**2 + (mz-pz)**2;
      if (d2 > r2) continue;
      const w = 1 - Math.sqrt(d2) / radius;
      if (power * w > L.strength) { L.alive = 0; broke++; this.brokenLinks++; }
    }
    return { broke, gone };
  }

  /* shove the fragments outward -- call AFTER rebuild so the new bodies exist */
  blast(px, py, pz, radius, impulse) {
    const J = this.Jolt;
    const t = this._tmp || (this._tmp = new Float32Array(this.bricks.length * 7));
    this.brickTransforms(t);
    const perBody = new Map();
    for (let i = 0; i < this.bricks.length; i++) {
      if (!this.alive[i]) continue;
      const bIdx = this.brickBody[i];
      const d = Math.hypot(t[i * 7] - px, t[i * 7 + 1] - py, t[i * 7 + 2] - pz);
      if (d > radius) continue;
      const w = (1 - d / radius) ** 1.5;
      if (!perBody.has(bIdx) || perBody.get(bIdx).w < w) {
        perBody.set(bIdx, { w, x: t[i * 7], y: t[i * 7 + 1], z: t[i * 7 + 2] });
      }
    }
    for (const [bIdx, e] of perBody) {
      const body = this.bodies[bIdx];
      if (!body) continue;
      let dx = e.x - px, dy = e.y - py, dz = e.z - pz;
      const L = Math.hypot(dx, dy, dz) || 1e-4;
      const f = e.w * impulse;
      this.bi.AddImpulse(body.GetID(),
        new J.Vec3(dx / L * f, (dy / L + 0.25) * f, dz / L * f));
    }
  }

  /* queue a blast for the shared pass in applyHits() -- bodies don't exist
     yet to shove until AFTER that pass's rebuild(), so it can't happen here */
  _queueBlast(x, y, z, r, impulse) { this._pendingBlasts.push({ x, y, z, r, impulse }); }

  /* ---------- IMPACT: masonry shatters when it lands --------------------
     Without this a toppling tower falls as one rigid banana. A contact
     listener watches for hard impacts and cracks mortar around them.
     Damage is QUEUED -- you cannot touch bodies from inside the callback.
  --------------------------------------------------------------------- */
  installImpactFracture(minSpeed = 6.0, radius = 1.6, power = 2.4) {
    const J = this.Jolt;
    this.impacts = [];
    const L = new J.ContactListenerJS();

    L.OnContactValidate = () => J.ValidateResult_AcceptAllContactsForThisBodyPair;
    L.OnContactRemoved = () => {};
    L.OnContactPersisted = () => {};
    this.dbgCalls = 0; this.dbgMax = 0; this.dbgLog = [];
    this.projectiles = new Map();     // body id -> ammo spec
    this.hits = [];                   // projectile impacts, drained by the caller

    L.OnContactAdded = (b1p, b2p, mp) => {
      this.dbgCalls++;
      const b1 = J.wrapPointer(b1p, J.Body);
      const b2 = J.wrapPointer(b2p, J.Body);
      const man = J.wrapPointer(mp, J.ContactManifold);

      // --- is this a cannon round landing? ---
      const id1 = b1.GetID().GetIndexAndSequenceNumber();
      const id2 = b2.GetID().GetIndexAndSequenceNumber();
      const shotId = this.projectiles.has(id1) ? id1 : (this.projectiles.has(id2) ? id2 : -1);
      if (shotId >= 0) {
        const ammo = this.projectiles.get(shotId);
        this.projectiles.delete(shotId);
        const shot = (shotId === id1) ? b1 : b2;
        // copy out of the shared temp before the next getter call clobbers it
        const sv = shot.GetLinearVelocity();
        const vx = sv.GetX(), vy = sv.GetY(), vz = sv.GetZ();
        const sp = Math.hypot(vx, vy, vz) || 1;
        const cpp = man.GetWorldSpaceContactPointOn1(0);
        this.hits.push({ id: shotId, ammo, x: cpp.GetX(), y: cpp.GetY(), z: cpp.GetZ(),
                         dir: [vx / sp, vy / sp, vz / sp] });
        return;                        // the round does its own damage
      }

      // NOTE: Jolt's Vec3 getters return a pointer into a SHARED temporary.
      // Reading b2's velocity clobbers b1's. Copy the components out first
      // or the static floor appears to be falling at the same speed as the
      // thing hitting it, and every impact reads as zero.
      const n = man.get_mWorldSpaceNormal();
      const nx = n.GetX(), ny = n.GetY(), nz = n.GetZ();
      const va = b1.GetLinearVelocity();
      const ax = va.GetX(), ay = va.GetY(), az = va.GetZ();
      const vb = b2.GetLinearVelocity();
      const bx = vb.GetX(), by = vb.GetY(), bz = vb.GetZ();

      const rel = (ax - bx) * nx + (ay - by) * ny + (az - bz) * nz;
      const speed = Math.abs(rel);
      if (speed > this.dbgMax) this.dbgMax = speed;
      if (speed < minSpeed) return;

      // GetWorldSpaceContactPointOn1 ALREADY includes mBaseOffset -- adding it
      // again doubles the coordinates and the impact lands in empty space.
      const cp = man.GetWorldSpaceContactPointOn1(0);
      const px = cp.GetX(), py = cp.GetY(), pz = cp.GetZ();

      const sev = Math.min(3, speed / minSpeed);
      this.impacts.push({ x: px, y: py, z: pz, r: radius * sev, power: power * sev });
    };

    this.physics.SetContactListener(L);
    this._listener = L;
  }

  registerProjectile(bodyID, ammo) {
    this.projectiles.set(bodyID.GetIndexAndSequenceNumber(), ammo);
  }

  /* fire a round. Returns the Jolt body so the caller can draw & remove it. */
  fire(from, dir, ammo) {
    const J = this.Jolt;
    const shape = new J.SphereShape(ammo.calibre);
    const cfg = new J.BodyCreationSettings(
      shape, new J.RVec3(from[0], from[1], from[2]),
      J.Quat.prototype.sIdentity(), J.EMotionType_Dynamic, LAYER_MOVING);
    cfg.mMotionQuality = J.EMotionQuality_LinearCast;    // don't tunnel through the wall
    cfg.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia;
    cfg.mMassPropertiesOverride.mMass = ammo.mass;
    cfg.mRestitution = 0.05;
    const body = this.bi.CreateBody(cfg);
    J.destroy(cfg);
    body.SetLinearVelocity(new J.Vec3(
      dir[0] * ammo.speed, dir[1] * ammo.speed, dir[2] * ammo.speed));
    this.bi.AddBody(body.GetID(), J.EActivation_Activate);
    this.registerProjectile(body.GetID(), ammo);
    return body;
  }

  /* resolve any rounds that landed this frame. Queues damage and blasts
     exactly like applyImpacts() below -- neither method settles or rebuilds
     itself. Call commitDamage() when you want whatever either of them
     queued to actually apply; see its comment for why that's a separate
     step. Returns the hits for the caller to draw (muzzle flash, debris,
     whatever) -- that part IS immediate, only the physics commit is deferred. */
  applyHits() {
    this._poseDirty();
    const out = (this.hits && this.hits.length) ? this.hits.slice() : [];
    if (this.hits) this.hits.length = 0;

    for (const h of out) {
      const A = h.ammo;
      // a penetrator carries on INTO the wall before it goes off -- this is
      // the round that reaches an interior magazine through a breach.
      const d = A.penetration || 0;
      const cx = h.x + (h.dir ? h.dir[0] * d : 0);
      const cy = h.y + (h.dir ? h.dir[1] * d : 0);
      const cz = h.z + (h.dir ? h.dir[2] * d : 0);
      const r = this.damage(cx, cy, cz, A.blastR, A.power, A.crater);
      if (r.broke || r.gone) this._pendingSettle = true;
      h.at = [cx, cy, cz];
    }

    const booms = this.resolveKegs();          // the powder, and its chain
    if (booms.length) this._pendingSettle = true;
    this.booms = (this.booms || []).concat(booms);
    for (const b of booms) this._queueBlast(b.at[0], b.at[1], b.at[2], b.r * 1.5, b.impulse);
    for (const h of out) this._queueBlast(h.at[0], h.at[1], h.at[2], h.ammo.blastR * 1.3, h.ammo.impulse);

    return out;
  }

  /* call once per physics step, AFTER Step. Cracks masonry from hard
     landings (queued by the contact listener) and resolves any kegs that
     fuses. Like applyHits() above, does NOT settle or rebuild itself --
     call commitDamage() to actually apply whatever either method queued. */
  applyImpacts() {
    this._poseDirty();
    if (!this.impacts || !this.impacts.length) return 0;
    let broke = 0;
    if (this.dbgLog && this.dbgLog.length < 6) {
      const im = this.impacts[0];
      this.dbgLog.push(`queued ${this.impacts.length} @ (${im.x.toFixed(1)},${im.y.toFixed(1)},${im.z.toFixed(1)}) r=${im.r.toFixed(1)} pow=${im.power.toFixed(1)}`);
    }
    // FRAGMENT BUDGET. Impact fracture is a positive feedback loop: cracking
    // makes fragments, fragments land, landings crack more. A castle-sized
    // collapse ran away to 2836 bodies and 50 ms/frame of pure broadphase.
    // Past the budget the rubble stops sub-dividing -- it still falls, it just
    // stops turning into gravel, and no one can see the difference.
    if (this.bodies.length < (this.maxBodies ?? 600)) {
      for (const im of this.impacts) {
        const r = this.damage(im.x, im.y, im.z, im.r, im.power, 0);   // cracks, no crater
        broke += r.broke;
      }
    }
    this.impacts.length = 0;

    // rubble landing on a keg lights it too -- the magazine can go up long
    // after the shot that buried it.
    const booms = this.resolveKegs();
    this.booms = (this.booms || []).concat(booms);
    for (const b of booms) this._queueBlast(b.at[0], b.at[1], b.at[2], b.r * 1.5, b.impulse);

    if (broke > 0 || booms.length) this._pendingSettle = true;
    return broke;
  }

  /* Apply whatever applyImpacts()/applyHits() queued since the last call:
     ONE settleStructure()+rebuild() pass (not one per method, not one per
     Step), then the blast impulses. Call this once after you're done
     calling those for whatever window you want batched together -- once
     per Step for the headless tools, once per RENDERED FRAME for the
     viewer (which can run up to 3 Steps per frame catching up) so a burst
     of simultaneous damage doesn't pay full price 2-3x over.
     Cheap to call even when nothing is pending. */
  commitDamage() {
    const blasts = this._pendingBlasts;
    this._pendingBlasts = [];
    if (!this._pendingSettle) return;
    this._pendingSettle = false;
    this.settleStructure();            // crush the overloaded, shed the hanging
    this.rebuild(true);
    for (const b of blasts) this.blast(b.x, b.y, b.z, b.r, b.impulse);
  }

  /* ---------- TENSION: mortar cannot pull -------------------------------
     Load reaches the ground downward or sideways, never up. Mortar bridges a
     short lateral span (that is what an arch is) but not a long one. Anything
     that cannot reach the ground within `span` sideways hops is a cantilever,
     and masonry cantilevers crack off -- so sever the joints where the loose
     stone meets the standing structure. Pure graph work; no physics.        */
  tensionPass(span = 2, minChunk = 3, groundY = 0.55) {
    if (!this.world) this._initWorld(); else this._captureWorld();
    const W = this.world, n = this.bricks.length, BIG = 1e9;
    const hops = new Float64Array(n).fill(BIG);

    if (!this.adj) {
      const start = new Int32Array(n + 1);
      for (const L of this.links) { start[L.a + 1]++; start[L.b + 1]++; }
      for (let i = 0; i < n; i++) start[i + 1] += start[i];
      const idx = new Int32Array(this.links.length * 2);
      const cur = start.slice(0, n);
      this.links.forEach((L, e) => { idx[cur[L.a]++] = e; idx[cur[L.b]++] = e; });
      this.adj = { start, idx };
    }

    // "grounded" must mean ACTUALLY RESTING ON THE GROUND, not course===0.
    // Once a chunk is lying on its side, its course-0 bricks are 10m in the air.
    const order = [];
    for (let i = 0; i < n; i++) {
      if (!this.alive[i] || this.bricks[i].isKeg) continue;   // a barrel carries nothing
      if (W[i*7+1] < groundY) hops[i] = 0;
      order.push(i);
    }
    order.sort((a, b) => W[a*7+1] - W[b*7+1]);   // work upward from the floor

    const EPS = 0.22;                            // same-height tolerance
    for (const i of order) {
      if (hops[i] === 0) continue;
      let best = BIG;
      for (let a = this.adj.start[i]; a < this.adj.start[i+1]; a++) {
        const L = this.links[this.adj.idx[a]];
        if (!L.alive) continue;
        const j = L.a === i ? L.b : L.a;
        if (!this.alive[j] || hops[j] >= BIG) continue;
        const dy = W[i*7+1] - W[j*7+1];
        if (dy > EPS)            best = Math.min(best, 0);            // load flows DOWN: free
        else if (Math.abs(dy) <= EPS) best = Math.min(best, hops[j] + 1); // sideways: costs a hop
      }
      if (best <= span) hops[i] = best;
    }

    const loose = [];
    for (let i = 0; i < n; i++) if (this.alive[i] && !this.bricks[i].isKeg && hops[i] >= BIG) loose.push(i);
    if (loose.length < minChunk) return 0;

    const isLoose = new Uint8Array(n);
    for (const i of loose) isLoose[i] = 1;
    let cracked = 0;
    for (const L of this.links) {
      if (!L.alive) continue;
      if (isLoose[L.a] !== isLoose[L.b]) { L.alive = 0; cracked++; this.brokenLinks++; }
    }
    return cracked;
  }

  /* ---------- COMPRESSION: stone crushes -------------------------------
     The missing half of masonry. Mortar cannot pull (tensionPass) -- but stone
     also cannot carry unlimited load. Push the weight of every brick DOWN the
     mortar graph and see what each brick ends up carrying. Erode a base and the
     survivors must carry the same tower through less and less bearing area;
     past their limit they pulverise, which dumps their load on their neighbours,
     which crush in turn. That cascade IS how a tower comes down. Without it you
     have to chew away every single block and it still never falls.

     Crushed stone is not deleted -- it loses its mortar and becomes loose
     rubble, so you watch the base turn to gravel and the tower sit down on it.
  --------------------------------------------------------------------- */
  loadPass(crush = this.crushFactor ?? 1.8) {
    if (!this.world) this._initWorld(); else this._captureWorld();
    const W = this.world, n = this.bricks.length, EPS = 0.22;

    if (!this.adj) this.tensionPass(2, 1e9);      // builds the CSR adjacency

    const order = [];
    for (let i = 0; i < n; i++) if (this.alive[i] && !this.bricks[i].isKeg) order.push(i);
    order.sort((a, b) => W[b*7+1] - W[a*7+1]);    // heaviest-loaded is lowest: work DOWN

    const load = new Float64Array(n);
    for (const i of order) load[i] += 1;          // every brick weighs 1

    for (const i of order) {
      const down = [];
      for (let a = this.adj.start[i]; a < this.adj.start[i+1]; a++) {
        const L = this.links[this.adj.idx[a]];
        if (!L.alive) continue;
        const j = L.a === i ? L.b : L.a;
        if (this.alive[j] && W[i*7+1] - W[j*7+1] > EPS) down.push(j);
      }
      if (!down.length) continue;                 // resting on the ground, or hanging
      const share = load[i] / down.length;
      for (const j of down) load[j] += share;
    }

    // calibrate against the INTACT tower the first time we ever look
    if (this.nominalLoad == null) {
      this.nominalLoad = Math.max(...load);
      return 0;
    }

    const cap = this.nominalLoad * crush;
    let crushed = 0;
    for (let i = 0; i < n; i++) {
      if (!this.alive[i] || load[i] <= cap) continue;
      let any = false;
      for (let a = this.adj.start[i]; a < this.adj.start[i+1]; a++) {
        const L = this.links[this.adj.idx[a]];
        if (L.alive) { L.alive = 0; this.brokenLinks++; any = true; }
      }
      if (any) crushed++;
    }
    return crushed;
  }

  /* run the structure to equilibrium: crush, then shed cantilevers, repeat */
  settleStructure(maxIter = 24) {
    let total = 0;
    for (let k = 0; k < maxIter; k++) {
      const c = this.loadPass() + this.tensionPass(2, 3);
      if (!c) break;
      total += c;
    }
    return total;
  }

  /* --- world transform of every brick, for rendering --- */
  brickTransforms(out) {
    for (let i = 0; i < this.bricks.length; i++) {
      if (!this.alive[i]) { out[i*7+1] = -999; continue; }
      const body = this.bodies[this.brickBody[i]];
      if (!body) continue;
      const bp = body.GetPosition();
      const px = bp.GetX(), py = bp.GetY(), pz = bp.GetZ();       // copy: shared temp
      const bq = body.GetRotation();
      const qx = bq.GetX(), qy = bq.GetY(), qz = bq.GetZ(), qw = bq.GetW();

      const L = this.brickLocal[i];
      const [lx, ly, lz] = L.p;
      const [ax, ay, az, aw] = L.q;

      // rotate the local offset into world space
      const tx = 2*(qy*lz - qz*ly), ty = 2*(qz*lx - qx*lz), tz = 2*(qx*ly - qy*lx);
      out[i*7+0] = px + lx + qw*tx + (qy*tz - qz*ty);
      out[i*7+1] = py + ly + qw*ty + (qz*tx - qx*tz);
      out[i*7+2] = pz + lz + qw*tz + (qx*ty - qy*tx);

      // body rotation * brick rotation
      out[i*7+3] = qw*ax + qx*aw + qy*az - qz*ay;
      out[i*7+4] = qw*ay - qx*az + qy*aw + qz*ax;
      out[i*7+5] = qw*az + qx*ay - qy*ax + qz*aw;
      out[i*7+6] = qw*aw - qx*ax - qy*ay - qz*az;
    }
  }

  /* highest banner brick */
  bannerHeight() {
    const t = this._tmp || (this._tmp = new Float32Array(this.bricks.length * 7));
    this.brickTransforms(t);
    let best = -1e9;
    for (let i = 0; i < this.bricks.length; i++) {
      if (!this.bricks[i].isBanner || !this.alive[i]) continue;
      if (t[i*7+1] > best) best = t[i*7+1];
    }
    return best;
  }

  /* THE WIN CHECK.
     Not "did the banner touch the floor" -- a toppled tower leaves a rubble
     pile and the banner often ends up perched several metres up it. The tower
     is plainly destroyed; the check must agree. So: the banner is DOWN when it
     is no longer held anywhere near the height the standing tower held it at.  */
  bannerDown(ratio = 0.5) {
    if (this.h0 == null) return false;
    return this.bannerHeight() < this.h0 * ratio;
  }

  awake() { return this.bodies.filter(b => b.IsActive()).length; }

  /* detonations since the last call, for the renderer to turn into fireballs */
  drainBooms() { const b = this.booms || []; this.booms = []; return b; }
}
