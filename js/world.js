// 사무실 층 전체: 벽·바닥·조명·간판(고정) + 물건 배치 + 구역(부서) 정의
import * as THREE from 'three';
import { carpetTexture, woodFloorTexture, tileTexture, wallTexture, signTexture, posterTexture, cityTexture } from './textures.js';
import { build } from './objects.js';

export const BOUNDS = { minX: -12.85, maxX: 12.85, minZ: -8.85, maxZ: 8.85 };
const H = 3.0; // 천장 높이

// 구역(부서). 미니맵·현재 위치 표시·부서별 파괴율에 사용
export const ZONES = [
  { id: 'ceo',  name: '대표이사실',   x0: -13, x1: -5, z0: -9, z1: -3, color: '#8a5a2b' },
  { id: 'meet', name: '회의실',       x0: -5,  x1: 3,  z0: -9, z1: -3, color: '#2b5797' },
  { id: 'pant', name: '탕비실',       x0: 3,   x1: 13, z0: -9, z1: -3, color: '#2e8b57' },
  { id: 'hall', name: '복도',         x0: -13, x1: 13, z0: -3, z1: -1, color: '#666' },
  { id: 'mgmt', name: '경영지원부',   x0: -13, x1: -5, z0: -1, z1: 9,  color: '#7a4a9a' },
  { id: 'risk', name: '리스크관리부', x0: -5,  x1: 3,  z0: -1, z1: 9,  color: '#c0392b' },
  { id: 'sale', name: '영업부',       x0: 3,   x1: 13, z0: -1, z1: 9,  color: '#d68910' },
];
export function zoneAt(x, z) {
  for (const zn of ZONES) if (x >= zn.x0 && x < zn.x1 && z >= zn.z0 && z < zn.z1) return zn;
  return null;
}

