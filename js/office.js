// 사무실 공간과 부술 수 있는 물건(책상·모니터·복사기)을 기본 도형으로 구성합니다.
import * as THREE from 'three';
import { woodTexture, keyboardTexture, whiteboardTexture, ScreenCanvas } from './textures.js';
import { Platform } from './effects.js';

const rand = (a, b) => a + Math.random() * (b - a);
const _n = new THREE.Vector3();

let M = null;
function mats() {
  if (M) return M;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M = {
    wood: std({ map: woodTexture(), roughness: 0.62 }),
    metal: std({ color: 0x4c535c, metalness: 0.7, roughness: 0.35 }),
    chrome: std({ color: 0xb8bec6, metalness: 0.9, roughness: 0.22 }),
    darkPlastic: std({ color: 0x1b1e23, roughness: 0.42 }),
    grayPlastic: std({ color: 0x8b9198, roughness: 0.6 }),
    lightPlastic: std({ color: 0xc9ccd0, roughness: 0.55 }),
    copier: std({ color: 0xe4e5e0, roughness: 0.55 }),
    copierDark: std({ color: 0x3a3e45, roughness: 0.5 }),
    accent: std({ color: 0x3a8cff, roughness: 0.3, emissive: 0x1450c0, emissiveIntensity: 0.9 }),
    paper: std({ color: 0xfbfbf8, roughness: 0.95 }),
    mug: std({ color: 0xf1f1f1, roughness: 0.25 }),
    keyboard: std({ map: keyboardTexture(), roughness: 0.5 }),
  };
  return M;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const mesh = (geo, mat) => new THREE.Mesh(geo, mat);

const SHARD_COLORS = {
  wood: [0x8a6440, 0xb08a5c, 0x6e4e30],
  metal: [0x5d646d, 0x9aa3ad, 0x3f454c],
  glass: [0xcfe9ff, 0xffffff, 0x9fd0ff],
  paper: [0xffffff, 0xf3f3ee],
};

// ------------------------------------------------------------------
// 부술 수 있는 물건 공통 클래스
// 상태: 0 정상 → 1 균열 → 2 심각한 파손 → 3 완전 파괴
// ------------------------------------------------------------------
export class Breakable {
  constructor(env, opt) {
    this.env = env;
    this.type = opt.type;
    this.name = opt.name;
    this.maxHP = opt.maxHP;
    this.hp = opt.maxHP;
    this.destroyBonus = opt.destroyBonus;
    this.mainKind = opt.mainKind || 'plastic';
    this.group = new THREE.Group();
    this.parts = [];
    this.decals = [];
    this.stage = 0;
    this.destroyed = false;
    this.baseRotY = 0;
    this.wobble = { amp: 0, t: 0, ax: 1, az: 0 };
    this.tilt = { x: 0, z: 0, tx: 0, tz: 0 };
    this.support = null;      // 이 물건을 받치고 있는 물건 (모니터 → 책상)
    this.fallVy = 0;
    this.landed = false;
    this.disposables = [];
    this.onHit = null;
    this.onStage = null;
    this.extraUpdate = null;
  }

  addPart(m, opt = {}) {
    const p = {
      mesh: m,
      detach: opt.detach ?? 3,
      kind: opt.kind || 'plastic',
      special: opt.special || null,
      power: opt.power ?? 1,
      detached: false,
    };
    m.userData.owner = this;
    m.userData.part = p;
    m.userData.bigPart = !!opt.big;
    m.castShadow = !!opt.big;
    m.receiveShadow = true;
    (opt.parent || this.group).add(m);
    this.parts.push(p);
    return p;
  }

  attachedMeshes(out) {
    for (const p of this.parts) if (!p.detached) out.push(p.mesh);
  }

  stageFromHP() {
    if (this.hp <= 0) return 3;
    const r = this.hp / this.maxHP;
    if (r <= 0.42) return 2;
    if (r <= 0.8) return 1;
    return 0;
  }

  damage(dmg, hit, power = 1) {
    if (this.destroyed) return null;
    const env = this.env;
    const part = hit.object.userData.part;
    const prev = this.stage;
    this.hp = Math.max(0, this.hp - dmg);

    const n = _n.copy(hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0)).transformDirection(hit.object.matrixWorld).normalize();
    const nn = n.clone();

    // 흔들림: 맞은 방향으로 기울었다 돌아옴
    const local = this.group.worldToLocal(hit.point.clone());
    this.wobble.ax = local.z >= 0 ? -1 : 1;
    this.wobble.az = local.x >= 0 ? 1 : -1;
    this.wobble.amp = Math.min(0.13, this.wobble.amp + 0.03 + this.stage * 0.012) * power;
    this.wobble.t = 0;

    // 타격 효과
    const q = env.quality();
    const count = Math.round((4 + this.stage * 3) * q.fxScale * power);
    env.fx.spawnShards(hit.point, nn, this.shardColor(part), count, 2.4 * power, part.kind === 'glass');
    env.fx.ring(hit.point, nn, part.kind === 'glass' ? 0xbfe6ff : 0xffd28a, 0.3 * power);
    env.fx.flash(hit.point, 5 * power);
    env.sfx.hit(part.kind, Math.min(1.3, power));

    if (this.onHit) this.onHit(hit, part, nn);
    else if (part.kind !== 'glass' && part.kind !== 'paper') {
      env.fx.addCrackDecal(hit, 0.1 + this.stage * 0.05 + Math.random() * 0.05, this);
    }

    const ns = this.stageFromHP();
    for (let s = prev + 1; s <= ns; s++) this.enterStage(s, hit.point.clone());
    return { prev, stage: ns, destroyed: ns === 3 };
  }

  enterStage(s, origin) {
    const env = this.env;
    this.stage = s;
    if (s === 3) this.destroyed = true;
    for (const p of this.parts) {
      if (!p.detached && (p.detach === s || s === 3)) this.detachPart(p, origin, s);
    }
    if (s === 1) { this.tilt.tx = rand(-0.025, 0.025); this.tilt.tz = rand(-0.025, 0.025); env.sfx.crack(); }
    if (s === 2) { this.tilt.tx = rand(-0.06, 0.06); this.tilt.tz = rand(-0.06, 0.06); env.sfx.breakPart(this.mainKind); }
    if (s === 3) env.sfx.destroy(this.mainKind);
    if (this.onStage) this.onStage(s, origin);
    env.markDirty();
  }

  detachPart(p, origin, s) {
    const env = this.env;
    p.detached = true;
    const m = p.mesh;
    m.updateMatrixWorld(true);
    if (p.special === 'shatter') {
      // 모니터 유리: 화면 전체에 걸쳐 유리 조각으로 산산조각
      const g = m.geometry.parameters;
      const nrm = new THREE.Vector3(0, 0, 1).transformDirection(m.matrixWorld);
      const n = Math.round(46 * env.quality().fxScale);
      for (let i = 0; i < n; i++) {
        const pt = new THREE.Vector3(rand(-0.5, 0.5) * g.width, rand(-0.5, 0.5) * g.height, 0).applyMatrix4(m.matrixWorld);
        env.fx.spawnShards(pt, nrm, SHARD_COLORS.glass, 1, 2.6, true);
      }
      m.parent && m.parent.remove(m);
      m.geometry.dispose();
      return;
    }
    if (p.special === 'paper') {
      const wp = m.getWorldPosition(new THREE.Vector3());
      env.fx.spawnPaper(wp, Math.round(12 * env.quality().fxScale), 1.8);
      env.sfx.paper();
      m.parent && m.parent.remove(m);
      m.geometry.dispose();
      return;
    }
    if (p.special === 'keys') {
      const wp = m.getWorldPosition(new THREE.Vector3());
      env.fx.spawnShards(wp, new THREE.Vector3(0, 1, 0), [0x2c3038, 0x16181c, 0xdddddd], Math.round(22 * env.quality().fxScale), 2.2);
    }
    const power = (s === 3 ? 3.2 : s === 2 ? 2.3 : 1.6) * p.power;
    env.fx.detach(m, origin, power);
  }

  shardColor(part) {
    if (SHARD_COLORS[part.kind]) return SHARD_COLORS[part.kind];
    const mat = Array.isArray(part.mesh.material) ? part.mesh.material[0] : part.mesh.material;
    const c = mat.color ? mat.color.getHex() : 0x888888;
    return [c, c, 0x222222];
  }

  update(dt) {
    // 흔들림
    this.wobble.t += dt;
    this.wobble.amp *= Math.exp(-6.5 * dt);
    const w = this.wobble.amp * Math.sin(this.wobble.t * 34);
    const k = Math.min(1, dt * 8);
    this.tilt.x += (this.tilt.tx - this.tilt.x) * k;
    this.tilt.z += (this.tilt.tz - this.tilt.z) * k;
    this.group.rotation.set(this.tilt.x + w * this.wobble.ax, this.baseRotY, this.tilt.z + w * this.wobble.az);

    // 받침(책상)이 부서지면 바닥으로 추락
    if (this.support && this.support.destroyed && !this.landed) {
      this.fallVy -= 9.8 * dt;
      this.group.position.y += this.fallVy * dt;
      if (this.group.position.y <= 0) {
        this.group.position.y = 0;
        if (this.fallVy < -1.5) {
          this.fallVy *= -0.25;
          this.env.sfx.thud();
          this.tilt.tz = rand(-0.2, 0.2); this.tilt.tx = rand(-0.15, 0.15);
        } else { this.fallVy = 0; this.landed = true; }
      }
    }
    if (this.extraUpdate) this.extraUpdate(dt);
  }

  dispose() {
    this.env.scene.remove(this.group);
    this.group.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    for (const d of this.disposables) d.dispose();
  }
}

