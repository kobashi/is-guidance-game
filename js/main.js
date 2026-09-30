// main.js — 画面遷移・進行状況の管理
//
// 画面は URL の # で切り替える（ブラウザの「戻る」が使える）。
//   #/          タイトル
//   #/map       ステージ選択
//   #/stage/1   ステージ1〜4
//   #/ending    エンディング
//   #/debug     効果音・BGM・演出の試聴（?debug=1 のときだけ）
//
// ステージのファイル（js/stages/*.js）は次の形で書く：
//   export async function mount(root, ctx) { ...; return () => { 後片付け } }
//   ctx の中身は createStageContext() を参照。クリアしたら ctx.complete({ mistakes }) を呼ぶ。

import * as storage from './storage.js';
import * as audio from './audio.js';
import * as fx from './fx.js';
import { el, fmt } from './dom.js';

const STAGE_FILES = ['stage1-system.js', 'stage2-bug.js', 'stage3-dungeon.js', 'stage4-quiz.js'];
const STAGE_COUNT = STAGE_FILES.length;
const RANK_ORDER = ['S', 'A', 'B', 'C'];
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

const app = document.getElementById('app');
let ui = null;
let links = null;
let progress = storage.load();
let cleanup = null;
let renderToken = 0;
let currentStage = 0;

