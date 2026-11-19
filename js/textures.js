// 외부 이미지 없이 Canvas로 모든 텍스처를 생성합니다.
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

export function canvasTexture(w, h, draw, repeat) {
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

function noiseFill(g, w, h, amount) {
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

export function woodTexture(base = '#9a7650') {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * h;
      g.strokeStyle = `rgba(40,25,10,${rand(0.06, 0.22)})`;
      g.lineWidth = rand(0.5, 2.5);
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
      g.stroke();
    }
  });
}

export function carpetTexture(color = '#4a5260', repeat = 8) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    noiseFill(g, w, h, 26);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  }, [repeat, repeat]);
}

export function woodFloorTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      const l = 90 + Math.random() * 30;
      g.fillStyle = `rgb(${l + 40},${l + 10},${l - 25})`;
      g.fillRect(0, i * 32, w, 32);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, i * 32, w, 1.5);
      const off = Math.random() * w; g.fillRect(off, i * 32, 1.5, 32);
    }
    noiseFill(g, w, h, 14);
  }, [6, 6]);
}

export function tileTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e9ebe8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b9bdb9'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke();
    }
    noiseFill(g, w, h, 8);
  }, [10, 10]);
}

export function wallTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#dcd7cb'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, [6, 2]);
}

export function keyboardTexture() {
  return canvasTexture(256, 96, (g, w, h) => {
    g.fillStyle = '#16181c'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) {
      const kw = w / 15, kh = h / 5;
      g.fillStyle = '#2c3038'; g.fillRect(c * kw + 1.5, r * kh + 1.5, kw - 3, kh - 3);
    }
  });
}

export function whiteboardTexture(kind = 0) {
  return canvasTexture(512, 300, (g, w, h) => {
    g.fillStyle = '#f4f6f6'; g.fillRect(0, 0, w, h);
    const sets = [
      ['이번 분기 목표', '1. 야근 0회 (진행률 0%)', '2. 회의 줄이기 → 회의로 논의', '3. 보고서_최종_진짜최종_v7'],
      ['영업 실적 현황', '목표 120% → 실적 38%', '"다음 달엔 꼭…"', '주말 미팅 필참!!'],
      ['리스크 점검 TODO', '□ 한도 모니터링', '□ 사업수지 재검토', '□ 오늘 퇴근하기 (불가)'],
    ];
    const s = sets[kind % sets.length];
    g.fillStyle = '#c0392b'; g.font = 'bold 38px sans-serif'; g.fillText(s[0], 24, 58);
    g.fillStyle = '#1f4e8c'; g.font = '28px sans-serif';
    s.slice(1).forEach((t, i) => g.fillText(t, 24, 118 + i * 50));
    g.strokeStyle = '#27ae60'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(360, 270); g.lineTo(400, 230); g.lineTo(440, 250); g.lineTo(490, 180); g.stroke();
  });
}

export function signTexture(title, sub, color = '#2b5797') {
  return canvasTexture(512, 160, (g, w, h) => {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.fillRect(0, 0, 22, h);
    g.fillStyle = '#1d1f24'; g.font = 'bold 64px sans-serif'; g.textBaseline = 'middle';
    g.fillText(title, 48, sub ? 66 : h / 2);
    if (sub) { g.fillStyle = '#7a7f87'; g.font = '28px sans-serif'; g.fillText(sub, 50, 122); }
  });
}

export function posterTexture(lines, bg = '#1f2a44', fg = '#ffd36b') {
  return canvasTexture(256, 360, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = fg; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
    lines.forEach((t, i) => g.fillText(t, w / 2, 120 + i * 48));
  });
}

export function cityTexture(evening = true) {
  return canvasTexture(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    if (evening) { grad.addColorStop(0, '#2b2d5a'); grad.addColorStop(0.55, '#e0785a'); grad.addColorStop(1, '#f6c27a'); }
    else { grad.addColorStop(0, '#6aa6e8'); grad.addColorStop(1, '#d8ecff'); }
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      const bw = 14 + Math.random() * 30, bh = 60 + Math.random() * 160, bx = i * 18 - 10;
      g.fillStyle = '#1d1f33'; g.fillRect(bx, h - bh, bw, bh);
      g.fillStyle = 'rgba(255,220,140,0.85)';
      for (let wy = h - bh + 6; wy < h - 4; wy += 9) for (let wx = bx + 3; wx < bx + bw - 3; wx += 6) if (Math.random() < 0.45) g.fillRect(wx, wy, 3, 4);
    }
  });
}

export function bookTexture() {
  return canvasTexture(256, 64, (g, w, h) => {
    let x = 0;
    const cols = ['#8e2b2b', '#2b4f8e', '#2e7a4a', '#c79a2b', '#4a3a6e', '#333', '#a0522d', '#1f6f78'];
    while (x < w) {
      const bw = 8 + Math.random() * 14;
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      const bh = h * rand(0.75, 1);
      g.fillRect(x, h - bh, bw - 1, bh);
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x + 2, h - bh + 8, bw - 5, 3);
      x += bw;
    }
  });
}