// ------------------------------------------------------------------
// 책상
// ------------------------------------------------------------------
export function buildDesk(env, x, z, rotY) {
  const m = mats();
  const b = new Breakable(env, { type: 'desk', name: '책상', maxHP: 170, destroyBonus: 800, mainKind: 'wood' });
  b.group.position.set(x, 0, z);
  b.baseRotY = rotY; b.group.rotation.y = rotY;

  const top = mesh(box(1.4, 0.04, 0.7), m.wood); top.position.set(0, 0.72, 0);
  b.addPart(top, { kind: 'wood', detach: 3, power: 0.35, big: true });

  [[-0.65, 0.3, 2], [0.65, 0.3, 3], [-0.65, -0.3, 3], [0.65, -0.3, 3]].forEach(([lx, lz, st]) => {
    const leg = mesh(box(0.05, 0.7, 0.05), m.metal); leg.position.set(lx, 0.35, lz);
    b.addPart(leg, { kind: 'metal', detach: st, power: 1.3 });
  });

  const panel = mesh(box(1.24, 0.32, 0.02), m.metal); panel.position.set(0, 0.5, -0.3);
  b.addPart(panel, { kind: 'metal', detach: 3, power: 0.9 });

  const cab = mesh(box(0.4, 0.52, 0.56), m.grayPlastic); cab.position.set(0.42, 0.27, 0);
  b.addPart(cab, { kind: 'plastic', detach: 3, power: 0.8, big: true });

  [0.4, 0.14].forEach(y => {
    const front = mesh(box(0.38, 0.23, 0.02), m.lightPlastic); front.position.set(0.42, y, 0.29);
    const handle = mesh(box(0.12, 0.015, 0.02), m.chrome); handle.position.set(0, 0.06, 0.015);
    front.add(handle);
    b.addPart(front, { kind: 'plastic', detach: 2, power: 1.2 });
  });

  const kb = mesh(box(0.44, 0.022, 0.15), m.keyboard); kb.position.set(-0.08, 0.751, 0.17);
  b.addPart(kb, { kind: 'plastic', detach: 2, special: 'keys', power: 1.1 });

  const mouse = mesh(box(0.06, 0.025, 0.1), m.darkPlastic); mouse.position.set(0.26, 0.752, 0.18);
  b.addPart(mouse, { kind: 'plastic', detach: 2, power: 1.4 });

  const mug = mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12), m.mug); mug.position.set(0.52, 0.79, 0.05);
  b.addPart(mug, { kind: 'plastic', detach: 1, power: 0.9 });

  env.scene.add(b.group);
  const pl = new Platform(b.group, 0.7, 0.35, 0.74, () => !b.destroyed);
  env.fx.platforms.push(pl);
  b.onStage = (s) => { if (s === 3) env.fx.wakeAll(); };
  return b;
}

