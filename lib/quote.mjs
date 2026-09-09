// 見積書ドキュメントの中身を組み立てる純粋関数群（Google APIには触れない・テスト容易）。
//   Docs APIの座標系: ドキュメント本文は index=1 から始まる（0は文書開始そのもの）。
//   insertText等の構造変更はindexがずれるため、①ヘッダーテキスト挿入 ②テーブル挿入
//   ③documents.getでテーブルの実インデックスを読み直し ④セルへのテキスト挿入、の順で行う。
//   ④は「後ろのインデックスから先に挿入する」ことで、挿入のたびに前方のインデックスが
//   ずれる問題を回避する（Docs API定石）。

export function calcTotals(items, taxRate) {
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const tax = Math.round(subtotal * taxRate);
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

const yen = (n) => '¥' + n.toLocaleString('ja-JP');

// ヘッダー部（タイトル・宛先・日付）のテキストブロックと、見出しに適用するスタイル範囲を返す。
//   単一のinsertTextでまとめて挿入したあと、updateParagraphStyleで範囲指定してスタイルを当てる。
export function buildHeaderPlan(quote) {
  const lines = [
    '御見積書',
    '',
    `${quote.clientName} 御中`,
    `件名: ${quote.title}`,
    `発行日: ${quote.issueDate}`,
    '',
  ];
  const text = lines.join('\n');
  const titleEnd = 1 + lines[0].length; // "御見積書"の行末（見出しスタイルの適用範囲）
  return { text, titleRange: { startIndex: 1, endIndex: titleEnd } };
}

// テーブル構造（行×列数）だけを決める。中身はこの時点では空セル。
export function tableDimensions(items) {
  // ヘッダー行1 + 明細行N + 空白行1 + 小計/税/合計の3行
  return { rows: 1 + items.length + 1 + 3, columns: 4 };
}

// documents.get で取得したテーブル構造（table.tableRows[].tableCells[].content[0].startIndex）から、
// 各セルへ書き込むテキストと、その挿入先indexの一覧を作る。挿入順は「index降順」を維持すること
// （呼び出し側でsortしなくて済むよう、ここでも降順に整列して返す）。
export function buildTableFillRequests(tableRows, items, totals) {
  if (tableRows.length !== 1 + items.length + 1 + 3) {
    throw new Error(
      `テーブル行数が想定と一致しません（想定 ${1 + items.length + 1 + 3} / 実際 ${tableRows.length}）。` +
      'tableDimensions()とdocuments.getの結果が食い違っています。'
    );
  }

  const cellTextAt = (rowIndex, colIndex) => {
    if (rowIndex === 0) return ['品目', '数量', '単価', '金額'][colIndex];
    const itemIndex = rowIndex - 1;
    if (itemIndex < items.length) {
      const item = items[itemIndex];
      return [item.name, String(item.qty), yen(item.unitPrice), yen(item.unitPrice * item.qty)][colIndex];
    }
    const totalsRowIndex = rowIndex - 1 - items.length - 1; // -1 for header, -1 for blank row
    if (totalsRowIndex === 0) return ['', '', '小計', yen(totals.subtotal)][colIndex];
    if (totalsRowIndex === 1) return ['', '', '消費税', yen(totals.tax)][colIndex];
    if (totalsRowIndex === 2) return ['', '', '合計', yen(totals.total)][colIndex];
    return '';
  };

  const inserts = [];
  tableRows.forEach((row, r) => {
    row.tableCells.forEach((cell, c) => {
      const text = cellTextAt(r, c);
      if (!text) return; // 空文字はinsertTextで送らない（0文字挿入はAPIエラーになるため）
      const startIndex = cell.content[0].startIndex;
      inserts.push({ startIndex, text });
    });
  });

  // index降順にしてから返す（後ろから挿入すれば前方のindexはずれない）。
  inserts.sort((a, b) => b.startIndex - a.startIndex);
  return inserts;
}

// 合計行（最終行）に太字を当てる範囲を計算する。呼び出し側でテキスト挿入後のドキュメントを
// 再取得してから使う想定（挿入後は各セルの終端indexが変わっているため）。
export function totalsRowBoldRanges(tableRows) {
  const lastRow = tableRows[tableRows.length - 1];
  return lastRow.tableCells
    .map((cell) => cell.content[0])
    .filter((p) => p.endIndex > p.startIndex + 1) // 空セルは対象外
    .map((p) => ({ startIndex: p.startIndex, endIndex: p.endIndex - 1 })); // 末尾の改行は含めない
}
