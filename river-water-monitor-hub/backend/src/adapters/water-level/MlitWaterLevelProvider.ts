// ============================================================
// 国交省 河川水位API プロバイダ（本番実装）
// WaterLevelProvider を実装。Station.observationCode で観測所ごとに最新水位を取得。
//
// 設計方針:
//  - API仕様が未確定なので「HTTP取得部分」を独立関数 fetchStationRaw に分離。
//    実APIが確定したら buildStationUrl / fetchStationRaw だけ直せばよい。
//  - レスポンス変換は parseMlitResponse（純粋関数）に委譲。
//  - 取得失敗した観測所は logger.warn を出してスキップ。
//  - 全体失敗でも throw せず空配列を返す（fetchLatest は常に WaterLevelReading[]）。
// ============================================================

import type { Logger, WaterLevelProvider } from "../../ports.ts";
import type { Station, WaterLevelReading } from "../../types.ts";
import { parseMlitResponse } from "./parseMlitResponse.ts";

export interface MlitProviderConfig {
  /** 観測所コードから最新水位を引くエンドポイントのベースURL（実APIに合わせる） */
  baseUrl: string;
  logger: Logger;
  /** テスト/DI用。未指定ならグローバル fetch を使用 */
  fetchImpl?: typeof fetch;
  /** 1リクエストのタイムアウト(ms) */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;

export interface FetchRawConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * 【HTTP取得部分・独立関数】
 * 観測所コードから最新水位の生レスポンス(JSON)を取得する。
 * 実APIの仕様が確定したら、URL組み立て・クエリ・ヘッダ・認証はここだけ直す。
 * 失敗時(タイムアウト/非2xx/ネットワーク)は例外を投げる（呼び出し側でスキップ判定）。
 */
export async function fetchStationRaw(
  observationCode: string,
  config: FetchRawConfig,
): Promise<unknown> {
  const fetchFn = config.fetchImpl ?? fetch;
  const url = buildStationUrl(config.baseUrl, observationCode);

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const res = await fetchFn(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 観測所コードからリクエストURLを組み立てる（暫定）。
 * 実APIのパス/クエリ仕様に合わせて変更する。
 */
export function buildStationUrl(baseUrl: string, observationCode: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/observatory/${encodeURIComponent(observationCode)}/water-level/latest`;
}

export class MlitWaterLevelProvider implements WaterLevelProvider {
  constructor(private readonly config: MlitProviderConfig) {}

  async fetchLatest(stations: Station[]): Promise<WaterLevelReading[]> {
    const { logger } = this.config;
    try {
      const results = await Promise.all(
        stations.map((station) => this.fetchOne(station)),
      );
      // スキップ(null)を除外。戻り値は必ず WaterLevelReading[]。
      return results.filter((r): r is WaterLevelReading => r !== null);
    } catch (e) {
      // fetchOne 内で個別に握っているので通常ここには来ないが、
      // 想定外の全体失敗でも throw せず空配列を返す（要件）。
      logger.error("MlitWaterLevelProvider: 全体取得に失敗", { error: String(e) });
      return [];
    }
  }

  /** 観測所1件の取得+変換。失敗・無効データは warn を出してスキップ(null)。 */
  private async fetchOne(station: Station): Promise<WaterLevelReading | null> {
    const { logger, baseUrl, fetchImpl, timeoutMs } = this.config;
    try {
      const raw = await fetchStationRaw(station.observationCode, {
        baseUrl,
        fetchImpl,
        timeoutMs,
      });
      const reading = parseMlitResponse(raw, station);
      if (!reading) {
        logger.warn("MlitWaterLevelProvider: 有効な水位データなし、スキップ", {
          stationId: station.id,
          observationCode: station.observationCode,
        });
        return null;
      }
      return reading;
    } catch (e) {
      logger.warn("MlitWaterLevelProvider: 観測所の取得に失敗、スキップ", {
        stationId: station.id,
        observationCode: station.observationCode,
        error: String(e),
      });
      return null;
    }
  }
}
