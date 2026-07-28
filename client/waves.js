import {
  WAVE_BREAK_TIME,
  WAVE_BASE_COUNT,
  WAVE_GROWTH,
  CITY_RADIUS,
  BOSS_ORDER,
  BOSS_WAVE_INTERVAL,
  BOSS_REPEAT_SCALE,
  BOSS_ESCORT_SCALE,
  BOSS_TITAN_TYPES,
} from './constants.js';
import { BossTitan } from './bossTitan.js';

// 波次管理。難度是靠「數量成長 + 逐步解鎖泰坦種類」堆上去的，
// 不是把血量往上加 —— 血量拉高只會讓每一刀都變鈍，數量變多才會逼玩家一直移動。

const UNLOCK = [
  { wave: 1, types: ['normal'] },
  { wave: 2, types: ['normal', 'small'] },
  { wave: 3, types: ['normal', 'small', 'abnormal'] },
  { wave: 5, types: ['normal', 'small', 'abnormal', 'large'] },
];

export class WaveManager {
  constructor(titanManager, world) {
    this.titans = titanManager;
    this.world = world; // 拿來檢查生成點有沒有剛好疊在建築物裡
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.state = 'break';
    this.breakTimer = 3; // 開局先給 3 秒適應鉤索
    this.spawnedThisWave = 0;
    this.activeBoss = null; // 目前存活的頭目泰坦，給 HUD 血條用
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
      const clearedBoss = this.activeBoss;
      this.activeBoss = null;
      return { type: 'waveCleared', wave: this.wave, boss: clearedBoss };
    }
    return null;
  }

  isBossWave(wave) {
    return wave > 0 && wave % BOSS_WAVE_INTERVAL === 0;
  }

  startNextWave(playerPos) {
    this.wave += 1;
    this.state = 'active';
    this.activeBoss = null;

    const bossWave = this.isBossWave(this.wave);
    const count = Math.max(1, Math.round(this.countForWave(this.wave) * (bossWave ? BOSS_ESCORT_SCALE : 1)));
    const types = this.availableTypes();

    for (let i = 0; i < count; i++) {
      const typeKey = pickType(types, this.wave, i);
      const { x, z } = spawnPosition(playerPos, i, count, this.world);
      this.titans.spawn(typeKey, x, z);
    }
    this.spawnedThisWave = count;

    let boss = null;
    if (bossWave) {
      const cycle = Math.floor((this.wave / BOSS_WAVE_INTERVAL - 1) / BOSS_ORDER.length);
      const bossKey = BOSS_ORDER[((this.wave / BOSS_WAVE_INTERVAL - 1) % BOSS_ORDER.length + BOSS_ORDER.length) % BOSS_ORDER.length];
      const { x, z } = spawnPosition(playerPos, 0, 1, this.world);
      boss = new BossTitan(bossKey, x, z, this.titans.scene);
      if (cycle > 0) {
        // 九隻輪完一輪之後重複出場，用倍率補一點強度，不然後期會變得太簡單
        const scale = 1 + cycle * BOSS_REPEAT_SCALE;
        boss.napeHp = Math.round(boss.napeHp * scale);
        boss.napeMaxHp = boss.napeHp;
        boss.damage = Math.round(boss.damage * scale);
      }
      this.titans.addExisting(boss);
      this.activeBoss = boss;
    }

    return { type: 'waveStarted', wave: this.wave, count, boss };
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
    if (this.activeBoss && this.activeBoss.alive) {
      return `${BOSS_TITAN_TYPES[this.activeBoss.bossKey].label}討伐中`;
    }
    return `剩餘泰坦 ${this.titans.aliveCount}`;
  }
}

function pickType(types, wave, index) {
  // 每一波都保證有一定比例的「一般泰坦」當基底，其餘從已解鎖的種類裡抽
  if (index % 3 === 0) return 'normal';
  const pool = types.filter((t) => t !== 'normal');
  if (pool.length === 0) return 'normal';
  // 波數越高越容易抽到後期解鎖的種類
  const bias = Math.min(1, wave / 8);
  const idx = Math.floor(Math.pow(Math.random(), 1 - bias * 0.6) * pool.length);
  return pool[Math.min(pool.length - 1, idx)];
}

// 泰坦從玩家四周的環形外圈出現：不會直接生在臉上，也不用跑太久才碰到面
function spawnPosition(playerPos, index, count, world) {
  const angle = (index / count) * Math.PI * 2 + Math.random() * 0.6;
  let distance = 110 + Math.random() * 90;
  let x, z;

  // 城市變密之後，隨機點有機會剛好落在建築物的地基裡——泰坦沒有「穿牆」問題了
  // 之後反而會直接卡死動不了，所以生成時要先確認腳下不是building，卡到就沿同一個
  // 角度往外挪，挪到空地為止（有上限，避免真的挪不出去時卡死迴圈）
  for (let attempt = 0; attempt < 8; attempt++) {
    x = playerPos.x + Math.cos(angle) * distance;
    z = playerPos.z + Math.sin(angle) * distance;

    const r = Math.hypot(x, z);
    if (r > CITY_RADIUS - 20) {
      const scale = (CITY_RADIUS - 20) / r;
      x *= scale;
      z *= scale;
    }

    if (!world || !tooCloseToAnyBuilding(x, z, world.buildings)) break;
    distance += 12;
  }

  return { x, z };
}

// 檢查的不只是「整個疊在建築物裡面」，還包含泰坦身體半徑的緩衝範圍——
// 光看有沒有落在矩形內是不夠的：剛好貼在邊緣、離牆不到半個身位的生成點，
// 一樣會讓分軸碰撞判定兩軸同時卡住，動彈不得。這裡用全種類裡最大的身體半徑
// 當緩衝（頭目泰坦最高 48m，半徑約 10.6m），寧可挪遠一點也不要生成就卡死。
const SPAWN_CLEARANCE = 11;
function tooCloseToAnyBuilding(x, z, buildings) {
  for (const b of buildings) {
    const closestX = Math.max(b.minX, Math.min(x, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz < SPAWN_CLEARANCE * SPAWN_CLEARANCE) return true;
  }
  return false;
}
