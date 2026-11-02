import assert from "node:assert/strict";
import test from "node:test";
import type { RoomInfo, SeatInfo } from "../../engine/map.js";
import { t } from "../../i18n/index.ts";
import { indexOf, type MapIndex } from "./map.ts";
import {
  AWAY_AFTER_MS, STALE_SEAT_MS, UNCHAT_MS, VoError, autoLeaveAt, autoLeaveFrom, canBump, checkMove, chatRoomOf, defaultLook,
  isAway, memoOf, overflowNotice, parseAction, parseIdle, parseSince, pickSeat, presenceView, returnNotice, seatingOf,
  sentTooSoon, toLook, unchatTooLate, withoutAnswered,
} from "./presence.ts";

/** VoErrorで、statusが合っていること */
const throwsVo = (fn: () => unknown, status: number) =>
  assert.throws(fn, (e: unknown) => e instanceof VoError && e.status === status);

// 架空の部屋・席(席の一覧はエンジンのseatsOfではなく直接組む)
const room = (id: string, kind: RoomInfo["kind"], name = id): RoomInfo => ({ id, name, kind, floor: "f1" });
const seat = (id: string, r: string, type = "office"): SeatInfo => ({ id, room: r, floor: "f1", type, x: 0, y: 0, face: "SE", item: r, no: 1 });
const seatsIn = (r: string, n: number, type = "office") => Array.from({ length: n }, (_, i) => seat(`${r}-${i + 1}`, r, type));
function fixture(extra: { rooms?: RoomInfo[]; seats?: SeatInfo[] } = {}): MapIndex {
  const idx = indexOf(null);
  const rooms = extra.rooms ?? [room("w1", "work", "Work 1"), room("w2", "work"), room("m1", "meeting", "Meet"), room("b1", "break", "Cafe"), room("l1", "free", "Lounge"), room("h1", "hall")];
  const seats = extra.seats ?? [
    ...seatsIn("w1", 3), ...seatsIn("w2", 2), seat("w1-boss", "w1", "boss"), ...seatsIn("m1", 2), ...seatsIn("b1", 2, "stool"), ...seatsIn("l1", 2, "sofa"), ...seatsIn("h1", 1, "sofa"),
  ];
  return { ...idx, rooms, seats, seatById: new Map(seats.map((s) => [s.id, s])), roomById: new Map(rooms.map((r) => [r.id, r])) };
}
const idx = fixture();
const WORK = ["w1-1", "w1-2", "w1-3", "w2-1", "w2-2"];
const plain = (r: string, seatId: string | null, overflow = false) => ({ room: r, seatId, bump: false, overflow });

test("席の一覧が空の(マップがない)オフィス: 席なし・会議室なし。入室は409、presenceViewは落ちない", () => {
  const empty = indexOf(null);
  assert.deepEqual([empty.rooms, empty.seats, empty.map], [[], [], null]);
  throwsVo(() => pickSeat(empty, { taken: new Set() }), 409);
  throwsVo(() => pickSeat(empty, { wanted: "w1-1", taken: new Set() }), 422);
  const now = new Date();
  const v = presenceView({ room: "x", seatId: "x-1", status: "work", away: false, focusUntil: null, overflow: false, lastSeenAt: now }, now, empty);
  assert.deepEqual([v.room, v.seatId, v.overflow], ["x", null, true]);
});

test("消えた部屋・席の行は席なし(共用部・overflow)で返し、ふつうの行は変えない", () => {
  const now = new Date("2026-10-29T03:00:00Z");
  const row = { status: "work", focusUntil: null, away: false, lastSeenAt: now, overflow: false };
  for (const [r, seatId] of [["gone", "gone-1"], ["w1", "w1-99"]]) {
    const v = presenceView({ ...row, room: r, seatId }, now, idx);
    assert.deepEqual([v.room, v.seatId, v.overflow], ["h1", null, true]);
  }
  const ok = presenceView({ ...row, room: "w1", seatId: "w1-1" }, now, idx);
  assert.deepEqual([ok.room, ok.seatId, ok.overflow, ok.inMeeting], ["w1", "w1-1", false, false]);
  const meet = presenceView({ ...row, room: "m1", seatId: null }, now, idx);
  assert.deepEqual([meet.room, meet.seatId, meet.overflow], ["m1", null, false]);
});

