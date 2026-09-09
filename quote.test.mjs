import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcTotals,
  buildHeaderPlan,
  tableDimensions,
  buildTableFillRequests,
  totalsRowBoldRanges,
} from './lib/quote.mjs';

test('calcTotals: sums qty*unitPrice and rounds tax', () => {
  const items = [
    { name: 'A', qty: 2, unitPrice: 1000 },
    { name: 'B', qty: 1, unitPrice: 333 },
  ];
  const totals = calcTotals(items, 0.1);
  assert.equal(totals.subtotal, 2333);
  assert.equal(totals.tax, 233); // round(233.3)
  assert.equal(totals.total, 2566);
});

test('calcTotals: empty items list is zero, not NaN', () => {
  const totals = calcTotals([], 0.1);
  assert.deepEqual(totals, { subtotal: 0, tax: 0, total: 0 });
});

test('buildHeaderPlan: title range covers exactly "御見積書"', () => {
  const { text, titleRange } = buildHeaderPlan({
    clientName: 'テスト商事',
    title: '案件名',
    issueDate: '2026-01-01',
  });
  assert.equal(text.slice(titleRange.startIndex - 1, titleRange.endIndex - 1), '御見積書');
  assert.match(text, /テスト商事 御中/);
  assert.match(text, /件名: 案件名/);
});

test('tableDimensions: header + items + blank + 3 totals rows, 4 columns', () => {
  const dims = tableDimensions([{ name: 'x', qty: 1, unitPrice: 1 }, { name: 'y', qty: 1, unitPrice: 1 }]);
  assert.deepEqual(dims, { rows: 1 + 2 + 1 + 3, columns: 4 });
});

function fakeTableRows(rows, cols) {
  // Docs APIのtableRows構造を模した最小フェイク。startIndexは行×列で単調増加させる。
  let idx = 100;
  return Array.from({ length: rows }, () => ({
    tableCells: Array.from({ length: cols }, () => {
      const startIndex = idx;
      idx += 3; // セルの中身+区切り分を適当に空ける
      return { content: [{ startIndex, endIndex: startIndex + 1 }] };
    }),
  }));
}

test('buildTableFillRequests: header row + item rows + totals labels are correct', () => {
  const items = [{ name: '作業A', qty: 2, unitPrice: 5000 }];
  const totals = calcTotals(items, 0.1);
  const rows = fakeTableRows(1 + items.length + 1 + 3, 4);
  const requests = buildTableFillRequests(rows, items, totals);

  const texts = requests.map((r) => r.text);
  assert.ok(texts.includes('品目'));
  assert.ok(texts.includes('作業A'));
  assert.ok(texts.includes('¥10,000')); // 2 * 5000
  assert.ok(texts.includes('小計'));
  assert.ok(texts.includes('消費税'));
  assert.ok(texts.includes('合計'));
  assert.ok(texts.includes(`¥${totals.total.toLocaleString('ja-JP')}`));
});

test('buildTableFillRequests: empty blank-row cells are skipped (no zero-length insertText)', () => {
  const items = [{ name: 'x', qty: 1, unitPrice: 100 }];
  const totals = calcTotals(items, 0.1);
  const rows = fakeTableRows(1 + items.length + 1 + 3, 4);
  const requests = buildTableFillRequests(rows, items, totals);
  assert.ok(requests.every((r) => r.text.length > 0));
});

test('buildTableFillRequests: indices are strictly descending (safe insertion order)', () => {
  const items = [
    { name: 'a', qty: 1, unitPrice: 100 },
    { name: 'b', qty: 1, unitPrice: 200 },
  ];
  const totals = calcTotals(items, 0.1);
  const rows = fakeTableRows(1 + items.length + 1 + 3, 4);
  const requests = buildTableFillRequests(rows, items, totals);
  for (let i = 1; i < requests.length; i++) {
    assert.ok(requests[i - 1].startIndex > requests[i].startIndex, 'must be strictly descending');
  }
});

test('buildTableFillRequests: throws on row-count mismatch (misuse guard)', () => {
  const items = [{ name: 'x', qty: 1, unitPrice: 100 }];
  const totals = calcTotals(items, 0.1);
  const wrongRows = fakeTableRows(2, 4); // should be 1+1+1+3=6
  assert.throws(() => buildTableFillRequests(wrongRows, items, totals), /テーブル行数が想定と一致しません/);
});

test('totalsRowBoldRanges: only non-empty cells in the last row are included', () => {
  const rows = fakeTableRows(3, 4);
  // 最終行の最後の2セルだけ中身がある想定（endIndex > startIndex+1）
  const last = rows[rows.length - 1];
  last.tableCells[2].content[0].endIndex = last.tableCells[2].content[0].startIndex + 3; // "小計"
  last.tableCells[3].content[0].endIndex = last.tableCells[3].content[0].startIndex + 7; // "¥1,000"

  const ranges = totalsRowBoldRanges(rows);
  assert.equal(ranges.length, 2);
  assert.ok(ranges.every((r) => r.endIndex > r.startIndex));
});
