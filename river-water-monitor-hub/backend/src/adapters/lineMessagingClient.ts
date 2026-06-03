// ============================================================
// LINE Messaging API クライアント（Push 送信）
// アクセストークンは環境変数 LINE_CHANNEL_ACCESS_TOKEN から取得し、
// コードには直書きしない（非機能要件）。
// ============================================================

import type { LineClient, LinePushResult } from "../ports.ts";

const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";

export class LineMessagingClient implements LineClient {
  constructor(private readonly accessToken: string) {
    if (!accessToken) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定です");
    }
  }

  /** Base44 のシークレットに設定した環境変数から生成する */
  static fromEnv(): LineMessagingClient {
    const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
    return new LineMessagingClient(token);
  }

  async pushMessage(lineUserId: string, text: string): Promise<LinePushResult> {
    try {
      const res = await fetch(LINE_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [{ type: "text", text }],
        }),
      });

      if (res.ok) {
        return { ok: true, status: res.status, errorMessage: null };
      }

      const body = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        errorMessage: `LINE API error ${res.status}: ${body}`.slice(0, 500),
      };
    } catch (e) {
      return { ok: false, status: 0, errorMessage: `fetch失敗: ${String(e)}` };
    }
  }
}
