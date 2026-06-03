# データモデル

## User
- id: string
- name: string
- email: string
- lineUserId: string | null
- lineLinked: boolean
- role: user | admin
- createdAt: datetime

## Station
- id: string
- riverName: string
- stationName: string
- prefecture: string
- municipality: string
- lat: number
- lng: number
- observationCode: string
- warningLevel: number | null
- evacuationLevel: number | null
- dangerLevel: number | null

## WatchRule
- id: string
- userId: string
- stationId: string
- thresholdType: warning | evacuation | danger | custom
- thresholdValue: number
- enabled: boolean
- cooldownMinutes: number
- lastNotifiedAt: datetime | null

## WaterLevelLog
- id: string
- stationId: string
- observedAt: datetime
- waterLevel: number
- source: string

## NotificationLog
- id: string
- userId: string
- stationId: string
- watchRuleId: string
- message: string
- sentAt: datetime
- status: success | failed
- errorMessage: string | null
