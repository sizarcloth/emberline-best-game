// The human player: first-person controller, viewmodel gun, health/armor.
// Firing is orchestrated by main.js (it owns the raycast targets); this
// module owns movement, look, and the gun the player sees.
import * as THREE from 'three';
import { newLoadout, currentWeapon, WEAPONS } from './weapons.js';

const EYE_HEIGHT = 1.62;
const RADIUS = 0.4;
const WALK_SPEED = 4.6;
const SPRINT_SPEED = 6.4;
const JUMP_SPEED = 5.4;
const GRAVITY = 14.5;
const LOOK_SENS = 0.0022;

export function createPlayer(world, camera) {
  const player = {
    team: 'vanguard',
    name: 'You',
    isPlayer: true,
    pos: new THREE.Vector3(0, 0, 20),
    vel: new THREE.Vector3(),
    velY: 0,
    onGround: true,
    yaw: 0,
    pitch: 0,
    hp: 100,
    armor: 0,
    money: 800,
    alive: true,
    loadout: newLoadout(),
    walkCycle: 0,
    kick: 0,
    viewmodel: null,
    muzzle: new THREE.Object3D(),
  };

  // --- viewmodel: a simple gun attached to the camera ---
  const gun = new THREE.Group();
  const matBody = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });
  const matAccent = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.42), matBody);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), matAccent);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.32);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), matBody);
  grip.position.set(0, -0.12, 0.12);
  grip.rotation.x = 0.25;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), matAccent);
  sight.position.set(0, 0.09, -0.1);
  gun.add(body, barrel, grip, sight);
  gun.position.set(0.27, -0.24, -0.5);
  player.muzzle.position.set(0, 0.03, -0.5);
  gun.add(player.muzzle);
  camera.add(gun);
  player.viewmodel = gun;
  player.viewmodelParts = { body, barrel, grip };

  const GUN_SHAPES = {
    pistol: { bodyZ: 0.3, barrelZ: 0.16, scale: 0.9 },
    smg: { bodyZ: 0.42, barrelZ: 0.28, scale: 1.0 },
    rifle: { bodyZ: 0.55, barrelZ: 0.42, scale: 1.05 },
    shotgun: { bodyZ: 0.55, barrelZ: 0.4, scale: 1.15 },
    dmr: { bodyZ: 0.62, barrelZ: 0.55, scale: 1.1 },
  };

  function refreshViewmodel() {
    const { def } = currentWeapon(player.loadout);
    const shape = GUN_SHAPES[def.key] || GUN_SHAPES.pistol;
    player.viewmodelParts.body.scale.set(1, 1, shape.bodyZ / 0.42);
    player.viewmodelParts.barrel.scale.set(1, shape.barrelZ / 0.3, 1);
    player.viewmodelParts.barrel.position.z = -(0.18 + shape.barrelZ / 2);
    player.viewmodel.scale.setScalar(shape.scale);
  }
  refreshViewmodel();

  const wish = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  function reset(spawn, keepLoadout) {
    player.pos.set(spawn.x, 0, spawn.z);
    player.vel.set(0, 0, 0);
    player.velY = 0;
    player.yaw = spawn.yaw;
    player.pitch = 0;
    player.hp = 100;
    player.alive = true;
    player.kick = 0;
    if (!keepLoadout) {
      player.armor = 0;
      player.loadout = newLoadout();
      refreshViewmodel();
    }
  }

  function update(dt, input, canMove) {
    // look
    const look = input.consumeLook();
    player.yaw -= look.dx * LOOK_SENS;
    player.pitch -= look.dy * LOOK_SENS;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));

    // move
    wish.set(0, 0, 0);
    if (canMove && player.alive) {
      forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      if (input.isDown('KeyW')) wish.add(forward);
      if (input.isDown('KeyS')) wish.sub(forward);
      if (input.isDown('KeyD')) wish.add(right);
      if (input.isDown('KeyA')) wish.sub(right);
      if (wish.lengthSq() > 0) wish.normalize();
      if (input.isDown('Space') && player.onGround) {
        player.velY = JUMP_SPEED;
        player.onGround = false;
      }
    }
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    const accel = player.onGround ? 14 : 5;
    player.vel.x += (wish.x * speed - player.vel.x) * Math.min(1, accel * dt);
    player.vel.z += (wish.z * speed - player.vel.z) * Math.min(1, accel * dt);
    player.pos.x += player.vel.x * dt;
    player.pos.z += player.vel.z * dt;
    world.collide(player.pos, RADIUS);

    // vertical
    player.velY -= GRAVITY * dt;
    player.pos.y += player.velY * dt;
    if (player.pos.y <= 0) {
      player.pos.y = 0;
      player.velY = 0;
      player.onGround = true;
    }

    // camera
    const moving = Math.hypot(player.vel.x, player.vel.z);
    player.walkCycle += moving * dt * 1.6;
    const bob = moving > 0.5 && player.onGround ? Math.sin(player.walkCycle * 2) * 0.022 : 0;
    player.kick = Math.max(0, player.kick - dt * 0.09);
    camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT + bob, player.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch + player.kick;
    camera.rotation.z = 0;

    // viewmodel sway + recoil
    gun.position.y = -0.24 + Math.sin(player.walkCycle * 2) * 0.006 * Math.min(1, moving / 4);
    gun.position.z = -0.5 + player.kick * 1.4;
    gun.rotation.x = player.kick * 1.2;
  }

  function eyePosition(out) {
    out.set(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);
    return out;
  }

  function muzzleWorld(out) {
    return player.muzzle.getWorldPosition(out);
  }

  function addKick(amount) {
    player.kick = Math.min(0.06, player.kick + amount);
  }

  player.reset = reset;
  player.update = update;
  player.eyePosition = eyePosition;
  player.muzzleWorld = muzzleWorld;
  player.addKick = addKick;
  player.refreshViewmodel = refreshViewmodel;
  return player;
}

export { EYE_HEIGHT };
