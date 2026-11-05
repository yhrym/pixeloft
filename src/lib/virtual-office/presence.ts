/**
 * バーチャルオフィスの在室のルール。DBに触らない純粋関数だけ置く(マップは引数で受ける)。
 * 状態の組み立てはstate.ts、操作の実行はactions.ts。
 */
import { t, type Locale } from "../../i18n/index.ts";
import { zonedInstant, dateKey } from "../time.ts";
import type { MapIndex } from "./map.ts";
import { hallRoom } from "./seat-loss.ts";
import type { VoAction, VoDeco, VoEmote, VoKeyboard, VoLook, VoPc, VoPresenceView, VoReactionKind, VoStatus } from "./types.ts";
import { VO_REACTIONS } from "./types.ts";

/** 利用者に見せてよい文言だけを持つエラー。messageはi18nのキーで、request.tsが受け取る人の言語に直して { error } と status にする */
export class VoError extends Error {
  readonly status: number;
  readonly vars?: Record<string, string | number>;
  constructor(status: number, key: string, vars?: Record<string, string | number>) {
    super(key);
    this.name = "VoError";
    this.status = status;
    this.vars = vars;
  }
}

const badRequest = () => new VoError(422, "vo.err.badRequest");

/** ハートビートがこれより来ていなければ「離席中」に見せる */
export const AWAY_AFTER_MS = 15 * 60 * 1000;
export const MEMO_MAX = 50;
export const CHAT_MAX = 200;
/** チャットで残す改行の行数。超えた分は最後の行に空白でつなぐ */
export const CHAT_MAX_LINES = 5;
/** 自分の発言を取り消せる間 */
export const UNCHAT_MS = 60_000;
/** この間に発言があった部屋を「話している部屋」として返す */
export const TALKING_ROOM_MS = 300_000;
/** 1回の発言で名指しできる人数 */
const MENTIONS_MAX = 10;
export const FOCUS_MINUTES_DEFAULT = 25;
/** 同じ相手に続けて送れるまでの間(連打よけ) */
export const SEND_GAP_MS = { call: 30_000, wave: 10_000 } as const;

export const STATUSES: VoStatus[] = ["work", "focus", "break", "meet"];
export const PCS: VoPc[] = ["mac", "win"];
export const KEYBOARDS: VoKeyboard[] = ["none", "colorful", "dark", "split"];
/** sprites.jsのEMOTESと同じ記号と順番(emotes.test.tsで確かめる) */
export const EMOTES: VoEmote[] = ["dance", "jump", "spin", "banzai", "clap", "heart", "good", "wow", "what", "sweat"];
export const DECOS: VoDeco[] = [
  "plant", "cactus", "succulent", "bonsai", "flower",
  "mug", "tumbler", "energy", "snack",
  "figure", "robot", "bear", "duck", "maneki", "daruma", "cube", "game", "goldfish",
  "photo", "calendar", "books", "hourglass", "globe", "lamp", "panel",
  "pencup", "clock", "speaker", "terrarium", "dripper", "inbox", "rocket", "hydrangea", "orchid", "croissant",
  "camera", "headphones", "notepad", "stapler", "calculator",
];
/** sprites.jsのHAIRS・HAIR_COLS・SKINS・CLOTHES・PANTS・OUTFITS・ACCSと同じ記号(look.test.tsで確かめる)。前からある分を先に置く */
export const LOOK_OPTIONS = {
  hair: ["short", "messy", "bob", "long", "pony", "bun", "buzz", "twoblock", "center", "side", "mash", "wolf", "twin", "braid", "halfup", "wave", "afro", "slick",
    "hime", "curly", "sidepony", "spiky", "pixie", "lowbun",
    "doublebun", "lowtwin", "twinbraid", "highpony", "pompadour", "mohawk", "asym", "outwardbob", "dread", "bald"],
  hc: ["black", "dbrown", "brown", "tea", "ash", "grey", "gold", "red", "pink", "blue", "purple", "silver"],
  sk: ["l", "m", "d", "pl", "dd"],
  cl: ["teal", "blue", "red", "yellow", "green", "white", "grey", "navy", "orange", "pink", "purple", "black", "beige", "sky"],
  pt: ["navy", "black", "grey", "beige", "brown", "denim", "khaki", "white"],
  ot: ["tee", "hoodie", "shirt", "border", "check", "cardigan", "jersey", "aloha", "blazer", "knit", "polo", "overalls", "vest", "sailor"],
  ac: ["none", "glasses", "round", "sunglasses", "cap", "knit", "phones", "beret", "ribbon", "beard", "mask", "cat", "hairpin", "earrings", "scarf", "bucket", "hairband", "flowerclip"],
} as const satisfies Record<keyof VoLook, readonly string[]>;
/** 初期値はLOOK_OPTIONSの先頭のこの数から選ぶ(選択肢を増やす前と同じ見た目のままにし、派手な色や小物を勝手に付けない) */
const LOOK_BASE = { hair: 6, hc: 6, sk: 3, cl: 9, pt: 5 } as const;
/** 服の種類と小物は後から足したので、無い古いlookはTシャツ・なしで補う */
const LOOK_FILL: Partial<VoLook> = { ot: "tee", ac: "none" };

