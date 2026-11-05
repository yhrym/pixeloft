// office.js(エンジン)の入口だけの型。中身は型検査しない(.jsのまま)
import type { VoAction, VoState } from "@/lib/virtual-office/types";
import type { MapItem, OfficeMap } from "./map.js";

/** オフィスの窓の天気。ページが天気の値から作る */
export type OfficeWeather = { kind: "sunny" | "cloudy" | "rain" | "snow"; label: string; temp: number };

/** みんなのパーツ(GET /api/office/parts の行)。dataの形は src/lib/parts/validate.ts */
export type OfficePart = { id: string; kind: "hair" | "ot" | "ac"; name: string; data: unknown; createdByName?: string };

export type OfficeOptions = {
  /** みんなのパーツ。あとから handle.setParts で入れ替える */
  parts?: OfficePart[];
  /** 画面の文言を返す翻訳関数(キーは src/i18n の engine.*)。省略するとキーがそのまま出る */
  t?: (key: string, vars?: Record<string, string | number>) => string;
  /** 間取り。floors[0]が最下階(1〜5階)。部屋がひとつも無いときは案内とメニューだけ出す */
  map: OfficeMap;
  /** 左上に出すアプリ名 */
  appName?: string;
  /** HUDのメニューボタンから開く項目。hrefはリンク、onClickはボタン。空なら出さない */
  menu?: Array<{ label: string; href?: string; onClick?: () => void }>;
  /** ページを開いたときの状態(buildState) */
  initial: VoState;
  /** 取れなかったらnull(天気を出さない) */
  weather: OfficeWeather | null;
  /** 操作を送る。成功したら新しい状態、失敗したら日本語の message の Error で reject する */
  send: (action: VoAction) => Promise<VoState>;
  /** 現在表示中の階(初期表示時にも通知) */
  onFloorChange?: (floorId: string) => void;
  /** プラグインの置き物の種類 → 上に出す押せるボタンの名前(いま見ている階だけ。preview では出さない) */
  itemButtons?: Record<string, string>;
  /** itemButtons のボタンが押された。item はマップの置き物に、いま見ている階のid(floor)を足したもの */
  onItemClick?: (item: MapItem & { floor: string }) => void;
  /** HUDの中に差し込む要素(プラグインが小さい窓を置く所)。preview では出さない */
  dock?: HTMLElement;
  /** 通知の購読。鍵が無い環境では渡さない(「呼ばれたら通知する」を出さない) */
  enablePush?: () => Promise<unknown>;
  /** 時刻・時間帯・日付に使うタイムゾーン(IANA。例 Asia/Tokyo)。省略は端末の時間帯 */
  timeZone?: string;
  /** 自動退出の時刻(0〜23時)。案内と自動退出のお知らせの文言に使う。省略は18 */
  workEndHour?: number;
  /** 時間帯を固定する(ハーネス用)。省略するとtimeZoneの時刻で決まる */
  timeOfDay?: "morning" | "day" | "evening" | "night";
  /** 天気を固定する(ハーネス用)。省略すると weather の値、それも無ければ "sunny" */
  weatherKind?: "sunny" | "cloudy" | "rain" | "snow";
  /** true なら描画ループを回さず、時間を進めない(最初の描画のまま止まる)。同じ入力から毎回同じ画素になる(ハーネス用) */
  freeze?: boolean;
  /** true ならエディタのプレビュー用: HUD・名札・ボタンなし、操作は送らない、描画以外のタイマーなし、カメラは床の全体(階が複数なら階のボタンだけ出す) */
  preview?: boolean;
  /** preview 用: 描き直す前のカメラ(handle.camera() の値)。user が true ならズーム・パンを戻し、false なら全体に合わせる */
  camera?: OfficeCamera;
  /** preview 用: 全体に合わせた構図を、中心まわりに k 倍し、画面の幅・高さの x・y 倍だけ内容をずらす(CSSの translate(x*100%, y*100%) scale(k) と同じ)。リサイズのたびに呼ぶ */
  frame?: () => { k: number; x: number; y: number };
  /** preview 用: true なら人の名札だけ出す(表札・ボタンなし、押せない)。ふだんの preview は何も出さない */
  tags?: boolean;
};

export type OfficeCamera = { s: number; x: number; y: number; floor: string; user: boolean };

export type OfficeHandle = {
  /** ポーリングで受け取った状態を反映する(入室・退出・移動は歩いて見せる) */
  update(state: VoState): void;
  /** Document Picture-in-Picture の小窓が開いている(タブが隠れていても4秒ごとに取りに行く) */
  setParts(parts: OfficePart[]): void;
  /** プラグイン1つの状態だけ差し替えて描き直す */
  setPluginState(id: string, value: unknown): void;
  miniOpen(): boolean;
  /** いま見ている階の、エンジンの絵そのもの(左右反転の前・拡大の前の canvas)。画素の比較用 */
  worldCanvas(): HTMLCanvasElement;
  /** いまのカメラ(倍率・左上の座標・階・自分で動かしたか)。preview の描き直しで引き継ぐ */
  camera(): OfficeCamera;
  destroy(): void;
};

/** root の中にHUDとcanvasを作ってオフィスを動かす。グローバルには何も残さない */
export function mountOffice(root: HTMLElement, options: OfficeOptions): OfficeHandle;
