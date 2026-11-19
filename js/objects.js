// 부술 수 있는 물건: 공통 클래스 + 18종 데이터 정의
// 상태: 0 정상 → 1 균열 → 2 심각한 파손 → 3 완전 파괴
import * as THREE from 'three';
import { woodTexture, keyboardTexture, whiteboardTexture, bookTexture, canTexture, ScreenCanvas } from './textures.js';
import { Platform } from './effects.js';

const rand = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

// ---------------- 재질 ----------------
let M = null;
export function mats() {
  if (M) return M;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M = {
    wood: std({ map: woodTexture('#9a7650'), roughness: 0.62 }),
    darkWood: std({ map: woodTexture('#5a3a22'), roughness: 0.5 }),
    metal: std({ color: 0x4c535c, metalness: 0.7, roughness: 0.35 }),
    metalGray: std({ color: 0x8a9097, metalness: 0.5, roughness: 0.45 }),
    chrome: std({ color: 0xb8bec6, metalness: 0.9, roughness: 0.22 }),
    alu: std({ color: 0xc4c8cc, metalness: 0.7, roughness: 0.3 }),
    gold: std({ color: 0xd4a73a, metalness: 0.9, roughness: 0.25 }),
    darkPlastic: std({ color: 0x1b1e23, roughness: 0.42 }),
    grayPlastic: std({ color: 0x8b9198, roughness: 0.6 }),
    lightPlastic: std({ color: 0xc9ccd0, roughness: 0.55 }),
    white: std({ color: 0xf2f2ee, roughness: 0.45 }),
    copier: std({ color: 0xe4e5e0, roughness: 0.55 }),
    copierDark: std({ color: 0x3a3e45, roughness: 0.5 }),
    fabric: std({ color: 0x2c3442, roughness: 0.95 }),
    fabricBlue: std({ color: 0x5d7a99, roughness: 0.95 }),
    leather: std({ color: 0x1a1412, roughness: 0.45 }),
    leatherBrown: std({ color: 0x5b3624, roughness: 0.5 }),
    terracotta: std({ color: 0xb5603a, roughness: 0.8 }),
    leaf: std({ color: 0x2f7d3a, roughness: 0.8, flatShading: true }),
    stone: std({ color: 0x9a9da0, roughness: 0.35 }),
    red: std({ color: 0xc8202a, roughness: 0.4 }),
    accent: std({ color: 0x3a8cff, roughness: 0.3, emissive: 0x1450c0, emissiveIntensity: 0.9 }),
    paper: std({ color: 0xfbfbf8, roughness: 0.95 }),
    keyboard: std({ map: keyboardTexture(), roughness: 0.5 }),
    books: std({ map: bookTexture(), roughness: 0.8 }),
    cans: new THREE.MeshBasicMaterial({ map: canTexture() }),
    glass: std({ color: 0xcfe8f5, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false }),
    water: std({ color: 0x7fc4ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6 }),
    laptopScreen: std({ color: 0x223a5e, emissive: 0x1b3f7a, emissiveIntensity: 0.6, roughness: 0.2 }),
    wb: [0, 1, 2].map(i => std({ map: whiteboardTexture(i), roughness: 0.3 })),
  };
  return M;
}

// ---------------- 지오메트리 캐시 (같은 크기는 공유) ----------------
const geoCache = new Map();
function geo(g, s) {
  const key = g + ':' + s.join(',');
  let gm = geoCache.get(key);
  if (!gm) {
    if (g === 'box') gm = new THREE.BoxGeometry(s[0], s[1], s[2]);
    else if (g === 'cyl') gm = new THREE.CylinderGeometry(s[0], s[1], s[2], s[3] || 12);
    else if (g === 'ico') gm = new THREE.IcosahedronGeometry(s[0], 0);
    else if (g === 'plane') gm = new THREE.PlaneGeometry(s[0], s[1]);
    gm.userData.shared = true;
    gm.computeBoundingBox();
    geoCache.set(key, gm);
  }
  return gm;
}

const SHARD_COLORS = {
  wood: [0x8a6440, 0xb08a5c, 0x6e4e30],
  metal: [0x5d646d, 0x9aa3ad, 0x3f454c],
  glass: [0xcfe9ff, 0xffffff, 0x9fd0ff],
  paper: [0xffffff, 0xf3f3ee],
  leaf: [0x2f7d3a, 0x3f9a4a, 0x235e2b],
};

// ------------------------------------------------------------------
export class Breakable {
  constructor(env, spec, opt = {}) {
    this.env = env;
    this.spec = spec;
    this.type = spec.id;
    this.name = spec.name;
    this.maxHP = spec.hp;
    this.hp = spec.hp;
    this.destroyBonus = spec.bonus;
    this.mainKind = spec.kind || 'plastic';
    this.group = new THREE.Group();
    this.groups = {};
    this.parts = [];
    this.decals = [];
    this.stage = 0;
    this.destroyed = false;
    this.baseRotY = 0;
    this.wobble = { amp: 0, t: 0, ax: 1, az: 0 };
    this.tilt = { x: 0, z: 0, tx: 0, tz: 0 };
    this.support = null;
    this.fallVy = 0;
    this.landed = false;
    this.disposables = [];
    this.screen = null;
    this.screenPart = null;
    this.headTarget = null;
    this.collider = null;
    this.center = new THREE.Vector3();
    this.zone = null;
  }

