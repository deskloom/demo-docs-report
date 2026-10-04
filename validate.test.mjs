import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuote, buildTableFillRequests } from './lib/quote.mjs';
import { buildAuthParams, generateState, checkCallback } from './lib/oauthFlow.mjs';
import { explainGoogleError, shareWithEmail } from './lib/docsClient.mjs';

const ok = () => ({ taxRate: 0.1, items: [{ name: '設計', qty: 2, unitPrice: 1000 }] });
const bad = (mut, re) => {
  const q = ok();
  mut(q);
  assert.throws(() => validateQuote(q), re);
};

test('validateQuote: valid quote passes (negative unitPrice and qty 0 allowed)', () => {
  validateQuote(ok());
  const q = ok();
  q.items.push({ name: '値引き', qty: 1, unitPrice: -5000 }, { name: '無償', qty: 0, unitPrice: 100 });
  validateQuote(q);
});
test('validateQuote: taxRate missing/NaN/out of range', () => {
  bad((q) => delete q.taxRate, /taxRate/);
  bad((q) => (q.taxRate = '0.1'), /taxRate/);
  bad((q) => (q.taxRate = NaN), /taxRate/);
  bad((q) => (q.taxRate = 1.5), /taxRate/);
  bad((q) => (q.taxRate = -0.1), /taxRate/);
});
test('validateQuote: items must be array; names non-empty without newlines', () => {
  bad((q) => (q.items = 'x'), /items/);
  bad((q) => (q.items[0].name = ''), /name/);
  bad((q) => (q.items[0].name = '   '), /name/);
  bad((q) => (q.items[0].name = 5), /name/);
  bad((q) => (q.items[0].name = 'a\nb'), /name/);
  bad((q) => (q.items[0].name = 'a\rb'), /name/);
});
test('validateQuote: qty integer >= 0, unitPrice integer', () => {
  bad((q) => (q.items[0].qty = -1), /qty/);
  bad((q) => (q.items[0].qty = 1.5), /qty/);
  bad((q) => (q.items[0].qty = '2'), /qty/);
  bad((q) => (q.items[0].unitPrice = 10.5), /unitPrice/);
  bad((q) => (q.items[0].unitPrice = undefined), /unitPrice/);
});
test('validateQuote: message is Japanese and names the item', () => {
  const q = ok();
  q.items[0].qty = -1;
  assert.throws(() => validateQuote(q), /明細1.*数量/);
});
test('validateQuote: null / non-object quote', () => {
  assert.throws(() => validateQuote(null), /見積/);
});

test('negative amounts render as -¥5,000', () => {
  const rows = Array.from({ length: 1 + 1 + 1 + 3 }, (_, ri) => ({
    tableCells: [0, 1, 2, 3].map((ci) => ({ content: [{ startIndex: ri * 10 + ci + 1 }] })),
  }));
  const items = [{ name: '値引き', qty: 1, unitPrice: -5000 }];
  const out = buildTableFillRequests(rows, items, { subtotal: -5000, tax: -500, total: -5500 });
  const texts = out.map((o) => o.text);
  assert.ok(texts.includes('-¥5,000'));
  assert.ok(texts.includes('-¥5,500'));
  assert.ok(!texts.some((t) => t.includes('¥-')));
});

test('oauthFlow: buildAuthParams includes state + PKCE S256', () => {
  const p = buildAuthParams({ scope: ['s'], state: 'st', codeChallenge: 'cc' });
  assert.equal(p.state, 'st');
  assert.equal(p.code_challenge, 'cc');
  assert.equal(p.code_challenge_method, 'S256');
  assert.equal(p.access_type, 'offline');
});
test('oauthFlow: generateState is random hex', () => {
  const a = generateState();
  assert.match(a, /^[0-9a-f]{32,}$/);
  assert.notEqual(a, generateState());
});
test('oauthFlow: checkCallback validates state', () => {
  const base = 'http://127.0.0.1:42813';
  assert.deepEqual(checkCallback(`${base}/?code=abc&state=s1`, 's1', base), { kind: 'ok', code: 'abc' });
  assert.equal(checkCallback(`${base}/?code=abc&state=zzz`, 's1', base).kind, 'bad_state');
  assert.equal(checkCallback(`${base}/?code=abc`, 's1', base).kind, 'bad_state');
  assert.equal(checkCallback(`${base}/?error=access_denied&state=s1`, 's1', base).kind, 'denied');
  assert.equal(checkCallback(`${base}/?error=access_denied&state=bad`, 's1', base).kind, 'bad_state');
  assert.equal(checkCallback(`${base}/favicon.ico`, 's1', base).kind, 'ignore');
});

test('explainGoogleError: invalid_grant -> Japanese re-auth hint', () => {
  const e1 = explainGoogleError(Object.assign(new Error('x'), { response: { data: { error: 'invalid_grant' } } }));
  assert.match(e1.message, /node auth-setup\.mjs/);
  const e2 = explainGoogleError(new Error('invalid_grant: Token has been expired or revoked.'));
  assert.match(e2.message, /node auth-setup\.mjs/);
  const other = new Error('boom');
  assert.equal(explainGoogleError(other), other);
});

test('shareWithEmail defaults to reader role', async () => {
  let body;
  const drive = { permissions: { create: async (a) => (body = a.requestBody) } };
  await shareWithEmail(drive, 'id', 'a@example.com');
  assert.equal(body.role, 'reader');
  await shareWithEmail(drive, 'id', 'a@example.com', 'writer');
  assert.equal(body.role, 'writer');
});
