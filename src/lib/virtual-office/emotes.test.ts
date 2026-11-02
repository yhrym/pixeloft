import assert from "node:assert/strict";
import test from "node:test";

import { EMOTES, parseAction } from "./presence.ts";
import { putEmote, recentEmotes, EMOTE_MS, EMOTE_GAP_MS } from "./emotes.ts";
import * as spritesMod from "../../engine/sprites.js";
// エンジンはJSなので型は見ない
const sprites = spritesMod as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

test("エモーションはサーバーとクライアントで同じ記号・同じ順で、parseActionは全種を通し知らない値を弾く", () => {
  const client: [string, string][] = sprites.EMOTES;
  assert.deepEqual(client.map(([k]) => k), EMOTES);
  for (const k of EMOTES) assert.equal(parseAction({ type: "emote", emote: k }).type, "emote", k);
  assert.throws(() => parseAction({ type: "emote", emote: "nope" }));
  assert.throws(() => parseAction({ type: "emote" }));
});

test("putEmote: 6秒で消える・1秒以内の連打は書かない・別の人は独立", () => {
  const t = new Date("2026-10-26T10:00:00Z");
  const at = (ms: number) => new Date(t.getTime() + ms);
  assert.equal(putEmote("emote-a", "dance", t), true);
  assert.equal(putEmote("emote-a", "jump", at(EMOTE_GAP_MS - 1)), false);
  assert.equal(putEmote("emote-b", "heart", at(10)), true);
  const mine = (ms: number) => recentEmotes(at(ms)).filter((e) => e.userId.startsWith("emote-"));
  assert.deepEqual(mine(100).map((e) => [e.userId, e.emote]), [["emote-a", "dance"], ["emote-b", "heart"]]);
  assert.equal(mine(100)[0].at, t.toISOString());
  assert.equal(mine(EMOTE_MS - 1).length, 2);
  assert.deepEqual(mine(EMOTE_MS + 5).map((e) => e.userId), ["emote-b"]);
  assert.deepEqual(mine(EMOTE_MS + 20), []);
  assert.equal(putEmote("emote-a", "wow", at(EMOTE_GAP_MS)), true);
});

test("エモーションの絵は全種あり、7〜11マスで、外周は空き(輪郭を足すため)", () => {
  for (const k of EMOTES) {
    const rows: string[] = sprites.EMOTE_ICON[k];
    assert.ok(rows, k);
    assert.ok(rows.every((r) => r.length === rows[0].length), `${k}: 行の長さ`);
    assert.ok(rows.length >= 7 && rows.length <= 11 && rows[0].length >= 7 && rows[0].length <= 11, `${k}: 大きさ`);
    for (const ch of rows.join("")) assert.ok(ch === "." || ch in sprites.PAL, `${k}: ${ch}`);
    const edge = [rows[0], rows[rows.length - 1], ...rows.map((r) => r[0] + r[r.length - 1])].join("");
    assert.ok(/^\.*$/.test(edge), `${k}: 外周が空いていない`);
  }
});