  addPart(m, o, parent) {
    const p = { mesh: m, detach: o.d ?? 3, kind: o.k || this.mainKind, special: o.sp || null, power: o.pw ?? 1, big: !!o.big, detached: false };
    m.userData.owner = this;
    m.userData.part = p;
    m.userData.bigPart = p.big;
    m.castShadow = p.big;
    m.receiveShadow = true;
    parent.add(m);
    this.parts.push(p);
    return p;
  }

  attachedMeshes(out) { for (const p of this.parts) if (!p.detached) out.push(p.mesh); }

  stageFromHP() {
    if (this.hp <= 0) return 3;
    const r = this.hp / this.maxHP;
    if (r <= 0.42) return 2;
    if (r <= 0.8) return 1;
    return 0;
  }

  // hit: { object, point, face?, normal?(월드), uv? }
  // opts: { power, detachMul, quiet, scorch, fxScale }
  damage(dmg, hit, opts = {}) {
    if (this.destroyed) return null;
    const env = this.env;
    const power = opts.power ?? 1;
    this.detachMul = opts.detachMul ?? 1;
    const part = hit.object.userData.part;
    const prev = this.stage;
    this.hp = Math.max(0, this.hp - dmg);

    const nn = hit.normal ? hit.normal.clone()
      : hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize() : UP.clone();

    const local = this.group.worldToLocal(hit.point.clone());
    this.wobble.ax = local.z >= 0 ? -1 : 1;
    this.wobble.az = local.x >= 0 ? 1 : -1;
    this.wobble.amp = Math.min(0.14, this.wobble.amp + 0.03 + this.stage * 0.012) * Math.min(1.6, power);
    this.wobble.t = 0;

    const q = env.quality();
    const fxs = (opts.fxScale ?? 1) * q.fxScale;
    if (opts.scorch) {
      env.fx.spawnShards(hit.point, nn, [0xffd27a, 0xff7a2f, 0xffffff], Math.max(1, Math.round(2 * fxs)), 2.2);
      if (Math.random() < 0.35) env.fx.addDecal(hit.object, hit.point, nn, 0.06 + Math.random() * 0.05, this, true);
    } else {
      const count = Math.round((4 + this.stage * 3) * fxs * Math.min(2, power));
      env.fx.spawnShards(hit.point, nn, this.shardColor(part), count, 2.4 * Math.min(2, power), part.kind === 'glass');
      env.fx.ring(hit.point, nn, part.kind === 'glass' ? 0xbfe6ff : 0xffd28a, 0.3 * Math.min(2, power));
      env.fx.flash(hit.point, 5 * power);
      if (!opts.quiet) env.sfx.hit(part.kind, Math.min(1.3, power));
      this.onHitFx(hit, part, nn);
    }

    const ns = this.stageFromHP();
    for (let s = prev + 1; s <= ns; s++) this.enterStage(s, hit.point.clone(), opts.quiet);
    return { prev, stage: ns, destroyed: ns === 3 };
  }

  onHitFx(hit, part, nn) {
    const env = this.env, spec = this.spec;
    if (part === this.screenPart && hit.uv) this.screen.crack(hit.uv.x, hit.uv.y, 0.6 + this.stage * 0.55);
    else if ((part.kind !== 'glass' || spec.decalOnGlass) && part.kind !== 'paper' && part.kind !== 'leaf') {
      env.fx.addDecal(hit.object, hit.point, nn, 0.1 + this.stage * 0.05 + Math.random() * 0.05, this);
      if (this.screen && this.stage >= 1 && !this.screenPart.detached) this.screen.crack(rand(0.1, 0.9), rand(0.1, 0.9), 0.5);
    }
    if (spec.paperOnHit) { env.fx.spawnPaper(hit.point, 1 + this.stage, 1.3); if (Math.random() < 0.4) env.sfx.paper(); }
  }

  enterStage(s, origin, quiet) {
    const env = this.env, spec = this.spec;
    this.stage = s;
    if (s === 3) this.destroyed = true;
    for (const p of this.parts) {
      if (!p.detached && (p.detach === s || s === 3)) this.detachPart(p, origin, s);
    }
    if (s === 1) { this.tilt.tx = rand(-0.025, 0.025); this.tilt.tz = rand(-0.025, 0.025); if (!quiet) env.sfx.crack(); }
    if (s === 2) { this.tilt.tx = rand(-0.06, 0.06); this.tilt.tz = rand(-0.06, 0.06); if (!quiet) env.sfx.breakPart(this.mainKind); }
    if (s === 3 && !quiet) env.sfx.destroy(this.mainKind);
    if (this.screen) {
      if (s === 1) this.screen.crack(rand(0.3, 0.7), rand(0.3, 0.7), 1.0);
      if (s === 2) {
        this.screen.glitch();
        if (this.headTarget) { this.headTarget.x = rand(0.25, 0.4); this.headTarget.z = rand(-0.18, 0.18); }
        const wp = this.screenPart.mesh.getWorldPosition(new THREE.Vector3());
        env.fx.spawnShards(wp, UP, [0xfff2a0, 0xffb84d, 0xffffff], Math.round(10 * env.quality().fxScale), 3);
      }
    }
    if (spec.paperStage && spec.paperStage[s]) {
      const top = this.group.localToWorld(new THREE.Vector3(0, spec.paperY || 0.9, 0));
      env.fx.spawnPaper(top, Math.round(spec.paperStage[s] * env.quality().fxScale), s === 3 ? 2.8 : 2.0);
      env.sfx.paper();
    }
    if (s === 3 && this.platform) env.fx.wakeAll();
    env.markDirty();
  }

