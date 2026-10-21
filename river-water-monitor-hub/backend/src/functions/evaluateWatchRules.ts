// ============================================================
// Base44 Backend Function: evaluateWatchRules
// 推奨スケジュール: 5 分ごと
// 有効ルールを評価して通知対象を抽出し、対象ごとに LINE 送信する。
// （評価=純粋ロジック / 送信=sendLineNotification ユースケースを合成）
// ============================================================

import { createClientFromRequest } from "@base44/sdk";
import {
  makeBase44Repositories,
  type Base44Client,
} from "../adapters/base44Repositories.ts";
import { LineMessagingClient } from "../adapters/lineMessagingClient.ts";
import { evaluateWatchRules, sendLineNotification } from "../usecases.ts";
import { consoleLogger, systemClock } from "../runtime.ts";

Deno.serve(async (req) => {
  try {
    const b44 = createClientFromRequest(req) as unknown as Base44Client;
    const actor = await b44.auth.me().catch(() => null);
    if (!actor?.id) return Response.json({ ok: false }, { status: 401 });
    if (actor.role !== "admin") return Response.json({ ok: false }, { status: 403 });
    const repos = makeBase44Repositories(b44);
    const line = LineMessagingClient.fromEnv();

    const targets = await evaluateWatchRules({
      rules: repos.rules,
      stations: repos.stations,
      levels: repos.levels,
      clock: systemClock,
      logger: consoleLogger,
    });

    const sent: Array<{ ruleId: string; status: string; errorMessage: string | null }> = [];
    for (const target of targets) {
      const r = await sendLineNotification(target, {
        line,
        users: repos.users,
        notifications: repos.notifications,
        rules: repos.rules,
        clock: systemClock,
        logger: consoleLogger,
      });
      sent.push({ ruleId: target.rule.id, ...r });
    }

    return Response.json({ ok: true, evaluated: targets.length, sent });
  } catch (e) {
    console.error("evaluateWatchRules failed", e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