/** 自分で押した離席、またはハートビートが15分来ていない */
export function isAway(p: { away: boolean; lastSeenAt: Date }, now: Date): boolean {
  return p.away || now.getTime() - p.lastSeenAt.getTime() > AWAY_AFTER_MS;
}

export type PresenceRow = {
  room: string;
  seatId: string | null;
  status: string;
  away: boolean;
  focusUntil: Date | null;
  overflow: boolean;
  lastSeenAt: Date;
};

/** 席のない入室の行き先(最初の会議室)。会議室がなければnull */
export const seatlessRoom = (idx: MapIndex): string | null => idx.rooms.find((r) => r.kind === "meeting")?.id ?? null;

/** 在室の行を画面に渡す形にする。集中のタイマーが切れていたら作業中に戻して見せる */
export function presenceView(p: PresenceRow, now: Date, idx: MapIndex): VoPresenceView {
  const focusLive = p.status === "focus" && p.focusUntil !== null && p.focusUntil > now;
  const status = STATUSES.includes(p.status as VoStatus) ? (p.status as VoStatus) : "work";
  // 公開で消えた部屋・席の行は、共用部で席なしの形で返す(会議室にすると会議中に見えるため)。DBは書き換えない(次に席を選ぶ・退出で直る)
  const gone = !idx.roomById.has(p.room) || (p.seatId !== null && !idx.seatById.has(p.seatId));
  return {
    room: gone ? (hallRoom(idx) ?? p.room) : p.room,
    seatId: gone ? null : p.seatId,
    status: status === "focus" && !focusLive ? "work" : status,
    away: isAway(p, now),
    focusUntil: focusLive ? p.focusUntil!.toISOString() : null,
    inMeeting: false,
    overflow: gone || p.overflow,
    stale: isStale(p.lastSeenAt, now),
  };
}

/** ハートビートが2時間来ていない(退出の押し忘れ)。席を譲る対象になり、地図には出さない */
export function isStale(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() > STALE_SEAT_MS;
}

/** その日(tzのYYYY-MM-DD)の終業時刻。これ以降の自動退出はこの時刻から */
export function autoLeaveFrom(date: string, tz: string, workEndHour: number): Date {
  return zonedInstant(date, workEndHour, tz);
}

/**
 * 終業後の自動退出の時刻。最後に触った時刻のその日の終業時刻をTとして、
 * Tより前に触ったのが最後ならmax(T, 触った+15分)、T以降なら触った+1時間
 */
export function autoLeaveAt(lastActiveAt: Date, tz: string, workEndHour: number): Date {
  const t0 = autoLeaveFrom(dateKey(lastActiveAt, tz), tz, workEndHour).getTime();
  const a = lastActiveAt.getTime();
  return new Date(a < t0 ? Math.max(t0, a + 15 * 60_000) : a + 60 * 60_000);
}

/** ひとことは書いた日のうちだけ見せる */
export function memoOf(profile: { memo: string; memoDate: string | null } | null, today: string): string {
  return profile && profile.memoDate === today ? profile.memo : "";
}

/** 同じ相手への前回の声かけ・手を振るから、まだ間があいていない */
export function sentTooSoon(kind: "call" | "wave", lastAt: Date | null, now: Date): boolean {
  return lastAt !== null && now.getTime() - lastAt.getTime() < SEND_GAP_MS[kind];
}

/** 送ってから1分を過ぎていて、もう取り消せない(ちょうど1分までは取り消せる) */
export function unchatTooLate(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() > UNCHAT_MS;
}

/** ハートビートがこれより来ていない人の席は、作業エリアが満席のときだけほかの人が使える(退出の押し忘れ) */
export const STALE_SEAT_MS = 2 * 60 * 60 * 1000;

