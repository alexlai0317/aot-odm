import * as THREE from 'three';
import {
  HOOK_RANGE,
  HOOK_TRAVEL_SPEED,
  HOOK_PULL_ACCEL,
  HOOK_PULL_FALLOFF,
  HOOK_REEL_RATE,
  HOOK_REEL_BOOST,
  HOOK_MIN_LENGTH,
  ROPE_SPRING,
  ROPE_DAMP,
} from './constants.js';

// 立體機動裝置。整個遊戲的手感都在這個檔案裡。
//
// 繩索的物理模型：
//   1. 掛上去之後，繩長只會變短（捲揚機收繩），不會變長 —— 這是繩子而不是橡皮筋
//   2. 沿繩索方向持續施加拉力，這是「被扯著走」的來源
//   3. 實際距離超過繩長時，用彈簧把人拉回來，同時削掉離心方向的速度
//      → 兩者合起來就會把直線運動彎成圓弧，也就是盪
//
// 錨點支援掛在會動的物件上（例如巨人身上），做法是記下命中點在該物件座標系
// 底下的位置，每幀再轉回世界座標。

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
_raycaster.far = HOOK_RANGE;

const HAND_OFFSET = 0.34; // 鉤索從腰際左右兩側射出，不是從眼睛正中央

export class OdmGear {
  constructor(scene, camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.hooks = [this.createHook(-1), this.createHook(1)];
  }

