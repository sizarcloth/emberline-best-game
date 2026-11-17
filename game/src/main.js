// EMBERLINE — entry point. Wires the world, player, bots, rounds, HUD,
// audio and effects into one loop, owns player firing and damage, stages
// the four entry screenshots, and exposes the debug API the playtest uses.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { buildTextures } from './textures.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import {
  WEAPONS, ARMOR_PRICE, ARMOR_POINTS, currentWeapon, giveWeapon, switchSlot,
  startReload, finishReloadIfDue, applyDamage, shoot,
} from './weapons.js';

const params = new URLSearchParams(window.location.search);
const QUALITY = params.get('quality') === 'low' ? 'low' : 'high';
const SHOT = params.get('shot') || null;
const SEED = parseInt(params.get('seed') || '1', 10) || 1;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY === 'high' });
renderer.setPixelRatio(QUALITY === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = QUALITY === 'high';
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 220);
scene.add(camera);

const textures = buildTextures();
const world = buildWorld(scene, textures, QUALITY);
const input = createInput(canvas);
const player = createPlayer(world, camera);
const bots = createBots(scene, world);
const audio = createAudio();
const effects = createEffects(scene, textures, QUALITY);

// Raycast targets: world solids + ground + every bot hitbox.
const raycastTargets = [
  ...world.obstacleMeshes,
  world.groundMesh,
  ...bots.list.flatMap((b) => b.hitMeshes),
];

// ---------- rounds + hud (callbacks close over hud, assigned below) ----------
let hud = null;
const rounds = createRounds({
  player,
  bots,
  callbacks: {
    onPhaseChange(phase) {
      if (phase === 'live') {
        if (hud && hud.isBuyOpen()) hud.closeBuy();
      }
      if (phase === 'freeze' && hud && rounds.state.started) {
        hud.toast('BUY PHASE — press B for equipment');
      }
    },
    onRoundReset(round, first) {
      const keepPlayer = !first && player.alive;
      player.reset(world.spawns.vanguard[2], keepPlayer);
      bots.reset(world.spawns, (bot) => !first && bot.alive);
      bots.buyPhase();
      spectateTarget = null;
      if (hud) {
        hud.setSpectating(null);
        const { def, state } = currentWeapon(player.loadout);
        hud.setAmmo(state.mag, def.name);
        hud.refreshBuy();
      }
    },
    onRoundEnd(winner, reason, score) {
      const won = winner === 'vanguard';
      if (hud) {
        hud.banner(
          won ? 'ROUND WON' : 'ROUND LOST',
          reason === 'time'
            ? `Time expired — Vanguard ${score.vanguard} : ${score.jackals} Jackals`
            : `Vanguard ${score.vanguard} : ${score.jackals} Jackals`,
        );
        if (hud.isBuyOpen()) hud.closeBuy();
      }
      if (won) audio.roundWin(); else audio.roundLose();
    },
    onMatchEnd(winner, score) {
      if (hud) hud.showEndScreen(winner, score);
      input.exitLock();
    },
  },
});
hud = createHud({ world, player, bots, rounds });

// ---------- damage + death ----------
let spectateTarget = null;

function onPlayerDeath() {
  spectateTarget = bots.list.find((b) => b.team === 'vanguard' && b.alive) || null;
  hud.setSpectating(spectateTarget ? spectateTarget.name : null);
  input.exitLock();
}

function onDamage(target, raw, attacker, weaponKey, head, point) {
  if (!target.alive) return;
  const dealt = applyDamage(target, raw);
  if (point) effects.impact(point, 'flesh');
  if (target.isPlayer) {
    hud.damageFlash();
  }
  if (attacker && attacker.isPlayer) {
    hud.hitmarker(false);
    audio.hit();
  }
  if (target.hp > 0) return;
  target.alive = false;
  target.deathAt = performance.now() / 1000;
  rounds.onKill(attacker);
  const weaponName = WEAPONS[weaponKey] ? WEAPONS[weaponKey].short : weaponKey;
  hud.killfeed(
    attacker ? attacker.name : 'World',
    target.name,
    weaponName,
    attacker ? attacker.team : 'vanguard',
  );
  if (attacker && attacker.isPlayer) {
    hud.hitmarker(true);
    audio.kill();
  }
  if (target.isPlayer) onPlayerDeath();
  rounds.checkElimination(performance.now() / 1000);
}

