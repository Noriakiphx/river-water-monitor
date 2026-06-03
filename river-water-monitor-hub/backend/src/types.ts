// ============================================================
// ドメイン型定義
// data_model.md に対応するエンティティ型と列挙型を定義する。
// 日付は ISO8601 文字列（Base44 上では string）として扱う。
// ============================================================

export type Role = "user" | "admin";
export type ThresholdType = "warning" | "evacuation" | "danger" | "custom";
export type NotificationStatus = "success" | "failed";

export interface User {
  id: string;
  name: string;
  email: string;
  lineUserId: string | null;
  lineLinked: boolean;
  role: Role;
  createdAt: string;
}

export interface Station {
  id: string;
  riverName: string;
  stationName: string;
  prefecture: string;
  municipality: string;
  lat: number;
  lng: number;
  observationCode: string;
  /** 氾濫注意水位 (m) */
  warningLevel: number | null;
  /** 避難判断水位 (m) */
  evacuationLevel: number | null;
  /** 氾濫危険水位 (m) */
  dangerLevel: number | null;
}

export interface WatchRule {
  id: string;
  userId: string;
  stationId: string;
  thresholdType: ThresholdType;
  /** custom 種別、または公式水位が未設定の観測所のフォールバック値 (m) */
  thresholdValue: number;
  enabled: boolean;
  cooldownMinutes: number;
  lastNotifiedAt: string | null;
}

export interface WaterLevelLog {
  id: string;
  stationId: string;
  observedAt: string;
  waterLevel: number;
  source: string;
}

export interface NotificationLog {
  id: string;
  userId: string;
  stationId: string;
  watchRuleId: string;
  message: string;
  sentAt: string;
  status: NotificationStatus;
  errorMessage: string | null;
}

// ------------------------------------------------------------
// 補助型（永続化前 / 評価結果）
// ------------------------------------------------------------

/** プロバイダから取得した、保存前の水位観測値 */
export interface WaterLevelReading {
  stationId: string;
  observationCode: string;
  observedAt: string;
  waterLevel: number;
  source: string;
}

/** ルール評価の結果、通知すべきと判定された対象 */
export interface NotificationTarget {
  rule: WatchRule;
  station: Station;
  waterLevel: number;
  threshold: number;
  thresholdType: ThresholdType;
  observedAt: string;
}
