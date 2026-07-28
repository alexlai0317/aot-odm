import * as THREE from 'three';
import { TITAN_FORM_PUNCH_TIME, TITAN_FORM_KICK_TIME } from './constants.js';

// 巨人形態的第一人稱視覺：拳頭跟腳。掛在 camera 底下，跟刀刃 ViewModel 是同一套做法，
// 平常藏著，main.js 只在 player.titanFormActive 時把 group.visible 打開。

const FIST_REST = {
  left: { pos: [-0.42, -0.36, -0.7], rot: [0.1, 0.3, 0.2] },
  right: { pos: [0.42, -0.36, -0.7], rot: [0.1, -0.3, -0.2] },
};
const FOOT_REST = { pos: [0, -0.62, -0.55], rot: [0, 0, 0] };

export class TitanFistViewModel {
  constructor(camera) {
    this.group = new THREE.Group();
    this.group.visible = false;
    camera.add(this.group);

    this.fists = { left: this.createFist(-1), right: this.createFist(1) };
    this.group.add(this.fists.left, this.fists.right);

    this.foot = this.createFoot();
    this.group.add(this.foot);

    this.punchSide = 'right';
    this.punchProgress = 1;
    this.kickProgress = 1;
    this.bob = 0;
  }

  createFist(side) {
    const skin = new THREE.MeshBasicMaterial({ color: 0xb08a68 });
    const group = new THREE.Group();

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.7), skin);
    forearm.position.z = -0.25;
    group.add(forearm);

    const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.34), skin);
    knuckle.position.z = -0.7;
    group.add(knuckle);

    const key = side < 0 ? 'left' : 'right';
    group.position.fromArray(FIST_REST[key].pos);
    group.rotation.fromArray(FIST_REST[key].rot);
    group.userData.rest = FIST_REST[key];
    return group;
  }

  createFoot() {
    const skin = new THREE.MeshBasicMaterial({ color: 0xa07d5e });
    const group = new THREE.Group();

    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.34), skin);
    shin.position.y = 0.3;
    group.add(shin);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.5), skin);
    foot.position.set(0, -0.15, -0.2);
    group.add(foot);

    group.position.fromArray(FOOT_REST.pos);
    group.rotation.fromArray(FOOT_REST.rot);
    group.visible = false; // 只有踢擊過程中才顯示，平常藏在畫面外
    return group;
  }

  startPunch() {
    this.punchSide = this.punchSide === 'right' ? 'left' : 'right';
    this.punchProgress = 0;
  }

  startKick() {
    this.kickProgress = 0;
    this.foot.visible = true;
  }

  update(dt, player) {
    if (player.punchTimer > 0) {
      this.punchProgress = 1 - player.punchTimer / TITAN_FORM_PUNCH_TIME;
    } else if (this.punchProgress < 1) {
      this.punchProgress = Math.min(1, this.punchProgress + dt / 0.2);
    }

    if (player.kickTimer > 0) {
      this.kickProgress = 1 - player.kickTimer / TITAN_FORM_KICK_TIME;
    } else if (this.kickProgress < 1) {
      this.kickProgress = Math.min(1, this.kickProgress + dt / 0.25);
      if (this.kickProgress >= 1) this.foot.visible = false;
    }

    this.bob += dt * 1.5;

    for (const key of ['left', 'right']) {
      const fist = this.fists[key];
      const rest = fist.userData.rest;
      fist.position.set(rest.pos[0], rest.pos[1], rest.pos[2]);
      fist.rotation.set(rest.rot[0], rest.rot[1], rest.rot[2]);
      fist.position.y += Math.sin(this.bob + (key === 'left' ? Math.PI : 0)) * 0.01;

      if (key === this.punchSide && this.punchProgress < 1) {
        applyPunch(fist, this.punchProgress);
      }
    }

    if (this.foot.visible) {
      applyKick(this.foot, this.kickProgress);
    }
  }
}

// 直拳：往正前方頂出去再收回，跟刀刃的橫掃不同，強調「巨人蠻力正面撞擊」的手感
function applyPunch(fist, t) {
  const arc = Math.sin(t * Math.PI);
  fist.position.z -= arc * 0.9;
  fist.position.y -= arc * 0.08;
  fist.rotation.x -= arc * 0.2;
}

// 踢擊：從畫面下方掃出去
function applyKick(foot, t) {
  const arc = Math.sin(t * Math.PI);
  foot.position.set(FOOT_REST.pos[0], FOOT_REST.pos[1] + arc * 0.55, FOOT_REST.pos[2] - arc * 0.8);
  foot.rotation.x = -arc * 0.9;
}
