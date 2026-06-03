// ============================================================
// 国交省 河川水位API レスポンス変換（純粋関数）
// API仕様が未確定のため、レスポンス形は「暫定」。
// 実APIが確定したら、下記の型 (MlitRawResponse) と
// getSeries()/欠測判定 の部分だけ差し替えればよい設計。
//
// I/O は持たない。サンプルレスポンスで単体テスト可能。
// ============================================================

import type { Station, WaterLevelReading } from "../../types.ts";

/** WaterLevelReading.source に入れる識別子 */
export const MLIT_SOURCE = "mlit";

// 欠測・無効を表す文字列トークン（実APIで確認のうえ調整する）
const MISSING_TOKENS = new Set(["-", "ー", "*", "**", "//", "欠測", "閉局", "M"]);
// 欠測を表す番兵値（実APIで確認のうえ調整する）
const MISSING_NUMBERS = new Set([-9999, 9999]);

// ---- 想定レスポンス形（暫定） --------------------------------
interface MlitTimePoint {
  time?: string;
  value?: string | number | null;
}
interface MlitRawResponse {
  observatory?: { code?: string; name?: string };
  /** 水位の時系列（暫定キー名。実APIに合わせて getSeries を直す） */
  waterLevel?: MlitTimePoint[];
}
// -------------------------------------------------------------

/**
 * レスポンスを 1 件の WaterLevelReading に変換する。
 *  - 時系列から「有効値を持つ最新の観測点」を採用
 *  - 欠測/無効値はスキップ
 *  - 有効データが無い／形が想定外なら null
 *
 * observationCode・stationId は引数の station から付与する
 * （レスポンス側の code は照合用途。reading には station の値を使う）。
 */
export function parseMlitResponse(
  raw: unknown,
  station: Station,
): WaterLevelReading | null {
  const series = getSeries(raw);
  if (series.length === 0) return null;

  // 有効値だけに正規化 → 時刻降順 → 先頭(=最新)を採用
  const valid = series
    .map((p) => ({ time: toIso(p.time), value: toNumber(p.value) }))
    .filter(
      (p): p is { time: string; value: number } =>
        p.time !== null && p.value !== null,
    )
    .sort((a, b) => b.time.localeCompare(a.time)); // ISO(UTC)なので辞書順=時刻順

  const latest = valid[0];
  if (!latest) return null;

  return {
    stationId: station.id,
    observationCode: station.observationCode,
    observedAt: latest.time,
    waterLevel: latest.value,
    source: MLIT_SOURCE,
  };
}

/** レスポンスから時系列配列を取り出す（想定外なら空配列）。 */
function getSeries(raw: unknown): MlitTimePoint[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as MlitRawResponse;
  return Array.isArray(r.waterLevel) ? r.waterLevel : [];
}

/** 値を数値へ。欠測トークン/番兵値/非数値は null。 */
function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    return Number.isFinite(v) && !MISSING_NUMBERS.has(v) ? v : null;
  }
  const s = v.trim();
  if (s === "" || MISSING_TOKENS.has(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || MISSING_NUMBERS.has(n)) return null;
  return n;
}

/** 時刻文字列を ISO(UTC) へ正規化。不正なら null。 */
function toIso(t: string | undefined): string | null {
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
