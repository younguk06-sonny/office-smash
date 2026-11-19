// 퇴근하고 다 부숴! (OFFICE SMASH) — 메인 게임 루프 / UI / 입력
import * as THREE from 'three';
import { initAudio, sfx, vibrate, setMuted, isMuted } from './audio.js';
import { carpetTexture, wallTexture, makeCrackTextures } from './textures.js';
import { Effects } from './effects.js';
import { buildRoom, buildDesk, buildMonitor, buildCopier } from './office.js';
import { Hammer } from './hammer.js';

// ================= 설정 =================
const CHALLENGE_TIME = 60;
const COMBO_WINDOW = 1.4;      // 초 안에 다음 타격 시 콤보 유지
const WAVE_CLEAR_BONUS = 2000;
const TAP_MOVE_PX = 12;        // 이 이상 움직이면 드래그(시점 변경)로 판정
const TAP_MAX_MS = 550;

const QUALITY = {
  high:   { name: '높음', pr: 2,   shadows: true,  shadowSize: 1024, shards: 180, glass: 120, paper: 90, debris: 60, decals: 14, light: true,  fxScale: 1.0 },
  medium: { name: '중간', pr: 1.5, shadows: true,  shadowSize: 512,  shards: 110, glass: 80,  paper: 55, debris: 40, decals: 10, light: true,  fxScale: 0.75 },
  low:    { name: '낮음', pr: 1,   shadows: false, shadowSize: 512,  shards: 50,  glass: 40,  paper: 30, debris: 24, decals: 6,  light: false, fxScale: 0.5 },
};
const LEVELS = ['low', 'medium', 'high'];

const TOOLS = [
  { id: 'fist',   icon: '👊', name: '주먹',     unlock: 0,     ready: false },
  { id: 'hammer', icon: '🔨', name: '망치',     unlock: 0,     ready: true  },
  { id: 'bat',    icon: '🏏', name: '방망이',   unlock: 8000,  ready: false },
  { id: 'mace',   icon: '⚙️', name: '철퇴',     unlock: 15000, ready: false },
  { id: 'laser',  icon: '🔫', name: '레이저',   unlock: 25000, ready: false },
];

const store = {
  get(k, d) { try { const v = localStorage.getItem('officeSmash.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('officeSmash.' + k, JSON.stringify(v)); } catch (e) { /* 사생활 모드 등 */ } },
};

// ================= 품질 자동 판정 =================
function guessLevel() {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (!mobile) return cores >= 4 ? 'high' : 'medium';
  if (cores <= 4 || mem <= 3) return 'low';
  return 'medium';
}
let qualityMode = store.get('quality', 'auto'); // auto | high | medium | low
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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c22);
scene.fog = new THREE.Fog(0x1a1c22, 7, 12);
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 30);

scene.add(new THREE.HemisphereLight(0xfff6e8, 0x40444c, 1.1));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(1.8, 4, 2.2);
sun.target.position.set(0, 0, -0.5);
scene.add(sun, sun.target);
sun.shadow.camera.left = -2.5; sun.shadow.camera.right = 2.5;
sun.shadow.camera.top = 2.5; sun.shadow.camera.bottom = -2.5;
sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 9;
sun.shadow.bias = -0.0008;
const fill = new THREE.PointLight(0xffc9a0, 6, 6, 2); // 창문 쪽 노을빛
fill.position.set(-1.1, 1.8, -1.8);
scene.add(fill);

function applyRendererQuality() {
  const q = Q();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
  sun.castShadow = q.shadows;
  if (sun.shadow.mapSize.x !== q.shadowSize) {
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  fill.visible = q.light;
  resize();
}

const surfaces = buildRoom(scene, carpetTexture(), wallTexture());
const fx = new Effects(scene, Q());
fx.setCrackTextures(makeCrackTextures(4));
const hammer = new Hammer(scene);

// ================= 게임 상태 =================
const G = {
  state: 'menu',     // menu | playing | paused | over
  mode: 'challenge', // challenge | endless
  score: 0,
  timeLeft: CHALLENGE_TIME,
  combo: 0, maxCombo: 0, lastHit: -99,
  destroyedCount: 0, wave: 1,
  objects: [],
  hittables: [], dirty: true,
  waveClearTimer: -1,
  clock: 0,          // 실제 경과 시간
  lastTick: 0,
};

const env = {
  scene, fx, sfx,
  quality: Q,
  markDirty: () => { G.dirty = true; },
};

function buildWave() {
  for (const o of G.objects) o.dispose();
  G.objects = [];
  fx.clear();
  const deskA = buildDesk(env, 0, 0.35, 0);
  const monA = buildMonitor(env, deskA, 'excel');
  const copier = buildCopier(env, -0.85, -1.15, 0.45);
  const deskB = buildDesk(env, 0.72, -1.45, -0.3);
  const monB = buildMonitor(env, deskB, 'mail');
  G.objects.push(deskA, monA, copier, deskB, monB);
  G.dirty = true;
  G.waveClearTimer = -1;
}

function refreshHittables() {
  G.hittables.length = 0;
  for (const o of G.objects) o.attachedMeshes(G.hittables);
  G.dirty = false;
}

// ================= UI 요소 =================
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), score: $('hud-score'), time: $('hud-time'), timeBox: $('hud-time-box'), rate: $('hud-rate'),
  wave: $('hud-wave'), combo: $('combo'), toast: $('toast'), popups: $('popups'), flash: $('flash'),
  toolbar: $('toolbar'), restore: $('btn-restore'), sound: $('btn-sound'),
  menu: $('menu'), howto: $('howto'), pause: $('pause'), over: $('gameover'),
  bestChallenge: $('best-challenge'), quality: $('btn-quality'),
};

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }

let toastTimer = 0;
function toast(msg, dur = 1.6) {
  ui.toast.textContent = msg;
  ui.toast.classList.remove('show'); void ui.toast.offsetWidth; ui.toast.classList.add('show');
  toastTimer = dur;
}

// 도구 버튼
function buildToolbar() {
  ui.toolbar.innerHTML = '';
  const best = store.get('best.challenge', 0);
  TOOLS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tool' + (t.id === 'hammer' ? ' active' : '') + (t.ready ? '' : ' locked');
    b.innerHTML = `<span class="ti">${t.icon}</span><span class="tn">${t.name}</span>` + (t.ready ? '' : `<span class="tl">${t.unlock ? '🔒' + (t.unlock / 1000) + '천점' : '🔒준비중'}</span>`);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      initAudio();
      if (t.ready) { sfx.ui(); toast(`${t.icon} ${t.name} 장착!`); return; }
      sfx.locked();
      if (t.unlock && best >= t.unlock) toast(`${t.name}: 조건 달성! 다음 업데이트에서 사용`, 2.2);
      else toast(t.unlock ? `${t.name}: 최고 ${fmt(t.unlock)}점 달성 시 해제` : `${t.name}: 다음 업데이트에서 추가됩니다`, 2.2);
    });
    ui.toolbar.appendChild(b);
  });
}

