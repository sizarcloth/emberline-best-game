// Bots: 9 AI teammates and opponents. Each follows a lane toward the enemy
// spawn, stops to fight what it can see, buys gear between rounds, and dies
// like everything else. Perception is a staggered line-of-sight check;
// combat is aimed bursts with distance-based error.
import * as THREE from 'three';
import { TEAM_COLORS } from './palette.js';
import { WEAPONS, newLoadout, currentWeapon, giveWeapon, startReload, finishReloadIfDue, applyDamage, shoot } from './weapons.js';

const BOT_NAMES = {
  vanguard: ['Rook', 'Sable', 'Indra', 'Kestrel'],
  jackals: ['Vex', 'Cinder', 'Hound', 'Marrow', 'Ash'],
};
const BOT_SPEED = 3.6;
const EYE = 1.55;
const SIGHT_RANGE = 48;

function buildBotMesh(team) {
  const colors = TEAM_COLORS[team];
  const group = new THREE.Group();
  const matBody = new THREE.MeshLambertMaterial({ color: colors.main });
  const matDark = new THREE.MeshLambertMaterial({ color: colors.dark });
  const matSkin = new THREE.MeshLambertMaterial({ color: 0xc9a07a });
  const matGun = new THREE.MeshLambertMaterial({ color: 0x232326 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.32), matBody);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), matSkin);
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.36), matDark);
  helmet.position.y = 1.78;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.24), matDark);
  legL.position.set(-0.15, 0.34, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.16), matBody);
  armL.position.set(-0.36, 1.1, 0.1);
  armL.rotation.x = -0.7;
  const armR = armL.clone();
  armR.position.x = 0.36;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.62), matGun);
  gun.position.set(0.18, 1.28, -0.32);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.02), matBody);
  visor.position.set(0, 1.64, -0.17);
  group.add(torso, head, helmet, legL, legR, armL, armR, gun, visor);
  return { group, torso, head, gun };
}

