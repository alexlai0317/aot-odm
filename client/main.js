import * as THREE from 'three';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { OdmGear } from './odm.js';
import { ViewModel } from './viewmodel.js';
import { TitanManager } from './titan.js';
import { WaveManager } from './waves.js';
import { Hud } from './hud.js';
import { resolveSwing, scoreForKill, napeInReach } from './combat.js';
import * as audio from './audio.js';
import { BLADE_SWING_TIME, BLADE_HIT_WINDOW, GAS_MAX, MIN_KILL_SPEED } from './constants.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.1, 1200);

const world = createWorld();
world.scene.add(camera); // viewmodel 掛在 camera 底下，camera 必須進場景才會被渲染

const player = new Player(camera, canvas);
const odm = new OdmGear(world.scene, camera);
const viewModel = new ViewModel(camera);
const titans = new TitanManager(world.scene);
const waves = new WaveManager(titans);
const hud = new Hud();

const state = {
  running: false,
  score: 0,
  kills: 0,
  dying: false, // 陣亡動畫播放中
  deathTimer: 0, // 歸零才跳結算畫面
  lastSwingTimer: 0,
  lastReloadTimer: 0,
};

// ── 畫面與輸入 ───────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const overlay = document.getElementById('overlay');
const pausePanel = document.getElementById('pause');
const gameOverPanel = document.getElementById('gameover');

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', () => {
  gameOverPanel.classList.add('hidden');
  startGame();
});

canvas.addEventListener('click', () => {
  // 暫停後點畫面繼續（陣亡畫面不吃這個，要按重新出擊）
  if (state.running && !player.locked && player.alive) canvas.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  if (!state.running) return;
  const locked = document.pointerLockElement === canvas;
  pausePanel.classList.toggle('hidden', locked || !player.alive);
  if (!locked) audio.setGas(false);
});

function startGame() {
  audio.init();
  audio.resume();

  titans.clear();
  waves.reset();
  player.respawn(0, 0);
  odm.detachAll();
  viewModel.setBroken(false);
  state.score = 0;
  state.kills = 0;
  state.dying = false;
  state.deathTimer = 0;
  state.running = true;

  overlay.classList.add('hidden');
  pausePanel.classList.add('hidden');
  hud.show();
  hud.setScore(0, 0);
  canvas.requestPointerLock();
}

// ── 鉤索的發射／收回 ─────────────────────────────────────
// 滑鼠按住 = 維持鉤索，放開 = 脫鉤。這裡只負責把「按鍵狀態」翻譯成鉤索動作。
function updateHookInput() {
  for (let i = 0; i < 2; i++) {
    const wants = player.hookInput[i];
    const hook = odm.hooks[i];

    if (wants && hook.state === 'idle') {
      const targets = [...world.hookables, ...titans.hookableMeshes()];
      const hit = odm.fire(i, player.position, targets);
      if (hit) audio.sfx.hookFire();
      else {
        audio.sfx.hookMiss();
        player.hookInput[i] = false; // 打空就重置，避免按著不放一直重射
      }
    } else if (!wants && hook.state !== 'idle') {
      odm.detach(i);
    }
  }
}

// ── 揮刀結算 ─────────────────────────────────────────────
function updateSwing() {
  // 從 0 變成 > 0 的那一幀 = 剛開始揮刀
  if (player.swingTimer > 0 && state.lastSwingTimer === 0) {
    viewModel.startSwing();
    audio.sfx.swing();
  }
  state.lastSwingTimer = player.swingTimer;

  if (player.swingTimer <= 0 || player.swingHitDone) return;

  const elapsed = BLADE_SWING_TIME - player.swingTimer;
  if (elapsed < BLADE_HIT_WINDOW[0] || elapsed > BLADE_HIT_WINDOW[1]) return;

  const result = resolveSwing(player, titans, camera);
  if (result.type === 'miss') return;

  player.swingHitDone = true;
  handleHit(result);
}

function handleHit(result) {
  const { titan } = result;

  switch (result.type) {
    case 'kill': {
      const airborne = !player.grounded;
      const gained = scoreForKill(titan, result.speed, airborne);
      state.score += gained;
      state.kills += 1;
      hud.setScore(state.score, state.kills);

      titans.emitSteam(titan.napeWorldPosition().clone(), titan.height * 0.35);
      audio.sfx.kill();
      hud.toast(airborne ? '空中討伐！' : '討伐成功', '', 1100);
      hud.feed(
        `討伐 <b>${titan.type.label}巨人</b> +${gained}${airborne ? ' <b>空中</b>' : ''}`,
        'kill'
      );
      break;
    }
    case 'nape':
      // 砍中弱點但沒切斷：多半是速度不夠，提示玩家再拉一次速度
      audio.sfx.fleshHit();
      hud.toast(`弱點命中 ${Math.round(titan.napeHp)} / ${titan.napeMaxHp}`, 'warn', 900);
      break;
    case 'tooSlow':
      audio.sfx.bladeClang();
      hud.toast('速度不足，刀刃彈開了', 'bad', 1200);
      break;
    case 'body':
      audio.sfx.fleshHit();
      if (result.staggered) {
        hud.toast('手臂已斷 — 硬直中', '', 1100);
        hud.feed(`削斷 <b>${titan.type.label}巨人</b> 的手臂`);
      }
      break;
    default:
      break;
  }

  if (player.bladeDurability <= 0) {
    viewModel.setBroken(true);
    hud.toast('刀刃損毀 — 按 R 更換', 'bad', 1600);
  }
}