/** 作業エリアの普通の席(種類がoffice・部屋の種類がwork)。満席の判定と、指定なしの自動の席選びはこの席だけ */
const workSeats = (idx: MapIndex) => idx.seats.filter((s) => s.type === "office" && idx.roomById.get(s.room)?.kind === "work").map((s) => s.id);
/** 満席のときに座らせる順: 気軽な席(free)→休憩(break)→共用部(hall)。どこも埋まっていれば会議室(席なし) */
const OVERFLOW_KINDS = ["free", "break", "hall"];
const overflowSeats = (idx: MapIndex) =>
  OVERFLOW_KINDS.flatMap((k) => idx.seats.filter((s) => idx.roomById.get(s.room)?.kind === k).map((s) => s.id));

/** 自分以外の在室の人の今座っている席。staleはそのうちハートビートが2時間来ていない人の席 */
export type Seating = { taken: Set<string>; stale: Set<string> };

export function seatingOf(rows: { seatId: string | null; lastSeenAt: Date }[], now: Date): Seating {
  const taken = new Set<string>();
  const stale = new Set<string>();
  for (const r of rows) {
    if (!r.seatId) continue;
    taken.add(r.seatId);
    if (isStale(r.lastSeenAt, now)) stale.add(r.seatId);
  }
  return { taken, stale };
}

/** 作業エリアに空いている席が無い(どの席も誰かが座っている) */
const workFull = (idx: MapIndex, s: Seating) => workSeats(idx).every((id) => s.taken.has(id));

/** 押し忘れの人の席を使ってよいか: その席の人が2時間来ていなくて、作業エリアに空いている席が無い */
export function canBump(idx: MapIndex, seatId: string, s: Seating): boolean {
  return s.stale.has(seatId) && workFull(idx, s);
}

/**
 * 座れる席。bump=trueなら押し忘れの人の席で、呼ぶ側がその人を席から外す(席なし扱いにする)。
 * overflow=trueは作業エリアが満席で別の場所・会議室に回したとき。
 */
export type SeatPick = { room: string; seatId: string | null; bump: boolean; overflow: boolean };

/**
 * 入室するときの席(フリーアドレス)。指定があればそこ(座れなければエラー)。なければ次の順で最初に座れる席:
 * 空いている作業エリアの普通の席→(満席なら)押し忘れの人の席→気軽な席→休憩→共用部→会議室(席なし)。
 * 会議室がなくて座れる所もなければ409。
 */
export function pickSeat(idx: MapIndex, input: { wanted?: string; taken: Set<string>; stale?: Set<string> }): SeatPick {
  const seating: Seating = { taken: input.taken, stale: input.stale ?? new Set() };
  const at = (seatId: string, bump: boolean, overflow: boolean): SeatPick => ({ room: idx.seatById.get(seatId)!.room, seatId, bump, overflow });
  if (input.wanted !== undefined) return at(input.wanted, checkSeat(idx, input.wanted, seating), false);

  const free = (id: string) => !seating.taken.has(id);
  const seats = workSeats(idx);
  const seatId = seats.find(free);
  if (seatId) return at(seatId, false, false);
  const stale = seats.find((id) => canBump(idx, id, seating));
  if (stale) return at(stale, true, false);
  const extra = overflowSeats(idx).find(free);
  if (extra) return at(extra, false, true);
  const room = seatlessRoom(idx);
  if (room === null) throw new VoError(409, "vo.err.noSeat");
  return { room, seatId: null, bump: false, overflow: true };
}

/** 座れれば押し忘れの人を外す必要があるか(bump)を返す。座れなければエラー */
function checkSeat(idx: MapIndex, seatId: string, s: Seating): boolean {
  if (!idx.seatById.has(seatId)) throw new VoError(422, "vo.err.noSuchSeat");
  if (!s.taken.has(seatId)) return false;
  if (canBump(idx, seatId, s)) return true;
  throw new VoError(409, "vo.err.seatTaken");
}

/** 席の移動。会議室だけ席なし(seatIdはnull)。ほかの部屋は、その部屋の空いている席か、作業エリアが満席のときの押し忘れの人の席 */
export function checkMove(idx: MapIndex, room: string, seatId: string | null, taken: Set<string>, stale: Set<string> = new Set()): { bump: boolean } {
  const r = idx.roomById.get(room);
  if (!r) throw new VoError(422, "vo.err.noSuchRoom");
  if (seatId === null) {
    if (r.kind !== "meeting") throw new VoError(422, "vo.err.pickSeat");
    return { bump: false };
  }
  const bump = checkSeat(idx, seatId, { taken, stale });
  if (idx.seatById.get(seatId)!.room !== room) throw new VoError(422, "vo.err.seatNotInRoom");
  return { bump };
}

