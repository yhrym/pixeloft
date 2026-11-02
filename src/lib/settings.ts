import { prisma } from "./db.ts";
import { isEventMode } from "./virtual-office/events.ts";
import { shortCache } from "./virtual-office/short-cache.ts";

export type Settings = {
  timeZone: string;
  /** 0〜23。この時刻より後に操作がないと自動で退出する */
  workEndHour: number;
  weather: { lat: number; lon: number } | null;
  /** 部屋のid → 通話URL(http/https) */
  callUrls: Record<string, string>;
  /** "auto"・"none"・季節のイベントのid */
  seasonMode: string;
};

const DEFAULT_TZ = "Asia/Tokyo";
// 保存できるのはIntl.supportedValuesOfの名前。UTCだけは一覧に入らないので足す
const ZONES = new Set([...Intl.supportedValuesOf("timeZone"), "UTC"]);
export const isTimeZone = (v: unknown): v is string => typeof v === "string" && ZONES.has(v);

const isHour = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23;
const isLat = (v: unknown): v is number => typeof v === "number" && v >= -90 && v <= 90;
const isLon = (v: unknown): v is number => typeof v === "number" && v >= -180 && v <= 180;
export const CALL_URL_MAX = 300;
export function isCallUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > CALL_URL_MAX) return false;
  try {
    const p = new URL(v).protocol;
    return p === "https:" || p === "http:";
  } catch {
    return false;
  }
}

const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** DBの行(キー→値)から設定を作る。壊れた値は既定に戻す */
export function settingsFrom(rows: Record<string, unknown>, env: Record<string, string | undefined> = process.env): Settings {
  const w = rows.weather;
  return {
    timeZone: isTimeZone(rows.timeZone) ? rows.timeZone : isTimeZone(env.TZ) ? env.TZ : DEFAULT_TZ,
    workEndHour: isHour(rows.workEndHour) ? rows.workEndHour : 18,
    weather: obj(w) && isLat(w.lat) && isLon(w.lon) ? { lat: w.lat, lon: w.lon } : null,
    callUrls: obj(rows.callUrls)
      ? Object.fromEntries(Object.entries(rows.callUrls).filter((e): e is [string, string] => isCallUrl(e[1])))
      : {},
    seasonMode: isEventMode(rows.seasonMode) ? rows.seasonMode : "auto",
  };
}

/** 1秒だけ使い回す(stateのたびに読まない) */
export function getSettings(now = new Date()): Promise<Settings> {
  return shortCache("settings", now, async () => {
    const rows = await prisma.voSetting.findMany({ where: { key: { in: ["timeZone", "workEndHour", "weather", "callUrls", "seasonMode"] } } });
    return settingsFrom(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  });
}

export type SettingsError = "timeZone" | "workEndHour" | "weather" | "callUrl" | "season";

/** 設定フォームの検証。roomIdsは公開中のマップの部屋(ここにない部屋のURLは捨てる) */
export function parseSettingsForm(get: (name: string) => string | null, roomIds: string[]): { ok: true; value: Settings } | { ok: false; error: SettingsError } {
  const timeZone = (get("timeZone") ?? "").trim();
  if (!isTimeZone(timeZone)) return { ok: false, error: "timeZone" };
  const hourText = (get("workEndHour") ?? "").trim();
  const workEndHour = /^\d{1,2}$/.test(hourText) ? Number(hourText) : NaN;
  if (!isHour(workEndHour)) return { ok: false, error: "workEndHour" };
  const latText = (get("lat") ?? "").trim();
  const lonText = (get("lon") ?? "").trim();
  let weather: Settings["weather"] = null;
  if (latText !== "" || lonText !== "") {
    const lat = latText === "" ? NaN : Number(latText);
    const lon = lonText === "" ? NaN : Number(lonText);
    if (!isLat(lat) || !isLon(lon)) return { ok: false, error: "weather" };
    weather = { lat, lon };
  }
  const callUrls: Record<string, string> = {};
  for (const id of roomIds) {
    const url = (get(`call.${id}`) ?? "").trim();
    if (url === "") continue;
    if (!isCallUrl(url)) return { ok: false, error: "callUrl" };
    callUrls[id] = url;
  }
  const seasonMode = (get("seasonMode") ?? "").trim();
  if (!isEventMode(seasonMode)) return { ok: false, error: "season" };
  return { ok: true, value: { timeZone, workEndHour, weather, callUrls, seasonMode } };
}

export async function saveSettings(s: Settings): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const put = (key: string, value: object | string | number) => tx.voSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    await put("timeZone", s.timeZone);
    await put("workEndHour", s.workEndHour);
    if (s.weather) await put("weather", s.weather);
    else await tx.voSetting.deleteMany({ where: { key: "weather" } });
    await put("callUrls", s.callUrls);
    await put("seasonMode", s.seasonMode);
  });
}
