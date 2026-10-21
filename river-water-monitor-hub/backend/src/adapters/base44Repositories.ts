// ============================================================
// Base44 リポジトリ実装
// ports.ts のリポジトリインタフェースを Base44 entities で実装する。
// 関数エントリで createClientFromRequest(req) して得たクライアントを渡す。
// バックエンド関数では asServiceRole 経由で管理者権限アクセスする。
//
// クライアントは「使う分だけ」を構造的に型付けしているので、
// テスト時はこの形を満たすフェイクを渡せる。
// ============================================================

import type {
  StationRepository,
  WatchRuleRepository,
  WaterLevelLogRepository,
  NotificationLogRepository,
  UserRepository,
} from "../ports.ts";
import type {
  Station,
  WatchRule,
  WaterLevelLog,
  NotificationLog,
  User,
} from "../types.ts";

// --- Base44 entity API の最小構造型 ---
interface EntityApi<T> {
  list(sort?: string, limit?: number, skip?: number): Promise<T[]>;
  filter(
    query: Record<string, unknown>,
    sort?: string,
    limit?: number,
    skip?: number,
  ): Promise<T[]>;
  get(id: string): Promise<T>;
  create(data: Record<string, unknown>): Promise<T>;
  update(id: string, data: Record<string, unknown>): Promise<T>;
}

interface Entities {
  Station: EntityApi<Station>;
  WatchRule: EntityApi<WatchRule>;
  WaterLevelLog: EntityApi<WaterLevelLog>;
  NotificationLog: EntityApi<NotificationLog>;
  User: EntityApi<User>;
}

export interface Base44Client {
  auth: { me(): Promise<{ id: string; role?: string }> };
  asServiceRole: { entities: Entities };
  entities: Entities;
}

// list() の暫定上限。観測所が増えたらページング対応に変更すること。
const MAX_LIST = 1000;

export interface Base44Repositories {
  stations: StationRepository;
  rules: WatchRuleRepository;
  levels: WaterLevelLogRepository;
  notifications: NotificationLogRepository;
  users: UserRepository;
}

export function makeBase44Repositories(b44: Base44Client): Base44Repositories {
  const e = b44.asServiceRole.entities;
  return {
    stations: makeStationRepository(e),
    rules: makeWatchRuleRepository(e),
    levels: makeWaterLevelLogRepository(e),
    notifications: makeNotificationLogRepository(e),
    users: makeUserRepository(e),
  };
}

async function getOrNull<T>(p: Promise<T>): Promise<T | null> {
  // Base44 の get() は未存在時に例外を投げる想定。null に正規化する。
  try {
    return await p;
  } catch {
    return null;
  }
}

function makeStationRepository(e: Entities): StationRepository {
  return {
    listAll: () => e.Station.list("-created_date", MAX_LIST),
    getById: (id) => getOrNull(e.Station.get(id)),
  };
}

function makeWatchRuleRepository(e: Entities): WatchRuleRepository {
  return {
    listEnabled: () => e.WatchRule.filter({ enabled: true }, "-created_date", MAX_LIST),
    getById: (id) => getOrNull(e.WatchRule.get(id)),
    updateLastNotifiedAt: async (id, at) => {
      await e.WatchRule.update(id, { lastNotifiedAt: at });
    },
  };
}

function makeWaterLevelLogRepository(e: Entities): WaterLevelLogRepository {
  return {
    bulkCreate: async (readings) => {
      // SDK に bulkCreate がある場合は差し替えるとリクエスト数を削減できる。
      await Promise.all(readings.map((r) => e.WaterLevelLog.create({ ...r })));
      return readings.length;
    },
    latestByStation: async (stationIds) => {
      const map = new Map<string, WaterLevelLog>();
      // 観測所ごとに最新1件を取得（観測所数が多い場合は集約クエリへ最適化）。
      const results = await Promise.all(
        stationIds.map((stationId) =>
          e.WaterLevelLog.filter({ stationId }, "-observedAt", 1),
        ),
      );
      results.forEach((rows, i) => {
        if (rows[0]) map.set(stationIds[i], rows[0]);
      });
      return map;
    },
  };
}

function makeNotificationLogRepository(e: Entities): NotificationLogRepository {
  return {
    create: (log) => e.NotificationLog.create({ ...log }),
  };
}

function makeUserRepository(e: Entities): UserRepository {
  return {
    getById: (id) => getOrNull(e.User.get(id)),
    setLineUser: (id, lineUserId) =>
      getOrNull(e.User.update(id, { lineUserId, lineLinked: true })),
  };
}