/** data/ 以下の JSON を読む（パスはサイトのルートから。例：'data/bugs.json'） */
export async function loadJSON(path) {
  const res = await fetch(new URL(`../${path}`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（HTTP ${res.status}）`);
  return res.json();
}

// ---------------------------------------------------------------- 起動

boot();

async function boot() {
  let sounds;
  try {
    [ui, sounds, links] = await Promise.all([
      loadJSON('data/ui.json'),
      loadJSON('data/sounds.json'),
      loadJSON('data/links.json'),
    ]);
  } catch (e) {
    console.error(e);
    app.replaceChildren(el('p', { class: 'error', text: 'データを読み込めませんでした。ページを再読み込みしてください。' }));
    return;
  }

  audio.configure(sounds);
  audio.setVolume('bgm', progress.sound.bgm ?? sounds.volume?.bgm ?? 0.5);
  audio.setVolume('sfx', progress.sound.sfx ?? sounds.volume?.sfx ?? 0.8);
  audio.setEnabled(progress.sound.enabled ?? sounds.defaultEnabled === true);
  fx.init();

  // スマホは、ユーザーの操作の中でしか音を開始できない
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(type, () => { if (audio.isEnabled()) audio.unlock(); }, { capture: true, passive: true });
  }
  // ボタンを押したら軽い音を鳴らす。data-sfx="none" で無音、data-sfx="connect" などで別の音
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, a.btn, [data-sfx]');
    if (!b || b.disabled || b.dataset.sfx === 'none') return;
    audio.play(b.dataset.sfx || 'tap');
  });

  setupHeader();
  setupSettings();
  addEventListener('hashchange', route);
  route();
}

// ---------------------------------------------------------------- 進行状況

function isUnlocked(n) {
  return DEBUG || n === 1 || progress.cleared[n - 2] === true;
}

function allCleared() {
  return progress.cleared.every(Boolean);
}

function saveProgress() {
  storage.save(progress);
  updateHeader();
}

function rankFor(mistakes) {
  const th = ui.rank ?? {};
  for (const r of RANK_ORDER) {
    if (typeof th[r] === 'number' && mistakes <= th[r]) return r;
  }
  return 'B';
}

function betterRank(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ia = RANK_ORDER.indexOf(a);
  const ib = RANK_ORDER.indexOf(b);
  return ia !== -1 && (ib === -1 || ia <= ib) ? a : b;
}

function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- 音

function setSound(on) {
  if (on) {
    audio.setEnabled(true);
    audio.unlock();
  } else {
    audio.setEnabled(false);
  }
  progress.sound.enabled = on;
  saveProgress();
  document.dispatchEvent(new Event('soundchange'));
}

// ---------------------------------------------------------------- 画面遷移

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const token = ++renderToken;
  teardown();
  switch (name || 'title') {
    case 'title':
      return showTitle();
    case 'map':
      return showMap();
    case 'stage': {
      const n = Number(arg);
      if (!(n >= 1 && n <= STAGE_COUNT) || !isUnlocked(n)) return go('#/map');
      return showStage(n, token);
    }
    case 'ending':
      if (!allCleared() && !DEBUG) return go('#/map');
      return showEnding();
    case 'debug':
      if (DEBUG) return showDebug(token);
    // fallthrough
    default:
      return go('#/');
  }
}

function teardown() {
  if (cleanup) {
    try { cleanup(); } catch (e) { console.error(e); }
  }
  cleanup = null;
  currentStage = 0;
  fx.clearAll();
  audio.setIntensity(0);
}

function mountScreen(node, bgm) {
  app.replaceChildren(node);
  scrollTo(0, 0);
  if (bgm) audio.playBgm(bgm);
  else audio.stopBgm();
  const h = node.querySelector('h1, h2');
  if (h) {
    h.tabIndex = -1;
    h.focus({ preventScroll: true });
  }
  updateHeader();
}

// ---------------------------------------------------------------- タイトル

function showTitle() {
  const T = ui.title;
  const onBtn = el('button', { type: 'button', class: 'btn btn-sound', onclick: () => setSound(true) }, T.soundOn);
  const offBtn = el('button', { type: 'button', class: 'btn btn-sound', onclick: () => setSound(false) }, T.soundOff);
  const syncSound = () => {
    onBtn.setAttribute('aria-pressed', String(audio.isEnabled()));
    offBtn.setAttribute('aria-pressed', String(!audio.isEnabled()));
  };
  syncSound();
  document.addEventListener('soundchange', syncSound);

  const start = () => {
    progress.started = true;
    saveProgress();
    go('#/stage/1');
  };
  const actions = progress.started
    ? [
      el('button', { type: 'button', class: 'btn btn-big', onclick: () => go('#/map') }, T.continue),
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => {
        if (!confirm(T.restartConfirm)) return;
        progress = storage.resetProgress(progress);
        start();
      } }, T.restart),
    ]
    : [el('button', { type: 'button', class: 'btn btn-big', onclick: start }, T.start)];

  const E = T.emblem ?? {};
  const screen = el('section', { class: 'screen title-screen' },
    el('div', { class: 'emblem', 'aria-hidden': 'true' },
      el('span', { class: 'emblem-part emblem-left', text: E.left }),
      el('span', { class: 'emblem-part emblem-right', text: E.right }),
      el('span', { class: 'emblem-whole', text: E.whole }),
    ),
    el('h1', { class: 'game-title', text: T.heading }),
    el('p', { class: 'lead', text: T.lead }),
    el('div', { class: 'sound-choice', role: 'group', 'aria-label': T.soundGroup }, onBtn, offBtn),
    el('div', { class: 'actions' }, actions),
    el('p', { class: 'note', text: T.note }),
  );
  mountScreen(screen, 'title');
  cleanup = () => document.removeEventListener('soundchange', syncSound);
}

// ---------------------------------------------------------------- ステージ選択

function showMap() {
  const M = ui.map;
  const cards = ui.stages.map((s, i) => {
    const n = i + 1;
    const unlocked = isUnlocked(n);
    const cleared = progress.cleared[i];
    const rank = progress.ranks[i];
    return el('li', { class: `stage-card${cleared ? ' is-cleared' : ''}${unlocked ? '' : ' is-locked'}` },
      el('div', { class: 'stage-card-head' },
        el('span', { class: 'stage-num', text: fmt(M.stageLabel, { n }) }),
        cleared ? el('span', { class: 'badge', text: M.cleared }) : null,
        rank ? el('span', { class: `rank-chip rank-${rank}`, 'aria-label': `${M.bestRank} ${rank}`, text: rank }) : null,
      ),
      el('h2', { class: 'stage-name', text: s.name }),
      el('p', { class: 'stage-short', text: unlocked ? s.short : M.locked }),
      unlocked
        ? el('button', { type: 'button', class: `btn${cleared ? ' btn-secondary' : ''}`, onclick: () => go(`#/stage/${n}`) }, cleared ? M.replay : M.play)
        : null,
    );
  });
  const endingCard = allCleared()
    ? el('li', { class: 'stage-card is-ending' },
      el('h2', { class: 'stage-name', text: M.endingName }),
      el('button', { type: 'button', class: 'btn btn-big', onclick: () => go('#/ending') }, M.ending))
    : null;

  const screen = el('section', { class: 'screen map-screen' },
    el('h1', { class: 'screen-title', text: M.heading }),
    el('ol', { class: 'stage-list' }, cards, endingCard),
    el('div', { class: 'actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => go('#/') }, M.back)),
  );
  mountScreen(screen, 'title');
}

// ---------------------------------------------------------------- ステージ

async function showStage(n, token) {
  const s = ui.stages[n - 1];
  currentStage = n;
  const root = el('div', { class: 'stage-root' });
  const screen = el('section', { class: `screen stage-screen stage-${n}` },
    el('p', { class: 'stage-label', text: fmt(ui.stage.label, { n }) }),
    el('h1', { class: 'screen-title', text: s.name }),
    root,
  );
  mountScreen(screen, `stage${n}`);

  let mod;
  try {
    mod = await import(`./stages/${STAGE_FILES[n - 1]}`);
  } catch (e) {
    console.error(e);
    if (token === renderToken) root.append(el('p', { class: 'error', text: ui.stage.loadError }));
    return;
  }
  if (token !== renderToken) return;

  const ctx = createStageContext(n, token);
  try {
    const c = await mod.mount(root, ctx);
    if (token !== renderToken) {
      if (typeof c === 'function') c();
      return;
    }
    cleanup = typeof c === 'function' ? c : null;
  } catch (e) {
    console.error(e);
    root.append(el('p', { class: 'error', text: ui.stage.loadError }));
  }
}

/** ステージに渡す道具一式 */
function createStageContext(n, token) {
  const startedAt = performance.now();
  let done = false;
  const ctx = {
    stageId: n,
    stage: ui.stages[n - 1], // ui.json の stages[n-1]（name, short など）
    ui,                      // ui.json 全体
    audio,                   // audio.play('correct') など
    fx,                      // fx.celebrate('correct', el) など
    el,
    fmt,
    loadJSON,                // ctx.loadJSON('data/bugs.json')
    /** 画面が切り替わっていないか（非同期処理のあとに確認する） */
    isActive: () => token === renderToken,
    /**
     * クリアしたら呼ぶ。
     *   mistakes: 不正解の回数（ランク計算に使う）
     *   seconds : かかった秒数（省略時は自動で計測）
     *   rank    : ランクを直接指定したいとき（'S' など）
     */
    complete(result = {}) {
      if (done || token !== renderToken) return Promise.resolve();
      done = true;
      const seconds = result.seconds ?? (performance.now() - startedAt) / 1000;
      return finishStage(n, { ...result, seconds }, token);
    },
    /** 準備中のステージ用の仮画面 */
    renderPlaceholder(root) {
      const P = ui.placeholder;
      root.append(
        el('p', { class: 'stage-short', text: ctx.stage.short }),
        el('div', { class: 'placeholder' },
          el('p', { text: P.note }),
          el('button', { type: 'button', class: 'btn', 'data-sfx': 'none', onclick: () => ctx.complete({ mistakes: 0 }) }, P.clear)),
      );
    },
  };
  return ctx;
}

async function finishStage(n, result, token) {
  const C = ui.clear;
  const mistakes = Number.isFinite(result.mistakes) ? result.mistakes : 0;
  const rank = result.rank ?? rankFor(mistakes);
  progress.cleared[n - 1] = true;
  progress.ranks[n - 1] = betterRank(progress.ranks[n - 1], rank);
  saveProgress();
  fx.pop(document.querySelector(`.pip[data-stage="${n}"]`));

  audio.play('clear');
  fx.celebrate('clear');
  const lines = [];
  if (Number.isFinite(result.mistakes)) lines.push(fmt(C.mistakes, { n: result.mistakes }));
  if (Number.isFinite(result.seconds)) lines.push(fmt(C.time, { t: formatTime(result.seconds) }));
  await fx.showRank({
    heading: C.heading,
    rankLabel: C.rankLabel,
    rank,
    lines,
    button: n < STAGE_COUNT ? C.next : C.toEnding,
    skipHint: C.skipHint,
  });
  if (token !== renderToken) return;
  go(n < STAGE_COUNT ? `#/stage/${n + 1}` : '#/ending');
}

// ---------------------------------------------------------------- エンディング

function showEnding() {
  const E = ui.ending;
  const honor = el('p', { class: 'honor', text: E.honor });
  const linkItems = (links?.links ?? []).map((l) =>
    el('li', {},
      el('a', { class: 'link-card', href: l.url, target: '_blank', rel: 'noopener', 'data-sfx': 'tap' },
        el('span', { class: 'link-label', text: l.label }),
        l.note ? el('span', { class: 'link-note', text: l.note }) : null)));

  const screen = el('section', { class: 'screen ending-screen' },
    el('h1', { class: 'ending-title', text: E.heading }),
    el('p', { class: 'honor-label', text: E.honorLabel }),
    honor,
    el('p', { class: 'ending-message', text: E.message }),
    el('h2', { class: 'section-title', text: E.linksHeading }),
    el('ul', { class: 'link-list' }, linkItems),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => {
        if (!confirm(E.resetConfirm)) return;
        progress = storage.resetProgress(progress);
        saveProgress();
        go('#/');
      } }, E.reset)),
  );
  mountScreen(screen, null);
  audio.play('ending');
  fx.celebrate('ending');
  fx.slam(honor);
  // ファンファーレが終わってから BGM を流す
  const timer = setTimeout(() => audio.playBgm('ending'), 3600);
  cleanup = () => clearTimeout(timer);
}

