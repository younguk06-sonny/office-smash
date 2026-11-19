// 외부 이미지 없이 Canvas로 모든 텍스처를 생성합니다.
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export function woodTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#9a7650'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * h;
      g.strokeStyle = `rgba(${60 + Math.random() * 40},${40 + Math.random() * 25},20,${rand(0.08, 0.25)})`;
      g.lineWidth = rand(0.5, 2.5);
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
      g.stroke();
    }
  });
}

export function carpetTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#4a5260'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 26;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
    g.strokeRect(0, 0, w, h); // 카펫 타일 경계
  }, [8, 8]);
}

export function wallTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#d9d4c7'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, [4, 2]);
}

export function keyboardTexture() {
  return canvasTexture(256, 96, (g, w, h) => {
    g.fillStyle = '#16181c'; g.fillRect(0, 0, w, h);
    const rows = 5, cols = 15;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const kw = w / cols, kh = h / rows;
        g.fillStyle = '#2c3038';
        g.fillRect(c * kw + 1.5, r * kh + 1.5, kw - 3, kh - 3);
      }
    }
    g.fillStyle = '#2c3038'; g.fillRect(w * 0.3, h * 0.8 + 1, w * 0.4, h * 0.2 - 3); // 스페이스바
  });
}

export function whiteboardTexture() {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#f4f6f6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c0392b'; g.font = 'bold 34px sans-serif';
    g.fillText('이번 분기 목표', 24, 52);
    g.fillStyle = '#1f4e8c'; g.font = '26px sans-serif';
    g.fillText('1. 야근 0회  (진행률 0%)', 24, 104);
    g.fillText('2. 회의 줄이기 → 회의로 논의', 24, 146);
    g.fillText('3. 보고서 최종_진짜최종_v7', 24, 188);
    g.strokeStyle = '#27ae60'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(360, 230); g.lineTo(400, 200); g.lineTo(440, 215); g.lineTo(490, 150); g.stroke();
  });
}

// 균열 그리기 (화면용·데칼용 공용)
export function drawCracks(g, x, y, r, spokes, opts = {}) {
  const light = opts.light ?? 'rgba(255,255,255,0.55)';
  const dark = opts.dark ?? 'rgba(15,15,18,0.92)';
  const width = opts.width ?? 2;
  const paths = [];
  const rings = [];
  for (let i = 0; i < spokes; i++) {
    let a = (i / spokes) * Math.PI * 2 + rand(-0.35, 0.35);
    let px = x, py = y;
    const segs = 4 + ((Math.random() * 4) | 0);
    const len = r * rand(0.55, 1.1);
    const pts = [[px, py]];
    for (let s = 0; s < segs; s++) {
      a += rand(-0.45, 0.45);
      const step = len / segs;
      px += Math.cos(a) * step; py += Math.sin(a) * step;
      pts.push([px, py]);
      if (s > 0 && Math.random() < 0.3) {
        const ba = a + rand(-1.1, 1.1), bl = step * rand(0.6, 1.4);
        paths.push([[px, py], [px + Math.cos(ba) * bl, py + Math.sin(ba) * bl]]);
      }
    }
    paths.push(pts);
    rings.push(pts);
  }
  // 동심원 방향 연결선 (유리 깨짐 느낌)
  for (let k = 1; k <= 2; k++) {
    for (let i = 0; i < rings.length; i++) {
      const a = rings[i], b = rings[(i + 1) % rings.length];
      const ia = Math.min(a.length - 1, k + 1), ib = Math.min(b.length - 1, k + 1);
      if (Math.random() < 0.7) paths.push([a[ia], b[ib]]);
    }
  }
  const stroke = (style, lw) => {
    g.strokeStyle = style; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    for (const p of paths) {
      g.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
    }
    g.stroke();
  };
  stroke(light, width + 1.6);
  stroke(dark, width);
  // 충격 중심점
  g.fillStyle = dark;
  g.beginPath(); g.arc(x, y, width * 1.6, 0, Math.PI * 2); g.fill();
}

export function makeCrackTextures(n = 4) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const t = canvasTexture(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      drawCracks(g, w / 2, h / 2, w * 0.46, 6 + i, { width: 2.2 });
    });
    list.push(t);
  }
  return list;
}

