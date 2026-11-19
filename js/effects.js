// 파편·종이·충격파·분리된 부품(간이 물리)을 관리합니다.
// 물리엔진 없이 중력 + 바닥/책상 충돌만 계산해 모바일에서도 가볍게 동작합니다.
import * as THREE from 'three';

const GRAVITY = 9.8;
const ROOM = { minX: -2.45, maxX: 2.45, minZ: -2.45, maxZ: 3.2 };
const rand = (a, b) => a + Math.random() * (b - a);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _dummy = new THREE.Object3D();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _color = new THREE.Color();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// 책상 상판처럼 위에 물건이 얹힐 수 있는 면
export class Platform {
  constructor(object3d, halfX, halfZ, y, isActive) {
    object3d.updateMatrixWorld(true);
    this.inv = object3d.matrixWorld.clone().invert();
    this.hx = halfX; this.hz = halfZ; this.y = y;
    this.isActive = isActive;
  }
  contains(p) {
    _v2.copy(p).applyMatrix4(this.inv);
    return Math.abs(_v2.x) < this.hx && Math.abs(_v2.z) < this.hz;
  }
}

function floorAt(p, prevY, platforms) {
  let floor = 0;
  for (const pl of platforms) {
    if (pl.isActive() && prevY >= pl.y - 0.02 && pl.contains(p)) floor = Math.max(floor, pl.y);
  }
  return floor;
}