// 점수 팝업 (DOM 풀)
const popPool = [];
for (let i = 0; i < 14; i++) {
  const d = document.createElement('div'); d.className = 'pop'; ui.popups.appendChild(d); popPool.push(d);
}
let popCursor = 0;
const _proj = new THREE.Vector3();
function popup(worldPos, text, cls = '') {
  _proj.copy(worldPos).project(camera);
  if (_proj.z > 1) return;
  const x = (_proj.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
  const d = popPool[popCursor]; popCursor = (popCursor + 1) % popPool.length;
  d.textContent = text;
  d.className = 'pop';
  d.style.left = x + 'px'; d.style.top = y + 'px';
  void d.offsetWidth;
  d.className = 'pop go ' + cls;
}

function clearPopups() { popPool.forEach(d => { d.className = 'pop'; }); }

function screenFlash(strength = 0.35) {
  ui.flash.style.transition = 'none';
  ui.flash.style.opacity = strength;
  void ui.flash.offsetWidth;
  ui.flash.style.transition = 'opacity 0.35s ease-out';
  ui.flash.style.opacity = 0;
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
}

function showCombo() {
  if (G.combo < 2) { ui.combo.classList.remove('show'); return; }
  const mult = comboMult();
  ui.combo.innerHTML = `<b>${G.combo}</b> COMBO` + (mult > 1 ? ` <i>x${mult.toFixed(2).replace(/\.?0+$/, '')}</i>` : '');
  ui.combo.classList.remove('show', 'bump'); void ui.combo.offsetWidth;
  ui.combo.classList.add('show', 'bump');
}
const comboMult = () => 1 + Math.min(2, Math.floor(G.combo / 5) * 0.25);

// ================= 카메라 =================
const cam = {
  target: new THREE.Vector3(-0.05, 0.62, -0.5),
  yaw: 0, pitch: 0.55, tYaw: 0, tPitch: 0.55, radius: 4,
  shake: 0,
};
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.aspect = aspect;
  if (aspect < 0.7) { camera.fov = 60; cam.radius = 4.3; }
  else if (aspect < 1.2) { camera.fov = 54; cam.radius = 3.9; }
  else { camera.fov = 46; cam.radius = 3.7; }
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

function updateCamera(realDt) {
  if (G.state === 'menu') cam.tYaw = Math.sin(G.clock * 0.25) * 0.45;
  const k = Math.min(1, realDt * 9);
  cam.yaw += (cam.tYaw - cam.yaw) * k;
  cam.pitch += (cam.tPitch - cam.pitch) * k;
  const cp = Math.cos(cam.pitch);
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * cp * cam.radius,
    cam.target.y + Math.sin(cam.pitch) * cam.radius,
    cam.target.z + Math.cos(cam.yaw) * cp * cam.radius,
  );
  camera.lookAt(cam.target);
  if (cam.shake > 0.0005) {
    camera.position.x += (Math.random() - 0.5) * cam.shake;
    camera.position.y += (Math.random() - 0.5) * cam.shake;
    camera.position.z += (Math.random() - 0.5) * cam.shake * 0.5;
    cam.shake *= Math.exp(-realDt * 14);
  } else cam.shake = 0;
}
const addShake = (s) => { cam.shake = Math.min(0.12, cam.shake + s); };

// ================= 슬로모션 =================
const slow = { t: 0, scale: 1, timeScale: 1 };
function slowmo(dur = 0.45, scale = 0.25) { slow.t = dur; slow.scale = scale; }

// ================= 입력 (터치 / 마우스) =================
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let activePointer = null;

canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  if (activePointer !== null) return; // 두 번째 손가락은 무시 (확대/오작동 방지)
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  activePointer = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), drag: false };
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('pointermove', (e) => {
  const p = activePointer;
  if (!p || p.id !== e.pointerId) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (!p.drag && Math.hypot(dx, dy) > TAP_MOVE_PX) p.drag = true;
  if (p.drag && (G.state === 'playing')) {
    const s = 3.2 / Math.min(window.innerWidth, window.innerHeight);
    cam.tYaw = THREE.MathUtils.clamp(cam.tYaw - (e.clientX - p.lx) * s, -0.95, 0.95);
    cam.tPitch = THREE.MathUtils.clamp(cam.tPitch + (e.clientY - p.ly) * s, 0.18, 1.12);
  }
  p.lx = e.clientX; p.ly = e.clientY;
  e.preventDefault();
}, { passive: false });

function endPointer(e, cancelled) {
  const p = activePointer;
  if (!p || p.id !== e.pointerId) return;
  activePointer = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  if (cancelled || p.drag) return;
  if (performance.now() - p.t > TAP_MAX_MS) return;
  attackAt(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// iOS 사파리 확대 제스처 차단
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 320 && e.target === canvas) e.preventDefault(); // 더블탭 확대 방지
  lastTouchEnd = now;
}, { passive: false });

function attackAt(x, y) {
  if (G.state !== 'playing') return;
  if (G.dirty) refreshHittables();
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(G.hittables, false);
  if (hits.length) {
    const h = hits[0];
    const normal = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
    const info = { object: h.object, point: h.point.clone(), face: h.face, uv: h.uv ? h.uv.clone() : null };
    sfx.whoosh();
    hammer.strike(h.point, normal, camera.position, () => applyHit(info));
    return;
  }
  // 바닥·벽을 쳤을 때: 점수 없이 손맛만
  const s = raycaster.intersectObjects(surfaces, false);
  if (s.length) {
    const h = s[0];
    const normal = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
    const pt = h.point.clone();
    hammer.strike(pt, normal, camera.position, () => {
      sfx.thud(); fx.ring(pt, normal, 0xcccccc, 0.25); addShake(0.012);
      fx.spawnShards(pt, normal, [0x555a62, 0x777c84], 3, 1.2);
    });
  }
}

