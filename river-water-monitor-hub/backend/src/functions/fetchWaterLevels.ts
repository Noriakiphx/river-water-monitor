// ============================================================
// Base44 Backend Function: fetchWaterLevels
// 推奨スケジュール: 5 分ごと
// 観測所一覧の最新水位を取得し WaterLevelLog に保存する。
// ============================================================

import { createClientFromRequest } from "@base44/sdk";
import {
  makeBase44Repositories,
  type Base44Client,
} from "../adapters/base44Repositories.ts";
import { MockWaterLevelProvider } from "../adapters/mockWaterLevelProvider.ts";
import { fetchWaterLevels } from "../usecases.ts";
import { consoleLogger, systemClock } from "../runtime.ts";

Deno.serve(async (req) => {
  try {
    const b44 = createClientFromRequest(req) as unknown as Base44Client;
    const actor = await b44.auth.me().catch(() => null);
    if (!actor?.id) return Response.json({ ok: false }, { status: 401 });
    if (actor.role !== "admin") return Response.json({ ok: false }, { status: 403 });
    const repos = makeBase44Repositories(b44);

    // 実APIへ切り替えるときは、ここを実プロバイダ（例: MlitWaterLevelProvider）に差し替える。
    const provider = new MockWaterLevelProvider();

    const result = await fetchWaterLevels({
      stations: repos.stations,
      levels: repos.levels,
      provider,
      clock: systemClock,
      logger: consoleLogger,
    });

    return Response.json({ ok: true, result });
  } catch (e) {
    console.error("fetchWaterLevels failed", e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
