// 퇴근하고 다 부숴! (OFFICE SMASH) — 1인칭 확장판 메인
import * as THREE from 'three';
import { initAudio, sfx, vibrate, setMuted, isMuted } from './audio.js';
import { makeCrackTextures, makeScorchTextures } from './textures.js';
import { Effects } from './effects.js';
import { buildStatic, buildObjects, ZONES, zoneAt, BOUNDS } from './world.js';
import { Player } from './player.js';
import { TOOLS, ViewModel } from './tools.js';

// ================= 설정 =================
const CHALLENGE_TIME = 60;
const DESTROY_TIME_BONUS = 1.5;   // 물건 하나 완전 파괴 시 추가 시간(초)
const COMBO_WINDOW = 1.5;
const TAP_MOVE_PX = 12;
const TAP_MAX_MS = 550;

const QUALITY = {
  high:   { name: '높음', pr: 1.75, shadows: true,  shards: 260, glass: 180, paper: 120, debris: 90, decals: 12, light: true,  fxScale: 1.0 },
  medium: { name: '중간', pr: 1.4,  shadows: false, shards: 160, glass: 110, paper: 70,  debris: 60, decals: 8,  light: true,  fxScale: 0.75 },
  low:    { name: '낮음', pr: 1,    shadows: false, shards: 70,  glass: 50,  paper: 36,  debris: 34, decals: 5,  light: false, fxScale: 0.5 },
};
const LEVELS = ['low', 'medium', 'high'];

const store = {
  get(k, d) { try { const v = localStorage.getItem('officeSmash.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('officeSmash.' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } },
};

const isTouchDevice = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
function guessLevel() {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (isTouchDevice && window.innerWidth < 900);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (!mobile) return cores >= 6 ? 'high' : 'medium';
  if (cores <= 4 || mem <= 3) return 'low';
  return 'medium';
}
let qualityMode = store.get('quality', 'auto');
let level = qualityMode === 'auto' ? guessLevel() : qualityMode;
const Q = () => QUALITY[level];

// ================= 렌더러 / 씬 =================
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: level !== 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q().pr));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c22);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xfff6e8, 0x464a52, 1.35));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.5);
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -7; sun.shadow.camera.right = 7;
sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 14;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

const { surfaces, colliders: staticColliders } = buildStatic(scene);
const fx = new Effects(scene, Q(), BOUNDS);
fx.setDecalTextures(makeCrackTextures(4), makeScorchTextures(2));
const vm = new ViewModel();
const player = new Player(camera);

function applyRendererQuality() {
  const q = Q();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
  sun.castShadow = q.shadows;
  resize();
}

// ================= 게임 상태 =================
const G = {
  state: 'menu', mode: 'challenge',
  score: 0, timeLeft: CHALLENGE_TIME,
  combo: 0, maxCombo: 0, lastHit: -99, lastComboBump: -99,
  destroyedCount: 0, wave: 1,
  objects: [], colliders: [], hittables: [], dirty: true,
  unlocked: new Set(['fist', 'hammer']),
  tool: TOOLS[1],
  bombs: [],
  clock: 0, lastTick: 0, waveClearTimer: -1,
  zone: null, farToastAt: -9,
};

const env = { scene, fx, sfx, quality: Q, markDirty: () => { G.dirty = true; } };

function buildWave() {
  for (const o of G.objects) o.dispose();
  for (const b of G.bombs) scene.remove(b.mesh);
  G.bombs = [];
  fx.clear();
  G.objects = buildObjects(env);
  G.colliders = staticColliders.concat(G.objects.filter(o => o.collider).map(o => o.collider));
  G.dirty = true;
  G.waveClearTimer = -1;
}

function refreshHittables() {
  G.hittables.length = 0;
  for (const o of G.objects) if (!o.destroyed) o.attachedMeshes(G.hittables);
  G.dirty = false;
}

// ================= UI =================
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), score: $('hud-score'), time: $('hud-time'), timeBox: $('hud-time-box'), rate: $('hud-rate'),
  zone: $('hud-zone'), combo: $('combo'), toast: $('toast'), popups: $('popups'), flash: $('flash'),
  toolbar: $('toolbar'), restore: $('btn-restore'), sound: $('btn-sound'),
  menu: $('menu'), howto: $('howto'), pause: $('pause'), over: $('gameover'),
  bestChallenge: $('best-challenge'), quality: $('btn-quality'),
  joy: $('joy'), joyKnob: $('joy-knob'), joyHint: $('joy-hint'), minimap: $('minimap'), toolInfo: $('tool-info'),
};
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