test("集中のタイマーが切れたら作業中に戻して見せる。知らないステータスも作業中。押し忘れはstale", () => {
  const now = new Date("2026-10-25T03:00:00Z");
  const row = { room: "w1", seatId: "w1-1", away: false, lastSeenAt: now, overflow: false };
  const live = presenceView({ ...row, status: "focus", focusUntil: new Date(now.getTime() + 60_000) }, now, idx);
  assert.deepEqual([live.status, live.focusUntil], ["focus", new Date(now.getTime() + 60_000).toISOString()]);
  const done = presenceView({ ...row, status: "focus", focusUntil: now }, now, idx);
  assert.deepEqual([done.status, done.focusUntil], ["work", null]);
  assert.equal(presenceView({ ...row, status: "lunch", focusUntil: null }, now, idx).status, "work");
  assert.equal(presenceView({ ...row, status: "break", focusUntil: null }, now, idx).status, "break");
  const old = presenceView({ ...row, status: "work", focusUntil: null, lastSeenAt: new Date(now.getTime() - STALE_SEAT_MS - 1) }, now, idx);
  assert.deepEqual([old.stale, old.away], [true, true]);
  assert.equal(presenceView({ ...row, status: "work", focusUntil: null, lastSeenAt: new Date(now.getTime() - STALE_SEAT_MS) }, now, idx).stale, false);
});

test("入室の席: 指定→空いている作業エリアの普通の席。おまかせは机の札の席・会議室の席を選ばない", () => {
  const none = new Set<string>();
  assert.deepEqual(pickSeat(idx, { wanted: "b1-2", taken: none }), plain("b1", "b1-2"));
  assert.deepEqual(pickSeat(idx, { wanted: "w1-boss", taken: none }), plain("w1", "w1-boss"));
  assert.deepEqual(pickSeat(idx, { taken: none }), plain("w1", "w1-1"));
  assert.deepEqual(pickSeat(idx, { taken: new Set(["w1-1"]) }), plain("w1", "w1-2"));
  assert.deepEqual(pickSeat(idx, { taken: new Set(["w1-1", "w1-2", "w1-3"]) }), plain("w2", "w2-1"));
  throwsVo(() => pickSeat(idx, { wanted: "w1-1", taken: new Set(["w1-1"]) }), 409);
  throwsVo(() => pickSeat(idx, { wanted: "nowhere", taken: none }), 422);
});

test("作業エリアが満席なら 気軽な席(free)→休憩(break)→共用部(hall)→会議室(席なし)。会議室の席は選ばない", () => {
  const full = (extra: string[]) => new Set([...WORK, ...extra]);
  assert.deepEqual(pickSeat(idx, { taken: full([]) }), plain("l1", "l1-1", true));
  assert.equal(pickSeat(idx, { taken: full(["l1-1"]) }).seatId, "l1-2");
  assert.equal(pickSeat(idx, { taken: full(["l1-1", "l1-2"]) }).seatId, "b1-1");
  assert.equal(pickSeat(idx, { taken: full(["l1-1", "l1-2", "b1-1", "b1-2"]) }).seatId, "h1-1");
  assert.deepEqual(pickSeat(idx, { taken: full(["l1-1", "l1-2", "b1-1", "b1-2", "h1-1"]) }), plain("m1", null, true));
  // 1席でも空きがあればそこ
  assert.equal(pickSeat(idx, { taken: new Set(WORK.filter((id) => id !== "w2-1")) }).seatId, "w2-1");
  // 会議室がなければ席なしの行き先がなく409
  const noMeet = fixture({ rooms: [room("w1", "work")], seats: seatsIn("w1", 1) });
  throwsVo(() => pickSeat(noMeet, { taken: new Set(["w1-1"]) }), 409);
});

