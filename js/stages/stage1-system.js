// ステージ1：システム分解パズル
// 部品をタップして順番に並べ、「電源オン」で信号を流す。
// 欠けていたり順番が違ったりすると、そこで信号が止まり、アバターは動かない。
// データは data/system.json（parts は正しい順に書く）。

const AVATAR_SVG = `
<svg class="s1-avatar" viewBox="0 0 120 160" role="img" aria-hidden="true">
  <g class="av-body">
    <g class="av-leg av-leg-l"><line x1="60" y1="96" x2="44" y2="142"/><circle class="av-sensor" cx="44" cy="142" r="4"/></g>
    <g class="av-leg av-leg-r"><line x1="60" y1="96" x2="76" y2="142"/><circle class="av-sensor" cx="76" cy="142" r="4"/></g>
    <line x1="60" y1="46" x2="60" y2="96"/>
    <circle class="av-sensor" cx="60" cy="96" r="4"/>
    <g class="av-arm av-arm-l"><line x1="60" y1="58" x2="34" y2="86"/><circle class="av-sensor" cx="34" cy="86" r="4"/></g>
    <g class="av-arm av-arm-r"><line x1="60" y1="58" x2="86" y2="86"/><circle class="av-sensor" cx="86" cy="86" r="4"/></g>
    <g class="av-head"><circle cx="60" cy="30" r="15"/><circle class="av-sensor" cx="60" cy="15" r="4"/></g>
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
    const busy = running || solved;
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
      b.disabled = busy || used;
    });
    runBtn.disabled = busy || slots.every((s) => s == null);
    resetBtn.disabled = busy || slots.every((s) => s == null);
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
    render();
    goalEnd.classList.add('is-on');
    screen.classList.add('is-live');
    status.textContent = data.success.status;
    message.textContent = '';
    audio.play('correct');
    audio.setIntensity(2);
    fx.celebrate('correct', screen);
    fx.confetti({ y: 0.25, count: 70 });

    const S = data.success;
    const kanji = el('p', { class: 's1-kanji', text: S.kanji });
    const next = el('button', { type: 'button', class: 'btn btn-big', 'data-sfx': 'none', onclick: () => ctx.complete({ mistakes }) }, S.next);
    const panel = el('div', { class: 's1-success', role: 'status' }, kanji, el('p', { text: S.message }), next);
    tray.replaceWith(panel);
    controls.hidden = true;
    fx.slam(kanji);
    panel.scrollIntoView({ block: 'nearest', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
  }

  return () => {
    alive = false;
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}
