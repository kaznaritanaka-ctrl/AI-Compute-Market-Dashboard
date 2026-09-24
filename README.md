# AI Compute Market Dashboard

GPUレンタル価格を継続観測する、Next.js + TypeScript の1ページダッシュボード。
Price of Compute の実APIから取得し、独自指数・推測値・デモ価格は表示しません。

## 起動

Node.js 22以上、pnpm 10以上。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

http://localhost:3000 を開きます。本番は `pnpm build` → `pnpm start`。
APIキーは不要です。初回読み込みはサーバーが公開APIへ接続するため、ネットワークが必要です。

## 機能

- H100 / H200 / B200 / B300 / A100 / MI300X の切り替え
- 現在の日次中央値、正確に1 / 7 / 30 / 90日前との変化率
- 7D / 1M / 3M / 6M / 1Y / MAX の価格チャート、クロスヘア
- On-demand / Spot / Communityなど、実際に取得できた契約種別を分離
- Provider別価格・地域・観測日時、安い順／高い順ソート
- H200/H100、B200/H100、B200/H200 の価格差・価格比・プレミアム
- ダーク／ライトテーマ、PC・モバイル対応
- Futuresの未接続表示と、将来の先物カーブ用データモデル

## データの定義と制約

調査結果は [docs/API_RESEARCH.md](docs/API_RESEARCH.md) を参照してください。

- H100/H200は **SXM**、A100は **80GB SXM**。異なるフォームファクタを混ぜません。
- 価格はUSD / GPU-hour。データソースが算出した **Provider内中央値→Provider間中央値** を使用します。
- **掲載価格**であって、約定価格・在庫保証ではありません。
- CPU/RAM/Storageの付帯条件・最低契約期間・各行のノード換算有無はAPI未提供。表に在庫や条件を捏造しません。
- APIのProviderキーをそのまま表示します。例：`datacrunch` はデータソースの識別子です。
- 変化率は価格対象日から正確にN日前の観測値がある場合だけ算出。近い日による代用や補間はしません。
- 2026-09-24の調査時点で90日前のデータはなく、90Dは「データなし」です。
- チャートの1M/3M/6M/1Yは直近30/90/180/365暦日、当日を含みます。
- 2026-08-09より前は、公開の算出方法に基づきアーカイブ扱い。点で描き、欠損期間を線で接続しません。
- Spreadは同じ対象日・契約種別のみ比較。性能を調整した価格比ではありません。
- 取得日時とデータソースの最終観測日時を区別し、UTCで表示します。

## 構成

```text
src/lib/market.ts                     共通モデル、変化率、Spread、期間計算
src/lib/adapters/normalize.ts         実API形式の検証・正規化
src/lib/adapters/cache.ts             single-flight、永続キャッシュ、障害時フォールバック
src/lib/adapters/price-of-compute.ts   server-only外部API adapter
src/app/api/market/route.ts           アプリ内API（GET /api/market）
src/components/dashboard.tsx         UI、5分間隔の内部API再確認
src/components/price-chart.tsx       Lightweight Charts、将来の複数系列入力に対応
tests/                               正規化、欠損、Spread、障害・キャッシュのテスト
```

UIから外部価格APIへのリクエストは行いません。Silicon Data追加時は `MarketDataAdapter` を実装し、
CME接続時は `FuturesDataAdapter` / `ForwardCurvePoint` を使います。
先物モデルは spot / front-month / 3M / 6M / dated のテナー、満期、観測日時、価格種別を保持します。

## キャッシュと運用

Price of Compute は1,000リクエスト/日/IP、7,000/週で、**1時間以上のキャッシュ**を求めています。
6 SKU × 2エンドポイント × 最大24回 = **通常288リクエスト/日/稼働プロセス**です。
GPU切り替えや画面の更新ボタンで外部キャッシュは迂回しません。

- エンドポイントごとに1時間キャッシュし、同時リクエストをまとめます。
- リクエストは12秒でタイムアウト。429のRetry-Afterを尊重し、障害時も最低1時間は再試行を抑えます。
- 片方のエンドポイントが失敗しても、取得できた価格／履歴は表示します。
- 最終成功値をメモリと `.cache/compute-v1/` に保存。障害時は元の取得日時のままstale表示します。
- 保存済みデータのない初回障害時は「データなし」。0やモック価格では埋めません。
- 観測値が36時間以上前の場合にも注意表示します。
- `COMPUTE_CACHE_DIR` で永続化ディレクトリを指定できます（`.env.example` 参照）。
- 書き込み不可の場合はプロセスメモリのみ。再起動後のフォールバックには永続ディスクが必要です。
- このMVPは単一Nodeプロセス向けです。複数レプリカ／頻繁なコールドスタートではRedis等の共有キャッシュと分散ロックを追加してください。無料枠はIP単位なので、単にレプリカを増やすと枠を超える可能性があります。
- 継続観測はページが開いている間の再取得です。閉じている間は収集ジョブを実行せず、再度開いたときに提供元の履歴を取得します。

## 検証

```sh
pnpm test
pnpm typecheck
pnpm build
```

テスト入力はテスト内に限定され、本番UIへは入りません。
検証環境が一時ディレクトリへの書き込みを制限する場合は、TEMP/TMPを作業ディレクトリ内の書き込み可能な場所へ設定してください。

## 出典・ライセンス表記

- [Data: Price of Compute](https://priceofcompute.com)
- [API](https://priceofcompute.com/api) / [Methodology](https://priceofcompute.com/methodology)
- TradingView Lightweight Charts™ — Copyright © 2025 TradingView, Inc. https://www.tradingview.com/
- ライブラリの通知は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照。
