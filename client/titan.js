import * as THREE from 'three';
import {
  TITAN_TYPES,
  TITAN_ATTACK_COOLDOWN,
  TITAN_STAGGER_TIME,
  TITAN_LIMB_HP,
  TITAN_WIND_TIME,
  TITAN_BODY_RADIUS_SCALE,
  TITAN_COLLISION_RADIUS_SCALE,
  CITY_RADIUS,
} from './constants.js';

// 泰坦。模型是純幾何體堆出來的（不載外部資產，開箱即跑），
// 重點在後頸弱點的位置要正確：只有從背後上方切下去才算數。

const _v = new THREE.Vector3();
const _napeWorld = new THREE.Vector3();

let nextId = 1;

export class Titan {
  // overrideType 讓 BossTitan（bossTitan.js）可以沿用整個類別，
  // 只是改從 BOSS_TITAN_TYPES 拿資料而不是 TITAN_TYPES
  constructor(typeKey, x, z, overrideType) {
    const type = overrideType ?? TITAN_TYPES[typeKey];
    this.id = nextId++;
    this.typeKey = typeKey;
    this.type = type;
    this.height = type.height;
    this.napeHp = type.napeHp;
    this.napeMaxHp = type.napeHp;
    this.speed = type.speed;
    this.damage = type.damage;

    this.state = 'walk'; // walk | wind | stagger | dead
    this.attackCooldown = 0;
    this.windTimer = 0;
    this.staggerTimer = 0;
    this.deadTimer = 0;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.limbHp = { la: TITAN_LIMB_HP, ra: TITAN_LIMB_HP };
    this.yaw = Math.random() * Math.PI * 2;
    // 異常型會亂跑，不是直線衝過來
    this.wander = new THREE.Vector3();
    this.wanderTimer = 0;
    // 卡住繞牆用：定期檢查跟玩家的距離有沒有真的縮短、目前繞的方向（1/-1，0=還沒挑）
    this.progressCheckTimer = 0;
    this.progressDistRef = null;
    this.stuck = false;
    this.hardStuckTimer = 0;
    this.sidestepDir = 0;

    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.parts = [];
    this.buildBody();
  }

  // 比例刻意不照真人：軀幹加寬加厚、頭放大、手臂拉長到過膝，
  // 這是「泰坦」跟「放大的人」之間唯一的視覺差異，光靠等比放大看起來只會像巨大的人偶。
  buildBody() {
    const h = this.height;
    const skin = new THREE.MeshLambertMaterial({ color: this.type.color });

    const torso = this.addPart(
      new THREE.BoxGeometry(h * 0.5, h * 0.46, h * 0.32),
      skin,
      0,
      h * 0.58,
      0
    );
    this.group.add(torso);

    const hip = this.addPart(new THREE.BoxGeometry(h * 0.4, h * 0.16, h * 0.28), skin, 0, h * 0.38, 0);
    this.group.add(hip);

    // 頭放大到接近軀幹寬度的一半，幾乎沒有脖子——這是最快讀出「不是人類」的一眼特徵
    const head = this.addPart(new THREE.BoxGeometry(h * 0.27, h * 0.27, h * 0.27), skin, 0, h * 0.9, 0);
    this.group.add(head);
    this.head = head;

    // 血盆大口：一條橫貫下顎的深色縫，遠處也能一眼認出「這是泰坦不是人」
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(h * 0.22, h * 0.025, h * 0.03),
      new THREE.MeshBasicMaterial({ color: 0x2a1a12 })
    );
    mouth.position.set(0, h * 0.845, h * 0.135 + 0.01);
    this.group.add(mouth);

