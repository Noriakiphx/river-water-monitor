// ============================================================
// Base44 Backend Function: sendLineNotification
// API仕様の引数 (userId, stationId, watchRuleId, waterLevel) を受け取り、
// 1 件の通知を送信する。手動・テスト送信用のエンドポイント。
// （定期通知は evaluateWatchRules 側が評価結果をもとに自動送信する）
//
// フロントからの呼び出し例:
//   base44.functions.invoke("sendLineNotification", {
//     userId, stationId, watchRuleId, waterLevel
//   })
// ============================================================

import { createClientFromRequest } from "npm:@base44/sdk";
import {
  makeBase44Repositories,
  type Base44Client,
} from "../adapters/base44Repositories.ts";
import { LineMessagingClient } from "../adapters/lineMessagingClient.ts";
import { sendLineNotification } from "../usecases.ts";
import { resolveThreshold } from "../domain.ts";
import { consoleLogger, systemClock } from "../runtime.ts";
import type { NotificationTarget } from "../types.ts";

interface Payload {
  userId: string;
  stationId: string;
  watchRuleId: string;
  waterLevel: number;
}

Deno.serve(async (req) => {
  try {
    const body = (await req.json()) as Partial<Payload>;
    const { userId, stationId, watchRuleId, waterLevel } = body;

    if (!userId || !stationId || !watchRuleId || typeof waterLevel !== "number") {
      return Response.json(
        { ok: false, error: "userId, stationId, watchRuleId, waterLevel は必須です" },
        { status: 400 },
      );
    }

    const b44 = createClientFromRequest(req) as unknown as Base44Client;
    const repos = makeBase44Repositories(b44);

    const [rule, station] = await Promise.all([
      repos.rules.getById(watchRuleId),
      repos.stations.getById(stationId),
    ]);
    if (!rule) return Response.json({ ok: false, error: "WatchRule が見つかりません" }, { status: 404 });
    if (!station) return Response.json({ ok: false, error: "Station が見つかりません" }, { status: 404 });

    const threshold = resolveThreshold(rule, station);
    if (threshold === null) {
      return Response.json({ ok: false, error: "しきい値を決定できません" }, { status: 400 });
    }

    const target: NotificationTarget = {
      rule,
      station,
      waterLevel,
      threshold,
      thresholdType: rule.thresholdType,
      observedAt: systemClock.now().toISOString(),
    };

    const line = LineMessagingClient.fromEnv();
    const result = await sendLineNotification(target, {
      line,
      users: repos.users,
      notifications: repos.notifications,
      rules: repos.rules,
      clock: systemClock,
      logger: consoleLogger,
    });

    return Response.json({ ok: result.status === "success", result });
  } catch (e) {
    console.error("sendLineNotification failed", e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
