import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeAuth, makeClients } from './lib/docsClient.mjs';
import { generateQuoteDoc } from './lib/generateQuote.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const inputFile = process.argv[2] ?? path.join(here, 'data', 'sample-quote.json');
  const shareEmail = process.argv[3] ?? null;
  const quote = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

  const auth = makeAuth();
  const { docs, drive } = await makeClients(auth);
  const result = await generateQuoteDoc({ docs, drive, quote, shareEmail });

  console.log('作成しました:', result.url);
  console.log('小計:', result.totals.subtotal, '消費税:', result.totals.tax, '合計:', result.totals.total);
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