export function createBots(scene, world) {
  const bots = [];
  const lanes = ['west', 'mid', 'east'];

  function makeBot(team, name, index) {
    const { group, torso, head, gun } = buildBotMesh(team);
    scene.add(group);
    const bot = {
      team,
      name,
      index,
      isPlayer: false,
      pos: new THREE.Vector3(),
      yaw: 0,
      hp: 100,
      armor: 0,
      money: 800,
      alive: true,
      loadout: newLoadout(),
      lane: lanes[index % 3],
      waypoint: 0,
      target: null,
      lastSeenAt: -10,
      reactionUntil: 0,
      nextShotAt: 0,
      burstLeft: 0,
      burstPauseUntil: 0,
      strafeDir: 1,
      strafeUntil: 0,
      dodgeUntil: 0,
      dodgeDir: 1,
      lastProgress: new THREE.Vector3(),
      stuckSince: 0,
      senseAt: Math.random() * 0.15,
      deathAt: 0,
      fallAmount: 0,
      mesh: group,
      hitMeshes: [torso, head],
      gun,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'body';
    head.userData.bot = bot;
    head.userData.part = 'head';
    return bot;
  }

  BOT_NAMES.vanguard.forEach((n, i) => bots.push(makeBot('vanguard', n, i)));
  BOT_NAMES.jackals.forEach((n, i) => bots.push(makeBot('jackals', n, i)));

  const _eye = new THREE.Vector3();
  const _chest = new THREE.Vector3();
  const _aim = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _move = new THREE.Vector3();

  function waypointsFor(bot) {
    const lane = world.lanes[bot.lane];
    if (bot.team === 'vanguard') return lane;
    return lane.map(([x, z]) => [x, -z]).reverse();
  }

  // Spawn slots: the player takes Vanguard slot 2 (middle, x=0); bots take
  // the rest. Jackals use all five of their slots.
  const VANGUARD_BOT_SLOTS = [0, 1, 3, 4];

  function reset(spawns, keepLoadoutFor) {
    let vi = 0, ji = 0;
    for (const bot of bots) {
      const s = bot.team === 'vanguard'
        ? spawns.vanguard[VANGUARD_BOT_SLOTS[vi++ % VANGUARD_BOT_SLOTS.length]]
        : spawns.jackals[ji++ % spawns.jackals.length];
      bot.pos.set(s.x, 0, s.z);
      bot.yaw = s.yaw;
      bot.hp = 100;
      bot.alive = true;
      bot.target = null;
      bot.waypoint = 0;
      bot.burstLeft = 0;
      bot.fallAmount = 0;
      bot.mesh.visible = true;
      bot.mesh.rotation.set(0, bot.yaw, 0);
      bot.mesh.position.copy(bot.pos);
      bot.lastProgress.copy(bot.pos);
      bot.stuckSince = 0;
      if (!keepLoadoutFor || !keepLoadoutFor(bot)) {
        bot.armor = 0;
        bot.loadout = newLoadout();
      }
    }
  }

  function buyPhase() {
    for (const bot of bots) {
      if (!bot.alive) continue;
      // armor first, half the time
      if (bot.money >= 650 && Math.random() < 0.55) {
        bot.money -= 650;
        bot.armor = 100;
      }
      const options = ['smg', 'rifle', 'shotgun', 'dmr']
        .filter((k) => WEAPONS[k].price <= bot.money);
      if (options.length > 0 && Math.random() < 0.8) {
        const pick = options[(Math.random() * options.length) | 0];
        bot.money -= WEAPONS[pick].price;
        giveWeapon(bot.loadout, pick);
      }
    }
  }

  function eyeOf(bot, out) {
    out.set(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
    return out;
  }
  function chestOf(target, out) {
    if (target.isPlayer) {
      out.set(target.pos.x, target.pos.y + 1.3, target.pos.z);
    } else {
      out.set(target.pos.x, target.pos.y + 1.15, target.pos.z);
    }
    return out;
  }

  function sense(bot, now, ctx) {
    let best = null, bestDist = SIGHT_RANGE;
    const candidates = ctx.player.alive && ctx.player.team !== bot.team
      ? [ctx.player, ...bots] : bots;
    eyeOf(bot, _eye);
    for (const other of candidates) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      const d = Math.hypot(other.pos.x - bot.pos.x, other.pos.z - bot.pos.z);
      if (d >= bestDist) continue;
      chestOf(other, _chest);
      if (world.losBlocked(_eye, _chest)) continue;
      best = other;
      bestDist = d;
    }
    if (best) {
      if (bot.target !== best) {
        bot.reactionUntil = now + 0.35 + Math.random() * 0.3;
      }
      bot.target = best;
      bot.lastSeenAt = now;
    } else if (now - bot.lastSeenAt > 1.2) {
      bot.target = null;
    }
  }

  function botShoot(bot, now, ctx) {
    const { def, state } = currentWeapon(bot.loadout);
    if (state.mag <= 0) {
      if (startReload(bot.loadout, now)) ctx.onReload(bot);
      return;
    }
    if (now - bot.loadout.lastShotAt < def.fireGap) return;
    bot.loadout.lastShotAt = now;
    state.mag--;

    const target = bot.target;
    chestOf(target, _aim);
    const dist = Math.hypot(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z);
    const targetSpeed = target.isPlayer
      ? Math.hypot(target.vel.x, target.vel.z)
      : 3;
    const err = 0.3 + dist * 0.014 + targetSpeed * 0.12;
    _aim.x += (Math.random() - 0.5) * 2 * err;
    _aim.y += (Math.random() - 0.5) * 2 * err * 0.7;
    _aim.z += (Math.random() - 0.5) * 2 * err;
    eyeOf(bot, _eye);
    _dir.subVectors(_aim, _eye).normalize();
    const out = {};
    const hits = shoot({
      origin: _eye, aimDir: _dir, def, targets: ctx.targets,
      spreadMul: 1.4, out,
    });
    ctx.onBotShot(bot, def, _eye.clone(), out.impact);
    for (const hit of hits) {
      ctx.onDamage(hit.bot, hit.damage, bot, def.key, hit.head);
    }
  }

  function update(dt, now, ctx) {
    for (const bot of bots) {
      if (!bot.alive) {
        // fall over, then lie still
        if (bot.fallAmount < 1) {
          bot.fallAmount = Math.min(1, bot.fallAmount + dt * 3);
          bot.mesh.rotation.x = -bot.fallAmount * Math.PI * 0.5;
          bot.mesh.position.y = bot.pos.y + bot.fallAmount * 0.25;
        }
        continue;
      }
      finishReloadIfDue(bot.loadout, now);
      if (ctx.phase !== 'live') {
        bot.mesh.position.copy(bot.pos);
        bot.mesh.rotation.y = bot.yaw;
        continue;
      }

      // perception, staggered
      if (now >= bot.senseAt) {
        bot.senseAt = now + 0.15;
        sense(bot, now, ctx);
      }

      const hasTarget = bot.target && bot.target.alive && now - bot.lastSeenAt < 1.2;
      _move.set(0, 0, 0);

      if (hasTarget) {
        // face the target
        const wantYaw = Math.atan2(
          -(bot.target.pos.x - bot.pos.x),
          -(bot.target.pos.z - bot.pos.z),
        );
        let dy = wantYaw - bot.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        bot.yaw += dy * Math.min(1, dt * 10);
        // strafe in combat
        if (now > bot.strafeUntil) {
          bot.strafeUntil = now + 0.7 + Math.random() * 0.9;
          bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        }
        _move.set(Math.cos(bot.yaw) * bot.strafeDir, 0, -Math.sin(bot.yaw) * bot.strafeDir);
        _move.multiplyScalar(0.55);
        // fire in bursts once reacted
        if (now > bot.reactionUntil && now > bot.burstPauseUntil) {
          if (bot.burstLeft <= 0) {
            bot.burstLeft = 3 + ((Math.random() * 3) | 0);
          }
          botShoot(bot, now, ctx);
          bot.burstLeft--;
          if (bot.burstLeft <= 0) {
            bot.burstPauseUntil = now + 0.35 + Math.random() * 0.5;
          }
        }
      } else {
        // advance along the lane
        const wps = waypointsFor(bot);
        const wp = wps[Math.min(bot.waypoint, wps.length - 1)];
        const dx = wp[0] - bot.pos.x, dz = wp[1] - bot.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.4) {
          if (bot.waypoint < wps.length - 1) bot.waypoint++;
          else {
            // reached the far end: pick another lane and walk back
            bot.lane = ['west', 'mid', 'east'][(Math.random() * 3) | 0];
            bot.waypoint = 0;
          }
        } else {
          _move.set(dx / dist, 0, dz / dist);
          const wantYaw = Math.atan2(-_move.x, -_move.z);
          let dy = wantYaw - bot.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          bot.yaw += dy * Math.min(1, dt * 8);
        }
        // stuck detection: sidestep for a beat
        if (now > bot.dodgeUntil) {
          const moved = Math.hypot(bot.pos.x - bot.lastProgress.x, bot.pos.z - bot.lastProgress.z);
          if (moved < 0.25) {
            if (bot.stuckSince === 0) bot.stuckSince = now;
            else if (now - bot.stuckSince > 1.4) {
              bot.dodgeUntil = now + 0.9;
              bot.dodgeDir = Math.random() < 0.5 ? -1 : 1;
              bot.stuckSince = 0;
            }
          } else {
            bot.stuckSince = 0;
          }
          bot.lastProgress.copy(bot.pos);
        }
        if (now < bot.dodgeUntil) {
          _move.set(Math.cos(bot.yaw) * bot.dodgeDir, 0, -Math.sin(bot.yaw) * bot.dodgeDir);
        }
      }

      // separation from other bots
      for (const other of bots) {
        if (other === bot || !other.alive) continue;
        const dx = bot.pos.x - other.pos.x, dz = bot.pos.z - other.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          _move.x += (dx / d) * 0.8;
          _move.z += (dz / d) * 0.8;
        }
      }

      if (_move.lengthSq() > 0) {
        _move.normalize();
        const speed = hasTarget ? BOT_SPEED * 0.55 : BOT_SPEED;
        bot.pos.x += _move.x * speed * dt;
        bot.pos.z += _move.z * speed * dt;
        world.collide(bot.pos, 0.4);
      }

      // animate: walk bob + mesh sync
      const moving = _move.lengthSq() > 0;
      bot.mesh.position.copy(bot.pos);
      bot.mesh.position.y = bot.pos.y + (moving ? Math.abs(Math.sin(now * 9 + bot.index)) * 0.05 : 0);
      bot.mesh.rotation.y = bot.yaw;
    }
  }

  function aliveCount(team) {
    return bots.filter((b) => b.team === team && b.alive).length;
  }

  return {
    list: bots,
    reset,
    buyPhase,
    update,
    aliveCount,
    eyeOf,
  };
}

export { SIGHT_RANGE };
