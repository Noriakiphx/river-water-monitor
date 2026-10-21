# Backend Functions / API仕様

## fetchWaterLevels()
観測所一覧を取得し、各観測所の最新水位を保存する。

## evaluateWatchRules()
有効な監視ルールを評価し、通知対象を返す。

## sendLineNotification(userId, stationId, watchRuleId, waterLevel)
LINE Push APIを呼び出し、通知結果をNotificationLogへ保存する。
認証済みの本人の監視ルールと、そのルールの観測所だけが対象です。互換性のため引数として残す `waterLevel` は信用せず、保存済みの最新観測値を使います。観測値がない場合は409を返し、通知しません。

## linkLineUser(userId, lineUserId)
LINE連携で取得したLINE userIdをアプリUserに紐づける。
アプリの認証が必要で、`userId` は認証済み本人のIDと一致しなければなりません。LINEアカウントの所有権確認は呼び出し元のLINEログイン連携で実施する必要があります。

## 推奨スケジュール
- fetchWaterLevels: 5分ごと
- evaluateWatchRules: 5分ごと
- 通知クールダウン: 初期値30分

`fetchWaterLevels` / `evaluateWatchRules` は管理者として認証された呼び出しだけを許可します。定期実行を配備する前に、Base44の実行主体がこの認証条件を満たすことを確認してください。認証情報をソースや公開設定に埋め込まないでください。未認証の定期呼び出しは401になります。