let toastTimer = 0;
function toast(msg, dur = 1.6) {
  ui.toast.textContent = msg;
  ui.toast.classList.remove('show'); void ui.toast.offsetWidth; ui.toast.classList.add('show');
  toastTimer = dur;
}

const popPool = [];
for (let i = 0; i < 16; i++) { const d = document.createElement('div'); d.className = 'pop'; ui.popups.appendChild(d); popPool.push(d); }
let popCursor = 0;
const _proj = new THREE.Vector3();
function popup(worldPos, text, cls = '') {
  _proj.copy(worldPos).project(camera);
  if (_proj.z > 1 || _proj.z < -1) return;
  const d = popPool[popCursor]; popCursor = (popCursor + 1) % popPool.length;
  d.textContent = text; d.className = 'pop';
  d.style.left = ((_proj.x * 0.5 + 0.5) * window.innerWidth) + 'px';
  d.style.top = ((-_proj.y * 0.5 + 0.5) * window.innerHeight) + 'px';
  void d.offsetWidth;
  d.className = 'pop go ' + cls;
}
const clearPopups = () => popPool.forEach(d => { d.className = 'pop'; });

function screenFlash(strength = 0.35, color = '#fff') {
  ui.flash.style.background = color;
  ui.flash.style.transition = 'none'; ui.flash.style.opacity = strength;
  void ui.flash.offsetWidth;
  ui.flash.style.transition = 'opacity 0.4s ease-out'; ui.flash.style.opacity = 0;
}

// ---------- 도구 바 ----------
function buildToolbar() {
  ui.toolbar.innerHTML = '';
  TOOLS.forEach((t, i) => {
    const b = document.createElement('button');
    const open = G.unlocked.has(t.id);
    b.className = 'tool' + (t === G.tool ? ' active' : '') + (open ? '' : ' locked');
    b.dataset.id = t.id;
    b.innerHTML = `<span class="ti">${t.icon}</span><span class="tn">${t.name}</span>` + (open ? '' : `<span class="tl">${t.unlock >= 1000 ? (t.unlock / 1000) + '천' : t.unlock}</span>`);
    b.addEventListener('click', (e) => { e.stopPropagation(); initAudio(); selectTool(t); });
    ui.toolbar.appendChild(b);
  });
}
function selectTool(t) {
  if (!G.unlocked.has(t.id)) {
    sfx.locked();
    toast(`🔒 ${t.name}: ${fmt(t.unlock)}점 달성 시 해제`, 1.8);
    return;
  }
  if (G.tool !== t) { sfx.ui(); G.tool = t; vm.setTool(t); laser.held = false; }
  ui.toolInfo.textContent = `${t.icon} ${t.name} · ${t.desc}`;
  ui.toolInfo.classList.remove('show'); void ui.toolInfo.offsetWidth; ui.toolInfo.classList.add('show');
  for (const el of ui.toolbar.children) el.classList.toggle('active', el.dataset.id === t.id);
}
function checkUnlocks() {
  if (G.mode !== 'challenge') return;
  for (const t of TOOLS) {
    if (!G.unlocked.has(t.id) && G.score >= t.unlock) {
      G.unlocked.add(t.id);
      sfx.unlock();
      toast(`🔓 ${t.icon} ${t.name} 해제! 아래에서 선택하세요`, 2);
      buildToolbar();
      const el = ui.toolbar.querySelector(`[data-id="${t.id}"]`);
      if (el) el.classList.add('new');
    }
  }
}

// ---------- HUD ----------
function zoneStats() {
  const st = {};
  for (const z of ZONES) st[z.id] = { total: 0, dmg: 0, zone: z };
  for (const o of G.objects) {
    if (!o.zone) continue;
    const s = st[o.zone.id]; s.total += o.maxHP; s.dmg += o.maxHP - o.hp;
  }
  return st;
}
function updateHUD() {
  ui.score.textContent = fmt(G.score);
  if (G.mode === 'challenge') {
    const t = Math.max(0, G.timeLeft);
    ui.time.textContent = t < 10 ? t.toFixed(1) : Math.ceil(t);
    ui.timeBox.classList.toggle('warn', t <= 10);
  } else ui.time.textContent = '∞';
  let total = 0, dmg = 0;
  for (const o of G.objects) { total += o.maxHP; dmg += o.maxHP - o.hp; }
  ui.rate.textContent = (total ? Math.round(dmg / total * 100) : 0) + '%';
  const z = zoneAt(player.pos.x, player.pos.z);
  if (z) {
    const s = zoneStats()[z.id];
    ui.zone.innerHTML = `<i style="background:${z.color}"></i>${z.name}` + (s.total ? ` <b>${Math.round(s.dmg / s.total * 100)}%</b>` : '');
    if (G.zone !== z) {
      G.zone = z;
      ui.zone.classList.remove('bump'); void ui.zone.offsetWidth; ui.zone.classList.add('bump');
    }
  }
}

