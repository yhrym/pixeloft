/** バーチャルオフィスのAPIの型(サーバーとクライアントの約束) */

export type VoStatus = "work" | "focus" | "break" | "meet";
export type VoPc = "mac" | "win";
export type VoKeyboard = "none" | "colorful" | "dark" | "split";
/** エモーション。記号はエンジンのsprites.jsのEMOTESと同じ(emotes.test.tsで確かめる) */
export type VoEmote = "dance" | "jump" | "spin" | "banzai" | "clap" | "heart" | "good" | "wow" | "what" | "sweat";
/** 机の飾り。記号はエンジンのsprites.jsのDECOSと同じ(deco.test.tsで確かめる) */
export type VoDeco =
  | "plant" | "cactus" | "succulent" | "bonsai" | "flower"
  | "mug" | "tumbler" | "energy" | "snack"
  | "figure" | "robot" | "bear" | "duck" | "maneki" | "daruma" | "cube" | "game" | "goldfish"
  | "photo" | "calendar" | "books" | "hourglass" | "globe" | "lamp" | "panel"
  | "pencup" | "clock" | "speaker" | "terrarium" | "dripper" | "inbox" | "rocket" | "hydrangea" | "orchid" | "croissant"
  | "camera" | "headphones" | "notepad" | "stapler" | "calculator";

/** 見た目。値はエンジンのsprites.jsの選択肢(HAIRS・SKINSなど)と同じ記号(look.test.tsで確かめる)。ot=服の種類 ac=小物 */
/** hc・cl・ptは選択肢の記号か#rrggbb。hair・ot・acは選択肢の記号か"u:<パーツのid>" */
export type VoLook = { hair: string; hc: string; sk: string; cl: string; pt: string; ot: string; ac: string };

export type VoPresenceView = {
  room: string;
  /** 席のない入室(会議室のおまかせ)はnull */
  seatId: string | null;
  /** 手で選んだステータス */
  status: VoStatus;
  /** 自分で押した離席、またはハートビートが15分来ていない */
  away: boolean;
  /** 集中タイマーの終わり(ISO) */
  focusUntil: string | null;
  /** エンジンが読む。カレンダー連携はないので常にfalse(会議室にいる間の「会議中」は部屋の種類でエンジンが決める) */
  inMeeting: boolean;
  /** 作業エリアが満席で、入室のときに作業エリア以外へ自動で座らせた(部屋のステータスを当てない)。自分で移ると外れる */
  overflow: boolean;
  /** ハートビートが2時間来ていない(退出の押し忘れ)。地図に出さない。本人が開けば外れる */
  stale: boolean;
};

export type VoPerson = {
  id: string;
  name: string;
  look: VoLook;
  deco: VoDeco | null;
  pc: VoPc;
  mon: 0 | 1 | 2;
  keyboard: VoKeyboard;
  /** 今日のひとこと(今日書いたものだけ) */
  memo: string;
  /** 在室していなければnull */
  presence: VoPresenceView | null;
};

/** チャットのリアクション。並びは画面に出す順 */
export const VO_REACTIONS = ["good", "heart", "clap", "laugh", "thanks"] as const;
export type VoReactionKind = (typeof VO_REACTIONS)[number];

export type VoMessage = {
  id: string;
  room: string;
  userId: string;
  name: string;
  text: string;
  createdAt: string;
  /** 名指しされたuserId */
  mentions: string[];
  /** 取り消し済み(textは""、mentions・reactionsは空) */
  deleted: boolean;
  /** 付いている種類だけ。VO_REACTIONSの順 */
  reactions: { kind: VoReactionKind; userIds: string[] }[];
};

export type VoEvent = {
  id: number;
  kind: "call" | "wave" | "answer";
  fromUserId: string;
  fromName: string;
  /** answerのとき元のcallのid */
  callId: number | null;
  answer: "go" | "later" | null;
  createdAt: string;
};

export type VoState = {
  serverTime: string;
  /** 設定のタイムゾーンでのYYYY-MM-DD */
  date: string;
  meId: string;
  people: VoPerson[];
  /** 自分の部屋(在室していなければ空)の今日のチャット。古い順、最大50件 */
  messages: VoMessage[];
  /** 自分あての出来事のうち、sinceより後のもの */
  events: VoEvent[];
  /** 受け取った出来事の最大のid(次のsince) */
  lastEventId: number;
  /** 部屋ごとの通話URL(設定のあるものだけ)。名前はエンジンが読むmeetUrlsのまま */
  meetUrls: Record<string, string>;
  /** 自分あての1回きりのお知らせ。その応答にだけ付く(受け取る人の言語) */
  notice?: string;
  /** 今日、終業後に操作がなくて自動で退出した時刻(ISO)。入室し直すとnull。画面はこの値ごとに1回だけお知らせを出す */
  autoLeftAt: string | null;
  /** 直近8秒にどこかの部屋でチャットを書いた在室の人(中身は返さない。ほかの部屋の人の頭上に「…」を出す用) */
  talkingUserIds: string[];
  /** 直近5分に(取り消されていない)発言があった部屋のid。全部屋分で、中身は返さない */
  talkingRooms: string[];
  /** 直近6秒にエモーションを出した在室の人(自分も含む)。atは押した時刻(ISO)。画面はuserIdとatの組ごとに1回だけ動かす */
  emotes: { userId: string; emote: VoEmote; at: string }[];
  /** みんなのパーツが変わるたびに増える番号。変わったらクライアントが GET /api/office/parts を取り直す */
  partsVersion: number;
  /** 自分が管理者(role=admin)か */
  isAdmin: boolean;
  /** いま出す季節の飾りのイベントのid(なしはnull)。設定のseasonModeと日付から決まる */
  season: string | null;
  /** プラグインごとの状態(server.ts の state(ctx) の値)。プラグインが無ければ空 */
  plugins?: Record<string, unknown>;
};

export type VoAction =
  | { type: "enter"; seatId?: string }
  | { type: "leave" }
  | { type: "move"; room: string; seatId: string | null }
  | { type: "away"; away: boolean }
  | { type: "status"; status: VoStatus; focusMinutes?: number }
  | { type: "memo"; text: string }
  | { type: "profile"; look?: VoLook; deco?: VoDeco | null; pc?: VoPc; mon?: 0 | 1 | 2; keyboard?: VoKeyboard }
  /** roomは今いる部屋だけ。省略は今の部屋。mentionsは名指しする相手(同じ部屋にいる人だけ残す) */
  | { type: "chat"; text: string; room?: string; mentions?: string[] }
  /** 押すたびに付ける/外す */
  | { type: "react"; messageId: string; kind: VoReactionKind }
  /** 自分の発言を送ってから60秒以内だけ取り消す */
  | { type: "unchat"; messageId: string }
  | { type: "call"; toUserId: string }
  | { type: "answer"; callId: number; answer: "go" | "later" }
  | { type: "wave"; toUserId: string }
  /** 在室中の人が自分のキャラを数秒動かす(DBには残さない) */
  | { type: "emote"; emote: VoEmote };
