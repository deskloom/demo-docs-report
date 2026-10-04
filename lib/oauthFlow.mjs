// OAuthループバックフローの純粋ヘルパー（ネットワーク非依存・オフラインでテスト可能）。
import crypto from 'node:crypto';

export function generateState() {
  return crypto.randomBytes(24).toString('hex');
}

// generateAuthUrl に渡すパラメータ。state（CSRF対策）とPKCE（S256）を必ず含める。
export function buildAuthParams({ scope, state, codeChallenge }) {
  return {
    access_type: 'offline',
    scope,
    prompt: 'consent',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// コールバックURLを検証する。kind: ok | denied | bad_state | ignore
//   stateが一致しないものは、codeやerrorが付いていても一律で拒否する。
export function checkCallback(reqUrl, expectedState, base) {
  const url = new URL(reqUrl, base);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return { kind: 'ignore' };
  const state = url.searchParams.get('state');
  if (state === null || !safeEqual(state, expectedState)) return { kind: 'bad_state' };
  if (error) return { kind: 'denied', error };
  return { kind: 'ok', code };
}
