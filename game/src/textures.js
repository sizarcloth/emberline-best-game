// Procedural textures, painted on offscreen canvases — no image assets, no network.
import * as THREE from 'three';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function speckle(ctx, size, count, colors, minR, maxR) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.globalAlpha = 0.12 + Math.random() * 0.25;
    const r = minR + Math.random() * (maxR - minR);
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function sandTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#c9a06a';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 900, ['#b28a52', '#dcbc85', '#a37c48', '#e8d09a'], 1, 3.5);
  // faint wind ripples
  ctx.strokeStyle = 'rgba(120,85,45,0.18)';
  ctx.lineWidth = 2;
  for (let y = 8; y < 256; y += 18) {
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.09 + y) * 3);
    }
    ctx.stroke();
  }
  return toTexture(c, 14, 11);
}

export function brickTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#8a6a58';
  ctx.fillRect(0, 0, 256, 256);
  const bh = 21, bw = 52;
  for (let row = 0; row < 256 / bh; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < 256 / bw + 1; col++) {
      const x = col * bw + off, y = row * bh;
      const tone = 150 + ((row * 7 + col * 13) % 5) * 12;
      ctx.fillStyle = `rgb(${tone},${58 + ((row + col) % 3) * 8},${30 + ((col * 3) % 4) * 5})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      ctx.fillStyle = 'rgba(255,220,180,0.10)';
      ctx.fillRect(x + 2, y + 2, bw - 4, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x + 2, y + bh - 6, bw - 4, 4);
    }
  }
  speckle(ctx, 256, 220, ['#5e2f18', '#c97e4e'], 1, 2.5);
  return toTexture(c, 3, 2);
}

export function concreteTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#9a938a';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 1100, ['#847d73', '#aaa39a', '#76706a', '#b5aea4'], 1, 3);
  ctx.strokeStyle = 'rgba(60,55,50,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 248);
  ctx.beginPath();
  ctx.moveTo(0, 128); ctx.lineTo(256, 128);
  ctx.moveTo(128, 0); ctx.lineTo(128, 256);
  ctx.stroke();
  return toTexture(c, 6, 6);
}

export function woodTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(0, 0, 256, 256);
  for (let p = 0; p < 4; p++) {
    const y0 = p * 64;
    ctx.fillStyle = p % 2 ? '#7d5f39' : '#93744a';
    ctx.fillRect(0, y0, 256, 64);
    ctx.strokeStyle = 'rgba(60,40,20,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-2, y0, 260, 64);
    ctx.strokeStyle = 'rgba(70,48,24,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const y = y0 + 8 + Math.random() * 48;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y + 4, 170, y - 4, 256, y + 2);
      ctx.stroke();
    }
  }
  return toTexture(c, 1, 1);
}

export function metalTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#7a5236';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(50,30,15,0.25)' : 'rgba(200,140,90,0.12)';
    ctx.fillRect(0, i * 6.4, 256, 3);
  }
  speckle(ctx, 256, 260, ['#4e2f1c', '#a9764a', '#3a2214'], 1, 4);
  return toTexture(c, 2, 2);
}

export function glowSpriteTexture() {
  const [c, ctx] = canvas(64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.35, 'rgba(255,190,90,0.85)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildTextures() {
  return {
    sand: sandTexture(),
    brick: brickTexture(),
    concrete: concreteTexture(),
    wood: woodTexture(),
    metal: metalTexture(),
    glow: glowSpriteTexture(),
  };
}