// ------------------------------------------------------------------
// 모니터 (책상 위)
// ------------------------------------------------------------------
export function buildMonitor(env, desk, screenKind, offsetX = -0.08) {
  const m = mats();
  const b = new Breakable(env, { type: 'monitor', name: '모니터', maxHP: 90, destroyBonus: 500, mainKind: 'glass' });
  desk.group.updateMatrixWorld(true);
  b.group.position.copy(new THREE.Vector3(offsetX, 0.74, -0.14).applyMatrix4(desk.group.matrixWorld));
  b.baseRotY = desk.baseRotY; b.group.rotation.y = desk.baseRotY;
  b.support = desk;

  const base = mesh(box(0.26, 0.018, 0.2), m.darkPlastic); base.position.set(0, 0.009, 0);
  b.addPart(base, { kind: 'plastic', detach: 3, power: 0.8 });
  const neck = mesh(box(0.05, 0.3, 0.03), m.chrome); neck.position.set(0, 0.16, -0.03);
  b.addPart(neck, { kind: 'metal', detach: 3, power: 1.1 });

  // 화면부는 목(neck) 위쪽을 축으로 꺾이도록 하위 그룹으로 구성
  const head = new THREE.Group(); head.position.set(0, 0.28, -0.01);
  b.group.add(head);
  const housing = mesh(box(0.64, 0.4, 0.035), m.darkPlastic); housing.position.set(0, 0.15, 0.01);
  b.addPart(housing, { kind: 'plastic', detach: 3, power: 1.0, big: true, parent: head });
  const back = mesh(box(0.3, 0.22, 0.04), m.darkPlastic); back.position.set(0, 0.15, -0.025);
  b.addPart(back, { kind: 'plastic', detach: 2, power: 1.3, parent: head });

  const sc = new ScreenCanvas(screenKind);
  const screenMat = new THREE.MeshBasicMaterial({ map: sc.texture, toneMapped: false });
  b.disposables.push(sc, screenMat);
  const screen = mesh(new THREE.PlaneGeometry(0.6, 0.36), screenMat); screen.position.set(0, 0.155, 0.0285);
  const screenPart = b.addPart(screen, { kind: 'glass', detach: 3, special: 'shatter', parent: head });

  const headTarget = { x: 0, z: 0 };
  b.onHit = (hit, part, n) => {
    if (part === screenPart && hit.uv) sc.crack(hit.uv.x, hit.uv.y, 0.6 + b.stage * 0.55);
    else {
      env.fx.addCrackDecal(hit, 0.08 + b.stage * 0.04, b);
      if (b.stage >= 1 && !screenPart.detached) sc.crack(rand(0.1, 0.9), rand(0.1, 0.9), 0.5);
    }
  };
  b.onStage = (s, origin) => {
    if (s === 1) sc.crack(rand(0.3, 0.7), rand(0.3, 0.7), 1.0);
    if (s === 2) {
      sc.glitch();
      headTarget.x = rand(0.25, 0.4); headTarget.z = rand(-0.18, 0.18); // 화면이 앞으로 꺾임
      const wp = head.getWorldPosition(new THREE.Vector3());
      env.fx.spawnShards(wp, new THREE.Vector3(0, 1, 0), [0xfff2a0, 0xffb84d, 0xffffff], Math.round(10 * env.quality().fxScale), 3); // 스파크
    }
  };
  b.extraUpdate = (dt) => {
    const k = Math.min(1, dt * 10);
    head.rotation.x += (headTarget.x - head.rotation.x) * k;
    head.rotation.z += (headTarget.z - head.rotation.z) * k;
  };
  env.scene.add(b.group);
  return b;
}

