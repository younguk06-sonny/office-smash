// 파괴 도구 8종: 능력치 + 1인칭 손 모델 + 휘두르기 애니메이션
import * as THREE from 'three';

// dmg: 기본 데미지 범위, cd: 공격 간격(초), reach: 근접 사거리(m), impact: 타격 순간까지 시간
// aoe: 주변 물건까지 피해가 퍼지는 반경, detachMul: 부품 날아가는 힘 배율
export const TOOLS = [
  { id: 'fist',   icon: '👊', name: '주먹',   unlock: 0,     dmg: [9, 13],   cd: 0.17, reach: 1.7, impact: 0.06, style: 'punch', power: 0.8, shake: 0.012, desc: '빠른 연타. 10콤보부터 분노의 주먹' },
  { id: 'hammer', icon: '🔨', name: '망치',   unlock: 0,     dmg: [24, 33],  cd: 0.32, reach: 2.0, impact: 0.1,  style: 'smash', power: 1.0, shake: 0.022, crit: 0.25, desc: '집중 파괴. 강타 확률 25%' },
  { id: 'bat',    icon: '🏏', name: '방망이', unlock: 1000,  dmg: [30, 40],  cd: 0.42, reach: 2.3, impact: 0.11, style: 'swing', power: 1.35, shake: 0.045, aoe: 0.9, aoeMul: 0.5, desc: '강한 충격, 옆 물건까지 휩쓸기' },
  { id: 'golf',   icon: '🏌️', name: '골프채', unlock: 2500,  dmg: [22, 30],  cd: 0.36, reach: 2.4, impact: 0.1,  style: 'swing', power: 1.2, shake: 0.03, detachMul: 2.3, desc: '부품을 멀리 날려버림' },
  { id: 'axe',    icon: '🪓', name: '도끼',   unlock: 4000,  dmg: [26, 34],  cd: 0.45, reach: 2.0, impact: 0.13, style: 'smash', power: 1.2, shake: 0.035, pry: true, desc: '맞은 부품을 그대로 뜯어냄' },
  { id: 'mace',   icon: '⚒️', name: '철퇴',   unlock: 6000,  dmg: [52, 66],  cd: 0.8,  reach: 2.1, impact: 0.2,  style: 'smash', power: 1.8, shake: 0.09, aoe: 1.5, aoeMul: 0.6, slow: true, desc: '넓은 범위 초강력 일격' },
  { id: 'bomb',   icon: '💣', name: '폭탄',   unlock: 8500,  dmg: [150, 150], cd: 1.0, range: 16, impact: 0.12, style: 'throw', radius: 3.0, desc: '던지면 1초 뒤 반경 3m 폭발' },
  { id: 'laser',  icon: '🔫', name: '레이저', unlock: 11000, dmg: [6, 8],    cd: 0.06, range: 18, impact: 0,    style: 'beam', auto: true, desc: '누르고 있으면 연속 발사, 끌어서 쓸기' },
];

const SKIN = 0xe0b394;

function mesh(geo, color, opt = {}) {
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: opt.r ?? 0.5, metalness: opt.m ?? 0, emissive: opt.e ?? 0x000000, emissiveIntensity: opt.ei ?? 1 }));
}

function hand() {
  const g = new THREE.Group();
  const sleeve = mesh(new THREE.BoxGeometry(0.11, 0.11, 0.42), 0x2d3a55, { r: 0.9 }); sleeve.position.set(0.02, -0.05, 0.22);
  const fist = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.11), SKIN, { r: 0.7 }); fist.position.set(0, 0, -0.02);
  g.add(sleeve, fist);
  return g;
}

