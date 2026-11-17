// Procedural sound: every effect is synthesized with WebAudio — no audio
// assets. The context starts on the first user gesture; everything is a
// no-op until then.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = null) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, filterFreq, gain, when = 0, type = 'lowpass') {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const SHOT = {
    pistol: { dur: 0.13, freq: 1400, gain: 0.5, thump: 120 },
    smg: { dur: 0.09, freq: 1700, gain: 0.38, thump: 130 },
    rifle: { dur: 0.14, freq: 1100, gain: 0.55, thump: 100 },
    shotgun: { dur: 0.28, freq: 700, gain: 0.8, thump: 70 },
    dmr: { dur: 0.22, freq: 900, gain: 0.65, thump: 85 },
  };

  return {
    resume,
    shoot(kind, volume = 1) {
      if (!ctx) return;
      const s = SHOT[kind] || SHOT.rifle;
      noise(s.dur, s.freq, s.gain * volume);
      tone(s.thump, s.dur * 0.9, 'sine', 0.5 * volume, 0, 45);
    },
    reload() {
      tone(900, 0.05, 'square', 0.12);
      tone(650, 0.06, 'square', 0.14, 0.18);
      tone(1100, 0.05, 'square', 0.12, 0.38);
    },
    hit() { tone(1300, 0.05, 'sine', 0.25); },
    kill() {
      tone(880, 0.09, 'sine', 0.3);
      tone(1318, 0.12, 'sine', 0.3, 0.08);
    },
    buy() {
      tone(1500, 0.06, 'sine', 0.22);
      tone(1900, 0.08, 'sine', 0.2, 0.07);
    },
    denied() { tone(150, 0.16, 'square', 0.2); },
    empty() { tone(2100, 0.03, 'square', 0.12); },
    click() { tone(1000, 0.04, 'sine', 0.15); },
    roundWin() {
      tone(523, 0.14, 'triangle', 0.3);
      tone(659, 0.14, 'triangle', 0.3, 0.12);
      tone(784, 0.24, 'triangle', 0.32, 0.24);
    },
    roundLose() {
      tone(392, 0.16, 'triangle', 0.28);
      tone(330, 0.16, 'triangle', 0.28, 0.14);
      tone(262, 0.26, 'triangle', 0.28, 0.28);
    },
  };
}
