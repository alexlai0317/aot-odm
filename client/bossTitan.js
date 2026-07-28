import * as THREE from 'three';
import { Titan } from './titan.js';
import { BOSS_TITAN_TYPES } from './constants.js';

// 頭目泰坦：繼承一般泰坦的移動/弱點/硬直邏輯，疊加一個獨立招式。
// 每隻只實作「一個」清楚可辨識的招式，招式邏輯彼此獨立、互不影響，
// 靠 this.ability（來自 BOSS_TITAN_TYPES）決定 update() 要多跑哪一段。

export class BossTitan extends Titan {
  constructor(bossKey, x, z, scene) {
    const type = BOSS_TITAN_TYPES[bossKey];
    super(bossKey, x, z, type);
    this.isBoss = true;
    this.bossKey = bossKey;
    this.scene = scene;
    this.ability = type.ability;

    this.abilityCooldown = firstCooldown(type) * (0.5 + Math.random() * 0.4); // 出場不會馬上炸招
    this.projectiles = []; // 飛行道具（丟石頭）與地面標記（蒸氣警示圈、尖刺警示圈），都是掛在 scene 底下的獨立物件
    this.markers = [];

    this.chargeState = 'idle';
    this.steamState = 'idle';
    this.spikeState = 'idle';
    this.hardenActive = false;
    this.rallyActive = false;
    this.enraged = false;

    this.decorate();
  }

