---
title: プラグインの作り方
order: 7
description: 置き物・サーバーの操作と状態・保存・画面のメニューを足すプラグインの作り方。フォルダの構成、各ファイルのAPI、安全の注意、上限の一覧。
---
プラグインは本体のコードに手を入れずに、置き物や小さなゲームのような機能を足す仕組みです。`plugins/<id>/`にフォルダを置いてビルドし直すと取り込まれます。この章はプラグインを入れる人と、自分で作る人のためのものです。

作る人は先に[通しの例](#通しの例)を読んでから各ファイルの章に戻ると、全体がつかみやすくなります。もっと大きい例はリポジトリの`plugins/darts/`です。

## できること・できないこと

できること：

- **置き物を足す**：マップエディタのパレットに出て、本体の置き物と同じように置けます。寸法・当たり・席・向きの扱いも本体と同じです。席は本体の席と同じ扱いで、オフィスの画面から座れます。
- **サーバーで操作を受ける**：画面から`send`で送った操作を、サーバーのコードが処理します。
- **状態を配る**：サーバーが返した状態は、オフィスの画面を開いている人に約4秒ごとに届き、置き物の絵にも渡されます。
- **データを保存する**：キーと値（JSON）の保存場所がプラグインごとに用意されます。再起動しても残ります。
- **画面に足す**：HUDのメニューの項目、置き物の上に出るボタン、HUDの中の小窓（dock）、本体と同じ見た目のダイアログ。

できないこと：

- **実行中の入れ替え**：プラグインはビルドのときに取り込まれます。足す・外す・直すたびに`docker compose up --build`が要ります。
- **管理画面での有効・無効**：入れたら有効で、切り替えは作っていません。
- **サーバー側の定期処理**：サーバーのコードが動くのは、画面からの要求（`state`・`actions`・`get`）があったときだけです。タイマーや常駐の処理を置く場所はありません。
- **独自のページ・API・テーブルの追加**：APIは`/api/office/plugins/<id>`だけで、データは`ctx.store`に入れます。
- **プラグイン専用のnpmパッケージの追加**：使えるのは本体の`package.json`にあるものだけです（Reactは使えます）。
- **ほかのプラグインのデータを読む**：`ctx.store`は自分のプラグインの分だけです。
- **バージョン番号による互換の保証**：プラグインのAPIにはまだ版の番号がありません。本体を更新したら、プラグインが動くか確かめてください。

## 入れ方と外し方

入れるとき：

1. `plugins/<id>/`にフォルダを置きます。フォルダ名は作者が決めたidのまま置いてください。変えると、`plugins/hello2: key "hello:counter" in catalog.js must start with "hello2:"`のようなエラーでビルドが止まります。
2. `docker compose up --build`で作り直して起動します。

`plugins/`の直下にはプラグインのフォルダ以外を置かないでください（zipの展開でできる`__MACOSX`などのフォルダは、idの形に合わずビルドが止まります）。公式の`darts`は最初から入っていて有効です。要らなければ`plugins/darts/`を消してください。

置き物のサムネイルはプラグインの`thumbs/`に入っていれば、入れる人がすることはありません（[サムネイル](#サムネイル)）。

外すとき：

1. フォルダを消します。
2. `docker compose up --build`で作り直して起動します。

外したあと、マップに残っているそのプラグインの置き物は、次のように扱われます。

- オフィスの画面・席の一覧・エディタでは、その置き物を**飛ばします**（マップのJSONからは消えません）。
- マップを**公開**しようとすると、「プラグイン『〜』の置き物です。プラグインを入れ直すか、この置き物を消してください」というエラーになります。置き物を消すか、プラグインを入れ直すまで公開できません。
- 保存したデータは消えません。同じidのプラグインを入れ直せば、前の続きから使えます。データも消すなら、プラグインを外したあとに、次の1行で`PluginData`テーブルの該当の行を消します。**元に戻せません**。先にバックアップを取ってください（[運用](../operations/)）。

```sh
docker compose exec db psql -U vo vo -c "DELETE FROM \"PluginData\" WHERE plugin = '<id>'"
```

## 安全の注意

プラグインはサーバーの中で、本体と同じ権限で動きます。サンドボックスはありません。データベース、環境変数、ファイルを、プラグインのコードは読み書きできます。

- **中を読んだものだけ入れてください。** 出どころの分からないフォルダを`plugins/`に置かないでください。
- **`payload`と`params`は信用しないでください。** 画面から来る値はブラウザの開発者ツールで好きな形に書き換えられます。型・範囲・長さをプラグインの中で確かめます。
- **管理者だけの操作は`ctx.user.isAdmin`を見てください。** 画面でボタンを隠しても、操作そのものは誰でも送れます。
- **`state`に秘密を入れないでください。** `state`は、オフィスの画面を開いている全員に返ります（人ごとに中身を変えることはできますが、その人のブラウザに渡る値なので、見えてよいものだけにします）。
- **`state`・`get`には、人が意図しない変更を置かないでください。** POST（`actions`）はオリジンを確かめて、別のサイトからの要求を断ります。GET（`get`）は、`Sec-Fetch-Site`ヘッダーが`cross-site`か`same-site`（別のサイトからの遷移）なら403で断ります。ヘッダーが無い要求（古いブラウザ・`curl`）は通ります。`state`は本体の状態取得（`GET /api/office/state`）の中で呼ばれ、オリジンを確かめません。なので`state`・`get`は、保存や状態の変更を置かず、期限切れの片付けのように何度呼ばれても同じ結果になる処理だけにしてください。
- **人が書いた文字は`textContent`で入れてください。** 名前・チャットなどを`innerHTML`に入れると、他の人の画面でスクリプトが動きます。

```ts
// payloadを確かめる例。failは`return ctx.fail(…)`の形で書く（理由は「ctx」の節）
press: (ctx, payload) => {
  const n = (payload as { n?: unknown } | null)?.n;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 10) return ctx.fail(400, "plugin.hello.badInput"); // ja.json・en.jsonにこのキーが要る
  // ここから先で、nはnumber
}
```

## フォルダの中身

どのファイルも省略できます。必要なものだけ作ってください。

| ファイル | 動く場所 | 中身 |
|---|---|---|
| `catalog.js` | サーバー・画面・エディタ・Pages版 | 置き物の定義。DOMもNode専用のものも使えません |
| `draw.js` | エンジン（画面） | 置き物の絵 |
| `server.ts`（`.js`でも可） | サーバー | `state`・`actions`・`get` |
| `client.ts`（`.tsx`・`.js`でも可） | オフィスの画面 | `export default function setup(api)` |
| `ja.json`・`en.json` | すべて | 文言 |

`catalog.js`と`draw.js`は、ビルドのときにNodeでも読み込まれます（`scripts/plugins.mjs`が`import`して、キーを調べます）。ファイルの一番外側でDOMに触らず、`import`は相対パスで書いてください。

Pages版はGitHub Pagesに置く、サーバーなしのマップエディタです（`npm run build:pages`で作ります）。置き物の定義と絵だけが入り、`server.ts`と`client.ts`は動きません。

### idとキーのルール

`scripts/plugins.mjs`が、ビルドの前（`npm run dev`・`build`・`test`・`lint`・`build:pages`・`build:thumbs`の前にも）にフォルダを調べます。次に当てはまると、理由（英語）を出してビルドを止めます。全部のプラグインを調べ終わってから書き出すので、止まったときも`src/plugins/generated/`は前の中身のままです（`npm run dev`の最中に1つ書き間違えても、ほかのプラグインは消えません）。

- **id（フォルダ名）が`^[a-z][a-z0-9-]{1,30}$`に合わない**：英小文字で始まり、英小文字・数字・ハイフンだけの2〜31字です。
- **`catalog.js`・`draw.js`のキーが`<id>:`で始まらない**：置き物の種類は`<id>:<名前>`の形にします（例：`hello:counter`）。
- **`ja.json`・`en.json`のキーが`plugin.<id>.`か`catalog.<id>:`で始まらない**：文言のキーは`plugin.<id>.…`と、置き物の名前を書く`catalog.<id>:<名前>`だけです。
- **`ja.json`と`en.json`のキーの集合が違う**：片方にしか無いキーを並べて出します。
- **`ja.json`と`en.json`の片方しか無い**：「`en.json is missing`」のように、無いほうを出します。
- **`catalog.js`・`draw.js`がオブジェクトを`export default`していない**、**JSONとして読めない**
- **`catalog.js`・`draw.js`の`import`が失敗する**（構文エラーなど）：`plugins/<id>/catalog.js: cannot load (…)`のように、ファイル名を付けて理由を出します。
- **`thumbs/<名前>.png`の名前が`catalog.js`のキーに無い、PNGが64KBを超える**：[サムネイル](#サムネイル)を参照。

文言を持つなら、`ja.json`と`en.json`の両方が要ります（片方だけだとビルドが止まります）。サーバーの`ctx.t`と画面の`api.t`は、`{n}`のような`{名前}`の部分に値を入れられます。キーが見つからないときは、キーの文字列がそのまま表示されます。

## 通しの例

押した回数を数えるプラグイン`hello`です。置き物（上の面に、押した回数ぶんの点が増える）・サーバーの操作と状態・保存・メニュー・ボタン・小窓・文言がひととおり入っています。リセットは管理者だけです。

`plugins/hello/`に、次の6つのファイルを置きます。同じ中身が`examples/hello/`にあるので、`plugins/`にコピーして始められます（`server.test.ts`も入っています）。

`catalog.js`：置き物の定義。16×16の高さ20の箱と、手前に座る席1つです。

```js
// @ts-check
/** @type {Record<string, import("@/plugins/types").PluginItemDef>} */
const defs = {
  "hello:counter": {
    cat: "decor",
    dirs: ["x+"], art: ["x+"], sym: true,
    props: {},
    boxes: () => [{ b: [-8, -8, 0, 8, 8, 20] }],
    // 台の手前に座る席。artのx+で書けば、ほかの向きは転置・回転で自動で作られる(x+を見ている人はSE)
    seats: () => [{ dx: -20, dy: 0, face: "SE", type: "stool" }],
  },
};
export default defs;
```

`draw.js`：箱を描き、`state.count`の数だけ上の面に点を打ちます。

```js
const defs = {
  // 押した回数ぶん、上の面に点を並べる(9個まで)
  "hello:counter"(k, d) {
    const n = Math.min(d.state?.count ?? 0, 9);
    k.box(d.x - 8, d.y - 8, 0, d.x + 8, d.y + 8, 20, "Y", "O", "R", "W");
    k.flush();
    for (let i = 0; i < n; i++) {
      k.wp(d.x - 6 + (i % 3) * 4, d.y - 6 + Math.floor(i / 3) * 4, 20, k.cc("K"));
    }
    k.flush(false);
  },
};
export default defs;
```

`server.ts`：`state`は押した回数と、マップに置いてある数を返します。`press`は`update`で1足し、`reset`は管理者だけが0に戻せます。

```ts
import type { PluginServer } from "@/plugins/types";

const server: PluginServer = {
  state: async (ctx) => ({
    count: ((await ctx.store.get("count")) as number | undefined) ?? 0,
    placed: (await ctx.items()).length,
  }),
  actions: {
    press: (ctx) => ctx.store.update("count", (c) => ((c as number | undefined) ?? 0) + 1),
    reset: async (ctx) => {
      if (!ctx.user.isAdmin) return ctx.fail(403, "plugin.hello.adminOnly");
      await ctx.store.set("count", 0);
    },
  },
};
export default server;
```

`client.ts`：小窓に回数を出し、メニューのダイアログと、置き物の上の「押す」ボタンを足します。`send`の失敗のメッセージは回数とは別の要素に出します（回数は`onState`のたびに書き直されるので、同じ要素に出すとすぐ消えます）。`onState`の解除を返しているので、画面を外すときに呼ばれます。

```ts
import type { PluginApi } from "@/plugins/types";

type State = { count: number; placed: number };

export default function setup(api: PluginApi) {
  const read = () => (api.state() as State | undefined) ?? { count: 0, placed: 0 };

  // 小窓(dock): 押した回数。stateを受け取るたびに書き直す
  const box = document.createElement("div"), count = document.createElement("div"), err = document.createElement("div");
  box.className = "win";
  box.style.cssText = "padding:4px 8px;font-size:12px";
  box.append(count, err); // 失敗のメッセージは回数と別の要素に出す(stateのたびに書き直すのは回数だけ)
  api.dock.append(box);
  const show = () => { count.textContent = api.t("plugin.hello.count", { n: read().count }); };
  show();
  const off = api.onState(show);

  // メニュー: ダイアログを開く。リセットは管理者だけ(サーバーが断る)
  api.menu(api.t("plugin.hello.menu"), () => {
    const d = api.dialog(api.t("plugin.hello.menu"));
    const info = document.createElement("p");
    info.textContent = api.t("plugin.hello.count", { n: read().count }) + " / " + api.t("plugin.hello.placed", { n: read().placed });
    const reset = document.createElement("button");
    reset.textContent = api.t("plugin.hello.reset");
    reset.className = "pbtn";
    reset.onclick = () => { api.send("reset").then(d.close, (e: Error) => { info.textContent = e.message; }); };
    d.body.append(info, reset);
  });

  // 置き物の上のボタン(見えない当たり判定。マウスを乗せるとラベルが出て、押すとここが走る)
  api.onItemClick("hello:counter", api.t("plugin.hello.press"), () => {
    api.send("press").then(() => { err.textContent = ""; }, (e: Error) => { err.textContent = e.message; });
  });

  return off; // 画面を外すとき(エンジンのdispose)に呼ばれる
}
```

`ja.json`：

```json
{
  "plugin.hello.menu": "ハローの窓",
  "plugin.hello.count": "押した回数: {n}",
  "plugin.hello.placed": "置いてある数: {n}",
  "plugin.hello.press": "押す",
  "plugin.hello.reset": "リセット",
  "plugin.hello.adminOnly": "リセットは管理者だけです。",
  "catalog.hello:counter": "ハローの置き物"
}
```

`en.json`：

```json
{
  "plugin.hello.menu": "Hello window",
  "plugin.hello.count": "Presses: {n}",
  "plugin.hello.placed": "Placed: {n}",
  "plugin.hello.press": "Press",
  "plugin.hello.reset": "Reset",
  "plugin.hello.adminOnly": "Only admins can reset.",
  "catalog.hello:counter": "Hello item"
}
```

置いたら、`docker compose up --build`で作り直します。サムネイルを付けるなら、先にホストで`npm run build:thumbs`を1回実行します（`plugins/hello/thumbs/counter.png`ができます。[サムネイル](#サムネイル)を参照）。`/editor`のパレット（「装飾」）から`ハローの置き物`を、部屋の中のマップに置いて公開します。オフィスの画面では置き物の手前の席に座れます。置き物の上にマウスを乗せると「押す」のラベルが出ます（置き物の上にある、見えない当たり判定です）。押すと`cb`が走り、点が1つ増えて、小窓の回数も増えます。

もっと大きい例は`plugins/darts/`です。`server.ts`の`machineOf`はpayloadの確かめ方、`run`は`update`と`fail`の使い方、`server.test.ts`の`world`はstoreを共有して複数人を試す書き方の参考になります。

## 置き物を定義する（catalog.js）

`export default`で、`<id>:<名前>`をキーにしたオブジェクトを返します。形は本体の`src/engine/catalog.js`の置き物の定義と同じです。

```js
const defs = {
  "hello:counter": {
    cat: "decor",
    dirs: ["x+"], art: ["x+"], sym: true,
    props: {},
    boxes: () => [{ b: [-8, -8, 0, 8, 8, 20] }],
  },
};
export default defs;
```

| 項目 | 意味 |
|---|---|
| `cat` | エディタのパレットのカテゴリ。次の7つから選びます（パレットの表示名）：`desk`（机・席）・`meeting`（会議）・`lounge`（くつろぎ）・`storage`（収納）・`decor`（装飾）・`facility`（設備）・`season`（季節）。省略か、これ以外の値は「その他」です |
| `art` | 省略できます。絵を描く向き（`x+`・`y+`・`x-`・`y-`）。`draw.js`はこの向きの絵だけ描きます。書くかどうかで向きの扱いが変わります（下の「向きの扱い」） |
| `sym` | `true`なら、足もとの真ん中まわりに180度回した向きも、同じ絵で使えます（両面が同じ絵の置き物用） |
| `dirs` | 使える向き（必須）。`art`を書かないときは、ここに書いた向きだけが使えます。`art`を書くと、この値は`art`と、`art`から転置・180度回転で作れる向きで上書きされます |
| `props` | 置き物ごとの設定の初期値。マップの置き物の`props`は、ここに書いたキーだけ、同じ型で上書きできます（外れると公開のチェックでエラー）。エディタの設定欄に自動で出ます（数は増減の欄、文字列は入力欄、真偽はスイッチ。配列・オブジェクト・`null`は出ません）。ラベルは`editor.prop.<key>`の文言で、無ければキー名がそのまま出ます（プラグインの`ja.json`に書けるキーは`plugin.<id>.`と`catalog.<id>:`で始まるものだけなので、`editor.prop.…`は足せません）。文字列は40字まで、数は絶対値4096まで、どんな値でも入れられるので、`draw.js`とサーバーで確かめてから使ってください |
| `boxes(dir, props)` | 並べ替えと、歩けない範囲に使う箱の配列。`{ b: [x0, y0, z0, x1, y1, z1], block, draw }`。`block`は既定で`true`（歩けない）、`draw`は既定で`true`（絵を描く） |
| `seats(dir, props)` | 席の配列。`{ dx, dy, face, type, … }`。`dx`・`dy`は原点からの差、`face`は座った人の向き（画面上の`NE`・`NW`・`SE`・`SW`）、`type`は席の種類です（下の表） |

### 向きの扱い

- **`art`を書く場合**：`art`にない向きは、`x`と`y`を入れ替えた**転置**（画面では左右の鏡像）で作ります。`sym: true`なら、180度回した向きも作れます。`boxes`・`seats`・絵は`art`の向きで呼ばれ、ほかの向きではエンジンが転置・回転します。`art`の向きのぶんだけ書けば足ります。
- **`art`を書かない場合**：`dirs`に書いた向きだけが使えます。`boxes`・`seats`・絵は、その本当の向きで呼ばれ、転置も回転もされません。
- **文字や数字を`spr`で描く置き物は、`art`を書かないでください。** `spr`のドット絵は、転置しても中身が裏返りません。転置された向きでは、文字の並びだけが逆になります（ダーツの「301」が「103」と逆に見えたため、`plugins/darts/catalog.js`は`art`を書かず`y+`だけにしています）。

席の`face`は、座った人が見る画面上の向きです。`art`を書かずに向きごとに席を書くときは、置き物の向きに対して、その向きを見ている人の`face`を次の表のとおりにします（`src/engine/catalog.js`の`FACE`）。`art`を書くなら、`art`の向きのぶんだけ書けば、転置した向きの`face`は左右を入れ替えて自動で作られます。

| 置き物の向き | その向きを見ている人の`face` |
|---|---|
| `x+` | `SE` |
| `y+` | `SW` |
| `x-` | `NW` |
| `y-` | `NE` |

置き物の原点はエディタで置いた点（8単位に吸着します）です。`boxes`・`seats`の座標は、すべてこの原点からの差です。

**`boxes`・`seats`は投げないように書いてください。** `props`は利用者が範囲内の好きな値を入れられるので、どんな値でも投げない形にします。投げると、その置き物の箱と席が無くなり（コンソールに種類ごとに1回出ます）、マップの公開は「プラグイン「〜」の置き物の形か席の計算でエラーになりました」で止まります。

席のidは`<置き物のid>-<番号>`で、番号は`seats`の配列の順（1から）です。席の位置がどの部屋の矩形にも入っていないと、その席は出ません。**会議室（kind `meeting`）の中の席は、個別の席になりません。** 席の一覧に出ず、会議室の椅子（`stand`は立ち見、ほかは`meet`の椅子）として使われます。席を使うプラグインは、会議室の外に置いてください。

`type`ごとの違い（`office.js`の描き方）：

| `type` | 座る高さ | 入室時のおまかせ | 椅子 |
|---|---|---|---|
| `office` | 8 | 作業エリア（kind `work`）の席が最初の候補 | エンジンが描く（オフィスチェア） |
| `stool` | 14 | 作業エリアが満席のとき、`free`・`break`・`hall`の部屋の席が候補 | 描く（スツール） |
| `meet` | 8 | 同上 | 描く（会議用の椅子） |
| `armchair` | 9 | 画面のおまかせでは選ばれない | 描く（ひじかけ付き） |
| `desk` | 8 | 画面のおまかせでは選ばれない | 描く |
| `stand` | 立つ（床。`z0`で台の高さ） | `stool`と同じ | 描かない（床の印だけ） |

`tea`・`dine`・`table`・`cafe`・`fold`・`shell`・`sofa`・`booth`・`focus`・`egg`・`bench`・`pbooth`・`beanbag`・`lstool`などは本体の置き物専用で、プラグインで使うと人や椅子が描かれません。

`seats`の追加の項目（エンジンがそのまま読みます）：

- `chair`：椅子の色。`navy`・`red`・`black`・`hb`（ヘッドレスト付きの黒）など。`meet`は`yellow`もあります。省略すると既定の色です。
- `sz`：座る高さ。上の表の値を上書きします。
- `z0`：台の高さ。座る高さ・立つ高さに足されます。
- `sign`：席の上に出す札の文字。
- `label`：席の名前（ツールチップ。省略は「席N」）。

`draw`を`false`にした箱は、絵の関数が呼ばれません（当たりだけの箱）。

### サムネイル

エディタのパレットと図面（真上から見た2D）に出る、置き物の絵です。`plugins/<id>/thumbs/<名前>.png`を置くと、`scripts/plugins.mjs`が`<id>:<名前>`のサムネイルとして取り込みます。64×64のPNGで、本体の置き物と同じ作り方です。なくても動きます。

- **作る（作者）**：ホストで`npm run build:thumbs`を1回実行すると、`plugins/<id>/thumbs/`に書かれます。本体と全部のプラグインを描き直しますが、変わっていない絵は同じバイト列になるので、gitの差分は出ません。Nodeは`Dockerfile`と同じ24で、`npm ci`のときにpuppeteerがChromiumを落とします。`public/catalog-thumbs.*`は本体の置き物だけのファイルで、プラグインがあっても変わりません。
- **配る**：`thumbs/`をプラグインのフォルダごと渡します。入れる人にNodeやChromiumは要りません。
- **無いとき**：パレットは空の枠のアイコン、図面は名前の札になります。アイソメのプレビューとオフィスの画面は本物のエンジンで描くので、どちらでもそのまま出ます。
- **止まるとき**：ファイル名が`catalog.js`のキーの`<id>:`のあとの部分に当たらない、またはPNGが64KBを超えると、`scripts/plugins.mjs`が止まります。

### 型を付ける

`@/plugins/types`（`src/plugins/types.ts`）に、プラグイン用の型があります。`import type`で使います。

| 型 | 使う場所 |
|---|---|
| `PluginServer` | `server.ts`の`export default` |
| `PluginCtx`・`PluginStore`・`PluginUser`・`PluginPerson`・`PluginRoom`・`PluginMapItem` | サーバーの`ctx`とその中身（`PluginPerson`は`people()`、`PluginRoom`は`rooms()`、`PluginMapItem`は`items()`の要素） |
| `PluginClientSetup`・`PluginApi`・`PluginDialog` | `client.ts`の`setup`、`api`、`api.dialog`の返り値 |
| `PluginItemDef`・`PluginDir`・`PluginBox`・`PluginSeat` | `catalog.js`の定義 |
| `PluginDraw`・`PluginDrawTools`・`PluginDrawArgs`・`PluginItem` | `draw.js`の関数、`k`、`d`、`d.item` |

`catalog.js`は、先頭に`// @ts-check`と、JSDocの`@type`を書くと、`npx tsc --noEmit`が定義の間違い（`face`の綴りや、`boxes`の返り値の形など）を見つけます。

```js
// @ts-check
/** @type {Record<string, import("@/plugins/types").PluginItemDef>} */
const defs = {
  "hello:counter": { /* … */ },
};
export default defs;
```

`draw.js`は`npx tsc --noEmit`の対象に入らないので、この書き方が効くのはエディタの中だけです。`PluginDraw`の型を付けると`d.state`は`unknown`になるので、使う所でJSDocのキャストを書きます。

```js
// @ts-check
/** @type {import("@/plugins/types").PluginDraw} */
const defs = {
  "hello:counter"(k, d) {
    const state = /** @type {{ count?: number } | undefined} */ (d.state);
    const n = Math.min(state?.count ?? 0, 9);
    // …
  },
};
export default defs;
```

## 絵を描く（draw.js）

`export default`で、`<id>:<名前>`をキーにした関数のオブジェクトを返します。関数は`(k, d)`を受け取ります。`k`は絵の道具、`d`は描く対象の情報です。

```js
const defs = {
  "hello:counter"(k, d) {
    k.box(d.x - 8, d.y - 8, 0, d.x + 8, d.y + 8, 20, "Y", "O", "R", "W");
    k.flush();
  },
};
export default defs;
```

`d`の中身：

| 項目 | 意味 |
|---|---|
| `x`・`y` | 置き物の原点（ワールド座標） |
| `dir` | 絵のある向き（`art`のどれか）。転置や180度回転で作った向きでも、ここは`art`の向きです |
| `props` | 初期値とマップの設定を合わせた`props` |
| `item` | マップの置き物そのもの（本当の`dir`もここ） |
| `part` | `boxes`の何番目の箱の絵か（0から） |
| `state` | このプラグインの状態（サーバーの`state(ctx)`の値）。最初の状態が届くまでは`undefined` |

`boxes`が複数ある置き物は、箱ごとに（奥から順に）関数が呼ばれます。`d.part`を見て、その箱の分だけ描いてください。

状態の値が前と違うとき（`state`を受け取ったときと、`send`のあと）は、その場でマップを描き直します。動く絵は`k.now()`を見て`draw.js`の中で動かせます（描き直しの間隔は[参考](#描き直しの間隔)）。

関数が途中で例外を投げると、描きかけの分を捨ててその置き物だけ飛ばします。ほかの置き物は描かれ、コンソールには種類ごとに1回だけ出ます。

### 座標と投影

- 座標はワールド単位です。1マスは16単位で、`z`は高さ（上が正）です。
- 画面の位置は、`x`が`X - Y`、`y`が`(X + Y) / 2 - Z`で決まります（`k.PX(X, Y)`と`k.PY(X, Y, Z)`がこの計算です）。
- 箱の面は、上が明るく、`+Y`向きの面（左）が中間、`+X`向きの面（右）が暗い色になります。

### 絵の道具`k`

| 道具 | 意味 |
|---|---|
| `box(x0, y0, z0, x1, y1, z1, top, left, right, edge?)` | 直方体。色はパレット文字（1文字）で、上の面・左の面・右の面の順。`edge`は上の縁の色 |
| `wp(x, y, z, color)` | ワールド座標に1画素。`color`は`cc("K")`のように数にしたもの |
| `cc(ch)` | パレット文字を、`wp`に渡す数にする |
| `flush(outline = true, color = "K")` | ここまで描いた分を確定します。`outline`が`true`なら、確定した絵の外側に1画素の輪郭線を付けます。`false`なら付けません |
| `spr(px, py, rows, map?, flip?)` | 画面の位置`(px, py)`にドット絵を置く。`rows`は文字の配列（`.`は透明）、`map`は文字の置き換え（`{ a: "b" }`）、`flip`は左右反転 |
| `sprAt(x, y, z, rows, ax, ay, map?)` | ワールド座標に、ドット絵の`(ax, ay)`の画素を合わせて置く |
| `standAt(x, y, z, rows, map?)` | ドット絵の足もとの真ん中を、ワールド座標に合わせて置く |
| `paintL(y, x0, zTop, rows, map?)` | `+Y`向きの面（左の面）に、ドット絵を貼る。列が`x0`から`x`方向、行が`zTop`から下方向 |
| `paintR(x, y, zTop, rows, map?)` | `+X`向きの面（右の面）に貼る。列が`y`から`-y`方向 |
| `PX(x, y)`・`PY(x, y, z)` | ワールド座標から画面の位置。`spr`に渡す位置の計算用 |
| `isLit()` | 夕方・夜で照明が点いているか |
| `occupantOf(seatId)` | 席に座っている人の`{ id, name }`。いなければ`null` |
| `now()` | 現在時刻（ミリ秒）。動く絵用 |

`wp`・`box`・`paintL`・`paintR`などは、いったん下書きの層に描き、`flush()`で確定します。後から確定した層が、先の層の上に重なります。置き物の絵は、輪郭線を付けて確定する（`flush()`）のが普通です。

### 転置のとき

`sym`や、`art`にない向きのために、エンジンが置き物を転置して描くことがあります（`x`と`y`を入れ替えるので、画面では左右の鏡像）。

- `box`・`wp`・`PX`・`PY`は、自動で座標を入れ替えます。`box`は左右の面の色も入れ替えるので、明るさの向きは保たれます。プラグインは何もしなくて構いません。
- `d.dir`は転置前の`art`の向きなので、向きごとに絵を分ける必要はありません。
- `spr`・`sprAt`・`standAt`は、置く位置だけが転置されます。ドット絵の中身は反転しません。文字や左右非対称の絵は、転置の向きでは反対側に置かれても、絵自体は元のままです。

## サーバー（server.ts）

`export default`で`{ state?, actions?, get? }`を返します。型は`PluginServer`です。

```ts
import type { PluginServer } from "@/plugins/types";

const server: PluginServer = {
  state: async (ctx) => ({ /* … */ }),
  actions: { press: async (ctx, payload) => { /* … */ } },
  get: async (ctx, params) => { /* … */ },
};
export default server;
```

### ctx

3つの関数（`state`・`actions`の各操作・`get`）の最初の引数です。呼ばれるたびに作られます。

| 項目 | 意味 |
|---|---|
| `user` | 操作した人。`{ id, name, isAdmin }` |
| `locale` | その人の言語（`"ja"`か`"en"`） |
| `now` | 現在の`Date` |
| `date` | 設定のタイムゾーンでの今日。`YYYY-MM-DD` |
| `t(key, vars?)` | その人の言語で文言を引く |
| `store` | 保存場所（次の節） |
| `people()` | 非同期（`await`）。今日在室している人。`{ id, name, room, seatId, away }`の配列。`id`は`ctx.user.id`と同じ種類のid、`room`は部屋のidで、名前は`rooms()`で引きます。`seatId`は席に座っていない人（会議室にいる、置き物が外れて席が無くなった）では`null`です。退室を押し忘れた人は含まれません |
| `rooms()` | 非同期。公開中のマップの部屋。`{ id, name, kind, floor }`の配列（`floor`は階のid。`kind`は`work`・`meeting`・`break`・`free`・`hall`のどれか） |
| `items()` | 非同期。公開中のマップにある、このプラグインの置き物。`{ id, type, floor, x, y, dir, props }`の配列。`floor`は階のid、`props`は初期値込みです |
| `fail(status, key, vars?)` | そのHTTPステータスと、文言のキーを引いたメッセージで失敗を返す。呼んだ所から先は実行されません（戻り値は`never`） |

`fail`のメッセージは、操作した人の言語で返ります。画面の`send`は、このメッセージを`message`に持つ`Error`で失敗します（`status`も付きます）。`ctx.fail`を使わずに例外を投げると、画面には「サーバーでエラーが発生しました。」（500）としか返らず、詳細はサーバーのログにだけ出ます。入力が悪い・権限がないといった想定内の失敗は`fail`を使ってください。

`fail`のキーは、プラグイン自身の`plugin.<id>.…`のほかに、本体の文言のキーも使えます（ダーツは`vo.err.badRequest`を使っています）。たとえば`vo.err.badRequest`（リクエストの形式が不正です。）、`vo.err.noSuchRoom`（その部屋はありません。）、`vo.err.notEntered`（入室していません。）、`vo.err.tooFast`（少し待ってからもう一度操作してください。）です。本体のキーは更新で変わることがあるので、長く使うものは自分のキーを作るほうが安全です。

`fail`の戻り値は`never`ですが、`if (…) ctx.fail(…)`と書くだけでは、TypeScriptはその下で型を絞りません。`ctx`が文脈から型付けされていて、明示の型注釈が無いためで、絞られていない値を使う行が`next build`の型検査で落ちます。`return ctx.fail(…)`か、`const v = ok ? x : ctx.fail(…)`の形で書いてください。

```ts
reset: async (ctx) => {
  if (!ctx.user.isAdmin) return ctx.fail(403, "plugin.hello.adminOnly");
  await ctx.store.set("count", 0);
},
```

### 保存（ctx.store）

プラグインごとの、キーと値の保存場所です。データベースの`PluginData`テーブルに入り、再起動しても残ります。

| 関数 | 意味 |
|---|---|
| `get(key)` | 値を返す。なければ`undefined` |
| `set(key, value)` | 値を保存する |
| `update(key, fn)` | `fn(現在の値)`の返り値を保存し、その値を返す。`fn`は非同期でもよい |
| `delete(key)` | 消す |
| `keys(prefix?)` | キーの一覧。`prefix`で始まるものだけに絞れる |

- 上限：**keyは1〜200字の文字列、valueはJSONにして1MBまで**。超える・JSONにできない値を渡すと例外になります。
- 最初に使ったとき、そのプラグインの全部の行をメモリに読みます。以降の`get`・`keys`はメモリだけを見るので、`state`の中で呼んでも、4秒ごとにデータベースを読みに行きません。書き込みはデータベースとメモリの両方です。
- `get`と`update`は複製を返すので、返ってきた値を書き換えても保存した値は変わりません。
- `update`の`fn`の中で`ctx.fail`などを投げると、何も保存されません（`update`も投げ直します）。`fn`の中の`fail`は、三項演算子の形で書けます（`fn`の戻り値に`never`が混ざるだけなので、型は`number`のままです）。
- `keys()`の順番は決まっていません（再起動後はデータベースの読み出し順で、そのあとに足したキーが後ろに付きます）。順番が要るなら、受け取ってから並べ替えてください。
- 全部の行をメモリに持つので、日ごとの履歴のように増え続けるデータは、古いものを`delete`で消してください。
- **`update`の順番の保証**：`update`は、同じ（プラグイン, key）の`update`どうしが、1つのプロセスの中で順番に実行されます（前の`fn`が終わってから次の`fn`）。カウンターのような「読んで足して書く」処理は`update`で書いてください。`get`のあとに`set`を書く方法だと、同時に来た2つの操作が同じ値を読んで、片方が消えます。
- 保証されない範囲：`set`・`delete`は順番待ちに入りません。`set`と`update`が同じキーに同時に来たときの順番は決まっていません。複数のキーをまたぐ更新も、まとめて1つの取引にはなりません。Pixeloftはappのプロセスを1つで動かす前提なので、プロセスをまたぐ競合は考えていません（[運用](../operations/)を参照）。

### state・actions・getの呼ばれ方

| 関数 | いつ呼ばれるか | 返したもの |
|---|---|---|
| `state(ctx)` | オフィスの画面からの状態取得（`GET /api/office/state`）のたびに、人ごとに呼ばれる。画面を開いている間は約4秒ごと、タブが隠れている間は約60秒ごと。`actions`の操作のあとにも、そのプラグインの分だけ呼ばれる | 状態としてその人の画面に届き、置き物の絵の`d.state`と、画面の`api.state()`になる |
| `actions.<名前>(ctx, payload)` | 画面の`api.send("<名前>", payload)`のとき（`POST /api/office/plugins/<id>`）。本文は`{ action, payload }`のJSONで、10,000字まで | `send`の返り値になる（`undefined`は`null`） |
| `get(ctx, params)` | 画面の`api.get(params)`のとき（`GET /api/office/plugins/<id>?…`） | `get`の返り値になる（`undefined`は`null`） |

- **`state`は軽く書いてください。** ユーザーの人数ぶん、約4秒ごとに呼ばれます。1秒の共有キャッシュには入れていません。`store.get`はメモリだけを見るので軽く、外部への通信やデータベースへの問い合わせを`state`の中に置くのは避けてください。
- **`state`は1秒で打ち切られます。** プラグインごとに待つ時間が1秒で、超えるとそのプラグインの分だけ状態から抜かれます。1つのプラグインの遅れで、本体の状態取得が遅れないようにするためです。打ち切られても関数そのものは止まらず、走り続けます（中で呼んだ`store.update`などの保存は行われます）。
- `state`が例外を投げたときも、そのプラグインの分だけ状態から抜かれ（画面には`undefined`が渡る）、サーバーのログにエラーが出ます。ほかのプラグインや本体の状態には影響しません。
- `state`の返り値はJSONにできる値にしてください。返した値が、そのプラグインの状態をそのまま置き換えます（`null`を返せば`null`になります。差分の更新ではありません）。`undefined`を返すと、そのプラグインの状態は入りません。
- `actions`の操作のあとの状態も同じです。`undefined`を返した・`state`が無い・例外を投げた・打ち切られたときは、応答に状態が入らず、画面は前の状態のままです。
- `get`は、窓を開いている人だけが短い間隔（たとえば1秒ごと）で取りたいもの用です。自動では呼ばれません。画面のコードが`setInterval`などで呼びます。`get`を持たないプラグインへのGETは、「このプラグインはGETを受け付けません。」の404です（プラグインがないときの404とは文言が違います）。`Sec-Fetch-Site`が`cross-site`か`same-site`のGETは403です。
- 操作の名前が`actions`にない・プラグインが`actions`を持たないときは400、プラグインがないときは404です。
- `params`はクエリの文字列が、`Record<string, string>`で入ります（同じ名前を繰り返すと最後のもの）。`?since=`も、ほかの名前と同じ文字列として渡ります。
- ログインしていない要求は、プラグインに届く前に断られます。オリジンの確認は、POST（`actions`）と、GETの`Sec-Fetch-Site`だけです。`state`はオリジンを確かめません（[安全の注意](#安全の注意)を参照）。

## 画面（client.ts）

`export default function setup(api)`を書きます。`api`は`PluginApi`です。

`setup`は、オフィスの画面でエンジンを作る直前に、プラグインごとに1回呼ばれます。**`menu`と`onItemClick`は、`setup`の中（同期）で呼んだものだけが効きます。** 非同期の処理の中や、あとから呼んでも出ません。`setup`が例外を投げても、そのプラグインの画面だけが出ず、ほかには影響しません。`setup`が関数を返すと、画面を外すとき（エンジンの`dispose`）に後片付けとして呼ばれます。`onState`の解除や、Reactの`root.unmount()`などを返してください（ダーツは`unmount`を返しています。Reactの描画中に呼ばれることがあるので、`queueMicrotask`で遅らせています）。

| 項目 | 意味 |
|---|---|
| `id`・`locale` | プラグインのidと、画面の言語 |
| `t(key, vars?)` | 文言を引く |
| `send(action, payload?)` | サーバーの操作を呼ぶ。サーバーの返り値が`Promise`で返る。操作のあとの状態は、すぐ絵と`onState`に流れる。失敗は、サーバーのメッセージを`message`に持つ`Error`（`status`付き） |
| `get(params?)` | サーバーの`get`を呼ぶ |
| `state()` | いまの状態（サーバーの`state(ctx)`の値）。まだ届いていなければ`undefined` |
| `onState(cb)` | 状態を受け取るたび（値が変わっていなくても）、約4秒ごと（タブが隠れている間は約60秒ごと）と、`send`のあとに`cb(state)`を呼ぶ。解除する関数を返す |
| `me()` | `{ id, name, isAdmin, room, seatId }`。在室していなければ`room`・`seatId`は`null` |
| `menu(label, onClick)` | HUDのメニューに項目を足す（`setup`の中で呼ぶ） |
| `onItemClick(type, label, cb)` | その種類の置き物の上に、`label`のボタンを出す。押すと`cb(item)`（`setup`の中で呼ぶ）。`item`は`ctx.items()`の要素（`PluginMapItem`）と同じ形で、`floor`はいま見ている階のid、`props`にはカタログの初期値が入っています。見ている階の置き物だけに出て、エディタのプレビューでは出ません。同じ`type`で2回呼ぶと、あとのものになります |
| `dock` | HUDの中の、小窓を置く場所（`HTMLElement`）。中身はDOMで作ります。プラグインごとに別の枠です |
| `dialog(title)` | 本体と同じ見た目のダイアログを開く。`{ body, close }`が返り、`body`に中身を入れる。閉じるとDOMから外れる |

小窓とダイアログの見た目は、本体のクラスとCSS変数を使うと揃います（`src/engine/office.css`にあります。本体の内部なので、更新で変わることがあります）。

| クラス | 使う所 |
|---|---|
| `win` | 枠（紺の背景・白と黒の二重の枠）。`dock`の中の要素に付けると、本体の窓と同じになります。`api.dialog`の外枠は`win`で、タイトルの`h3`と閉じるボタンの`x`も本体のとおりです |
| `pbtn` | ボタン。`pbtn sm`（小さいボタン）、`pbtn go`（緑の主ボタン）、`pbtn ghost`（紺の背景の上に置く、枠だけのボタン） |

| CSS変数 | 意味 |
|---|---|
| `--vo-font` | 本体の書体 |
| `--hud-top` | 上のバーの高さ |
| `--cb` | 下のカードの上端の、画面の上からの位置（ダーツは`max-height`に使って、窓が下のカードに被らないようにしています） |
| `--k`・`--o`・`--N`・`--l`・`--Y` | 本体の色（黒・白に近い色・紺・緑・薄い黄） |

ダイアログの中の`<button>`と`<input>`は、クラスを付けないとブラウザの素の見た目になります。ボタンには`pbtn`を付けてください。入力欄に付けるクラスは本体に無いので、`style`か自分のCSSで、背景（`var(--o)`）・文字と枠（`var(--k)`）を付けます。
Reactを使うなら、`dock`の中に自分で`createRoot`します。CSSは、`client`から`import "./darts.css";`のように読み込めます（`plugins/darts/darts.css`）。クラス名は本体とぶつからないよう、プラグインごとの接頭辞（ダーツは`vo-darts-`）を付けてください。

### 本番のCSP

本番（`NODE_ENV=production`）だけ、Content-Security-Policyがかかります（`next.config.ts`）。画面のコードが読み込めるのは、自分のサイトだけです。`connect-src 'self'`（`fetch`・WebSocketなどの接続先）・`img-src 'self' data: blob:`・`font-src 'self' data:`で、`script-src`・`default-src`も自分のサイトだけです。外部のAPIや画像は、画面から直接取らず、サーバーの`get`か`actions`で取って渡してください。`npm run dev`ではCSPがかからないので、動いても本番で止まることがあります。

## 開発の流れ

1. `plugins/<id>/`にファイルを書きます。`examples/hello/`を`plugins/`にコピーして始められます（[通しの例](#通しの例)）。
2. DBの用意などは[運用の開発の節](../operations/#開発)のとおりです。`npm run dev`で起動すると、オフィスの画面は`/`、エディタは`/editor`で開けます。起動前に`scripts/plugins.mjs`が走り、`src/plugins/generated/`（Gitの管理外）に取り込み用のファイルを作ります。`npm run build`・`test`・`lint`・`build:pages`・`build:thumbs`の前にも自動で走ります。`next dev`や`tsc`を直接動かすときは、先に`node scripts/plugins.mjs`を手で実行してください。
3. プラグインのフォルダやファイルを足す・消す・名前を変えたときは、`node scripts/plugins.mjs`を実行し直してください（生成されるファイルの内容が変わるため）。既存のファイルの中身を直すだけなら、生成し直す必要はありません。
4. `npm test`は、`src/`の`*.test.ts`に加えて、`plugins/**/*.test.ts`・`examples/**/*.test.ts`も実行します。`node:test`で書きます。テスト用のctxの作り方は、下の「テストを書く」を見てください。テストは`node`が直接実行するため、`@/`のパス指定は型の`import type`だけに使えます。テストから読む`server.ts`とその先のファイルが実行時に読むものは、`../../src/…/xxx.ts`のように相対パス（拡張子付き）で書いてください。`node scripts/plugins.mjs`やテストの実行で`MODULE_TYPELESS_PACKAGE_JSON`の警告が出ますが、害はありません（`package.json`に`type`が無いため、Nodeが読み直しているだけです）。
5. 置き物を作ったら、ホストで`npm run build:thumbs`を1回実行して、サムネイルを`plugins/<id>/thumbs/`に作ります（[サムネイル](#サムネイル)）。

### テストを書く

`src/plugins/testing.ts`の`makeTestCtx(overrides?)`で、`PluginCtx`型のテスト用のctxを作れます。`store`は本物の`makeStore`にメモリのDBを渡したもので、`update`の順番と複製の動きが本番と同じです。`fail`は本物と同じ`VoError`（`status`と、文言のキーを入れた`message`を持つ）を投げます。`user`（既定は管理者でない`u1`）・`locale`・`now`・`date`・`t`（キーをそのまま返す）・`people`・`rooms`・`items`・`store`は、引数で上書きできます。`people`・`rooms`・`items`は非同期の関数で、既定は空の配列を返します（`people: async () => [{ id: "a", … }]`のように書きます）。`store`は呼ぶたびに新しいメモリのDBになります。同じデータで別の人として試すなら、下の例のように`makeTestCtx({ store: a.store })`で`store`を渡します。`items`の置き物を変数に切り出すときは、`dir`を`"x+" as const`と書きます（書かないと`string`型に広がって型が合いません）。

`examples/hello/server.test.ts`と同じ中身です。

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { makeTestCtx } from "../../src/plugins/testing.ts";
import server from "./server.ts";

test("pressで1ずつ増える", async () => {
  const ctx = makeTestCtx();
  await server.actions!.press(ctx, undefined);
  await server.actions!.press(ctx, undefined);
  assert.deepEqual(await server.state!(ctx), { count: 2, placed: 0 });
});

test("resetは管理者だけ", async () => {
  const ctx = makeTestCtx();
  // actionsの戻り値はunknown | Promise<unknown>なので、asyncで包んでrejectsに渡す
  await assert.rejects(async () => server.actions!.reset(ctx, undefined), { status: 403, message: "plugin.hello.adminOnly" });
  await server.actions!.reset({ ...ctx, user: { ...ctx.user, isAdmin: true } }, undefined);
});

test("別の人から見ても同じ回数", async () => {
  const a = makeTestCtx({ user: { id: "a", name: "A", isAdmin: false } });
  const b = makeTestCtx({ store: a.store }); // storeを渡すと同じデータになる。渡さなければ別々
  await server.actions!.press(a, undefined);
  assert.deepEqual(await server.state!(b), { count: 1, placed: 0 });
});
```

`actions`の戻り値の型は`unknown | Promise<unknown>`なので、`assert.rejects`には`async () => …`で包んで渡してください。包まないと型が通らず、同期で投げる操作は、テストの側に例外が漏れます。

## 参考

### 描き直しの間隔

エンジンは状態と関係なく、ウィンドウにフォーカスがあるあいだ0.5秒ごと（人が歩いている・ドラッグ中は0.1秒ごと、扉やエモーションが動いているあいだは0.2秒ごと）、フォーカスが無いと1秒ごとに描き直します。タブが隠れている間は描きません。描き直すたびに、画面に映っている範囲の置き物の関数が呼ばれるので、動く絵は`k.now()`を見て`draw.js`の中で動かせます。状態に毎回変わる値（時刻など）を入れると、状態を受け取るたび（約4秒ごと）に余分に1回描き直しますが、フォーカス中の描き直しが0.5秒ごとなので、避けるほどのコストではありません。ダーツは持ち時間の残りをサーバーの時計に合わせるため、`state`に`now`を入れています。

### パレット文字

色は1文字で書きます。昼夜や天気に応じて、エンジンが自動で明るさを変えます。よく使うものを挙げます（全部は`src/engine/sprites.js`の`PAL`にあります）。

| 色の系統 | 文字（明るい → 暗い） |
|---|---|
| 無彩色 | `W`（白）・`V`・`U`／`l`・`m`・`n`・`k`・`K`（黒に近い。輪郭線の色） |
| 木・茶色 | `a`・`b`・`c`・`d`・`e` |
| ベージュ | `f`・`g`・`h` |
| 肌 | `S`・`s`・`t` |
| 緑 | `p`・`q`・`r` |
| 水色・青 | `G`・`H`／`B`・`N` |
| 赤 | `R`・`Q` |
| 黄・橙 | `Y`・`O` |
| 青緑 | `T`・`J` |
| 灰色の面 | `u`・`v`・`w`（アスファルト）、`X`・`Z`（石） |
| ほか | `+`（ピンク）、`I`（真鍮）、`*`（照明そのもの。夜でも暗くならない） |

`x`・`z`・`i`は、窓の外の空や遠景のための色で、時間帯と天気で差し替わります。

### 上限の一覧

| 項目 | 上限 | 備考 |
|---|---|---|
| id | `^[a-z][a-z0-9-]{1,30}$`（2〜31字） | `scripts/plugins.mjs`がビルドで確認 |
| `store`のkey | 1〜200字の文字列 | 超えると例外 |
| `store`のvalue | JSONにして1MB（1,048,576バイト）まで | JSONにできない値（`undefined`など）も例外 |
| 操作の本文（`{ action, payload }`） | 10,000字まで | 超えると413 |
| `state`の更新の間隔 | 表示中は約4秒、タブが隠れている間は約60秒 | 失敗が続くと、30秒まで間隔が伸びる |
| `get`の間隔 | 決まりなし | 画面のコードが決める |
| 1つのマップ | 5階・1階あたり64×64マス・JSONで2MB | [マップエディタ](../map-editor/)を参照 |
