// dom.js — 画面を組み立てるための小さな共通関数（各ステージから使ってよい）

/**
 * 要素を作る。
 *   el('button', { class: 'btn', onclick: fn, 'aria-label': '...' }, '表示文字', 子要素...)
 * - text: textContent を設定
 * - on○○: イベントリスナー
 * - dataset: data-* 属性をまとめて設定
 * - 値が null / undefined / false の属性は付けない
 */
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c);
  }
  return e;
}

/** '{n} 回' のような文言の {名前} を置き換える */
export function fmt(template, vars = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}
