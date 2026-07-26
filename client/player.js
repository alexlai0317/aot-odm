import * as THREE from 'three';
import {
  EYE_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_MAX_HP,
  GRAVITY,
  AIR_DRAG,
  MAX_SPEED,
  GROUND_MOVE_SPEED,
  GROUND_ACCEL,
  AIR_CONTROL_ACCEL,
  JUMP_SPEED,
  GAS_MAX,
  GAS_THRUST,
  GAS_BURN_RATE,
  GAS_HOOK_BURN,
  GAS_REFILL_RATE,
  GAS_REFILL_DELAY,
  HP_REGEN_DELAY,
  HP_REGEN_RATE,
  HP_REGEN_SAFE_DISTANCE,
  BRAKE_DRAG,
  LANDING_FRICTION,
  FALL_DAMAGE_SPEED,
  FALL_DAMAGE_SCALE,
  FALL_DAMAGE_MAX,
  FALL_DAMAGE_BRAKE_RELIEF,
  BLADE_MAX_DURABILITY,
  BLADE_SPARE_PAIRS,
  BLADE_RELOAD_TIME,
  BLADE_SWING_TIME,
  CITY_RADIUS,
} from './constants.js';

// 玩家：視角、移動、瓦斯、刀刃狀態。
// 這裡不做鉤索物理（那在 odm.js），只負責把鉤索的結果跟重力、瓦斯、碰撞疊在一起。