function showCombo() {
  if (G.combo < 2) { ui.combo.classList.remove('show'); return; }
  const mult = comboMult();
  ui.combo.innerHTML = `<b>${G.combo}</b> COMBO` + (mult > 1 ? ` <i>x${mult.toFixed(2).replace(/\.?0+$/, '')}</i>` : '');
  ui.combo.classList.remove('show', 'bump'); void ui.combo.offsetWidth;
  ui.combo.classList.add('show', 'bump');
}
const comboMult = () => 1 + Math.min(2, Math.floor(G.combo / 5) * 0.25);
function bumpCombo() {
  G.combo = G.clock - G.lastHit <= COMBO_WINDOW ? G.combo + 1 : 1;
  G.lastHit = G.clock;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  if (G.combo >= 2) { showCombo(); if (G.combo % 5 === 0) sfx.combo(Math.min(10, G.combo / 5)); }
}

// ---------- 미니맵 ----------
const mm = ui.minimap.getContext('2d');
function drawMinimap() {
  const W = ui.minimap.width, H = ui.minimap.height;
  const sx = W / 26, sz = H / 18;
  const X = (x) => (x + 13) * sx, Y = (z) => (z + 9) * sz;
  mm.clearRect(0, 0, W, H);
  mm.fillStyle = 'rgba(15,17,22,0.8)'; mm.fillRect(0, 0, W, H);
  for (const z of ZONES) {
    if (z.id === 'hall') continue;
    mm.fillStyle = z.color + '55';
    mm.fillRect(X(z.x0) + 1, Y(z.z0) + 1, (z.x1 - z.x0) * sx - 2, (z.z1 - z.z0) * sz - 2);
  }
  mm.fillStyle = '#cfd3da';
  for (const o of G.objects) {
    if (o.destroyed || o.support) continue;
    mm.fillRect(X(o.center.x) - 1.5, Y(o.center.z) - 1.5, 3, 3);
  }
  // 플레이어 (보는 방향 화살표)
  const px = X(player.pos.x), py = Y(player.pos.z);
  mm.save(); mm.translate(px, py); mm.rotate(-player.yaw);
  mm.fillStyle = '#ff5a3c';
  mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(4.5, 4); mm.lineTo(-4.5, 4); mm.closePath(); mm.fill();
  mm.restore();
}

// ================= 슬로모션 / 흔들림 =================
const slow = { t: 0, scale: 1, timeScale: 1 };
function slowmo(dur = 0.45, scale = 0.25) { if (dur > slow.t) { slow.t = dur; slow.scale = scale; } }
let shake = 0;
const addShake = (s) => { shake = Math.min(0.2, shake + s); };

