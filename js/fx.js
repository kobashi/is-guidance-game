// fx.js — パーティクル・揺れ・文字のバウンド・コンボ表示・ランク表示などの画面効果
//
// 使い方（各ステージから）：
//   fx.celebrate('correct', element)   正解（要素のまわりに星＋小さな紙吹雪）
//   fx.combo(3)                        「3 COMBO!」を大きく表示
//   fx.shake()                         画面を揺らす
//   fx.pop(element)                    文字や部品を拡大バウンドさせる
//   fx.burst(element)                  要素から星を飛ばす
//   fx.floatText('+1', element)        要素の上に文字を浮かべる
//
// prefers-reduced-motion が有効なら、揺れは行わず、パーティクルは大幅に減らす。
// 画面全体の明滅（flash）は 1 秒間に 3 回を超えないよう間引く（光過敏への配慮）。

import { el } from './dom.js';

const COLORS = ['#ff4d6d', '#ffd23f', '#3bceac', '#4d96ff', '#b15eff', '#ff8c42'];
const FLASH_MIN_INTERVAL = 400; // ms（= 最大 2.5 回/秒）

let canvas = null;
let g = null;
let layer = null;
let particles = [];
let raf = 0;
let lastFrame = 0;
let lastFlash = -Infinity;
const timers = new Set();
const overlays = new Set();
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function reducedMotion() {
  return !!mq?.matches;
}

export function init() {
  if (canvas) return;
  canvas = el('canvas', { class: 'fx-canvas', 'aria-hidden': 'true' });
  layer = el('div', { class: 'fx-layer', 'aria-hidden': 'true' });
  document.body.append(canvas, layer);
  resize();
  addEventListener('resize', resize);
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
}

/** 画面遷移のときに呼ぶ：演出をすべて止める */
export function clearAll() {
  particles = [];
  for (const id of timers) clearTimeout(id);
  timers.clear();
  layer?.replaceChildren();
  for (const o of [...overlays]) o.close();
  g?.clearRect(0, 0, innerWidth, innerHeight);
}

// ---------------------------------------------------------------- パーティクル

function center(target) {
  if (!target) return { x: innerWidth / 2, y: innerHeight / 2 };
  if (typeof target.getBoundingClientRect === 'function') {
    const r = target.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: target.x ?? innerWidth / 2, y: target.y ?? innerHeight / 2 };
}

function scaled(n) {
  return Math.max(1, Math.round(n * (reducedMotion() ? 0.15 : 1)));
}

function spawn(x, y, vx, vy, kind, size) {
  const shape = kind === 'mix' ? (Math.random() < 0.3 ? 'star' : 'rect') : kind;
  particles.push({
    x, y, vx, vy, shape,
    size: size ?? 6 + Math.random() * 6,
    color: COLORS[(Math.random() * COLORS.length) | 0],
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.3,
    life: 0,
    max: 110 + Math.random() * 70,
  });
}

/**
 * 紙吹雪を打ち上げる。
 * x, y は画面に対する割合（0〜1）。angle は打ち出す向き（度、0 = 真上）。
 */
export function confetti({ x = 0.5, y = 0.35, count = 80, spread = 70, angle = 0, power = 1, kind = 'mix' } = {}) {
  if (!g) return;
  const cx = x * innerWidth;
  const cy = y * innerHeight;
  for (let i = 0, n = scaled(count); i < n; i++) {
    const a = ((angle + (Math.random() - 0.5) * spread * 2) * Math.PI) / 180;
    const sp = (6 + Math.random() * 9) * power;
    spawn(cx, cy, Math.sin(a) * sp, -Math.cos(a) * sp, kind);
  }
  loop();
}

/** 画面上から紙吹雪を降らせる */
export function rain({ count = 120, kind = 'mix' } = {}) {
  if (!g) return;
  for (let i = 0, n = scaled(count); i < n; i++) {
    spawn(Math.random() * innerWidth, -20 - Math.random() * innerHeight * 0.6,
      (Math.random() - 0.5) * 2, Math.random() * 2, kind);
  }
  loop();
}

/** 要素（または {x, y} の画面座標）から星を飛ばす */
export function burst(target, { count = 18, kind = 'star', power = 1 } = {}) {
  if (!g) return;
  const { x, y } = center(target);
  for (let i = 0, n = scaled(count); i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (2 + Math.random() * 5) * power;
    spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 2, kind, 5 + Math.random() * 7);
  }
  loop();
}