// 모니터 화면: 업무 화면을 그리고, 타격 지점에 실시간으로 균열을 그립니다.
export class ScreenCanvas {
  constructor(kind = 'excel') {
    this.W = 512; this.H = 320;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.g = this.canvas.getContext('2d');
    this.kind = kind;
    this.drawDesktop();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  drawDesktop() {
    const g = this.g, W = this.W, H = this.H;
    if (this.kind === 'excel') {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1e7145'; g.fillRect(0, 0, W, 30);
      g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif';
      g.fillText('주간업무보고_최종_진짜최종(7).xlsx', 10, 20);
      g.strokeStyle = '#d0d0d0'; g.lineWidth = 1;
      for (let x = 0; x < W; x += 52) { g.beginPath(); g.moveTo(x, 30); g.lineTo(x, H); g.stroke(); }
      for (let y = 30; y < H; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.font = '12px sans-serif';
      for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 9; c++) {
          if (Math.random() < 0.6) {
            g.fillStyle = Math.random() < 0.12 ? '#c0392b' : '#333';
            g.fillText(String((Math.random() * 9999) | 0), c * 52 + 6, 45 + r * 20 + 2);
          }
        }
      }
      // 팝업
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(96, 104, 330, 110);
      g.fillStyle = '#fdfdfd'; g.fillRect(90, 98, 330, 110);
      g.strokeStyle = '#888'; g.strokeRect(90, 98, 330, 110);
      g.fillStyle = '#c0392b'; g.font = 'bold 17px sans-serif';
      g.fillText('부장님 (메신저)', 108, 128);
      g.fillStyle = '#222'; g.font = '16px sans-serif';
      g.fillText('이거 오늘까지 가능하죠? ^^', 108, 160);
      g.fillStyle = '#999'; g.font = '13px sans-serif';
      g.fillText('오후 5시 58분', 108, 190);
    } else {
      g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#2b5797'; g.fillRect(0, 0, W, 34);
      g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif';
      g.fillText('받은메일함 (읽지 않음 999+)', 12, 23);
      const subjects = ['[긴급] 금일 회의 자료 요청', 'RE: RE: RE: FW: 확인 부탁드립니다', '[필독] 주말 워크숍 안내', '회신 바랍니다 (재요청)', '[긴급] 위 메일 건 관련', '내일 아침 8시 회의'];
      for (let i = 0; i < 11; i++) {
        const y = 40 + i * 25;
        g.fillStyle = i % 2 ? '#ffffff' : '#eef1f6'; g.fillRect(0, y, W, 25);
        g.fillStyle = i < 4 ? '#c0392b' : '#333';
        g.font = (i < 6 ? 'bold ' : '') + '13px sans-serif';
        g.fillText(subjects[i % subjects.length], 14, y + 17);
      }
    }
  }

  crack(u, v, size = 1) {
    const x = u * this.W, y = (1 - v) * this.H;
    drawCracks(this.g, x, y, 60 * size + 20, 6 + ((Math.random() * 4) | 0), { width: 1.4 + size * 0.6 });
    // 균열 주변 픽셀 번짐 (LCD 손상)
    if (size > 1) {
      const grad = this.g.createRadialGradient(x, y, 2, x, y, 40 * size);
      grad.addColorStop(0, 'rgba(10,10,20,0.85)');
      grad.addColorStop(0.5, 'rgba(60,0,90,0.35)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      this.g.fillStyle = grad;
      this.g.fillRect(x - 60 * size, y - 60 * size, 120 * size, 120 * size);
    }
    this.texture.needsUpdate = true;
  }

  glitch() {
    const g = this.g;
    for (let i = 0; i < 9; i++) {
      const y = Math.random() * this.H;
      const colors = ['rgba(0,255,120,0.55)', 'rgba(255,0,160,0.5)', 'rgba(0,160,255,0.5)', 'rgba(255,255,255,0.7)'];
      g.fillStyle = colors[i % colors.length];
      g.fillRect(0, y, this.W, rand(2, 7));
    }
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(this.W * rand(0.3, 0.7), 0, this.W * 0.6, this.H);
    this.texture.needsUpdate = true;
  }

  dispose() { this.texture.dispose(); }
}
