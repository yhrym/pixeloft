import assert from "node:assert/strict";
import test from "node:test";
import { DOOR_KINDS, FLOOR_KINDS, WALL_KINDS } from "../../engine/catalog.js";
import { hasErrors, validateMap, MAP_MAX_BYTES } from "./validate.ts";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const good = (): Any => ({
  version: 1, name: "t", backdrop: "city",
  floors: [{
    id: "f1", name: "1F",
    rooms: [{ id: "r1", name: "Work", kind: "work", rects: [[0, 0, 256, 192]] }, { id: "r2", name: "Hall", kind: "hall", rects: [[256, 0, 320, 192]] }],
    walls: [{ axis: "y", at: 256, a: 0, b: 192, kind: WALL_KINDS[0] }],
    doors: [{ id: "d1", axis: "y", at: 256, a: 64, b: 96, kind: DOOR_KINDS[0] }],
    items: [
      { id: "e1", type: "elevator", x: 256, y: 100, dir: "y+", props: { entrance: true } },
      { id: "i1", type: "desk-island", x: 100, y: 100, dir: "x+", props: { perSide: 2 } },
    ],
  }],
});
const keys = (m: unknown, level?: string) => validateMap(m).filter((i) => !level || i.level === level).map((i) => i.key);
const mutate = (fn: (m: Any) => void) => { const m = good(); fn(m); return m; };

test("正しいマップは問題なし", () => assert.deepEqual(validateMap(good()), []));

test("大きすぎるJSON・階の数・外形", () => {
  assert.deepEqual(keys(mutate((m) => { m.name = "x".repeat(MAP_MAX_BYTES); })), ["map.err.tooLarge"]);
  assert.ok(keys(mutate((m) => { m.floors = []; })).includes("map.err.noFloors"));
  assert.ok(keys(mutate((m) => { m.floors = Array.from({ length: 6 }, (_, i) => ({ ...good().floors[0], id: `f${i}` })); })).includes("map.err.tooManyFloors"));
  assert.ok(keys(mutate((m) => { m.floors[0].rooms[1].rects = [[1024, 0, 1100, 64]]; })).includes("map.err.bboxTooLarge"));
});

test("idの重複(階をまたぐ置き物・部屋も)と形式", () => {
  assert.ok(keys(mutate((m) => { m.floors[0].items[1].id = "e1"; })).includes("map.err.dupId"));
  assert.ok(keys(mutate((m) => { m.floors.push({ ...good().floors[0], id: "f2" }); })).includes("map.err.dupId"));
  assert.ok(keys(mutate((m) => { m.floors[0].rooms[0].id = "a b"; })).includes("map.err.badId"));
});

test("置き物の種類・向き・props・季節", () => {
  assert.ok(keys(mutate((m) => { m.floors[0].items[1].type = "nope"; })).includes("map.err.badItemType"));
  assert.ok(keys(mutate((m) => { m.floors[0].items[1].type = "constructor"; })).includes("map.err.badItemType"));
  assert.ok(keys(mutate((m) => { m.floors[0].items[1].dir = "up" as never; })).includes("map.err.badDir"));
  assert.ok(keys(mutate((m) => { m.floors[0].items[1].props = { perSide: "2" }; })).includes("map.err.badProp"));
  assert.ok(keys(mutate((m) => { m.floors[0].items[1].props = { perSide: 1e9 }; })).includes("map.err.badProp"));
  assert.ok(keys(mutate((m) => { m.floors[0].items[1].props = { unknown: 1 }; })).includes("map.err.badProp"));
  assert.ok(keys(mutate((m) => { m.floors[0].items[1].season = "nope"; })).includes("map.err.badSeason"));
  assert.deepEqual(keys(mutate((m) => { m.floors[0].items[1].season = "xmas"; })), []);
});

test("壁・扉の種類、部屋の種類・矩形", () => {
  assert.ok(keys(mutate((m) => { m.floors[0].walls[0].kind = "nope"; })).includes("map.err.badWallKind"));
  assert.ok(keys(mutate((m) => { m.floors[0].doors[0].kind = "nope"; })).includes("map.err.badDoorKind"));
  assert.ok(keys(mutate((m) => { m.floors[0].rooms[0].kind = "nope"; })).includes("map.err.badRoomKind"));
  assert.ok(keys(mutate((m) => { m.floors[0].rooms[0].rects = []; })).includes("map.err.roomNoRects"));
  assert.ok(keys(mutate((m) => { m.floors[0].rooms[0].rects = [[10, 0, 0, 10]]; })).includes("map.err.badRect"));
});

