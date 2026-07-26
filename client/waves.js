import { WAVE_BREAK_TIME, WAVE_BASE_COUNT, WAVE_GROWTH, CITY_RADIUS } from './constants.js';

// 波次管理。難度是靠「數量成長 + 逐步解鎖巨人種類」堆上去的，
// 不是把血量往上加 —— 血量拉高只會讓每一刀都變鈍，數量變多才會逼玩家一直移動。

const UNLOCK = [
  { wave: 1, types: ['normal'] },
  { wave: 2, types: ['normal', 'small'] },
  { wave: 3, types: ['normal', 'small', 'abnormal'] },
  { wave: 5, types: ['normal', 'small', 'abnormal', 'large'] },
];

export class WaveManager {
  constructor(titanManager) {
    this.titans = titanManager;
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.state = 'break';
    this.breakTimer = 3; // 開局先給 3 秒適應鉤索
    this.spawnedThisWave = 0;
  }

  availableTypes() {
    let types = UNLOCK[0].types;
    for (const entry of UNLOCK) {
      if (this.wave >= entry.wave) types = entry.types;
    }
    return types;
  }

  countForWave(wave) {
    return Math.round(WAVE_BASE_COUNT + (wave - 1) * WAVE_GROWTH);
  }

  // 回傳這一幀發生的事件，交給 main.js 決定要播什麼提示
  update(dt, playerPos) {
    if (this.state === 'break') {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) {
        return this.startNextWave(playerPos);
      }
      return null;
    }

    if (this.titans.aliveCount === 0) {
      this.state = 'break';
      this.breakTimer = WAVE_BREAK_TIME;
      return { type: 'waveCleared', wave: this.wave };
    }
    return null;
  }

  startNextWave(playerPos) {
    this.wave += 1;
    this.state = 'active';
    const count = this.countForWave(this.wave);
    const types = this.availableTypes();

    for (let i = 0; i < count; i++) {
      const typeKey = pickType(types, this.wave, i);
      const { x, z } = spawnPosition(playerPos, i, count);
      this.titans.spawn(typeKey, x, z);
    }
    this.spawnedThisWave = count;
    return { type: 'waveStarted', wave: this.wave, count };
  }

  get label() {
    if (this.state === 'break') {
      return this.wave === 0 ? '準備出擊' : `第 ${this.wave} 波 · 肅清`;
    }
    return `第 ${this.wave} 波`;
  }

  get remainingText() {
    if (this.state === 'break') {
      return `下一波 ${Math.max(0, Math.ceil(this.breakTimer))} 秒`;
    }
    return `剩餘巨人 ${this.titans.aliveCount}`;
  }
}

function pickType(types, wave, index) {
  // 每一波都保證有一定比例的「一般巨人」當基底，其餘從已解鎖的種類裡抽
  if (index % 3 === 0) return 'normal';
  const pool = types.filter((t) => t !== 'normal');
  if (pool.length === 0) return 'normal';
  // 波數越高越容易抽到後期解鎖的種類
  const bias = Math.min(1, wave / 8);
  const idx = Math.floor(Math.pow(Math.random(), 1 - bias * 0.6) * pool.length);
  return pool[Math.min(pool.length - 1, idx)];
}

// 巨人從玩家四周的環形外圈出現：不會直接生在臉上，也不用跑太久才碰到面
function spawnPosition(playerPos, index, count) {
  const angle = (index / count) * Math.PI * 2 + Math.random() * 0.6;
  const distance = 110 + Math.random() * 90;
  let x = playerPos.x + Math.cos(angle) * distance;
  let z = playerPos.z + Math.sin(angle) * distance;

  const r = Math.hypot(x, z);
  if (r > CITY_RADIUS - 20) {
    const scale = (CITY_RADIUS - 20) / r;
    x *= scale;
    z *= scale;
  }
  return { x, z };
}
