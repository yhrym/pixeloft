/** プラグインを書く人向けの型。プラグインは `import type { … } from "@/plugins/types"` で使う */

import type { Dir, MapItem } from "../engine/map.js";

export type PluginDir = Dir;
export type PluginBox = { b: [number, number, number, number, number, number]; block?: boolean; draw?: boolean };
export type PluginSeat = { dx: number; dy: number; face: "NE" | "NW" | "SE" | "SW"; type: string; [extra: string]: unknown };

/** plugins/<id>/catalog.js の置き物の定義(キーは `<id>:<名前>`)。形は本体の catalog.js の DEFS と同じ */
export type PluginItemDef = {
  cat?: string;
  dirs: PluginDir[];
  /** 絵のある向き。無い向きは転置か180度回転で作る(sym) */
  art?: PluginDir[];
  sym?: boolean;
  props: Record<string, unknown>;
  boxes?: (dir: PluginDir, props: Record<string, unknown>) => PluginBox[];
  seats?: (dir: PluginDir, props: Record<string, unknown>) => PluginSeat[];
};

/** マップの置き物 */
export type PluginItem = MapItem;

/** draw.js の関数の第1引数。エンジンの描画の関数をそのまま渡す(転置もそのまま効く) */
export type PluginDrawTools = {
  box: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top?: string, left?: string, right?: string, edge?: string) => void;
  wp: (x: number, y: number, z: number, color: number) => void;
  cc: (ch: string) => number;
  flush: (outline?: boolean, color?: string) => void;
  spr: (px: number, py: number, rows: string[], map?: unknown, flip?: boolean) => void;
  sprAt: (x: number, y: number, z: number, rows: string[], ax: number, ay: number, map?: unknown) => void;
  standAt: (x: number, y: number, z: number, rows: string[], map?: unknown) => void;
  paintL: (y: number, x0: number, zTop: number, rows: string[], map?: unknown) => void;
  paintR: (x: number, y: number, zTop: number, rows: string[], map?: unknown) => void;
  PX: (x: number, y: number) => number;
  PY: (x: number, y: number, z: number) => number;
  isLit: () => boolean;
  /** 席のidに座っている人(いなければnull) */
  occupantOf: (seatId: string) => { id: string; name: string } | null;
  /** 現在時刻(ミリ秒)。アニメーション用 */
  now: () => number;
};
export type PluginDrawArgs<S = unknown> = {
  x: number; y: number; dir: PluginDir; props: Record<string, unknown>; item: PluginItem;
  /** boxes の何番目の箱の絵か */
  part: number;
  /** そのプラグインの状態(サーバーの state(ctx) の値。まだ無ければ undefined) */
  state: S | undefined;
};
/** plugins/<id>/draw.js の中身 */
export type PluginDraw = Record<string, (k: PluginDrawTools, d: PluginDrawArgs) => void>;

export type PluginUser = { id: string; name: string; isAdmin: boolean };
export type PluginPerson = { id: string; name: string; room: string; seatId: string | null; away: boolean };
export type PluginRoom = { id: string; name: string; kind: string; floor: string };
export type PluginMapItem = { id: string; type: string; floor: string; x: number; y: number; dir: PluginDir; props: Record<string, unknown> };
export type PluginStore = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  /** fn はプロセスの中で(プラグイン, key)ごとに順番に呼ばれる。返した値を保存して返す */
  update: (key: string, fn: (current: unknown) => unknown | Promise<unknown>) => Promise<unknown>;
  delete: (key: string) => Promise<void>;
  keys: (prefix?: string) => Promise<string[]>;
};
export type PluginCtx = {
  user: PluginUser;
  locale: "ja" | "en";
  now: Date;
  /** 設定のタイムゾーンの YYYY-MM-DD */
  date: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  store: PluginStore;
  /** 今日在室している人 */
  people: () => Promise<PluginPerson[]>;
  /** 公開中のマップの部屋 */
  rooms: () => Promise<PluginRoom[]>;
  /** 公開中のマップにある、このプラグインの置き物 */
  items: () => Promise<PluginMapItem[]>;
  /** その状態コードとメッセージ(文言のキー)で返す。呼んだ所から先は実行されない */
  fail: (status: number, key: string, vars?: Record<string, string | number>) => never;
};
/** plugins/<id>/server.ts の export default。payload・params は信用しない(プラグインが確かめる) */
export type PluginServer = {
  state?: (ctx: PluginCtx) => unknown | Promise<unknown>;
  actions?: Record<string, (ctx: PluginCtx, payload: unknown) => unknown | Promise<unknown>>;
  get?: (ctx: PluginCtx, params: Record<string, string>) => unknown | Promise<unknown>;
};

export type PluginDialog = { body: HTMLElement; close: () => void };
export type PluginApi = {
  id: string;
  locale: "ja" | "en";
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** 操作を送る。返ってきた state はすぐエンジンと onState に流す。失敗はサーバーの message の Error(status つき) */
  send: (action: string, payload?: unknown) => Promise<unknown>;
  get: (params?: Record<string, string>) => Promise<unknown>;
  /** いまの state(サーバーの state(ctx) の値) */
  state: () => unknown;
  /** state を受け取るたび(変わっていなくても。約4秒ごとと send のあと)。外す関数を返す */
  onState: (cb: (state: unknown) => void) => () => void;
  me: () => { id: string; name: string; isAdmin: boolean; room: string | null; seatId: string | null };
  /** HUDのメニューに足す(setup の中で呼ぶ) */
  menu: (label: string, onClick: () => void) => void;
  /** その種類の置き物の上に押せるボタンを出す(いま見ている階だけ。プレビューでは出さない) */
  onItemClick: (type: string, label: string, cb: (item: PluginMapItem) => void) => void;
  /** HUDの中の、小さい窓を置く場所。中身はプラグインがDOMで作る。人が書いた文字は textContent で入れる */
  dock: HTMLElement;
  /** 本体と同じ見た目のダイアログ(showModal) */
  dialog: (title: string) => PluginDialog;
};
/** plugins/<id>/client.ts の export default。関数を返すと、画面を外すとき(エンジンの dispose)に後片付けとして呼ぶ */
export type PluginClientSetup = (api: PluginApi) => void | (() => void);