// ---------- player firing ----------
const _origin = new THREE.Vector3();
const _aim = new THREE.Vector3();

function playerTryFire(now) {
  const loadout = player.loadout;
  if (loadout.reloadingUntil > 0) return;
  const { def, state } = currentWeapon(loadout);
  if (now - loadout.lastShotAt < def.fireGap) return;
  if (state.mag <= 0) {
    audio.empty();
    if (startReload(loadout, now)) {
      hud.setReloading(true);
      audio.reload();
    }
    return;
  }
  loadout.lastShotAt = now;
  state.mag--;
  camera.getWorldDirection(_aim);
  player.muzzleWorld(_origin);
  const moving = Math.hypot(player.vel.x, player.vel.z) > 1;
  const spreadMul = (moving ? 1.7 : 1) * (player.onGround ? 1 : 1.8);
  const out = {};
  const hits = shoot({
    origin: _origin, aimDir: _aim, def, targets: raycastTargets,
    spreadMul, out,
  });
  effects.tracer(_origin, out.impact);
  effects.muzzleFlash(_origin);
  audio.shoot(def.sound, 1);
  player.addKick(def.kick);
  for (const hit of hits) {
    onDamage(hit.bot, hit.damage, player, def.key, hit.head, hit.point);
  }
  if (out.impact && hits.length === 0) {
    effects.impact(out.impact, 'spark');
  }
  hud.setAmmo(state.mag, def.name);
  if (state.mag <= 0 && startReload(loadout, now)) {
    hud.setReloading(true);
    audio.reload();
  }
}

function playerReload(now) {
  if (startReload(player.loadout, now)) {
    hud.setReloading(true);
    audio.reload();
  }
}

// ---------- buying ----------
function buyItem(key) {
  if (rounds.state.phase !== 'freeze') {
    hud.toast('Buying is only open during the buy phase');
    audio.denied();
    return;
  }
  if (key === 'armor') {
    if (player.armor >= ARMOR_POINTS) {
      hud.toast('Armor already full');
      audio.denied();
      return;
    }
    if (player.money < ARMOR_PRICE) {
      hud.toast('Not enough money');
      audio.denied();
      return;
    }
    player.money -= ARMOR_PRICE;
    player.armor = ARMOR_POINTS;
  } else {
    const def = WEAPONS[key];
    if (!def) return;
    if (key !== 'pistol' && player.loadout.primary && player.loadout.primary.key === key) {
      hud.toast('Already owned');
      return;
    }
    if (player.money < def.price) {
      hud.toast('Not enough money');
      audio.denied();
      return;
    }
    player.money -= def.price;
    giveWeapon(player.loadout, key);
    player.refreshViewmodel();
    const { def: cur, state } = currentWeapon(player.loadout);
    hud.setAmmo(state.mag, cur.name);
  }
  audio.buy();
  hud.refreshBuy();
}

