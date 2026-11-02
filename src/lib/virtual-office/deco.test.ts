import assert from "node:assert/strict";
import test from "node:test";

import { DECOS, parseAction } from "./presence.ts";
import * as spritesMod from "../../engine/sprites.js";
// エンジンはJSなので型は見ない
const sprites = spritesMod as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

test("机の飾りはサーバーとクライアントで同じ記号で、絵は机の飾りの枠(幅9・高さ11)に収まる", () => {
  const client: [string, string][] = sprites.DECOS;
  assert.deepEqual(client.map(([k]) => k), DECOS);
  for (const k of DECOS) {
    const rows: string[] = sprites.DECO_SPR[k];
    assert.ok(rows, k);
    assert.ok(rows.length <= 11 && rows.every((r) => r.length === rows[0].length && r.length <= 9), k);
    for (const ch of rows.join("")) assert.ok(ch === "." || ch in sprites.PAL, `${k}: ${ch}`);
    assert.equal(parseAction({ type: "profile", deco: k }).type, "profile", `${k} is accepted by the profile action`);
  }
});
