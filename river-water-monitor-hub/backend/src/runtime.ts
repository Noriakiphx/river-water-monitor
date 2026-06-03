// ============================================================
// ランタイム実装（Clock / Logger）
// 関数エントリで使う既定の Clock・Logger。
// テストではこれらを使わず、固定 Clock やスパイ Logger を注入する。
// ============================================================

import type { Clock, Logger } from "./ports.ts";

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Base44 のログに乗る JSON 構造化ログ */
export const consoleLogger: Logger = {
  info: (msg, meta) =>
    console.log(JSON.stringify({ level: "info", msg, ...meta })),
  warn: (msg, meta) =>
    console.warn(JSON.stringify({ level: "warn", msg, ...meta })),
  error: (msg, meta) =>
    console.error(JSON.stringify({ level: "error", msg, ...meta })),
};