    // 眼睛：讓玩家在混戰中一眼看出泰坦面朝哪邊（也就是弱點在反方向）
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a1a12 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(h * 0.05, h * 0.035, h * 0.02), eyeMat);
      eye.position.set(sx * h * 0.065, h * 0.92, h * 0.135);
      this.group.add(eye);
    }

    // 後頸弱點：頭與軀幹之間、身體背面。顏色刻意突兀，遠遠就看得到
    this.nape = new THREE.Mesh(
      new THREE.BoxGeometry(h * 0.28, h * 0.22, h * 0.08),
      new THREE.MeshBasicMaterial({ color: 0xd8443a })
    );
    this.nape.position.set(0, h * 0.83, -h * 0.16);
    this.nape.userData.titanId = this.id;
    this.group.add(this.nape);
    this.parts.push(this.nape);

    // 手臂刻意拉到過膝的長度——不合人體比例，正是「泰坦」而非「巨大的人」的關鍵
    const armLength = h * 0.5;
    this.arms = {};
    for (const [key, sx] of [['la', -1], ['ra', 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * h * 0.31, h * 0.76, 0);
      const arm = this.addPart(
        new THREE.BoxGeometry(h * 0.135, armLength, h * 0.135),
        skin,
        0,
        -armLength / 2,
        0
      );
      arm.userData.limb = key;
      pivot.add(arm);

      const fist = this.addPart(new THREE.BoxGeometry(h * 0.16, h * 0.16, h * 0.16), skin, 0, -armLength - h * 0.03, 0);
      fist.userData.limb = key;
      pivot.add(fist);

      this.group.add(pivot);
      this.arms[key] = { pivot, mesh: arm };
    }

    const legLength = h * 0.42;
    this.legs = {};
    for (const [key, sx] of [['ll', -1], ['rl', 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * h * 0.13, h * 0.38, 0);
      const leg = this.addPart(
        new THREE.BoxGeometry(h * 0.17, legLength, h * 0.17),
        skin,
        0,
        -legLength / 2,
        0
      );
      pivot.add(leg);

      const foot = this.addPart(new THREE.BoxGeometry(h * 0.2, h * 0.08, h * 0.28), skin, 0, -legLength - h * 0.02, h * 0.04);
      pivot.add(foot);

      this.group.add(pivot);
      this.legs[key] = { pivot, mesh: leg };
    }
  }

  addPart(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.userData.titanId = this.id;
    this.parts.push(mesh);
    return mesh;
  }

  get alive() {
    return this.state !== 'dead';
  }

  napeWorldPosition(out = _napeWorld) {
    this.nape.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.nape.matrixWorld);
  }

  // 預設一律面朝玩家；BossTitan 的逃跑型會覆寫成面朝反方向
  getDesiredYaw(dx, dz) {
    return Math.atan2(-dx, -dz);
  }

  // 玩家是不是繞到背後了：把玩家位置轉到泰坦的座標系判斷
  isBehind(playerPos) {
    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    return dx * fx + dz * fz < 0;
  }

  update(dt, playerPos, playerAlive, world) {
    if (this.state === 'dead') {
      this.deadTimer += dt;
      // 倒下：往前撲，同時整個沉進地面消失
      this.group.rotation.x = Math.min(Math.PI / 2, this.group.rotation.x + dt * 2.2);
      if (this.deadTimer > 2.4) {
        this.group.position.y -= dt * this.height * 0.5;
      }
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (this.state === 'stagger') {
      this.staggerTimer -= dt;
      // 硬直：整個人往前傾，這段時間是玩家的下手機會
      this.group.rotation.x = Math.sin((1 - this.staggerTimer / TITAN_STAGGER_TIME) * Math.PI) * 0.5;
      if (this.staggerTimer <= 0) {
        this.state = 'walk';
        this.group.rotation.x = 0;
      }
      return;
    }

    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    const dist = Math.hypot(dx, dz);

    // 轉身面向玩家（有轉速上限，所以繞到背後是可行的戰術）。
    // getDesiredYaw 讓子類別（例如 bossTitan.js 的逃跑型）可以覆寫成「轉身背對玩家」，
    // 而不是直接讓身體反向平移——移動方向永遠等於面朝方向，這條規則不能被打破。
    const desiredYaw = this.getDesiredYaw(dx, dz, dist);
    const turnRate = this.type.turnRate ?? (this.typeKey === 'abnormal' ? 3.2 : 1.5);
    this.yaw = approachAngle(this.yaw, desiredYaw, turnRate * dt);
    this.group.rotation.y = this.yaw;

    if (this.state === 'wind') {
      this.windTimer -= dt;
      const t = 1 - Math.max(0, this.windTimer) / TITAN_WIND_TIME;
      // 雙臂後拉再往前揮、上半身跟著前撲——攻擊前兆要夠明顯，玩家才看得出「要挨打了」
      const swing = Math.sin(t * Math.PI);
      this.arms.ra.pivot.rotation.x = -Math.PI * 0.9 * swing;
      this.arms.la.pivot.rotation.x = -Math.PI * 0.5 * swing;
      this.group.rotation.x = swing * 0.25;
      if (this.windTimer <= 0) {
        this.state = 'walk';
        this.arms.ra.pivot.rotation.x = 0;
        this.arms.la.pivot.rotation.x = 0;
        this.group.rotation.x = 0;
        this.pendingHit = true; // 由 TitanManager 結算傷害
      }
      return;
    }

    const reach = this.height * 0.68;
    const canReachHeight = playerPos.y < this.height * 0.95;

    if (playerAlive && dist < reach && canReachHeight && this.attackCooldown === 0) {
      this.state = 'wind';
      this.windTimer = TITAN_WIND_TIME;
      this.attackCooldown = TITAN_ATTACK_COOLDOWN * (this.type.attackCooldownMult ?? 1);
      return;
    }

    // 移動方向永遠取「目前面朝的方向」，不是直接飄向玩家——
    // 不然轉身還沒跟上時，身體卻已經照玩家方位直線平移，看起來就像用背面在走路。
    let moveX = -Math.sin(this.yaw);
    let moveZ = -Math.cos(this.yaw);
    if (dist <= reach * 0.8) {
      moveX = 0;
      moveZ = 0;
    }

    if (this.typeKey === 'abnormal' && (moveX !== 0 || moveZ !== 0)) {
      // 異常型：在面朝方向上疊一個會變的偏移量，路徑就不再是直線
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 0.8 + Math.random() * 1.2;
        this.wander.set(Math.random() * 2 - 1, 0, Math.random() * 2 - 1).multiplyScalar(0.7);
      }
      moveX += this.wander.x;
      moveZ += this.wander.z;
      const l = Math.hypot(moveX, moveZ) || 1;
      moveX /= l;
      moveZ /= l;
    }

    // 卡住偵測：光看「這一幀有沒有被完全擋住」不夠，密集街區常常是
    // 「技術上還在動，但只是沿著牆滑，淨方向沒有真的往玩家靠近」——
    // 例如牆面剛好跟目標方向垂直，沿牆滑一輩子也到不了。改成每隔一小段時間
    // 直接檢查跟玩家的實際距離有沒有真的縮短，抓不到這種假移動就沒意義。
    this.progressCheckTimer = (this.progressCheckTimer || 0) + dt;
    if (this.progressDistRef == null) this.progressDistRef = dist;

    if (this.progressCheckTimer >= 0.5) {
      const expectedProgress = this.speed * this.progressCheckTimer * 0.35; // 抓 35% 當及格線，考慮沿牆滑本來就會打折
      const actualProgress = this.progressDistRef - dist;
      this.stuck = dist > reach && actualProgress < expectedProgress;
      this.progressCheckTimer = 0;
      this.progressDistRef = dist;
    }

    if (this.stuck && (moveX !== 0 || moveZ !== 0)) {
      // 側向偏移「繞牆」：方向固定到真的脫困為止，不然每次重新隨機挑會在原地抖動
      const rightX = Math.cos(this.yaw);
      const rightZ = -Math.sin(this.yaw);
      if (!this.sidestepDir) this.sidestepDir = Math.random() < 0.5 ? 1 : -1;
      moveX += rightX * this.sidestepDir * 1.4;
      moveZ += rightZ * this.sidestepDir * 1.4;
      const l = Math.hypot(moveX, moveZ) || 1;
      moveX /= l;
      moveZ /= l;
    } else {
      this.sidestepDir = 0;
    }

    // X、Z 軸分開嘗試移動，被建築物擋住的那一軸就取消、另一軸照樣通過——
    // 這樣撞到牆的時候會自然沿著牆滑，而不是每幀「往前撞、被推出、再往前撞」卡著抖動
    // （泰坦沒有速度/動量概念，用推出去的做法在這裡行不通，只有分軸判定才滑得動）。
    // 碰撞用的半徑刻意比視覺身體小（TITAN_COLLISION_RADIUS_SCALE），密集街區的
    // 建築物轉角很多，用完整身體半徑做碰撞連轉角都繞不過去，寧可犧牲一點點
    // 視覺上的貼合度，也要讓泰坦真的走得到玩家面前。
    const step = this.speed * dt;
    const bodyRadius = this.height * TITAN_COLLISION_RADIUS_SCALE;
    const pos = this.group.position;

    const nextX = pos.x + moveX * step;
    const movedX = !world || !buildingBlocked(nextX, pos.z, bodyRadius, world);
    if (movedX) pos.x = nextX;

    const nextZ = pos.z + moveZ * step;
    const movedZ = !world || !buildingBlocked(pos.x, nextZ, bodyRadius, world);
    if (movedZ) pos.z = nextZ;

    // 兩軸都被擋下來：通常是卡在牆角，或身體剛好貼著建築物邊緣站著。
    // 分軸判定在這種情況下會完全卡死，所以只在「真的兩邊都不能動」時才推開一點點，
    // 不是每幀都推——推開後下一幀開始照樣走分軸判定，不會變回原本推來推去的問題。
    if (world && !movedX && !movedZ) nudgeAwayFromBuildings(pos, bodyRadius, world);

    // 保底機制：進度檢查連續判定「卡住」達到一定次數（約 2.4 秒都沒有實質進展），
    // 就直接無視碰撞、朝玩家方向硬挪一段明顯的距離——寧可偶爾看起來穿過牆角一下，
    // 也不要真的讓泰坦卡在同一個地方走不出來。這是絕對不會卡死的最後防線。
    if (this.stuck) {
      this.hardStuckTimer = (this.hardStuckTimer || 0) + dt;
      if (this.hardStuckTimer > 1.2) {
        const invDist = 1 / (dist || 1);
        pos.x += dx * invDist * 8;
        pos.z += dz * invDist * 8;
        this.hardStuckTimer = 0;
        this.stuck = false;
        this.sidestepDir = 0;
      }
    } else {
      this.hardStuckTimer = 0;
    }

    // 不要走出城牆
    const r = Math.hypot(this.group.position.x, this.group.position.z);
    if (r > CITY_RADIUS) {
      this.group.position.x *= CITY_RADIUS / r;
      this.group.position.z *= CITY_RADIUS / r;
    }

    this.animateWalk(dt, moveX !== 0 || moveZ !== 0);
  }

  animateWalk(dt, moving) {
    if (!moving) {
      this.walkPhase += dt * 1.2;
    } else {
      // 高個子步頻慢，靠身高換算才不會看起來像在小碎步
      this.walkPhase += dt * (this.speed / this.height) * 3.4;
    }
    const swing = Math.sin(this.walkPhase) * (moving ? 0.55 : 0.12);
    this.legs.ll.pivot.rotation.x = swing;
    this.legs.rl.pivot.rotation.x = -swing;
    this.arms.la.pivot.rotation.x = -swing * 0.7;
    if (this.state !== 'wind') this.arms.ra.pivot.rotation.x = swing * 0.7;
    this.group.position.y = Math.abs(Math.sin(this.walkPhase)) * this.height * 0.012;
  }

  damageNape(amount) {
    this.napeHp -= amount;
    if (this.napeHp <= 0) {
      this.kill();
      return true;
    }
    return false;
  }

  damageLimb(key, amount) {
    if (!this.limbHp[key]) return false;
    this.limbHp[key] -= amount;
    if (this.limbHp[key] <= 0) {
      this.limbHp[key] = 0;
      this.stagger();
      return true;
    }
    return false;
  }

  stagger() {
    if (this.state === 'dead') return;
    this.state = 'stagger';
    this.staggerTimer = TITAN_STAGGER_TIME;
  }

  kill() {
    this.state = 'dead';
    this.deadTimer = 0;
    // 鉤在這隻泰坦身上的繩索要失效（hookGear.js 會檢查這個旗標）
    this.group.traverse((o) => { o.userData.detached = true; });
    this.nape.material.color.set(0x5a1c18);
  }
}

