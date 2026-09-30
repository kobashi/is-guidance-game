// ステージ1：システム分解パズル
// 部品をタップして順番に並べ、「配信スタート」で信号を流す。
// 欠けていたり順番が違ったりすると、そこで信号が止まり、アバターは動かない。
// 全部つながってアバターが動いたら、「部品を1つ外してみよう」。どれを外しても配信事故で止まる。
// データは data/system.json（parts は正しい順に書く）。

// アバター：ゆりの花をモチーフにしたキャラクター（6枚の花びらの頭、つぼみの体、葉っぱの腕）
const AVATAR_SVG = `
<svg class="s1-avatar" viewBox="0 0 120 160" role="img" aria-hidden="true">
  <g class="av-body">
    <g class="av-leg av-leg-l"><rect class="av-stem" x="48" y="114" width="6" height="28" rx="3" /><ellipse class="av-foot" cx="49" cy="144" rx="9" ry="5" /></g>
    <g class="av-leg av-leg-r"><rect class="av-stem" x="66" y="114" width="6" height="28" rx="3" /><ellipse class="av-foot" cx="71" cy="144" rx="9" ry="5" /></g>
    <path class="av-torso" d="M60 66 C 42 76, 40 110, 60 122 C 80 110, 78 76, 60 66 Z" />
    <path class="av-torso-line" d="M60 76 L 60 112" />
    <g class="av-arm av-arm-l"><path class="av-leaf" d="M57 86 C 46 76, 30 80, 22 94 C 36 100, 50 98, 57 86 Z" /></g>
    <g class="av-arm av-arm-r"><path class="av-leaf" d="M63 86 C 74 76, 90 80, 98 94 C 84 100, 70 98, 63 86 Z" /></g>
    <g class="av-head">
      ${[0, 1, 2, 3, 4, 5].map((k) => `<ellipse class="av-petal" cx="60" cy="26" rx="10.5" ry="17" transform="rotate(${k * 60 + 30} 60 44)" />`).join('')}
      <g class="av-stamen">
        <path d="M55 32 Q 48 18 44 6" /><path d="M60 30 L 60 1" /><path d="M65 32 Q 72 18 76 6" />
        <circle cx="44" cy="5" r="3.2" /><circle cx="60" cy="0" r="3.2" /><circle cx="76" cy="5" r="3.2" />
      </g>
      <circle class="av-face" cx="60" cy="46" r="16.5" />
      <ellipse class="av-eye" cx="54" cy="44.5" rx="2.6" ry="3.5" />
      <ellipse class="av-eye" cx="66" cy="44.5" rx="2.6" ry="3.5" />
      <ellipse class="av-blush" cx="48.5" cy="51" rx="3.6" ry="2.1" />
      <ellipse class="av-blush" cx="71.5" cy="51" rx="3.6" ry="2.1" />
      <path class="av-mouth" d="M56 51.5 Q 60 56 64 51.5" />
    </g>
  </g>
</svg>`;

function shuffled(n) {
  const a = [...Array(n).keys()];
  do {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  } while (n > 1 && a.every((v, i) => v === i)); // 最初から正解の並びにはしない
  return a;
}

