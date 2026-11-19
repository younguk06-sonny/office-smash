// Web Audio로 합성한 효과음 (외부 음원 파일 없음)
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6;
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.8;
}
export const isMuted = () => muted;

function noise(dur, type, freq, q, gain, t0 = 0, attack = 0.002) {
  if (!ctx) return;
  const t = ctx.currentTime + t0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

function tone(freq, dur, gain, type = 'sine', t0 = 0, endFreq = null) {
  if (!ctx) return;
  const t = ctx.currentTime + t0;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  // 재질별 타격음
  hit(kind = 'plastic', power = 1) {
    if (!ctx) return;
    tone(110 * (0.9 + Math.random() * 0.2), 0.16, 0.7 * power, 'sine', 0, 45); // 묵직한 저음
    switch (kind) {
      case 'glass':
        noise(0.22, 'highpass', 3000, 0.7, 0.55 * power);
        for (let i = 0; i < 4; i++) tone(2400 + Math.random() * 2600, 0.12 + Math.random() * 0.15, 0.06, 'sine', Math.random() * 0.08);
        break;
      case 'metal':
        [520, 1390, 2230].forEach((f, i) => tone(f * (0.95 + Math.random() * 0.1), 0.35 - i * 0.08, 0.13, 'triangle'));
        noise(0.08, 'bandpass', 2500, 2, 0.4 * power);
        break;
      case 'wood':
        noise(0.12, 'lowpass', 700, 1, 0.8 * power);
        tone(180, 0.1, 0.35, 'triangle', 0, 90);
        break;
      case 'paper':
        noise(0.18, 'bandpass', 1800, 0.6, 0.35);
        break;
      default: // plastic
        noise(0.09, 'bandpass', 1300, 1.2, 0.75 * power);
        tone(320, 0.06, 0.2, 'square', 0, 160);
    }
  },
  crack() { noise(0.15, 'highpass', 1800, 1, 0.45); tone(900, 0.05, 0.08, 'square', 0, 300); },
  breakPart(kind = 'plastic') {
    noise(0.35, kind === 'glass' ? 'highpass' : 'bandpass', kind === 'glass' ? 2500 : 900, 0.8, 0.8);
    tone(90, 0.25, 0.6, 'sine', 0, 40);
    for (let i = 0; i < 3; i++) noise(0.08, 'bandpass', 600 + Math.random() * 1500, 2, 0.35, 0.06 + i * 0.07);
  },
  destroy(kind = 'plastic') {
    tone(70, 0.6, 0.9, 'sine', 0, 30);
    noise(0.7, 'lowpass', 1600, 0.7, 0.9);
    if (kind === 'glass') {
      noise(0.6, 'highpass', 3500, 0.5, 0.7, 0.02);
      for (let i = 0; i < 10; i++) tone(2000 + Math.random() * 4000, 0.15, 0.05, 'sine', 0.05 + Math.random() * 0.4);
    }
    for (let i = 0; i < 6; i++) noise(0.1, 'bandpass', 400 + Math.random() * 2000, 2, 0.3, 0.1 + i * 0.09 + Math.random() * 0.05);
  },
  paper() { noise(0.4, 'bandpass', 2200, 0.5, 0.3); noise(0.3, 'highpass', 4000, 0.5, 0.15, 0.1); },
  whoosh() { noise(0.12, 'bandpass', 800, 0.8, 0.12, 0, 0.05); },
  thud() { tone(80, 0.15, 0.5, 'sine', 0, 40); noise(0.08, 'lowpass', 400, 1, 0.4); },
  combo(level) { tone(600 + level * 80, 0.1, 0.12, 'square', 0, 900 + level * 80); },
  punch() { tone(140, 0.09, 0.6, 'sine', 0, 60); noise(0.06, 'bandpass', 900, 1, 0.5); },
  swing(heavy = false) { noise(heavy ? 0.22 : 0.14, 'bandpass', heavy ? 500 : 900, 0.9, heavy ? 0.28 : 0.18, 0, 0.06); },
  explosion() {
    if (!ctx) return;
    tone(65, 1.4, 1.0, 'sine', 0, 22);
    tone(40, 1.0, 0.8, 'triangle', 0, 20);
    noise(1.6, 'lowpass', 900, 0.6, 1.0, 0, 0.005);
    noise(0.5, 'bandpass', 2500, 0.5, 0.5);
    for (let i = 0; i < 12; i++) noise(0.09, 'bandpass', 500 + Math.random() * 3000, 2, 0.25, 0.15 + Math.random() * 0.9);
  },
  fuse() { noise(0.08, 'highpass', 5000, 1, 0.08); },
  throwBomb() { noise(0.2, 'bandpass', 700, 0.8, 0.2, 0, 0.05); tone(300, 0.15, 0.08, 'triangle', 0, 180); },
  laser() { tone(1900 + Math.random() * 300, 0.07, 0.07, 'sawtooth', 0, 500); },
  sizzle() { noise(0.1, 'highpass', 3500, 1, 0.12); },
  water() { noise(0.6, 'bandpass', 700, 0.7, 0.5); for (let i = 0; i < 6; i++) tone(300 + Math.random() * 500, 0.08, 0.08, 'sine', Math.random() * 0.4, 900); },
  pry() { tone(220, 0.2, 0.25, 'sawtooth', 0, 90); noise(0.15, 'bandpass', 1500, 2, 0.4); },
  unlock() { [660, 880, 1320].forEach((f, i) => tone(f, 0.18, 0.15, 'triangle', i * 0.07)); },
  tick() { tone(1200, 0.05, 0.12, 'square'); },
  ui() { tone(700, 0.06, 0.12, 'triangle', 0, 1000); },
  locked() { tone(300, 0.12, 0.15, 'square', 0, 200); },
  clear() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 0.16, 'triangle', i * 0.09)); },
  gameOver() { [784, 659, 523, 392].forEach((f, i) => tone(f, 0.3, 0.16, 'triangle', i * 0.13)); },
};

export function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* 미지원 브라우저 */ }
}