export class TitanManager {
  constructor(scene) {
    this.scene = scene;
    this.titans = [];
    this.steam = [];
  }

  spawn(typeKey, x, z) {
    return this.addExisting(new Titan(typeKey, x, z));
  }

  // 讓呼叫端自己 new 出一個 Titan 或 BossTitan（bossTitan.js 的頭目泰坦需要額外的
  // scene 參數，不適合塞進這個通用方法），這裡只負責掛進場景與追蹤清單
  addExisting(titan) {
    this.scene.add(titan.group);
    this.titans.push(titan);
    return titan;
  }

  get aliveCount() {
    return this.titans.filter((t) => t.alive).length;
  }

  // 鉤索可以射中的泰坦身體部位（掛在泰坦身上是進階但很有效的打法）
  hookableMeshes() {
    const list = [];
    for (const t of this.titans) {
      if (!t.alive) continue;
      list.push(...t.parts);
    }
    return list;
  }

  update(dt, player, onPlayerHit, world) {
    for (const t of this.titans) {
      t.update(dt, player.position, player.alive, world);
      if (t.pendingHit) {
        t.pendingHit = false;
        const dist = Math.hypot(
          player.position.x - t.group.position.x,
          player.position.z - t.group.position.z
        );
        // 揮擊結束的瞬間再判定一次距離：跑掉了就打空
        if (dist < t.height * 0.7 && player.position.y < t.height * 0.95) {
          onPlayerHit(t.damage, t);
        }
      }
      // 範圍傷害（頭目泰坦的投擲/範圍招式）：命中點跟半徑由招式自己決定，
      // 這裡只負責統一判定玩家在不在範圍內
      if (t.pendingAreaHit) {
        const { damage, x, z, radius } = t.pendingAreaHit;
        t.pendingAreaHit = null;
        const d = Math.hypot(player.position.x - x, player.position.z - z);
        if (d < radius) onPlayerHit(damage, t);
      }
    }

    this.separateTitans();

    // 屍體沉到地面下就回收
    const remaining = [];
    for (const t of this.titans) {
      if (t.state === 'dead' && t.deadTimer > 5) {
        this.scene.remove(t.group);
        disposeGroup(t.group);
        t.disposeExtras?.(); // 頭目泰坦掛在 scene 底下的額外物件（投擲物、警示圈）
      } else {
        remaining.push(t);
      }
    }
    this.titans = remaining;

    this.updateSteam(dt);
  }