// ------------------------------------------------------------------
// 복사기
// ------------------------------------------------------------------
export function buildCopier(env, x, z, rotY) {
  const m = mats();
  const b = new Breakable(env, { type: 'copier', name: '복사기', maxHP: 220, destroyBonus: 1200, mainKind: 'plastic' });
  b.group.position.set(x, 0, z);
  b.baseRotY = rotY; b.group.rotation.y = rotY;

  const cab = mesh(box(0.62, 0.42, 0.58), m.grayPlastic); cab.position.set(0, 0.21, 0);
  b.addPart(cab, { kind: 'plastic', detach: 3, power: 0.6, big: true });
  [0.31, 0.11].forEach(y => {
    const d = mesh(box(0.58, 0.17, 0.02), m.copier); d.position.set(0, y, 0.3);
    const h = mesh(box(0.2, 0.02, 0.02), m.copierDark); h.position.set(0, 0.05, 0.012); d.add(h);
    b.addPart(d, { kind: 'plastic', detach: 2, power: 1.2 });
  });
  const body = mesh(box(0.6, 0.4, 0.56), m.copier); body.position.set(0, 0.62, 0);
  b.addPart(body, { kind: 'plastic', detach: 3, power: 0.8, big: true });
  const lid = mesh(box(0.6, 0.04, 0.54), m.copierDark); lid.position.set(0, 0.84, -0.01);
  b.addPart(lid, { kind: 'plastic', detach: 2, power: 1.6 });
  const panel = mesh(box(0.24, 0.05, 0.12), m.copierDark); panel.position.set(0.14, 0.85, 0.24); panel.rotation.x = -0.3;
  const lcd = mesh(new THREE.PlaneGeometry(0.12, 0.06), m.accent); lcd.position.set(-0.03, 0.026, 0); lcd.rotation.x = -Math.PI / 2;
  panel.add(lcd);
  b.addPart(panel, { kind: 'plastic', detach: 3, power: 1.2 });
  const slot = mesh(box(0.02, 0.05, 0.3), m.copierDark); slot.position.set(0.305, 0.7, 0);
  b.addPart(slot, { kind: 'plastic', detach: 3, power: 1.0 });
  const tray = mesh(box(0.28, 0.015, 0.26), m.lightPlastic); tray.position.set(0.43, 0.66, 0); tray.rotation.z = 0.2;
  b.addPart(tray, { kind: 'plastic', detach: 2, power: 1.4 });
  const stack = mesh(box(0.2, 0.05, 0.25), m.paper); stack.position.set(0.43, 0.69, 0); stack.rotation.z = 0.2;
  b.addPart(stack, { kind: 'paper', detach: 2, special: 'paper' });

  b.onHit = (hit, part) => {
    if (part.kind !== 'paper') env.fx.addCrackDecal(hit, 0.1 + b.stage * 0.05 + Math.random() * 0.04, b);
    env.fx.spawnPaper(hit.point, 1 + b.stage, 1.3); // 복사기는 맞을 때마다 종이가 날림
    if (Math.random() < 0.4) env.sfx.paper();
  };
  b.onStage = (s) => {
    const top = b.group.localToWorld(new THREE.Vector3(0, 0.85, 0));
    const fx = env.quality().fxScale;
    if (s === 2) { env.fx.spawnPaper(top, Math.round(14 * fx), 2.0); env.sfx.paper(); }
    if (s === 3) { env.fx.spawnPaper(top, Math.round(36 * fx), 2.8); env.sfx.paper(); }
  };
  env.scene.add(b.group);
  return b;
}

