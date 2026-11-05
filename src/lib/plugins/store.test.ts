import assert from "node:assert/strict";
import test from "node:test";
import { KEY_MAX, makeStore, VALUE_MAX_BYTES, type PluginDb } from "./store.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fakeDb = (rows: [string, unknown][] = []) => {
  const saved = new Map<string, unknown>(rows);
  let loads = 0;
  const db: PluginDb = {
    load: async () => { loads++; return [...saved]; },
    save: async (_p, k, v) => { await sleep(1); saved.set(k, v); },
    remove: async (_p, k) => { saved.delete(k); },
  };
  return { db, saved, loads: () => loads };
};

test("最初に全部読み、読むのはメモリだけ。書き込みはDBとメモリの両方", async () => {
  const f = fakeDb([["a", 1]]);
  const s = makeStore("x", f.db);
  assert.equal(await s.get("a"), 1);
  await s.set("b", { n: 2 });
  assert.deepEqual(await s.get("b"), { n: 2 });
  assert.deepEqual(f.saved.get("b"), { n: 2 });
  assert.deepEqual(await s.keys(), ["a", "b"]);
  assert.deepEqual(await s.keys("b"), ["b"]);
  await s.delete("a");
  assert.equal(await s.get("a"), undefined);
  assert.equal(f.loads(), 1);
});

test("updateは同じkeyなら順番に流れる(取り合いにならない)", async () => {
  const s = makeStore("x", fakeDb().db);
  await Promise.all(Array.from({ length: 20 }, () => s.update("n", async (cur) => { await sleep(1); return ((cur as number) ?? 0) + 1; })));
  assert.equal(await s.get("n"), 20);
});

test("updateが投げても次の更新は流れる", async () => {
  const s = makeStore("x", fakeDb().db);
  await assert.rejects(s.update("n", () => { throw new Error("boom"); }), /boom/);
  assert.equal(await s.update("n", () => 5), 5);
});

test("上限: keyは200字、valueはJSONで1MBまで", async () => {
  const s = makeStore("x", fakeDb().db);
  await s.set("k".repeat(KEY_MAX), 1);
  await assert.rejects(s.set("k".repeat(KEY_MAX + 1), 1));
  await assert.rejects(s.set("", 1));
  await s.set("big", "a".repeat(VALUE_MAX_BYTES - 2)); // 引用符を足してちょうど1MB
  await assert.rejects(s.set("big", "a".repeat(VALUE_MAX_BYTES - 1)));
  await assert.rejects(s.set("u", undefined));
});

test("updateが返した値を書き換えても保存した値は変わらない", async () => {
  const s = makeStore("x", fakeDb().db);
  ((await s.update("o", () => ({ a: 1 }))) as { a: number }).a = 9;
  assert.deepEqual(await s.get("o"), { a: 1 });
});

test("getが返した値を書き換えても保存した値は変わらない", async () => {
  const s = makeStore("x", fakeDb().db);
  await s.set("o", { a: 1 });
  ((await s.get("o")) as { a: number }).a = 9;
  assert.deepEqual(await s.get("o"), { a: 1 });
});
