// ============================================================
// ポート定義（依存の境界）
// ユースケースはこれらのインタフェースにのみ依存する。
// 実装（Base44 / LINE / mock）は adapters 配下で差し替え可能。
// → テスト時はインメモリのフェイクを注入できる。
// ============================================================

import type {
  Station,
  WatchRule,
  WaterLevelLog,
  NotificationLog,
  User,
  WaterLevelReading,
} from "./types.ts";

/** 時刻を注入可能にする（テストで固定時刻を渡せる） */
export interface Clock {
  now(): Date;
}

/** 構造化ログ出力の抽象 */
export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/** 河川水位データソース。mock / 実API を差し替える。 */
export interface WaterLevelProvider {
  /** 観測所一覧を受け取り、各観測所の最新水位を返す */
  fetchLatest(stations: Station[]): Promise<WaterLevelReading[]>;
}

/** LINE Push の結果 */
export interface LinePushResult {
  ok: boolean;
  status: number;
  errorMessage: string | null;
}

/** LINE 通知クライアントの抽象 */
export interface LineClient {
  pushMessage(lineUserId: string, text: string): Promise<LinePushResult>;
}

// ------------------------------------------------------------
// リポジトリ（Base44 entities へのアクセスを抽象化）
// ------------------------------------------------------------

export interface StationRepository {
  listAll(): Promise<Station[]>;
  getById(id: string): Promise<Station | null>;
}

export interface WatchRuleRepository {
  /** enabled=true のルールを全件取得 */
  listEnabled(): Promise<WatchRule[]>;
  getById(id: string): Promise<WatchRule | null>;
  /** 通知成功時にクールダウン基準時刻を更新 */
  updateLastNotifiedAt(id: string, at: string): Promise<void>;
}

export interface WaterLevelLogRepository {
  /** 複数の観測値をまとめて保存し、保存件数を返す */
  bulkCreate(readings: Omit<WaterLevelLog, "id">[]): Promise<number>;
  /** 指定観測所群の「最新1件」を stationId -> ログ で返す */
  latestByStation(stationIds: string[]): Promise<Map<string, WaterLevelLog>>;
}

export interface NotificationLogRepository {
  create(log: Omit<NotificationLog, "id">): Promise<NotificationLog>;
}

export interface UserRepository {
  getById(id: string): Promise<User | null>;
  /** LINE 連携: lineUserId を保存し lineLinked=true にする */
  setLineUser(id: string, lineUserId: string): Promise<User | null>;
}
