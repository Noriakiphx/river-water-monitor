// ============================================================
// ユースケース（オーケストレーション層）
// ポート（リポジトリ/プロバイダ/クライアント）を DI で受け取り、
// 純粋なドメインロジックと I/O を組み合わせる。
// API仕様の 4 関数に対応:
//   fetchWaterLevels / evaluateWatchRules / sendLineNotification / linkLineUser
// ============================================================

import type {
  Clock,
  Logger,
  WaterLevelProvider,
  LineClient,
  StationRepository,
  WatchRuleRepository,
  WaterLevelLogRepository,
  NotificationLogRepository,
  UserRepository,
} from "./ports.ts";
import type { NotificationTarget, WaterLevelLog, User } from "./types.ts";
import { evaluateRules, buildNotificationMessage } from "./domain.ts";

// ------------------------------------------------------------
// 1) fetchWaterLevels
//    観測所一覧を取得 → プロバイダで最新水位を取得 → WaterLevelLog に保存
// ------------------------------------------------------------

export interface FetchWaterLevelsDeps {
  stations: StationRepository;
  levels: WaterLevelLogRepository;
  provider: WaterLevelProvider;
  clock: Clock;
  logger: Logger;
}

export interface FetchWaterLevelsResult {
  stationsQueried: number;
  readingsFetched: number;
  readingsSaved: number;
}

export async function fetchWaterLevels(
  deps: FetchWaterLevelsDeps,
): Promise<FetchWaterLevelsResult> {
  const { stations, levels, provider, logger } = deps;

  const all = await stations.listAll();
  if (all.length === 0) {
    logger.warn("fetchWaterLevels: 観測所が未登録のためスキップ");
    return { stationsQueried: 0, readingsFetched: 0, readingsSaved: 0 };
  }

  let readings;
  try {
    readings = await provider.fetchLatest(all);
  } catch (e) {
    logger.error("fetchWaterLevels: プロバイダ取得に失敗", { error: String(e) });
    throw e; // 取得失敗は呼び出し側(関数エントリ)で 500 にする
  }

  const toSave: Omit<WaterLevelLog, "id">[] = readings.map((r) => ({
    stationId: r.stationId,
    observedAt: r.observedAt,
    waterLevel: r.waterLevel,
    source: r.source,
  }));

  const saved = await levels.bulkCreate(toSave);

  logger.info("fetchWaterLevels: 完了", {
    stations: all.length,
    fetched: readings.length,
    saved,
  });
  return {
    stationsQueried: all.length,
    readingsFetched: readings.length,
    readingsSaved: saved,
  };
}

// ------------------------------------------------------------
// 2) evaluateWatchRules
//    enabled=true のルールを取得 → 最新水位と比較 → 通知対象を返す
//    （送信は sendLineNotification が担当。ここは純粋ロジック evaluateRules を呼ぶだけ）
// ------------------------------------------------------------

export interface EvaluateWatchRulesDeps {
  rules: WatchRuleRepository;
  stations: StationRepository;
  levels: WaterLevelLogRepository;
  clock: Clock;
  logger: Logger;
}

export async function evaluateWatchRules(
  deps: EvaluateWatchRulesDeps,
): Promise<NotificationTarget[]> {
  const { rules, stations, levels, clock, logger } = deps;

  const enabled = await rules.listEnabled();
  if (enabled.length === 0) {
    logger.info("evaluateWatchRules: 有効ルールなし");
    return [];
  }

  const stationIds = [...new Set(enabled.map((r) => r.stationId))];
  const [stationList, latestByStation] = await Promise.all([
    stations.listAll(),
    levels.latestByStation(stationIds),
  ]);
  const stationById = new Map(stationList.map((s) => [s.id, s]));

  const targets = evaluateRules(
    enabled,
    latestByStation,
    stationById,
    clock.now(),
  );

  logger.info("evaluateWatchRules: 評価完了", {
    enabled: enabled.length,
    targets: targets.length,
  });
  return targets;
}

// ------------------------------------------------------------
// 3) sendLineNotification
//    1 件の通知対象に対し LINE Push → NotificationLog に結果保存
//    成功時のみ WatchRule.lastNotifiedAt を更新（クールダウン基準を進める）
// ------------------------------------------------------------

export interface SendLineNotificationDeps {
  line: LineClient;
  users: UserRepository;
  notifications: NotificationLogRepository;
  rules: WatchRuleRepository;
  clock: Clock;
  logger: Logger;
}

export interface SendResult {
  status: "success" | "failed";
  errorMessage: string | null;
}

export async function sendLineNotification(
  target: NotificationTarget,
  deps: SendLineNotificationDeps,
): Promise<SendResult> {
  const { line, users, notifications, rules, clock, logger } = deps;

  const userId = target.rule.userId;
  const sentAt = clock.now().toISOString();
  const message = buildNotificationMessage(target);

  const writeLog = (status: "success" | "failed", errorMessage: string | null) =>
    notifications.create({
      userId,
      stationId: target.station.id,
      watchRuleId: target.rule.id,
      message,
      sentAt,
      status,
      errorMessage,
    });

  // 連携状態の検証
  const user = await users.getById(userId);
  if (!user || !user.lineUserId || !user.lineLinked) {
    const errorMessage = "LINE 未連携のユーザーです";
    await writeLog("failed", errorMessage);
    logger.warn("sendLineNotification: LINE未連携", { userId });
    return { status: "failed", errorMessage };
  }

  // 送信（例外は failed として記録）
  let result;
  try {
    result = await line.pushMessage(user.lineUserId, message);
  } catch (e) {
    const errorMessage = `LINE送信例外: ${String(e)}`;
    await writeLog("failed", errorMessage);
    logger.error("sendLineNotification: 送信例外", { userId, error: String(e) });
    return { status: "failed", errorMessage };
  }

  const status: "success" | "failed" = result.ok ? "success" : "failed";
  await writeLog(status, result.errorMessage);

  if (result.ok) {
    await rules.updateLastNotifiedAt(target.rule.id, sentAt);
  }

  logger.info("sendLineNotification: 結果", {
    userId,
    status,
    httpStatus: result.status,
  });
  return { status, errorMessage: result.errorMessage };
}

// ------------------------------------------------------------
// 4) linkLineUser
//    LINE 連携で取得した lineUserId をアプリ User に紐づける
// ------------------------------------------------------------

export interface LinkLineUserDeps {
  users: UserRepository;
  logger: Logger;
}

export async function linkLineUser(
  userId: string,
  lineUserId: string,
  deps: LinkLineUserDeps,
): Promise<User> {
  const { users, logger } = deps;
  if (!userId || !lineUserId) {
    throw new Error("userId と lineUserId は必須です");
  }
  const updated = await users.setLineUser(userId, lineUserId);
  if (!updated) {
    throw new Error(`ユーザーが見つかりません: ${userId}`);
  }
  logger.info("linkLineUser: 連携完了", { userId });
  return updated;
}
