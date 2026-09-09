// 実際にGoogle Docs/Drive APIを呼び、見積書ドキュメントを1通生成して内容を検証する。
// 実行: node smoke-test.mjs [共有先メールアドレス]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeAuth, makeClients, getDoc } from './lib/docsClient.mjs';
import { generateQuoteDoc } from './lib/generateQuote.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function assert(cond, message) {
  if (!cond) throw new Error('FAILED: ' + message);
  console.log('ok: ' + message);
}

function fullText(doc) {
  return doc.body.content
    .flatMap((e) => e.paragraph?.elements ?? [])
    .map((e) => e.textRun?.content ?? '')
    .join('') +
    doc.body.content
      .filter((e) => e.table)
      .flatMap((e) => e.table.tableRows)
      .flatMap((r) => r.tableCells)
      .flatMap((c) => c.content)
      .flatMap((p) => p.paragraph?.elements ?? [])
      .map((e) => e.textRun?.content ?? '')
      .join('');
}

async function main() {
  const shareEmail = process.argv[2] || null;
  const quote = JSON.parse(fs.readFileSync(path.join(here, 'data', 'sample-quote.json'), 'utf8'));

  const auth = makeAuth();
  const { docs, drive } = await makeClients(auth);

  const result = await generateQuoteDoc({ docs, drive, quote, shareEmail });
  console.log('created:', result.url);

  const doc = await getDoc(docs, result.documentId);
  const text = fullText(doc);

  assert(text.includes('御見積書'), 'title text is present');
  assert(text.includes(quote.clientName), 'client name is present');
  assert(text.includes(quote.title), 'project title is present');
  assert(text.includes(quote.items[0].name), 'first line item name is present');
  assert(text.includes('小計'), 'subtotal label is present');
  assert(text.includes('消費税'), 'tax label is present');
  assert(text.includes('合計'), 'total label is present');
  assert(text.includes(`¥${result.totals.total.toLocaleString('ja-JP')}`), 'computed total amount is present');

  const tableEl = doc.body.content.find((e) => e.table);
  assert(!!tableEl, 'a table structure exists in the document');
  assert(
    tableEl.table.tableRows.length === 1 + quote.items.length + 1 + 3,
    `table has the expected row count (${1 + quote.items.length + 1 + 3})`
  );

  console.log('\nSMOKE PASS:', result.url);
}

main().catch((err) => {
  console.error('SMOKE FAIL:', err.message);
  process.exit(1);
});