function loop() {
  if (raf) return;
  lastFrame = performance.now();
  raf = requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min((now - lastFrame) / 16.67, 3);
  lastFrame = now;
  g.clearRect(0, 0, innerWidth, innerHeight);
  const h = innerHeight;
  particles = particles.filter((p) => {
    p.vy += 0.28 * dt;
    p.vx *= Math.pow(0.985, dt);
    p.vy *= Math.pow(0.985, dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.life += dt;
    if (p.life > p.max || p.y > h + 40) return false;
    g.globalAlpha = Math.min(1, (p.max - p.life) / 30);
    g.fillStyle = p.color;
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    if (p.shape === 'star') drawStar(p.size);
    else g.fillRect(-p.size / 2, (-p.size / 4) * Math.abs(Math.cos(p.rot * 2)), p.size, (p.size / 2) * Math.abs(Math.cos(p.rot * 2)) + 1);
    g.restore();
    return true;
  });
  g.globalAlpha = 1;
  raf = particles.length ? requestAnimationFrame(frame) : 0;
  if (!raf) g.clearRect(0, 0, innerWidth, innerHeight);
}

function drawStar(r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
}

// ---------------------------------------------------------------- CSS アニメーション

function restartClass(target, cls) {
  if (!target) return;
  target.classList.remove(cls);
  void target.offsetWidth; // アニメーションを最初からやり直す
  target.classList.add(cls);
  target.addEventListener('animationend', () => target.classList.remove(cls), { once: true });
}

/** 画面を揺らす（reduced-motion のときは何もしない） */
export function shake(target = document.getElementById('app'), { big = false } = {}) {
  if (reducedMotion()) return;
  restartClass(target, big ? 'fx-shake-big' : 'fx-shake');
}

/** 文字や部品を拡大バウンドさせる */
export function pop(target) {
  restartClass(target, 'fx-pop');
}

/** 画面全体を一瞬明るくする（1 秒間に 3 回を超えないよう間引く） */
export function flash(color = '#fff') {
  const now = performance.now();
  if (!layer || now - lastFlash < FLASH_MIN_INTERVAL) return;
  lastFlash = now;
  const f = el('div', { class: 'fx-flash' });
  f.style.background = color;
  removeAfterAnimation(f, 600);
  layer.append(f);
}

function removeAfterAnimation(node, fallbackMs) {
  node.addEventListener('animationend', () => node.remove(), { once: true });
  later(() => node.remove(), fallbackMs);
}

/** 要素の上に文字を浮かべる（「+1」「ミス！」など） */
export function floatText(text, target, { className = '' } = {}) {
  if (!layer) return;
  const { x, y } = center(target);
  const n = el('div', { class: `fx-float ${className}`.trim(), text });
  n.style.left = `${x}px`;
  n.style.top = `${y}px`;
  removeAfterAnimation(n, 1500);
  layer.append(n);
}

/** 「n COMBO!」を大きく表示する（2 以上のとき） */
export function combo(n) {
  if (!layer || n < 2) return;
  layer.querySelectorAll('.fx-combo').forEach((c) => c.remove());
  const c = el('div', { class: 'fx-combo' }, el('span', { class: 'fx-combo-num', text: String(n) }), el('span', { class: 'fx-combo-label', text: 'COMBO!' }));
  c.style.setProperty('--combo-scale', String(Math.min(1 + (n - 2) * 0.12, 1.8)));
  removeAfterAnimation(c, 1600);
  layer.append(c);
}

/** 称号などを「ドーン」と出す */
export function slam(target) {
  restartClass(target, 'fx-slam');
  later(() => {
    shake(undefined, { big: true });
    burst(target, { count: 30 });
  }, 450);
}

// ---------------------------------------------------------------- まとめた演出

/**
 * よく使う演出の組み合わせ。
 *   'correct' : 正解（target のまわりに星）
 *   'clear'   : ステージクリア
 *   'ending'  : エンディング（最も派手）
 */
export function celebrate(kind = 'correct', target) {
  switch (kind) {
    case 'correct':
      burst(target, { count: 20 });
      if (target) pop(target);
      break;
    case 'clear':
      flash('#fff8d0');
      confetti({ x: 0.1, y: 0.9, angle: 25, spread: 25, count: 70, power: 1.4 });
      confetti({ x: 0.9, y: 0.9, angle: -25, spread: 25, count: 70, power: 1.4 });
      shake();
      break;
    case 'ending':
      flash('#fff8d0');
      rain({ count: 160 });
      for (let i = 0; i < 5; i++) {
        later(() => confetti({ x: 0.15 + Math.random() * 0.7, y: 0.5 + Math.random() * 0.3, count: 60, power: 1.3 }), 500 + i * 700);
      }
      later(() => rain({ count: 120 }), 2500);
      break;
    default:
      burst(target);
  }
}

/**
 * クリア時のランク表示。ボタンが押されたら resolve する Promise を返す。
 * 演出中に画面をタップすると、演出を飛ばして最後の状態を表示する。
 *   showRank({ heading, rankLabel, rank: 'S', lines: ['ミス 0 回'], button: '次へ', skipHint })
 */
export function showRank({ heading = 'STAGE CLEAR!', rankLabel = 'RANK', rank = 'A', lines = [], button = 'OK', skipHint = '' } = {}) {
  return new Promise((resolve) => {
    const btn = el('button', { type: 'button', class: 'btn btn-big fx-rank-next' }, button);
    const card = el('div', { class: 'fx-rank-card' },
      el('p', { class: 'fx-rank-heading', id: 'fx-rank-heading', text: heading }),
      el('p', { class: 'fx-rank-label', text: rankLabel }),
      el('p', { class: `fx-rank-letter rank-${rank}`, text: rank }),
      lines.length ? el('ul', { class: 'fx-rank-lines' }, lines.map((l) => el('li', { text: l }))) : null,
      btn,
      skipHint ? el('p', { class: 'fx-rank-skip', text: skipHint }) : null,
    );
    const o = el('div', { class: 'fx-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fx-rank-heading' }, card);
    const handle = {
      close() {
        overlays.delete(handle);
        o.remove();
        resolve();
      },
    };
    overlays.add(handle);
    o.addEventListener('click', (e) => {
      if (e.target.closest('.fx-rank-next')) handle.close();
      else o.classList.add('is-skipped');
    });
    later(() => o.classList.add('is-skipped'), 2400); // 演出が終わったらスキップ表示を消す
    document.body.append(o);
    btn.focus({ preventScroll: true });
    later(() => burst(card.querySelector('.fx-rank-letter'), { count: 26, power: 1.3 }), 650);
  });
}
