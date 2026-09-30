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
// 公開時に GitHub Actions が ?v=（コミットID）を付ける。古いファイルがブラウザに残らないよう、後から読むファイルにも付ける
const BUILD = new URL(import.meta.url).searchParams.get('v');
const withBuild = (path) => (BUILD && BUILD !== '__BUILD__' ? `${path}?v=${BUILD}` : path);

// タイトルのピタゴラ装置（飾りの絵。文言は ui.json）
const PYTHAGORA_SVG = `
<svg class="pz" viewBox="0 0 300 124" aria-hidden="true">
  <line class="pz-track" x1="2" y1="26" x2="104" y2="112" />
  <line class="pz-track" x1="104" y1="112" x2="298" y2="112" />
  <circle class="pz-ball" cx="14" cy="20" r="8" />
  ${[0, 1, 2, 3, 4].map((i) => `<rect class="pz-domino" style="--i:${i}" x="${130 + i * 20}" y="78" width="7" height="34" rx="1.5" />`).join('')}
  <rect class="pz-switch" x="234" y="106" width="16" height="6" rx="1" />
  <line class="pz-lever" x1="242" y1="106" x2="236" y2="94" />
  <polyline class="pz-wire" points="250,109 272,109 272,70" />
  <g class="pz-lamp">
    <g class="pz-rays">
      <line x1="272" y1="16" x2="272" y2="8" /><line x1="254" y1="28" x2="248" y2="22" /><line x1="290" y1="28" x2="296" y2="22" />
      <line x1="253" y1="46" x2="245" y2="46" /><line x1="291" y1="46" x2="299" y2="46" />
    </g>
    <circle class="pz-bulb" cx="272" cy="46" r="15" />
    <rect class="pz-base" x="265" y="60" width="14" height="10" rx="2" />
  </g>
</svg>`;

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

  // ピタゴラ装置：玉 → ドミノ → スイッチ → ランプ → タイトルが点灯。タップでもう一度
  const art = el('button', { type: 'button', class: 'pz-btn', 'aria-label': T.replayArt, 'data-sfx': 'connect' });
  art.innerHTML = PYTHAGORA_SVG;
  const title = el('h1', { class: 'game-title', text: T.heading });
  const play = () => {
    for (const n of [art, title]) {
      n.classList.remove('is-playing');
      void n.offsetWidth; // アニメーションを最初からやり直す
      n.classList.add('is-playing');
    }
  };
  art.addEventListener('click', play);
  play();

  const screen = el('section', { class: 'screen title-screen' },
    art,
    title,
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
    mod = await import(withBuild(`./stages/${STAGE_FILES[n - 1]}`));
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
    /**
     * クリア条件を満たした瞬間に呼ぶ（演出の途中で画面を離れても、クリアと次のステージの解放を記録するため）。
     * ランク表示などの演出は、そのあと complete() で行う。
     */
    markCleared(result = {}) {
      if (token !== renderToken) return;
      recordClear(n, result);
    },
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

/** クリアを記録して（次のステージが解放される）、ランクを返す */
function recordClear(n, result = {}) {
  const mistakes = Number.isFinite(result.mistakes) ? result.mistakes : 0;
  const rank = result.rank ?? rankFor(mistakes);
  progress.cleared[n - 1] = true;
  progress.ranks[n - 1] = betterRank(progress.ranks[n - 1], rank);
  saveProgress();
  return rank;
}

async function finishStage(n, result, token) {
  const C = ui.clear;
  const rank = recordClear(n, result);
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
  const points = { S: 3, A: 2, B: 1, C: 1 };
  const score = progress.ranks.reduce((sum, r) => sum + (points[r] ?? 0), 0);
  const tier = (E.honors ?? []).find((h) => score >= h.min);
  const honor = el('p', { class: 'honor', text: tier?.title ?? E.honor });
  const ranks = el('ul', { class: 'ending-ranks', 'aria-label': E.ranksLabel },
    ui.stages.map((s, i) => {
      const r = progress.ranks[i];
      return el('li', {}, fmt(ui.map.stageLabel, { n: i + 1 }), r ? el('span', { class: `rank-chip rank-${r}`, text: r }) : '-');
    }));
  const linkItems = (links?.links ?? []).map((l) =>
    el('li', {},
      el('a', { class: 'link-card', href: l.url, target: '_blank', rel: 'noopener', 'data-sfx': 'tap' },
        el('span', { class: 'link-label', text: l.label }),
        l.note ? el('span', { class: 'link-note', text: l.note }) : null)));

  const screen = el('section', { class: 'screen ending-screen' },
    el('h1', { class: 'ending-title', text: E.heading }),
    el('p', { class: 'honor-label', text: E.honorLabel }),
    honor,
    ranks,
    el('p', { class: 'ending-message', text: E.message }),
    E.extra ? renderEndingExtra(E.extra) : null,
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

/** エンディングのおまけ：漢字もシステム？（明＝日＋月、ビャンビャン麺） */
function renderEndingExtra(X) {
  const ok = canDrawGlyph(X.biangChar);
  return el('section', { class: 'ending-extra' },
    el('h2', { class: 'section-title', text: X.heading }),
    el('p', { text: X.mei }),
    el('div', { class: 'biang' },
      el('span', { class: `biang-char${ok ? '' : ' is-missing'}`, 'aria-hidden': 'true', text: ok ? X.biangChar : '□' }),
      el('div', {},
        el('p', { class: 'biang-label', text: X.biangLabel }),
        el('p', { text: X.biang }))),
    ok ? null : el('p', { class: 'biang-missing', text: X.biangMissing }));
}

/**
 * その文字を描けるフォントが端末にあるか。
 * 描けない文字は、同じブロックの別の文字と同じ「豆腐（□）」になるので、絵を比べて判定する。
 */
function canDrawGlyph(ch) {
  try {
    const size = 40;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true });
    const draw = (t) => {
      g.clearRect(0, 0, size, size);
      g.font = `${size * 0.8}px sans-serif`;
      g.textBaseline = 'top';
      g.fillStyle = '#000';
      g.fillText(t, 0, 0);
      return g.getImageData(0, 0, size, size).data;
    };
    const a = draw(ch);
    if (!a.some((v, i) => i % 4 === 3 && v > 0)) return false; // 何も描かれていない
    // 同じ CJK 拡張G ブロックの先頭の文字と、どのフォントにもない文字（U+10FFFD）の「豆腐」と比べる
    const same = (b) => a.every((v, i) => v === b[i]);
    return !same(draw('\u{30000}')) && !same(draw('\u{10FFFD}'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- デバッグ画面

async function showDebug(token) {
  const { renderDebug } = await import(withBuild('./debug.js'));
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
