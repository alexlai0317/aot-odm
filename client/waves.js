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
  TITAN_TYPES,
  TITAN_COLLISION_RADIUS_SCALE,
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
      const radius = TITAN_TYPES[typeKey].height * TITAN_COLLISION_RADIUS_SCALE;
      const { x, z } = spawnPosition(playerPos, i, count, this.world, radius);
      this.titans.spawn(typeKey, x, z);
    }
    this.spawnedThisWave = count;

    let boss = null;
    if (bossWave) {
      const cycle = Math.floor((this.wave / BOSS_WAVE_INTERVAL - 1) / BOSS_ORDER.length);
      const bossKey = BOSS_ORDER[((this.wave / BOSS_WAVE_INTERVAL - 1) % BOSS_ORDER.length + BOSS_ORDER.length) % BOSS_ORDER.length];
      const bossRadius = BOSS_TITAN_TYPES[bossKey].height * TITAN_COLLISION_RADIUS_SCALE;
      const { x, z } = spawnPosition(playerPos, 0, 1, this.world, bossRadius);
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

// 泰坦從玩家四周的環形外圈出現：不會直接生在臉上，也不用跑太久才碰到面。
// 距離故意壓得比較近——泰坦沒有路徑規劃，密集街區裡實際前進速度打了折扣，
// 生成太遠會變成「泰坦其實有生成，只是永遠走不到玩家看得到的地方」。
function spawnPosition(playerPos, index, count, world, radius) {
  const angle = (index / count) * Math.PI * 2 + Math.random() * 0.6;
  let distance = 75 + Math.random() * 65;
  let x, z;

  // 城市變密之後，隨機點有機會剛好貼在建築物邊緣、卡進碰撞緩衝範圍裡，
  // 生成後就直接卡死動不了。這裡用「這隻泰坦實際的身體半徑」當緩衝去檢查，
  // 不夠的話就沿同一個角度往外挪一點（有上限，避免真的挪不出去時卡死迴圈）。
  // 注意：緩衝值不能設太大——街道只有 STREET_WIDTH（12）寬，緩衝值太保守
  // 反而會讓整個棋盤街廓都被判定「太靠近建築物」，逼泰坦一路被推到城牆邊，
  // 那樣反而會讓玩家覺得「都沒看到巨人」（其實只是生成點被推到很遠的地方）。
  for (let attempt = 0; attempt < 6; attempt++) {
    x = playerPos.x + Math.cos(angle) * distance;
    z = playerPos.z + Math.sin(angle) * distance;

    const r = Math.hypot(x, z);
    if (r > CITY_RADIUS - 20) {
      const scale = (CITY_RADIUS - 20) / r;
      x *= scale;
      z *= scale;
    }

    if (!world || !tooCloseToAnyBuilding(x, z, radius, world.buildings)) break;
    distance += 8;
  }

  return { x, z };
}

function tooCloseToAnyBuilding(x, z, radius, buildings) {
  for (const b of buildings) {
    const closestX = Math.max(b.minX, Math.min(x, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}
