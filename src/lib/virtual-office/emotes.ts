/** エモーション(数秒で消えるのでDBに入れない)。state.tsが返し、actions.tsが書く */
import type { VoEmote } from "./types.ts";

export const EMOTE_MS = 6000;
/** 同じ人の連打よけ */
export const EMOTE_GAP_MS = 1000;

// shortcut: appのプロセスが1つの前提。複数にしたらDBに移す
// devのホットリロードと、action/stateの別ルートで同じMapを見るためglobalThisに置く(Prismaクライアントと同じ)
const g = globalThis as unknown as { voEmotes?: Map<string, { emote: VoEmote; at: number }> };
const emotes = (g.voEmotes ??= new Map());

/** 間隔が短すぎたら書かずにfalse */
export function putEmote(userId: string, emote: VoEmote, now: Date, force = false): boolean {
  const last = emotes.get(userId);
  if (!force && last && now.getTime() - last.at < EMOTE_GAP_MS) return false;
  emotes.set(userId, { emote, at: now.getTime() });
  return true;
}

/** 期限切れはついでに消す */
export function recentEmotes(now: Date): { userId: string; emote: VoEmote; at: string }[] {
  const out = [];
  for (const [userId, e] of emotes) {
    if (now.getTime() - e.at >= EMOTE_MS) emotes.delete(userId);
    else out.push({ userId, emote: e.emote, at: new Date(e.at).toISOString() });
  }
  return out;
}