  // 針對幾隻做低成本的外觀點綴，讓輪廓一眼就能跟一般泰坦分開
  decorate() {
    const h = this.height;
    if (this.bossKey === 'heavyArmor') {
      const plateMat = new THREE.MeshLambertMaterial({ color: 0x53565c });
      const chest = new THREE.Mesh(new THREE.BoxGeometry(h * 0.54, h * 0.3, h * 0.06), plateMat);
      chest.position.set(0, h * 0.62, h * 0.18);
      this.group.add(chest);
      const helm = new THREE.Mesh(new THREE.BoxGeometry(h * 0.3, h * 0.1, h * 0.3), plateMat);
      helm.position.set(0, h * 1.02, 0);
      this.group.add(helm);
    } else if (this.bossKey === 'spike') {
      const spikeMat = new THREE.MeshLambertMaterial({ color: 0x3a3640 });
      for (const sx of [-1, 1]) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(h * 0.05, h * 0.22, 5), spikeMat);
        s.position.set(sx * h * 0.3, h * 0.9, 0);
        this.group.add(s);
      }
    } else if (this.bossKey === 'swiftShadow') {
      const jawMat = new THREE.MeshBasicMaterial({ color: 0x1c1008 });
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(h * 0.26, h * 0.05, h * 0.05), jawMat);
      jaw.position.set(0, h * 0.83, h * 0.15);
      this.group.add(jaw);
    }
  }

  update(dt, playerPos, playerAlive) {
    // 重甲的衝鋒會整幀接管移動，蓄力／衝鋒／硬直期間跳過一般泰坦的移動與攻擊邏輯
    if (this.ability === 'charge' && this.state !== 'dead' && this.state !== 'stagger') {
      const handled = this.updateCharge(dt, playerPos);
      if (handled) {
        this.updateProjectiles(dt);
        return;
      }
    }

    // 遊獵泰坦：玩家靠太近時把速度暫時反向，逃跑方向就是「朝玩家的反方向」
    let restoreSpeed = null;
    if (this.ability === 'evade' && this.state !== 'dead' && this.state !== 'stagger') {
      const dist = Math.hypot(playerPos.x - this.group.position.x, playerPos.z - this.group.position.z);
      if (dist < this.type.fleeDistance) {
        restoreSpeed = this.speed;
        this.speed = -Math.abs(this.speed) * 1.15;
      }
    }

    super.update(dt, playerPos, playerAlive);
    if (restoreSpeed !== null) this.speed = restoreSpeed;

    if (this.state === 'dead') {
      this.updateProjectiles(dt);
      return;
    }

    switch (this.ability) {
      case 'throw': this.updateThrow(dt, playerPos); break;
      case 'steam': this.updateSteam(dt, playerPos); break;
      case 'harden': this.updateHarden(dt); break;
      case 'spike': this.updateSpike(dt, playerPos); break;
      case 'enrage': this.updateEnrage(); break;
      case 'rally': this.updateRally(dt); break;
      default: break; // frenzy／evade 純靠基礎數值與上面的速度反轉，不需要額外邏輯
    }

    this.updateProjectiles(dt);
  }

  // ── 重甲泰坦：蓄力 → 直線衝鋒 → 硬直（硬直是玩家的輸出窗口）──────────
  updateCharge(dt, playerPos) {
    const t = this.type;

    if (this.chargeState === 'idle') {
      this.abilityCooldown -= dt;
      const dist = Math.hypot(playerPos.x - this.group.position.x, playerPos.z - this.group.position.z);
      if (this.abilityCooldown <= 0 && dist > this.height * 0.9 && dist < 70) {
        this.chargeState = 'windup';
        this.chargeTimer = t.chargeWindup;
        this.chargeDir = new THREE.Vector3(
          playerPos.x - this.group.position.x,
          0,
          playerPos.z - this.group.position.z
        ).normalize();
      }
      return false;
    }

    if (this.chargeState === 'windup') {
      this.chargeTimer -= dt;
      const p = 1 - Math.max(0, this.chargeTimer) / t.chargeWindup;
      this.group.rotation.x = -0.15 * Math.sin(p * Math.PI * 0.5); // 稍微後仰蓄力，是明顯的攻擊前兆
      if (this.chargeTimer <= 0) {
        this.chargeState = 'charging';
        this.chargeTimer = t.chargeDuration;
        this.chargeHit = false;
      }
      return true;
    }

    if (this.chargeState === 'charging') {
      this.chargeTimer -= dt;
      this.group.rotation.x = 0;
      const step = t.chargeSpeed * dt;
      this.group.position.x += this.chargeDir.x * step;
      this.group.position.z += this.chargeDir.z * step;
      this.yaw = Math.atan2(-this.chargeDir.x, -this.chargeDir.z);
      this.group.rotation.y = this.yaw;

      const dist = Math.hypot(playerPos.x - this.group.position.x, playerPos.z - this.group.position.z);
      if (!this.chargeHit && dist < this.height * 0.6) {
        this.chargeHit = true;
        this.pendingHit = true; // 沿用一般泰坦的近戰傷害結算
      }
      if (this.chargeTimer <= 0) {
        this.chargeState = 'recover';
        this.chargeTimer = 1.2;
      }
      return true;
    }

    if (this.chargeState === 'recover') {
      this.chargeTimer -= dt;
      this.group.rotation.x = Math.min(0.3, (1.2 - this.chargeTimer) * 0.4);
      if (this.chargeTimer <= 0) {
        this.chargeState = 'idle';
        this.abilityCooldown = t.chargeCooldown;
        this.group.rotation.x = 0;
      }
      return true;
    }

    return false;
  }

  // ── 投石泰坦：對玩家當下位置丟一顆會落地的石頭 ─────────────────────
  updateThrow(dt, playerPos) {
    this.abilityCooldown -= dt;
    const dist = Math.hypot(playerPos.x - this.group.position.x, playerPos.z - this.group.position.z);
    if (this.abilityCooldown <= 0 && dist > this.height * 0.7 && dist < 100) {
      this.abilityCooldown = this.type.throwCooldown;
      this.spawnRock(playerPos);
    }
  }

  spawnRock(targetPos) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.4, 0),
      new THREE.MeshLambertMaterial({ color: 0x5c5650 })
    );
    const start = this.group.position.clone().add(new THREE.Vector3(0, this.height * 0.8, 0));
    const target = targetPos.clone();
    const duration = Math.max(0.6, start.distanceTo(target) / this.type.throwSpeed);
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.projectiles.push({
      kind: 'rock', mesh, start, target, duration, age: 0,
      onLand: () => {
        this.pendingAreaHit = { damage: this.type.throwDamage, x: target.x, z: target.z, radius: this.type.throwRadius };
      },
    });
  }

  // ── 灼焰泰坦：警示圈膨脹 → 以自身為中心的蒸氣範圍傷害 ───────────────
  updateSteam(dt) {
    const t = this.type;
    if (this.steamState === 'warning') {
      this.steamTimer -= dt;
      if (this.steamRing) {
        const p = 1 - Math.max(0, this.steamTimer) / t.steamWarning;
        this.steamRing.scale.setScalar(0.3 + p * 0.9);
        this.steamRing.material.opacity = 0.55 * (1 - p * 0.3);
      }
      if (this.steamTimer <= 0) {
        this.releaseSteam();
        this.steamState = 'idle';
        this.abilityCooldown = t.steamCooldown;
      }
      return;
    }
    this.abilityCooldown -= dt;
    if (this.abilityCooldown <= 0) {
      this.steamState = 'warning';
      this.steamTimer = t.steamWarning;
      this.steamRing = spawnGroundRing(this.scene, this.group.position, t.steamRadius, 0xffcf6b);
    }
  }

  releaseSteam() {
    if (this.steamRing) {
      disposeMesh(this.scene, this.steamRing);
      this.steamRing = null;
    }
    this.pendingAreaHit = {
      damage: this.type.steamDamage,
      x: this.group.position.x,
      z: this.group.position.z,
      radius: this.type.steamRadius,
    };
  }

  // ── 硬殼泰坦：週期性硬化，硬化中傷害大幅減免（弱點顏色不變，一定看得到）─
  updateHarden(dt) {
    const t = this.type;
    if (this.hardenActive) {
      this.hardenTimer -= dt;
      if (this.hardenTimer <= 0) {
        this.hardenActive = false;
        this.setHardenVisual(false);
        this.abilityCooldown = t.hardenCooldown;
      }
      return;
    }
    this.abilityCooldown -= dt;
    if (this.abilityCooldown <= 0) {
      this.hardenActive = true;
      this.hardenTimer = t.hardenDuration;
      this.setHardenVisual(true);
    }
  }

  setHardenVisual(on) {
    const color = on ? 0x8fb8c9 : this.type.color;
    for (const part of this.parts) {
      if (part === this.nape) continue; // 弱點顏色永遠不變
      if (part.material?.color) part.material.color.set(color);
    }
  }

  damageNape(amount) {
    const scaled = this.hardenActive ? amount * (1 - this.type.hardenReduction) : amount;
    return super.damageNape(scaled);
  }

  damageLimb(key, amount) {
    const scaled = this.hardenActive ? amount * (1 - this.type.hardenReduction) : amount;
    return super.damageLimb(key, scaled);
  }

  // ── 尖刺泰坦：標記玩家腳下 → 延遲後地面竄出尖刺 ─────────────────────
  updateSpike(dt, playerPos) {
    const t = this.type;
    if (this.spikeState === 'warning') {
      this.spikeTimer -= dt;
      if (this.spikeTimer <= 0) {
        this.eruptSpike();
        this.spikeState = 'idle';
        this.abilityCooldown = t.spikeCooldown;
      }
      return;
    }
    this.abilityCooldown -= dt;
    const dist = Math.hypot(playerPos.x - this.group.position.x, playerPos.z - this.group.position.z);
    if (this.abilityCooldown <= 0 && dist < 90) {
      this.spikeState = 'warning';
      this.spikeTimer = t.spikeWarning;
      this.spikeTarget = playerPos.clone();
      this.spikeMark = spawnGroundRing(this.scene, this.spikeTarget, t.spikeRadius, 0xff5a3c);
    }
  }

  eruptSpike() {
    if (this.spikeMark) {
      disposeMesh(this.scene, this.spikeMark);
      this.spikeMark = null;
    }
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(this.type.spikeRadius * 0.4, 14, 6),
      new THREE.MeshLambertMaterial({ color: 0x4a4650 })
    );
    spike.position.set(this.spikeTarget.x, -7, this.spikeTarget.z);
    this.scene.add(spike);
    // 借用 projectiles 陣列處理竄出/收回的簡單動畫（duration 到了就自行清除）
    this.projectiles.push({ kind: 'spike', mesh: spike, age: 0, duration: 0.6 });

    this.pendingAreaHit = {
      damage: this.type.spikeDamage,
      x: this.spikeTarget.x,
      z: this.spikeTarget.z,
      radius: this.type.spikeRadius,
    };
  }

  // ── 狂暴泰坦：弱點掉到門檻以下就永久暴走一次 ────────────────────────
  updateEnrage() {
    if (this.enraged) return;
    if (this.napeHp <= this.napeMaxHp * this.type.enrageThreshold) {
      this.enraged = true;
      this.speed *= this.type.enrageSpeedMult;
      this.damage *= this.type.enrageDamageMult;
      for (const part of this.parts) {
        if (part === this.nape || !part.material?.color) continue;
        const c = part.material.color;
        part.material.color.setRGB(Math.min(1, c.r * 1.35), c.g * 0.8, c.b * 0.75);
      }
    }
  }

  // ── 號令泰坦：週期性自我回復並短暫加速 ──────────────────────────────
  updateRally(dt) {
    const t = this.type;
    if (this.rallyActive) {
      this.rallyTimer -= dt;
      if (this.rallyTimer <= 0) {
        this.rallyActive = false;
        this.speed = this.baseSpeed;
      }
      return;
    }
    this.abilityCooldown -= dt;
    if (this.abilityCooldown <= 0) {
      this.abilityCooldown = t.rallyCooldown;
      this.rallyActive = true;
      this.rallyTimer = t.rallyDuration;
      this.baseSpeed = this.baseSpeed ?? this.speed;
      this.speed = this.baseSpeed * t.rallySpeedMult;
      this.napeHp = Math.min(this.napeMaxHp, this.napeHp + t.rallyHeal);
    }
  }

  // ── 飛行道具（石頭／尖刺）的共用更新：拋物線移動，落地時觸發回呼 ──────
  updateProjectiles(dt) {
    const remaining = [];
    for (const p of this.projectiles) {
      p.age += dt;
      const frac = Math.min(1, p.age / p.duration);

      if (p.kind === 'rock') {
        p.mesh.position.lerpVectors(p.start, p.target, frac);
        p.mesh.position.y += Math.sin(frac * Math.PI) * p.start.distanceTo(p.target) * 0.18;
        p.mesh.rotation.x += dt * 6;
        p.mesh.rotation.z += dt * 4;
      } else if (p.kind === 'spike') {
        const rise = Math.sin(Math.min(1, frac * 1.4) * Math.PI);
        p.mesh.position.y = -7 + rise * 14;
      }

      if (frac >= 1) {
        p.onLand?.();
        disposeMesh(this.scene, p.mesh);
        continue;
      }
      remaining.push(p);
    }
    this.projectiles = remaining;
  }

  kill() {
    super.kill();
    if (this.steamRing) { disposeMesh(this.scene, this.steamRing); this.steamRing = null; }
    if (this.spikeMark) { disposeMesh(this.scene, this.spikeMark); this.spikeMark = null; }
  }

  // TitanManager 在真正回收這隻泰坦前會呼叫這個，清掉掛在 scene 底下、
  // 不屬於 this.group 的額外視覺物件（projectiles、警示圈才不會變成孤兒 mesh）
  disposeExtras() {
    for (const p of this.projectiles) disposeMesh(this.scene, p.mesh);
    this.projectiles = [];
    if (this.steamRing) { disposeMesh(this.scene, this.steamRing); this.steamRing = null; }
    if (this.spikeMark) { disposeMesh(this.scene, this.spikeMark); this.spikeMark = null; }
  }
}

function firstCooldown(type) {
  return (
    type.chargeCooldown ?? type.throwCooldown ?? type.steamCooldown ??
    type.hardenCooldown ?? type.spikeCooldown ?? type.rallyCooldown ?? 2
  );
}

function spawnGroundRing(scene, position, radius, color) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.9, radius, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, 0.3, position.z);
  scene.add(ring);
  return ring;
}

function disposeMesh(scene, mesh) {
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
}
