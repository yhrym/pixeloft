// ヒーロー: 本物のエンジンでサンプルのオフィスを描き、数秒おきに架空の人の状態だけ差し替える(操作は受け付けない)
import "../../src/engine/office.css";
import { mountOffice } from "../../src/engine/office.js";
import { seatsOf } from "../../src/engine/map.js";

const host = document.getElementById("hero-office");
const lang = document.documentElement.lang === "ja" ? "ja" : "en";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

const LINES = {
  ja: ["コーヒー行く人〜？", "レビューお願いします", "お昼どうする？", "さっきの直しました！", "ちょっと相談いい？", "おつかれさま〜"],
  en: ["Anyone up for coffee?", "Review please?", "Lunch at noon?", "Pushed the fix!", "Got a minute?", "Nice work, team"],
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
    presence: { room: s.room, seatId: s.id, status: i === 1 ? "focus" : s.room === (brk && brk.id) ? "break" : "work", away: false, focusUntil: null, inMeeting: false, mugUntil: null, overflow: false, stale: false },
  }));
  state = {
    serverTime: new Date().toISOString(), date: new Date().toISOString().slice(0, 10), meId: "u1", people, messages: [], events: [], lastEventId: 0, meetUrls: {},
    autoLeftAt: null, talkingUserIds: [], talkingRooms: [], emotes: [], isAdmin: false, partsVersion: 0, season: null,
  };
  ctx = { map, workSeats, breakSeats, work, brk, main, isl, n: 0, msg: 0 };
}

function mount() {
  handle = mountOffice(host, {
    map: ctx.map, appName: "Pixeloft", initial: state, weather: null, send: () => Promise.reject(new Error("hero")),
    timeOfDay: timeOfDay(), weatherKind: "sunny", preview: true, freeze: reduce, t: (k) => k,
  });
}

// 数秒おきに1つだけ動かす: 席替え・拍手などのエモーション・ひとこと・離席のON/OFF
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
function step() {
  const { workSeats, breakSeats, work, main, isl } = ctx;
  const now = Date.now();
  const inMain = state.people.filter((p) => main.some((st) => st.id === p.presence.seatId) || breakSeats.some((st) => st.id === p.presence.seatId));
  state.emotes = []; state.talkingUserIds = [];
  const kind = ctx.n++ % 4;
  if (kind === 0) {
    const p = rnd(state.people), taken = new Set(state.people.map((x) => x.presence.seatId));
    const home = main.includes(workSeats.find((st) => st.id === p.presence.seatId)) || breakSeats.some((st) => st.id === p.presence.seatId) ? main : workSeats.filter((st) => isl(st) === p.presence.seatId.replace(/-\d+$/, ""));
    const pool = home === main && breakSeats.length && Math.random() < 0.35 ? breakSeats : home;
    const to = rnd(pool.filter((st) => !taken.has(st.id)));
    if (to) { p.presence.room = to.room; p.presence.seatId = to.id; p.presence.status = to.room === work.id ? "work" : "break"; }
  } else if (kind === 1) {
    state.emotes = [{ userId: rnd(inMain).id, emote: rnd(EMOTES), at: new Date(now).toISOString() }];
  } else if (kind === 2) {
    const p = rnd(inMain.filter((x) => x.id !== "u1" && x.presence.room === work.id));
    if (p) state.messages = [...state.messages, { id: "m" + ++ctx.msg, room: work.id, userId: p.id, name: p.name, text: rnd(LINES[lang]), createdAt: new Date(now).toISOString(), mentions: [], deleted: false, reactions: [] }].slice(-6);
  } else {
    const p = rnd(state.people.filter((x) => x.id !== "u1"));
    p.presence.away = !p.presence.away;
  }
  state.serverTime = new Date(now).toISOString();
  handle.update(state);
}

const start = () => { if (!timer && !reduce) timer = setInterval(step, 3800); };
const stop = () => { clearInterval(timer); timer = 0; };
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