// 도구별 1인칭 모델 (손잡이 기준 원점, 위쪽 = 도구 방향)
function buildModel(id) {
  const g = new THREE.Group();
  const h = hand(); g.add(h);
  const wood = 0xa8743f, steel = 0x9aa2ab;
  if (id === 'fist') {
    h.scale.setScalar(1.15);
  } else if (id === 'hammer') {
    const handle = mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.38, 10), wood); handle.position.y = 0.12;
    const head = mesh(new THREE.BoxGeometry(0.16, 0.055, 0.055), steel, { m: 0.9, r: 0.25 }); head.position.y = 0.31;
    g.add(handle, head);
  } else if (id === 'bat') {
    const bat = mesh(new THREE.CylinderGeometry(0.04, 0.018, 0.85, 12), 0xc89a5a); bat.position.y = 0.38;
    const knob = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 10), 0x222222); knob.position.y = -0.05;
    g.add(bat, knob);
  } else if (id === 'golf') {
    const shaft = mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.9, 8), 0xd0d4d8, { m: 0.9, r: 0.2 }); shaft.position.y = 0.4;
    const grip = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 8), 0x111111); grip.position.y = 0.02;
    const head = mesh(new THREE.BoxGeometry(0.11, 0.05, 0.035), 0x2c2f33, { m: 0.8, r: 0.3 }); head.position.set(0.04, 0.86, 0);
    g.add(shaft, grip, head);
  } else if (id === 'axe') {
    const handle = mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.6, 10), 0x8a5a2b); handle.position.y = 0.22;
    const blade = mesh(new THREE.BoxGeometry(0.17, 0.12, 0.012), steel, { m: 0.95, r: 0.2 }); blade.position.set(0.09, 0.47, 0);
    const back = mesh(new THREE.BoxGeometry(0.05, 0.06, 0.04), 0x555a60, { m: 0.8 }); back.position.set(-0.01, 0.47, 0);
    g.add(handle, blade, back);
  } else if (id === 'mace') {
    const handle = mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.55, 10), 0x4a3524); handle.position.y = 0.2;
    const ball = mesh(new THREE.IcosahedronGeometry(0.1, 1), 0x6d737a, { m: 0.85, r: 0.35 }); ball.position.y = 0.52;
    g.add(handle, ball);
    const spikeGeo = new THREE.ConeGeometry(0.025, 0.07, 6);
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7]];
    for (const d of dirs) {
      const s = mesh(spikeGeo, 0xb0b6bd, { m: 0.9, r: 0.2 });
      const v = new THREE.Vector3(...d).normalize();
      s.position.copy(v).multiplyScalar(0.11).add(new THREE.Vector3(0, 0.52, 0));
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      g.add(s);
    }
  } else if (id === 'bomb') {
    const ball = mesh(new THREE.SphereGeometry(0.075, 16, 12), 0x1a1a1e, { r: 0.35, m: 0.3 }); ball.position.y = 0.07;
    const cap = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10), 0x777777, { m: 0.8 }); cap.position.y = 0.15;
    const fuse = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.06, 6), 0xc8a060); fuse.position.set(0.01, 0.19, 0); fuse.rotation.z = -0.4;
    const spark = mesh(new THREE.SphereGeometry(0.014, 8, 6), 0xffcc33, { e: 0xffaa00, ei: 3 }); spark.position.set(0.025, 0.22, 0);
    g.add(ball, cap, fuse, spark);
    g.userData.spark = spark; g.userData.throwable = [ball, cap, fuse, spark];
  } else if (id === 'laser') {
    const body = mesh(new THREE.BoxGeometry(0.06, 0.08, 0.26), 0x2a2e36, { m: 0.6, r: 0.3 }); body.position.set(0, 0.06, -0.08);
    const barrel = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 10), 0x9aa2ab, { m: 0.9 }); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.07, -0.28);
    const tip = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), 0xff3030, { e: 0xff2020, ei: 2 }); tip.rotation.x = Math.PI / 2; tip.position.set(0, 0.07, -0.365);
    const fin = mesh(new THREE.BoxGeometry(0.01, 0.05, 0.12), 0xff5050, { e: 0xaa1010 }); fin.position.set(0, 0.12, -0.08);
    g.add(body, barrel, tip, fin);
    g.userData.muzzle = tip;
  }
  return g;
}

