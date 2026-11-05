import assert from "node:assert/strict";
import test from "node:test";
import type { PluginServer } from "../../plugins/types.ts";
import { pluginStates, type CtxBase } from "./index.ts";

const b = { user: { id: "u", name: "U", role: "user" }, locale: "ja", now: new Date(), date: "2026-11-01", idx: {}, users: async () => [] } as unknown as CtxBase;

test("stateが遅いプラグインだけ抜き、ほかは待たない", async () => {
  const list: Record<string, PluginServer> = {
    slow: { state: () => new Promise(() => {}) },
    fast: { state: () => ({ n: 1 }) },
    boom: { state: () => { throw new Error("x"); } },
  };
  const log = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await pluginStates(b, list, 30), { fast: { n: 1 } });
  } finally {
    console.error = log;
  }
});