  // 도끼처럼 부품을 직접 뜯어낼 때
  pryOff(part, origin) {
    if (part.detached || part.big) return false;
    this.detachMul = 1.3;
    this.detachPart(part, origin, 2);
    this.env.markDirty();
    return true;
  }

  detachPart(p, origin, s) {
    const env = this.env;
    const fxs = env.quality().fxScale;
    p.detached = true;
    const m = p.mesh;
    m.updateMatrixWorld(true);
    const wp = m.getWorldPosition(new THREE.Vector3());
    const sp = p.special;
    if (sp === 'shatter' || sp === 'shatterCans') {
      const bb = m.geometry.boundingBox;
      const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
      const nrm = new THREE.Vector3(0, 0, 1).transformDirection(m.matrixWorld);
      const n = Math.round(Math.min(90, 30 + w * h * 14) * fxs);
      for (let i = 0; i < n; i++) {
        const pt = new THREE.Vector3(rand(bb.min.x, bb.max.x), rand(bb.min.y, bb.max.y), 0).applyMatrix4(m.matrixWorld);
        env.fx.spawnShards(pt, nrm, SHARD_COLORS.glass, 1, 2.6, true);
      }
      if (w * h > 1) env.sfx.destroy('glass');
      if (sp === 'shatterCans') env.fx.spawnShards(wp, nrm, [0xd62828, 0xf77f00, 0x2a9d8f, 0x457b9d, 0xe9c46a], Math.round(24 * fxs), 3);
      m.parent && m.parent.remove(m);
      return;
    }
    if (sp === 'paper') {
      env.fx.spawnPaper(wp, Math.round(12 * fxs), 1.8);
      env.sfx.paper();
      m.parent && m.parent.remove(m);
      return;
    }
    if (sp === 'water') {
      env.fx.spawnShards(wp, UP, [0x7fc4ff, 0xbfe6ff, 0xffffff, 0x4aa3ff], Math.round(50 * fxs), 3.2, true);
      env.sfx.water();
      m.parent && m.parent.remove(m);
      return;
    }
    if (sp === 'leaves') {
      env.fx.spawnShards(wp, UP, SHARD_COLORS.leaf, Math.round(26 * fxs), 2.2);
      m.parent && m.parent.remove(m);
      return;
    }
    if (sp === 'soil') env.fx.spawnShards(wp, UP, [0x5a3b22, 0x3d2816, 0x7a5232], Math.round(30 * fxs), 2.4);
    if (sp === 'keys') env.fx.spawnShards(wp, UP, [0x2c3038, 0x16181c, 0xdddddd], Math.round(22 * fxs), 2.2);
    if (sp === 'cans') env.fx.spawnShards(wp, UP, [0xd62828, 0xf77f00, 0x2a9d8f, 0xe9c46a, 0xffffff], Math.round(18 * fxs), 2.6);
    if (sp === 'books') { env.fx.spawnShards(wp, UP, [0x8e2b2b, 0x2b4f8e, 0x2e7a4a, 0xc79a2b], Math.round(16 * fxs), 2.2); env.fx.spawnPaper(wp, Math.round(5 * fxs), 1.5); }
    const power = (s === 3 ? 3.2 : s === 2 ? 2.3 : 1.6) * p.power * (this.detachMul || 1);
    env.fx.detach(m, origin, power);
  }

  shardColor(part) {
    if (SHARD_COLORS[part.kind]) return SHARD_COLORS[part.kind];
    const mat = Array.isArray(part.mesh.material) ? part.mesh.material[0] : part.mesh.material;
    const c = mat.color ? mat.color.getHex() : 0x888888;
    return [c, c, 0x222222];
  }

  update(dt) {
    this.wobble.t += dt;
    this.wobble.amp *= Math.exp(-6.5 * dt);
    const w = this.wobble.amp * Math.sin(this.wobble.t * 34);
    const k = Math.min(1, dt * 8);
    this.tilt.x += (this.tilt.tx - this.tilt.x) * k;
    this.tilt.z += (this.tilt.tz - this.tilt.z) * k;
    this.group.rotation.set(this.tilt.x + w * this.wobble.ax, this.baseRotY, this.tilt.z + w * this.wobble.az);

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
    if (this.headTarget) {
      const h = this.groups.head, kk = Math.min(1, dt * 10);
      h.rotation.x += (this.headTarget.x - h.rotation.x) * kk;
      h.rotation.z += (this.headTarget.z - h.rotation.z) * kk;
    }
  }