export async function mount(root, ctx) {
  const { el, fmt, audio, fx } = ctx;
  const data = await ctx.loadJSON('data/system.json');
  if (!ctx.isActive()) return;

  const parts = data.parts;
  const N = parts.length;
  const slots = Array(N).fill(null); // slots[i] = 置いた部品の番号（parts の添字）
  let mistakes = 0;
  let running = false;
  let solved = false;
  let breakable = false; // クリア後の「部品を1つ外してみよう」の間だけ true
  let alive = true;
  const timers = new Set();
  const wait = (ms) => new Promise((resolve) => {
    const id = setTimeout(() => { timers.delete(id); resolve(); }, ms);
    timers.add(id);
  });

  // ---- アバターを映すスクリーン
  const avatarBox = el('div', { class: 's1-avatar-box' });
  avatarBox.innerHTML = AVATAR_SVG;
  const status = el('p', { class: 's1-status', text: data.avatarIdle });
  const screen = el('div', { class: 's1-screen' }, avatarBox, status);

  // ---- 部品置き場
  const trayBtns = parts.map((p, pi) => el('button', { type: 'button', class: 's1-part', onclick: () => place(pi) },
    el('span', { class: 's1-icon', 'aria-hidden': 'true', text: p.icon }),
    el('span', { class: 's1-part-text' },
      el('span', { class: 's1-part-label', text: p.label }),
      el('span', { class: 's1-part-desc', text: p.desc }))));
  const tray = el('div', { class: 's1-tray-wrap' },
    el('h2', { class: 's1-heading', text: data.trayHeading }),
    el('div', { class: 's1-tray' }, shuffled(N).map((pi) => trayBtns[pi])));

  // ---- 信号の通り道
  const slotBtns = slots.map((_, i) => el('button', { type: 'button', class: 's1-slot', onclick: () => removeAt(i) }));
  const startEnd = el('li', { class: 's1-end' }, `▶ ${data.startLabel}`);
  const goalEnd = el('li', { class: 's1-end s1-goal' }, `🎬 ${data.goalLabel}`);
  const chain = el('ol', { class: 's1-chain' }, startEnd, slotBtns.map((b) => el('li', { class: 's1-link' }, b)), goalEnd);

  const message = el('p', { class: 's1-message', role: 'status', 'aria-live': 'polite' });
  const runBtn = el('button', { type: 'button', class: 'btn btn-big s1-run', 'data-sfx': 'none', onclick: run }, data.run);
  const resetBtn = el('button', { type: 'button', class: 'btn btn-ghost', onclick: resetAll }, data.reset);
  const controls = el('div', { class: 'actions' }, message, runBtn, resetBtn);
  let panel = null; // クリア後のメッセージ欄

  root.append(screen, el('p', { class: 's1-intro', text: data.intro }), tray, chain, controls);
  render();

  // ---- 操作

  function place(pi) {
    if (running || solved || slots.includes(pi)) return;
    const i = slots.indexOf(null);
    if (i < 0) return;
    slots[i] = pi;
    clearMarks();
    render();
    fx.pop(slotBtns[i]);
  }

  function removeAt(i) {
    if (breakable && slots[i] != null) {
      breakAt(i);
      return;
    }
    if (running || solved || slots[i] == null) return;
    slots[i] = null;
    clearMarks();
    render();
  }

  function resetAll() {
    if (running || solved) return;
    slots.fill(null);
    clearMarks();
    render();
  }

  function clearMarks() {
    for (const b of slotBtns) b.classList.remove('is-on', 'is-stop');
    startEnd.classList.remove('is-on');
    message.textContent = '';
    message.classList.remove('is-error');
  }

  function render() {
    const busy = running || (solved && !breakable);
    slotBtns.forEach((b, i) => {
      const p = slots[i] == null ? null : parts[slots[i]];
      b.replaceChildren(...[
        el('span', { class: 's1-slot-num', text: fmt(data.slotLabel, { n: i + 1 }) }),
        p && el('span', { class: 's1-icon', 'aria-hidden': 'true', text: p.icon }),
        el('span', { class: 's1-slot-label', text: p ? p.label : data.slotEmpty }),
      ].filter(Boolean));
      b.classList.toggle('is-filled', !!p);
      b.disabled = busy || !p;
      b.setAttribute('aria-label', `${fmt(data.slotLabel, { n: i + 1 })}：${p ? `${p.label}（${data.slotRemove}）` : data.slotEmpty}`);
    });
    trayBtns.forEach((b, pi) => {
      const used = slots.includes(pi);
      b.classList.toggle('is-used', used);
      b.disabled = running || solved || used;
    });
    runBtn.disabled = running || solved || slots.every((s) => s == null);
    resetBtn.disabled = running || solved || slots.every((s) => s == null);
    chain.classList.toggle('is-breakable', breakable);
    if (!solved) audio.setIntensity(slots.every((s) => s != null) ? 1 : 0);
  }

  async function run() {
    if (running || solved) return;
    running = true;
    clearMarks();
    render();
    message.textContent = data.running;
    audio.play('tap');
    startEnd.classList.add('is-on');

    for (let i = 0; i < N; i++) {
      await wait(380);
      if (!alive) return;
      if (slots[i] === i) {
        slotBtns[i].classList.add('is-on');
        audio.play('connect');
        fx.burst(slotBtns[i], { count: 8 });
        continue;
      }
      // ここで信号が止まる
      mistakes += 1;
      slotBtns[i].classList.add('is-stop');
      slotBtns[i].scrollIntoView({ block: 'nearest', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
      audio.play('wrong');
      fx.shake();
      fx.floatText('✖', slotBtns[i], { className: 'fx-float-ng' });
      message.textContent = slots[i] == null
        ? fmt(data.stoppedEmpty, { n: i + 1 })
        : fmt(data.stoppedWrong, { n: i + 1, part: parts[slots[i]].label });
      message.classList.add('is-error');
      running = false;
      render();
      return;
    }

    await wait(380);
    if (!alive) return;
    succeed();
  }

  function succeed() {
    solved = true;
    running = false;
    goalEnd.classList.add('is-on');
    screen.classList.add('is-live');
    status.textContent = data.success.status;
    message.textContent = '';
    audio.play('correct');
    audio.setIntensity(2);
    fx.celebrate('correct', screen);
    fx.confetti({ y: 0.25, count: 70 });

    // 次は「部品を1つ外してみよう」：どれを外しても全体が止まることを体験させる
    const S = data.success;
    const headline = el('p', { class: 's1-headline', text: S.headline });
    panel = el('div', { class: 's1-success', role: 'status' }, headline, el('p', { class: 's1-try', text: S.tryBreak }));
    tray.replaceWith(panel);
    controls.hidden = true;
    breakable = true;
    render();
    fx.slam(headline);
    panel.scrollIntoView({ block: 'nearest', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
  }

  function breakAt(i) {
    const S = data.success;
    breakable = false;
    slots[i] = null;
    render();
    // 外した部品より先には信号が届かない
    slotBtns.forEach((b, j) => { if (j >= i) b.classList.remove('is-on'); });
    slotBtns[i].classList.add('is-stop');
    goalEnd.classList.remove('is-on');
    screen.classList.remove('is-live');
    screen.classList.add('is-broken');
    status.textContent = S.brokenStatus;
    audio.setIntensity(0);
    audio.play('wrong');
    fx.shake(undefined, { big: true });
    fx.floatText('✖', slotBtns[i], { className: 'fx-float-ng' });

    const headline = el('p', { class: 's1-headline is-broken', text: S.brokenHeadline });
    const next = el('button', { type: 'button', class: 'btn btn-big', 'data-sfx': 'none', onclick: () => ctx.complete({ mistakes }) }, S.next);
    panel.classList.add('is-broken');
    panel.replaceChildren(headline, el('p', { text: S.message }), next);
    fx.pop(headline);
    panel.scrollIntoView({ block: 'nearest', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
  }

  return () => {
    alive = false;
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
