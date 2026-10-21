# 河川水位監視・LINE通知 バックエンド

Base44 アプリ（フロント）に接続するバックエンド関数群。TypeScript / Deno。
通知判定の中核を**純粋関数**に切り出し、I/O（Base44・LINE・水位API）は**ポートとアダプタ**で差し替え可能にしている。

## 構成

```
src/
  types.ts                      ドメイン型・列挙型
  ports.ts                      依存の境界（インタフェース）
  domain.ts                     純粋ロジック（しきい値・到達・クールダウン・評価・本文生成）★テスト対象
  usecases.ts                   4関数の本体（DIで合成）
  runtime.ts                    既定の Clock / Logger
  adapters/
    mockWaterLevelProvider.ts   ダミー水位（動作確認用）
    lineMessagingClient.ts      LINE Push（トークンは環境変数）
    base44Repositories.ts       Base44 entities でのデータアクセス
  functions/                    Base44 にデプロイする関数エントリ（Deno.serve）
    fetchWaterLevels.ts
    evaluateWatchRules.ts
    sendLineNotification.ts
    linkLineUser.ts
tests/
  domain.test.ts                純粋関数の単体テスト
```

依存方向は `functions → usecases → domain` の一方向。`usecases` は具体実装ではなく `ports` のインタフェースにのみ依存するため、テストではインメモリのフェイクを注入できる。

## 4つの関数

| 関数 | 役割 | 推奨スケジュール |
|---|---|---|
| `fetchWaterLevels` | 観測所の最新水位を取得し `WaterLevelLog` に保存 | 5分ごと |
| `evaluateWatchRules` | 有効ルールを評価→通知対象抽出→対象ごとに LINE 送信 | 5分ごと |
| `sendLineNotification` | 単発送信（手動/テスト用、API仕様の引数に準拠） | 任意 |
| `linkLineUser` | `lineUserId` を `User` に紐づけ | フロントから呼び出し |

## 環境変数（シークレット）

| 変数 | 用途 |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API のチャネルアクセストークン |

Base44 のシークレット設定に登録する。コードには直書きしない。`.env.example` 参照。

## Base44 へのデプロイ

各 `src/functions/*.ts` がデプロイ単位。`createClientFromRequest(req)` で取得したクライアントの
`asServiceRole.entities.*` 経由でデータにアクセスする。
`deno.json` の import map と `deno.lock` を含めて扱う。単一ファイルを関数エディタに貼り付ける場合は、SDKの外部importを `npm:@base44/sdk@0.8.54` に解決したバンドルを使う。

> **複数ファイル構成について**: Base44 のバックエンド関数エディタが
> 1関数=1ファイルで相対 import を解決できない場合は、各関数を単一ファイルへバンドルしてから貼り付ける:
>
> ```
> deno bundle src/functions/fetchWaterLevels.ts > dist/fetchWaterLevels.ts
> ```
>
> （`npm:@base44/sdk` は外部依存として残す運用でも可）。プロジェクトをそのまま push できる構成なら相対 import のまま動く。

### スケジュール設定
`fetchWaterLevels` → `evaluateWatchRules` の順で 5 分間隔。間隔と通知クールダウン（既定30分）は要件に応じて調整。
両関数は管理者として認証された実行主体を要求する。定期実行主体の認証と権限を検証してから配備し、未認証アクセスを許可する回避策は使わない。

## ダミー → 実APIへの切り替え

`functions/fetchWaterLevels.ts` の以下を差し替えるだけ:

```ts
const provider = new MockWaterLevelProvider();
// ↓ 実APIプロバイダ（WaterLevelProvider を実装したクラス）に変更
// const provider = new MlitWaterLevelProvider(...);
```

`WaterLevelProvider` インタフェース（`fetchLatest(stations) => WaterLevelReading[]`）を満たす実装を
`adapters/` に追加すれば、ドメイン・ユースケースは無改修。

通知発火のE2E確認は spike 指定で:

```ts
new MockWaterLevelProvider({ spikeStationIds: ["<観測所ID>"] });
```

## フロントからの呼び出し（Base44 SDK）

```js
// LINE 連携
await base44.functions.invoke("linkLineUser", { userId, lineUserId });

// 単発テスト送信
await base44.functions.invoke("sendLineNotification", {
  userId, stationId, watchRuleId, waterLevel: 3.2,
});
```

## テスト

```
deno task test     # 純粋関数の単体テスト
deno task check    # 型チェック
```

`domain.ts` は I/O を持たないため外部依存なしで完結する。ユースケースをテストする場合は
`ports.ts` のインタフェースを満たすフェイクを注入する（例: 配列を返す `WatchRuleRepository`、
記録を配列に貯める `NotificationLogRepository`）。

## 設計上のポイント

- **しきい値の決定**: `warning/evacuation/danger` は観測所の公式水位を優先し、未設定なら
  ルールの `thresholdValue` にフォールバック。`custom` は `thresholdValue` をそのまま使用。
- **到達判定**: 「条件到達時に通知」なので `水位 >= しきい値`（等号含む）。
- **連続通知防止**: 評価（`evaluateRules`）は `lastNotifiedAt` を読むだけの純粋関数。
  実際の更新は **LINE 送信成功時** に `sendLineNotification` が `lastNotifiedAt` を進める。
  これによりクールダウン中の再通知が次サイクル以降で抑制される。
- **失敗の記録**: LINE 未連携・API エラー・例外はすべて `NotificationLog` に `failed` で残す。
```
