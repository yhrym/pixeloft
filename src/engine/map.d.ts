// マップのJSONの型と、マップから部屋・席の一覧を作る関数。エンジンとサーバーの両方が使う
// roomsOf・seatsOfの引数と、返す項目の名前・意味は変えない（項目を足すのはよい）

export type Dir = "x+" | "x-" | "y+" | "y-";
export type Rect = [x0: number, y0: number, x1: number, y1: number];
export type RoomKind = "work" | "meeting" | "break" | "free" | "hall";

/** 床の柄・壁・扉の種類のid一覧は catalog.js の FLOOR_KINDS・WALL_KINDS・DOOR_KINDS */
export type MapRoom = {
  id: string;
  name: string;
  kind: RoomKind;
  rects: Rect[];
  /** 床の柄(FLOOR_KINDS)。省略は部屋の種類ごとの既定(DEFAULT_FLOOR)、屋外はdeck */
  floor?: string;
  outdoor?: boolean;
  sign?: [x: number, y: number];
  /** 表札の付け方。floor=床に立てる（既定）、wall=signのyにある壁から吊る */
  signMount?: "floor" | "wall";
  /** 表札の高さ（signMountがwallのとき。floorのときは使わない） */
  signZ?: number;
};
export type MapWall = { axis: "x" | "y"; at: number; a: number; b: number; kind: string; h?: number; blinds?: boolean; frost?: boolean };
export type MapDoor = { id: string; axis: "x" | "y"; at: number; a: number; b: number; kind: string; h?: number };
export type MapItem = {
  id: string;
  type: string;
  x: number;
  y: number;
  dir: Dir;
  props?: Record<string, unknown>;
  season?: string;
};
/** 階。部屋のrectsを合わせた形が床になる。入口(props.entrance)の置き物を階に1つ置くと、階をまたぐ移動はそこを通る */
export type MapFloor = { id: string; name: string; rooms: MapRoom[]; walls: MapWall[]; doors: MapDoor[]; items: MapItem[] };
/**
 * floors[0]が最下階で、上の階ほど後ろに並べる(1〜5階。階のボタンは上の階が上)。階のidはマップの中で重ならない。
 * 全階が同じワールド座標を使う(1階あたり1024×1024まで、負の座標もよい)。部屋のidはマップ全体で重ならない
 */
export type OfficeMap = { version: 1; name: string; backdrop: "city" | "countryside"; floors: MapFloor[] };

export type RoomInfo = { id: string; name: string; kind: RoomKind; floor: string };
export type SeatInfo = {
  /** `${置き物のid}-${番号}` */
  id: string;
  /** 席の位置を含む部屋のid */
  room: string;
  floor: string;
  /** office・sofa・stoolなど（移植元のVoSeatType） */
  type: string;
  x: number;
  y: number;
  face: "NE" | "NW" | "SE" | "SW";
  label?: string;
  /** 席を出した置き物のid */
  item: string;
  /** 置き物の中の席の番号（idの後ろ） */
  no: number;
  /** カタログが席ごとに持つ項目（椅子の色・座面の高さなど。エンジンが使う） */
  [extra: string]: unknown;
};

export function roomsOf(map: OfficeMap): RoomInfo[];
export function seatsOf(map: OfficeMap): SeatInfo[];
