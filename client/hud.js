import { PLAYER_MAX_HP, GAS_MAX, BLADE_MAX_DURABILITY, TITAN_FORM_GAUGE_MAX } from './constants.js';

// HUD 就是一層 DOM，跟 three.js 完全解耦：main.js 每幀把數值餵進來就好。

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.hpBar = $('hp-bar');
    this.hpValue = $('hp-value');
    this.gasBar = $('gas-bar');
    this.gasValue = $('gas-value');
    this.bladeBar = $('blade-bar');
    this.bladeSpare = $('blade-spare');
    this.speedValue = $('speed-value');
    this.speedBox = $('speed');
    this.scoreValue = $('score-value');
    this.killValue = $('kill-value');
    this.waveLabel = $('wave-label');
    this.waveRemaining = $('wave-remaining');
    this.toastEl = $('toast');
    this.feedEl = $('feed');
    this.vignette = $('vignette');
    this.crosshair = $('crosshair');

    this.titanGaugeBar = $('titan-gauge-bar');
    this.titanGaugeValue = $('titan-gauge-value');
    this.bossBar = $('boss-bar');
    this.bossName = $('boss-name');
    this.bossHpBar = $('boss-hp-bar');
    this.titanFormBanner = $('titan-form-banner');
    this.titanFormTimerEl = $('titan-form-timer');

    this.toastTimer = null;
    this.flashTimer = null;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  update(player, wave) {
    const hpPct = (player.hp / PLAYER_MAX_HP) * 100;
    this.hpBar.style.width = `${hpPct}%`;
    this.hpValue.textContent = Math.ceil(player.hp);
    this.hpBar.classList.toggle('low', hpPct < 30 && !player.regenerating);
    this.hpBar.classList.toggle('regen', player.regenerating);

    const gasPct = (player.gas / GAS_MAX) * 100;
    this.gasBar.style.width = `${gasPct}%`;
    this.gasValue.textContent = Math.ceil(player.gas);
    this.gasBar.classList.toggle('low', gasPct < 20);

    const bladePct = (player.bladeDurability / BLADE_MAX_DURABILITY) * 100;
    this.bladeBar.style.width = `${bladePct}%`;
    this.bladeBar.classList.toggle('low', bladePct < 25);
    this.bladeSpare.textContent = player.reloadTimer > 0
      ? '更換中…'
      : `備用 ×${player.spareBlades}`;

    // 玩家在意的是「夠不夠快砍得死」，km/h 比 m/s 直覺
    const kmh = Math.round(player.speed * 3.6);
    this.speedValue.textContent = kmh;
    this.speedBox.classList.toggle('fast', kmh >= 60);

    this.waveLabel.textContent = wave.label;
    this.waveRemaining.textContent = wave.remainingText;

    const gaugeReady = player.titanGauge >= TITAN_FORM_GAUGE_MAX;
    const gaugePct = (player.titanGauge / TITAN_FORM_GAUGE_MAX) * 100;
    this.titanGaugeBar.style.width = `${gaugePct}%`;
    this.titanGaugeBar.classList.toggle('ready', gaugeReady && !player.titanFormActive);
    this.titanGaugeValue.textContent = player.titanFormActive
      ? '變身中'
      : gaugeReady
        ? '按 T 變身！'
        : `${Math.floor(gaugePct)}%`;

    this.titanFormBanner.classList.toggle('hidden', !player.titanFormActive);
    if (player.titanFormActive) {
      this.titanFormTimerEl.textContent = Math.max(0, player.titanFormTimer).toFixed(1);
    }
  }

  // 頭目泰坦血條：沒有 boss 就整條隱藏
  setBoss(boss) {
    if (!boss || !boss.alive) {
      this.bossBar.classList.add('hidden');
      return;
    }
    this.bossBar.classList.remove('hidden');
    this.bossName.textContent = boss.type.label;
    this.bossHpBar.style.width = `${Math.max(0, (boss.napeHp / boss.napeMaxHp) * 100)}%`;
  }

  // 準心三態：一般 / 弱點在攻擊範圍內 / 在範圍內但速度不夠
  setCrosshairState(inReach, fastEnough) {
    this.crosshair.classList.toggle('ready', inReach && fastEnough);
    this.crosshair.classList.toggle('slow', inReach && !fastEnough);
  }

  setScore(score, kills) {
    this.scoreValue.textContent = score;
    this.killValue.textContent = kills;
  }

  toast(text, kind = '', duration = 1600) {
    this.toastEl.textContent = text;
    this.toastEl.className = `show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.className = kind;
    }, duration);
  }

  feed(html, kind = '') {
    const line = document.createElement('div');
    line.className = `feed-line ${kind}`;
    line.innerHTML = html;
    this.feedEl.appendChild(line);
    // 動畫跑完就自己移除，不留 DOM 垃圾
    setTimeout(() => line.remove(), 3400);
    while (this.feedEl.children.length > 6) this.feedEl.firstChild.remove();
  }

  damageFlash() {
    this.vignette.style.opacity = '1';
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.vignette.style.opacity = '0';
    }, 140);
  }
}
