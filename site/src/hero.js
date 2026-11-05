// ヒーロー: 本物のエンジンでサンプルのオフィスを描き、数秒おきに架空の人の状態だけ差し替える(操作は受け付けない)
import "../../src/engine/office.css";
import { mountOffice } from "../../src/engine/office.js";
import { seatsOf } from "../../src/engine/map.js";

const host = document.getElementById("hero-office");
const lang = document.documentElement.lang === "ja" ? "ja" : "en";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// 会話: l=[役(0=A,1=B,2=C), 台詞]、e=[役, 締めのエモーション]
const SCRIPTS = {
  ja: [
    { l: [[0, "お昼どうする？"], [1, "駅前のカレー行きたい"], [2, "行く〜！"]], e: [0, "banzai"] },
    { l: [[0, "レビューお願いできますか？"], [1, "見ます！10分ください"], [0, "助かります"]], e: [0, "good"] },
    { l: [[0, "さっきの不具合、直りました"], [1, "ありがとう！確認します"]], e: [1, "clap"] },
    { l: [[0, "3時から打ち合わせできる？"], [1, "大丈夫です"]] },
    { l: [[0, "コーヒー淹れるけど、いる？"], [1, "ほしい！"], [2, "私も〜"]], e: [0, "heart"] },
  ],
  en: [
    { l: [[0, "Lunch plans?"], [1, "Curry place by the station?"], [2, "I'm in!"]], e: [0, "banzai"] },
    { l: [[0, "Could you review my PR?"], [1, "Sure, give me 10 minutes"], [0, "Thanks!"]], e: [0, "good"] },
    { l: [[0, "That bug is fixed now"], [1, "Nice, I'll check it"]], e: [1, "clap"] },
    { l: [[0, "Quick sync at 3?"], [1, "Works for me"]] },
    { l: [[0, "Making coffee. Want some?"], [1, "Yes please!"], [2, "Me too"]], e: [0, "heart"] },
  ],
};
const NAMES = ["Aoi", "Ren", "Mio", "Sora", "Hana", "Kai", "Yui", "Riku"];
const LOOKS = [
  ["bob", "dbrown", "l", "teal", "navy", "hoodie", "glasses"], ["short", "black", "m", "red", "grey", "shirt", "none"],
  ["long", "brown", "pl", "yellow", "beige", "cardigan", "ribbon"], ["pony", "black", "l", "blue", "black", "tee", "cap"],
  ["bun", "gold", "l", "green", "denim", "border", "round"], ["messy", "brown", "m", "orange", "navy", "polo", "none"],
  ["twin", "pink", "pl", "sky", "white", "knit", "hairpin"], ["slick", "ash", "d", "navy", "khaki", "blazer", "none"],
].map(([hair, hc, sk, cl, pt, ot, ac]) => ({ hair, hc, sk, cl, pt, ot, ac }));
const DECOS = ["plant", "mug", "cactus", "robot", "bear", "bonsai", "duck", "books"];
const EMOTES = ["clap", "good", "heart", "wow", "banzai", "dance"];

// 訪問者の時計で朝・昼・夕・夜を決める
function timeOfDay() {
  const h = new Date().getHours();
  return h >= 5 && h < 10 ? "morning" : h < 16 && h >= 10 ? "day" : h >= 16 && h < 19 ? "evening" : "night";
}

// 構図: k=倍率、x・y=画面の幅・高さに対するずらし量(右・下が正)。ここを触って調整する
const YOU = { ja: "あなた", en: "You" };
const FRAME = () => innerWidth > 900 ? { k: 1.32, x: 0.27, y: 0.17 } : innerWidth > 720 ? { k: 1.8, x: -0.06, y: -0.11 } : { k: 2.1, x: -0.06, y: -0.19 };

let handle, timer, state, ctx;

async function setup() {
  const map = await (await fetch(host.dataset.map)).json();
  const seats = seatsOf(map);
  const floor = map.floors[0];
  const work = floor.rooms.find((r) => r.kind === "work");
  const brk = floor.rooms.find((r) => r.kind === "break");
  const workSeats = seats.filter((s) => s.room === work.id && s.floor === floor.id);
  const breakSeats = brk ? seats.filter((s) => s.room === brk.id && s.floor === floor.id) : [];
  // 席は島ごとに固まっている。文字の裏に隠れない島(最初の島)に4人、ほかの島に2人、休憩室に1人
  const isl = (st) => st.id.replace(/-\d+$/, "");
  const groups = [...new Set(workSeats.map(isl))].map((k) => workSeats.filter((st) => isl(st) === k));
  const main = groups[0];
  const spots = [main[0], main[1], main[3], main[4], groups[1]?.[2], groups[2]?.[4], breakSeats[0]].filter(Boolean);
  const people = spots.map((s, i) => ({
    id: "u" + (i + 1), name: NAMES[i], look: LOOKS[i], deco: DECOS[i], pc: i % 2 ? "win" : "mac", mon: i % 3, keyboard: ["none", "colorful", "dark", "split"][i % 4], memo: "",
    presence: { room: s.room, seatId: s.id, status: i === 4 ? "focus" : s.room === (brk && brk.id) ? "break" : "work", away: false, focusUntil: null, inMeeting: false, mugUntil: null, overflow: false, stale: false },
  }));
  state = {
    serverTime: new Date().toISOString(), date: new Date().toISOString().slice(0, 10), meId: "u1", people, messages: [], events: [], lastEventId: 0, meetUrls: {},
    autoLeftAt: null, talkingUserIds: [], talkingRooms: [], emotes: [], isAdmin: false, partsVersion: 0, season: null,
  };
  ctx = { map, workSeats, breakSeats, work, brk, main, isl, n: 0, msg: 0, si: Math.floor(Math.random() * SCRIPTS[lang].length), queue: [], gap: 0 };
}

