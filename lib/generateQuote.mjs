import { calcTotals, buildHeaderPlan, tableDimensions, buildTableFillRequests, totalsRowBoldRanges } from './quote.mjs';
import { createDoc, batchUpdate, getDoc, findTable, shareWithEmail, docUrl } from './docsClient.mjs';

// 見積データからGoogle Docsを実際に生成する（副作用あり・実APIを呼ぶ）。
//   手順: ①ヘッダーテキスト挿入+見出しスタイル ②空テーブル挿入 ③get()で実インデックス取得
//        ④セルへテキスト挿入(index降順) ⑤get()し直して合計行を太字 ⑥共有
export async function generateQuoteDoc({ docs, drive, quote, shareEmail }) {
  const totals = calcTotals(quote.items, quote.taxRate);
  const header = buildHeaderPlan(quote);
  const dims = tableDimensions(quote.items);

  const documentId = await createDoc(docs, `御見積書_${quote.clientName}_${quote.issueDate}`);

  await batchUpdate(docs, documentId, [
    { insertText: { location: { index: 1 }, text: header.text } },
    {
      updateParagraphStyle: {
        range: header.titleRange,
        paragraphStyle: { namedStyleType: 'HEADING_1' },
        fields: 'namedStyleType',
      },
    },
  ]);

  const afterHeader = await getDoc(docs, documentId);
  const bodyEndIndex = afterHeader.body.content.at(-1).endIndex;
  await batchUpdate(docs, documentId, [
    { insertTable: { rows: dims.rows, columns: dims.columns, location: { index: bodyEndIndex - 1 } } },
  ]);

  const afterTable = await getDoc(docs, documentId);
  const { table } = findTable(afterTable);
  const fillRequests = buildTableFillRequests(table.tableRows, quote.items, totals);
  await batchUpdate(
    docs,
    documentId,
    fillRequests.map((r) => ({ insertText: { location: { index: r.startIndex }, text: r.text } }))
  );

  const afterFill = await getDoc(docs, documentId);
  const { table: filledTable } = findTable(afterFill);
  const boldRanges = totalsRowBoldRanges(filledTable.tableRows);
  await batchUpdate(
    docs,
    documentId,
    boldRanges.map((r) => ({
      updateTextStyle: { range: r, textStyle: { bold: true }, fields: 'bold' },
    }))
  );

  await shareWithEmail(drive, documentId, shareEmail);

  return { documentId, url: docUrl(documentId), totals };
}