class InstancedPool {
  constructor(scene, geo, mat, max) {
    this.max = max;
    this.limit = max;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ active: false, p: new THREE.Vector3(), v: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0), q: new THREE.Quaternion(), spin: 0, life: 0, s: 1, phase: 0, landed: false });
      this.mesh.setMatrixAt(i, _zero);
      this.mesh.setColorAt(i, _color.set(0xffffff));
    }
    this.cursor = 0;
    this.activeCount = 0;
    scene.add(this.mesh);
  }
  setLimit(n) {
    this.limit = Math.max(1, Math.min(this.max, n));
    for (let i = this.limit; i < this.max; i++) this.kill(i);
    this.cursor = 0;
  }
  next(color) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.limit;
    const it = this.items[i];
    if (!it.active) this.activeCount++;
    it.active = true; it.landed = false;
    this.mesh.setColorAt(i, _color.set(color));
    this.mesh.instanceColor.needsUpdate = true;
    return it;
  }
  kill(i) {
    const it = this.items[i];
    if (it.active) this.activeCount--;
    it.active = false;
    this.mesh.setMatrixAt(i, _zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { for (let i = 0; i < this.max; i++) this.kill(i); }
}

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    this.platforms = [];
    this.debris = [];
    this.q = quality;

    // 일반 파편 (사면체 조각)
    const shardGeo = new THREE.TetrahedronGeometry(0.028);
    const shardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0.1 });
    this.shards = new InstancedPool(scene, shardGeo, shardMat, 180);

    // 유리 파편 (얇은 조각)
    const glassGeo = new THREE.TetrahedronGeometry(0.04); glassGeo.scale(1, 0.12, 1);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.8 });
    this.glass = new InstancedPool(scene, glassGeo, glassMat, 120);

    // 종이 (A4 비율)
    const paperGeo = new THREE.PlaneGeometry(0.15, 0.21);
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    this.paper = new InstancedPool(scene, paperGeo, paperMat, 90);

    // 충격파 링
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.55, 1, 28);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.userData.t = 1;
      scene.add(m); this.rings.push(m);
    }
    this.ringCursor = 0;

    // 타격 순간 섬광
    this.flashLight = new THREE.PointLight(0xffd9a0, 0, 2.5, 2);
    scene.add(this.flashLight);

    // 균열 데칼
    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    this.decalGeo.userData.shared = true;
    this.decalMats = [];
    this.applyQuality(quality);
  }

  setCrackTextures(textures) {
    this.decalMats = textures.map(t => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  }

  applyQuality(q) {
    this.q = q;
    this.shards.setLimit(q.shards);
    this.glass.setLimit(q.glass);
    this.paper.setLimit(q.paper);
    while (this.debris.length > q.debris) this.removeDebris(0);
  }

  // ---------- 파편 ----------
  spawnShards(point, normal, color, count, speed = 2.5, glass = false) {
    const pool = glass ? this.glass : this.shards;
    const n = Math.min(count, pool.limit);
    for (let i = 0; i < n; i++) {
      const it = pool.next(Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color);
      it.p.copy(point).addScaledVector(normal, 0.02);
      it.v.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().addScaledVector(normal, 1.2).normalize()
        .multiplyScalar(speed * rand(0.4, 1.2));
      it.v.y += rand(0.5, 2.0);
      it.axis.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      it.q.setFromAxisAngle(it.axis, Math.random() * 6);
      it.spin = rand(8, 22);
      it.s = glass ? rand(0.5, 2.6) : rand(0.5, 1.6);
      it.life = rand(2.5, 4.5);
    }
  }

  spawnPaper(point, count, power = 1.5) {
    const n = Math.min(count, this.paper.limit);
    for (let i = 0; i < n; i++) {
      const it = this.paper.next(Math.random() < 0.85 ? 0xfafafa : 0xfff3b0);
      it.p.copy(point).add(_v.set(rand(-0.1, 0.1), rand(0, 0.1), rand(-0.1, 0.1)));
      it.v.set(rand(-1, 1), rand(0.8, 1.8), rand(-1, 1)).multiplyScalar(power * rand(0.6, 1.3));
      it.axis.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      it.q.setFromAxisAngle(it.axis, Math.random() * 6);
      it.spin = rand(2, 6);
      it.phase = Math.random() * 10;
      it.s = rand(0.8, 1.1);
      it.life = rand(7, 10);
    }
  }

  ring(point, normal, color = 0xffd28a, size = 0.35) {
    const m = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    m.position.copy(point).addScaledVector(normal, 0.01);
    m.quaternion.setFromUnitVectors(Z_AXIS, normal);
    m.material.color.set(color);
    m.userData.t = 0; m.userData.size = size;
    m.visible = true;
  }

  flash(point, intensity = 6) {
    if (!this.q.light) return;
    this.flashLight.position.copy(point);
    this.flashLight.intensity = intensity;
  }

  // ---------- 균열 데칼 ----------
  addCrackDecal(hit, size, owner) {
    if (!this.decalMats.length) return;
    const mesh = hit.object;
    const n = _v.copy(hit.face.normal).transformDirection(mesh.matrixWorld).normalize();
    const d = new THREE.Mesh(this.decalGeo, this.decalMats[(Math.random() * this.decalMats.length) | 0]);
    d.position.copy(hit.point).addScaledVector(n, 0.003);
    d.quaternion.setFromUnitVectors(Z_AXIS, n);
    d.rotateZ(Math.random() * Math.PI * 2);
    d.scale.setScalar(size);
    this.scene.add(d);
    mesh.attach(d); // 부품이 떨어져 나가도 균열이 함께 따라감
    owner.decals.push(d);
    while (owner.decals.length > this.q.decals) {
      const old = owner.decals.shift();
      old.parent && old.parent.remove(old);
    }
  }

  // ---------- 분리된 부품(간이 강체) ----------
  detach(mesh, origin, power = 3) {
    if (!mesh.parent) return;
    this.scene.attach(mesh); // 월드 좌표 유지한 채 분리
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    const corners = [];
    for (let i = 0; i < 8; i++) {
      corners.push(new THREE.Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z));
    }
    const wp = mesh.getWorldPosition(new THREE.Vector3());
    const dir = wp.clone().sub(origin);
    dir.y = Math.max(dir.y, 0) + 0.6;
    if (dir.lengthSq() < 1e-4) dir.set(rand(-1, 1), 1, rand(-1, 1));
    dir.normalize();
    const vel = dir.multiplyScalar(power * rand(0.6, 1.1));
    vel.x += rand(-0.6, 0.6); vel.z += rand(-0.6, 0.6);
    const angVel = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(power * 2.2);
    mesh.castShadow = this.q.shadows && mesh.userData.bigPart === true;
    this.debris.push({ mesh, vel, angVel, corners, sleeping: false, sleepT: 0, age: 0, fade: -1, prevMinY: wp.y });
    let over = this.debris.length - this.q.debris;
    for (let i = 0; over > 0 && i < this.debris.length; i++) {
      if (this.debris[i].fade < 0) { this.debris[i].fade = 0.4; over--; }
    }
  }

  removeDebris(index) {
    const d = this.debris[index];
    this.scene.remove(d.mesh);
    disposeTree(d.mesh);
    this.debris.splice(index, 1);
  }

  // 받침(책상)이 사라졌을 때 위에 놓인 조각들이 다시 떨어지도록
  wakeAll() {
    for (const d of this.debris) { d.sleeping = false; d.sleepT = 0; }
    for (const pool of [this.shards, this.glass, this.paper]) {
      for (const it of pool.items) if (it.active && it.p.y > 0.05) it.landed = false;
    }
  }

  // ---------- 매 프레임 ----------
  update(dt) {
    if (dt <= 0) return;
    this.updateShardPool(this.shards, dt);
    this.updateShardPool(this.glass, dt);
    this.updatePaper(dt);
    this.updateDebris(dt);

    for (const m of this.rings) {
      if (!m.visible) continue;
      m.userData.t += dt / 0.28;
      const t = m.userData.t;
      if (t >= 1) { m.visible = false; continue; }
      m.scale.setScalar(m.userData.size * (0.3 + t * 1.4));
      m.material.opacity = (1 - t) * 0.9;
    }
    if (this.flashLight.intensity > 0) this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 60);
  }

  updateShardPool(pool, dt) {
    if (pool.activeCount === 0) return;
    const items = pool.items;
    for (let i = 0; i < pool.limit; i++) {
      const it = items[i];
      if (!it.active) continue;
      it.life -= dt;
      if (it.life <= 0) { pool.kill(i); continue; }
      if (!it.landed) {
        const prevY = it.p.y;
        it.v.y -= GRAVITY * dt;
        it.p.addScaledVector(it.v, dt);
        const floor = floorAt(it.p, prevY, this.platforms) + 0.008;
        if (it.p.y < floor) {
          it.p.y = floor;
          if (Math.abs(it.v.y) < 0.6) { it.landed = true; it.v.set(0, 0, 0); }
          else { it.v.y *= -0.3; it.v.x *= 0.6; it.v.z *= 0.6; it.spin *= 0.5; }
        }
        bounceWalls(it.p, it.v);
        _q.setFromAxisAngle(it.axis, it.spin * dt);
        it.q.premultiply(_q);
      }
      const s = it.s * Math.min(1, it.life / 0.6);
      _dummy.position.copy(it.p); _dummy.quaternion.copy(it.q); _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      pool.mesh.setMatrixAt(i, _dummy.matrix);
    }
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  updatePaper(dt) {
    const pool = this.paper;
    if (pool.activeCount === 0) return;
    for (let i = 0; i < pool.limit; i++) {
      const it = pool.items[i];
      if (!it.active) continue;
      it.life -= dt;
      if (it.life <= 0) { pool.kill(i); continue; }
      if (!it.landed) {
        const prevY = it.p.y;
        it.phase += dt;
        // 공기저항이 큰 종이: 흔들리며 천천히 떨어짐
        it.v.y -= GRAVITY * 0.35 * dt;
        const drag = Math.exp(-2.2 * dt);
        it.v.x *= drag; it.v.z *= drag;
        if (it.v.y < -0.7) it.v.y = -0.7;
        it.p.addScaledVector(it.v, dt);
        it.p.x += Math.sin(it.phase * 3.1) * 0.5 * dt;
        it.p.z += Math.cos(it.phase * 2.3) * 0.4 * dt;
        bounceWalls(it.p, it.v);
        _q.setFromAxisAngle(it.axis, it.spin * dt);
        it.q.premultiply(_q);
        const floor = floorAt(it.p, prevY, this.platforms) + 0.004;
        if (it.p.y < floor) {
          it.p.y = floor;
          it.landed = true;
          it.q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.random() * 6));
        }
      }
      const s = it.s * Math.min(1, it.life / 0.8);
      _dummy.position.copy(it.p); _dummy.quaternion.copy(it.q); _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      pool.mesh.setMatrixAt(i, _dummy.matrix);
    }
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  updateDebris(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.age += dt;
      if (d.fade >= 0) {
        d.fade -= dt;
        d.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 5));
        if (d.fade <= 0) { this.removeDebris(i); continue; }
      }
      if (d.sleeping) continue;
      const m = d.mesh;
      d.vel.y -= GRAVITY * dt;
      m.position.addScaledVector(d.vel, dt);
      const w = d.angVel.length();
      if (w > 1e-4) {
        _q.setFromAxisAngle(_v.copy(d.angVel).divideScalar(w), w * dt);
        m.quaternion.premultiply(_q);
      }
      m.updateMatrixWorld();
      // 꼭짓점 8개 중 가장 낮은 점으로 바닥 접촉 판정
      let minY = Infinity;
      for (const c of d.corners) {
        _v.copy(c).applyMatrix4(m.matrixWorld);
        if (_v.y < minY) minY = _v.y;
      }
      const floor = floorAt(m.position, d.prevMinY, this.platforms);
      if (minY < floor) {
        m.position.y += floor - minY;
        if (d.vel.y < 0) d.vel.y = Math.abs(d.vel.y) > 1.2 ? -d.vel.y * 0.3 : 0;
        d.vel.x *= 0.82; d.vel.z *= 0.82;
        d.angVel.multiplyScalar(0.75);
        minY = floor;
      }
      d.prevMinY = minY;
      bounceWalls(m.position, d.vel);
      if (d.vel.lengthSq() < 0.01 && d.angVel.lengthSq() < 0.04 && minY - floor < 0.01) {
        d.sleepT += dt;
        if (d.sleepT > 0.4) { d.sleeping = true; d.vel.set(0, 0, 0); d.angVel.set(0, 0, 0); }
      } else d.sleepT = 0;
    }
  }

  clear() {
    this.shards.clear(); this.glass.clear(); this.paper.clear();
    while (this.debris.length) this.removeDebris(this.debris.length - 1);
    for (const m of this.rings) m.visible = false;
    this.flashLight.intensity = 0;
    this.platforms.length = 0;
  }
}

function bounceWalls(p, v) {
  if (p.x < ROOM.minX) { p.x = ROOM.minX; v.x = Math.abs(v.x) * 0.4; }
  if (p.x > ROOM.maxX) { p.x = ROOM.maxX; v.x = -Math.abs(v.x) * 0.4; }
  if (p.z < ROOM.minZ) { p.z = ROOM.minZ; v.z = Math.abs(v.z) * 0.4; }
  if (p.z > ROOM.maxZ) { p.z = ROOM.maxZ; v.z = -Math.abs(v.z) * 0.4; }
}

// 공유 재질은 남기고, 부품마다 만든 지오메트리만 해제
export function disposeTree(obj) {
  obj.traverse(o => {
    if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
}
