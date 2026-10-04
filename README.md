# 見積書自動生成デモ（Google Docs API・架空データ）

架空の見積データ（クライアント名・品目・数量・単価）から、Google Docsの見積書を自動生成するCLIデモ。
業務で受託した案件ではなく、**すべて架空データ**で作成した自主制作のサンプルです。

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
  refresh_tokenで無人実行できる。ただし、OAuth同意画面の公開ステータスが「テスト」のままだと
  refresh_tokenは7日で失効する（Google公式ドキュメントの記載）。長期運用する場合はアプリを
  本番環境に公開するか、週に1回`auth-setup.mjs`を再実行する。失効時（`invalid_grant`）は
  再実行を促す日本語メッセージを表示する。認可フローは`state`（CSRF対策。不一致は400で拒否し
  トークンを保存しない）とPKCE（S256）を使い、`127.0.0.1`のみで待ち受ける。

## 動作確認方法

コードレビューだけでなく、実際にAPIを呼んで検証している。

前提: **Node.js 21 以上**（`npm test`の`node --test *.test.mjs`のため）。

### Google Cloud側の準備（初回のみ）

これらを済ませないと、`403 ... API has not been used in project`や`access_denied`になります。

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成（または既存のものを選択）する。
2. 同じプロジェクトで**Google Docs API**と**Google Drive API**を有効化する（「APIとサービス」→ライブラリ）。
3. **OAuth同意画面**を設定する（コンソール上では「Google Auth Platform」として案内される場合があります）。
   ユーザーの種類は「外部」、公開ステータスは「テスト」のままでよく、**テストユーザーに自分のGoogleアカウントを追加**する。
4. 認証情報から**OAuthクライアントID**を作成する。アプリケーションの種類は「デスクトップアプリ」。
   作成後にJSONをダウンロードし、このディレクトリ直下に`oauth-client.json`という名前で保存する。
5. 要求するスコープは`https://www.googleapis.com/auth/documents`と`https://www.googleapis.com/auth/drive.file`
   （`lib/docsClient.mjs`の`SCOPES`）。許可画面でこの2つに同意する。

`oauth-client.json`と`token.json`は認証情報なのでコミットしないこと。

```bash
npm install
node auth-setup.mjs   # 初回のみ。表示されたURLをブラウザで開いて許可する（token.jsonが作られる）

npm test              # モック単体テスト（node:test、APIコストなし）
node smoke-test.mjs   # 実際にGoogle Docsを1通生成し、内容を検証する
node cli.mjs [入力JSON] [共有先メールアドレス（任意）]
```

注意: `smoke-test.mjs`は実行のたびに見積書ドキュメントを1通作成し、削除しません。
実行した分だけ、自分のGoogleドライブにドキュメントが残るので、不要なら手動で削除してください。

`npm test`（21件・APIを呼ばない）が確認する内容:
- 小計・消費税（四捨五入）・合計の計算（品目が空の場合は合計¥0になる）
- ヘッダーテキストの見出し範囲が「御見積書」の文字数と正確に一致すること
- テーブルの行数（ヘッダー1+明細N+空白1+小計/税/合計3）
- セルへの挿入テキストの内容（品目名・金額のフォーマット `¥12,345`）
- 空セルへの0文字insertTextを送らないこと（Docs APIはこれをエラーにする）
- 入力検証（`validateQuote`）: taxRate未指定/範囲外、品目名の空・改行、数量・単価が整数でない場合は日本語エラーで終了（exit 1）
- 負の金額（値引き）は `-¥5,000` 形式で表示
- 共有先メールアドレスには閲覧のみ（`reader`）権限を付与（見積金額を編集させないため）
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
