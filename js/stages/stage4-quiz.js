// ステージ4：コース選びの落とし穴
// コースの選び方についての短いクイズ。正誤は問わず、全問に答えたらクリア。
// 選んだ答えに一言返し、必ず takeaway（伝えたいこと）を表示する。
// データは data/quiz.json。

export async function mount(root, ctx) {
  const { el, fmt, audio, fx } = ctx;
  const data = await ctx.loadJSON('data/quiz.json');
  if (!ctx.isActive()) return;

  const U = data.ui;
  const qs = data.questions;
  let index = 0;

  const card = el('div', { class: 's4-card' });
  root.append(el('p', { class: 's4-intro', text: U.intro }), card);
  showQuestion();

  function showQuestion() {
    const q = qs[index];
    card.classList.remove('is-answered');
    audio.setIntensity(index === qs.length - 1 ? 1 : 0);
    const result = el('div', { class: 's4-result', role: 'status', 'aria-live': 'polite' });
    const optionBtns = q.options.map((o) => el('button', {
      type: 'button',
      class: 's4-option',
      'data-sfx': 'none',
      onclick: (e) => answer(o, e.currentTarget),
    }, el('span', { class: 's4-option-label', text: o.label }), o.reveal ? el('span', { class: 's4-reveal', text: o.reveal }) : null));

    card.replaceChildren(...[
      el('p', { class: 's4-progress', text: fmt(U.progress, { n: index + 1, total: qs.length }) }),
      el('h2', { class: 's4-question', text: q.question }),
      Array.isArray(q.lead) && q.lead.length
        ? el('ol', { class: 's4-lead' }, q.lead.map((l) => el('li', { text: l })))
        : null,
      el('div', { class: 's4-options' }, optionBtns),
      result,
    ].filter(Boolean));
    fx.pop(card);

    function answer(o, btn) {
      if (card.classList.contains('is-answered')) return;
      card.classList.add('is-answered');
      optionBtns.forEach((b) => { b.disabled = true; });
      btn.classList.add('is-chosen');
      audio.play(o.sfx || 'tap');
      if (o.sfx === 'wrong') fx.shake(btn);
      else fx.burst(btn, { count: 14 });

      const last = index === qs.length - 1;
      const takeaway = el('p', { class: 's4-takeaway', text: q.takeaway });
      result.replaceChildren(
        el('p', { class: 's4-response', text: o.response }),
        takeaway,
        el('button', {
          type: 'button',
          class: 'btn btn-big',
          onclick: () => {
            if (last) {
              showSummary();
              return;
            }
            index += 1;
            showQuestion();
            card.scrollIntoView({ block: 'start', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
          },
        }, last ? U.toSummary : U.next),
      );
      fx.pop(takeaway);
      result.scrollIntoView({ block: 'nearest', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  function showSummary() {
    const S = data.summary;
    audio.setIntensity(2);
    audio.play('levelup');
    const items = S.points.map((p) => el('li', { text: p }));
    card.classList.remove('is-answered');
    card.replaceChildren(
      el('h2', { class: 's4-question', text: S.heading }),
      el('ol', { class: 's4-summary' }, items),
      el('button', { type: 'button', class: 'btn btn-big', 'data-sfx': 'none', onclick: () => ctx.complete() }, U.finish),
    );
    items.forEach((li, i) => setTimeout(() => { if (ctx.isActive()) fx.pop(li); }, 150 * i));
    card.scrollIntoView({ block: 'start', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
  }
}