function mount() {
  handle = mountOffice(host, {
    map: ctx.map, appName: "Pixeloft", initial: state, weather: null, send: () => Promise.reject(new Error("hero")),
    timeOfDay: timeOfDay(), weatherKind: "sunny", preview: true, tags: true, frame: FRAME, freeze: reduce, t: (k) => (k === "engine.you" ? YOU[lang] : k), // 名札に出る文言はこれだけ
  });
}

// 会話(数ティック)→ 合間に2回だけ席替え・エモーション・離席のON/OFF、を繰り返す
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const inMainWork = (p) => ctx.main.some((st) => st.id === p.presence.seatId) && p.presence.room === ctx.work.id && !p.presence.away;
// 会話を始めて、台詞とエモーションを queue に積む。人数が足りなければ false
function startConv() {
  const cast = state.people.filter((p) => p.id !== "u1" && inMainWork(p)).sort(() => Math.random() - 0.5);
  const list = SCRIPTS[lang];
  for (let k = 0; k < list.length; k++) {
    const sc = list[(ctx.si + k) % list.length];
    if (Math.max(...sc.l.map(([r]) => r)) >= cast.length) continue;
    ctx.si = (ctx.si + k + 1) % list.length;
    ctx.queue = sc.l.map(([r, text]) => ({ id: cast[r].id, text }));
    if (sc.e) ctx.queue.push({ id: cast[sc.e[0]].id, emote: sc.e[1] });
    return true;
  }
  return false;
}
function step() {
  const { workSeats, breakSeats, work, main, isl } = ctx;
  const now = Date.now(), at = new Date(now).toISOString();
  state.emotes = []; state.talkingUserIds = [];
  if (!ctx.queue.length && ctx.gap <= 0) { startConv(); ctx.gap = 2; }
  if (ctx.queue.length) {
    const a = ctx.queue.shift(), p = state.people.find((x) => x.id === a.id);
    if (inMainWork(p)) { // 離席・移動した人の台詞は飛ばす
      if (a.emote) state.emotes = [{ userId: p.id, emote: a.emote, at }];
      else state.messages = [...state.messages, { id: "m" + ++ctx.msg, room: work.id, userId: p.id, name: p.name, text: a.text, createdAt: at, mentions: [], deleted: false, reactions: [] }].slice(-6);
    }
  } else {
    ctx.gap--;
    const inMain = state.people.filter((p) => main.some((st) => st.id === p.presence.seatId) || breakSeats.some((st) => st.id === p.presence.seatId));
    const kind = ctx.n++ % 3;
    if (kind === 0) {
      const p = rnd(state.people), taken = new Set(state.people.map((x) => x.presence.seatId));
      const home = main.includes(workSeats.find((st) => st.id === p.presence.seatId)) || breakSeats.some((st) => st.id === p.presence.seatId) ? main : workSeats.filter((st) => isl(st) === p.presence.seatId.replace(/-\d+$/, ""));
      const pool = home === main && breakSeats.length && Math.random() < 0.35 ? breakSeats : home;
      const to = rnd(pool.filter((st) => !taken.has(st.id)));
      if (to) { p.presence.room = to.room; p.presence.seatId = to.id; p.presence.status = to.room === work.id ? "work" : "break"; }
    } else if (kind === 1) {
      state.emotes = [{ userId: rnd(inMain).id, emote: rnd(EMOTES), at }];
    } else {
      // 離席は同時に1人まで(増えると会話の相手がいなくなる)
      const back = state.people.find((x) => x.presence.away);
      if (back) back.presence.away = false; else rnd(state.people.filter((x) => x.id !== "u1")).presence.away = true;
    }
  }
  state.serverTime = at;
  handle.update(state);
}

let first;
const start = () => { if (!timer && !reduce) { timer = setInterval(step, 2800); first = setTimeout(step, 1200); } };
const stop = () => { clearInterval(timer); clearTimeout(first); timer = 0; };
let visible = true;
// 画面外・タブが隠れている間はエンジンごと破棄して止める(戻ったらその時点の状態で作り直す)
function sync() {
  const run = visible && !document.hidden;
  if (run && !handle) { mount(); start(); } else if (!run && handle) { stop(); handle.destroy(); handle = null; }
}

try {
  await setup();
  new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; sync(); }).observe(host.parentElement);
  document.addEventListener("visibilitychange", sync);
  sync();
  host.parentElement.classList.add("live");
  window.__hero = { get running() { return !!handle && !!timer; }, get state() { return state; } };
} catch (e) {
  console.warn("hero skipped", e); // 背景が出せなくても本文は読める
}
