// ステージ2：バグハンター（M3 で実装）
// 現在は仮画面。main.js の createStageContext() にある ctx を使って実装する。

export async function mount(root, ctx) {
  ctx.renderPlaceholder(root);
}