test("重なり: 部屋の矩形(同じ部屋の中も)・ブロックする置き物。接するだけならよい", () => {
  assert.ok(keys(mutate((m) => { m.floors[0].rooms[1].rects = [[200, 0, 320, 192]]; })).includes("map.err.roomOverlap"));
  assert.ok(keys(mutate((m) => { m.floors[0].rooms[0].rects.push([100, 0, 300, 10]); })).includes("map.err.roomOverlap"));
  assert.ok(keys(mutate((m) => { m.floors[0].items.push({ id: "i2", type: "desk-island", x: 110, y: 100, dir: "x+" }); })).includes("map.err.itemOverlap"));
  assert.ok(!keys(mutate((m) => { m.floors[0].items.push({ id: "i2", type: "desk-island", x: 100 + 48 + 0, y: 100, dir: "x+", props: { perSide: 2 } }); })).includes("map.err.itemOverlap"));
});

test("上限: 1階の矩形4096個・置き物20000個(重なりを調べる前に弾く)。上限内なら重なりなしで通る", () => {
  const rects = (n: number) => Array.from({ length: n }, (_, i) => [1000 + (i % 100) * 10, Math.floor(i / 100) * 10, 1000 + (i % 100) * 10 + 10, Math.floor(i / 100) * 10 + 10]);
  const wide = (n: number) => mutate((m) => { m.floors[0].rooms[1].rects = rects(n); });
  const k = keys(wide(5000), "error");
  assert.ok(k.includes("map.err.tooManyRects") && !k.includes("map.err.roomOverlap"));
  assert.ok(!keys(wide(3000)).includes("map.err.tooManyRects"));
  assert.ok(!keys(wide(3000)).includes("map.err.roomOverlap"));
  assert.ok(keys(mutate((m) => { m.floors[0].items.push(...Array.from({ length: 20001 }, (_, i) => ({ id: `p${i}`, type: "plant-big", x: i, y: 0, dir: "y+" }))); })).includes("map.err.tooManyItems"));
});

test("重なりの報告は同じ順(入力順の若いほうから)で、件数に上限がある", () => {
  const ov = mutate((m) => { m.floors[0].rooms = [{ id: "a", name: "A", kind: "work", rects: [[0, 0, 20, 20], [30, 0, 50, 20]] }, { id: "b", name: "B", kind: "hall", rects: [[40, 0, 60, 20], [10, 0, 35, 20]] }]; });
  assert.deepEqual(validateMap(ov).filter((i) => i.key === "map.err.roomOverlap").map((i) => [i.id, i.vars?.other]), [["a", "B"], ["a", "B"], ["a", "B"]]); // 矩形の組(0,3)(1,2)(1,3)の順
  const many = mutate((m) => { m.floors[0].rooms = [{ id: "a", name: "A", kind: "work", rects: Array.from({ length: 300 }, () => [0, 0, 10, 10]) }]; });
  assert.equal(keys(many).filter((x) => x === "map.err.roomOverlap").length, 100);
});

test("入口がない階はエラー。props.entranceがあってもカタログに入口がない置き物は入口にならない", () => {
  assert.ok(keys(mutate((m) => { m.floors[0].items.shift(); })).includes("map.err.noEntrance"));
  assert.ok(keys(mutate((m) => { m.floors[0].items[0].props = { entrance: false }; })).includes("map.err.noEntrance"));
  assert.ok(keys(mutate((m) => { m.floors[0].items[0] = { id: "p", type: "plant-big", x: 0, y: 0, dir: "x+", props: { entrance: true } }; })).includes("map.err.badProp"));
});

test("40字を超える名前・札", () => {
  const long = "x".repeat(41);
  assert.ok(keys(mutate((m) => { m.name = long; })).includes("map.err.tooLong"));
  assert.ok(keys(mutate((m) => { m.floors[0].name = long; })).includes("map.err.tooLong"));
  assert.ok(keys(mutate((m) => { m.floors[0].rooms[0].name = long; })).includes("map.err.tooLong"));
  assert.ok(keys(mutate((m) => { m.floors[0].items.push({ id: "dk", type: "desk", x: 10, y: 10, dir: "x+", props: { label: long } }); })).includes("map.err.badProp"));
});

test("警告: 部屋の外の席・扉のない部屋", () => {
  const m = mutate((m) => { m.floors[0].items[1].x = 400; m.floors[0].doors = []; });
  const w = validateMap(m).filter((i) => i.level === "warning");
  assert.ok(w.some((i) => i.key === "map.warn.seatOutside" && i.id === "i1"));
  assert.equal(w.filter((i) => i.key === "map.warn.roomNoDoor").length, 2);
  assert.equal(hasErrors(validateMap(m)), false);
});