test("席の移動: 席なしにできるのは会議室だけ。ほかはその部屋の空いている席", () => {
  const none = new Set<string>();
  assert.deepEqual(checkMove(idx, "m1", null, none), { bump: false });
  assert.deepEqual(checkMove(idx, "m1", "m1-1", none), { bump: false });
  assert.deepEqual(checkMove(idx, "b1", "b1-1", none), { bump: false });
  assert.deepEqual(checkMove(idx, "w1", "w1-boss", none), { bump: false });
  for (const [r, s] of [["b1", null], ["w1", null], ["h1", null], ["w1", "b1-1"]] as const) throwsVo(() => checkMove(idx, r, s, none), 422);
  throwsVo(() => checkMove(idx, "rooftop", null, none), 422);
  throwsVo(() => checkMove(idx, "b1", "b1-1", new Set(["b1-1"])), 409);
});

test("押し忘れの席: ハートビートが2時間来ていない人の席は、作業エリアが満席のときだけ使える", () => {
  const now = new Date("2026-10-25T05:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const s = seatingOf([
    { seatId: "w1-3", lastSeenAt: ago(STALE_SEAT_MS + 1) },
    { seatId: "w1-2", lastSeenAt: ago(STALE_SEAT_MS) },
    { seatId: null, lastSeenAt: ago(STALE_SEAT_MS * 3) },
  ], now);
  assert.deepEqual([[...s.taken], [...s.stale]], [["w1-3", "w1-2"], ["w1-3"]]);

  const stale = new Set(["w1-3", "w2-1"]);
  const full = new Set(WORK);
  assert.deepEqual(pickSeat(idx, { taken: full, stale }), { room: "w1", seatId: "w1-3", bump: true, overflow: false });
  assert.equal(pickSeat(idx, { wanted: "w2-1", taken: full, stale }).bump, true);
  assert.deepEqual(checkMove(idx, "w1", "w1-3", full, stale), { bump: true });
  throwsVo(() => checkMove(idx, "w1", "w1-2", full, stale), 409);
  // 空きがあれば押し忘れの席には座れない
  const notFull = new Set(WORK.filter((id) => id !== "w2-2"));
  assert.deepEqual(pickSeat(idx, { taken: notFull, stale }), plain("w2", "w2-2"));
  throwsVo(() => pickSeat(idx, { wanted: "w1-3", taken: notFull, stale }), 409);
  assert.equal(canBump(idx, "w1-3", { taken: notFull, stale }), false);
  assert.equal(canBump(idx, "w1-3", { taken: full, stale }), true);
});

test("お知らせは受け取る人の言語で、部屋の名前はそのまま入る", () => {
  assert.equal(overflowNotice("ja", idx, "l1", true), "作業エリアが満席なのでLoungeに座りました。");
  assert.equal(overflowNotice("en", idx, "m1", false), "The work area is full, so you were placed in Meet.");
  assert.equal(returnNotice("en", idx, "b1"), "Someone else took your seat while you were away, so you moved to Cafe.");
  assert.equal(t("ja", "vo.err.seatTaken"), "その席にはほかの人が座っています。");
});

test("チャットを書く部屋: 今いる部屋だけ(省略も今の部屋)", () => {
  assert.equal(chatRoomOf(undefined, "b1"), "b1");
  assert.equal(chatRoomOf("b1", "b1"), "b1");
  for (const r of ["w2", "m1", "nowhere"]) throwsVo(() => chatRoomOf(r, "b1"), 422);
});