const MOUSE_SENSITIVITY = 0.0022;
const MAX_PITCH = Math.PI / 2 - 0.05;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'KeyC',
  'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
]);

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);
    this.velocity = new THREE.Vector3();

    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;

    this.hp = PLAYER_MAX_HP;
    this.gas = GAS_MAX;
    this.grounded = true;
    this.groundedTime = 0;
    this.alive = true;
    this.invulnerable = 0; // 受傷後的短暫無敵，避免被同一隻巨人連續打死
    this.timeSinceHit = Infinity; // 用來算回血的起算延遲，初始值代表「還沒受過傷」
    this.regenerating = false; // 給 HUD 顯示回血中用
    this.pendingFallDamage = 0; // 這一幀的落地衝擊傷害，由 main.js 取走並播特效

    this.bladeDurability = BLADE_MAX_DURABILITY;
    this.spareBlades = BLADE_SPARE_PAIRS;
    this.reloadTimer = 0;
    this.swingTimer = 0; // > 0 代表正在揮刀
    this.swingHitDone = false; // 一次揮擊只結算一次命中

    this.keys = { forward: false, back: false, left: false, right: false, gas: false, brake: false };
    this.hookInput = [false, false]; // 左鍵 / 右鍵
    this.locked = false;

    this.bindEvents();
  }

  bindEvents() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * MOUSE_SENSITIVITY;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    });

    // 滑鼠左右鍵是左右鉤索，按住維持、放開脫鉤
    this.domElement.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.hookInput[0] = true;
      if (e.button === 2) this.hookInput[1] = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.hookInput[0] = false;
      if (e.button === 2) this.hookInput[1] = false;
    });
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      // 空白鍵預設會捲動頁面。但按著修飾鍵時放行，Ctrl+R 之類的瀏覽器快捷鍵才不會失效
      if (GAME_KEYS.has(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
      if (e.repeat) return;
      this.setKey(e.code, true);
    });
    window.addEventListener('keyup', (e) => this.setKey(e.code, false));

    // 切出視窗時把按鍵狀態清乾淨，不然回來會發現自己一直在噴瓦斯
    window.addEventListener('blur', () => {
      for (const key of Object.keys(this.keys)) this.keys[key] = false;
      this.hookInput[0] = false;
      this.hookInput[1] = false;
    });
  }

  setKey(code, pressed) {
    switch (code) {
      case 'KeyW': this.keys.forward = pressed; break;
      case 'KeyS': this.keys.back = pressed; break;
      case 'KeyA': this.keys.left = pressed; break;
      case 'KeyD': this.keys.right = pressed; break;
      case 'Space':
        this.keys.gas = pressed;
        break;
      case 'ControlLeft':
      case 'ControlRight':
      case 'KeyC':
        // 煞車：放掉捲揚機拉力並強力減速，這是精準降落與繞背的唯一手段
        this.keys.brake = pressed;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'KeyF':
        if (pressed) this.trySwing();
        break;
      case 'KeyR':
        if (pressed) this.tryReload();
        break;
      default:
        break;
    }
  }

  get speed() {
    return this.velocity.length();
  }

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  trySwing() {
    if (!this.alive || this.swingTimer > 0 || this.reloadTimer > 0) return;
    if (this.bladeDurability <= 0) {
      this.tryReload();
      return;
    }
    this.swingTimer = BLADE_SWING_TIME;
    this.swingHitDone = false;
  }

  tryReload() {
    if (!this.alive || this.reloadTimer > 0 || this.spareBlades <= 0) return;
    if (this.bladeDurability >= BLADE_MAX_DURABILITY) return;
    this.reloadTimer = BLADE_RELOAD_TIME;
  }

  takeDamage(amount) {
    if (!this.alive || this.invulnerable > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerable = 0.9;
    this.timeSinceHit = 0; // 受傷會重置回血倒數，逼玩家真的脫離戰鬥才開始回
    if (this.hp <= 0) this.alive = false;
    return true;
  }

  // 回血：離最近的活巨人夠遠、且離上次受傷夠久才會啟動。
  // nearestTitanDistance 由呼叫端算好傳進來（player 本身不認識巨人清單）。
  updateRegen(dt, nearestTitanDistance) {
    this.timeSinceHit += dt;
    const safe = nearestTitanDistance > HP_REGEN_SAFE_DISTANCE;
    this.regenerating = safe && this.timeSinceHit >= HP_REGEN_DELAY && this.hp < PLAYER_MAX_HP;
    if (this.regenerating) {
      this.hp = Math.min(PLAYER_MAX_HP, this.hp + HP_REGEN_RATE * dt);
    }
  }

  respawn(x = 0, z = 0) {
    this.position.set(x, EYE_HEIGHT, z);
    this.velocity.set(0, 0, 0);
    this.hp = PLAYER_MAX_HP;
    this.gas = GAS_MAX;
    this.bladeDurability = BLADE_MAX_DURABILITY;
    this.spareBlades = BLADE_SPARE_PAIRS;
    this.alive = true;
    this.swingTimer = 0;
    this.reloadTimer = 0;
    this.roll = 0;
    this.timeSinceHit = Infinity;
    this.regenerating = false;
    this.pendingFallDamage = 0;
  }

  update(dt, world, odm) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.updateBlades(dt);

    if (!this.alive) {
      // 死亡後鏡頭往下墜，維持一點臨場感
      this.velocity.y -= GRAVITY * dt;
      this.position.addScaledVector(this.velocity, dt);
      const ground = world.groundHeightAt(this.position.x, this.position.z);
      if (this.position.y < ground + 0.4) this.position.y = ground + 0.4;
      this.applyCamera(dt);
      return;
    }

    const hooked = odm.anyAttached();

    this.applyMovementInput(dt, hooked);
    this.velocity.y -= GRAVITY * dt;
    this.applyGas(dt, hooked);

    const reeling = odm.update(dt, this.position, this.velocity, this.keys.gas, this.keys.brake);
    if (odm.anyAttached() && !this.keys.brake) {
      // 掛著鉤索時捲揚機本身也吃瓦斯（煞車時捲揚機沒在作動就不耗）
      this.gas = Math.max(0, this.gas - GAS_HOOK_BURN * dt * odm.attachedCount());
    }

    // 空氣阻力：沒有這個會越盪越快，最後失控
    const dragRate = this.keys.brake ? BRAKE_DRAG : AIR_DRAG;
    this.velocity.multiplyScalar(Math.max(0, 1 - dragRate * dt));
    if (this.velocity.length() > MAX_SPEED) this.velocity.setLength(MAX_SPEED);

    this.position.addScaledVector(this.velocity, dt);
    this.resolveWorld(dt, world);
    this.refillGas(dt);
    this.applyCamera(dt);

    return reeling;
  }

  applyMovementInput(dt, hooked) {
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let ix = 0;
    let iz = 0;
    if (this.keys.forward) { ix += _forward.x; iz += _forward.z; }
    if (this.keys.back) { ix -= _forward.x; iz -= _forward.z; }
    if (this.keys.right) { ix += _right.x; iz += _right.z; }
    if (this.keys.left) { ix -= _right.x; iz -= _right.z; }

    const len = Math.hypot(ix, iz);
    if (len > 0) {
      ix /= len;
      iz /= len;
    }

    if (this.grounded && !hooked) {
      // 地面上是一般的跑步：往目標速度靠攏
      const targetX = ix * GROUND_MOVE_SPEED;
      const targetZ = iz * GROUND_MOVE_SPEED;
      const t = Math.min(1, GROUND_ACCEL * dt / GROUND_MOVE_SPEED);
      this.velocity.x += (targetX - this.velocity.x) * t;
      this.velocity.z += (targetZ - this.velocity.z) * t;
      if (this.keys.gas && this.gas > 0) {
        this.velocity.y = JUMP_SPEED; // 地面上按瓦斯 = 起跳
        this.grounded = false;
      }
    } else if (len > 0) {
      // 空中只能小幅修正方向，主要還是靠鉤索與瓦斯
      this.velocity.x += ix * AIR_CONTROL_ACCEL * dt;
      this.velocity.z += iz * AIR_CONTROL_ACCEL * dt;
    }
  }

  applyGas(dt, hooked) {
    // 煞車優先於噴射：同時按下時以減速為準，不然會互相抵消變成什麼都沒發生
    if (this.keys.brake) return;
    if (!this.keys.gas || this.gas <= 0 || this.grounded) return;
    // 噴射方向是視線方向：想去哪就看哪
    this.camera.getWorldDirection(_forward);
    // 沒掛鉤索時推力打折，逼玩家用鉤索移動而不是一路噴到底
    const power = hooked ? 1 : 0.75;
    this.velocity.addScaledVector(_forward, GAS_THRUST * power * dt);
    this.gas = Math.max(0, this.gas - GAS_BURN_RATE * dt);
  }

  refillGas(dt) {
    if (!this.grounded) return;
    this.groundedTime += dt;
    if (this.groundedTime < GAS_REFILL_DELAY) return;
    this.gas = Math.min(GAS_MAX, this.gas + GAS_REFILL_RATE * dt);
  }

  updateBlades(dt) {
    if (this.swingTimer > 0) this.swingTimer = Math.max(0, this.swingTimer - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0) {
        this.spareBlades -= 1;
        this.bladeDurability = BLADE_MAX_DURABILITY;
      }
    }
  }

  // 落地衝擊。傷害有上限，而且落地瞬間按著煞車可以減免 —— 摔死不該是這遊戲的死因。
  applyFallDamage(impactSpeed) {
    if (impactSpeed <= FALL_DAMAGE_SPEED) return;

    let damage = (impactSpeed - FALL_DAMAGE_SPEED) * FALL_DAMAGE_SCALE;
    damage = Math.min(FALL_DAMAGE_MAX, damage);
    if (this.keys.brake) damage *= 1 - FALL_DAMAGE_BRAKE_RELIEF;

    damage = Math.round(damage);
    // pendingFallDamage 讓 main.js 知道要播受傷特效（不然摔到只會默默掉血）
    if (damage > 0 && this.takeDamage(damage)) this.pendingFallDamage = damage;
  }

  // 建築碰撞、落地、城牆邊界
  resolveWorld(dt, world) {
    world.resolveCollision(this.position, this.velocity, PLAYER_RADIUS);

    const ground = world.groundHeightAt(this.position.x, this.position.z) + EYE_HEIGHT;
    if (this.position.y <= ground) {
      const impact = -this.velocity.y;
      this.position.y = ground;
      if (!this.grounded) {
        this.groundedTime = 0;
        this.applyFallDamage(impact);
      }
      this.velocity.y = Math.max(0, this.velocity.y);
      this.grounded = true;
      // 落地摩擦：煞車時再加倍，屋頂才站得住
      const friction = LANDING_FRICTION * (this.keys.brake ? 2.5 : 1);
      this.velocity.x *= Math.max(0, 1 - friction * dt);
      this.velocity.z *= Math.max(0, 1 - friction * dt);
    } else {
      this.grounded = false;
    }

    // 不准飛出城牆
    const distFromCenter = Math.hypot(this.position.x, this.position.z);
    const limit = CITY_RADIUS + 6;
    if (distFromCenter > limit) {
      const nx = this.position.x / distFromCenter;
      const nz = this.position.z / distFromCenter;
      this.position.x = nx * limit;
      this.position.z = nz * limit;
      const into = this.velocity.x * nx + this.velocity.z * nz;
      if (into > 0) {
        this.velocity.x -= nx * into;
        this.velocity.z -= nz * into;
      }
    }
  }

  applyCamera(dt) {
    // 側向速度越大鏡頭傾得越多，這是飛行感最便宜也最有效的來源
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const lateral = this.velocity.x * _right.x + this.velocity.z * _right.z;
    const targetRoll = THREE.MathUtils.clamp(-lateral * 0.011, -0.42, 0.42);
    this.roll += (targetRoll - this.roll) * Math.min(1, 6 * dt);

    _euler.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);
    this.camera.position.copy(this.position);

    // 速度越快視野越廣
    const targetFov = 76 + Math.min(this.speed, 60) * 0.36;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 5 * dt);
    this.camera.updateProjectionMatrix();
  }
}