// ---------------------------------------------------------------- デバッグ画面

async function showDebug(token) {
  const { renderDebug } = await import('./debug.js');
  if (token !== renderToken) return;
  const { node, dispose } = renderDebug({
    audio, fx, el, setSound,
    stages: ui.stages,
    go,
    clearAllStages() {
      progress.started = true;
      progress.cleared.fill(true);
      progress.ranks = progress.ranks.map((r) => r ?? 'A');
      saveProgress();
    },
    resetProgress() {
      progress = storage.resetProgress(progress);
      saveProgress();
    },
  });
  mountScreen(node, null);
  cleanup = dispose;
}

// ---------------------------------------------------------------- ヘッダー

function setupHeader() {
  const H = ui.header;
  document.getElementById('progress').addEventListener('click', () => go('#/map'));
  document.getElementById('mute-btn').addEventListener('click', () => setSound(!audio.isEnabled()));
  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn.setAttribute('aria-label', H.settings);
  settingsBtn.title = H.settings;
  settingsBtn.addEventListener('click', openSettings);
  const debugBtn = document.getElementById('debug-btn');
  if (DEBUG) {
    debugBtn.hidden = false;
    debugBtn.setAttribute('aria-label', H.debug);
    debugBtn.title = H.debug;
    debugBtn.addEventListener('click', () => go('#/debug'));
  }
  document.addEventListener('soundchange', updateHeader);
  updateHeader();
}

