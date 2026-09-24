# API調査結果

確認日: 2026-09-24 UTC / 2026-09-25 JST。
READMEのみの既存リポジトリを確認したため、Next.js + TypeScriptを採用しました。

## 一次資料と実通信

- https://priceofcompute.com/api
- https://priceofcompute.com/methodology
- `GET https://priceofcompute.com/api/v1/prices/{sku}`
- `GET https://priceofcompute.com/api/v1/history/{sku}`

下記6 SKUの両エンドポイントで実JSONの取得・正規化を確認しました。
ドキュメントのみでエンドポイントやフィールドを推測していません。

| 表示GPU | 実SKU | On-demand最古の日 | 最新日 | On-demand履歴件数 |
| --- | --- | --- | --- | ---: |
| H100 | h100-sxm | 2023-08-10 | 2026-09-24 | 68 |
| H200 | h200-sxm | 2026-08-09 | 2026-09-24 | 47 |
| B200 | b200 | 2026-08-09 | 2026-09-24 | 47 |
| B300 | b300 | 2026-08-09 | 2026-09-24 | 47 |
| A100 | a100-sxm-80gb | 2023-12-03 | 2026-09-24 | 64 |
| MI300X | mi300x | 2026-08-09 | 2026-09-24 | 47 |

H100/A100の古い値は不連続なアーカイブです。全日付にデータがあるわけではありません。
H100/H200/B200/B300/A100には `on_demand` / `spot` / `community`、MI300Xは `on_demand` が存在しました。
Reservedは調査時点のレスポンスにありません。CommunityをSpotへ読み替えません。

## 実際のレスポンス形状

最新価格のtop-level: `sku`, `day`, `prices`, `providers`, `updated_at`, `attribution`。

- `prices[pricing_type]`: `usd_per_gpu_hr`, `providers`（Provider数）。
- `providers[]`: `provider`, `pricing_type`, `usd_per_gpu_hr`, `region`（nullあり）, `observed_at`。
- 代表価格は `prices` の日次中央値。現在のProvider行から中央値を再計算しません。

履歴のtop-level: `sku`, `series`, `note`, `attribution`。

- `series[]`: `pricing_type`, `points`。
- `points[]`: `day`, `usd_per_gpu_hr`。
- 履歴に `updated_at` や観測ごとの `archival` フラグはありません。
- アーカイブ境界はMethodology記載の2026-08-09を使用し、この由来をコード・UIで明記します。

調査時点のProviderにはrunpod、coreweave、lambda、nebius等が存在しました。
Provider名の固定リストは使わず、各GPU/契約種別の取得行だけを表示します。

## 実装上の調整

1. 90日前の正確な観測値がないため、90D変化率は算出不可。値は作りません。
2. 6M/1Y/MAXでも、対象期間の実際の点だけを描き、欠損期間は線で接続しません。
3. 在庫、CPU/RAM/Storage同梱条件、元ノード価格、GPU数、行ごとのノード換算有無、最低契約条件はAPI未提供です。
4. MethodologyはGPU数によるノード単価正規化を説明していますが、各行の内訳は復元できません。
5. 掲載価格であり、実際の取引・在庫を意味しません。条件が完全に同一という表示はしません。
6. Futuresは未接続。将来用の型と案内タブのみ実装し、CMEの架空エンドポイントや先物価格は導入しません。
7. 履歴Provider数やProvider構成の変化はAPIから日別に追えません。その影響を除去した指数とは扱いません。

## 利用条件

APIキー不要の無料枠は1,000 requests/day/IP（7,000/week）。
出典の可視リンク `Data: Price of Compute` と1時間以上のキャッシュが必要です。
UIの更新はアプリ内APIへ向け、公開APIに過剰なポーリングをしません。
