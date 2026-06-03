Base44で作成した河川水位監視アプリに接続するバックエンド関数をTypeScriptで設計・実装してください。

必要な関数:

1. fetchWaterLevels
- 河川水位APIから観測所ごとの最新水位を取得
- WaterLevelLogに保存
- 最初はmock providerを用意

2. evaluateWatchRules
- enabled=trueのWatchRuleを取得
- 最新水位としきい値を比較
- 通知対象を抽出
- cooldownMinutes内の連続通知を防止

3. sendLineNotification
- LINE Messaging APIでPush通知
- NotificationLogに結果保存
- LINE_CHANNEL_ACCESS_TOKENは環境変数から取得

4. linkLineUser
- LINE連携時にlineUserIdをUserへ保存

非機能要件:
- TypeScript
- エラーハンドリング
- 関数分割
- テストしやすい純粋関数を優先
- APIキーやトークンをコードに直書きしない
