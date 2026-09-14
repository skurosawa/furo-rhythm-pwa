// src/domain/point.ts

/**
 * ポイントの最大値
 *
 * 1時間 = 1pt
 * 最大72時間まで加算する。
 *
 * Swift移植時もこの値をそのまま仕様として使用できる。
 */
export const MAX_POINT = 72

/**
 * 経過時間からポイントを計算する。
 *
 * 1時間で +1pt。
 * 最大 MAX_POINT まで。
 *
 * @param nowMs 現在時刻(ms)
 * @param lastResetAt 最後に🛁した時刻(ms)
 * @param max 最大ポイント（時間）
 */
export function calcPoint(
  nowMs: number,
  lastResetAt: number,
  max: number = MAX_POINT,
): number {
  // 時刻が逆転してもマイナスにはしない
  const diff = Math.max(0, nowMs - lastResetAt)

  // ミリ秒 → 時間
  const hours = diff / (60 * 60 * 1000)

  // 最大値を超えないようにする
  return Math.min(max, hours)
}