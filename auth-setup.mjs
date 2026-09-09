// 初回のみ実行するOAuth同意フロー（ループバック方式）。
//   1. ローカルに一時サーバーを立てる
//   2. 認可URLを表示 → ユーザーがブラウザで開いて許可
//   3. Googleがhttp://localhost:<port>/?code=...へリダイレクト → サーバーがcodeを受け取る
//   4. codeをトークンに交換し、token.json（refresh_token含む）に保存
//   5. サーバーを閉じて終了
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { loadOAuthClient, SCOPES } from './lib/docsClient.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(here, 'token.json');
const PORT = 42813;

async function main() {
  const { client_id, client_secret } = loadOAuthClient();
  const redirectUri = `http://127.0.0.1:${PORT}`;
  const client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  const authUrl = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (error) {
        res.end('<h1>許可されませんでした。このタブを閉じてください。</h1>');
        server.close();
        reject(new Error('OAuth consent denied: ' + error));
        return;
      }
      if (code) {
        res.end('<h1>許可を確認しました。このタブを閉じてターミナルに戻ってください。</h1>');
        server.close();
        resolve(code);
      }
    });
    server.listen(PORT, '127.0.0.1', () => {
      console.log('次のURLをブラウザで開いて、Googleアカウントでログイン・許可してください:');
      console.log('\n' + authUrl + '\n');
      console.log(`(${redirectUri} での応答を待っています…)`);
    });
    server.on('error', reject);
  });

  const { tokens } = await client.getToken(code);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf8');
  console.log('token.json を保存しました。以降はブラウザ操作なしで実行できます。');
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
