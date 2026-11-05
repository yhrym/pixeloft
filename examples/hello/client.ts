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