  // 泰坦彼此之間簡單的圓形分離，不然好幾隻同時撲向玩家時會疊在同一個位置上、
  // 看起來像穿模。死掉/硬直中的不參與（硬直中被推開會很奇怪）
  separateTitans() {
    const active = this.titans.filter((t) => t.alive && t.state !== 'stagger');
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        const dx = b.group.position.x - a.group.position.x;
        const dz = b.group.position.z - a.group.position.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        const minDist = (a.height + b.height) * (TITAN_BODY_RADIUS_SCALE * 0.9);
        if (dist >= minDist) continue;
        const push = (minDist - dist) / 2;
        const nx = dx / dist;
        const nz = dz / dist;
        a.group.position.x -= nx * push;
        a.group.position.z -= nz * push;
        b.group.position.x += nx * push;
        b.group.position.z += nz * push;
      }
    }
  }

  // 泰坦死亡時冒出的蒸氣
  emitSteam(position, scale) {
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(scale * (0.18 + Math.random() * 0.14), 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.7 })
      );
      mesh.position.copy(position);
      mesh.position.x += (Math.random() - 0.5) * scale * 0.6;
      mesh.position.z += (Math.random() - 0.5) * scale * 0.6;
      this.scene.add(mesh);
      this.steam.push({
        mesh,
        life: 1.6 + Math.random() * 0.8,
        age: 0,
        rise: scale * (0.6 + Math.random() * 0.6),
      });
    }
  }

  updateSteam(dt) {
    const remaining = [];
    for (const p of this.steam) {
      p.age += dt;
      if (p.age >= p.life) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        continue;
      }
      const t = p.age / p.life;
      p.mesh.position.y += p.rise * dt;
      p.mesh.scale.setScalar(1 + t * 1.8);
      p.mesh.material.opacity = 0.7 * (1 - t);
      remaining.push(p);
    }
    this.steam = remaining;
  }

  clear() {
    for (const t of this.titans) {
      this.scene.remove(t.group);
      disposeGroup(t.group);
      t.disposeExtras?.();
    }
    this.titans = [];
  }

  // 最靠近玩家的泰坦與距離，給 HUD 的警示用
  nearest(position) {
    let best = null;
    let bestDist = Infinity;
    for (const t of this.titans) {
      if (!t.alive) continue;
      const d = position.distanceTo(_v.copy(t.group.position).setY(position.y));
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return { titan: best, distance: bestDist };
  }
}

