/**
 * 終業後の自動退出のための「最後に触った時刻」。ブラウザだけで使う。
 * 触った = タブが見えている間の pointerdown・keydown・wheel・touchstart(pointermoveは30秒に1回まで)。ポーリングと裏のタブは数えない。
 * モジュールに持つので、クライアントの遷移でも同じ値
 */
let last = 0;

function touch(e: Event) {
  if (document.visibilityState !== "visible") return;
  const now = Date.now();
  if (e.type === "pointermove" && now - last < 30_000) return;
  last = now;
}

if (typeof window !== "undefined") {
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart", "pointermove"]) {
    window.addEventListener(type, touch, { capture: true, passive: true });
  }
}

/** stateのURLに `idle=<最後に触ってからの秒数>` を足す。まだ触っていなければそのまま(サーバーは最後に触った時刻を進めない) */
export function withIdle(url: string): string {
  if (!last) return url;
  return `${url}${url.includes("?") ? "&" : "?"}idle=${Math.floor((Date.now() - last) / 1000)}`;
}
