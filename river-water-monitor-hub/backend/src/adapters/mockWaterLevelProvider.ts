// ============================================================
// Mock 水位プロバイダ（動作確認用）
// 要件「最初はダミー水位データで動作確認できること」に対応。
// spikeStationIds に入れた観測所だけ危険水位超えの値を返すので、
// 通知フローのE2E確認に使える。
// ============================================================

import type { WaterLevelProvider } from "../ports.ts";
import type { Station, WaterLevelReading } from "../types.ts";

export interface MockOptions {
  /** この観測所群は「危険水位超え」の値を返す（通知発火テスト用） */
  spikeStationIds?: string[];
}

export class MockWaterLevelProvider implements WaterLevelProvider {
  constructor(private readonly opts: MockOptions = {}) {}

  fetchLatest(stations: Station[]): Promise<WaterLevelReading[]> {
    const now = new Date().toISOString();
    const spikes = new Set(this.opts.spikeStationIds ?? []);

    const readings = stations.map((s): WaterLevelReading => {
      const base = s.warningLevel ?? 2.0;
      const level = spikes.has(s.id)
        // 危険水位を確実に超える値
        ? (s.dangerLevel ?? base + 1.5) + 0.3
        // 通常時: 注意水位より少し低い範囲でゆらぐ
        : Math.max(0, base - 0.6 + jitter(s.id) * 0.4);

      return {
        stationId: s.id,
        observationCode: s.observationCode,
        observedAt: now,
        waterLevel: round2(level),
        source: "mock",
      };
    });

    return Promise.resolve(readings);
  }
}

/** 観測所IDと分単位の時刻から決まる疑似乱数 [0,1)（サイクルごとに微変動） */
function jitter(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  h = (h + Math.floor(Date.now() / 60_000)) >>> 0;
  return (h % 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