  dispose() {
    this.env.scene.remove(this.group);
    this.group.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    for (const d of this.disposables) d.dispose();
  }
}

// ------------------------------------------------------------------
// 물건 정의: [모양, 크기, 위치, 재질, 옵션]
//  옵션 k=재질종류(소리·파편) d=분리단계 pw=날아가는 힘 big=큰부품 sp=특수 r=회전 grp=하위그룹 ch=장식
// ------------------------------------------------------------------
const P = (g, s, p, m, o = {}) => ({ g, s, p, m, ...o });

export const SPECS = {
  desk: {
    name: '책상', hp: 170, bonus: 800, kind: 'wood', platform: [0.7, 0.35, 0.74],
    parts: [
      P('box', [1.4, 0.04, 0.7], [0, 0.72, 0], 'wood', { k: 'wood', pw: 0.35, big: true }),
      P('box', [0.05, 0.7, 0.05], [-0.65, 0.35, 0.3], 'metal', { k: 'metal', d: 2, pw: 1.3 }),
      P('box', [0.05, 0.7, 0.05], [0.65, 0.35, 0.3], 'metal', { k: 'metal', pw: 1.3 }),
      P('box', [0.05, 0.7, 0.05], [-0.65, 0.35, -0.3], 'metal', { k: 'metal', pw: 1.3 }),
      P('box', [0.05, 0.7, 0.05], [0.65, 0.35, -0.3], 'metal', { k: 'metal', pw: 1.3 }),
      P('box', [1.24, 0.32, 0.02], [0, 0.5, -0.3], 'metal', { k: 'metal', pw: 0.9 }),
      P('box', [0.4, 0.52, 0.56], [0.42, 0.27, 0], 'grayPlastic', { pw: 0.8, big: true }),
      P('box', [0.38, 0.23, 0.02], [0.42, 0.4, 0.29], 'lightPlastic', { d: 2, pw: 1.2, ch: [P('box', [0.12, 0.015, 0.02], [0, 0.06, 0.015], 'chrome')] }),
      P('box', [0.38, 0.23, 0.02], [0.42, 0.14, 0.29], 'lightPlastic', { d: 2, pw: 1.2, ch: [P('box', [0.12, 0.015, 0.02], [0, 0.06, 0.015], 'chrome')] }),
      P('box', [0.44, 0.022, 0.15], [-0.08, 0.751, 0.17], 'keyboard', { d: 2, sp: 'keys', pw: 1.1 }),
      P('box', [0.06, 0.025, 0.1], [0.26, 0.752, 0.18], 'darkPlastic', { d: 2, pw: 1.4 }),
      P('cyl', [0.04, 0.035, 0.1, 12], [0.52, 0.79, 0.05], 'white', { d: 1, pw: 0.9 }),
    ],
  },
  bossDesk: {
    name: '대표님 책상', hp: 280, bonus: 1600, kind: 'wood', platform: [1.0, 0.45, 0.76],
    parts: [
      P('box', [2.0, 0.05, 0.9], [0, 0.735, 0], 'darkWood', { k: 'wood', pw: 0.35, big: true }),
      P('box', [0.05, 0.71, 0.86], [-0.97, 0.355, 0], 'darkWood', { k: 'wood', d: 2, pw: 1.0 }),
      P('box', [0.05, 0.71, 0.86], [0.97, 0.355, 0], 'darkWood', { k: 'wood', pw: 1.0 }),
      P('box', [1.88, 0.55, 0.03], [0, 0.43, -0.42], 'darkWood', { k: 'wood', pw: 0.8, big: true }),
      P('box', [0.45, 0.62, 0.7], [0.68, 0.33, 0], 'darkWood', { k: 'wood', pw: 0.7, big: true }),
      P('box', [0.42, 0.18, 0.02], [0.68, 0.53, 0.36], 'darkWood', { k: 'wood', d: 2, pw: 1.3, ch: [P('box', [0.14, 0.02, 0.02], [0, 0, 0.015], 'gold')] }),
      P('box', [0.42, 0.18, 0.02], [0.68, 0.32, 0.36], 'darkWood', { k: 'wood', d: 2, pw: 1.3, ch: [P('box', [0.14, 0.02, 0.02], [0, 0, 0.015], 'gold')] }),
      P('box', [0.42, 0.18, 0.02], [0.68, 0.11, 0.36], 'darkWood', { k: 'wood', d: 2, pw: 1.3, ch: [P('box', [0.14, 0.02, 0.02], [0, 0, 0.015], 'gold')] }),
      P('box', [0.32, 0.08, 0.05], [0, 0.8, -0.36], 'gold', { k: 'metal', d: 1, pw: 1.3 }),
      P('box', [0.44, 0.022, 0.15], [-0.2, 0.771, 0.22], 'keyboard', { d: 2, sp: 'keys' }),
      P('cyl', [0.04, 0.035, 0.1, 12], [0.6, 0.81, 0.15], 'white', { d: 1 }),
      P('box', [0.22, 0.04, 0.3], [-0.75, 0.78, 0.0], 'paper', { k: 'paper', d: 2, sp: 'paper' }),
    ],
  },
  monitor: {
    name: '모니터', hp: 90, bonus: 500, kind: 'glass', noCollide: true,
    groups: { head: [0, 0.28, -0.01] },
    parts: [
      P('box', [0.26, 0.018, 0.2], [0, 0.009, 0], 'darkPlastic', { k: 'plastic', pw: 0.8 }),
      P('box', [0.05, 0.3, 0.03], [0, 0.16, -0.03], 'chrome', { k: 'metal', pw: 1.1 }),
      P('box', [0.64, 0.4, 0.035], [0, 0.15, 0.01], 'darkPlastic', { k: 'plastic', big: true, grp: 'head' }),
      P('box', [0.3, 0.22, 0.04], [0, 0.15, -0.025], 'darkPlastic', { k: 'plastic', d: 2, pw: 1.3, grp: 'head' }),
      P('screen', [0.6, 0.36], [0, 0.155, 0.0285], null, { k: 'glass', sp: 'shatter', grp: 'head' }),
    ],
  },
  chair: {
    name: '의자', hp: 70, bonus: 300, kind: 'plastic',
    parts: [
      P('box', [0.62, 0.04, 0.07], [0, 0.06, 0], 'metal', { k: 'metal', pw: 1.2 }),
      P('box', [0.07, 0.04, 0.62], [0, 0.06, 0], 'metal', { k: 'metal', pw: 1.2 }),
      P('cyl', [0.03, 0.03, 0.36, 8], [0, 0.26, 0], 'chrome', { k: 'metal', pw: 1.3 }),
      P('box', [0.5, 0.08, 0.48], [0, 0.48, 0], 'fabric', { pw: 1.0, big: true }),
      P('box', [0.48, 0.58, 0.07], [0, 0.82, -0.22], 'fabric', { d: 2, pw: 1.4, r: [-0.08, 0, 0] }),
      P('box', [0.05, 0.04, 0.3], [-0.26, 0.64, 0], 'darkPlastic', { d: 2, pw: 1.5 }),
      P('box', [0.05, 0.04, 0.3], [0.26, 0.64, 0], 'darkPlastic', { d: 2, pw: 1.5 }),
    ],
  },
  bossChair: {
    name: '대표님 의자', hp: 110, bonus: 600, kind: 'plastic',
    parts: [
      P('box', [0.7, 0.04, 0.08], [0, 0.06, 0], 'chrome', { k: 'metal', pw: 1.2 }),
      P('box', [0.08, 0.04, 0.7], [0, 0.06, 0], 'chrome', { k: 'metal', pw: 1.2 }),
      P('cyl', [0.035, 0.035, 0.36, 8], [0, 0.26, 0], 'chrome', { k: 'metal', pw: 1.3 }),
      P('box', [0.58, 0.1, 0.55], [0, 0.49, 0], 'leather', { pw: 1.0, big: true }),
      P('box', [0.56, 0.85, 0.1], [0, 0.98, -0.25], 'leather', { d: 2, pw: 1.3, r: [-0.1, 0, 0] }),
      P('box', [0.07, 0.06, 0.4], [-0.3, 0.68, 0], 'leather', { d: 2, pw: 1.5 }),
      P('box', [0.07, 0.06, 0.4], [0.3, 0.68, 0], 'leather', { d: 2, pw: 1.5 }),
    ],
  },
  cabinet: {
    name: '서류 캐비닛', hp: 150, bonus: 700, kind: 'metal', paperStage: { 2: 10, 3: 24 }, paperY: 1.1,
    parts: [
      P('box', [0.47, 1.32, 0.6], [0, 0.66, 0], 'metalGray', { k: 'metal', pw: 0.6, big: true }),
      ...[0.18, 0.5, 0.82, 1.14].map(y => P('box', [0.43, 0.29, 0.02], [0, y, 0.305], 'lightPlastic', { k: 'metal', d: 2, pw: 1.5, ch: [P('box', [0.14, 0.025, 0.025], [0, 0.07, 0.015], 'chrome')] })),
    ],
  },
  copier: {
    name: '복사기', hp: 220, bonus: 1200, kind: 'plastic', paperOnHit: true, paperStage: { 2: 14, 3: 36 }, paperY: 0.85,
    parts: [
      P('box', [0.62, 0.42, 0.58], [0, 0.21, 0], 'grayPlastic', { pw: 0.6, big: true }),
      P('box', [0.58, 0.17, 0.02], [0, 0.31, 0.3], 'copier', { d: 2, pw: 1.2, ch: [P('box', [0.2, 0.02, 0.02], [0, 0.05, 0.012], 'copierDark')] }),
      P('box', [0.58, 0.17, 0.02], [0, 0.11, 0.3], 'copier', { d: 2, pw: 1.2, ch: [P('box', [0.2, 0.02, 0.02], [0, 0.05, 0.012], 'copierDark')] }),
      P('box', [0.6, 0.4, 0.56], [0, 0.62, 0], 'copier', { pw: 0.8, big: true }),
      P('box', [0.6, 0.04, 0.54], [0, 0.84, -0.01], 'copierDark', { d: 2, pw: 1.6 }),
      P('box', [0.24, 0.05, 0.12], [0.14, 0.85, 0.24], 'copierDark', { pw: 1.2, r: [-0.3, 0, 0], ch: [P('plane', [0.12, 0.06], [-0.03, 0.026, 0], 'accent', { r: [-Math.PI / 2, 0, 0] })] }),
      P('box', [0.28, 0.015, 0.26], [0.43, 0.66, 0], 'lightPlastic', { d: 2, pw: 1.4, r: [0, 0, 0.2] }),
      P('box', [0.2, 0.05, 0.25], [0.43, 0.69, 0], 'paper', { k: 'paper', d: 2, sp: 'paper', r: [0, 0, 0.2] }),
    ],
  },
  waterCooler: {
    name: '정수기', hp: 60, bonus: 400, kind: 'plastic',
    parts: [
      P('box', [0.32, 1.0, 0.32], [0, 0.5, 0], 'white', { pw: 0.8, big: true }),
      P('box', [0.1, 0.06, 0.05], [0, 0.75, 0.18], 'grayPlastic', { d: 2, pw: 1.5 }),
      P('cyl', [0.15, 0.15, 0.42, 14], [0, 1.22, 0], 'water', { k: 'glass', d: 2, sp: 'water' }),
    ],
  },
  plant: {
    name: '화분', hp: 40, bonus: 250, kind: 'plastic',
    parts: [
      P('cyl', [0.2, 0.15, 0.36, 12], [0, 0.18, 0], 'terracotta', { sp: 'soil', pw: 0.9, big: true }),
      P('cyl', [0.025, 0.03, 0.6, 6], [0, 0.65, 0], 'darkWood', { k: 'wood', d: 2, pw: 1.4 }),
      P('ico', [0.32], [0, 1.05, 0], 'leaf', { k: 'leaf', d: 2, sp: 'leaves' }),
      P('ico', [0.24], [0.12, 1.3, 0.05], 'leaf', { k: 'leaf', d: 2, sp: 'leaves' }),
    ],
  },
  partition: {
    name: '파티션', hp: 90, bonus: 350, kind: 'plastic',
    parts: [
      P('box', [1.4, 1.2, 0.05], [0, 0.62, 0], 'fabricBlue', { pw: 0.8, big: true }),
      P('box', [1.42, 0.04, 0.07], [0, 1.24, 0], 'alu', { k: 'metal', d: 2, pw: 1.4 }),
      P('box', [0.06, 0.04, 0.4], [-0.6, 0.02, 0], 'alu', { k: 'metal', pw: 1.2 }),
      P('box', [0.06, 0.04, 0.4], [0.6, 0.02, 0], 'alu', { k: 'metal', pw: 1.2 }),
    ],
  },
  glassWall: {
    name: '유리벽', hp: 60, bonus: 600, kind: 'glass', decalOnGlass: true,
    parts: [
      P('box', [2.0, 0.08, 0.1], [0, 2.36, 0], 'alu', { k: 'metal', pw: 0.8 }),
      P('box', [2.0, 0.08, 0.1], [0, 0.04, 0], 'alu', { k: 'metal', pw: 0.8 }),
      P('box', [1.96, 2.24, 0.025], [0, 1.2, 0], 'glass', { k: 'glass', sp: 'shatter' }),
    ],
  },
  meetingTable: {
    name: '회의 테이블', hp: 230, bonus: 900, kind: 'wood', platform: [1.5, 0.6, 0.76],
    parts: [
      P('box', [3.0, 0.05, 1.2], [0, 0.735, 0], 'darkWood', { k: 'wood', pw: 0.4, big: true }),
      P('box', [0.08, 0.7, 0.9], [-1.1, 0.35, 0], 'metal', { k: 'metal', pw: 0.9 }),
      P('box', [0.08, 0.7, 0.9], [1.1, 0.35, 0], 'metal', { k: 'metal', pw: 0.9 }),
      P('box', [0.4, 0.03, 0.15], [0, 0.775, 0], 'darkPlastic', { d: 2, pw: 1.4 }),
      P('box', [0.32, 0.02, 0.22], [-0.8, 0.77, 0.3], 'alu', { k: 'metal', d: 2, pw: 1.4 }),
      P('box', [0.32, 0.22, 0.01], [-0.8, 0.88, 0.19], 'laptopScreen', { k: 'glass', d: 1, pw: 1.5, r: [-0.25, 0, 0] }),
      P('box', [0.32, 0.02, 0.22], [0.8, 0.77, -0.3], 'alu', { k: 'metal', d: 2, pw: 1.4 }),
      P('box', [0.32, 0.22, 0.01], [0.8, 0.88, -0.19], 'laptopScreen', { k: 'glass', d: 1, pw: 1.5, r: [0.25, 0, 0] }),
      P('box', [0.22, 0.03, 0.3], [0.2, 0.775, 0.35], 'paper', { k: 'paper', d: 2, sp: 'paper' }),
    ],
  },
  tv: {
    name: '회의실 TV', hp: 90, bonus: 700, kind: 'glass',
    parts: [
      P('box', [0.5, 0.03, 0.35], [0, 0.015, 0], 'darkPlastic', { k: 'plastic', pw: 0.8 }),
      P('box', [0.08, 1.1, 0.06], [0, 0.58, -0.04], 'darkPlastic', { k: 'metal', pw: 1.0 }),
      P('box', [1.5, 0.86, 0.06], [0, 1.45, 0], 'darkPlastic', { k: 'plastic', big: true }),
      P('screen', [1.44, 0.8], [0, 1.45, 0.031], null, { k: 'glass', sp: 'shatter' }),
    ],
  },
  whiteboard: {
    name: '화이트보드', hp: 60, bonus: 300, kind: 'plastic',
    parts: [
      P('box', [0.04, 1.8, 0.04], [-0.78, 0.9, 0], 'alu', { k: 'metal', pw: 1.1 }),
      P('box', [0.04, 1.8, 0.04], [0.78, 0.9, 0], 'alu', { k: 'metal', pw: 1.1 }),
      P('box', [0.05, 0.04, 0.5], [-0.78, 0.02, 0], 'alu', { k: 'metal' }),
      P('box', [0.05, 0.04, 0.5], [0.78, 0.02, 0], 'alu', { k: 'metal' }),
      P('box', [1.5, 0.95, 0.03], [0, 1.3, 0], 'wb', { d: 2, pw: 1.2, big: true }),
      P('box', [1.4, 0.03, 0.08], [0, 0.81, 0.03], 'alu', { k: 'metal', d: 2, pw: 1.5 }),
    ],
  },
  fridge: {
    name: '냉장고', hp: 180, bonus: 900, kind: 'metal',
    parts: [
      P('box', [0.7, 1.75, 0.65], [0, 0.875, 0], 'white', { k: 'metal', pw: 0.5, big: true }),
      P('box', [0.68, 0.55, 0.05], [0, 1.45, 0.35], 'white', { k: 'metal', d: 2, pw: 1.3, sp: 'cans', ch: [P('box', [0.03, 0.3, 0.04], [0.28, 0, 0.04], 'chrome')] }),
      P('box', [0.68, 1.1, 0.05], [0, 0.6, 0.35], 'white', { k: 'metal', pw: 1.0, sp: 'cans', ch: [P('box', [0.03, 0.4, 0.04], [0.28, 0.3, 0.04], 'chrome')] }),
    ],
  },
  counter: {
    name: '탕비실 싱크대', hp: 200, bonus: 800, kind: 'wood', platform: [1.2, 0.3, 0.9],
    parts: [
      P('box', [2.4, 0.86, 0.6], [0, 0.43, 0], 'white', { k: 'wood', pw: 0.5, big: true }),
      P('box', [2.45, 0.04, 0.64], [0, 0.88, 0], 'stone', { k: 'metal', pw: 0.5 }),
      P('box', [0.76, 0.7, 0.02], [-0.8, 0.42, 0.31], 'lightPlastic', { d: 2, pw: 1.3 }),
      P('box', [0.76, 0.7, 0.02], [0, 0.42, 0.31], 'lightPlastic', { d: 2, pw: 1.3 }),
      P('box', [0.76, 0.7, 0.02], [0.8, 0.42, 0.31], 'lightPlastic', { d: 2, pw: 1.3 }),
    ],
  },
  coffeeMachine: {
    name: '커피머신', hp: 50, bonus: 400, kind: 'plastic', noCollide: true,
    parts: [
      P('box', [0.3, 0.42, 0.32], [0, 0.21, 0], 'darkPlastic', { pw: 0.9, big: true }),
      P('cyl', [0.06, 0.06, 0.25, 10], [-0.1, 0.3, -0.12], 'water', { k: 'glass', d: 2, sp: 'water' }),
      P('box', [0.2, 0.02, 0.12], [0, 0.04, 0.17], 'chrome', { k: 'metal', d: 2, pw: 1.4 }),
      P('cyl', [0.035, 0.03, 0.07, 10], [0, 0.085, 0.17], 'white', { d: 1, pw: 1.2 }),
    ],
  },
  vending: {
    name: '자판기', hp: 200, bonus: 1000, kind: 'metal',
    parts: [
      P('box', [0.95, 1.85, 0.75], [0, 0.925, 0], 'red', { k: 'metal', pw: 0.5, big: true, ch: [P('plane', [0.58, 1.18], [-0.1, 0.175, 0.377], 'cans')] }),
      P('box', [0.6, 1.2, 0.02], [-0.1, 1.1, 0.39], 'glass', { k: 'glass', d: 2, sp: 'shatterCans' }),
      P('box', [0.2, 0.4, 0.03], [0.33, 1.1, 0.39], 'darkPlastic', { d: 2, pw: 1.4 }),
    ],
  },
  bookshelf: {
    name: '책장', hp: 140, bonus: 600, kind: 'wood',
    parts: [
      P('box', [0.03, 1.9, 0.35], [-0.6, 0.95, 0], 'darkWood', { k: 'wood', pw: 1.0 }),
      P('box', [0.03, 1.9, 0.35], [0.6, 0.95, 0], 'darkWood', { k: 'wood', pw: 1.0 }),
      P('box', [1.2, 1.9, 0.02], [0, 0.95, -0.165], 'darkWood', { k: 'wood', pw: 0.6, big: true }),
      ...[0.02, 0.47, 0.92, 1.37, 1.88].map(y => P('box', [1.17, 0.03, 0.33], [0, y, 0], 'darkWood', { k: 'wood', pw: 1.1 })),
      ...[0.2, 0.65, 1.1, 1.55].map(y => P('box', [1.1, 0.34, 0.24], [0, y, 0.02], 'books', { k: 'paper', d: 2, pw: 1.5, sp: 'books' })),
    ],
  },
  sofa: {
    name: '소파', hp: 120, bonus: 500, kind: 'plastic',
    parts: [
      P('box', [1.8, 0.25, 0.8], [0, 0.2, 0], 'leatherBrown', { pw: 0.6, big: true }),
      P('box', [0.85, 0.15, 0.6], [-0.44, 0.4, 0.05], 'leatherBrown', { d: 2, pw: 1.6 }),
      P('box', [0.85, 0.15, 0.6], [0.44, 0.4, 0.05], 'leatherBrown', { d: 2, pw: 1.6 }),
      P('box', [1.8, 0.5, 0.18], [0, 0.55, -0.31], 'leatherBrown', { pw: 0.8 }),
      P('box', [0.15, 0.35, 0.8], [-0.98, 0.38, 0], 'leatherBrown', { d: 2, pw: 1.3 }),
      P('box', [0.15, 0.35, 0.8], [0.98, 0.38, 0], 'leatherBrown', { d: 2, pw: 1.3 }),
    ],
  },
};
for (const id in SPECS) SPECS[id].id = id;