// ── 遊戲主迴圈 ───────────────────────────────────────────
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05); // 切分頁回來時不要一次算太大一步

  // 解除滑鼠鎖定 = 暫停，整個世界凍結（陣亡動畫除外）
  const simulating = state.running && (player.locked || !player.alive);

  if (simulating) {
    if (player.alive) {
      updateHookInput();
      updateSwing();
    }

    player.update(dt, world, odm);
    odm.render(player.position);
    viewModel.update(dt, player);
    titans.update(dt, player, onPlayerHit);

    if (player.alive) {
      const { distance } = titans.nearest(player.position);
      const wasRegenerating = player.regenerating;
      player.updateRegen(dt, distance);
      if (player.regenerating && !wasRegenerating) hud.toast('體力回復中', '', 1300);
    }

    if (player.pendingFallDamage) {
      hud.damageFlash();
      audio.sfx.playerHurt();
      hud.feed(`落地衝擊 −${player.pendingFallDamage}`);
      player.pendingFallDamage = 0;
    }

    if (player.alive) {
      handleWaveEvents(dt);
      updateReloadFeedback();
    } else {
      // 陣亡：先讓鏡頭墜落一下再跳結算。摔死跟被打死都會走到這裡
      if (!state.dying) {
        state.dying = true;
        state.deathTimer = 1.4;
        odm.detachAll();
        audio.sfx.roar();
      }
      state.deathTimer -= dt;
      if (state.deathTimer <= 0) endGame();
    }

    hud.update(player, { label: waves.label, remainingText: waves.remainingText });
    const target = player.alive ? napeInReach(player, titans, camera) : null;
    hud.setCrosshairState(!!target, player.speed >= MIN_KILL_SPEED);

    // 瓦斯音效跟著實際噴射狀態走
    const thrusting = player.keys.gas && player.gas > 0 && player.alive;
    audio.setGas(thrusting, odm.anyAttached() ? 1 : 0.7);
  } else {
    audio.setGas(false);
  }

  renderer.render(world.scene, camera);
}

function onPlayerHit(damage, titan) {
  if (!player.takeDamage(damage)) return;
  hud.damageFlash();
  audio.sfx.playerHurt();
  hud.feed(`被 <b>${titan.type.label}巨人</b> 擊中 −${damage}`);
  // 被打到會被甩開，同時鉤索脫落 —— 這是被巨人拍到最痛的地方
  odm.detachAll();
  const away = new THREE.Vector3()
    .subVectors(player.position, titan.group.position)
    .setY(0.6)
    .normalize();
  player.velocity.addScaledVector(away, 18);
}

function handleWaveEvents(dt) {
  const event = waves.update(dt, player.position);
  if (!event) return;

  if (event.type === 'waveStarted') {
    audio.sfx.waveStart();
    setTimeout(() => audio.sfx.roar(), 400);
    hud.toast(`第 ${event.wave} 波 — ${event.count} 隻巨人`, 'warn', 2200);
  } else if (event.type === 'waveCleared') {
    audio.sfx.waveClear();
    // 清空一波補給：瓦斯回滿、補刀刃，這是唯一的補給時機
    player.gas = GAS_MAX;
    player.spareBlades += 2;
    hud.toast(`第 ${event.wave} 波肅清 — 補給完成`, '', 2400);
    hud.feed('補給：瓦斯全滿、刀刃 +2 組');
  }
}

function updateReloadFeedback() {
  if (player.reloadTimer > 0 && state.lastReloadTimer === 0) {
    audio.sfx.reload();
  }
  if (player.reloadTimer === 0 && state.lastReloadTimer > 0) {
    viewModel.setBroken(false);
  }
  state.lastReloadTimer = player.reloadTimer;
}

function endGame() {
  if (!state.running) return;
  state.running = false;
  audio.setGas(false);
  audio.sfx.gameOver();
  odm.detachAll();
  document.exitPointerLock();

  document.getElementById('go-summary').innerHTML =
    `撐到第 ${Math.max(1, waves.wave)} 波 · 討伐 ${state.kills} 隻 · 分數 ${state.score}`;
  gameOverPanel.classList.remove('hidden');
  pausePanel.classList.add('hidden');
}

frame();
