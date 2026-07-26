import * as THREE from 'three';
import {
  BLADE_REACH,
  BODY_REACH_SCALE,
  BLADE_COST_NAPE,
  BLADE_COST_BODY,
  MIN_KILL_SPEED,
  BLADE_BASE_DAMAGE,
  BLADE_SPEED_DAMAGE,
} from './constants.js';

// 揮刀的命中結算。
//
// 這是整個遊戲的核心規則：傷害完全由「揮刀當下的移動速度」決定。
// 站著砍砍不動巨人，要先用鉤索把速度拉起來再切下去 —— 原作就是這樣打的。

const _forward = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _nape = new THREE.Vector3();

export function swingDamage(speed) {
  return BLADE_BASE_DAMAGE + speed * BLADE_SPEED_DAMAGE;
}

export function resolveSwing(player, titanManager, camera) {
  camera.getWorldDirection(_forward);

  const napeTarget = findNapeTarget(player, titanManager);
  if (napeTarget) {
    return hitNape(player, napeTarget.titan, napeTarget.distance);
  }

  const bodyTarget = findBodyTarget(player, titanManager);
  if (bodyTarget) {
    return hitBody(player, bodyTarget.titan, bodyTarget.limb);
  }

  return { type: 'miss' };
}

// 給 HUD 用：現在揮刀砍不砍得到弱點。準心會依這個結果變色，
// 玩家才不用靠猜的決定什麼時候按 Shift。
export function napeInReach(player, titanManager, camera) {
  camera.getWorldDirection(_forward);
  return findNapeTarget(player, titanManager);
}

function findNapeTarget(player, titanManager) {
  let best = null;
  let bestDist = Infinity;

  for (const titan of titanManager.titans) {
    if (!titan.alive) continue;
    titan.napeWorldPosition(_nape);
    const dist = _nape.distanceTo(player.position);
    // 弱點的判定範圍隨體型放大，不然大型巨人的後頸小到打不中
    const reach = BLADE_REACH + titan.height * 0.2;
    if (dist > reach) continue;

    // 必須大致朝著弱點揮刀，背對著亂揮不算
    _toTarget.subVectors(_nape, player.position).normalize();
    if (_toTarget.dot(_forward) < 0) continue;

    if (dist < bestDist) {
      bestDist = dist;
      best = { titan, distance: dist };
    }
  }
  return best;
}

function findBodyTarget(player, titanManager) {
  let best = null;
  let bestDist = Infinity;

  for (const titan of titanManager.titans) {
    if (!titan.alive) continue;
    const pos = titan.group.position;
    const dx = player.position.x - pos.x;
    const dz = player.position.z - pos.z;
    // 身體用一根從腳到頭的圓柱近似，夠精準又不用逐 mesh 檢查
    const horizontal = Math.hypot(dx, dz) - titan.height * 0.22;
    const withinHeight = player.position.y > -1 && player.position.y < titan.height * 1.05;
    if (!withinHeight) continue;

    const dist = Math.max(0, horizontal);
    if (dist > BLADE_REACH * BODY_REACH_SCALE) continue;

    _toTarget.set(-dx, 0, -dz).normalize();
    if (_toTarget.dot(_forward) < -0.1) continue;

    if (dist < bestDist) {
      bestDist = dist;
      // 砍在肩膀高度附近算手臂，砍得到手臂才有機會打出硬直
      const shoulderY = titan.height * 0.76;
      const limb = Math.abs(player.position.y - shoulderY) < titan.height * 0.25
        ? (dx * Math.cos(titan.yaw) > 0 ? 'ra' : 'la')
        : null;
      best = { titan, limb };
    }
  }
  return best;
}

function hitNape(player, titan, distance) {
  const speed = player.speed;
  if (speed < MIN_KILL_SPEED) {
    // 速度不足：刀刃彈開，只有一點點磨損，也不會給巨人造成傷害
    player.bladeDurability = Math.max(0, player.bladeDurability - 6);
    return { type: 'tooSlow', titan, speed };
  }

  const damage = swingDamage(speed);
  const killed = titan.damageNape(damage);
  player.bladeDurability = Math.max(0, player.bladeDurability - BLADE_COST_NAPE);

  return { type: killed ? 'kill' : 'nape', titan, damage, speed, distance };
}

function hitBody(player, titan, limb) {
  const speed = player.speed;
  const damage = swingDamage(speed) * 0.7;
  player.bladeDurability = Math.max(0, player.bladeDurability - BLADE_COST_BODY);

  let staggered = false;
  if (limb && speed >= MIN_KILL_SPEED) {
    staggered = titan.damageLimb(limb, damage);
  }
  return { type: 'body', titan, damage, speed, staggered, limb };
}

// 擊殺分數：速度越快、掛在空中、體型越大，分數越高
export function scoreForKill(titan, speed, airborne) {
  const base = Math.round(titan.napeMaxHp * 1.2);
  const speedBonus = Math.round(speed * 6);
  const airBonus = airborne ? 150 : 0;
  return base + speedBonus + airBonus;
}