// ------------------------------------------------------------------
// 생성
// opts: { rot, screen: 'excel'|'mail'|..., wb: 0..2, on: 받침 Breakable, offset:[x,z] }
// ------------------------------------------------------------------
export function build(env, id, x, z, opts = {}) {
  const spec = SPECS[id];
  const m = mats();
  const b = new Breakable(env, spec);
  const rot = opts.rot || 0;
  if (opts.on) {
    const sup = opts.on;
    sup.group.updateMatrixWorld(true);
    const off = opts.offset || [0, 0];
    b.group.position.copy(new THREE.Vector3(off[0], sup.spec.platform[2], off[1]).applyMatrix4(sup.group.matrixWorld));
    b.baseRotY = sup.baseRotY + rot;
    b.support = sup;
  } else {
    b.group.position.set(x, 0, z);
    b.baseRotY = rot;
  }
  b.group.rotation.y = b.baseRotY;

  if (spec.groups) {
    for (const k in spec.groups) {
      const g = new THREE.Group(); g.position.fromArray(spec.groups[k]);
      b.group.add(g); b.groups[k] = g;
    }
    if (b.groups.head) b.headTarget = { x: 0, z: 0 };
  }

  const makeMesh = (d) => {
    let mesh;
    if (d.g === 'screen') {
      const sc = new ScreenCanvas(opts.screen || 'excel');
      const mat = new THREE.MeshBasicMaterial({ map: sc.texture, toneMapped: false });
      b.disposables.push(sc, mat);
      mesh = new THREE.Mesh(geo('plane', d.s), mat);
      b.screen = sc;
    } else {
      let mat = m[d.m];
      if (d.m === 'wb') mat = m.wb[(opts.wb || 0) % 3];
      mesh = new THREE.Mesh(geo(d.g, d.s), mat);
    }
    mesh.position.fromArray(d.p);
    if (d.r) mesh.rotation.set(d.r[0], d.r[1], d.r[2]);
    if (d.ch) for (const c of d.ch) mesh.add(makeMesh(c));
    return mesh;
  };

  for (const d of spec.parts) {
    const mesh = makeMesh(d);
    const parent = d.grp ? b.groups[d.grp] : b.group;
    const p = b.addPart(mesh, d, parent);
    if (d.g === 'screen') b.screenPart = p;
  }

  env.scene.add(b.group);
  b.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(b.group);
  box.getCenter(b.center);
  if (!spec.noCollide && !opts.on) {
    b.collider = { minX: box.min.x + 0.04, maxX: box.max.x - 0.04, minZ: box.min.z + 0.04, maxZ: box.max.z - 0.04, obj: b };
  }
  if (spec.platform) {
    const [hx, hz, y] = spec.platform;
    b.platform = new Platform(b.group, hx, hz, y, () => !b.destroyed);
    env.fx.platforms.push(b.platform);
  }
  return b;
}