test("信用できない入力: 型違い・null・配列・__proto__・循環", () => {
  for (const bad of [null, 1, "x", [], {}, { version: 2 }, mutate((m) => { m.floors = {}; }), mutate((m) => { m.floors[0] = null; }),
    mutate((m) => { m.floors[0].rooms[0] = 5; }), mutate((m) => { m.floors[0].items[1].x = "1"; }), mutate((m) => { m.floors[0].items[1].x = NaN; }),
    mutate((m) => { m.floors[0].items[1].props = []; }), mutate((m) => { m.floors[0].walls[0].a = null; }), mutate((m) => { m.backdrop = "moon"; })]) {
    assert.ok(hasErrors(validateMap(bad)), JSON.stringify(bad));
  }
  const polluted = JSON.parse('{"version":1,"name":"t","backdrop":"city","floors":[{"__proto__":{"x":1}}]}');
  assert.deepEqual(keys(polluted), ["map.err.forbiddenKey"]);
  assert.deepEqual(keys(JSON.parse('{"version":1,"name":"t","backdrop":"city","floors":[],"constructor":{}}')), ["map.err.forbiddenKey"]);
  assert.equal(({} as Any).x, undefined);
  const loop: Any = good(); loop.self = loop;
  assert.ok(hasErrors(validateMap(loop)));
});

test("i18n: カタログの全idと、検証のkeyが日英にある", async () => {
  const { CATALOG } = await import("../../engine/catalog.js");
  const { default: ja } = await import("../../i18n/ja.json", { with: { type: "json" } });
  const { default: en } = await import("../../i18n/en.json", { with: { type: "json" } });
  const src = (await import("node:fs")).readFileSync(new URL("./validate.ts", import.meta.url), "utf8");
  const keys = [...Object.keys(CATALOG).filter((k) => !k.includes(":")).map((k) => `catalog.${k}`), ...[...src.matchAll(/"(map\.(?:err|warn)\.\w+)"/g)].map((m) => m[1])];
  for (const k of keys) { assert.ok(k in ja, `ja ${k}`); assert.ok(k in en, `en ${k}`); }
});

test("カタログに無い「プラグイン:名前」の置き物は pluginMissing、それ以外の知らない種類は badItemType のまま", () => {
  const ks = keys(mutate((m) => { m.floors[0].items[1].type = "demo:dart"; }));
  assert.ok(ks.includes("map.err.pluginMissing") && !ks.includes("map.err.badItemType"));
  assert.deepEqual(validateMap(mutate((m) => { m.floors[0].items[1].type = "demo:dart"; })).find((i) => i.key === "map.err.pluginMissing")?.vars, { plugin: "demo" });
  assert.ok(keys(mutate((m) => { m.floors[0].items[1].type = "dart"; })).includes("map.err.badItemType"));
});

test("種類の一覧は実行時のカタログの値で検査する(全種類が通り、一覧にない値は弾く)", () => {
  assert.ok(FLOOR_KINDS.length > 0 && WALL_KINDS.length > 0 && DOOR_KINDS.length > 0);
  for (const k of FLOOR_KINDS) assert.deepEqual(keys(mutate((m) => { m.floors[0].rooms[0].floor = k; })), []);
  for (const k of WALL_KINDS) assert.deepEqual(keys(mutate((m) => { m.floors[0].walls[0].kind = k; })), []);
  for (const k of DOOR_KINDS) assert.deepEqual(keys(mutate((m) => { m.floors[0].doors[0].kind = k; })), []);
  assert.ok(keys(mutate((m) => { m.floors[0].rooms[0].floor = "nope"; })).includes("map.err.badFloorKind"));
});

test("部屋に関するメッセージは名前を持つ", () => {
  const w = validateMap(mutate((m) => { m.floors[0].doors = []; m.floors[0].rooms[0].name = "Alpha"; }));
  assert.ok(w.some((i) => i.key === "map.warn.roomNoDoor" && i.vars?.name === "Alpha"));
  const o = validateMap(mutate((m) => { m.floors[0].rooms[1].rects = [[200, 0, 320, 192]]; m.floors[0].rooms[0].name = "Alpha"; m.floors[0].rooms[1].name = "Beta"; }));
  assert.ok(o.some((i) => i.key === "map.err.roomOverlap" && i.vars?.name === "Alpha" && i.vars?.other === "Beta"));
});

test("表札が部屋の外なら警告(エラーではない)", () => {
  assert.deepEqual(keys(mutate((m) => { m.floors[0].rooms[0].sign = [8, 176]; })), []);
  const m = mutate((x) => { x.floors[0].rooms[0].sign = [0, 0]; x.floors[0].rooms[0].rects = [[16, 16, 256, 192]]; });
  assert.ok(keys(m, "warning").includes("map.warn.signOutside"));
  assert.ok(!hasErrors(validateMap(m)));
});