// 1인칭 손/도구 표시 (별도 씬에 그려 벽에 파묻히지 않음)
export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xfff4e6, 0x404650, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(1, 2, 1); this.scene.add(d);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.models = {};
    for (const t of TOOLS) { const m = buildModel(t.id); m.visible = false; this.root.add(m); this.models[t.id] = m; }
    this.tool = null;
    this.t = 99;           // 공격 시작 후 경과
    this.busy = false;
    this.impactDone = true;
    this.onImpact = null;
    this.switchT = 1;
    this.recoil = 0;
  }

  setTool(tool) {
    if (this.tool) this.models[this.tool.id].visible = false;
    this.tool = tool;
    this.models[tool.id].visible = true;
    this.switchT = 0;
    this.t = 99; this.busy = false; this.impactDone = true; this.onImpact = null;
  }

  get ready() { return !this.busy; }

  attack(onImpact) {
    if (this.busy) return false;
    this.busy = true;
    this.t = 0;
    this.impactDone = false;
    this.onImpact = onImpact;
    return true;
  }

  muzzleWorld(mainCamera, out) {
    // 화면 오른쪽 아래 총구 위치를 실제 월드 좌표로 근사
    return out.set(0.16, -0.16, -0.55).applyMatrix4(mainCamera.matrixWorld);
  }

  update(dt, moveSpeed, time) {
    const tool = this.tool;
    if (!tool) return;
    this.switchT = Math.min(1, this.switchT + dt * 5);
    if (this.busy) {
      this.t += dt;
      if (!this.impactDone && this.t >= tool.impact) {
        this.impactDone = true;
        const cb = this.onImpact; this.onImpact = null;
        if (cb) cb();
      }
      if (this.t >= tool.cd) this.busy = false;
    }
    this.recoil *= Math.exp(-dt * 18);

    // 기본 자세 + 걷기 흔들림
    const m = this.models[tool.id];
    const bob = Math.sin(time * 9) * 0.012 * Math.min(1, moveSpeed / 3);
    const sway = Math.cos(time * 4.5) * 0.008 * Math.min(1, moveSpeed / 3);
    const base = tool.style === 'beam' ? [0.2, -0.22, -0.42] : tool.style === 'punch' ? [0.2, -0.24, -0.42] : tool.style === 'throw' ? [0.22, -0.26, -0.45] : [0.26, -0.34, -0.5];
    let px = base[0] + sway, py = base[1] + bob - (1 - this.switchT) * 0.3, pz = base[2];
    let rx = 0, ry = 0, rz = 0;
    if (tool.style === 'smash') { rx = -0.25; rz = -0.35; }
    if (tool.style === 'swing') { rx = 0.1; rz = -0.9; ry = 0.2; }
    if (tool.style === 'punch') { rz = 0.15; }
    if (tool.style === 'beam') { ry = 0.05; }

    const tt = this.t, imp = Math.max(0.0001, tool.impact), cd = tool.cd;
    const pre = Math.min(1, tt / imp);              // 내려치기 진행 0→1
    const post = tt > imp ? Math.min(1, (tt - imp) / Math.max(0.05, cd - imp)) : 0; // 복귀 0→1
    const active = this.busy || tt < cd;
    if (active && tt < 5) {
      if (tool.style === 'smash') {
        // 들어올렸다가 → 내려찍기 → 복귀
        const wind = pre < 1 ? (pre < 0.4 ? pre / 0.4 : 1 - (pre - 0.4) / 0.6 * 2) : -1 + post;
        rx += wind * 0.9; py += Math.max(0, wind) * 0.08; pz -= (pre >= 1 ? (1 - post) : pre) * 0.18;
      } else if (tool.style === 'swing') {
        const a = pre < 1 ? -0.9 * Math.sin(pre * Math.PI * 0.5) : -0.9 + 0.9 * post;
        ry += -a * 1.6 - (pre < 1 ? 0 : 0); rz += a * -1.2; px -= (pre < 1 ? pre : 1 - post) * 0.32;
      } else if (tool.style === 'punch') {
        const f = pre < 1 ? pre : 1 - post;
        pz -= f * 0.28; px -= f * 0.1; py += f * 0.06;
      } else if (tool.style === 'throw') {
        const f = pre < 1 ? pre : 1 - post;
        pz -= f * 0.25; py += f * 0.12; rx -= f * 0.6;
        const hidden = tt >= imp && post < 0.85;
        for (const o of m.userData.throwable) o.visible = !hidden;
      }
    } else if (tool.style === 'throw') {
      for (const o of m.userData.throwable) o.visible = true;
    }
    if (tool.style === 'beam') pz += this.recoil * 0.04;
    if (m.userData.spark) m.userData.spark.scale.setScalar(0.7 + Math.random() * 0.8);
    m.position.set(px, py, pz);
    m.rotation.set(rx, ry, rz);
  }

  kick() { this.recoil = 1; }
}