// ================= 레이캐스트 =================
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function rayFrom(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function pick(maxDist) {
  if (G.dirty) refreshHittables();
  raycaster.far = maxDist;
  const a = raycaster.intersectObjects(G.hittables, false)[0];
  const b = raycaster.intersectObjects(surfaces, false)[0];
  if (a && (!b || a.distance <= b.distance)) return { hit: a, obj: true };
  if (b) return { hit: b, obj: false };
  return null;
}
const worldNormal = (h) => h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize() : new THREE.Vector3(0, 1, 0);
const randRange = (r) => r[0] + Math.random() * (r[1] - r[0]);

// ================= 점수 처리 =================
function damageObject(obj, dmg, hit, opts) {
  const res = obj.damage(dmg, hit, opts);
  if (!res) return 0;
  const mult = comboMult();
  let gained = Math.round(dmg * 2.5 * mult);
  for (let s = res.prev + 1; s <= res.stage; s++) {
    if (s === 1) gained += Math.round(50 * mult);
    if (s === 2) gained += Math.round(150 * mult);
    if (s === 3) gained += Math.round(obj.destroyBonus * mult);
  }
  if (res.destroyed) onDestroyed(obj, Math.round(obj.destroyBonus * mult));
  else if (res.stage > res.prev) { addShake(0.035); vibrate(30); }
  G.score += gained;
  checkUnlocks();
  return gained;
}

function onDestroyed(obj, bonus) {
  G.destroyedCount++;
  let label = `${obj.name} 박살! +${fmt(bonus)}`;
  if (G.mode === 'challenge') { G.timeLeft += DESTROY_TIME_BONUS; label += ` ⏱+${DESTROY_TIME_BONUS}초`; }
  popup(obj.center.clone().setY(obj.center.y + 0.6), label, 'big');
  slowmo(0.45, 0.25);
  addShake(0.08);
  screenFlash(0.22);
  vibrate([40, 30, 80]);
  if (G.objects.every(o => o.destroyed)) {
    if (G.mode === 'challenge') {
      G.score += 5000; G.waveClearTimer = 2;
      sfx.clear(); toast('사무실 전체 박살! +5,000 새 사무실 입고', 2);
    } else { toast('전부 박살! 🔧 복구를 눌러 주세요', 2.4); ui.restore.classList.add('pulse'); }
  }
}

// ================= 공격 =================
let pendingAttack = null;
function requestAttack(x, y) {
  if (G.state !== 'playing') return;
  const t = G.tool;
  if (t.auto) return;
  if (!vm.ready) { pendingAttack = { x, y }; return; }
  pendingAttack = null;
  if (t.style === 'throw') {
    sfx.throwBomb();
    vm.attack(() => throwBomb(x, y));
  } else {
    sfx.swing(t.id === 'mace' || t.id === 'bat');
    vm.attack(() => resolveMelee(t, x, y));
  }
}

function resolveMelee(tool, x, y) {
  if (G.state !== 'playing') return;
  rayFrom(x, y);
  const r = pick(30);
  if (r && r.obj && r.hit.distance <= tool.reach + 0.2) return hitObject(tool, r.hit);
  if (r && !r.obj && r.hit.distance <= tool.reach) {
    const n = worldNormal(r.hit), pt = r.hit.point.clone();
    sfx.thud(); fx.ring(pt, n, 0xcccccc, 0.25); addShake(0.012); vibrate(10);
    fx.spawnShards(pt, n, [0x555a62, 0x9a9690, 0xd9d4c7], 4, 1.4);
    if (tool.power >= 1.2) fx.addDecal(r.hit.object, pt, n, 0.18 * tool.power, null, false);
    return;
  }
  if (r && r.obj && G.clock - G.farToastAt > 1.5) { G.farToastAt = G.clock; toast('조금 더 가까이!', 0.9); }
}

function hitObject(tool, h) {
  const obj = h.object.userData.owner, part = h.object.userData.part;
  if (!obj || obj.destroyed || !part || part.detached) return;
  bumpCombo();
  let dmg = randRange(tool.dmg);
  let label = '';
  if (tool.id === 'fist' && G.combo >= 10) { dmg *= 1.5; label = '분노의 주먹! '; }
  const crit = Math.random() < (tool.crit ?? 0.1);
  if (crit) { dmg *= 1.8; label = '강타! ' + label; }
  const normal = worldNormal(h);
  const hit = { object: h.object, point: h.point.clone(), face: h.face, uv: h.uv ? h.uv.clone() : null, normal };
  let total = 0;
  if (tool.pry && obj.pryOff(part, h.point)) { sfx.pry(); total += 120; label = '뜯어내기! ' + label; }
  if (tool.id === 'fist') sfx.punch();
  total += damageObject(obj, dmg, hit, { power: tool.power * (crit ? 1.3 : 1), detachMul: tool.detachMul || 1 });
  if (tool.aoe) {
    for (const o of G.objects) {
      if (o === obj || o.destroyed) continue;
      const tgt = closestPart(o, h.point);
      if (!tgt || tgt.dist > tool.aoe) continue;
      const dir = tgt.pos.clone().sub(h.point).normalize();
      total += damageObject(o, dmg * tool.aoeMul * (1 - tgt.dist / tool.aoe * 0.5), { object: tgt.mesh, point: tgt.pos, normal: dir }, { power: tool.power * 0.8, quiet: true, fxScale: 0.6 });
    }
  }
  popup(h.point, label + '+' + fmt(total), crit ? 'crit' : '');
  addShake(tool.shake * (crit ? 1.5 : 1));
  vibrate(tool.power >= 1.5 ? 45 : crit ? 25 : 12);
  if (tool.slow) slowmo(0.25, 0.35);
  updateHUD();
}

const _tmp = new THREE.Vector3();
function closestPart(o, point) {
  let best = null;
  for (const p of o.parts) {
    if (p.detached) continue;
    p.mesh.getWorldPosition(_tmp);
    const d = _tmp.distanceTo(point);
    if (!best || d < best.dist) best = { mesh: p.mesh, pos: _tmp.clone(), dist: d };
  }
  return best;
}

// ---------- 폭탄 ----------
const bombGeo = new THREE.SphereGeometry(0.08, 14, 10);
const bombMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.35, metalness: 0.3 });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
const sparkGeo = new THREE.SphereGeometry(0.025, 8, 6);
const segRay = new THREE.Raycaster();
function throwBomb(x, y) {
  if (G.state !== 'playing') return;
  rayFrom(x, y);
  const r = pick(G.tool.range);
  const target = r ? r.hit.point.clone() : raycaster.ray.at(10, new THREE.Vector3());
  const start = new THREE.Vector3(0.2, -0.18, -0.5).applyMatrix4(camera.matrixWorld);
  const dist = start.distanceTo(target);
  const T = THREE.MathUtils.clamp(dist / 11, 0.3, 0.9);
  const vel = target.clone().sub(start).divideScalar(T); vel.y += 0.5 * 9.8 * T;
  const mesh = new THREE.Mesh(bombGeo, bombMat);
  const spark = new THREE.Mesh(sparkGeo, sparkMat); spark.position.set(0, 0.1, 0); mesh.add(spark);
  mesh.position.copy(start);
  scene.add(mesh);
  G.bombs.push({ mesh, spark, vel, t: 0, stuck: false, tick: 0 });
}

