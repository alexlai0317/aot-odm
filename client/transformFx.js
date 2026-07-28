import * as THREE from 'three';
import {
  TITAN_TRANSFORM_EXPLOSION_RADIUS,
  TITAN_TRANSFORM_EXPLOSION_DURATION,
  TITAN_TRANSFORM_LIGHTNING_COUNT,
} from './constants.js';

// 變身瞬間的視覺特效：一圈小閃電竄出＋一次大爆炸衝擊波。
// 純視覺、不影響判定，跟 titan.js 的蒸氣特效一樣，自己管理生命週期。

export class TransformEffects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  spawn(position) {
    this.spawnExplosion(position);
    this.spawnLightning(position);
  }

  spawnExplosion(position) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.9 })
    );
    flash.position.copy(position);
    this.scene.add(flash);
    this.items.push({ mesh: flash, age: 0, duration: TITAN_TRANSFORM_EXPLOSION_DURATION, kind: 'flash' });

    // 地面衝擊波：一圈平躺的環，往外炸開
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, 0.3, position.z);
    this.scene.add(ring);
    this.items.push({ mesh: ring, age: 0, duration: TITAN_TRANSFORM_EXPLOSION_DURATION * 1.4, kind: 'shockwave' });
  }

  // 從變身點往外竄出的幾道小閃電：隨機方向的鋸齒折線，壽命很短
  spawnLightning(position) {
    for (let i = 0; i < TITAN_TRANSFORM_LIGHTNING_COUNT; i++) {
      const angle = (i / TITAN_TRANSFORM_LIGHTNING_COUNT) * Math.PI * 2 + Math.random() * 0.4;
      const length = 3 + Math.random() * 4;
      const baseY = Math.random() * 3 + 1;
      const segments = 4;
      const points = [];
      for (let s = 0; s <= segments; s++) {
        const r = (length / segments) * s;
        points.push(new THREE.Vector3(
          Math.cos(angle) * r + (Math.random() - 0.5) * 0.6,
          baseY + (Math.random() - 0.5) * 0.8,
          Math.sin(angle) * r + (Math.random() - 0.5) * 0.6
        ));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 1 })
      );
      line.position.copy(position);
      this.scene.add(line);
      this.items.push({ mesh: line, age: 0, duration: 0.2 + Math.random() * 0.25, kind: 'lightning' });
    }
  }

  update(dt) {
    const remaining = [];
    for (const item of this.items) {
      item.age += dt;
      const t = Math.min(1, item.age / item.duration);

      if (item.kind === 'flash') {
        item.mesh.scale.setScalar(1 + t * TITAN_TRANSFORM_EXPLOSION_RADIUS);
        item.mesh.material.opacity = 0.9 * (1 - t);
      } else if (item.kind === 'shockwave') {
        item.mesh.scale.setScalar(1 + t * TITAN_TRANSFORM_EXPLOSION_RADIUS * 1.6);
        item.mesh.material.opacity = 0.85 * (1 - t);
      } else {
        item.mesh.material.opacity = 1 - t;
      }

      if (t >= 1) {
        this.scene.remove(item.mesh);
        item.mesh.geometry.dispose();
        item.mesh.material.dispose();
        continue;
      }
      remaining.push(item);
    }
    this.items = remaining;
  }
}