/** チャットを書く部屋。書けるのは今いる部屋だけ。省略なら今の部屋 */
export function chatRoomOf(wanted: string | undefined, currentRoom: string): string {
  if (wanted === undefined || wanted === currentRoom) return currentRoom;
  throw new VoError(422, "vo.err.chatRoom");
}

/** 返した声かけを除く(ほかの出来事はそのまま) */
export function withoutAnswered<T extends { id: number; kind: string }>(events: T[], answeredCallIds: number[]): T[] {
  return events.filter((e) => e.kind !== "call" || !answeredCallIds.includes(e.id));
}

/** 作業エリアが満席でほかの場所に回したときのお知らせ */
export function overflowNotice(locale: Locale, idx: MapIndex, room: string, seated: boolean): string {
  return t(locale, seated ? "vo.notice.overflowSeat" : "vo.notice.overflowMeet", { place: idx.roomById.get(room)?.name ?? "" });
}

/** 押し忘れで席を外されていた人が戻ってきたときのお知らせ */
export function returnNotice(locale: Locale, idx: MapIndex, room: string): string {
  return t(locale, "vo.notice.returned", { place: idx.roomById.get(room)?.name ?? "" });
}

/** きせかえの初期値。みんな同じ見た目にならないよう、ユーザーidから決める */
export function defaultLook(userId: string): VoLook {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pick = (k: keyof typeof LOOK_BASE, div: number) => LOOK_OPTIONS[k][Math.floor(h / div) % LOOK_BASE[k]];
  return {
    hair: pick("hair", 1),
    hc: pick("hc", 7),
    sk: pick("sk", 49),
    cl: pick("cl", 343),
    pt: pick("pt", 2401),
    ot: "tee",
    ac: "none",
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** みんなのパーツの指定("u:<VoPartのid>")と、好きな色(#rrggbb) */
const PART_REF = /^u:[a-z0-9]{1,40}$/;
const HEX = /^#[0-9a-f]{6}$/;
const FREE_COLOR = new Set<keyof VoLook>(["hc", "cl", "pt"]);
const PART_FALLBACK = { hair: "short", ot: "tee", ac: "none" } as const;
type PartKindKey = keyof typeof PART_FALLBACK;
/** その種類のパーツが(消されずに)あるか。渡さなければ、みんなのパーツは無いものとして既定に戻す */
export type HasPart = (kind: PartKindKey, id: string) => boolean;

/**
 * 保存済み・送られてきたlookを確かめ、知っている項目だけの形にする(足りない服の種類・小物は補う)。選択肢に無い値があればnull。
 * 髪・服の色・ズボンの色は#rrggbbも可(小文字にそろえる。肌は選択肢だけ)。髪型・服・小物は"u:<id>"も可で、
 * そのパーツが無い(消された)ときはその項目だけ既定(short・tee・none)に戻す
 */
export function toLook(v: unknown, hasPart: HasPart = () => false): VoLook | null {
  if (!isObject(v)) return null;
  const out = {} as VoLook;
  for (const k of Object.keys(LOOK_OPTIONS) as (keyof VoLook)[]) {
    const x = v[k] ?? LOOK_FILL[k];
    if (typeof x === "string" && k in PART_FALLBACK && PART_REF.test(x)) {
      out[k] = hasPart(k as PartKindKey, x.slice(2)) ? x : PART_FALLBACK[k as PartKindKey];
      continue;
    }
    if (typeof x === "string" && FREE_COLOR.has(k) && HEX.test(x.toLowerCase())) {
      out[k] = x.toLowerCase();
      continue;
    }
    if (!(LOOK_OPTIONS[k] as readonly string[]).includes(x as string)) return null;
    out[k] = x as string;
  }
  return out;
}

const str = (v: unknown): string => {
  if (typeof v !== "string" || v.length === 0 || v.length > 100) throw badRequest();
  return v;
};

/** 行ごとに空白をまとめて前後を落とし、先頭・末尾の空行を落として空行の連続は1つに。maxLinesを超えた行は最後の行に空白でつなぐ */
function keepLines(v: string, maxLines: number): string {
  const lines = v.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/[^\S\n]+/g, " ").trim())
    .join("\n").replace(/\n{3,}/g, "\n\n").trim().split("\n");
  if (lines.length <= maxLines) return lines.join("\n");
  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).filter(Boolean).join(" ")].join("\n");
}