export function canTexture() {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#20232a'; g.fillRect(0, 0, w, h);
    const cols = ['#d62828', '#f77f00', '#2a9d8f', '#457b9d', '#e9c46a', '#8d99ae'];
    for (let r = 0; r < 6; r++) {
      g.fillStyle = '#555'; g.fillRect(0, r * 42 + 38, w, 3);
      for (let c = 0; c < 4; c++) { g.fillStyle = cols[(r + c) % cols.length]; g.fillRect(8 + c * 30, r * 42 + 6, 22, 32); }
    }
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
  g.fillStyle = dark;
  g.beginPath(); g.arc(x, y, width * 1.6, 0, Math.PI * 2); g.fill();
}

export function makeCrackTextures(n = 4) {
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push(canvasTexture(128, 128, (g, w, h) => drawCracks(g, w / 2, h / 2, w * 0.46, 6 + i, { width: 2.2 })));
  }
  return list;
}

// 그을음(폭발·레이저 자국)
export function makeScorchTextures(n = 2) {
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push(canvasTexture(128, 128, (g, w, h) => {
      const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0, 'rgba(10,8,6,0.95)'); grad.addColorStop(0.5, 'rgba(25,18,12,0.7)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`;
        const a = Math.random() * 6.28, r = Math.random() * 55;
        g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rand(1, 5), 0, 7); g.fill();
      }
    }));
  }
  return list;
}

// 모니터/TV 화면: 업무 화면을 그리고, 타격 지점에 실시간으로 균열을 그립니다.
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
    const k = this.kind;
    if (k === 'excel') {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1e7145'; g.fillRect(0, 0, W, 30);
      g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif';
      g.fillText('주간업무보고_최종_진짜최종(7).xlsx', 10, 20);
      g.strokeStyle = '#d0d0d0'; g.lineWidth = 1;
      for (let x = 0; x < W; x += 52) { g.beginPath(); g.moveTo(x, 30); g.lineTo(x, H); g.stroke(); }
      for (let y = 30; y < H; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.font = '12px sans-serif';
      for (let r = 0; r < 13; r++) for (let c = 0; c < 9; c++) if (Math.random() < 0.6) {
        g.fillStyle = Math.random() < 0.12 ? '#c0392b' : '#333';
        g.fillText(String((Math.random() * 9999) | 0), c * 52 + 6, 47 + r * 20);
      }
      this.popup('부장님 (메신저)', '이거 오늘까지 가능하죠? ^^', '오후 5시 58분');
    } else if (k === 'mail') {
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
    } else if (k === 'chart' || k === 'risk') {
      g.fillStyle = '#0f1724'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#e6e9ef'; g.font = 'bold 18px sans-serif';
      g.fillText(k === 'risk' ? '리스크 모니터링 대시보드' : '월간 실적 현황', 14, 28);
      g.strokeStyle = '#2a3a52'; g.lineWidth = 1;
      for (let y = 60; y < H - 20; y += 40) { g.beginPath(); g.moveTo(40, y); g.lineTo(W - 20, y); g.stroke(); }
      g.strokeStyle = '#ff5a5a'; g.lineWidth = 4; g.beginPath();
      let y = 80;
      for (let x = 40; x < W - 20; x += 30) { y += rand(-6, 22); g.lineTo(x, Math.min(H - 30, y)); }
      g.stroke();
      g.fillStyle = '#ff5a5a'; g.font = 'bold 22px sans-serif';
      g.fillText(k === 'risk' ? '⚠ 경고 12건' : '▼ 목표 대비 -62%', W - 220, 28);
    } else if (k === 'ppt') {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#c0392b'; g.fillRect(0, 0, W, 70);
      g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.fillText('2027 중장기 전략 (안)', 24, 46);
      g.fillStyle = '#333'; g.font = '22px sans-serif';
      ['• 혁신적 시너지 극대화', '• 고객 중심 패러다임 전환', '• 회의 효율화를 위한 회의 신설'].forEach((t, i) => g.fillText(t, 30, 120 + i * 50));
      g.fillStyle = '#999'; g.font = '16px sans-serif'; g.fillText('1 / 87', W - 70, H - 16);
    }
  }

  popup(title, body, time) {
    const g = this.g;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(96, 104, 330, 110);
    g.fillStyle = '#fdfdfd'; g.fillRect(90, 98, 330, 110);
    g.strokeStyle = '#888'; g.strokeRect(90, 98, 330, 110);
    g.fillStyle = '#c0392b'; g.font = 'bold 17px sans-serif'; g.fillText(title, 108, 128);
    g.fillStyle = '#222'; g.font = '16px sans-serif'; g.fillText(body, 108, 160);
    g.fillStyle = '#999'; g.font = '13px sans-serif'; g.fillText(time, 108, 190);
  }

  crack(u, v, size = 1) {
    const x = u * this.W, y = (1 - v) * this.H;
    drawCracks(this.g, x, y, 60 * size + 20, 6 + ((Math.random() * 4) | 0), { width: 1.4 + size * 0.6 });
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
    const colors = ['rgba(0,255,120,0.55)', 'rgba(255,0,160,0.5)', 'rgba(0,160,255,0.5)', 'rgba(255,255,255,0.7)'];
    for (let i = 0; i < 9; i++) {
      g.fillStyle = colors[i % colors.length];
      g.fillRect(0, Math.random() * this.H, this.W, rand(2, 7));
    }
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(this.W * rand(0.3, 0.7), 0, this.W * 0.6, this.H);
    this.texture.needsUpdate = true;
  }

  dispose() { this.texture.dispose(); }
}
