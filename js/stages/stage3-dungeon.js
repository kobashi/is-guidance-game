// ステージ3：履修ダンジョン
// 1〜4年次を部屋に見立て、科目カードを選んで進む。選んだ科目でスキルが伸びる。
// その年の必修を取っていないと扉が開かない。前提科目を取っていない科目は選べない。
// 4年次の卒業の扉を抜けたら、伸びたスキルから進路・卒業研究の例を表示してクリア。
// データは data/curriculum.json。

export async function mount(root, ctx) {
  const { el, fmt, audio, fx } = ctx;
  const data = await ctx.loadJSON('data/curriculum.json');
  if (!ctx.isActive()) return;

  const U = data.ui;
  const subjects = data.subjects;
  const byId = Object.fromEntries(subjects.map((s) => [s.id, s]));
  const skills = data.skills;
  const lastYear = Math.max(...data.years.map((y) => y.year));
  const maxPicks = Object.fromEntries(data.years.map((y) => [y.year, y.maxPicks]));
  // スキルバーの長さの基準（全科目を取ったときの値）
  const skillMax = Object.fromEntries(skills.map((k) => [k.id, subjects.reduce((sum, s) => sum + (s.skills[k.id] ?? 0), 0) || 1]));

  const selected = new Set();
  let year = 1;
  let mistakes = 0;

  const isRequired = (s) => s.kind !== 'elective';
  const before = (a, b) => a.year < b.year || (a.year === b.year && a.term === '前' && b.term === '後');
  const unmetPrereqs = (s) => s.prereq.map((id) => byId[id]).filter((p) => p && !(selected.has(p.id) && before(p, s)));
  const picksIn = (y) => subjects.filter((s) => s.year === y && selected.has(s.id)).length;

  function skillTotals() {
    const t = Object.fromEntries(skills.map((k) => [k.id, 0]));
    for (const id of selected) {
      for (const [k, v] of Object.entries(byId[id].skills)) t[k] = (t[k] ?? 0) + v;
    }
    return t;
  }

  // ---- 画面の枠（スキル表示は部屋が変わっても残す）
  const skillBars = {};
  const skillPanel = el('div', { class: 's3-skills', 'aria-label': U.skillsHeading },
    skills.map((k) => {
      const fill = el('span', { class: 's3-bar-fill' });
      const num = el('span', { class: 's3-skill-num', text: '0' });
      const row = el('div', { class: 's3-skill' },
        el('span', { class: 's3-skill-label' }, el('span', { 'aria-hidden': 'true', text: k.icon }), ` ${k.label}`),
        el('span', { class: 's3-bar' }, fill), num);
      skillBars[k.id] = { row, fill, num };
      return row;
    }));
  const room = el('div', { class: 's3-room' });
  root.append(el('p', { class: 's3-intro', text: U.intro }), skillPanel, room);

  updateSkills(false);
  renderRoom();

  function updateSkills(animate = true) {
    const t = skillTotals();
    for (const k of skills) {
      const bar = skillBars[k.id];
      const prev = Number(bar.num.textContent);
      bar.num.textContent = String(t[k.id]);
      bar.fill.style.width = `${Math.min(100, (t[k.id] / skillMax[k.id]) * 100)}%`;
      if (animate && t[k.id] > prev) fx.pop(bar.row);
    }
  }

  // ---- 部屋

  function renderRoom(message = null) {
    audio.setIntensity(year >= 3 ? 1 : 0);
    const list = subjects.filter((s) => s.year === year);
    const max = maxPicks[year] ?? list.length;
    const count = picksIn(year);
    const msg = el('div', { class: 's3-message', role: 'status', 'aria-live': 'polite' });
    if (message) msg.append(message);

    const cards = (term) => list.filter((s) => s.term === term).map((s) => card(s, msg));
    const doorBtn = el('button', { type: 'button', class: 'btn btn-big s3-door', 'data-sfx': 'none', onclick: () => openDoor(doorBtn, msg) },
      year < lastYear ? fmt(U.door, { year: year + 1 }) : U.graduate);

    room.replaceChildren(...[
      el('div', { class: 's3-room-head' },
        el('h2', { class: 's3-room-title', text: fmt(U.roomTitle, { year }) }),
        el('span', { class: `s3-picks${count >= max ? ' is-full' : ''}`, text: fmt(U.picks, { n: count, max }) })),
      el('p', { class: 's3-picks-note', text: U.picksNote }),
      ['前', '後'].map((term) => el('section', { class: 's3-term' },
        el('h3', { class: 's3-term-title', text: U.term[term] }),
        el('div', { class: 's3-cards' }, cards(term)))),
      msg,
      doorBtn,
      year > 1 ? el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => moveTo(year - 1) }, fmt(U.back, { year: year - 1 })) : null,
    ].flat().filter(Boolean));
  }

  function card(s, msg) {
    const on = selected.has(s.id);
    const unmet = unmetPrereqs(s);
    const locked = !on && unmet.length > 0;
    const gains = Object.entries(s.skills).map(([k, v]) => {
      const sk = skills.find((x) => x.id === k);
      return sk ? el('span', { class: 's3-gain', text: `${sk.icon}+${v}` }) : null;
    });
    return el('button', {
      type: 'button',
      class: `s3-card kind-${s.kind}${on ? ' is-on' : ''}${locked ? ' is-locked' : ''}`,
      'aria-pressed': String(on),
      'aria-disabled': locked ? 'true' : null,
      'data-sfx': 'none',
      onclick: (e) => toggle(s, e.currentTarget, msg),
    },
    el('span', { class: 's3-card-top' },
      el('span', { class: `s3-kind kind-${s.kind}`, text: U.kind[s.kind] }),
      el('span', { class: 's3-check', 'aria-hidden': 'true', text: on ? '✔' : '' })),
    el('span', { class: 's3-name', text: s.name }),
    locked
      ? el('span', { class: 's3-needs', text: fmt(U.needs, { names: unmet.map((p) => p.name).join('」「') }) })
      : el('span', { class: 's3-gains' }, gains));
  }

  function toggle(s, btn, msg) {
    if (selected.has(s.id)) {
      selected.delete(s.id);
      audio.play('tap');
      const dropped = prune();
      updateSkills();
      renderRoom(dropped.length ? el('p', { text: dropped.map((d) => fmt(U.dropped, { name: d.name })).join('\n') }) : null);
      return;
    }
    const unmet = unmetPrereqs(s);
    if (unmet.length) {
      audio.play('wrong');
      fx.shake(btn);
      msg.replaceChildren(el('p', { class: 's3-warn', text: fmt(U.needs, { names: unmet.map((p) => p.name).join('」「') }) }));
      return;
    }
    const max = maxPicks[year] ?? Infinity;
    if (picksIn(year) >= max) {
      audio.play('wrong');
      fx.shake(btn);
      msg.replaceChildren(el('p', { class: 's3-warn', text: fmt(U.full, { max }) }));
      return;
    }
    selected.add(s.id);
    audio.play('levelup');
    const r = btn.getBoundingClientRect();
    const gainText = Object.entries(s.skills).map(([k, v]) => `${skills.find((x) => x.id === k)?.icon ?? ''}+${v}`).join(' ');
    if (gainText) fx.floatText(gainText, { x: r.left + r.width / 2, y: r.top }, { className: 's3-float' });
    fx.burst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, { count: 10 });
    updateSkills();
    renderRoom();
  }

  /** 前提を満たさなくなった科目を外す（連鎖して外れることもある） */
  function prune() {
    const dropped = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...selected]) {
        if (unmetPrereqs(byId[id]).length) {
          selected.delete(id);
          dropped.push(byId[id]);
          changed = true;
        }
      }
    }
    return dropped;
  }

  function moveTo(y) {
    year = y;
    renderRoom();
    room.scrollIntoView({ block: 'start', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
  }

  function openDoor(doorBtn, msg) {
    const missing = subjects.filter((s) => s.year === year && isRequired(s) && !selected.has(s.id));
    if (missing.length) {
      mistakes += 1;
      audio.play('door', { locked: true });
      fx.shake(doorBtn, { big: true });
      const lines = [el('p', { class: 's3-warn', text: fmt(U.doorLocked, { names: missing.map((s) => s.name).join('」「') }) })];
      // 前の年に取るべきだった前提科目が原因なら、戻る道を示す
      let backTo = null;
      for (const s of missing) {
        for (const p of unmetPrereqs(s)) {
          lines.push(el('p', { text: fmt(U.doorLockedPrereq, { name: s.name, year: p.year, prereq: p.name }) }));
          if (p.year < year) backTo = Math.min(backTo ?? p.year, p.year);
        }
      }
      if (backTo) {
        lines.push(el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => moveTo(backTo) }, fmt(U.goBack, { year: backTo })));
      }
      msg.replaceChildren(...lines);
      msg.scrollIntoView({ block: 'nearest', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    audio.play('door');
    fx.burst(doorBtn, { count: 24 });
    fx.flash('#fff8d0');
    if (year < lastYear) moveTo(year + 1);
    else graduate();
  }

  // ---- 卒業（結果）

  function graduate() {
    ctx.markCleared({ mistakes });
    const R = U.result;
    const t = skillTotals();
    const ranked = skills.filter((k) => t[k.id] > 0).sort((a, b) => t[b.id] - t[a.id]);
    const top = ranked.slice(0, 2);
    const c1 = data.careers[top[0]?.id];
    const typeText = top.length > 1 && data.careers[top[1].id]
      ? `${c1.type} × ${top[1].label}`
      : c1?.type ?? '';

    audio.setIntensity(2);
    audio.play('correct');
    fx.celebrate('correct', skillPanel);
    fx.confetti({ y: 0.3, count: 90 });

    const typeEl = el('p', { class: 's3-type', text: typeText });
    const next = el('button', { type: 'button', class: 'btn btn-big', 'data-sfx': 'none', onclick: () => ctx.complete({ mistakes }) }, R.finish);
    room.replaceChildren(el('div', { class: 's3-result' },
      el('h2', { class: 's3-room-title', text: R.heading }),
      el('p', { class: 's3-result-label', text: R.typeLabel }),
      typeEl,
      el('p', { class: 's3-result-label', text: R.careerLabel }),
      el('ul', { class: 's3-result-list' }, top.map((k) => data.careers[k.id] && el('li', {}, `${k.icon} ${data.careers[k.id].career}`))),
      el('p', { class: 's3-result-label', text: R.researchLabel }),
      el('ul', { class: 's3-result-list' }, top.map((k) => data.careers[k.id] && el('li', {}, `${k.icon} ${data.careers[k.id].research}`))),
      el('p', { class: 'note', text: R.note }),
      next));
    fx.slam(typeEl);
    room.scrollIntoView({ block: 'start', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
  }
}