test("終業後の自動退出: 終業前が最後なら15分後(早くても終業時刻)、以降なら1時間後。ゾーンと終業時刻は設定", () => {
  const tokyo = (iso: string, hour = 18) => autoLeaveAt(new Date(`${iso}+09:00`), "Asia/Tokyo", hour).getTime();
  const t = (iso: string) => new Date(`${iso}+09:00`).getTime();
  assert.equal(autoLeaveFrom("2026-10-25", "Asia/Tokyo", 18).toISOString(), "2026-10-25T09:00:00.000Z");
  assert.equal(tokyo("2026-10-25T17:30:00"), t("2026-10-25T18:00:00"));
  assert.equal(tokyo("2026-10-25T17:55:00"), t("2026-10-25T18:10:00"));
  assert.equal(tokyo("2026-10-25T18:00:00"), t("2026-10-25T19:00:00"));
  assert.equal(tokyo("2026-10-25T23:30:00"), t("2026-10-26T00:30:00"));
  assert.equal(tokyo("2026-10-25T00:10:00"), t("2026-10-25T18:00:00")); // UTCではまだ10/24
  // 終業時刻20時
  assert.equal(tokyo("2026-10-25T19:50:00", 20), t("2026-10-25T20:05:00"));
  // ニューヨーク(夏時間): 18時 = UTC 22:00。UTCでは日付が同じでも現地の日で数える
  const ny = (iso: string) => autoLeaveAt(new Date(iso), "America/New_York", 18).toISOString();
  assert.equal(ny("2026-07-15T20:00:00Z"), "2026-07-15T22:00:00.000Z");
  assert.equal(ny("2026-07-15T22:30:00Z"), "2026-07-15T23:30:00.000Z");
  assert.equal(ny("2026-07-16T02:00:00Z"), "2026-07-16T03:00:00.000Z"); // 現地は7/15 22:00
});