function applyHit(info) {
  if (G.state !== 'playing') return;
  const obj = info.object.userData.owner;
  const part = info.object.userData.part;
  if (!obj || obj.destroyed || !part || part.detached) return;

  // 망치 데미지 (치명타 15%)
  const crit = Math.random() < 0.15;
  const dmg = (24 + Math.random() * 9) * (crit ? 1.8 : 1);
  const now = G.clock;
  G.combo = now - G.lastHit <= COMBO_WINDOW ? G.combo + 1 : 1;
  G.lastHit = now;
  G.maxCombo = Math.max(G.maxCombo, G.combo);

  const res = obj.damage(dmg, info, crit ? 1.35 : 1);
  if (!res) return;
  const mult = comboMult();
  let gained = Math.round(dmg * 3 * mult);
  let label = '+' + fmt(gained);
  let cls = crit ? 'crit' : '';

  if (res.stage > res.prev) {
    for (let s = res.prev + 1; s <= res.stage; s++) {
      if (s === 1) gained += Math.round(50 * mult);
      if (s === 2) gained += Math.round(150 * mult);
      if (s === 3) gained += Math.round(obj.destroyBonus * mult);
    }
  }
  G.score += gained;

  if (res.destroyed) {
    G.destroyedCount++;
    label = `${obj.name} 박살! +${fmt(gained)}`;
    cls = 'big';
    slowmo(0.5, 0.22);
    addShake(0.09);
    screenFlash(0.3);
    vibrate([40, 30, 80]);
    checkWaveClear();
  } else if (res.stage > res.prev) {
    addShake(0.045);
    vibrate(35);
    if (res.stage === 2) slowmo(0.18, 0.4);
  } else {
    addShake(crit ? 0.035 : 0.018);
    vibrate(crit ? 25 : 12);
  }
  if (crit && !res.destroyed) label = '강타! ' + label;
  popup(info.point, label, cls);

  if (G.combo >= 2) {
    showCombo();
    if (G.combo % 5 === 0) sfx.combo(Math.min(10, G.combo / 5));
  }
  updateHUD();
}

function checkWaveClear() {
  if (!G.objects.every(o => o.destroyed)) return;
  if (G.mode === 'challenge') {
    G.score += WAVE_CLEAR_BONUS;
    G.waveClearTimer = 1.6;
    setTimeout(() => { if (G.state === 'playing') { sfx.clear(); toast(`사무실 전멸! +${fmt(WAVE_CLEAR_BONUS)} 새 사무실 입고`, 1.8); } }, 300);
  } else {
    toast('전부 박살! 🔧 복구를 눌러 주세요', 2.4);
    ui.restore.classList.add('pulse');
  }
}

// ================= 게임 흐름 =================
function startGame(mode) {
  initAudio();
  G.mode = mode;
  G.state = 'playing';
  G.score = 0; G.timeLeft = CHALLENGE_TIME;
  G.combo = 0; G.maxCombo = 0; G.lastHit = -99;
  G.destroyedCount = 0; G.wave = 1;
  G.lastTick = 0;
  fpsMon.reset();
  slow.t = 0; slow.timeScale = 1;
  cam.tYaw = 0; cam.tPitch = 0.55; cam.shake = 0;
  hammer.reset();
  activePointer = null;
  clearPopups();
  buildWave();
  hide(ui.menu); hide(ui.over); hide(ui.pause); hide(ui.howto);
  show(ui.hud);
  ui.restore.classList.toggle('hidden', mode !== 'endless');
  ui.restore.classList.remove('pulse');
  ui.wave.textContent = mode === 'challenge' ? '1번째 사무실' : '무한 모드';
  ui.combo.classList.remove('show');
  buildToolbar();
  updateHUD();
  toast(mode === 'challenge' ? '60초! 퇴근 전에 다 부숴!' : '마음껏 부수세요. 시간제한 없음', 1.6);
}

function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  show(ui.pause);
}
function resumeGame() {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  hide(ui.pause);
}

function endGame() {
  G.state = 'over';
  hammer.reset();
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
  $('go-wave').textContent = G.wave + '곳';
  $('go-title').textContent = G.score >= 10000 ? '스트레스 완전 해소! 🎉' : G.score >= 4000 ? '퇴근 완료! 🏃' : '야근 확정… 😵';
  setTimeout(() => show(ui.over), 500);
}

