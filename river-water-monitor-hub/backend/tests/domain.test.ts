// ============================================================
// ドメイン純粋関数の単体テスト
// 実行: deno task test  （または deno test）
// I/O が無いので外部依存なしで完結する。
// ============================================================

import { assert, assertEquals } from "jsr:@std/assert";
import {
  buildNotificationMessage,
  evaluateRules,
  isInCooldown,
  isThresholdExceeded,
  nextAllowedAt,
  resolveThreshold,
  thresholdLabel,
} from "../src/domain.ts";
import type { Station, WatchRule, WaterLevelLog } from "../src/types.ts";

// ---- フィクスチャ ----
const NOW = new Date("2026-06-03T09:00:00Z");

function station(over: Partial<Station> = {}): Station {
  return {
    id: "st1",
    riverName: "利根川",
    stationName: "栗橋",
    prefecture: "埼玉県",
    municipality: "久喜市",
    lat: 36.13,
    lng: 139.7,
    observationCode: "0001",
    warningLevel: 3.0,
    evacuationLevel: 4.0,
    dangerLevel: 5.0,
    ...over,
  };
}

function rule(over: Partial<WatchRule> = {}): WatchRule {
  return {
    id: "r1",
    userId: "u1",
    stationId: "st1",
    thresholdType: "warning",
    thresholdValue: 2.5,
    enabled: true,
    cooldownMinutes: 30,
    lastNotifiedAt: null,
    ...over,
  };
}

function log(over: Partial<WaterLevelLog> = {}): WaterLevelLog {
  return {
    id: "l1",
    stationId: "st1",
    observedAt: "2026-06-03T08:55:00Z",
    waterLevel: 3.2,
    source: "mock",
    ...over,
  };
}

// ---- thresholdLabel ----
Deno.test("thresholdLabel: 種別ごとの日本語ラベル", () => {
  assertEquals(thresholdLabel("warning"), "氾濫注意水位");
  assertEquals(thresholdLabel("evacuation"), "避難判断水位");
  assertEquals(thresholdLabel("danger"), "氾濫危険水位");
  assertEquals(thresholdLabel("custom"), "任意水位");
});

// ---- resolveThreshold ----
Deno.test("resolveThreshold: custom はルール値を使う", () => {
  assertEquals(resolveThreshold(rule({ thresholdType: "custom", thresholdValue: 1.8 }), station()), 1.8);
});

Deno.test("resolveThreshold: 公式種別は観測所の値を優先", () => {
  assertEquals(resolveThreshold(rule({ thresholdType: "warning" }), station()), 3.0);
  assertEquals(resolveThreshold(rule({ thresholdType: "evacuation" }), station()), 4.0);
  assertEquals(resolveThreshold(rule({ thresholdType: "danger" }), station()), 5.0);
});

Deno.test("resolveThreshold: 公式値が null なら thresholdValue にフォールバック", () => {
  assertEquals(
    resolveThreshold(rule({ thresholdType: "warning", thresholdValue: 2.5 }), station({ warningLevel: null })),
    2.5,
  );
});

Deno.test("resolveThreshold: 決定不能なら null", () => {
  assertEquals(
    resolveThreshold(rule({ thresholdType: "warning", thresholdValue: NaN }), station({ warningLevel: null })),
    null,
  );
  assertEquals(resolveThreshold(rule({ thresholdType: "custom", thresholdValue: NaN }), station()), null);
});

// ---- isThresholdExceeded ----
Deno.test("isThresholdExceeded: 到達(=)も超過とみなす", () => {
  assert(isThresholdExceeded(3.0, 3.0));
  assert(isThresholdExceeded(3.1, 3.0));
  assert(!isThresholdExceeded(2.99, 3.0));
});

// ---- isInCooldown ----
Deno.test("isInCooldown: 初回(null)は送信可", () => {
  assert(!isInCooldown(null, NOW, 30));
});

Deno.test("isInCooldown: 経過 < cooldown は抑制", () => {
  const tenMinAgo = new Date(NOW.getTime() - 10 * 60_000).toISOString();
  assert(isInCooldown(tenMinAgo, NOW, 30));
});

Deno.test("isInCooldown: 経過 >= cooldown は送信可", () => {
  const fortyMinAgo = new Date(NOW.getTime() - 40 * 60_000).toISOString();
  assert(!isInCooldown(fortyMinAgo, NOW, 30));
});

Deno.test("isInCooldown: cooldown 0 は抑制なし", () => {
  const oneMinAgo = new Date(NOW.getTime() - 60_000).toISOString();
  assert(!isInCooldown(oneMinAgo, NOW, 0));
});

Deno.test("nextAllowedAt: 直近通知 + cooldown 分", () => {
  const at = "2026-06-03T08:30:00Z";
  assertEquals(nextAllowedAt(at, 30).toISOString(), "2026-06-03T09:00:00.000Z");
});

// ---- evaluateRules ----
const stationMap = new Map([["st1", station()]]);

Deno.test("evaluateRules: 超過かつクールダウン外なら対象", () => {
  const levels = new Map([["st1", log({ waterLevel: 3.2 })]]);
  const targets = evaluateRules([rule()], levels, stationMap, NOW);
  assertEquals(targets.length, 1);
  assertEquals(targets[0].threshold, 3.0);
  assertEquals(targets[0].waterLevel, 3.2);
});

Deno.test("evaluateRules: enabled=false は除外", () => {
  const levels = new Map([["st1", log({ waterLevel: 3.2 })]]);
  assertEquals(evaluateRules([rule({ enabled: false })], levels, stationMap, NOW).length, 0);
});

Deno.test("evaluateRules: 未超過は除外", () => {
  const levels = new Map([["st1", log({ waterLevel: 2.5 })]]);
  assertEquals(evaluateRules([rule()], levels, stationMap, NOW).length, 0);
});

Deno.test("evaluateRules: 最新水位が無い観測所は除外", () => {
  assertEquals(evaluateRules([rule()], new Map(), stationMap, NOW).length, 0);
});

Deno.test("evaluateRules: 観測所マスタに無いルールは除外", () => {
  const levels = new Map([["st1", log({ waterLevel: 3.2 })]]);
  assertEquals(evaluateRules([rule({ stationId: "ghost" })], levels, stationMap, NOW).length, 0);
});

Deno.test("evaluateRules: クールダウン中は除外", () => {
  const levels = new Map([["st1", log({ waterLevel: 3.2 })]]);
  const tenMinAgo = new Date(NOW.getTime() - 10 * 60_000).toISOString();
  assertEquals(evaluateRules([rule({ lastNotifiedAt: tenMinAgo })], levels, stationMap, NOW).length, 0);
});

// ---- buildNotificationMessage ----
Deno.test("buildNotificationMessage: 主要情報を含む", () => {
  const target = {
    rule: rule(),
    station: station(),
    waterLevel: 3.25,
    threshold: 3.0,
    thresholdType: "warning" as const,
    observedAt: "2026-06-03T08:55:00Z",
  };
  const msg = buildNotificationMessage(target);
  assert(msg.includes("利根川"));
  assert(msg.includes("栗橋"));
  assert(msg.includes("3.25 m"));
  assert(msg.includes("氾濫注意水位"));
  assert(msg.includes("3.00 m"));
});
