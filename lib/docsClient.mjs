import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const here = path.dirname(fileURLToPath(import.meta.url));
const OAUTH_CLIENT_FILE = path.join(here, '..', 'oauth-client.json');
const TOKEN_FILE = path.join(here, '..', 'token.json');

export const SCOPES = ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive.file'];

export function loadOAuthClient() {
  if (!fs.existsSync(OAUTH_CLIENT_FILE)) {
    throw new Error(`OAuthクライアント設定が見つかりません: ${OAUTH_CLIENT_FILE}`);
  }
  const { installed } = JSON.parse(fs.readFileSync(OAUTH_CLIENT_FILE, 'utf8'));
  return installed;
}

// 個人のGoogleアカウントに対してdocuments.create等の「新規ファイル作成」を行うにはOAuthが必須
// （サービスアカウントはDriveの保存容量を持たないため403 forbiddenになる。2026-09-10に実機で確認）。
// 初回は auth-setup.mjs でループバック方式の同意フローを1回だけ通し、token.json（refresh_token含む）
// を保存する。以降はこのtoken.jsonを読むだけで、ブラウザ操作なしに自動実行できる。
export function makeAuth() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error(
      `token.jsonが見つかりません。先に "node auth-setup.mjs" を実行してブラウザで一度だけ許可してください。`
    );
  }
  const { client_id, client_secret, redirect_uris } = loadOAuthClient();
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  client.setCredentials(tokens);
  // access_tokenが期限切れでもrefresh_tokenがあれば自動更新される（googleapisライブラリの標準動作）。
  return client;
}

export async function makeClients(authClient) {
  return {
    docs: google.docs({ version: 'v1', auth: authClient }),
    drive: google.drive({ version: 'v3', auth: authClient }),
  };
}

export async function createDoc(docs, title) {
  const res = await docs.documents.create({ requestBody: { title } });
  return res.data.documentId;
}

export async function batchUpdate(docs, documentId, requests) {
  if (requests.length === 0) return;
  return docs.documents.batchUpdate({ documentId, requestBody: { requests } });
}

export async function getDoc(docs, documentId) {
  const res = await docs.documents.get({ documentId });
  return res.data;
}

// ドキュメント本文の唯一のテーブル要素を取り出す（このデモは1文書1テーブルの構成のみ扱う）。
export function findTable(doc) {
  const el = doc.body.content.find((e) => e.table);
  if (!el) throw new Error('ドキュメント内にテーブルが見つかりません');
  return { table: el.table, endIndex: el.endIndex };
}

export async function shareWithEmail(drive, documentId, email) {
  if (!email) return;
  await drive.permissions.create({
    fileId: documentId,
    sendNotificationEmail: false,
    requestBody: { type: 'user', role: 'writer', emailAddress: email },
  });
}

export function docUrl(documentId) {
  return `https://docs.google.com/document/d/${documentId}/edit`;
}
