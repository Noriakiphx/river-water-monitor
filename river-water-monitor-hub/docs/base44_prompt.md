日本語UIの「河川水位監視・LINE通知アプリ」を作成してください。

目的:
ユーザーがアプリ上で河川観測所を選択し、水位しきい値を設定すると、条件到達時にLINEへ通知されるアプリ。

主要機能:
- ユーザー登録・ログイン
- LINE連携状態の表示
- 地域・河川・観測所の検索
- 観測所のお気に入り登録
- 通知条件設定
  - 氾濫注意水位
  - 避難判断水位
  - 氾濫危険水位
  - 任意水位
- 通知ON/OFF
- 通知履歴一覧
- 管理者画面
  - 観測所管理
  - API取得状況
  - 通知送信ログ

データモデル:
User:
- name
- email
- lineUserId
- lineLinked
- role

Station:
- riverName
- stationName
- prefecture
- municipality
- lat
- lng
- observationCode
- warningLevel
- evacuationLevel
- dangerLevel

WatchRule:
- userId
- stationId
- thresholdType
- thresholdValue
- enabled
- cooldownMinutes
- lastNotifiedAt

WaterLevelLog:
- stationId
- observedAt
- waterLevel
- source

NotificationLog:
- userId
- stationId
- watchRuleId
- message
- sentAt
- status
- errorMessage

画面:
- ダッシュボード
- 観測所検索
- 観測所詳細
- 通知設定
- 通知履歴
- LINE連携画面
- 管理者画面

要件:
- モバイルファースト
- 日本語UI
- Backend FunctionsでLINE通知と河川データ取得を後から接続できる構造
- 最初はダミー水位データで動作確認できること
