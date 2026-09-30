// storage.js — 進行状況を localStorage に保存・復元する
// 読み書きに失敗しても（プライベートブラウズ、容量不足など）ゲームは続行できるようにする。

// 同じ github.io ドメインの他のページと衝突しないよう、固有のキー名にする
const KEY = 'is-guidance-quest:v1';
const STAGE_COUNT = 4;

function defaults() {
  return {
    version: 1,
    started: false,
    cleared: Array(STAGE_COUNT).fill(false),
    ranks: Array(STAGE_COUNT).fill(null),
    // null は「未設定（data/sounds.json の既定値を使う）」
    sound: { enabled: null, bgm: null, sfx: null },
  };
}

function normalize(d) {
  const p = defaults();
  if (!d || typeof d !== 'object') return p;
  p.started = d.started === true;
  for (let i = 0; i < STAGE_COUNT; i++) {
    p.cleared[i] = Array.isArray(d.cleared) && d.cleared[i] === true;
    const r = Array.isArray(d.ranks) ? d.ranks[i] : null;
    p.ranks[i] = typeof r === 'string' ? r : null;
  }
  const s = d.sound ?? {};
  p.sound.enabled = typeof s.enabled === 'boolean' ? s.enabled : null;
  p.sound.bgm = isVolume(s.bgm) ? s.bgm : null;
  p.sound.sfx = isVolume(s.sfx) ? s.sfx : null;
  return p;
}

function isVolume(v) {
  return typeof v === 'number' && v >= 0 && v <= 1;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : defaults();
  } catch (e) {
    console.warn('進行状況を読み込めませんでした（保存なしで続行します）', e);
    return defaults();
  }
}

export function save(progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
    return true;
  } catch (e) {
    console.warn('進行状況を保存できませんでした（保存なしで続行します）', e);
    return false;
  }
}

/** 進行状況を消す。音の設定は残す。 */
export function resetProgress(progress) {
  const p = defaults();
  p.sound = { ...defaults().sound, ...(progress?.sound ?? {}) };
  save(p);
  return p;
}
