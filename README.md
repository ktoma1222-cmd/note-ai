# NOTE AI

飲食店グループ「NOTE GROUP」(ノ音 / 茶ノ音 / 和ノ音 / 小人)向けの経営管理アプリです。
各店舗の月次PL(損益計算書)入力・グループ全体の経営分析、TableCheckの予約データ取込、
顧客分析、そして自然言語でPL・予約データを質問できるAIチャット機能をひとつにまとめています。

## このアプリで解決していること

これまで店舗ごとにExcelやスプレッドシート、TableCheckの管理画面などバラバラに存在していた
経営数値・予約・顧客データを1か所に集約し、

- 店舗ごと/グループ全体の**月次PL**(売上・原価・人件費・営業利益など)を入力・比較・前年同月比較できるようにする
- **TableCheckの予約データ**をCSVで取り込み、予約組数・予想売上・キャンセル状況などを可視化する
- 顧客の**来店動向**(新規/リピーター、利用目的、予約経路など)を分析できるようにする
- 「ノ音の今月の営業利益は?」のように**自然言語で質問すると、AIがPL・予約データを集計して回答する**

ことを目的としています。店舗数店・少人数運用を前提とした、社内利用のみの管理ツールです。

## 主な機能

| 機能 | 内容 |
|---|---|
| Dashboard | グループ/店舗別のPLサマリー、予約状況、予想売上を一覧表示 |
| PL入力・分析 | 月次PLの入力(手入力 or Googleスプレッドシート連携で自動取込)、店舗別比較、前年同月比較、損益分岐点分析 |
| Customers | TableCheck予約データの一覧・KPI(予約組数・人数・確定/キャンセル件数など)、前年比較グラフ |
| Analytics | 利用目的・予約経路・新規/リピーター比率などの内訳グラフ |
| NOTE AI(AIチャット) | 「〇〇店の今月の売上を教えて」のような自然言語の質問にAIがPL・予約データを集計して回答 |
| 店舗管理・設定 | 店舗のマスタ管理、TableCheck CSV取込、Googleスプレッドシート連携設定、通信警備費内訳マスタ管理 |

## 対象ユーザーと権限

PIN(6〜8桁の数字)でログインし、以下3段階のロールで機能へのアクセスを制御しています。

- **ADMIN**: 全機能・全店舗にアクセス可能。店舗マスタ管理、外部連携設定(Google/TableCheck)もADMIN限定。
- **MANAGER**: 担当店舗のPL入力・予約取込などが可能(STAFFには不可の書き込み操作を担当)。
- **STAFF**: 閲覧が中心。PL入力や設定変更はできない。

## データの取り込み元

- **PL(損益)**: 手入力、またはGoogleスプレッドシート連携で店舗ごとのシートから自動取込
- **予約データ**: TableCheckの管理画面からエクスポートしたCSVを取り込む(TableCheck API自体は申請却下のため利用不可)。取込は2段階:
  - **手動アップロード**: 設定画面からCSVをアップロードし、プレビュー確認後に確定する方式(重複の疑いがある予約は人が新規/統合を選択)
  - **半自動取込**(2026-09-23〜): ダウンロードしたCSVをサーバー上の`tablecheck-inbox/incoming/`フォルダに置くと、30分おきの定期ジョブ(`/api/cron/tablecheck-import`)が自動で取り込む。新規・更新・キャンセル・変更なしの予約は自動反映され、重複の疑いがある予約・読み取れなかった行だけは`needs-review/`に残り、設定画面から手動アップロードで再確認できる。CSVのダウンロード自体はTableCheck側が手動エクスポートしか提供していないため引き続き人力(詳細は[設定画面](../settings/tablecheck)を参照)
- 過去には顧客データベース(Notion)との連携も行っていましたが、2026年9月以降はTableCheck CSVを正データソースとする方針に変更し、Notion同期は停止しています(過去データは参考情報として保持)

## 技術構成