function updateBombs(dt) {
  if (G.dirty && G.bombs.length) refreshHittables();
  for (let i = G.bombs.length - 1; i >= 0; i--) {
    const b = G.bombs[i];
    b.t += dt;
    b.spark.scale.setScalar(0.6 + Math.random() * 1.2);
    b.tick -= dt; if (b.tick <= 0) { b.tick = 0.2; sfx.fuse(); }
    if (!b.stuck) {
      const prev = b.mesh.position.clone();
      b.vel.y -= 9.8 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += dt * 8;
      const seg = b.mesh.position.clone().sub(prev);
      const len = seg.length();
      if (len > 1e-5) {
        segRay.set(prev, seg.divideScalar(len)); segRay.far = len + 0.08;
        const h = segRay.intersectObjects(G.hittables, false)[0] || segRay.intersectObjects(surfaces, false)[0];
        if (h) { b.mesh.position.copy(h.point).addScaledVector(worldNormal(h), 0.08); b.stuck = true; sfx.thud(); }
      }
      if (b.mesh.position.y < 0.08) { b.mesh.position.y = 0.08; b.stuck = true; }
    }
    if (b.t >= 1.1) { explode(b.mesh.position.clone()); scene.remove(b.mesh); G.bombs.splice(i, 1); }
  }
}

function explode(c) {
  const R = TOOLS.find(t => t.id === 'bomb').radius;
  fx.explosion(c, R);
  fx.blast(c, R * 1.4, 7);
  fx.addDecal(null, new THREE.Vector3(c.x, 0.01, c.z), new THREE.Vector3(0, 1, 0), 2.4, null, true);
  sfx.explosion();
  addShake(0.22); vibrate([80, 40, 160]); slowmo(0.6, 0.22); screenFlash(0.45, '#ffd9a0');
  bumpCombo();
  let total = 0;
  for (const o of G.objects) {
    if (o.destroyed) continue;
    const tgt = closestPart(o, c);
    if (!tgt || tgt.dist > R) continue;
    const dmg = 150 * (1 - tgt.dist / R) + 25;
    const dir = tgt.pos.clone().sub(c).normalize();
    total += damageObject(o, dmg, { object: tgt.mesh, point: tgt.pos, normal: dir }, { power: 2, detachMul: 1.8, quiet: true, fxScale: 0.7 });
  }
  if (total > 0) popup(c.clone().setY(c.y + 0.5), `💥 +${fmt(total)}`, 'big');
  updateHUD();
}

// ---------- 레이저 ----------
const laser = { held: false, timer: 0, x: 0, y: 0, n: 0 };
const _muzzle = new THREE.Vector3();
function fireLaser() {
  const tool = G.tool;
  rayFrom(laser.x, laser.y);
  const r = pick(tool.range);
  const to = r ? r.hit.point.clone() : raycaster.ray.at(tool.range, new THREE.Vector3());
  vm.muzzleWorld(camera, _muzzle);
  fx.showBeam(_muzzle, to);
  vm.kick();
  laser.n++;
  if (laser.n % 2 === 0) sfx.laser();
  if (!r) return;
  const n = worldNormal(r.hit);
  if (r.obj) {
    const obj = r.hit.object.userData.owner;
    if (!obj || obj.destroyed) return;
    if (G.clock - G.lastComboBump > 0.3) { bumpCombo(); G.lastComboBump = G.clock; }
    const hit = { object: r.hit.object, point: r.hit.point.clone(), face: r.hit.face, uv: r.hit.uv ? r.hit.uv.clone() : null, normal: n };
    const g = damageObject(obj, randRange(tool.dmg), hit, { power: 0.5, quiet: true, scorch: true });
    if (laser.n % 4 === 0) { popup(r.hit.point, '+' + fmt(g * 4), ''); sfx.sizzle(); }
    addShake(0.004);
    if (laser.n % 8 === 0) updateHUD();
  } else {
    fx.spawnShards(r.hit.point, n, [0xffd27a, 0xff7a2f], 1, 1.8);
    if (laser.n % 5 === 0) fx.addDecal(r.hit.object, r.hit.point, n, 0.12, null, true);
  }
}

