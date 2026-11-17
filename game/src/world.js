// Kiln Yard — a desert brickworks, 60 x 48 metres. Two spawns, three lanes,
// brick halls, a central kiln, crates and low walls. Everything static:
// one build, then only queries (collision + line of sight).
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOUNDS = { minX: -29, maxX: 29, minZ: -23, maxZ: 23 };

// AABBs: [x0, z0, x1, z1] — movement colliders (full height).
const COLLIDERS = [
  // perimeter walls
  [-30, -24, 30, -23], [-30, 23, 30, 24], [-30, -24, -29, 24], [29, -24, 30, 24],
  // brick halls
  [-18, 5, -10, 11], [10, -11, 18, -5], [11, 5.5, 17, 10.5], [-17, -10.5, -11, -5.5],
  // central kiln + chimney (approximated as boxes)
  [-3, -3, 3, 3], [-5.6, -3.6, -3.4, -1.4],
  // low walls
  [-12, -0.5, -8, 0.5], [8, -0.5, 12, 0.5], [-2, 11.5, 2, 12.5], [-2, -12.5, 2, -11.5],
  // crates (1.4 m boxes)
  [-6.7, 13.3, -5.3, 14.7], [-4.7, 12.3, -3.3, 13.7],
  [5.3, -14.7, 6.7, -13.3], [3.3, -13.7, 4.7, -12.3],
  [-24.7, 3.3, -23.3, 4.7], [-23.7, -2.7, -22.3, -1.3],
  [23.3, -4.7, 24.7, -3.3], [22.3, 1.3, 23.7, 2.7],
  [-7.7, -3.7, -6.3, -2.3], [6.3, 2.3, 7.7, 3.7],
  [-8.7, -8.7, -7.3, -7.3], [7.3, 7.3, 8.7, 8.7],
  [-7.7, 17.3, -6.3, 18.7], [6.3, 17.3, 7.7, 18.7],
  [-7.7, -18.7, -6.3, -17.3], [6.3, -18.7, 7.7, -17.3],
  // barrel clusters
  [-9.5, 12.5, -8.6, 13.4], [-8.7, 13.1, -7.8, 14.0],
  [8.6, -13.4, 9.5, -12.5], [7.8, -14.0, 8.7, -13.1],
  [18.5, 12.5, 19.4, 13.4], [-19.4, -13.4, -18.5, -12.5],
];

// Lane waypoints, Vanguard direction (south spawn -> north). Jackals mirror z.
const LANES = {
  west: [[-21, 16], [-21, 6], [-19, -2], [-19, -10], [-17, -18]],
  mid: [[5, 14], [5, 6], [5, -4], [5, -12], [3, -18]],
  east: [[21, 16], [21, 6], [19, -2], [19, -10], [17, -18]],
};

function spawnRow(z, yaw) {
  return [-6, -3, 0, 3, 6].map((x) => ({ x, z, yaw }));
}