function goMenu() {
  G.state = 'menu';
  hide(ui.hud); hide(ui.pause); hide(ui.over); hide(ui.howto);
  show(ui.menu);
  hammer.reset();
  clearPopups();
  refreshMenu();
  buildWave(); // 배경용 새 사무실
}

function refreshMenu() {
  ui.bestChallenge.textContent = fmt(store.get('best.challenge', 0));
  ui.quality.textContent = '그래픽: ' + (qualityMode === 'auto' ? `자동(${QUALITY[level].name})` : QUALITY[qualityMode].name);
}

// ================= 버튼 연결 =================
function bind(id, fn) {
  $(id).addEventListener('click', (e) => { e.stopPropagation(); initAudio(); sfx.ui(); fn(); });
}
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
  buildWave();
  ui.restore.classList.remove('pulse');
  G.wave++;
  toast('🔧 복구 완료! 다시 부수세요', 1.4);
  updateHUD();
});
bind('btn-sound', () => {
  setMuted(!isMuted());
  ui.sound.textContent = isMuted() ? '🔇' : '🔊';
});

document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p') { if (G.state === 'playing') pauseGame(); else if (G.state === 'paused') resumeGame(); }
});

// ================= 성능 모니터 (자동 품질 하향) =================
const fpsMon = {
  frames: 0, time: 0, lowStreak: 0,
  reset() { this.frames = 0; this.time = 0; this.lowStreak = 0; },
  tick(dt) {
    if (qualityMode !== 'auto' || G.state !== 'playing') return;
    this.frames++; this.time += dt;
    if (this.time < 2) return;
    const fps = this.frames / this.time;
    this.frames = 0; this.time = 0;
    if (fps < 42) this.lowStreak++; else this.lowStreak = 0;
    const idx = LEVELS.indexOf(level);
    if (this.lowStreak >= 2 && idx > 0) { // 셰이더 첫 컴파일 등 일시적 끊김은 무시하고 4초 연속 저하 시에만
      level = LEVELS[idx - 1];
      fx.applyQuality(Q()); applyRendererQuality();
      toast(`효과 품질 자동 조정: ${QUALITY[level].name}`, 2);
      this.lowStreak = 0;
    }
  },
};

// ================= 메인 루프 =================
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.clock += realDt;

  // 슬로모션
  if (slow.t > 0) { slow.t -= realDt; slow.timeScale += (slow.scale - slow.timeScale) * Math.min(1, realDt * 30); }
  else slow.timeScale += (1 - slow.timeScale) * Math.min(1, realDt * 6);
  const paused = G.state === 'paused';
  const dt = paused ? 0 : realDt * slow.timeScale;

  if (!paused) {
    hammer.update(realDt * Math.max(0.55, slow.timeScale));
    for (const o of G.objects) o.update(dt);
    fx.update(dt);
  }

  if (G.state === 'playing') {
    if (G.mode === 'challenge') {
      G.timeLeft -= realDt;
      const sec = Math.ceil(G.timeLeft);
      if (G.timeLeft <= 10 && sec !== G.lastTick && sec > 0) { G.lastTick = sec; sfx.tick(); }
      if (G.timeLeft <= 0) { G.timeLeft = 0; updateHUD(); endGame(); }
    }
    if (G.waveClearTimer > 0) {
      G.waveClearTimer -= realDt;
      if (G.waveClearTimer <= 0 && G.state === 'playing') {
        G.wave++;
        buildWave();
        ui.wave.textContent = `${G.wave}번째 사무실`;
      }
    }
    if (G.combo > 0 && G.clock - G.lastHit > COMBO_WINDOW) { G.combo = 0; ui.combo.classList.remove('show'); }
    hudTimer -= realDt;
    if (hudTimer <= 0) { hudTimer = 0.1; updateHUD(); }
    fpsMon.tick(realDt);
  }
  if (toastTimer > 0) { toastTimer -= realDt; if (toastTimer <= 0) ui.toast.classList.remove('show'); }

  updateCamera(realDt);
  renderer.render(scene, camera);
}
let hudTimer = 0;

// ================= 시작 =================
applyRendererQuality();
buildWave();
refreshMenu();
buildToolbar();
ui.sound.textContent = isMuted() ? '🔇' : '🔊';
window.__smashReady = true;
$('loading').classList.add('hidden');
requestAnimationFrame((t) => { last = t; loop(t); });
