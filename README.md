# 情報システム・クエスト

名古屋文理大学 情報メディア学科の1年生が、コース選択の前に「情報システムコースで何を学ぶか」を
スマホで遊びながら理解するための Web ゲームです。コースガイダンスの最後に QR コードで案内します。

- 素の HTML / CSS / JavaScript のみ（ビルド工程・外部ライブラリ・外部通信なし）
- 名前などの入力はなく、進行状況は各自の端末（localStorage）にだけ保存されます
- 効果音と BGM はすべて Web Audio API で実行時に合成しています（音源ファイルなし）

要件は [CLAUDE.md](CLAUDE.md)、参考資料は [docs/REFERENCE.md](docs/REFERENCE.md) にあります。

---

## 公開手順（GitHub Pages）

main に push（プルリクエストのマージを含む）すると、GitHub Actions（`.github/workflows/pages.yml`）が
`data/` の JSON を確認してから、自動で GitHub Pages に公開します。

**最初の1回だけ**、次の設定が必要です。

1. GitHub のリポジトリページで **Settings → Pages** を開く
2. **Build and deployment** の Source を **GitHub Actions** にする
3. 以後は main への push で自動的に公開される。設定より前の push で公開されていないときは、**Actions** タブ →「Pages に公開」→ **Run workflow** で手動実行する
4. 数分後、`https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される（Actions の実行結果と Settings → Pages に URL が表示される）

- JSON に間違いがあると「data の JSON を確認」が失敗し、**公開されません**（前の版が表示されたまま）。Actions タブで赤くなった実行を開くと、どのファイルの何が問題かが表示されます。
- プルリクエストでは JSON の確認だけが行われ、公開はされません。
- main にマージした内容がそのまま公開されます。ガイダンス当日までは URL を配らないでください。
- すべて相対パスで書いてあるので、リポジトリ名を変えても動きます。

## 手元での確認

ES Modules を使っているため、`index.html` をダブルクリック（file://）では動きません。簡易サーバーで開きます。

```sh
python3 -m http.server 8000
# ブラウザで http://localhost:8000/ を開く
```

- **デバッグ画面**：`http://localhost:8000/?debug=1#/debug`
  全効果音・BGM・演出の試聴、進行状況の操作ができます。`?debug=1` のときはロックされたステージにも入れます。
- **データの確認**：JSON を編集したら必ず実行してください（Node.js が必要）。

```sh
node tools/check-data.mjs
```

---

## 内容の編集（教員向け）

文言・問題・リンクはすべて `data/` の JSON にあります。JS を触らずに内容を変えられます。
JSON は「最後の項目の後にカンマを付けない」「文字列は `"` で囲む」に注意してください。編集後は `node tools/check-data.mjs` で確認します。
`_comment` で始まる項目は説明用のメモで、ゲームには影響しません。

| ファイル | 内容 |
|---|---|
| `data/ui.json` | 画面の文言（タイトル、ボタン、ステージ名、クリア画面、称号、設定画面など）とランクの基準 |
| `data/sounds.json` | 音の初期 ON/OFF、音量、合成音／音源ファイルの切り替え |
| `data/links.json` | エンディングに表示するリンク |
| `data/system.json` | ステージ1の部品（正しい順番に並べて書く。画面ではシャッフルされる）とメッセージ |
| `data/bugs.json` | ステージ2の問題（コードは1行ずつ、バグの行番号・ヒント・解説・正しい行）。`required` がクリアに必要な正解数。現在はサンプル8問 |
| `data/curriculum.json` | ステージ3の科目（科目名・年次・前後期・必修区分・前提科目は「超履修計画2026」から転記）、伸びるスキル、1年で取れる科目数、進路・卒業研究の例 |
| `data/quiz.json` | ステージ4のクイズ（質問、選択肢ごとの一言と効果音、答えた後のメッセージ、最後のまとめ）。正誤は問わない |

### 音の初期値（sounds.json）

```json
"defaultEnabled": false,
```

- `false`：初めて開いたときは音なし（ガイダンス中に数十台が同時に鳴るのを防ぐため、既定はこちら）
- `true`：初めて開いたときから音あり（学生がタイトル画面の「🔊 音ありで遊ぶ」を押すと鳴ります）
- 学生が一度選んだ ON/OFF は、その端末に保存されて優先されます。