// ------------------------------------------------------------------
// 고정 환경
// ------------------------------------------------------------------
export function buildStatic(scene) {
  const surfaces = [];  // 공격 레이캐스트 대상(바닥·벽)
  const colliders = []; // 플레이어 충돌 (AABB)
  const add = (m, solid = true) => { scene.add(m); if (solid) surfaces.push(m); return m; };

  // 바닥 (구역별 재질)
  const floorMat = (tex, rx, rz) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, rz); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }); };
  const grayCarpet = carpetTexture('#4c5462', 1), blueCarpet = carpetTexture('#2f3f5e', 1), wood = woodFloorTexture(), tile = tileTexture();
  const floors = [
    [-13, -5, -9, -3, floorMat(wood, 4, 3)],
    [-5, 3, -9, -3, floorMat(blueCarpet, 8, 6)],
    [3, 13, -9, -3, floorMat(tile, 10, 6)],
    [-13, 13, -3, 9, floorMat(grayCarpet, 26, 12)],
  ];
  for (const [x0, x1, z0, z1, mat] of floors) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    f.rotation.x = -Math.PI / 2; f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); f.receiveShadow = true;
    add(f);
  }
  // 부서 구역 바닥 띠 (색으로 구분)
  for (const zn of ZONES.filter(z => ['mgmt', 'risk', 'sale'].includes(z.id))) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(zn.x1 - zn.x0 - 0.4, 0.12), new THREE.MeshBasicMaterial({ color: zn.color }));
    band.rotation.x = -Math.PI / 2; band.position.set((zn.x0 + zn.x1) / 2, 0.003, -0.8);
    scene.add(band);
  }

  // 천장 + 조명 패널
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), new THREE.MeshStandardMaterial({ color: 0xe9e9e5, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, 0); scene.add(ceil);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffbf0 });
  const panelGeo = new THREE.PlaneGeometry(1.2, 0.6);
  for (let x = -11; x <= 11; x += 3.3) for (let z = -7.5; z <= 7.5; z += 3) {
    const p = new THREE.Mesh(panelGeo, lightMat); p.position.set(x, H - 0.01, z); p.rotation.x = Math.PI / 2; scene.add(p);
  }

  // 벽
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 });
  const wall = (x0, z0, x1, z1, h = H, mat = wallMat) => {
    const t = 0.2;
    const w = Math.abs(x1 - x0) || t, d = Math.abs(z1 - z0) || t;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    m.receiveShadow = true;
    add(m);
    colliders.push({ minX: m.position.x - w / 2, maxX: m.position.x + w / 2, minZ: m.position.z - d / 2, maxZ: m.position.z + d / 2 });
    return m;
  };
  // 외벽
  wall(-13, -9, 13, -9); wall(-13, 9, -1.2, 9); wall(1.2, 9, 13, 9);
  wall(-13, -9, -13, 9); wall(13, -9, 13, 9);
  // 위쪽 방 사이 벽
  wall(-5, -9, -5, -3); wall(3, -9, 3, -3);
  // 복도 쪽 벽 (문 자리 비움). 회의실은 부술 수 있는 유리벽
  wall(-13, -3, -8.2, -3); wall(-6.6, -3, -5, -3);
  wall(3, -3, 6, -3); wall(7.6, -3, 13, -3);
  // 기둥
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.8 });
  for (const [x, z] of [[-5, 4.2], [3, 4.2]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), pillarMat); p.position.set(x, H / 2, z); add(p);
    colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 });
  }
  // 걸레받이
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.7 });
  for (const [x, z, w, d] of [[0, -8.88, 26, 0.04], [-12.88, 0, 0.04, 18], [12.88, 0, 0.04, 18]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), baseMat); b.position.set(x, 0.05, z); scene.add(b);
  }

  // 창문 (북쪽 외벽 = 위쪽 방들, 동/서 외벽)
  const evening = new THREE.MeshBasicMaterial({ map: cityTexture(true) });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.5, roughness: 0.4 });
  const windowAt = (x, z, rotY, w = 2.4) => {
    const g = new THREE.Group();
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.4), evening); g.add(pane);
    for (const [fx, fy, fw, fh] of [[0, 0.72, w + 0.1, 0.06], [0, -0.72, w + 0.1, 0.06], [-w / 2, 0, 0.06, 1.5], [w / 2, 0, 0.06, 1.5], [0, 0, 0.05, 1.45]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.05), frameMat); f.position.set(fx, fy, 0.02); g.add(f);
    }
    g.position.set(x, 1.65, z); g.rotation.y = rotY; scene.add(g);
  };
  for (const x of [-11, -7, -3.4, 1.4, 6, 11.2]) windowAt(x, -8.88, 0);
  for (const z of [1, 5]) { windowAt(-12.88, z, Math.PI / 2); windowAt(12.88, z, -Math.PI / 2); }

  // 부서 간판 (천장에 매단 양면 사인)
  const hang = (zn, x, z, rotY = 0) => {
    const tex = signTexture(zn.name, zn.sub, zn.color);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), mat);
    const b = a.clone(); b.rotation.y = Math.PI; b.position.z = -0.01;
    g.add(a, b);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    for (const sx of [-0.7, 0.7]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.45, 0.01), wireMat); w.position.set(sx, 0.47, 0); g.add(w); }
    g.position.set(x, 2.5, z); g.rotation.y = rotY; scene.add(g);
  };
  const Z = Object.fromEntries(ZONES.map(z => [z.id, z]));
  Z.mgmt.sub = '인사 · 총무 · 재무'; Z.risk.sub = '심사 · 리스크 모니터링'; Z.sale.sub = '사업 수주 · 영업';
  hang(Z.mgmt, -9, -0.5); hang(Z.risk, -1, -0.5); hang(Z.sale, 8, -0.5);
  // 방 입구 표찰
  const doorSign = (zn, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), new THREE.MeshBasicMaterial({ map: signTexture(zn.name, '', zn.color) }));
    m.position.set(x, 2.2, z); scene.add(m);
  };
  doorSign(Z.ceo, -9.3, -2.89); doorSign(Z.pant, 9, -2.89);
  const meetSign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), new THREE.MeshBasicMaterial({ map: signTexture('회의실', '', Z.meet.color) }));
  meetSign.position.set(-1, 2.72, -2.9); scene.add(meetSign);

  // 포스터·시계
  const poster = (lines, x, z, rotY, bg, fg) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.85), new THREE.MeshBasicMaterial({ map: posterTexture(lines, bg, fg) }));
    m.position.set(x, 1.6, z); m.rotation.y = rotY; scene.add(m);
  };
  poster(['야근은', '미덕이', '아닙니다'], -12.88, 4.3, Math.PI / 2);
  poster(['고객이', '먼저다', '(나는?)'], 12.88, 3, -Math.PI / 2, '#3a1f1f', '#ffb3a0');
  poster(['오늘 할 일을', '내일로', '미루지 말자'], 4.6, -2.89, 0, '#1f3a2c', '#b8ffcf');
  poster(['리스크는', '관리하는 것', '피하는 게 아님'], -11.2, -2.89, 0, '#2a1f3a', '#e0c8ff');

  const cc = document.createElement('canvas'); cc.width = cc.height = 128;
  const cg = cc.getContext('2d');
  cg.fillStyle = '#fff'; cg.beginPath(); cg.arc(64, 64, 60, 0, 7); cg.fill();
  cg.lineWidth = 6; cg.strokeStyle = '#222'; cg.stroke(); cg.lineCap = 'round';
  cg.beginPath(); cg.moveTo(64, 64); cg.lineTo(64, 100); cg.stroke();
  cg.lineWidth = 4; cg.beginPath(); cg.moveTo(64, 64); cg.lineTo(64, 16); cg.stroke();
  const clockTex = new THREE.CanvasTexture(cc); clockTex.colorSpace = THREE.SRGBColorSpace;
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ map: clockTex }));
  clock.position.set(0, 2.45, 8.89); clock.rotation.y = Math.PI; scene.add(clock);

  // 출입구 (남쪽) 유리문 장식 + EXIT
  const exitTex = signTexture('EXIT 퇴근', '', '#1e8449');
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3), new THREE.MeshBasicMaterial({ map: exitTex }));
  exit.position.set(0, 2.6, 8.88); exit.rotation.y = Math.PI; scene.add(exit);
  const doorGlass = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, transparent: true, opacity: 0.35, roughness: 0.1 });
  for (const sx of [-0.6, 0.6]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.3, 0.05), doorGlass); d.position.set(sx, 1.15, 9.0); scene.add(d);
  }
  colliders.push({ minX: -1.2, maxX: 1.2, minZ: 8.9, maxZ: 9.2 });

  return { surfaces, colliders };
}

