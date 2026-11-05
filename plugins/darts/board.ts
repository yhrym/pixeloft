/** ダーツの的(ソフトダーツの寸法・mm)。サーバーの判定と画面の両方で読むので、node:の物は読まない */

/** 矢の当たり。x・yは的の中心からのmm(右が+x・下が+y)。labelは "S20"・"D20"・"T20"・"BULL"・"MISS" */
export type DartHit = { x: number; y: number; score: number; label: string };

/** 真上から時計回りの数字 */
export const DART_SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;
/** 中心からの半径。bull以内は50点(インナー・アウターとも)。tripleIn〜tripleOutは3倍、doubleIn〜doubleOutは2倍、doubleOutより外はMISS */
export const DART_RINGS = { bull: 16, tripleIn: 99, tripleOut: 107, doubleIn: 162, doubleOut: 170 } as const;
/** 照準として受け付ける範囲(±mm) */
export const DART_AIM_LIMIT = 250;
/** 1ターンの持ち時間。過ぎるとサーバーが残りの矢をMISSにして次の人へ */
export const DART_TURN_MS = 45_000;

/** x・yは中心からのmm(右が+x・下が+y) */
export function scoreAt(x: number, y: number): DartHit {
  const r = Math.hypot(x, y);
  if (r <= DART_RINGS.bull) return { x, y, score: 50, label: "BULL" };
  if (r > DART_RINGS.doubleOut) return { x, y, score: 0, label: "MISS" };
  // 真上を0度に時計回り。1区画18度で、20の区画は-9〜9度
  const deg = (Math.atan2(x, -y) * 180) / Math.PI;
  const n = DART_SECTORS[Math.floor(((((deg + 9) % 360) + 360) % 360) / 18)];
  const [mult, mark] = r >= DART_RINGS.tripleIn && r <= DART_RINGS.tripleOut ? [3, "T"] : r >= DART_RINGS.doubleIn ? [2, "D"] : [1, "S"];
  return { x, y, score: n * mult, label: `${mark}${n}` };
}