// 泰坦 vs 建築物：純粹的「這個位置站得住嗎」布林判定，跟玩家用同一份 world.buildings 資料。
// 用在分軸移動上（見上面的 update()），移動被擋的那一軸取消、另一軸照樣通過，
// 效果上就是貼牆滑動；不用推出去的做法，因為泰坦沒有速度/動量概念，推出去只會抖動。
function buildingBlocked(x, z, radius, world) {
  for (const b of world.buildings) {
    const closestX = Math.max(b.minX, Math.min(x, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

// 最後手段：兩軸都卡住時，直接朝最近那棟建築物的反方向推開一點點
function nudgeAwayFromBuildings(position, radius, world) {
  for (const b of world.buildings) {
    const closestX = Math.max(b.minX, Math.min(position.x, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(position.z, b.maxZ));
    const dx = position.x - closestX;
    const dz = position.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;

    if (dx === 0 && dz === 0) {
      // 整個身體都陷在方塊裡（例如手動放置或被彼此分離推進去），
      // 這種情況「最近點」就是自己，方向向量算不出來，改成往最近的側面推出去
      const toMinX = position.x - b.minX;
      const toMaxX = b.maxX - position.x;
      const toMinZ = position.z - b.minZ;
      const toMaxZ = b.maxZ - position.z;
      const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
      if (m === toMinX) position.x = b.minX - radius;
      else if (m === toMaxX) position.x = b.maxX + radius;
      else if (m === toMinZ) position.z = b.minZ - radius;
      else position.z = b.maxZ + radius;
      return;
    }

    const dist = Math.sqrt(distSq);
    const push = radius - dist + 0.05;
    position.x += (dx / dist) * push;
    position.z += (dz / dist) * push;
    return; // 一次只處理最先撞到的一棟，避免這一幀被好幾棟建築物拉來拉去
  }
}

function approachAngle(current, target, maxStep) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
}
