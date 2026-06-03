// ============================================================
// MlitWaterLevelProvider / parseMlitResponse の単体テスト
// 実行: deno task test
//  - parseMlitResponse: サンプルレスポンスでの変換（中核）
//  - Provider: 取得失敗のスキップ / 全体失敗で空配列（fetchImpl注入で検証）
// ネットワークには接続しない。
// ============================================================

import { assert, assertEquals } from "jsr:@std/assert";
import { MLIT_SOURCE, parseMlitResponse } from "./parseMlitResponse.ts";
import { MlitWaterLevelProvider } from "./MlitWaterLevelProvider.ts";
import type { Station } from "../../types.ts";
import type { Logger } from "../../ports.ts";

// ---- フィクスチャ ----
function station(over: Partial<Station> = {}): Station {
  return {
    id: "st1",
    riverName: "利根川",
    stationName: "栗橋",
    prefecture: "埼玉県",
    municipality: "久喜市",
    lat: 36.13,
    lng: 139.7,
    observationCode: "1234567890",
    warningLevel: 3.0,
    evacuationLevel: 4.0,
    dangerLevel: 5.0,
    ...over,
  };
}

const silentLogger: Logger = { info() {}, warn() {}, error() {} };

function countingLogger() {
  let warns = 0;
  const logger: Logger = { info() {}, warn() { warns++; }, error() {} };
  return { logger, warnCount: () => warns };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// 想定レスポンス（暫定形）— 時刻はあえて順不同
const SAMPLE = {
  observatory: { code: "1234567890", name: "栗橋" },
  waterLevel: [
    { time: "2026-06-03T08:30:00+09:00", value: "3.10" },
    { time: "2026-06-03T08:50:00+09:00", value: "3.21" },
    { time: "2026-06-03T08:40:00+09:00", value: "3.18" },
  ],
};

// =============== parseMlitResponse ===============

Deno.test("parseMlitResponse: 最新時刻の有効値を採用する", () => {
  const r = parseMlitResponse(SAMPLE, station());
  assert(r !== null);
  assertEquals(r!.waterLevel, 3.21);
  assertEquals(r!.observedAt, new Date("2026-06-03T08:50:00+09:00").toISOString());
});

Deno.test("parseMlitResponse: stationId / observationCode / source を station から付与", () => {
  const r = parseMlitResponse(SAMPLE, station({ id: "stA", observationCode: "9999999999" }));
  assert(r !== null);
  assertEquals(r!.stationId, "stA");
  assertEquals(r!.observationCode, "9999999999"); // レスポンス側のcodeではなくstationの値
  assertEquals(r!.source, MLIT_SOURCE);
});

Deno.test("parseMlitResponse: 最新が欠測なら次の有効値へフォールバック", () => {
  const sample = {
    waterLevel: [
      { time: "2026-06-03T08:50:00+09:00", value: "-" }, // 欠測
      { time: "2026-06-03T08:40:00+09:00", value: "3.18" }, // 有効
      { time: "2026-06-03T08:30:00+09:00", value: "-9999" }, // 番兵
    ],
  };
  const r = parseMlitResponse(sample, station());
  assert(r !== null);
  assertEquals(r!.waterLevel, 3.18);
  assertEquals(r!.observedAt, new Date("2026-06-03T08:40:00+09:00").toISOString());
});

Deno.test("parseMlitResponse: 全て欠測なら null", () => {
  const sample = {
    waterLevel: [
      { time: "2026-06-03T08:50:00+09:00", value: "-" },
      { time: "2026-06-03T08:40:00+09:00", value: null },
    ],
  };
  assertEquals(parseMlitResponse(sample, station()), null);
});

Deno.test("parseMlitResponse: 空配列なら null", () => {
  assertEquals(parseMlitResponse({ waterLevel: [] }, station()), null);
});

Deno.test("parseMlitResponse: 想定外の形なら null", () => {
  assertEquals(parseMlitResponse({}, station()), null);
  assertEquals(parseMlitResponse(null, station()), null);
  assertEquals(parseMlitResponse(42, station()), null);
  assertEquals(parseMlitResponse("oops", station()), null);
});

// =============== MlitWaterLevelProvider ===============

Deno.test("Provider: 全観測所成功で WaterLevelReading[] を返す", async () => {
  const provider = new MlitWaterLevelProvider({
    baseUrl: "https://example.test/api",
    logger: silentLogger,
    fetchImpl: () => Promise.resolve(jsonResponse(SAMPLE)),
  });
  const readings = await provider.fetchLatest([
    station({ id: "st1", observationCode: "A" }),
    station({ id: "st2", observationCode: "B" }),
  ]);
  assertEquals(readings.length, 2);
  assertEquals(readings.every((r) => r.source === MLIT_SOURCE), true);
  assertEquals(new Set(readings.map((r) => r.stationId)), new Set(["st1", "st2"]));
});

Deno.test("Provider: 取得失敗の観測所はスキップし warn を出す", async () => {
  const { logger, warnCount } = countingLogger();
  const provider = new MlitWaterLevelProvider({
    baseUrl: "https://example.test/api",
    logger,
    // "BAD" を含むURL（=観測所コードBAD）だけ失敗させる
    fetchImpl: (input) =>
      String(input).includes("BAD")
        ? Promise.reject(new Error("network error"))
        : Promise.resolve(jsonResponse(SAMPLE)),
  });
  const readings = await provider.fetchLatest([
    station({ id: "ok", observationCode: "OK1" }),
    station({ id: "ng", observationCode: "BAD" }),
  ]);
  assertEquals(readings.length, 1);
  assertEquals(readings[0].stationId, "ok");
  assert(warnCount() >= 1);
});

Deno.test("Provider: 全体失敗でも throw せず空配列を返す", async () => {
  const provider = new MlitWaterLevelProvider({
    baseUrl: "https://example.test/api",
    logger: silentLogger,
    fetchImpl: () => Promise.reject(new Error("network down")),
  });
  const readings = await provider.fetchLatest([
    station({ id: "st1", observationCode: "A" }),
    station({ id: "st2", observationCode: "B" }),
  ]);
  assertEquals(readings, []); // 必ず WaterLevelReading[]（空）
});

Deno.test("Provider: 非2xx応答もスキップ扱い", async () => {
  const provider = new MlitWaterLevelProvider({
    baseUrl: "https://example.test/api",
    logger: silentLogger,
    fetchImpl: () => Promise.resolve(new Response("err", { status: 500 })),
  });
  const readings = await provider.fetchLatest([station({ observationCode: "A" })]);
  assertEquals(readings, []);
});
