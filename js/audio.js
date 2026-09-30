// audio.js — 効果音と BGM を Web Audio API で合成・再生する
//
// 使い方（各ステージから）：
//   audio.play('correct')                 効果音を鳴らす
//   audio.play('combo', { count: 3 })     コンボ数に応じて音程が上がる
//   audio.play('door', { locked: true })  扉が閉じたまま（ガチャガチャ）
//   audio.setIntensity(0〜2)              BGM を盛り上げる（テンポと音数が増える）
//
// data/sounds.json で、効果音・BGM ごとに「合成（synth）」か「音源ファイル（file）」かを切り替えられる。
// ファイルが読み込めない場合は合成音で代用する。

const AC = globalThis.AudioContext || globalThis.webkitAudioContext;

export const SFX_NAMES = [
  'tap', 'connect', 'correct', 'wrong', 'combo', 'clear', 'levelup', 'door', 'door-locked', 'ending',
];
export const BGM_NAMES = ['title', 'stage1', 'stage2', 'stage3', 'stage4', 'ending'];

let ctx = null;
let master = null;
let sfxBus = null;
let bgmBus = null;
let enabled = false;
let unlockedOnce = false;
const volumes = { bgm: 0.5, sfx: 0.8 };
let config = { sfx: {}, bgm: {} };
const fileBuffers = new Map(); // path -> AudioBuffer | Promise | null（読み込み失敗）
let noiseBuf = null;

// ---------------------------------------------------------------- 設定

export function configure(soundsJson) {
  config = { sfx: soundsJson?.sfx ?? {}, bgm: soundsJson?.bgm ?? {} };
  if (typeof document !== 'undefined') {
    // 画面が裏に回ったら止める（鳴りやまない不具合の防止）
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend().catch(() => {});
      else if (enabled) ctx.resume().catch(() => {});
    });
    addEventListener('pagehide', () => ctx?.suspend().catch(() => {}));
  }
}

export function isEnabled() {
  return enabled;
}

/** 'none'（未開始）/ 'suspended' / 'running' / 'closed' / 'unsupported' */
export function getState() {
  if (!AC) return 'unsupported';
  return ctx ? ctx.state : 'none';
}

export function getVolume(kind) {
  return volumes[kind];
}

export function setVolume(kind, v) {
  if (!(kind in volumes)) return;
  volumes[kind] = Math.min(1, Math.max(0, Number(v) || 0));
  applyVolumes();
}

export function setEnabled(on) {
  enabled = !!on;
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(enabled ? 1 : 0, t, 0.02);
  if (enabled) {
    ctx.resume().catch(() => {});
    if (bgmWanted && !bgm.out) startBgm();
  } else {
    stopBgmNodes();
    setTimeout(() => { if (!enabled) ctx.suspend().catch(() => {}); }, 150);
  }
}

/**
 * スマホのブラウザは、ユーザーの操作の中でしか音を開始できない。
 * タップなどのイベント処理の中で呼ぶこと（main.js が自動で呼ぶ）。
 */
export function unlock() {
  if (!enabled) return;
  const c = ensureContext();
  if (!c) return;
  if (c.state !== 'running') {
    c.resume().then(() => { if (enabled && bgmWanted && !bgm.out) startBgm(); }).catch(() => {});
  }
  if (!unlockedOnce) {
    unlockedOnce = true;
    // iOS 向け：無音を1回鳴らして出力を開始させる
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
    preloadFiles();
  }
  if (enabled && bgmWanted && !bgm.out) startBgm();
}

function ensureContext() {
  if (ctx) return ctx;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch (e) {
    console.warn('AudioContext を作れませんでした', e);
    return null;
  }
  master = ctx.createGain();
  master.gain.value = enabled ? 1 : 0;
  // 音を重ねても割れないように軽く圧縮する
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  bgmBus = ctx.createGain();
  sfxBus.connect(master);
  bgmBus.connect(master);
  applyVolumes();
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  sfxBus.gain.setTargetAtTime(volumes.sfx, t, 0.02);
  // BGM は効果音より控えめに
  bgmBus.gain.setTargetAtTime(volumes.bgm * 0.55, t, 0.02);
}

// ---------------------------------------------------------------- 音源ファイル