// ================= 입력 =================
const joy = { id: null, ox: 0, oy: 0 };
const look = { id: null, sx: 0, sy: 0, lx: 0, ly: 0, t: 0, drag: false };
const JOY_R = 52;

canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  e.preventDefault();
  if (G.state !== 'playing') return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const W = window.innerWidth, H = window.innerHeight;
  if (e.pointerType !== 'mouse' && joy.id === null && e.clientX < W * 0.45 && e.clientY > H * 0.45) {
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
    ui.joy.style.left = e.clientX + 'px'; ui.joy.style.top = e.clientY + 'px';
    ui.joy.classList.add('on'); hide(ui.joyHint);
    ui.joyKnob.style.transform = 'translate(-50%,-50%)';
  } else if (look.id === null) {
    look.id = e.pointerId; look.sx = look.lx = e.clientX; look.sy = look.ly = e.clientY;
    look.t = performance.now(); look.drag = false;
    if (G.tool.auto) { laser.held = true; laser.x = e.clientX; laser.y = e.clientY; laser.timer = 0; }
  } else return;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
}, { passive: false });

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
    ui.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    player.move.x = dx / JOY_R; player.move.y = -dy / JOY_R;
    player.run = d > JOY_R * 1.4;
    e.preventDefault();
  } else if (e.pointerId === look.id) {
    if (!look.drag && Math.hypot(e.clientX - look.sx, e.clientY - look.sy) > TAP_MOVE_PX) look.drag = true;
    if (look.drag && G.state === 'playing') {
      const s = (e.pointerType === 'mouse' ? 3.2 : 3.6) / Math.max(window.innerWidth, 320);
      player.look((e.clientX - look.lx) * s, (e.clientY - look.ly) * s);
    }
    look.lx = e.clientX; look.ly = e.clientY;
    laser.x = e.clientX; laser.y = e.clientY;
    e.preventDefault();
  }
}, { passive: false });

function endPointer(e, cancelled) {
  if (e.pointerId === joy.id) {
    joy.id = null; player.move.x = player.move.y = 0; player.run = false;
    ui.joy.classList.remove('on');
  } else if (e.pointerId === look.id) {
    look.id = null;
    laser.held = false;
    if (!cancelled && !look.drag && performance.now() - look.t < TAP_MAX_MS) requestAttack(e.clientX, e.clientY);
  }
  try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 320 && e.target === canvas) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (G.state === 'playing') pauseGame(); else if (G.state === 'paused') resumeGame(); return; }
  if (G.state !== 'playing') return;
  player.keys.add(e.code);
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= TOOLS.length) selectTool(TOOLS[n - 1]);
  if (e.code === 'Space') { requestAttack(window.innerWidth / 2, window.innerHeight / 2); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => player.keys.delete(e.code));
window.addEventListener('blur', () => player.keys.clear());
canvas.addEventListener('wheel', (e) => {
  if (G.state !== 'playing') return;
  const open = TOOLS.filter(t => G.unlocked.has(t.id));
  const i = open.indexOf(G.tool);
  selectTool(open[(i + (e.deltaY > 0 ? 1 : -1) + open.length) % open.length]);
}, { passive: true });