export function buildWorld(scene, textures, quality) {
  const obstacleMeshes = [];
  const group = new THREE.Group();
  scene.add(group);

  const matSand = new THREE.MeshLambertMaterial({ map: textures.sand });
  const matBrick = new THREE.MeshLambertMaterial({ map: textures.brick });
  const matConcrete = new THREE.MeshLambertMaterial({ map: textures.concrete });
  const matWood = new THREE.MeshLambertMaterial({ map: textures.wood });
  const matMetal = new THREE.MeshLambertMaterial({ map: textures.metal });
  const matKiln = new THREE.MeshLambertMaterial({ color: PALETTE.brickDark });
  const matKilnTop = new THREE.MeshLambertMaterial({ color: PALETTE.kilnInner });

  function box(w, h, d, mat, x, y, z, obstacle = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (quality === 'high') { m.castShadow = true; m.receiveShadow = true; }
    group.add(m);
    if (obstacle) obstacleMeshes.push(m);
    return m;
  }
  function cylinder(rTop, rBottom, h, mat, x, y, z, segments = 18, obstacle = true) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat);
    m.position.set(x, y, z);
    if (quality === 'high') { m.castShadow = true; m.receiveShadow = true; }
    group.add(m);
    if (obstacle) obstacleMeshes.push(m);
    return m;
  }

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 48), matSand);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  // concrete apron at mid
  const apron = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 12), matConcrete);
  apron.position.set(0, 0.05, 0);
  apron.receiveShadow = true;
  group.add(apron);

  // perimeter walls (brick, 4 m)
  box(61, 4, 1, matBrick, 0, 2, -23.5);
  box(61, 4, 1, matBrick, 0, 2, 23.5);
  box(1, 4, 49, matBrick, -29.5, 2, 0);
  box(1, 4, 49, matBrick, 29.5, 2, 0);
  // wall caps (concrete trim)
  box(61, 0.35, 1.3, matConcrete, 0, 4.1, -23.5, false);
  box(61, 0.35, 1.3, matConcrete, 0, 4.1, 23.5, false);

  // brick halls with flat concrete roofs + roof chimneys
  function hall(x0, z0, x1, z1, h) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    box(x1 - x0, h, z1 - z0, matBrick, cx, h / 2, cz);
    box(x1 - x0 + 0.6, 0.3, z1 - z0 + 0.6, matConcrete, cx, h + 0.15, cz, false);
    cylinder(0.9, 1.1, 4, matKiln, cx - 2, h + 2, cz - 1, 12, false);
    cylinder(0.75, 0.75, 0.4, matKilnTop, cx - 2, h + 4, cz - 1, 12, false);
  }
  hall(-18, 5, -10, 11, 5);
  hall(10, -11, 18, -5, 5);
  hall(11, 5.5, 17, 10.5, 4.5);
  hall(-17, -10.5, -11, -5.5, 4.5);

  // central kiln: squat brick cylinder + tall chimney + iron banding
  cylinder(3, 3.3, 6.5, matBrick, 0, 3.25, 0, 24);
  cylinder(3.15, 3.15, 0.5, matMetal, 0, 5.6, 0, 24, false);
  cylinder(2.6, 2.6, 0.4, matKilnTop, 0, 6.6, 0, 24, false);
  cylinder(1.1, 1.35, 11, matKiln, -4.5, 5.5, -2.5, 14);
  cylinder(0.95, 0.95, 0.4, matKilnTop, -4.5, 11, -2.5, 14, false);

  // low brick walls
  box(4, 1.2, 1, matBrick, -10, 0.6, 0);
  box(4, 1.2, 1, matBrick, 10, 0.6, 0);
  box(4, 1.2, 1, matBrick, 0, 0.6, 12);
  box(4, 1.2, 1, matBrick, 0, 0.6, -12);

  // crates (wood), one stack of two each side
  function crate(x, z, y = 0.7) {
    box(1.4, 1.4, 1.4, matWood, x, y, z);
  }
  crate(-6, 14); crate(-4, 13); crate(-4, 13, 2.1);
  crate(6, -14); crate(4, -13); crate(4, -13, 2.1);
  crate(-24, 4); crate(-23, -2); crate(24, -4); crate(23, 2);
  crate(-7, -3); crate(7, 3); crate(-8, -8); crate(8, 8);
  crate(-7, 18); crate(7, 18); crate(-7, -18); crate(7, -18);

  // rusted barrels
  function barrel(x, z) {
    cylinder(0.45, 0.45, 1.1, matMetal, x, 0.55, z, 12);
  }
  barrel(-9, 13); barrel(-8.2, 13.6); barrel(9, -13); barrel(8.2, -13.6);
  barrel(19, 13); barrel(-19, -13);

  // scattered sand mounds (visual only)
  for (const [x, z, r] of [[-26, 18, 2.2], [26, -18, 2.4], [-25, -15, 1.8], [25, 15, 2.0]]) {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), matSand);
    mound.position.set(x, 0, z);
    mound.scale.y = 0.35;
    group.add(mound);
  }

  // lights
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 42, 115);
  const sun = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunIntensity);
  sun.position.set(28, 42, 18);
  if (quality === 'high') {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -35; sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35;
    sun.shadow.camera.far = 120;
  }
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, PALETTE.hemiIntensity));
  scene.add(new THREE.AmbientLight(PALETTE.ambient, PALETTE.ambientIntensity));
  scene.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  const tmpDir = new THREE.Vector3();
  const colliders = COLLIDERS.map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1 }));

  function collide(pos, radius) {
    // clamp to map bounds first
    pos.x = Math.max(BOUNDS.minX + radius, Math.min(BOUNDS.maxX - radius, pos.x));
    pos.z = Math.max(BOUNDS.minZ + radius, Math.min(BOUNDS.maxZ - radius, pos.z));
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        const nx = Math.max(c.x0, Math.min(c.x1, pos.x));
        const nz = Math.max(c.z0, Math.min(c.z1, pos.z));
        const dx = pos.x - nx, dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          // centre inside the box: push out along the smallest penetration
          const pl = pos.x - c.x0, pr = c.x1 - pos.x;
          const pt = pos.z - c.z0, pb = c.z1 - pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = c.x0 - radius;
          else if (m === pr) pos.x = c.x1 + radius;
          else if (m === pt) pos.z = c.z0 - radius;
          else pos.z = c.z1 + radius;
        }
      }
    }
  }

  function losBlocked(from, to) {
    tmpDir.subVectors(to, from);
    const dist = tmpDir.length();
    if (dist < 0.01) return false;
    raycaster.set(from, tmpDir.normalize());
    raycaster.far = dist - 0.4;
    return raycaster.intersectObjects(obstacleMeshes, false).length > 0;
  }

  return {
    colliders,
    bounds: BOUNDS,
    spawns: { vanguard: spawnRow(20, 0), jackals: spawnRow(-20, Math.PI) },
    lanes: LANES,
    obstacleMeshes,
    groundMesh: ground,
    collide,
    losBlocked,
  };
}
