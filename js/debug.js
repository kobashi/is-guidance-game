// debug.js — 効果音・BGM・演出を試すための画面（index.html?debug=1#/debug）
// 開発・調整用なので、文言はここに直接書いている（学生には表示されない）。

export function renderDebug({ audio, fx, el, setSound, stages, go, clearAllStages, resetProgress }) {
  let comboCount = 0;
  let rankIdx = 0;

  const status = el('p', { class: 'debug-status', 'aria-live': 'polite' });
  const refresh = () => {
    status.textContent = `音: ${audio.isEnabled() ? 'ON' : 'OFF'} ／ AudioContext: ${audio.getState()} ／ BGM: ${audio.currentBgm() ?? '-'}（盛り上がり ${audio.getIntensity()}）／ reduced-motion: ${fx.reducedMotion() ? 'ON' : 'OFF'}`;
  };
  const timer = setInterval(refresh, 500);
  refresh();

  const button = (label, onclick, attrs = {}) =>
    el('button', { type: 'button', class: 'btn btn-small', 'data-sfx': 'none', onclick: (e) => { onclick(e); refresh(); }, ...attrs }, label);
  const section = (title, ...children) =>
    el('section', { class: 'debug-section' }, el('h2', { class: 'section-title', text: title }), el('div', { class: 'debug-grid' }, children));

  const sfxButtons = audio.SFX_NAMES.map((name) =>
    button(name, () => {
      if (name === 'combo') {
        comboCount += 1;
        audio.play('combo', { count: comboCount });
        fx.combo(comboCount);
      } else {
        audio.play(name);
      }
    }));

  const bgmButtons = audio.BGM_NAMES.map((name) => button(`♪ ${name}`, () => audio.playBgm(name)));

  const node = el('section', { class: 'screen debug-screen' },
    el('h1', { class: 'screen-title', text: 'デバッグ' }),
    status,
    section('音',
      button('音を ON にする', () => setSound(true)),
      button('音を OFF にする', () => setSound(false))),
    section('効果音', sfxButtons, button('コンボ数を戻す', () => { comboCount = 0; })),
    section('BGM', bgmButtons,
      button('■ 停止', () => audio.stopBgm()),
      button('盛り上がり 0', () => audio.setIntensity(0)),
      button('盛り上がり 1', () => audio.setIntensity(1)),
      button('盛り上がり 2', () => audio.setIntensity(2))),
    section('演出',
      button('紙吹雪', () => fx.confetti()),
      button('降る紙吹雪', () => fx.rain()),
      button('星（この位置）', (e) => fx.burst(e.currentTarget)),
      button('拡大バウンド', (e) => fx.pop(e.currentTarget)),
      button('揺れ', () => fx.shake()),
      button('大きく揺れ', () => fx.shake(undefined, { big: true })),
      button('フラッシュ', () => fx.flash()),
      button('浮かぶ文字', (e) => fx.floatText('+1', e.currentTarget)),
      button('コンボ表示', () => { comboCount += 1; fx.combo(Math.max(2, comboCount)); }),
      button('正解演出', (e) => { audio.play('correct'); fx.celebrate('correct', e.currentTarget); }),
      button('クリア演出', () => { audio.play('clear'); fx.celebrate('clear'); }),
      button('ランク表示', () => {
        const rank = ['S', 'A', 'B'][rankIdx++ % 3];
        fx.showRank({ rank, lines: ['ミス 0 回', 'タイム 1:23'], button: '閉じる', skipHint: 'タップでスキップ' });
      }),
      button('エンディング演出', () => { audio.play('ending'); fx.celebrate('ending'); })),
    section('進行状況',
      button('全ステージをクリア済みにする', clearAllStages),
      button('進行状況を消す', resetProgress),
      stages.map((s, i) => button(`ステージ${i + 1}へ`, () => go(`#/stage/${i + 1}`))),
      button('エンディングへ', () => go('#/ending')),
      button('タイトルへ', () => go('#/'))),
  );

  return { node, dispose: () => clearInterval(timer) };
}
