// Arsenal: five weapons, one economy. Hitscan shooting shared by the player
// and the bots — the caller owns timing, ammo and recoil, this module owns
// the ballistics: spread, falloff, headshots, armor.
import * as THREE from 'three';

export const WEAPONS = {
  pistol: {
    key: 'pistol', name: 'P9 Sidearm', short: 'P9', price: 0,
    damage: 34, headMul: 2.0, pellets: 1,
    fireGap: 0.19, mag: 12, reload: 1.4, auto: false,
    spread: 0.011, range: 60, kick: 0.011, sound: 'pistol',
  },
  smg: {
    key: 'smg', name: 'VK-9 Hornet', short: 'VK-9', price: 1200,
    damage: 22, headMul: 1.8, pellets: 1,
    fireGap: 0.095, mag: 30, reload: 2.0, auto: true,
    spread: 0.02, range: 45, kick: 0.007, sound: 'smg',
  },
  rifle: {
    key: 'rifle', name: 'AR-77 Longbow', short: 'AR-77', price: 2700,
    damage: 30, headMul: 2.0, pellets: 1,
    fireGap: 0.11, mag: 30, reload: 2.2, auto: true,
    spread: 0.013, range: 70, kick: 0.01, sound: 'rifle',
  },
  shotgun: {
    key: 'shotgun', name: 'M870 Breacher', short: 'M870', price: 1800,
    damage: 9, headMul: 1.5, pellets: 8,
    fireGap: 0.8, mag: 6, reload: 2.6, auto: false,
    spread: 0.055, range: 25, kick: 0.03, sound: 'shotgun',
  },
  dmr: {
    key: 'dmr', name: 'DMR Needle', short: 'DMR', price: 4500,
    damage: 80, headMul: 2.2, pellets: 1,
    fireGap: 0.4, mag: 10, reload: 2.4, auto: false,
    spread: 0.004, range: 90, kick: 0.02, sound: 'dmr',
  },
};

export const ARMOR_PRICE = 650;
export const ARMOR_POINTS = 100;

export function newWeaponState(key) {
  return { key, mag: WEAPONS[key].mag };
}

export function newLoadout() {
  return {
    secondary: newWeaponState('pistol'),
    primary: null,
    current: 'secondary',
    lastShotAt: -10,
    reloadingUntil: 0,
    reloadingSlot: null,
  };
}

export function currentSlot(loadout) {
  return loadout.current === 'primary' && loadout.primary ? 'primary' : 'secondary';
}

export function currentWeapon(loadout) {
  const slot = currentSlot(loadout);
  const state = loadout[slot];
  return { def: WEAPONS[state.key], state, slot };
}

export function giveWeapon(loadout, key) {
  if (key === 'pistol') {
    loadout.secondary = newWeaponState('pistol');
    return;
  }
  loadout.primary = newWeaponState(key);
  loadout.current = 'primary';
}

export function switchSlot(loadout, slot) {
  if (slot === 'primary' && !loadout.primary) return false;
  if (loadout.reloadingUntil > 0) return false;
  loadout.current = slot;
  return true;
}

export function startReload(loadout, now) {
  if (loadout.reloadingUntil > 0) return false;
  const { def, state } = currentWeapon(loadout);
  if (state.mag >= def.mag) return false;
  loadout.reloadingUntil = now + def.reload;
  loadout.reloadingSlot = currentSlot(loadout);
  return true;
}

export function finishReloadIfDue(loadout, now) {
  if (loadout.reloadingUntil > 0 && now >= loadout.reloadingUntil) {
    const slot = loadout.reloadingSlot;
    const state = loadout[slot];
    if (state) state.mag = WEAPONS[state.key].mag;
    loadout.reloadingUntil = 0;
    loadout.reloadingSlot = null;
    return true;
  }
  return false;
}

// Apply armor: it soaks half the damage until it runs out. Returns the
// health damage actually dealt, and mutates the target's armor.
export function applyDamage(target, raw) {
  let remaining = raw;
  if (target.armor > 0) {
    const soaked = Math.min(target.armor, raw * 0.5);
    target.armor -= soaked;
    remaining = raw - soaked;
  }
  target.hp -= remaining;
  return remaining;
}

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _spread = new THREE.Vector3();

// One trigger pull. `origin` is the muzzle, `aimDir` the intended direction
// (already normalized). `targets` is the flat list of raycastable meshes
// (world + bot hitboxes). Returns hits: [{ bot, damage, head, point, dist }]
// plus the furthest impact point for tracers, via out.impact.
export function shoot({ origin, aimDir, def, targets, maxDist = 120, spreadMul = 1, out }) {
  const hits = [];
  let impact = null;
  for (let p = 0; p < def.pellets; p++) {
    _dir.copy(aimDir);
    if (def.spread > 0) {
      _spread.set(
        (Math.random() - 0.5) * 2 * def.spread * spreadMul,
        (Math.random() - 0.5) * 2 * def.spread * spreadMul,
        0,
      );
      // spread in camera space: perturb x/y, keep z forward
      _dir.x += _spread.x;
      _dir.y += _spread.y;
      _dir.normalize();
    }
    _ray.set(origin, _dir);
    _ray.far = maxDist;
    const found = _ray.intersectObjects(targets, false);
    if (found.length === 0) {
      if (!impact) {
        impact = origin.clone().addScaledVector(_dir, maxDist);
      }
      continue;
    }
    const hit = found[0];
    const point = hit.point;
    if (!impact) impact = point.clone();
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const dist = hit.distance;
      const half = def.range * 0.5;
      const falloff = dist <= half ? 1 : Math.max(0.5, 1 - ((dist - half) / def.range));
      const head = hit.object.userData.part === 'head';
      const damage = def.damage * falloff * (head ? def.headMul : 1);
      hits.push({ bot, damage, head, point: point.clone(), dist });
    }
  }
  if (out) out.impact = impact;
  return hits;
}