// ================= 게임 흐름 =================
function startGame(mode) {
  initAudio();
  G.mode = mode;
  G.state = 'playing';
  G.score = 0; G.timeLeft = CHALLENGE_TIME;
  G.combo = 0; G.maxCombo = 0; G.lastHit = -99;
  G.destroyedCount = 0; G.wave = 1; G.lastTick = 0; G.zone = null;
  G.unlocked = new Set(mode === 'endless' ? TOOLS.map(t => t.id) : ['fist', 'hammer']);
  G.tool = TOOLS[1];
  slow.t = 0; slow.timeScale = 1; shake = 0;
  pendingAttack = null; laser.held = false;
  joy.id = null; look.id = null; ui.joy.classList.remove('on');
  fpsMon.reset();
  clearPopups();
  buildWave();
  player.reset();
  vm.setTool(G.tool);
  hide(ui.menu); hide(ui.over); hide(ui.pause); hide(ui.howto);
  show(ui.hud);
  if (isTouchDevice) show(ui.joyHint); else hide(ui.joyHint);
  ui.restore.classList.toggle('hidden', mode !== 'endless');
  ui.restore.classList.remove('pulse');
  ui.combo.classList.remove('show');
  buildToolbar();
  selectTool(G.tool);
  updateHUD();
  toast(mode === 'challenge' ? '60초! 퇴근 전에 사무실을 부숴라!' : '모든 도구 해제! 마음껏 부수세요', 1.8);
}

function pauseGame() { if (G.state !== 'playing') return; G.state = 'paused'; laser.held = false; player.keys.clear(); show(ui.pause); }
function resumeGame() { if (G.state !== 'paused') return; G.state = 'playing'; hide(ui.pause); }

function endGame() {
  G.state = 'over';
  laser.held = false; player.move.x = player.move.y = 0; ui.joy.classList.remove('on');
  sfx.gameOver();
  const key = 'best.' + G.mode;
  const prevBest = store.get(key, 0);
  const isNew = G.score > prevBest;
  if (isNew) store.set(key, Math.round(G.score));
  $('go-score').textContent = fmt(G.score);
  $('go-best').textContent = fmt(Math.max(prevBest, G.score));
  $('go-new').classList.toggle('hidden', !isNew);
  $('go-destroyed').textContent = G.destroyedCount + '개';
  $('go-combo').textContent = G.maxCombo;
  $('go-tools').textContent = G.unlocked.size + '/' + TOOLS.length;
  $('go-title').textContent = G.score >= 25000 ? '사무실 초토화! 🎉' : G.score >= 10000 ? '스트레스 완전 해소! 🏃' : G.score >= 4000 ? '퇴근 완료!' : '야근 확정… 😵';
  const st = zoneStats();
  $('go-zones').innerHTML = ZONES.filter(z => z.id !== 'hall').map(z => {
    const s = st[z.id]; const p = s.total ? Math.round(s.dmg / s.total * 100) : 0;
    return `<div class="zrow"><span><i style="background:${z.color}"></i>${z.name}</span><div class="bar"><div style="width:${p}%;background:${z.color}"></div></div><b>${p}%</b></div>`;
  }).join('');
  setTimeout(() => show(ui.over), 500);
}

function goMenu() {
  G.state = 'menu';
  hide(ui.hud); hide(ui.pause); hide(ui.over); hide(ui.howto);
  show(ui.menu);
  clearPopups();
  refreshMenu();
  buildWave();
  player.reset();
}

function refreshMenu() {
  ui.bestChallenge.textContent = fmt(store.get('best.challenge', 0));
  ui.quality.textContent = '그래픽: ' + (qualityMode === 'auto' ? `자동(${QUALITY[level].name})` : QUALITY[qualityMode].name);
}