// ---------- UI wiring ----------
document.getElementById('play-btn').addEventListener('click', () => {
  audio.resume();
  audio.click();
  hud.hideStartScreen();
  hud.showHud();
  input.requestLock();
  rounds.start(performance.now() / 1000);
  const { def, state } = currentWeapon(player.loadout);
  hud.setAmmo(state.mag, def.name);
});
document.getElementById('restart-btn').addEventListener('click', () => {
  window.location.reload();
});
document.getElementById('buy-close').addEventListener('click', () => {
  hud.closeBuy();
  audio.click();
  if (rounds.state.started && rounds.state.phase !== 'matchEnd') input.requestLock();
});
for (const item of document.querySelectorAll('.buy-item')) {
  item.addEventListener('click', () => buyItem(item.dataset.buy));
}
canvas.addEventListener('click', () => {
  if (rounds.state.started && rounds.state.phase !== 'matchEnd'
    && !hud.isBuyOpen() && player.alive && !input.locked) {
    input.requestLock();
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- bot context ----------
const botCtx = {
  get phase() { return rounds.state.phase; },
  player,
  targets: raycastTargets,
  onDamage,
  onReload() {},
  onBotShot(bot, def, muzzlePos, impact) {
    effects.tracer(muzzlePos, impact);
    effects.muzzleFlash(muzzlePos);
    const d = Math.hypot(bot.pos.x - player.pos.x, bot.pos.z - player.pos.z);
    audio.shoot(def.sound, Math.max(0.04, Math.min(0.55, 1 - d / 55)));
    if (impact) effects.impact(impact, 'spark');
  },
};

// ---------- screenshot staging ----------
let shotReady = false;
let framesRendered = 0;
const loadTime = performance.now();

function stageShot() {
  const rng = mulberry32(SEED);
  hud.hideStartScreen();
  hud.showHud();
  if (SHOT === 'start') {
    // lobby view: start screen stays up over the orbiting menu camera
    document.getElementById('start-screen').classList.remove('hidden');
    hud.els.hud.classList.add('hidden');
  } else if (SHOT === 'buy') {
    rounds.start(performance.now() / 1000);
    hud.openBuy();
  } else if (SHOT === 'end') {
    rounds.state.started = true;
    rounds.state.phase = 'matchEnd';
    rounds.state.score.vanguard = 5;
    rounds.state.score.jackals = 2;
    hud.showEndScreen('vanguard', { vanguard: 5, jackals: 2 });
  } else if (SHOT === 'play') {
    rounds.start(performance.now() / 1000);
    rounds.skipFreeze(performance.now() / 1000);
    // stage the player on a vantage looking down mid lane at the kiln
    player.pos.set(2, 0, 13);
    player.yaw = 0.12;
    player.pitch = -0.02;
    // stage bots mid-map, visible in the frame
    const spots = [
      [-6, -2, 'jackals'], [8, -6, 'jackals'], [-2, -10, 'jackals'],
      [12, -2, 'jackals'], [-10, -8, 'jackals'],
      [-5, 6, 'vanguard'], [7, 4, 'vanguard'], [-9, 10, 'vanguard'], [11, 8, 'vanguard'],
    ];
    let si = 0;
    for (const bot of bots.list) {
      const spot = spots[si++ % spots.length];
      bot.pos.set(spot[0] + (rng() - 0.5) * 1.5, 0, spot[1] + (rng() - 0.5) * 1.5);
      bot.yaw = bot.team === 'vanguard' ? 0 : Math.PI;
      bot.mesh.position.copy(bot.pos);
      bot.mesh.rotation.y = bot.yaw;
      bot.waypoint = 2;
    }
    const { def, state } = currentWeapon(player.loadout);
    giveWeapon(player.loadout, 'rifle');
    hud.setAmmo(player.loadout.primary.mag, 'AR-77 Longbow');
    player.refreshViewmodel();
    player.money = 5400;
    player.armor = 100;
    hud.killfeed('Vex', 'Rook', 'AR-77', 'jackals');
    hud.killfeed('You', 'Cinder', 'AR-77', 'vanguard');
  }
}

// ---------- main loop ----------
let last = performance.now() / 1000;
let menuAngle = 0.6;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, Math.max(0.0001, now - last));
  last = now;

  const { state } = rounds;

  if (!state.started || state.phase === 'lobby') {
    // menu camera: slow orbit over Kiln Yard
    menuAngle += dt * 0.045;
    camera.position.set(Math.sin(menuAngle) * 27, 13.5, Math.cos(menuAngle) * 27);
    camera.lookAt(0, 1.2, 0);
  } else if (!player.alive && state.phase === 'live') {
    // spectate a living teammate
    if (!spectateTarget || !spectateTarget.alive) {
      spectateTarget = bots.list.find((b) => b.team === 'vanguard' && b.alive) || null;
      hud.setSpectating(spectateTarget ? spectateTarget.name : null);
    }
    if (spectateTarget) {
      camera.position.set(
        spectateTarget.pos.x,
        spectateTarget.pos.y + 1.62,
        spectateTarget.pos.z,
      );
      camera.rotation.order = 'YXZ';
      camera.rotation.y = spectateTarget.yaw;
      camera.rotation.x = 0;
      camera.rotation.z = 0;
    }
  } else if (state.phase !== 'matchEnd') {
    const canMove = state.phase === 'live';
    player.update(dt, input, canMove);
  }

  if (state.started && state.phase !== 'lobby') {
    rounds.update(now);

    // player input: buy / reload / switch (only while alive)
    if (player.alive) {
      if (input.pressed('KeyB')) {
        if (hud.isBuyOpen()) {
          hud.closeBuy();
          input.requestLock();
        } else if (state.phase === 'freeze') {
          hud.openBuy();
          input.exitLock();
        } else {
          hud.toast('Buying is only open during the buy phase');
        }
      }
      if (input.pressed('KeyR') && state.phase === 'live') playerReload(now);
      if (input.pressed('Digit1')) {
        if (switchSlot(player.loadout, 'secondary')) {
          player.refreshViewmodel();
          const { def, state: st } = currentWeapon(player.loadout);
          hud.setAmmo(st.mag, def.name);
          audio.click();
        }
      }
      if (input.pressed('Digit2')) {
        if (switchSlot(player.loadout, 'primary')) {
          player.refreshViewmodel();
          const { def, state: st } = currentWeapon(player.loadout);
          hud.setAmmo(st.mag, def.name);
          audio.click();
        }
      }
      // firing
      if (state.phase === 'live' && input.locked && !hud.isBuyOpen()) {
        if (finishReloadIfDue(player.loadout, now)) {
          hud.setReloading(false);
          const { def, state: st } = currentWeapon(player.loadout);
          hud.setAmmo(st.mag, def.name);
        }
        const { def } = currentWeapon(player.loadout);
        if (def.auto) {
          if (input.fireHeld) playerTryFire(now);
          input.clearFirePress();
        } else if (input.consumeFirePress()) {
          playerTryFire(now);
        }
      }
    }

    bots.update(dt, now, botCtx);
    hud.update(now, dt);
  }

  effects.update(dt);
  input.endFrame();
  renderer.render(scene, camera);

  framesRendered++;
  if (SHOT && !shotReady && framesRendered >= 2 && performance.now() - loadTime > 600) {
    shotReady = true;
    window.__shotReady = true;
  }
}

if (SHOT) stageShot();
animate();

// ---------- debug + test API ----------
const botViews = bots.list.map((b) => ({
  get x() { return b.pos.x; },
  get z() { return b.pos.z; },
  get alive() { return b.alive; },
  team: b.team,
  name: b.name,
}));
const playerView = {
  get x() { return player.pos.x; },
  get z() { return player.pos.z; },
  get yaw() { return player.yaw; },
};
window.__emberline = {
  get state() {
    rounds.state.money = player.money;
    return rounds.state;
  },
  player: playerView,
  bots: botViews,
  debugSkipFreeze() {
    rounds.skipFreeze(performance.now() / 1000);
  },
  debugKillTeam(team) {
    const want = team === 'jackal' || team === 'jackals' ? 'jackals' : 'vanguard';
    for (const bot of bots.list) {
      if (bot.team === want && bot.alive) {
        bot.hp = 0;
        bot.alive = false;
        bot.deathAt = performance.now() / 1000;
      }
    }
    if (want === 'vanguard' && player.alive) {
      player.hp = 0;
      player.alive = false;
      onPlayerDeath();
    }
    rounds.checkElimination(performance.now() / 1000);
  },
};
