import * as THREE from 'three';
import { BLADE_SWING_TIME } from './constants.js';

// 手上的超硬質刀刃。掛在 camera 底下，所以永遠跟著視角走。

const REST = {
  left: { pos: [-0.34, -0.26, -0.5], rot: [-0.25, 0.35, 0.5] },
  right: { pos: [0.34, -0.26, -0.5], rot: [-0.25, -0.35, -0.5] },
};

export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    camera.add(this.group);

    this.blades = {
      left: this.createBlade(-1),
      right: this.createBlade(1),
    };
    this.group.add(this.blades.left, this.blades.right);

    this.swingSide = 'right';
    this.swingProgress = 1; // 1 = 收刀完畢
    this.bob = 0;
    this.broken = false;

    this.slash = this.createSlash();
    camera.add(this.slash);
  }

  createBlade(side) {
    const group = new THREE.Group();

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x3a3f45 })
    );
    group.add(handle);

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.012, 0.95),
      new THREE.MeshBasicMaterial({ color: 0xd7dde3 })
    );
    blade.position.z = -0.58;
    group.add(blade);

    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.03, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x8a9299 })
    );
    guard.position.z = -0.12;
    group.add(guard);

    const key = side < 0 ? 'left' : 'right';
    group.position.fromArray(REST[key].pos);
    group.rotation.fromArray(REST[key].rot);
    group.userData.rest = REST[key];
    return group;
  }

  // 揮擊瞬間畫在畫面上的一道弧光
  createSlash() {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.95, 24, 1, Math.PI * 0.15, Math.PI * 0.7),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthTest: false,
      })
    );
    mesh.position.z = -1.4;
    mesh.renderOrder = 999;
    return mesh;
  }

  startSwing() {
    this.swingSide = this.swingSide === 'right' ? 'left' : 'right';
    this.swingProgress = 0;
    this.slash.rotation.z = this.swingSide === 'right' ? Math.PI * 0.9 : Math.PI * -0.1;
    this.slash.scale.x = this.swingSide === 'right' ? 1 : -1;
    this.slash.material.opacity = 0.75;
  }

  setBroken(broken) {
    this.broken = broken;
    const color = broken ? 0x6b5b52 : 0xd7dde3;
    for (const key of ['left', 'right']) {
      // children[1] 是刀身本體
      this.blades[key].children[1].material.color.set(color);
    }
  }

  update(dt, player) {
    if (player.swingTimer > 0) {
      this.swingProgress = 1 - player.swingTimer / BLADE_SWING_TIME;
    } else if (this.swingProgress < 1) {
      this.swingProgress = Math.min(1, this.swingProgress + dt / 0.18);
    }

    this.slash.material.opacity = Math.max(0, this.slash.material.opacity - dt * 4);

    // 高速移動時刀刃微微晃動，靜止時幾乎不動
    this.bob += dt * (2 + player.speed * 0.12);
    const intensity = Math.min(1, player.speed / 45);

    for (const key of ['left', 'right']) {
      const blade = this.blades[key];
      const rest = blade.userData.rest;
      blade.position.set(rest.pos[0], rest.pos[1], rest.pos[2]);
      blade.rotation.set(rest.rot[0], rest.rot[1], rest.rot[2]);

      blade.position.y += Math.sin(this.bob) * 0.012 * (0.4 + intensity);
      blade.position.x += Math.cos(this.bob * 0.7) * 0.008 * (0.4 + intensity);

      if (key === this.swingSide && this.swingProgress < 1) {
        applySwing(blade, this.swingProgress, key === 'right' ? 1 : -1);
      }
    }

    // 換刀時把刀收到畫面下緣
    if (player.reloadTimer > 0) {
      const t = Math.sin((1 - player.reloadTimer / 1.1) * Math.PI);
      this.blades.left.position.y -= t * 0.5;
      this.blades.right.position.y -= t * 0.5;
      this.blades.left.rotation.x -= t * 1.2;
      this.blades.right.rotation.x -= t * 1.2;
    }
  }
}

// 一次揮擊：先往外拉開、快速掃過中線、再回到待機位
function applySwing(blade, t, dir) {
  const arc = Math.sin(t * Math.PI); // 0 → 1 → 0
  const sweep = THREE.MathUtils.smoothstep(t, 0, 0.55); // 0 → 1，掃過去就不回頭
  blade.position.x += dir * (0.28 - sweep * 0.72) * arc * 1.4;
  blade.position.y += arc * 0.16;
  blade.position.z += -arc * 0.28;
  blade.rotation.z += dir * (1.5 - sweep * 3.0);
  blade.rotation.x += arc * 0.5;
}