function preloadFiles() {
  for (const group of [config.sfx, config.bgm]) {
    for (const entry of Object.values(group)) {
      if (entry?.source === 'file' && entry.path) loadFile(entry.path);
    }
  }
}

function loadFile(path) {
  if (fileBuffers.has(path)) return Promise.resolve(fileBuffers.get(path));
  const p = fetch(new URL(`../${path}`, import.meta.url))
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    // 古い Safari はコールバック形式しか対応しないため、両対応で書く
    .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
    .then((buf) => {
      fileBuffers.set(path, buf);
      return buf;
    })
    .catch((e) => {
      console.warn(`音源ファイル ${path} を読み込めませんでした（合成音で代用します）`, e);
      fileBuffers.set(path, null);
      return null;
    });
  fileBuffers.set(path, p);
  return p;
}

function fileBuffer(entry) {
  if (entry?.source !== 'file' || !entry.path || !ctx) return null;
  const b = fileBuffers.get(entry.path);
  if (b && typeof b.getChannelData === 'function') return b;
  if (!fileBuffers.has(entry.path)) loadFile(entry.path);
  return null;
}

// ---------------------------------------------------------------- 効果音

export function play(name, opts = {}) {
  if (!enabled || !ctx || ctx.state === 'closed') return;
  const key = name === 'door' && opts.locked ? 'door-locked' : name;
  const entry = config.sfx[key];
  const buf = fileBuffer(entry);
  if (buf) {
    const s = ctx.createBufferSource();
    const g = ctx.createGain();
    s.buffer = buf;
    g.gain.value = entry.volume ?? 1;
    s.connect(g).connect(sfxBus);
    s.start();
    return;
  }
  const fn = SFX[key];
  if (fn) fn(ctx.currentTime + 0.01, opts);
  else console.warn(`効果音 "${name}" はありません`);
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function tone(t, { freq, to = null, glide = null, type = 'square', dur = 0.15, vol = 0.2, attack = 0.005, lp = null, dest = sfxBus }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + (glide ?? dur));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    node = node.connect(f);
  }
  node.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function getNoise() {
  if (!noiseBuf) {
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise(t, { dur = 0.1, vol = 0.2, filter = 'highpass', freq = 5000, q = 1, dest = sfxBus }) {
  const s = ctx.createBufferSource();
  s.buffer = getNoise();
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

function sparkle(t, n, dest = sfxBus) {
  for (let i = 0; i < n; i++) {
    tone(t + i * 0.045, { freq: 2000 + Math.random() * 2200, type: 'sine', dur: 0.09, vol: 0.07, dest });
  }
}

function kick(t, dest, vol = 0.55) {
  tone(t, { freq: 150, to: 40, glide: 0.1, type: 'sine', dur: 0.2, vol, attack: 0.002, dest });
}
function snare(t, dest, vol = 0.22) {
  noise(t, { dur: 0.11, vol, filter: 'highpass', freq: 1800, dest });
  tone(t, { freq: 190, type: 'triangle', dur: 0.06, vol: vol * 0.6, dest });
}
function hat(t, dest, vol = 0.07) {
  noise(t, { dur: 0.03, vol, filter: 'highpass', freq: 8000, dest });
}

const SFX = {
  // 短く軽いポップ音
  tap(t) {
    tone(t, { freq: 660, to: 1150, glide: 0.04, type: 'triangle', dur: 0.08, vol: 0.3 });
  },
  // 上昇する電子音
  connect(t) {
    [0, 4, 7, 12].forEach((s, i) => tone(t + i * 0.045, { freq: mtof(72 + s), type: 'square', dur: 0.09, vol: 0.1 }));
    tone(t, { freq: 400, to: 1600, type: 'sine', dur: 0.22, vol: 0.12 });
  },
  // きらびやかな和音
  correct(t) {
    [72, 76, 79, 84].forEach((m, i) => {
      tone(t + i * 0.035, { freq: mtof(m), type: 'triangle', dur: 0.6, vol: 0.2 });
      tone(t + i * 0.035, { freq: mtof(m + 12), type: 'square', dur: 0.22, vol: 0.04 });
    });
    sparkle(t + 0.12, 6);
  },
  // コミカルな「ブブー」。責める感じにしない
  wrong(t) {
    tone(t, { freq: 196, to: 185, type: 'sawtooth', dur: 0.15, vol: 0.16, lp: 1200 });
    tone(t + 0.19, { freq: 185, to: 98, glide: 0.3, type: 'sawtooth', dur: 0.32, vol: 0.16, lp: 1200 });
    tone(t + 0.52, { freq: 880, to: 1320, glide: 0.06, type: 'triangle', dur: 0.08, vol: 0.08 }); // 「ぽよん」で締める
  },
  // 連続正解：回数に応じて音程が上がる
  combo(t, { count = 1 } = {}) {
    const steps = [0, 2, 4, 7, 9];
    const idx = Math.min(Math.max(count, 1) - 1, 14);
    const m = 67 + Math.floor(idx / 5) * 12 + steps[idx % 5];
    [0, 4, 7, 12].forEach((s, i) => tone(t + i * 0.04, { freq: mtof(m + s), type: 'square', dur: 0.12, vol: 0.09 }));
    sparkle(t + 0.12, Math.min(3 + count, 10));
  },
  // ステージクリアのファンファーレ（2秒程度）
  clear(t) {
    const q = 0.12;
    const notes = [[67, 0, 0.1], [67, q, 0.1], [67, q * 2, 0.1], [72, q * 3, 0.42], [69, q * 7, 0.14], [71, q * 8.5, 0.14], [72, q * 10, 0.9]];
    for (const [m, at, d] of notes) {
      tone(t + at, { freq: mtof(m), type: 'square', dur: d, vol: 0.11 });
      tone(t + at, { freq: mtof(m - 12), type: 'triangle', dur: d, vol: 0.14 });
    }
    const end = t + q * 10;
    [60, 64, 67, 76, 84].forEach((m) => tone(end, { freq: mtof(m), type: 'triangle', dur: 0.95, vol: 0.09 }));
    kick(t + q * 3, sfxBus, 0.5);
    kick(end, sfxBus, 0.6);
    noise(end, { dur: 0.8, vol: 0.12, filter: 'highpass', freq: 6000 });
    sparkle(end + 0.1, 10);
  },
  // ゲームのレベルアップ風
  levelup(t) {
    [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone(t + i * 0.04, { freq: mtof(m), type: 'square', dur: 0.08, vol: 0.09 }));
    const e = t + 0.3;
    [84, 88, 91].forEach((m) => tone(e, { freq: mtof(m), type: 'triangle', dur: 0.4, vol: 0.12 }));
    sparkle(e, 5);
  },
  // 扉が開く：重低音＋キラキラ
  door(t) {
    tone(t, { freq: 110, to: 32, glide: 0.6, type: 'sine', dur: 0.7, vol: 0.7, attack: 0.003 });
    noise(t, { dur: 0.8, vol: 0.3, filter: 'lowpass', freq: 300 });
    [72, 79, 84, 88].forEach((m, i) => tone(t + 0.25 + i * 0.06, { freq: mtof(m), type: 'triangle', dur: 0.5, vol: 0.08 }));
    sparkle(t + 0.3, 8);
  },
  // 扉が閉じたまま：ガチャガチャ
  'door-locked'(t) {
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.09 + (i >= 2 ? 0.08 : 0);
      noise(at, { dur: 0.05, vol: 0.45, filter: 'bandpass', freq: 2400, q: 6 });
      tone(at, { freq: 280, to: 190, type: 'square', dur: 0.05, vol: 0.07 });
    }
  },
  // エンディング：最も豪華なファンファーレ
  ending(t) {
    const q = 0.13;
    const lead = [[67, 0, 0.1], [67, 1, 0.1], [67, 2, 0.1], [72, 3, 0.5], [76, 7, 0.14], [79, 8, 0.14], [84, 9, 0.8],
      [81, 15, 0.14], [83, 16, 0.14], [84, 17, 1.4]];
    for (const [m, at, d] of lead) {
      tone(t + at * q, { freq: mtof(m), type: 'square', dur: d, vol: 0.1 });
      tone(t + at * q, { freq: mtof(m - 12), type: 'sawtooth', dur: d, vol: 0.05, lp: 2200 });
    }
    const chords = [[3, [65, 69, 72]], [9, [67, 71, 74]], [17, [60, 64, 67, 72, 76]]];
    for (const [at, ms] of chords) {
      for (const m of ms) tone(t + at * q, { freq: mtof(m), type: 'triangle', dur: at === 17 ? 1.6 : 0.7, vol: 0.08 });
      tone(t + at * q, { freq: mtof(ms[0] - 24), type: 'triangle', dur: 0.8, vol: 0.25 });
      kick(t + at * q, sfxBus, 0.6);
      noise(t + at * q, { dur: 0.9, vol: 0.12, filter: 'highpass', freq: 5500 });
    }
    for (let i = 10; i < 17; i++) snare(t + i * q, sfxBus, 0.12 + i * 0.01);
    sparkle(t + 17 * q, 14);
  },
};

// ---------------------------------------------------------------- BGM（チップチューン風シーケンサー）
//
// 1小節 = 16ステップ（16分音符）。prog は小節ごとのコード（スケールの度数、0 = I）。
// kick / snare / hat は 'x' で打つ。bass / lead は数字（コードの根音からスケール上に何度上か。a=10, b=11 …、o=オクターブ）。
// lead は [通常の小節, 最後の小節] の2パターン。音の長さは次の音まで（最大4ステップ）。

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

const SONGS = {
  title: {
    bpm: 120, root: 72, scale: MAJOR, prog: [0, 5, 3, 4],
    kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.',
    bass: '0...0.4.0...0.4.', lead: ['4.4.2...7...4...', '4.5.7...9.7.4...'], arp: false,
  },
  stage1: {
    bpm: 128, root: 65, scale: MAJOR, prog: [0, 4, 5, 3],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    bass: '0.0.0.0.2.2.4.4.', lead: ['7...4...5.4.2...', '7...9...7.5.4...'], arp: false,
  },
  stage2: {
    bpm: 136, root: 69, scale: MINOR, prog: [0, 5, 6, 4],
    kick: 'x...x...x...x...', snare: '....x.......x..x', hat: '.x.x.x.x.x.x.x.x',
    bass: '0.00.0o.0.00.0o.', lead: ['0...2.4...4.2.0.', '4...2.4.7...6.4.'], arp: true,
  },
  stage3: {
    bpm: 116, root: 62, scale: MINOR, prog: [0, 6, 5, 4],
    kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    bass: '0..0..0.0..0..4.', lead: ['4.....2.4...7...', '7.....6.4...2...'], arp: false,
  },
  stage4: {
    bpm: 124, root: 67, scale: MAJOR, prog: [3, 4, 2, 5],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    bass: '0.0...0.0.2...4.', lead: ['2.4.7.4.2...0...', '2.4.7.9.7...4...'], arp: false,
  },
  ending: {
    bpm: 140, root: 72, scale: MAJOR, prog: [3, 4, 0, 5],
    kick: 'x...x...x...x...', snare: '....x.......x.x.', hat: 'xxxxxxxxxxxxxxxx',
    bass: '0.o.0.o.0.o.0.o.', lead: ['7...9...a...9.7.', '7.9.a.b.e.......'], arp: true,
  },
};

function parseNotes(str) {
  const chars = [...str];
  const out = [];
  chars.forEach((c, i) => {
    if (c === '.') return;
    let j = i + 1;
    while (j < chars.length && chars[j] === '.') j++;
    out[i] = { step: c === 'o' ? 7 : parseInt(c, 36), len: Math.min(j - i, 4) };
  });
  return out;
}

function compile(song) {
  return {
    ...song,
    bassNotes: parseNotes(song.bass),
    leadNotes: song.lead.map(parseNotes),
  };
}

function pitch(song, chordDeg, step) {
  const d = chordDeg + step;
  const n = song.scale.length;
  return song.root + 12 * Math.floor(d / n) + song.scale[((d % n) + n) % n];
}

let bgmWanted = null;
let intensity = 0;
const bgm = { name: null, out: null, src: null, song: null, step: 0, next: 0, timer: null };

/** BGM を再生する。同じ曲が流れていれば続ける（盛り上がりだけリセット）。 */
export function playBgm(name) {
  if (name === bgmWanted && bgm.out) {
    intensity = 0;
    return;
  }
  bgmWanted = name;
  intensity = 0;
  startBgm();
}

export function stopBgm() {
  bgmWanted = null;
  stopBgmNodes();
}

export function currentBgm() {
  return bgmWanted;
}

/** 0 = 通常、1 = 盛り上がり（ハイハット・アルペジオ追加、少し速く）、2 = 最高潮（さらに速く、メロディ重ね） */
export function setIntensity(level) {
  intensity = Math.min(2, Math.max(0, Math.round(Number(level) || 0)));
}

export function getIntensity() {
  return intensity;
}

function startBgm() {
  stopBgmNodes();
  if (!enabled || !ctx || !bgmWanted) return;
  const out = ctx.createGain();
  out.connect(bgmBus);
  bgm.out = out;
  bgm.name = bgmWanted;

  const entry = config.bgm[bgmWanted];
  const buf = fileBuffer(entry);
  if (buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    out.gain.value = entry.volume ?? 1;
    s.connect(out);
    s.start();
    bgm.src = s;
    return;
  }
  if (entry?.source === 'file' && entry.path) {
    // 読み込み中は合成音で流し、読み込めたら差し替える
    loadFile(entry.path).then((b) => {
      if (b && bgm.out === out) startBgm();
    });
  }
  const song = SONGS[bgmWanted];
  if (!song) return;
  bgm.song = compile(song);
  bgm.step = 0;
  bgm.next = ctx.currentTime + 0.1;
  bgm.timer = setInterval(tick, 25);
}

function stopBgmNodes() {
  clearInterval(bgm.timer);
  bgm.timer = null;
  if (ctx) {
    if (bgm.src) {
      try { bgm.src.stop(ctx.currentTime + 0.3); } catch { /* 停止済み */ }
    }
    if (bgm.out) {
      const o = bgm.out;
      o.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => o.disconnect(), 500);
    }
  }
  bgm.out = null;
  bgm.src = null;
  bgm.song = null;
  bgm.name = null;
}

function tick() {
  if (!ctx || ctx.state !== 'running' || !bgm.song) return;
  const s = bgm.song;
  const stepDur = 60 / (s.bpm * (1 + 0.06 * intensity)) / 4;
  // 画面が裏に回っていた等で遅れたら、今から再開する（まとめて鳴らさない）
  if (bgm.next < ctx.currentTime - 0.1) bgm.next = ctx.currentTime + 0.05;
  while (bgm.next < ctx.currentTime + 0.12) {
    scheduleStep(s, bgm.step, bgm.next, stepDur);
    bgm.next += stepDur;
    bgm.step = (bgm.step + 1) % (16 * s.prog.length);
  }
}

function scheduleStep(s, step, t, stepDur) {
  const out = bgm.out;
  const bar = Math.floor(step / 16);
  const i = step % 16;
  const deg = s.prog[bar];

  if (s.kick[i] === 'x') kick(t, out);
  if (s.snare[i] === 'x') snare(t, out);
  const hats = intensity >= 1 ? 'xxxxxxxxxxxxxxxx' : s.hat;
  if (hats[i] === 'x') hat(t, out, i % 4 === 2 ? 0.1 : 0.06);
  if (intensity >= 2 && i === 0) noise(t, { dur: 0.5, vol: 0.08, filter: 'highpass', freq: 6000, dest: out });

  const b = s.bassNotes[i];
  if (b) {
    tone(t, { freq: mtof(pitch(s, deg, b.step) - 24), type: 'triangle', dur: b.len * stepDur * 0.9, vol: 0.32, dest: out });
  }

  if (s.arp || intensity >= 1) {
    const arp = [0, 2, 4, 7];
    tone(t, { freq: mtof(pitch(s, deg, arp[i % 4]) + 12), type: 'square', dur: stepDur * 0.7, vol: 0.025, dest: out });
  }

  const lead = s.leadNotes[bar === s.prog.length - 1 ? 1 : 0][i];
  if (lead) {
    const f = mtof(pitch(s, deg, lead.step));
    const d = lead.len * stepDur * 0.9;
    tone(t, { freq: f, type: 'square', dur: d, vol: 0.065, dest: out });
    if (intensity >= 2) tone(t, { freq: f * 2, type: 'triangle', dur: d, vol: 0.05, dest: out });
  }
}
