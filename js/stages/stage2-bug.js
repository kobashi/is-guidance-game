// ステージ2：バグハンター
// コード片の中からバグのある1行をタップする。不正解ならヒントを出して何度でも挑戦でき、
// 正解したら「なぜバグなのか」を表示する。required 問正解でクリア。
// 問題は data/bugs.json。

const COMMENT_PREFIX = { javascript: '//', 'c#': '//', python: '#', sql: '--' };

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function mount(root, ctx) {
  const { el, fmt, audio, fx } = ctx;
  const data = await ctx.loadJSON('data/bugs.json');
  if (!ctx.isActive()) return;

  const U = data.ui;
  const questions = shuffle([...data.questions]);
  const required = Math.min(data.required, questions.length);
  let qIndex = 0;
  let correct = 0;
  let mistakes = 0;
  let combo = 0;         // 1回目で正解した問題の連続数
  let missedThis = false; // この問題で1回でも間違えたか

  // ---- 正解数の表示
  const stars = Array.from({ length: required }, () => el('span', { class: 's2-star', 'aria-hidden': 'true', text: '★' }));
  const progressText = el('span', { class: 's2-progress-text' });
  const progress = el('div', { class: 's2-progress' }, progressText, el('span', { class: 's2-stars' }, stars));

  const intro = el('p', { class: 's2-intro', text: U.intro });
  const card = el('div', { class: 's2-card' });
  root.append(progress, intro, card);

  updateProgress();
  showQuestion();

  function updateProgress() {
    progressText.textContent = fmt(U.progress, { n: correct, total: required });
    stars.forEach((s, i) => s.classList.toggle('is-on', i < correct));
    // 残りわずか・コンボ中は BGM を盛り上げる
    const level = (required - correct <= 1 ? 1 : 0) + (combo >= 2 ? 1 : 0);
    audio.setIntensity(level);
  }

  function showQuestion() {
    const q = questions[qIndex % questions.length];
    missedThis = false;
    const prefix = COMMENT_PREFIX[String(q.lang).toLowerCase()];

    const feedback = el('div', { class: 's2-feedback', role: 'status', 'aria-live': 'polite' });
    const lineBtns = q.code.map((text, i) => el('button', {
      type: 'button',
      class: `s2-line${prefix && text.trim().startsWith(prefix) ? ' is-comment' : ''}`,
      'data-sfx': 'none',
      'aria-label': `${i + 1}行目：${text.trim()}`,
      onclick: () => choose(i + 1),
    }, el('span', { class: 's2-ln', 'aria-hidden': 'true', text: String(i + 1) }), el('span', { class: 's2-src', text: text || ' ' })));

    const code = el('div', { class: 'code s2-code', role: 'group', 'aria-label': `${q.lang} のプログラム` }, lineBtns);

    card.replaceChildren(
      el('div', { class: 's2-head' },
        el('span', { class: 's2-lang', text: q.lang }),
        el('h2', { class: 's2-title', text: q.title })),
      el('p', { class: 's2-story' }, el('strong', { text: `${U.storyLabel}：` }), q.story),
      el('p', { class: 's2-tap', text: U.tapHint }),
      code,
      feedback,
    );
    card.classList.remove('fx-pop');
    fx.pop(card);

    function choose(line) {
      const btn = lineBtns[line - 1];
      if (card.dataset.solved === '1' || btn.disabled) return;

      if (line !== q.bugLine) {
        mistakes += 1;
        missedThis = true;
        combo = 0;
        updateProgress();
        btn.disabled = true;
        btn.classList.add('is-wrong');
        audio.play('wrong');
        fx.shake(btn);
        fx.floatText('✖', btn, { className: 'fx-float-ng' });
        feedback.replaceChildren(
          el('p', { class: 's2-wrong', text: U.wrong }),
          el('p', { class: 's2-hint' }, el('strong', { text: `💡 ${U.hintLabel}：` }), q.hint));
        return;
      }

      // 正解
      card.dataset.solved = '1';
      correct += 1;
      if (!missedThis) combo += 1;
      lineBtns.forEach((b) => { b.disabled = true; });
      btn.classList.add('is-bug');
      audio.play('correct');
      fx.celebrate('correct', btn);
      if (combo >= 2) {
        audio.play('combo', { count: combo });
        fx.combo(combo);
      }
      updateProgress();
      fx.pop(stars[correct - 1]);

      const last = correct >= required;
      const nextBtn = el('button', {
        type: 'button',
        class: 'btn btn-big',
        'data-sfx': last ? 'none' : 'tap',
        onclick: () => {
          if (last) {
            ctx.complete({ mistakes });
            return;
          }
          qIndex += 1;
          delete card.dataset.solved;
          showQuestion();
          card.scrollIntoView({ block: 'start', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
        },
      }, last ? U.finish : U.next);

      feedback.replaceChildren(el('div', { class: 's2-explain' },
        el('p', { class: 's2-correct', text: `🎯 ${U.correctHeading}` }),
        el('p', { text: q.explanation }),
        q.fix ? el('div', { class: 's2-fix' },
          el('span', { class: 's2-fix-label', text: U.fixLabel }),
          el('pre', { class: 'code s2-fix-code', text: q.fix })) : null,
        nextBtn));
      feedback.scrollIntoView({ block: 'nearest', behavior: fx.reducedMotion() ? 'auto' : 'smooth' });
    }
  }
}
