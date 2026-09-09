# 見積書自動生成デモ（Google Docs API・架空データ）

架空の見積データ（クライアント名・品目・数量・単価）から、Google Docsの見積書を自動生成するCLIデモ。
**すべて架空データ**で検証した自主制作例で、顧客案件としては表現しない。

## 何を実装したか

- **Google Docs API `batchUpdate`によるドキュメント構築**: タイトルの見出しスタイル適用、テーブルの
  挿入、テーブル各セルへのテキスト挿入、合計行の太字化を、それぞれ正しいAPIリクエストとして構築する。
- **テーブル編集のインデックス管理**: Docs APIは本文をフラットな文字インデックスで管理するため、
  「空のテーブルを挿入 → `documents.get`で実際のセル位置を読み直す → 後ろのセルから先に文字を
  挿入する（前方のインデックスをずらさないため）」という定石の手順を実装している（`lib/quote.mjs`
  `buildTableFillRequests`）。
- **OAuth 2.0（ループバック方式）認証**: 個人のGoogleアカウントで新規ファイルを作成するには
  OAuthが必須（サービスアカウントはDriveの保存容量を持たず`documents.create`が403になる。
  実機で確認済み）。`auth-setup.mjs`で初回のみブラウザ許可を行い、以降は`token.json`の
  refresh_tokenで無人実行できる。

## 動作確認方法

コードレビューだけでなく、実際にAPIを呼んで検証している。

```bash
npm install
# 初回のみ: OAuthクライアント（Google Cloud Console「デスクトップアプリ」種別）を
#   oauth-client.json として配置し、以下を実行してブラウザで一度だけ許可する
node auth-setup.mjs

npm test              # モック単体テスト（node:test、APIコストなし）
node smoke-test.mjs   # 実際にGoogle Docsを1通生成し、内容を検証する
node cli.mjs [入力JSON] [共有先メールアドレス（任意）]
```

`npm test`（9件）が確認する内容:
- 小計・消費税（四捨五入）・合計の計算（0件時のNaN防止を含む）
- ヘッダーテキストの見出し範囲が「御見積書」の文字数と正確に一致すること
- テーブルの行数（ヘッダー1+明細N+空白1+小計/税/合計3）
- セルへの挿入テキストの内容（品目名・金額のフォーマット `¥12,345`）
- 空セルへの0文字insertTextを送らないこと（Docs APIはこれをエラーにする）
- 挿入インデックスが降順であること（前方インデックスの破壊を防ぐ安全な挿入順）
- テーブル行数の不一致を検出して例外を投げること（誤用防止）

`smoke-test.mjs`は実際にGoogle Docsを1通生成し、タイトル・宛先・件名・品目名・小計/消費税/合計の
各ラベルと計算済み金額がドキュメント本文に実在すること、テーブルの行数が期待どおりであることを
`documents.get`で読み戻して検証する。

## ディレクトリ構成

```
lib/quote.mjs         見積書の中身を組み立てる純粋関数（テスト容易・API非依存）
lib/docsClient.mjs     OAuth認証・Docs/Drive APIラッパー
lib/generateQuote.mjs  上記を組み合わせて実際にドキュメントを生成するオーケストレーション
cli.mjs                CLIエントリ
auth-setup.mjs         初回のみのOAuth同意フロー（ループバック方式）
data/sample-quote.json 架空の見積データ
quote.test.mjs         モック単体テスト
smoke-test.mjs         実APIへの自動検証スクリプト
```