test("離席中: 自分で押したか、ハートビートが15分より前", () => {
  const now = new Date("2026-10-25T03:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  assert.equal(isAway({ away: false, lastSeenAt: ago(AWAY_AFTER_MS) }, now), false);
  assert.equal(isAway({ away: false, lastSeenAt: ago(AWAY_AFTER_MS + 1) }, now), true);
  assert.equal(isAway({ away: true, lastSeenAt: now }, now), true);
});

test("ひとことは書いた日のうちだけ", () => {
  assert.equal(memoOf({ memo: "午前は面談", memoDate: "2026-10-25" }, "2026-10-25"), "午前は面談");
  assert.equal(memoOf({ memo: "午前は面談", memoDate: "2026-10-24" }, "2026-10-25"), "");
  assert.equal(memoOf(null, "2026-10-25"), "");
});

test("きせかえの初期値は選択肢の中で、ユーザーごとに決まり、人によって変わる", () => {
  assert.deepEqual(defaultLook("cmabc123"), defaultLook("cmabc123"));
  const looks = Array.from({ length: 40 }, (_, i) => defaultLook(`cm${i}x${i * 7}`));
  for (const look of looks) assert.deepEqual(toLook(look), look);
  assert.ok(new Set(looks.map((l) => JSON.stringify(l))).size > 20);
  // 選択肢を増やす前と同じ見た目(前からある選択肢・Tシャツ・小物なし)
  assert.deepEqual(defaultLook("cmabc123"), { hair: "pony", hc: "dbrown", sk: "l", cl: "white", pt: "black", ot: "tee", ac: "none" });
  for (const look of looks) assert.ok(look.ot === "tee" && look.ac === "none" && !["afro", "gold", "pink"].some((v) => Object.values(look).includes(v)));
  assert.equal(toLook({ hair: "short", hc: "black", sk: "l", cl: "teal" }), null);
  assert.equal(toLook({ hair: "afro", hc: "black", sk: "l", cl: "teal", pt: "navy", ot: "cape" }), null);
  assert.equal(toLook("short"), null);
});

test("きせかえ: 服の種類・小物が無い前のlookはTシャツ・なしで補い、ほかの項目はそのまま", () => {
  const old = { hair: "bob", hc: "tea", sk: "m", cl: "orange", pt: "beige" };
  assert.deepEqual(toLook(old), { ...old, ot: "tee", ac: "none" });
  assert.deepEqual(toLook({ ...old, ot: "hoodie", ac: "cat", hat: "x" }), { ...old, ot: "hoodie", ac: "cat" });
});

test("操作の検証: 形や値が違えば422", () => {
  const bad: unknown[] = [
    null, [], "enter", { type: "dance" }, { type: "setEvent", mode: "auto" }, { type: "mug" }, { type: "feedCat" },
    { type: "enter", seatId: 1 }, { type: "enter", seatId: "" }, { type: "move", room: "bar" },
    { type: "away", away: "yes" }, { type: "status", status: "lunch" },
    { type: "status", status: "focus", focusMinutes: 0 }, { type: "status", status: "focus", focusMinutes: 121 }, { type: "status", status: "focus", focusMinutes: 2.5 },
    { type: "memo", text: "あ".repeat(51) }, { type: "memo" }, { type: "chat", text: " \n " }, { type: "chat", text: "a".repeat(201) },
    { type: "chat", text: "x", room: "" }, { type: "chat", text: "x", room: 3 },
    { type: "react", messageId: "m1", kind: "wow" }, { type: "react", messageId: "m1" }, { type: "react", messageId: "", kind: "good" },
    { type: "unchat" }, { type: "unchat", messageId: 1 },
    { type: "profile", look: { hair: "bob" } }, { type: "profile", deco: "sword" }, { type: "profile", pc: "linux" },
    { type: "profile", mon: 3 }, { type: "profile", keyboard: "other" }, { type: "profile", keyboard: null },
    { type: "call" }, { type: "answer", callId: 0, answer: "go" }, { type: "answer", callId: 1, answer: "maybe" },
  ];
  for (const body of bad) throwsVo(() => parseAction(body), 422);
});

test("操作の検証: 正しい形はそのまま通し、余計な項目(floorなど)は落とす", () => {
  const look = { hair: "bob", hc: "tea", sk: "m", cl: "orange", pt: "beige", ot: "aloha", ac: "glasses" };
  const ok: unknown[] = [
    { type: "enter" }, { type: "enter", seatId: "w1-1" }, { type: "leave" },
    { type: "move", room: "m1", seatId: null }, { type: "away", away: true },
    { type: "status", status: "break" }, { type: "status", status: "focus", focusMinutes: 120 },
    { type: "memo", text: "" }, { type: "profile", look, deco: null, pc: "win", mon: 2 },
    { type: "chat", text: "hello", room: "w1", mentions: ["u2"] },
    ...["good", "heart", "clap", "laugh", "thanks"].map((kind) => ({ type: "react", messageId: "m1", kind })),
    { type: "unchat", messageId: "m1" }, { type: "call", toUserId: "u2" }, { type: "wave", toUserId: "u2" },
    { type: "answer", callId: 3, answer: "later" }, { type: "emote", emote: "dance" },
  ];
  for (const b of ok) assert.deepEqual(parseAction(b), b);
  assert.deepEqual(parseAction({ type: "enter", floor: 2 }), { type: "enter" });
});

test("?since= は0以上の整数だけ", () => {
  assert.equal(parseSince(null), undefined);
  assert.equal(parseSince(""), undefined);
  assert.equal(parseSince("0"), 0);
  assert.equal(parseSince("42"), 42);
  for (const v of ["-1", "1.5", "abc", "1e400"]) throwsVo(() => parseSince(v), 422);
});

test("?idle= は秒数。無い・数でなければ進めない、負は0・1日より大きければ1日に丸める", () => {
  assert.equal(parseIdle(null), undefined);
  assert.equal(parseIdle(""), undefined);
  assert.equal(parseIdle("abc"), undefined);
  assert.equal(parseIdle("Infinity"), undefined);
  assert.equal(parseIdle("0"), 0);
  assert.equal(parseIdle("12.7"), 12);
  assert.equal(parseIdle("-5"), 0);
  assert.equal(parseIdle("999999999"), 86_400);
});

test("同じ相手への声かけは30秒、手を振るのは10秒あける", () => {
  const now = new Date("2026-10-25T03:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  assert.equal(sentTooSoon("call", null, now), false);
  assert.equal(sentTooSoon("call", ago(29_999), now), true);
  assert.equal(sentTooSoon("call", ago(30_000), now), false);
  assert.equal(sentTooSoon("wave", ago(9_999), now), true);
  assert.equal(sentTooSoon("wave", ago(10_000), now), false);
});

test("開き直したとき、返事した声かけは出さない(手を振る・返事・ほかの声かけはそのまま)", () => {
  const events = [
    { id: 1, kind: "call" },
    { id: 2, kind: "wave" },
    { id: 3, kind: "call" },
    { id: 4, kind: "answer" },
  ];
  assert.deepEqual(withoutAnswered(events, [1]).map((e) => e.id), [2, 3, 4]);
  assert.deepEqual(withoutAnswered(events, [2, 4]).map((e) => e.id), [1, 2, 3, 4]);
  assert.deepEqual(withoutAnswered(events, []).map((e) => e.id), [1, 2, 3, 4]);
});

test("チャットの本文: 改行は残し、行の中の空白・先頭と末尾の空行・続く空行をまとめ、6行目からは5行目につなぐ", () => {
  const chat = (text: string) => (parseAction({ type: "chat", text }) as { text: string }).text;
  assert.equal(chat("  一行目\n二行目\t "), "一行目\n二行目");
  assert.equal(chat("\r\n\n a \t　 b \r\n\r\n\r\n\nc\n\n"), "a b\n\nc");
  assert.equal(chat("1\n2\n3\n4\n5"), "1\n2\n3\n4\n5");
  assert.equal(chat("1\n2\n3\n4\n5\n\n6\n7"), "1\n2\n3\n4\n5 6 7");
  // 文字数は改行も数える
  assert.equal(chat(`${"あ".repeat(99)}\n${"い".repeat(100)}`).length, 200);
  throwsVo(() => parseAction({ type: "chat", text: `${"あ".repeat(100)}\n${"い".repeat(100)}` }), 422);
  throwsVo(() => parseAction({ type: "chat", text: "\n\t\n" }), 422);
  // ひとことは今までどおり1行
  assert.deepEqual(parseAction({ type: "memo", text: "a\n\nb" }), { type: "memo", text: "a b" });
});

test("チャットの名指し: 配列でなければ無視。文字列だけを重複なしで10件まで", () => {
  assert.deepEqual(parseAction({ type: "chat", text: "x", mentions: "u2" }), { type: "chat", text: "x" });
  assert.deepEqual(parseAction({ type: "chat", text: "x", mentions: null }), { type: "chat", text: "x" });
  assert.deepEqual(parseAction({ type: "chat", text: "x", mentions: ["u2", 3, "", null, "u2", "u3", "a".repeat(101)] }), { type: "chat", text: "x", mentions: ["u2", "u3"] });
  const many = Array.from({ length: 12 }, (_, i) => `u${i}`);
  assert.deepEqual(parseAction({ type: "chat", text: "x", mentions: many }), { type: "chat", text: "x", mentions: many.slice(0, 10) });
});

test("取り消し: 送ってからちょうど1分までは取り消せる", () => {
  const at = new Date("2026-11-01T01:00:00Z");
  assert.equal(unchatTooLate(at, new Date(at.getTime() + UNCHAT_MS)), false);
  assert.equal(unchatTooLate(at, new Date(at.getTime() + UNCHAT_MS + 1)), true);
});