function updateHeader() {
  if (!ui) return;
  const H = ui.header;
  const count = progress.cleared.filter(Boolean).length;
  const btn = document.getElementById('progress');
  btn.setAttribute('aria-label', fmt(H.progressLabel, { n: count, total: STAGE_COUNT }));
  btn.querySelectorAll('.pip').forEach((pip) => {
    const n = Number(pip.dataset.stage);
    pip.classList.toggle('is-cleared', progress.cleared[n - 1]);
    pip.classList.toggle('is-current', n === currentStage);
    pip.classList.toggle('is-locked', !isUnlocked(n));
  });
  const mute = document.getElementById('mute-btn');
  const on = audio.isEnabled();
  mute.textContent = on ? '🔊' : '🔇';
  mute.setAttribute('aria-label', on ? H.mute : H.unmute);
  mute.title = on ? H.mute : H.unmute;
}

// ---------------------------------------------------------------- 設定

function setupSettings() {
  const S = ui.settings;
  const dialog = document.getElementById('settings');
  const toggle = el('input', { type: 'checkbox', id: 'set-sound', role: 'switch' });
  const bgm = el('input', { type: 'range', id: 'set-bgm', min: 0, max: 100, step: 5 });
  const sfx = el('input', { type: 'range', id: 'set-sfx', min: 0, max: 100, step: 5 });

  toggle.addEventListener('change', () => setSound(toggle.checked));
  bgm.addEventListener('input', () => audio.setVolume('bgm', bgm.value / 100));
  bgm.addEventListener('change', () => {
    progress.sound.bgm = bgm.value / 100;
    saveProgress();
  });
  sfx.addEventListener('input', () => audio.setVolume('sfx', sfx.value / 100));
  sfx.addEventListener('change', () => {
    progress.sound.sfx = sfx.value / 100;
    saveProgress();
    audio.play('correct'); // 音量の確認用
  });

  const sync = () => {
    toggle.checked = audio.isEnabled();
    bgm.value = Math.round(audio.getVolume('bgm') * 100);
    sfx.value = Math.round(audio.getVolume('sfx') * 100);
  };
  document.addEventListener('soundchange', sync);
  dialog._sync = sync;

  dialog.replaceChildren(el('form', { method: 'dialog', class: 'settings-form' },
    el('h2', { class: 'settings-title', text: S.heading }),
    el('label', { class: 'setting-row switch-row', for: 'set-sound' }, el('span', { text: S.sound }), toggle),
    el('label', { class: 'setting-row', for: 'set-bgm' }, el('span', { text: S.bgmVolume }), bgm),
    el('label', { class: 'setting-row', for: 'set-sfx' }, el('span', { text: S.sfxVolume }), sfx),
    el('p', { class: 'hint', text: S.hint }),
    el('button', { type: 'submit', class: 'btn btn-big' }, S.close),
  ));
  // 枠の外をタップしたら閉じる
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

function openSettings() {
  const dialog = document.getElementById('settings');
  dialog._sync?.();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}