// ------------------------------------------------------------------
// 사무실 공간 (부서지지 않는 배경)
// ------------------------------------------------------------------
export function buildRoom(scene, carpetTex, wallTex) {
  const surfaces = [];
  const floor = mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor); surfaces.push(floor);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  const back = mesh(new THREE.PlaneGeometry(8, 3.2), wallMat); back.position.set(0, 1.6, -2.6);
  const left = mesh(new THREE.PlaneGeometry(8, 3.2), wallMat); left.position.set(-2.6, 1.6, 0); left.rotation.y = Math.PI / 2;
  const right = mesh(new THREE.PlaneGeometry(8, 3.2), wallMat); right.position.set(2.6, 1.6, 0); right.rotation.y = -Math.PI / 2;
  [back, left, right].forEach(w => { w.receiveShadow = true; scene.add(w); surfaces.push(w); });

  const ceil = mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 1 }));
  ceil.position.y = 3.2; ceil.rotation.x = Math.PI / 2; scene.add(ceil);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffbf0 });
  [[-1, -0.8], [1, -0.8], [-1, 1.2], [1, 1.2]].forEach(([x, z]) => {
    const p = mesh(new THREE.PlaneGeometry(1.0, 0.5), lightMat); p.position.set(x, 3.19, z); p.rotation.x = Math.PI / 2; scene.add(p);
  });

  // 걸레받이
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.7 });
  const bb = mesh(new THREE.BoxGeometry(8, 0.1, 0.02), baseMat); bb.position.set(0, 0.05, -2.59); scene.add(bb);

  // 창문 (퇴근 시간 노을)
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, '#2b2d5a'); grad.addColorStop(0.55, '#e0785a'); grad.addColorStop(1, '#f6c27a');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 14; i++) {
    const bw = 12 + Math.random() * 22, bh = 40 + Math.random() * 90, bx = i * 19 - 6;
    g.fillStyle = '#1d1f33'; g.fillRect(bx, 160 - bh, bw, bh);
    g.fillStyle = 'rgba(255,220,140,0.85)';
    for (let wy = 160 - bh + 6; wy < 156; wy += 9) for (let wx = bx + 3; wx < bx + bw - 3; wx += 6) if (Math.random() < 0.45) g.fillRect(wx, wy, 3, 4);
  }
  const winTex = new THREE.CanvasTexture(c); winTex.colorSpace = THREE.SRGBColorSpace;
  const win = mesh(new THREE.PlaneGeometry(1.8, 1.15), new THREE.MeshBasicMaterial({ map: winTex }));
  win.position.set(-1.1, 1.75, -2.585); scene.add(win);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.5, roughness: 0.4 });
  [[0, 0.6, 1.9, 0.05], [0, -0.6, 1.9, 0.05], [-0.93, 0, 0.05, 1.25], [0.93, 0, 0.05, 1.25], [0, 0, 0.04, 1.2]].forEach(([fx, fy, fw, fh]) => {
    const f = mesh(new THREE.BoxGeometry(fw, fh, 0.04), frameMat); f.position.set(-1.1 + fx, 1.75 + fy, -2.57); scene.add(f);
  });

  // 화이트보드
  const wb = mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshStandardMaterial({ map: whiteboardTexture(), roughness: 0.3 }));
  wb.position.set(1.3, 1.6, -2.58); scene.add(wb);
  const wbf = mesh(new THREE.BoxGeometry(1.46, 0.76, 0.02), frameMat); wbf.position.set(1.3, 1.6, -2.595); scene.add(wbf);

  // 벽시계 (오후 6시)
  const cc = document.createElement('canvas'); cc.width = cc.height = 128;
  const cg = cc.getContext('2d');
  cg.fillStyle = '#fff'; cg.beginPath(); cg.arc(64, 64, 60, 0, 7); cg.fill();
  cg.lineWidth = 6; cg.strokeStyle = '#222'; cg.stroke();
  cg.lineCap = 'round';
  cg.beginPath(); cg.moveTo(64, 64); cg.lineTo(64, 100); cg.lineWidth = 6; cg.stroke(); // 시침 6시
  cg.beginPath(); cg.moveTo(64, 64); cg.lineTo(64, 16); cg.lineWidth = 4; cg.stroke(); // 분침 12
  const clockTex = new THREE.CanvasTexture(cc); clockTex.colorSpace = THREE.SRGBColorSpace;
  const clock = mesh(new THREE.CircleGeometry(0.18, 24), new THREE.MeshBasicMaterial({ map: clockTex }));
  clock.position.set(-2.585, 2.2, -0.6); clock.rotation.y = Math.PI / 2; scene.add(clock);

  return surfaces;
}
