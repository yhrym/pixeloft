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
