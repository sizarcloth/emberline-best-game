// HUD: all DOM — bars, ammo, score, timer, kill feed, minimap, buy menu,
// banners, toasts and the start/end screens. No game logic here; main.js
// wires the buttons and tells the HUD what happened.
import { WEAPONS, ARMOR_PRICE } from './weapons.js';

const $ = (id) => document.getElementById(id);

export function createHud({ world, player, bots, rounds }) {
  const els = {
    hud: $('hud'),
    healthNum: $('health-num'),
    healthBar: $('health-bar'),
    armorNum: $('armor-num'),
    weaponName: $('weapon-name'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    money: $('money'),
    timer: $('timer'),
    scoreV: $('score-v'),
    scoreJ: $('score-j'),
    roundNum: $('round-num'),
    killfeed: $('killfeed'),
    minimap: $('minimap'),
    banner: $('banner'),
    toast: $('toast'),
    hitmarker: $('hitmarker'),
    vignette: $('damage-vignette'),
    spectateMsg: $('spectate-msg'),
    spectateName: $('spectate-name'),
    reloadMsg: $('reload-msg'),
    buyMenu: $('buy-menu'),
    buyBalance: $('buy-balance'),
    startScreen: $('start-screen'),
    endScreen: $('end-screen'),
    endTitle: $('end-title'),
    endScore: $('end-score'),
    endDetail: $('end-detail'),
  };
  const mm = els.minimap.getContext('2d');
  let vignetteLevel = 0;
  let toastTimer = 0;
  let bannerTimer = 0;
  let hitTimer = 0;
  let lastMinimap = 0;

  function fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function drawMinimap(now) {
    const W = 168, H = 134;
    const px = (x) => ((x + 30) / 60) * W;
    const pz = (z) => ((z + 24) / 48) * H;
    mm.fillStyle = 'rgba(20,14,8,0.9)';
    mm.fillRect(0, 0, W, H);
    mm.fillStyle = '#6b5a44';
    for (const c of world.colliders) {
      // skip the perimeter walls (they are the frame)
      if (c.x0 <= -30 || c.x1 >= 30 || c.z0 <= -24 || c.z1 >= 24) continue;
      mm.fillRect(px(c.x0), pz(c.z0), Math.max(2, px(c.x1) - px(c.x0)), Math.max(2, pz(c.z1) - pz(c.z0)));
    }
    mm.strokeStyle = 'rgba(255,200,130,0.5)';
    mm.strokeRect(0.5, 0.5, W - 1, H - 1);
    // enemies: only briefly after they fire
    for (const bot of bots.list) {
      if (!bot.alive || bot.team !== 'jackals') continue;
      if (now - bot.loadout.lastShotAt < 2.5) {
        mm.fillStyle = '#ff5a4a';
        mm.beginPath();
        mm.arc(px(bot.pos.x), pz(bot.pos.z), 3, 0, Math.PI * 2);
        mm.fill();
      }
    }
    // teammates
    for (const bot of bots.list) {
      if (!bot.alive || bot.team !== 'vanguard') continue;
      mm.fillStyle = '#6fd3ff';
      mm.beginPath();
      mm.arc(px(bot.pos.x), pz(bot.pos.z), 3, 0, Math.PI * 2);
      mm.fill();
    }
    // the player: an arrow pointing where they look
    if (player.alive) {
      mm.save();
      mm.translate(px(player.pos.x), pz(player.pos.z));
      mm.rotate(-player.yaw);
      mm.fillStyle = '#ffffff';
      mm.beginPath();
      mm.moveTo(0, -6);
      mm.lineTo(4.5, 5);
      mm.lineTo(-4.5, 5);
      mm.closePath();
      mm.fill();
      mm.restore();
    }
  }

  function update(now, dt) {
    const { state } = rounds;
    els.healthNum.textContent = String(Math.max(0, Math.ceil(player.hp)));
    els.healthBar.style.width = `${Math.max(0, Math.min(100, player.hp))}%`;
    els.armorNum.textContent = String(Math.ceil(player.armor));
    els.money.textContent = `$${player.money}`;
    els.scoreV.textContent = String(state.score.vanguard);
    els.scoreJ.textContent = String(state.score.jackals);
    els.roundNum.textContent = state.phase === 'matchEnd'
      ? 'MATCH OVER'
      : `ROUND ${state.round} — FIRST TO 5`;
    els.timer.textContent = fmtTime(rounds.timeLeft(now));
    if (now - lastMinimap > 0.25) {
      lastMinimap = now;
      drawMinimap(now);
    }
    if (vignetteLevel > 0) {
      vignetteLevel = Math.max(0, vignetteLevel - dt * 1.6);
      els.vignette.style.opacity = String(vignetteLevel);
    }
  }

  function setAmmo(mag, name) {
    els.ammoMag.textContent = String(mag);
    els.ammoReserve.textContent = '/ ∞';
    els.weaponName.textContent = name.toUpperCase();
  }

  function setReloading(on) {
    els.reloadMsg.classList.toggle('hidden', !on);
  }

  function toast(text) {
    els.toast.textContent = text;
    els.toast.style.opacity = '1';
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { els.toast.style.opacity = '0'; }, 2200);
  }

  function banner(text, sub = '') {
    els.banner.innerHTML = `${text}<small>${sub}</small>`;
    els.banner.style.opacity = '1';
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => { els.banner.style.opacity = '0'; }, 3600);
  }

  function killfeed(killerName, victimName, weaponName, killerTeam) {
    const div = document.createElement('div');
    div.className = 'feed-item';
    const kc = killerTeam === 'vanguard' ? '#6fd3ff' : '#ff9a5c';
    div.innerHTML = `<span style="color:${kc};font-weight:700">${killerName}</span> ▸ ${victimName} <span class="w">[${weaponName}]</span>`;
    els.killfeed.prepend(div);
    while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
    window.setTimeout(() => div.remove(), 6000);
  }

  function hitmarker(kill) {
    els.hitmarker.classList.toggle('kill', !!kill);
    els.hitmarker.style.opacity = '1';
    window.clearTimeout(hitTimer);
    hitTimer = window.setTimeout(() => { els.hitmarker.style.opacity = '0'; }, 130);
  }

  function damageFlash() {
    vignetteLevel = 0.9;
    els.vignette.style.opacity = '0.9';
  }

  function setSpectating(name) {
    if (name) {
      els.spectateName.textContent = name;
      els.spectateMsg.classList.remove('hidden');
    } else {
      els.spectateMsg.classList.add('hidden');
    }
  }

  function refreshBuy() {
    els.buyBalance.textContent = `$${player.money}`;
    for (const item of document.querySelectorAll('.buy-item')) {
      const key = item.dataset.buy;
      const owned = key === 'armor'
        ? player.armor >= 100
        : key === 'pistol'
          ? true
          : !!(player.loadout.primary && player.loadout.primary.key === key);
      const price = key === 'armor' ? ARMOR_PRICE : key === 'pistol' ? 0 : WEAPONS[key].price;
      item.classList.toggle('owned', owned);
      item.classList.toggle('cant', player.money < price || (owned && key !== 'armor'));
    }
  }

  function openBuy() {
    refreshBuy();
    els.buyMenu.classList.add('open');
  }
  function closeBuy() {
    els.buyMenu.classList.remove('open');
  }
  function isBuyOpen() {
    return els.buyMenu.classList.contains('open');
  }

  return {
    els,
    update,
    setAmmo,
    setReloading,
    toast,
    banner,
    killfeed,
    hitmarker,
    damageFlash,
    setSpectating,
    refreshBuy,
    openBuy,
    closeBuy,
    isBuyOpen,
    showHud() { els.hud.classList.remove('hidden'); },
    hideStartScreen() { els.startScreen.classList.add('hidden'); },
    showEndScreen(winner, score) {
      const won = winner === 'vanguard';
      els.endTitle.textContent = won ? 'VICTORY' : 'DEFEAT';
      els.endTitle.style.color = won ? '#8fe388' : '#ff7a6a';
      els.endScore.textContent = `VANGUARD ${score.vanguard} — ${score.jackals} JACKALS`;
      els.endDetail.textContent = won
        ? 'Kiln Yard belongs to the Vanguard.'
        : 'The Jackals take Kiln Yard. Run it back.';
      els.endScreen.classList.remove('hidden');
    },
  };
}
