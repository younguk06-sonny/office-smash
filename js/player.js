// 1인칭 이동: 조이스틱/키보드 입력 → 이동, 벽·물건 충돌
import * as THREE from 'three';

export const SPAWN = { x: 0, z: 7.6, yaw: 0 };

export class Player {
  constructor(camera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(SPAWN.x, 1.6, SPAWN.z);
    this.yaw = SPAWN.yaw; this.pitch = -0.08;
    this.radius = 0.32;
    this.move = { x: 0, y: 0 };   // 조이스틱 (-1~1), y+ = 앞
    this.keys = new Set();
    this.run = false;
    this.bob = 0;
    this.speedNow = 0;
  }

  reset() {
    this.pos.set(SPAWN.x, 1.6, SPAWN.z);
    this.yaw = SPAWN.yaw; this.pitch = -0.08;
    this.move.x = this.move.y = 0;
    this.keys.clear();
    this.bob = 0;
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -1.25, 1.1);
  }

  update(dt, colliders, bounds) {
    let mx = this.move.x, my = this.move.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const run = this.run || k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = (run ? 5.2 : 3.4);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // 앞 = (-sin, -cos), 오른쪽 = (cos, -sin)
    const vx = (-sin * my + cos * mx) * speed;
    const vz = (-cos * my - sin * mx) * speed;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    this.collide(colliders);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, bounds.minX + this.radius, bounds.maxX - this.radius);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, bounds.minZ + this.radius, bounds.maxZ - this.radius);

    this.speedNow = Math.hypot(vx, vz);
    if (this.speedNow > 0.1) this.bob += dt * (run ? 13 : 9.5);
    const bobY = Math.sin(this.bob) * 0.035 * Math.min(1, this.speedNow / 3);
    this.camera.position.set(this.pos.x, this.pos.y + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  collide(colliders) {
    const r = this.radius, p = this.pos;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of colliders) {
        if (c.obj && c.obj.destroyed) continue;
        const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
        } else {
          // 내부에 들어간 경우: 가장 가까운 면으로 밀어냄
          const opts = [[p.x - c.minX + r, -1, 0], [c.maxX - p.x + r, 1, 0], [p.z - c.minZ + r, 0, -1], [c.maxZ - p.z + r, 0, 1]];
          opts.sort((a, b) => a[0] - b[0]);
          p.x += opts[0][1] * opts[0][0]; p.z += opts[0][2] * opts[0][0];
        }
      }
    }
  }
}
