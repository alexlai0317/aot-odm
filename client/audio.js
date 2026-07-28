// 全部音效都用 WebAudio 即時合成，不載任何音檔（專案就能保持零資產）。
// AudioContext 必須在使用者互動之後才建立，所以由 main.js 在按下開始時呼叫 init()。

let ctx = null;
let master = null;
let noiseBuffer = null;
let gasSource = null;
let gasGain = null;

export function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // 一秒白噪音，之後所有的噴射/揮刀風聲都從這個 buffer 循環取樣
  const length = ctx.sampleRate;
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  setupGasLoop();
}

export function resume() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function setupGasLoop() {
  gasSource = ctx.createBufferSource();
  gasSource.buffer = noiseBuffer;
  gasSource.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200;
  filter.Q.value = 0.8;

  gasGain = ctx.createGain();
  gasGain.gain.value = 0;

  gasSource.connect(filter).connect(gasGain).connect(master);
  gasSource.start();
}

// 瓦斯是持續音，用音量包絡開關而不是每次重建音源
export function setGas(active, intensity = 1) {
  if (!ctx) return;
  const target = active ? 0.13 * intensity : 0;
  gasGain.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
}

function noiseBurst({ duration = 0.2, freq = 1200, q = 1, gain = 0.3, type = 'bandpass', sweep = 0 }) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, ctx.currentTime);
  if (sweep) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(60, freq + sweep),
      ctx.currentTime + duration
    );
  }
  filter.Q.value = q;

  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, ctx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

  src.connect(filter).connect(env).connect(master);
  src.start();
  src.stop(ctx.currentTime + duration + 0.02);
}

function tone({ freq = 440, duration = 0.2, gain = 0.2, type = 'sine', slideTo = null }) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + duration);
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, ctx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

  osc.connect(env).connect(master);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.02);
}

export const sfx = {
  hookFire() {
    noiseBurst({ duration: 0.18, freq: 900, q: 2, gain: 0.22, sweep: 2600 });
    tone({ freq: 320, slideTo: 140, duration: 0.12, gain: 0.1, type: 'square' });
  },
  hookHit() {
    tone({ freq: 1400, slideTo: 600, duration: 0.09, gain: 0.12, type: 'triangle' });
  },
  hookMiss() {
    noiseBurst({ duration: 0.22, freq: 600, q: 1, gain: 0.1, sweep: -300 });
  },
  swing() {
    noiseBurst({ duration: 0.16, freq: 2800, q: 1.4, gain: 0.2, sweep: -2200 });
  },
  bladeClang() {
    // 速度不足彈開：金屬味的高頻雙音
    tone({ freq: 2400, slideTo: 1600, duration: 0.14, gain: 0.15, type: 'square' });
    tone({ freq: 3100, slideTo: 2100, duration: 0.1, gain: 0.08, type: 'square' });
  },
  fleshHit() {
    noiseBurst({ duration: 0.16, freq: 420, q: 0.7, gain: 0.28, sweep: -260 });
  },
  kill() {
    noiseBurst({ duration: 0.5, freq: 500, q: 0.5, gain: 0.34, sweep: -400 });
    tone({ freq: 180, slideTo: 55, duration: 0.55, gain: 0.26, type: 'sine' });
    tone({ freq: 90, slideTo: 40, duration: 0.7, gain: 0.2, type: 'triangle' });
  },
  roar() {
    tone({ freq: 120, slideTo: 62, duration: 0.9, gain: 0.2, type: 'sawtooth' });
    noiseBurst({ duration: 0.8, freq: 260, q: 0.6, gain: 0.16, sweep: -160 });
  },
  playerHurt() {
    tone({ freq: 200, slideTo: 70, duration: 0.35, gain: 0.3, type: 'sawtooth' });
    noiseBurst({ duration: 0.3, freq: 300, q: 0.5, gain: 0.2, sweep: -200 });
  },
  reload() {
    tone({ freq: 900, slideTo: 1500, duration: 0.1, gain: 0.12, type: 'square' });
    setTimeout(() => tone({ freq: 1500, slideTo: 800, duration: 0.12, gain: 0.12, type: 'square' }), 320);
  },
  waveStart() {
    tone({ freq: 300, slideTo: 450, duration: 0.5, gain: 0.18, type: 'triangle' });
    setTimeout(() => tone({ freq: 450, slideTo: 600, duration: 0.6, gain: 0.16, type: 'triangle' }), 240);
  },
  waveClear() {
    [523, 659, 784].forEach((f, i) => {
      setTimeout(() => tone({ freq: f, duration: 0.35, gain: 0.14, type: 'triangle' }), i * 130);
    });
  },
  gameOver() {
    tone({ freq: 220, slideTo: 55, duration: 1.4, gain: 0.26, type: 'sawtooth' });
  },
  transform() {
    tone({ freq: 90, slideTo: 260, duration: 0.7, gain: 0.3, type: 'sawtooth' });
    noiseBurst({ duration: 0.9, freq: 200, q: 0.5, gain: 0.24, sweep: 400 });
  },
  revert() {
    tone({ freq: 220, slideTo: 80, duration: 0.5, gain: 0.22, type: 'sine' });
  },
  punch() {
    noiseBurst({ duration: 0.12, freq: 300, q: 0.6, gain: 0.32, sweep: -220 });
    tone({ freq: 70, slideTo: 35, duration: 0.22, gain: 0.28, type: 'square' });
  },
  bossAppear() {
    tone({ freq: 80, slideTo: 45, duration: 1.2, gain: 0.28, type: 'sawtooth' });
    setTimeout(() => tone({ freq: 80, slideTo: 45, duration: 1.2, gain: 0.24, type: 'sawtooth' }), 300);
  },
};
