// ============================================================
// ドメインロジック（純粋関数のみ）
// ここには I/O・時刻取得・乱数などの副作用を一切置かない。
// 入力 -> 出力が決定的なので、そのまま単体テストできる。
// 通知判定の中核（しきい値・到達・クールダウン）はすべてここ。
// ============================================================

import type {
  Station,
  WatchRule,
  ThresholdType,
  WaterLevelLog,
  NotificationTarget,
} from "./types.ts";

const THRESHOLD_LABELS: Record<ThresholdType, string> = {
  warning: "氾濫注意水位",
  evacuation: "避難判断水位",
  danger: "氾濫危険水位",
  custom: "任意水位",
};

export function thresholdLabel(type: ThresholdType): string {
  return THRESHOLD_LABELS[type];
}

/**
 * ルール種別と観測所の公式水位から、有効しきい値 (m) を決定する。
 *  - custom               : ルールの thresholdValue を使用
 *  - warning/evacuation/danger
 *      観測所の公式値を優先し、未設定(null)なら thresholdValue にフォールバック
 *  - いずれも得られない場合は null（＝判定不能としてスキップ）
 */
export function resolveThreshold(
  rule: WatchRule,
  station: Station,
): number | null {
  switch (rule.thresholdType) {
    case "custom":
      return finite(rule.thresholdValue);
    case "warning":
      return firstFinite(station.warningLevel, rule.thresholdValue);
    case "evacuation":
      return firstFinite(station.evacuationLevel, rule.thresholdValue);
    case "danger":
      return firstFinite(station.dangerLevel, rule.thresholdValue);
    default:
      return null;
  }
}

function finite(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function firstFinite(...vals: (number | null | undefined)[]): number | null {
  for (const v of vals) {
    const f = finite(v);
    if (f !== null) return f;
  }
  return null;
}

/**
 * 水位がしきい値に到達/超過したか。
 * 「条件到達時に通知」なので等号を含む（>=）。
 */
export function isThresholdExceeded(
  waterLevel: number,
  threshold: number,
): boolean {
  return waterLevel >= threshold;
}

/**
 * クールダウン中か判定する（連続通知の抑制）。
 *  - lastNotifiedAt が null      : 初回なので false（送信可）
 *  - cooldownMinutes <= 0        : 抑制なし
 *  - 経過時間 < cooldown 分        : true（抑制）
 */
export function isInCooldown(
  lastNotifiedAt: string | null,
  now: Date,
  cooldownMinutes: number,
): boolean {
  if (!lastNotifiedAt) return false;
  if (cooldownMinutes <= 0) return false;
  const last = new Date(lastNotifiedAt).getTime();
  if (Number.isNaN(last)) return false; // 不正な日時は抑制しない
  const elapsedMs = now.getTime() - last;
  return elapsedMs < cooldownMinutes * 60_000;
}

/** 次に通知可能になる時刻 */
export function nextAllowedAt(
  lastNotifiedAt: string,
  cooldownMinutes: number,
): Date {
  return new Date(
    new Date(lastNotifiedAt).getTime() + cooldownMinutes * 60_000,
  );
}

/**
 * 有効ルール群を評価し、通知すべき対象だけを返す純粋関数。
 * 最新水位・観測所マスタは外部で取得して引数で渡す（I/O はここに持ち込まない）。
 */
export function evaluateRules(
  rules: WatchRule[],
  latestByStation: Map<string, WaterLevelLog>,
  stationById: Map<string, Station>,
  now: Date,
): NotificationTarget[] {
  const targets: NotificationTarget[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const station = stationById.get(rule.stationId);
    if (!station) continue; // 観測所が見つからない

    const latest = latestByStation.get(rule.stationId);
    if (!latest) continue; // 最新水位がまだ無い

    const threshold = resolveThreshold(rule, station);
    if (threshold === null) continue; // しきい値を決定できない

    if (!isThresholdExceeded(latest.waterLevel, threshold)) continue;
    if (isInCooldown(rule.lastNotifiedAt, now, rule.cooldownMinutes)) continue;

    targets.push({
      rule,
      station,
      waterLevel: latest.waterLevel,
      threshold,
      thresholdType: rule.thresholdType,
      observedAt: latest.observedAt,
    });
  }

  return targets;
}

/** LINE 通知本文を生成する純粋関数。 */
export function buildNotificationMessage(target: NotificationTarget): string {
  const { station, waterLevel, threshold, thresholdType, observedAt } = target;
  const label = thresholdLabel(thresholdType);
  return [
    "⚠️ 河川水位アラート",
    `${station.riverName} ${station.stationName}`,
    `${station.prefecture}${station.municipality}`,
    "",
    `現在水位：${waterLevel.toFixed(2)} m`,
    `${label}：${threshold.toFixed(2)} m に到達/超過`,
    `観測時刻：${formatJst(observedAt)}`,
  ].join("\n");
}

/** ISO 文字列を日本時間 (JST) の読みやすい表記へ変換する。 */
export function formatJst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
