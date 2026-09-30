// ステージ1：システム分解パズル
// 部品をタップして順番に並べ、「配信スタート」で信号を流す。
// 欠けていたり順番が違ったりすると、そこで信号が止まり、アバターは動かない。
// 全部つながってアバターが動いたら、「部品を1つ外してみよう」。どれを外しても配信事故で止まる。
// データは data/system.json（parts は正しい順に書く）。

// アバター：アイドル衣装の女の子。スカートは逆さにしたゆりの花（名古屋文理大学の校章のゆりをモチーフに）
// 顔は点の目・小さな口・ほっぺだけのシンプルな顔
const AVATAR_SVG = `
<svg class="s1-avatar" viewBox="0 0 120 160" role="img" aria-hidden="true">
  <g class="av-body">
    <g class="av-leg av-leg-l"><rect class="av-skin" x="52" y="114" width="6" height="26" rx="3" /><rect class="av-boot" x="49" y="136" width="11" height="9" rx="4" /></g>
    <g class="av-leg av-leg-r"><rect class="av-skin" x="62" y="114" width="6" height="26" rx="3" /><rect class="av-boot" x="60" y="136" width="11" height="9" rx="4" /></g>
    <path class="av-petal av-petal-back" d="M54 90 C 42 98, 34 108, 32 120 L 60 112 Z" />
    <path class="av-petal av-petal-back" d="M66 90 C 78 98, 86 108, 88 120 L 60 112 Z" />
    <path class="av-petal" d="M52 88 C 40 96, 30 108, 25 121 C 33 116, 42 118, 49 123 C 49 110, 51 98, 56 90 Z" />
    <path class="av-petal" d="M68 88 C 80 96, 90 108, 95 121 C 87 116, 78 118, 71 123 C 71 110, 69 98, 64 90 Z" />
    <path class="av-petal" d="M50 88 C 45 104, 50 118, 60 127 C 70 118, 75 104, 70 88 Z" />
    <path class="av-vein" d="M60 94 L 60 118 M 44 100 L 34 115 M 76 100 L 86 115" />
    <rect class="av-top" x="48" y="58" width="24" height="32" rx="9" />
    <rect class="av-belt" x="47" y="85" width="26" height="6" rx="3" />
    <g class="av-bow"><path d="M60 64 L 52 59 L 52 69 Z" /><path d="M60 64 L 68 59 L 68 69 Z" /><circle cx="60" cy="64" r="2.4" /></g>
    <g class="av-arm av-arm-l"><path class="av-arm-skin" d="M46 66 L 36 84" /><circle class="av-skin" cx="35" cy="86" r="3.6" /><circle class="av-sleeve" cx="47" cy="63" r="6.5" /></g>
    <g class="av-head"><g transform="translate(60 44) scale(1.18) translate(-60 -44)">
      <path class="av-hair" d="M38 30 C 22 36, 20 62, 29 76 C 34 62, 38 50, 43 42 Z" />
      <path class="av-hair" d="M82 30 C 98 36, 100 62, 91 76 C 86 62, 82 50, 77 42 Z" />
      <circle class="av-hair" cx="60" cy="36" r="24" />
      <ellipse class="av-skin" cx="60" cy="40" rx="20" ry="18" />
      <path class="av-hair" d="M37 38 C 36 16, 84 16, 83 38 C 78 30, 72 30, 68 25 C 64 31, 56 31, 52 25 C 48 30, 42 30, 37 38 Z" />
      <g class="av-ribbon"><path d="M38 30 L 31 25 L 32 35 Z" /><path d="M38 30 L 44 23 L 45 33 Z" /></g>
      <g class="av-ribbon"><path d="M82 30 L 89 25 L 88 35 Z" /><path d="M82 30 L 76 23 L 75 33 Z" /></g>
      <g class="av-lily" transform="translate(63 24) rotate(-16) scale(0.86)">
        <path class="av-clip" d="M-8 0.4 C -6 -2.2, -1.5 -2.4, 2 -0.8 L 2 0.8 C -1.5 2.2, -5.5 2.6, -8 0.4 Z" />
        <path class="av-lily-stem" d="M0 0 L 3 0" />
        <path class="av-lily-petal" d="M2 0 C 6 -1.5, 9 -5, 14 -8.5 C 13 -3, 13 3, 14 8.5 C 9 5, 6 1.5, 2 0 Z" />
        <path class="av-lily-petal" d="M10 -4 C 13 -8, 17 -10, 20.5 -8.5 C 17 -7, 15 -5, 13 -2.5 Z" />
        <path class="av-lily-petal" d="M10 4 C 13 8, 17 10, 20.5 8.5 C 17 7, 15 5, 13 2.5 Z" />
        <path class="av-lily-petal" d="M11 0 C 14 -1.6, 18 -1.3, 21.5 0 C 18 1.3, 14 1.6, 11 0 Z" />
        <path class="av-lily-stamen" d="M6 0 L 18.5 -3.5 M 6 0 L 19.5 0.6 M 6 0 L 17.5 4" />
        <circle class="av-lily-pollen" cx="18.5" cy="-3.5" r="1" /><circle class="av-lily-pollen" cx="19.5" cy="0.6" r="1" /><circle class="av-lily-pollen" cx="17.5" cy="4" r="1" />
      </g>
      <ellipse class="av-eye" cx="52.5" cy="42" rx="2.4" ry="3.1" />
      <ellipse class="av-eye" cx="67.5" cy="42" rx="2.4" ry="3.1" />
      <circle class="av-eye-hi" cx="53.3" cy="40.8" r="0.9" />
      <circle class="av-eye-hi" cx="68.3" cy="40.8" r="0.9" />
      <ellipse class="av-blush" cx="46.5" cy="47.5" rx="3.6" ry="2" />
      <ellipse class="av-blush" cx="73.5" cy="47.5" rx="3.6" ry="2" />
      <path class="av-mouth" d="M58 48.5 Q 60 51 62 48.5" />
    </g></g>
    <g class="av-arm av-arm-r">
      <path class="av-arm-skin" d="M74 66 L 84 84" />
      <path class="av-mic-handle" d="M85 87 L 90 73" /><circle class="av-mic" cx="91" cy="69" r="5.5" /><path class="av-mic-line" d="M87.5 67 L 94.5 71 M 88 70.5 L 93 73" />
      <circle class="av-skin" cx="85" cy="86" r="3.6" /><circle class="av-sleeve" cx="73" cy="63" r="6.5" />
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
    ctx.markCleared({ mistakes }); // 全部品が正しくつながった＝クリア条件。この後の「1つ外す」は体験

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
