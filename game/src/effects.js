// Combat feedback: tracers, muzzle flashes and impact sparks. Everything is
// pooled and cheap — the software renderer has no patience for allocations
// mid-frame.
import * as THREE from 'three';

const MAX_PARTICLES = 240;
const TRACER_POOL = 24;
const FLASH_POOL = 6;

export function createEffects(scene, textures, quality) {
  const lowQ = quality === 'low';

  // --- tracers ---
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffd98a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  // --- muzzle flashes ---
  const flashes = [];
  for (let i = 0; i < FLASH_POOL; i++) {
    const mat = new THREE.SpriteMaterial({
      map: textures.glow, color: 0xffc46b, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.55, 0.55, 1);
    sprite.visible = false;
    scene.add(sprite);
    flashes.push({ sprite, life: 0 });
  }
  let flashIdx = 0;

  // --- particles (one Points cloud, additive; dead particles park below ground) ---
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  for (let i = 0; i < MAX_PARTICLES; i++) pPos[i * 3 + 1] = -999;
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.14, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  points.frustumCulled = false;
  scene.add(points);
  const pVel = new Float32Array(MAX_PARTICLES * 3);
  const pLife = new Float32Array(MAX_PARTICLES);
  const pMaxLife = new Float32Array(MAX_PARTICLES);
  let pCursor = 0;

  function spawnParticles(point, color, count, speed) {
    const n = lowQ ? Math.ceil(count / 2) : count;
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = pCursor;
      pCursor = (pCursor + 1) % MAX_PARTICLES;
      pPos[i * 3] = point.x;
      pPos[i * 3 + 1] = point.y;
      pPos[i * 3 + 2] = point.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI - Math.PI / 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      pVel[i * 3] = Math.cos(th) * Math.cos(ph) * v;
      pVel[i * 3 + 1] = Math.abs(Math.sin(ph)) * v + 1.2;
      pVel[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * v;
      const fade = 0.6 + Math.random() * 0.4;
      pCol[i * 3] = c.r * fade;
      pCol[i * 3 + 1] = c.g * fade;
      pCol[i * 3 + 2] = c.b * fade;
      pLife[i] = pMaxLife[i] = 0.25 + Math.random() * 0.3;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  function tracer(from, to) {
    if (!to) return;
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % TRACER_POOL;
    const attr = t.line.geometry.attributes.position;
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.9;
    t.life = 0.07;
  }

  function muzzleFlash(position) {
    const f = flashes[flashIdx];
    flashIdx = (flashIdx + 1) % FLASH_POOL;
    f.sprite.position.copy(position);
    f.sprite.material.rotation = Math.random() * Math.PI;
    f.sprite.visible = true;
    f.sprite.material.opacity = 1;
    f.life = 0.045;
  }

  function impact(point, kind) {
    if (kind === 'flesh') spawnParticles(point, 0xd23c1e, 10, 2.2);
    else if (kind === 'spark') spawnParticles(point, 0xffcf7a, 8, 3.2);
    else spawnParticles(point, 0xcbb894, 6, 2.0);
  }

  function update(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const f of flashes) {
      if (f.life > 0) {
        f.life -= dt;
        f.sprite.material.opacity = Math.max(0, f.life / 0.045);
        if (f.life <= 0) f.sprite.visible = false;
      }
    }
    let anyAlive = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (pLife[i] <= 0) continue;
      anyAlive = true;
      pLife[i] -= dt;
      if (pLife[i] <= 0) {
        pPos[i * 3 + 1] = -999;
        pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0;
        continue;
      }
      pVel[i * 3 + 1] -= 9 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pPos[i * 3 + 1] < 0.02) pPos[i * 3 + 1] = 0.02;
      const f = pLife[i] / pMaxLife[i];
      pCol[i * 3] *= f;
      pCol[i * 3 + 1] *= f;
      pCol[i * 3 + 2] *= f;
    }
    if (anyAlive) {
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
    }
  }

  return { tracer, muzzleFlash, impact, update };
}