  createHook(side) {
    const ropeGeom = new THREE.BufferGeometry();
    ropeGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const rope = new THREE.Line(
      ropeGeom,
      new THREE.LineBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.85 })
    );
    rope.frustumCulled = false;
    rope.visible = false;
    this.group.add(rope);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.7, 6),
      new THREE.MeshBasicMaterial({ color: 0xbfc6cc })
    );
    tip.visible = false;
    this.group.add(tip);

    return {
      side, // -1 = 左鉤，1 = 右鉤
      state: 'idle', // idle | flying | attached
      anchor: new THREE.Vector3(),
      anchorObject: null,
      localPoint: new THREE.Vector3(),
      tipPos: new THREE.Vector3(),
      length: 0,
      rope,
      tip,
    };
  }

  anyAttached() {
    return this.hooks.some((h) => h.state === 'attached');
  }

  attachedCount() {
    return this.hooks.filter((h) => h.state === 'attached').length;
  }

  // 從相機發射鉤索。targets 是可以被鉤中的物件陣列（建築、城牆、巨人）。
  // 回傳是否成功命中。
  fire(index, playerPos, targets) {
    const hook = this.hooks[index];
    this.detach(index);

    // 瞄準方向就是準心正中央：曾經讓左右鉤各偏 6.5 度製造雙錨點的張開感，
    // 但巨人的身體遠比建築物窄，距離一拉開，那個偏移角度換算成的側向誤差
    // 就足以讓鉤爪直接飛過巨人兩側完全打空。視覺上的雙錨點張力改由發射
    // 位置的左右手偏移（handPosition）提供，瞄準本身必須跟準心完全一致。
    this.camera.getWorldDirection(_dir);

    _raycaster.set(this.handPosition(hook.side, playerPos, _v1), _dir);
    const hits = _raycaster.intersectObjects(targets, false);
    // 過濾掉貼身距離的命中（例如往下看時打到自己腳邊的地面），
    // 但門檻壓低，才不會讓近戰後想立刻鉤住同一隻巨人重新拉開距離的動作失敗
    const hit = hits.find((h) => h.distance > 1.2);
    if (!hit) return false;

    hook.state = 'flying';
    hook.anchorObject = hit.object;
    hook.localPoint.copy(hit.object.worldToLocal(hit.point.clone()));
    hook.anchor.copy(hit.point);
    hook.tipPos.copy(this.handPosition(hook.side, playerPos, _v1));
    hook.length = hook.anchor.distanceTo(playerPos);
    return true;
  }

  detach(index) {
    const hook = this.hooks[index];
    hook.state = 'idle';
    hook.anchorObject = null;
    hook.rope.visible = false;
    hook.tip.visible = false;
  }

  detachAll() {
    this.hooks.forEach((_, i) => this.detach(i));
  }

  // 鉤索射出的位置：相機往左右與下方偏移一點，繩子才不會從畫面正中央長出來
  handPosition(side, playerPos, out) {
    out.copy(playerPos);
    _v2.set(side * HAND_OFFSET, -0.25, 0).applyQuaternion(this.camera.quaternion);
    return out.add(_v2);
  }

  // 每幀更新：直接修改傳進來的 position / velocity。
  // 回傳這一幀有沒有在收繩（給瓦斯消耗與音效用）。
  update(dt, position, velocity, gasHeld, braking = false) {
    let reeling = false;
    // 拉力隨速度遞減，避免一直掛著就無限加速
    const pullFactor = braking
      ? 0
      : Math.max(0, 1 - velocity.length() / HOOK_PULL_FALLOFF);

    for (let i = 0; i < this.hooks.length; i++) {
      const hook = this.hooks[i];
      if (hook.state === 'idle') continue;

      // 錨點掛在會動的物件上時，每幀重算世界座標
      if (hook.anchorObject) {
        if (!hook.anchorObject.parent || hook.anchorObject.userData.detached) {
          this.detach(i); // 巨人死了 / 物件被移除 → 鉤子失效
          continue;
        }
        hook.anchor.copy(hook.anchorObject.localToWorld(_v1.copy(hook.localPoint)));
      }

      if (hook.state === 'flying') {
        // 鉤爪還在飛，這段時間不產生任何拉力，純粹是發射的視覺延遲
        const toAnchor = _v1.subVectors(hook.anchor, hook.tipPos);
        const step = HOOK_TRAVEL_SPEED * dt;
        if (toAnchor.length() <= step) {
          hook.tipPos.copy(hook.anchor);
          hook.state = 'attached';
          hook.length = hook.anchor.distanceTo(position);
        } else {
          hook.tipPos.addScaledVector(toAnchor.normalize(), step);
        }
        continue;
      }

      const toAnchor = _v1.subVectors(hook.anchor, position);
      const dist = toAnchor.length();
      if (dist < HOOK_MIN_LENGTH) {
        this.detach(i); // 已經到了，自動脫鉤讓玩家接下一個錨點
        continue;
      }
      _dir.copy(toAnchor).divideScalar(dist);

      // (2) 捲揚機拉力（煞車時完全放掉，繩子只剩下限制作用）
      velocity.addScaledVector(_dir, HOOK_PULL_ACCEL * pullFactor * dt);

      // (1) 收繩，繩長只減不增
      const reelRate = braking ? 0 : HOOK_REEL_RATE + (gasHeld ? HOOK_REEL_BOOST : 0);
      hook.length = Math.max(HOOK_MIN_LENGTH, hook.length - reelRate * dt);
      if (gasHeld) reeling = true;

      // (3) 繩索被拉長 → 彈簧回拉 + 削掉離心速度，直線就會被彎成圓弧
      const over = dist - hook.length;
      if (over > 0) {
        velocity.addScaledVector(_dir, over * ROPE_SPRING * dt);
        const radial = velocity.dot(_dir); // 正值代表正在靠近錨點
        if (radial < 0) {
          velocity.addScaledVector(_dir, -radial * Math.min(1, ROPE_DAMP * dt));
        }
      }

      hook.tipPos.copy(hook.anchor);
    }

    return reeling;
  }

  // 繩索與鉤爪的視覺更新（位置在 update 之後才畫，避免慢一幀）
  render(position) {
    for (const hook of this.hooks) {
      if (hook.state === 'idle') continue;

      const hand = this.handPosition(hook.side, position, _v1);
      const arr = hook.rope.geometry.attributes.position.array;
      arr[0] = hand.x;
      arr[1] = hand.y;
      arr[2] = hand.z;
      arr[3] = hook.tipPos.x;
      arr[4] = hook.tipPos.y;
      arr[5] = hook.tipPos.z;
      hook.rope.geometry.attributes.position.needsUpdate = true;
      hook.rope.visible = true;

      hook.tip.position.copy(hook.tipPos);
      hook.tip.lookAt(hand);
      hook.tip.rotateX(Math.PI / 2);
      hook.tip.visible = true;
    }
  }
}
