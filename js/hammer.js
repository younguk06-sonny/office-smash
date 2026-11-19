// 망치 3D 모델과 휘두르기 애니메이션
import * as THREE from 'three';

const L = 0.42;        // 손잡이 길이
const HEAD_HALF = 0.075;
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Hammer {
  constructor(scene) {
    this.pivot = new THREE.Group();      // 손 위치
    this.swing = new THREE.Group();      // 휘두르는 회전
    this.pivot.add(this.swing);
    const wood = new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, metalness: 0.95, roughness: 0.25 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0xd0452c, roughness: 0.8 });

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, L, 10), wood);
    handle.geometry.rotateX(Math.PI / 2); handle.position.z = L / 2;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.13, 10), rubber);
    grip.geometry.rotateX(Math.PI / 2); grip.position.z = 0.07;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.15, 0.055), steel);
    head.position.z = L;
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.025, 14), steel);
    face.position.set(0, -HEAD_HALF + 0.005, L);
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.03), steel);
    claw.position.set(0, HEAD_HALF + 0.02, L - 0.01); claw.rotation.x = 0.4;
    [handle, grip, head, face, claw].forEach(m => { m.castShadow = true; this.swing.add(m); });

    this.pivot.visible = false;
    scene.add(this.pivot);
    this.state = 'idle';
    this.t = 0;
    this.onImpact = null;
    this.queued = null;
    this.swingTime = 0.075;
    this.recoilTime = 0.13;
  }

  get ready() { return this.state === 'idle' || (this.state === 'recoil' && this.t > 0.05); }

  // hit: { point, normal(월드) }, camPos: 카메라 위치
  strike(point, normal, camPos, onImpact) {
    if (!this.ready) { this.queued = { point: point.clone(), normal: normal.clone(), camPos: camPos.clone(), onImpact }; return; }
    this.queued = null;
    const n = _y.copy(normal).normalize();
    // 손잡이 방향: 표면에 평행하면서 카메라 쪽(약간 오른쪽)을 향하게
    const toCam = _z.copy(camPos).sub(point).normalize();
    const h = toCam.clone().addScaledVector(n, -toCam.dot(n));
    if (h.lengthSq() < 1e-4) h.set(1, 0, 0).addScaledVector(n, -n.x);
    h.normalize();
    const zAxis = h.clone().negate();               // 손 → 망치머리
    const xAxis = _x.crossVectors(n, zAxis).normalize();
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    _m.makeBasis(xAxis, yAxis, zAxis);
    this.pivot.quaternion.setFromRotationMatrix(_m);
    this.pivot.position.copy(point).addScaledVector(yAxis, HEAD_HALF).addScaledVector(h, L);
    this.pivot.rotateZ((Math.random() - 0.5) * 0.3);
    this.pivot.visible = true;
    this.pivot.scale.setScalar(1);
    this.state = 'swing';
    this.t = 0;
    this.onImpact = onImpact;
    this.swing.rotation.x = -1.5;
  }

  update(dt) {
    if (this.state === 'idle') return;
    this.t += dt;
    if (this.state === 'swing') {
      const k = Math.min(1, this.t / this.swingTime);
      this.swing.rotation.x = -1.5 * (1 - k * k); // 가속하며 내려침
      if (k >= 1) {
        this.state = 'recoil'; this.t = 0;
        const cb = this.onImpact; this.onImpact = null;
        if (cb) cb();
      }
    } else if (this.state === 'recoil') {
      const k = Math.min(1, this.t / this.recoilTime);
      this.swing.rotation.x = -0.45 * Math.sin(k * Math.PI * 0.5);
      this.pivot.scale.setScalar(1 - Math.max(0, k - 0.6) * 2.5);
      if (k >= 1) { this.state = 'idle'; this.pivot.visible = false; }
    }
    if (this.queued && this.ready) {
      const q = this.queued;
      this.strike(q.point, q.normal, q.camPos, q.onImpact);
    }
  }

  reset() {
    this.state = 'idle'; this.queued = null; this.onImpact = null; this.pivot.visible = false;
  }
}
