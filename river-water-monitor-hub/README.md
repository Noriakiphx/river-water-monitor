# river-water-monitor

河川水位監視・LINE通知システム。観測所の水位を定期取得し、ユーザーが設定したしきい値（氾濫注意 / 避難判断 / 氾濫危険 / 任意）に到達すると LINE へ通知する。

このリポジトリは各パートを統合する「発令所」です。

## 構成

| ディレクトリ | 内容 | 由来 |
|---|---|---|
| `backend/` | Deno / TypeScript のバックエンド関数（水位取得・ルール評価・LINE通知・LINE連携） | Claude |
| `frontend/` | Base44 で構築したアプリUI（GitHub 同期 / エクスポート先） | Base44 |
| `docs/` | API仕様・データモデル・各ビルダー向けプロンプト | ChatGPT |

## バックエンド

Deno + TypeScript。通知判定の中核を純粋関数（`backend/src/domain.ts`）に集約し、I/O（Base44 / LINE / 河川水位API）はポートとアダプタで差し替え可能。詳細は `backend/README.md`。

```bash
cd backend
deno task check   # 型チェック
deno task test    # 単体テスト
```

水位プロバイダは mock と本番（国交省API想定の `MlitWaterLevelProvider`）を用意。切り替えは `backend/src/functions/fetchWaterLevels.ts` の1箇所。

## CI

`.github/workflows/ci.yml` が `backend/**` への push / PR で fmt・lint・型チェック・テストを自動実行する。

## シークレット

`LINE_CHANNEL_ACCESS_TOKEN`（および実API用の base URL 等）は Base44 のシークレット / 環境変数に登録する。`.env` は**コミットしない**（雛形は `backend/.env.example`）。