function text(v: unknown, max: number, kind: "memo" | "chat", required: boolean, maxLines = 1): string {
  if (typeof v !== "string") throw badRequest();
  // ひとことは1行で見せるので改行やタブは空白にまとめる。チャットは改行をmaxLines行まで残す
  const s = maxLines === 1 ? v.replace(/\s+/g, " ").trim() : keepLines(v, maxLines);
  if (required && s.length === 0) throw new VoError(422, `vo.err.${kind}Required`);
  if (s.length > max) throw new VoError(422, `vo.err.${kind}Max`, { max });
  return s;
}

/** クライアントから来た操作を検証してVoActionにする。形や値が違えば422 */
export function parseAction(body: unknown, hasPart?: HasPart): VoAction {
  if (!isObject(body)) throw badRequest();
  switch (body.type) {
    case "enter": {
      // floor(移植元の「見ている階」)は受け取って捨てる
      const a: Extract<VoAction, { type: "enter" }> = { type: "enter" };
      if (body.seatId !== undefined) a.seatId = str(body.seatId);
      return a;
    }
    case "leave":
      return { type: "leave" };
    case "move":
      return { type: "move", room: str(body.room), seatId: body.seatId === null ? null : str(body.seatId) };
    case "away":
      if (typeof body.away !== "boolean") throw badRequest();
      return { type: "away", away: body.away };
    case "status": {
      if (!STATUSES.includes(body.status as VoStatus)) throw badRequest();
      const status = body.status as VoStatus;
      if (body.focusMinutes === undefined) return { type: "status", status };
      const m = body.focusMinutes;
      if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > 120) throw new VoError(422, "vo.err.focusMinutes");
      return { type: "status", status, focusMinutes: m };
    }
    case "memo":
      return { type: "memo", text: text(body.text, MEMO_MAX, "memo", false) };
    case "profile": {
      const a: Extract<VoAction, { type: "profile" }> = { type: "profile" };
      if (body.look !== undefined) {
        const look = toLook(body.look, hasPart);
        if (!look) throw badRequest();
        a.look = look;
      }
      if (body.deco !== undefined) {
        if (body.deco !== null && !DECOS.includes(body.deco as VoDeco)) throw badRequest();
        a.deco = body.deco as VoDeco | null;
      }
      if (body.pc !== undefined) {
        if (!PCS.includes(body.pc as VoPc)) throw badRequest();
        a.pc = body.pc as VoPc;
      }
      if (body.mon !== undefined) {
        if (body.mon !== 0 && body.mon !== 1 && body.mon !== 2) throw badRequest();
        a.mon = body.mon;
      }
      if (body.keyboard !== undefined) {
        if (!KEYBOARDS.includes(body.keyboard as VoKeyboard)) throw badRequest();
        a.keyboard = body.keyboard as VoKeyboard;
      }
      return a;
    }
    case "chat": {
      const a: Extract<VoAction, { type: "chat" }> = { type: "chat", text: text(body.text, CHAT_MAX, "chat", true, CHAT_MAX_LINES) };
      if (body.room !== undefined) a.room = str(body.room);
      // 名指しは画面の補助なので、形の合わない値は黙って落とす(同じ部屋にいるかはactions.tsで絞る)
      if (Array.isArray(body.mentions)) {
        a.mentions = [...new Set(body.mentions.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 100))].slice(0, MENTIONS_MAX);
      }
      return a;
    }
    case "react":
      if (!VO_REACTIONS.includes(body.kind as VoReactionKind)) throw badRequest();
      return { type: "react", messageId: str(body.messageId), kind: body.kind as VoReactionKind };
    case "unchat":
      return { type: "unchat", messageId: str(body.messageId) };
    case "call":
    case "wave":
      return { type: body.type, toUserId: str(body.toUserId) };
    case "emote":
      if (!EMOTES.includes(body.emote as VoEmote)) throw badRequest();
      return { type: "emote", emote: body.emote as VoEmote };
    case "answer": {
      const id = body.callId;
      if (typeof id !== "number" || !Number.isInteger(id) || id < 1) throw badRequest();
      if (body.answer !== "go" && body.answer !== "later") throw badRequest();
      return { type: "answer", callId: id, answer: body.answer };
    }
    default:
      throw badRequest();
  }
}

/** ?since= の値。無ければundefined、0以上の整数でなければ422 */
export function parseSince(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw badRequest();
  return n;
}

/** ?idle= (最後に触ってからの秒数)。無い・数でなければundefined(最後に触った時刻を進めない)。負は0、1日より大きければ1日に丸める */
export function parseIdle(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 86_400) : undefined;
}
