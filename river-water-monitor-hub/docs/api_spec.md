# Backend Functions / API仕様

## fetchWaterLevels()
観測所一覧を取得し、各観測所の最新水位を保存する。

## evaluateWatchRules()
有効な監視ルールを評価し、通知対象を返す。

## sendLineNotification(userId, stationId, watchRuleId, waterLevel)
LINE Push APIを呼び出し、通知結果をNotificationLogへ保存する。

## linkLineUser(userId, lineUserId)
LINE連携で取得したLINE userIdをアプリUserに紐づける。

## 推奨スケジュール
- fetchWaterLevels: 5分ごと
- evaluateWatchRules: 5分ごと
- 通知クールダウン: 初期値30分
