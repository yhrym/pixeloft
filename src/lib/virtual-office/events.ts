/** 季節の飾り(1年分)。管理者は「日付で自動」か、決まったイベントに固定できる。名前はi18nの`season.{id}` */

export type VoEventDecor = { id: string; from: string; to: string };

/** from・toは"MM-DD"(両端を含む)。toがfromより前なら年をまたぐ。重なったときは上にあるほうを使う */
export const VO_EVENT_DECORS: VoEventDecor[] = [
  { id: "newyear", from: "12-29", to: "01-07" },
  { id: "setsubun", from: "01-28", to: "02-03" },
  { id: "valentine", from: "02-07", to: "02-14" },
  { id: "hinamatsuri", from: "02-24", to: "03-03" },
  { id: "whiteday", from: "03-08", to: "03-14" },
  { id: "sakura", from: "03-20", to: "04-12" },
  { id: "kodomo", from: "04-22", to: "05-05" },
  { id: "tsuyu", from: "06-01", to: "06-30" },
  { id: "tanabata", from: "07-01", to: "07-07" },
  { id: "summer", from: "07-15", to: "08-31" },
  { id: "tsukimi", from: "09-10", to: "09-25" },
  { id: "halloween", from: "10-15", to: "10-31" },
  { id: "autumn", from: "11-01", to: "11-25" },
  { id: "xmas", from: "12-01", to: "12-25" },
];

/** "auto"(日付で自動)、"none"(飾りなし)、またはイベントのid */
export type VoEventMode = string;

const inRange = (md: string, e: VoEventDecor) => (e.from <= e.to ? e.from <= md && md <= e.to : md >= e.from || md <= e.to);

/** その日(YYYY-MM-DD)に出すイベントのid。年をまたぐ期間あり。重なったら一覧の上のほう。無ければnull */
export function eventOn(date: string, decors: VoEventDecor[] = VO_EVENT_DECORS): string | null {
  const md = date.slice(5);
  return decors.find((e) => inRange(md, e))?.id ?? null;
}

/** 保存できるmode: "auto"・"none"・イベントのid */
export function isEventMode(v: unknown): v is VoEventMode {
  return v === "auto" || v === "none" || VO_EVENT_DECORS.some((e) => e.id === v);
}

/** modeから今出すイベント。"auto"なら日付から、"none"や知らない値はnull */
export function activeEvent(mode: string, date: string): string | null {
  if (mode === "auto") return eventOn(date);
  return VO_EVENT_DECORS.some((e) => e.id === mode) ? mode : null;
}
