# frontend

Base44 で構築した「河川水位監視・LINE通知アプリ」のソース配置先。

Base44 の GitHub 同期 / エクスポート機能で、このディレクトリへ出力する想定です。
バックエンド関数（`../backend`）とは Base44 SDK の `base44.functions.invoke(...)` で接続します。

主な接続ポイント:
- `linkLineUser` … LINE 連携で取得した `lineUserId` を保存
- `sendLineNotification` … 単発テスト送信
- `fetchWaterLevels` / `evaluateWatchRules` … 定期実行（Base44 のスケジュール）

参照: `../docs/base44_prompt.md`（UI要件）, `../docs/data_model.md`（エンティティ定義）