### 音源ファイルに差し替える

1. 音源ファイル（mp3 / m4a / wav など。iPhone と Android の両方で再生できる **mp3** を推奨）を `assets/audio/` に置く
2. `data/sounds.json` の該当する音を次のように書き換える

```json
"correct": { "source": "file", "path": "assets/audio/correct.mp3", "volume": 0.8 }
```

- 効果音の名前：`tap` `connect` `correct` `wrong` `combo` `clear` `levelup` `door`（扉が開く） `door-locked`（扉が閉じたまま） `ending`
- BGM の名前：`title`（タイトルとステージ選択） `stage1`〜`stage4` `ending`
- ファイルが読み込めなかったときは、自動で合成音が鳴ります。
- BGM をファイルにした場合、ループ再生されます（盛り上がり演出によるテンポ変化はしません）。
- **使った音源のライセンスは、下の「音源のライセンス」に必ず追記してください。**

### 音源のライセンス

現在、音源ファイルは使っていません（すべて Web Audio API による合成音）。

| ファイル | 作者・入手先 | ライセンス |
|---|---|---|
| （なし） | | |

### 公開前に教員が確認すること

- `data/ui.json` の `ending.honors`（ランクの合計点で決まる称号）と `ending.message` の文言
- `data/links.json` のリンク先 URL
- `data/sounds.json` の `defaultEnabled`（ガイダンス当日は `false` 推奨）
- `data/curriculum.json` の `skills`（科目ごとに伸びるスキル）、`maxPicks`、`careers`（ゲーム用に設定した値）
- `data/bugs.json` のサンプル問題の難易度と言語の配分

---

## 開発者向けメモ

### ファイル構成

```
index.html            エントリーポイント
css/style.css         見た目（ライト／ダークモード、safe-area、reduced-motion 対応）
js/main.js            画面遷移・進行状況の管理・設定画面
js/storage.js         localStorage の読み書き（失敗しても続行）
js/audio.js           効果音・BGM の合成と再生
js/fx.js              パーティクル・揺れ・コンボ表示・ランク表示
js/dom.js             要素を作る小さな共通関数
js/debug.js           デバッグ画面（?debug=1）
js/stages/*.js        各ステージ（互いに依存しない）
data/*.json           文言・問題・リンク・音の設定
tools/check-data.mjs  data/ の形式チェック
```

### ステージの書き方

各ステージは `js/stages/stageN-*.js` で次の関数を公開します。ステージ同士は import しないでください。

```js
export async function mount(root, ctx) {
  // root：ステージを描く要素（見出しの下）
  const data = await ctx.loadJSON('data/bugs.json');
  if (!ctx.isActive()) return;          // 読み込み中に別の画面へ移っていたら中止

  // 正解したとき
  ctx.audio.play('correct');
  ctx.fx.celebrate('correct', 押された要素);
  ctx.audio.play('combo', { count: 3 }); ctx.fx.combo(3);
  ctx.audio.setIntensity(1);            // 残りわずか・コンボ中は BGM を盛り上げる（0〜2）

  // 不正解のとき
  ctx.audio.play('wrong'); ctx.fx.shake();

  // クリアしたら（ランク・クリア演出・次のステージへの移動は main.js が行う）
  ctx.complete({ mistakes: 2 });

  return () => { /* 画面を離れるときの後片付け（タイマー解除など） */ };
}
```

- 音や演出の中身をステージ側で作らず、`audio.js` と `fx.js` を名前で呼ぶだけにします。
- ボタンを押すと自動で `tap` 音が鳴ります。別の音を鳴らす場合は `data-sfx="none"`（無音）や `data-sfx="connect"` を付けます。
- ランクは `data/ui.json` の `rank`（ミスの回数の上限）で決まります。`ctx.complete({ rank: 'S' })` で直接指定もできます。
- `ctx.el(タグ, 属性, 子要素...)` で要素を作れます（`js/dom.js`）。
- コード表示には `<pre class="code">` を使うと、長い行がその中だけで横スクロールします。