function bind(id, fn) { $(id).addEventListener('click', (e) => { e.stopPropagation(); initAudio(); sfx.ui(); fn(); }); }
bind('btn-start', () => startGame('challenge'));
bind('btn-endless', () => startGame('endless'));
bind('btn-howto', () => { hide(ui.menu); show(ui.howto); });
bind('btn-howto-close', () => { hide(ui.howto); show(ui.menu); });
bind('btn-quality', () => {
  const order = ['auto', 'high', 'medium', 'low'];
  qualityMode = order[(order.indexOf(qualityMode) + 1) % order.length];
  store.set('quality', qualityMode);
  level = qualityMode === 'auto' ? guessLevel() : qualityMode;
  fx.applyQuality(Q()); applyRendererQuality(); refreshMenu();
});
bind('btn-pause', pauseGame);
bind('btn-resume', resumeGame);
bind('btn-restart', () => startGame(G.mode));
bind('btn-pause-menu', goMenu);
bind('btn-again', () => startGame(G.mode));
bind('btn-over-menu', goMenu);
bind('btn-restore', () => {
  buildWave(); G.wave++;
  ui.restore.classList.remove('pulse');
  toast('🔧 사무실 복구 완료!', 1.4);
  updateHUD();
});
bind('btn-sound', () => { setMuted(!isMuted()); ui.sound.textContent = isMuted() ? '🔇' : '🔊'; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ================= 화면 크기 =================
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.aspect = aspect;
  camera.fov = aspect < 0.75 ? 74 : aspect < 1.3 ? 68 : 62;
  camera.updateProjectionMatrix();
  vm.camera.aspect = aspect;
  vm.camera.fov = aspect < 0.75 ? 62 : 55;
  vm.camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ================= 성능 모니터 =================
const fpsMon = {
  frames: 0, time: 0, low: 0,
  reset() { this.frames = 0; this.time = 0; this.low = 0; },
  tick(dt) {
    if (qualityMode !== 'auto' || G.state !== 'playing') return;
    this.frames++; this.time += dt;
    if (this.time < 2) return;
    const fps = this.frames / this.time;
    this.frames = 0; this.time = 0;
    this.low = fps < 42 ? this.low + 1 : 0;
    const idx = LEVELS.indexOf(level);
    if (this.low >= 2 && idx > 0) {
      level = LEVELS[idx - 1];
      fx.applyQuality(Q()); applyRendererQuality();
      toast(`효과 품질 자동 조정: ${QUALITY[level].name}`, 2);
      this.low = 0;
    }
  },
};

// ================= 메인 루프 =================
let last = performance.now();
let hudTimer = 0, mapTimer = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.clock += realDt;

  if (slow.t > 0) { slow.t -= realDt; slow.timeScale += (slow.scale - slow.timeScale) * Math.min(1, realDt * 30); }
  else slow.timeScale += (1 - slow.timeScale) * Math.min(1, realDt * 6);
  const paused = G.state === 'paused';
  const dt = paused ? 0 : realDt * slow.timeScale;

  if (G.state === 'playing') {
    player.update(realDt, G.colliders, BOUNDS);
    vm.update(realDt * Math.max(0.6, slow.timeScale), player.speedNow, G.clock);
    if (pendingAttack && vm.ready) { const p = pendingAttack; pendingAttack = null; requestAttack(p.x, p.y); }
    if (laser.held && G.tool.auto) {
      laser.timer -= realDt;
      while (laser.timer <= 0) { fireLaser(); laser.timer += G.tool.cd; }
    }
    updateBombs(dt);
    if (G.mode === 'challenge') {
      G.timeLeft -= realDt;
      const sec = Math.ceil(G.timeLeft);
      if (G.timeLeft <= 10 && sec !== G.lastTick && sec > 0) { G.lastTick = sec; sfx.tick(); }
      if (G.timeLeft <= 0) { G.timeLeft = 0; updateHUD(); endGame(); }
    }
    if (G.waveClearTimer > 0) {
      G.waveClearTimer -= realDt;
      if (G.waveClearTimer <= 0 && G.state === 'playing') { G.wave++; buildWave(); }
    }
    if (G.combo > 0 && G.clock - G.lastHit > COMBO_WINDOW) { G.combo = 0; ui.combo.classList.remove('show'); }
    hudTimer -= realDt; if (hudTimer <= 0) { hudTimer = 0.12; updateHUD(); }
    mapTimer -= realDt; if (mapTimer <= 0) { mapTimer = 0.15; drawMinimap(); }
    fpsMon.tick(realDt);
  } else if (G.state === 'menu') {
    player.yaw = Math.sin(G.clock * 0.18) * 0.9;
    player.update(0, G.colliders, BOUNDS);
  }
  if (!paused) {
    for (const o of G.objects) o.update(dt);
    fx.update(dt);
  }
  if (toastTimer > 0) { toastTimer -= realDt; if (toastTimer <= 0) ui.toast.classList.remove('show'); }

  // 화면 흔들림
  if (paused) { /* 일시정지 중에는 흔들지 않음 */ } else if (shake > 0.0005) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    camera.rotation.z = (Math.random() - 0.5) * shake * 0.6;
    shake *= Math.exp(-realDt * 12);
  } else { shake = 0; camera.rotation.z = 0; }

  if (sun.castShadow) {
    sun.position.set(player.pos.x + 3, 7, player.pos.z + 2);
    sun.target.position.set(player.pos.x, 0, player.pos.z - 1);
  } else {
    sun.position.set(3, 7, 2); sun.target.position.set(0, 0, 0);
  }

  renderer.clear();
  renderer.render(scene, camera);
  if (G.state !== 'menu') {
    renderer.clearDepth();
    renderer.render(vm.scene, vm.camera);
  }
}

// ================= 시작 =================
applyRendererQuality();
buildWave();
refreshMenu();
buildToolbar();
vm.setTool(G.tool);
ui.sound.textContent = isMuted() ? '🔇' : '🔊';
window.__smashReady = true;
$('loading').classList.add('hidden');
requestAnimationFrame((t) => { last = t; loop(t); });