// ------------------------------------------------------------------
// 부술 수 있는 물건 배치
// ------------------------------------------------------------------
export function buildObjects(env) {
  const list = [];
  const B = (id, x, z, o) => { const b = build(env, id, x, z, o); list.push(b); return b; };

  // 책상 묶음(2x2 마주보기) + 모니터 + 의자
  const pod = (cx, cz, screens) => {
    let i = 0;
    for (const dx of [-0.72, 0.72]) {
      for (const [dz, rot] of [[-0.38, Math.PI], [0.38, 0]]) {
        const d = B('desk', cx + dx, cz + dz, { rot });
        B('monitor', 0, 0, { on: d, offset: [-0.08, -0.14], screen: screens[i % screens.length] });
        const local = new THREE.Vector3(-0.05, 0, 0.62).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        B('chair', cx + dx + local.x, cz + dz + local.z, { rot: rot + (Math.random() - 0.5) * 0.5 });
        i++;
      }
    }
  };

  // 경영지원부
  pod(-9, 2.6, ['excel', 'mail']);
  B('cabinet', -12.5, 0.6, { rot: Math.PI / 2 }); B('cabinet', -12.5, 1.2, { rot: Math.PI / 2 }); B('cabinet', -12.5, 1.8, { rot: Math.PI / 2 });
  B('copier', -12.3, 6.6, { rot: Math.PI / 2 });
  B('plant', -5.7, 8.3); B('plant', -12.4, 8.3);
  B('waterCooler', -8, 8.5, { rot: Math.PI });

  // 리스크관리부
  pod(-1, 2.6, ['risk', 'excel', 'chart', 'mail']);
  B('whiteboard', -1, 6.4, { rot: Math.PI, wb: 2 });
  B('cabinet', -4.2, 8.45, { rot: Math.PI }); B('cabinet', -3.6, 8.45, { rot: Math.PI });
  B('plant', 2.4, 8.3); B('plant', -4.4, -0.2);
  B('copier', 2.2, 6.8, { rot: -Math.PI / 2 });

  // 영업부
  pod(8, 2.6, ['chart', 'mail']);
  B('whiteboard', 8, 6.4, { rot: Math.PI, wb: 1 });
  B('cabinet', 12.5, 0.8, { rot: -Math.PI / 2 }); B('cabinet', 12.5, 1.4, { rot: -Math.PI / 2 });
  B('plant', 12.3, 8.3); B('plant', 3.7, 8.3);
  B('waterCooler', 11, 8.5, { rot: Math.PI });

  // 부서 사이 파티션
  for (const x of [-5, 3]) for (const z of [0.6, 2.3, 6.4]) B('partition', x, z, { rot: Math.PI / 2 });

  // 대표이사실
  const boss = B('bossDesk', -9, -7.3, { rot: Math.PI });
  B('monitor', 0, 0, { on: boss, offset: [-0.2, -0.22], screen: 'chart' });
  B('bossChair', -9, -8.2, { rot: 0 });
  B('bookshelf', -12.7, -6.8, { rot: Math.PI / 2 }); B('bookshelf', -12.7, -5.4, { rot: Math.PI / 2 });
  B('sofa', -5.7, -5.6, { rot: -Math.PI / 2 });
  B('plant', -5.6, -8.4); B('plant', -12.4, -3.6);
  B('cabinet', -10.6, -8.45, { rot: 0 });

  // 회의실
  B('meetingTable', -1, -6.1, { rot: 0 });
  for (const x of [-2.1, -1, 0.1]) { B('chair', x, -7.05, { rot: 0 }); B('chair', x, -5.15, { rot: Math.PI }); }
  B('tv', -1, -8.6, { rot: 0, screen: 'ppt' });
  B('whiteboard', 2.2, -7.6, { rot: -Math.PI / 2, wb: 0 });
  B('plant', -4.4, -8.4);
  for (const x of [-4, -2, 2]) B('glassWall', x, -3, { rot: 0 }); // 가운데(-1~1)는 출입구

  // 탕비실
  const counter = B('counter', 7.6, -8.55, { rot: 0 });
  B('coffeeMachine', 0, 0, { on: counter, offset: [-0.6, 0] });
  B('coffeeMachine', 0, 0, { on: counter, offset: [0.5, 0] });
  B('fridge', 9.6, -8.5, { rot: 0 });
  B('vending', 4.0, -8.45, { rot: 0 });
  B('waterCooler', 12.5, -4, { rot: -Math.PI / 2 });
  B('meetingTable', 8, -5.6, { rot: 0 });
  B('chair', 7.2, -4.6, { rot: Math.PI }); B('chair', 8.8, -4.6, { rot: Math.PI });
  B('plant', 12.4, -8.4);

  for (const b of list) b.zone = zoneAt(b.center.x, b.center.z);
  return list;
}