- **フレームワーク**: [Next.js](https://nextjs.org) 16(App Router, Turbopack)
- **言語**: TypeScript
- **UI**: React 19 / Tailwind CSS v4 / [Recharts](https://recharts.org)(グラフ)
- **DB / ORM**: SQLite + [Prisma](https://www.prisma.io) ORM(将来的にPostgreSQL等への移行も想定した構成)
- **認証**: PINログイン([bcryptjs](https://www.npmjs.com/package/bcryptjs)でハッシュ化) + [jose](https://github.com/panva/jose)によるJWTセッションCookie
- **AI**: Anthropic Claude API(fetchベースの薄い自前クライアント、SDK依存なし)。アプリ内AIチャットに加え、手元のClaude Desktop/Claude Codeから直接PL・予約データに問い合わせられるMCPサーバー(`/api/mcp`、Streamable HTTP/JSON-RPC自前実装)も公開
- **外部連携**: Google Sheets API(PL自動取込)、Google OAuth、Notion API(過去データ参照用)
- 依存は最小限にする方針(SDKよりfetch直叩き、バリデーションは[zod](https://zod.dev)のみ、といった軽量な構成を意図的に選んでいます)

### ディレクトリ構成(抜粋)

```
app/(app)/          画面(Dashboard, PL, Customers, Analytics, AI, 設定など)
app/api/             Route Handler(Google OAuth, cronによるNotion/TableCheck同期用エンドポイント, MCPサーバー)
components/          画面ごとのUIコンポーネント
lib/actions/         Server Actions(書き込み処理の本体、権限チェックもここで行う)
lib/integrations/    外部サービス(Google Sheets, Notion, Claude, TableCheck CSV)のクライアント
lib/sync/            定期実行される同期処理(Notion同期、TableCheck CSVフォルダ半自動取込)
lib/*-queries.ts     読み取り集計ロジック
prisma/schema.prisma データモデル定義
proxy.ts             認証ミドルウェア(未ログイン時は/loginへリダイレクト)
.claude/skills/      Claude Codeのセキュリティ監査スキル(後述)
```

### データモデル概要(`prisma/schema.prisma`)

- `User` / `StoreAccess`: ユーザーとロール、店舗ごとのアクセス権
- `Store`: 店舗マスタ(ノ音/茶ノ音/和ノ音/小人)
- `MonthlyPL` / `TelecomSecurityItem` / `TelecomSecurityDetail`: 月次PLとその内訳
- `Reservation` / `ReservationImportLog` / `TableCheckStoreMapping` / `TableCheckImportSession`: TableCheck予約データとその取込処理
- `Customer` / `Visit`: 旧Notion連携時代の顧客・来店データ(参考情報として保持)
- `GoogleConnection`: Google OAuthの接続情報(リフレッシュトークンは暗号化して保存)
- `LoginLockState` / `ChatUsage`: ログインのブルートフォース対策、AIチャットのレート制限
- `AuditLog`: 重要操作の監査ログ

## セットアップ

### 必要な環境変数(`.env`)

`.env`はGit管理外です。以下のキーを用意してください。

| 変数名 | 用途 |
|---|---|
| `DATABASE_URL` | Prisma接続先(例: `file:./dev.db`) |
| `AUTH_SECRET` | セッションJWTの署名鍵、および秘密情報の暗号化鍵の元になる値 |
| `COOKIE_SECURE` | `"true"`でSecure Cookie(HTTPS配信時のみ)。既定は平文HTTP配信のため未設定でよい |
| `CRON_SECRET` | 定期同期用エンドポイント(`/api/cron/notion-sync`, `/api/cron/tablecheck-import`)の認証用シークレット |
| `ANTHROPIC_API_KEY` | AIチャット用(Claude API)。ワークスペースに紐づいていないキーの場合は`ANTHROPIC_WORKSPACE_ID`も必要 |
| `CLAUDE_MODEL` | 省略時は`claude-sonnet-5`(任意) |
| `ANTHROPIC_WORKSPACE_ID` | `ANTHROPIC_API_KEY`がワークスペース未紐付きの場合のみ必要(任意) |
| `MCP_SECRET` | MCPサーバー(`/api/mcp`)の認証用シークレット(Bearerトークン) |
| `TABLECHECK_INBOX_DIR` | TableCheck CSV半自動取込のフォルダパス。省略時はプロジェクト直下の`tablecheck-inbox/`(任意) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | PLスプレッドシート連携用のGoogle OAuth |
| `NOTION_API_KEY` / `NOTION_CUSTOMER_DB_ID` | 過去のNotion連携用(現在は新規同期は停止中) |

### 開発サーバーの起動

```bash
npm install
npx prisma migrate dev   # DBスキーマ反映
npm run db:seed          # 初期ADMINユーザーの作成(PINは別途スクリプトで設定)
npm run dev              # Tailscale IP固定で起動(next dev -H <IP>)
```

その他のコマンド: `npm run build` / `npm run start` / `npm run lint` / `npm run db:studio`(Prisma StudioでDBを直接確認)

### 開発上の注意

- このリポジトリはNext.jsのバージョンが新しく、一般的に知られている挙動と異なる場合があります。実装前に`node_modules/next/dist/docs/`配下の該当ドキュメントを確認してください(`AGENTS.md`参照)。
- 本番運用はTailscaleのプライベートネットワーク上で直接HTTP配信する構成を想定しています(リバースプロキシなし)。

## セキュリティ

[cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill)を用いたソースコード監査を実施し、
検出されたセキュリティ上の問題(OAuth連携のCSRF対策、CSVインポート処理の入力検証、権限スコープの不備など、
計12件)はすべて修正済みです。監査の詳細な手法・結果は監査スキル自体を`.claude/skills/security-audit/`に含めています。
