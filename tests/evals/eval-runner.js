/**
 * Autoresearch Eval Runner — 共用指標計算與報告
 *
 * 二元分類指標：
 *   positive = 期望動作（block / trigger）
 *   negative = 不期望動作（allow / no-trigger）
 */

export function calculateMetrics(results) {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const r of results) {
    if (r.expected === 'positive' && r.actual === 'positive') tp++;
    else if (r.expected === 'negative' && r.actual === 'positive') fp++;
    else if (r.expected === 'negative' && r.actual === 'negative') tn++;
    else if (r.expected === 'positive' && r.actual === 'negative') fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const accuracy = results.length > 0 ? (tp + tn) / results.length : 0;

  return { tp, fp, tn, fn, precision, recall, f1, accuracy, total: results.length };
}

export function printReport(name, metrics, details) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ${name} Eval Report`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  Total cases: ${metrics.total}`);
  console.log(`  TP: ${metrics.tp} | FP: ${metrics.fp} | TN: ${metrics.tn} | FN: ${metrics.fn}`);
  console.log(`  Precision: ${(metrics.precision * 100).toFixed(1)}%`);
  console.log(`  Recall:    ${(metrics.recall * 100).toFixed(1)}%`);
  console.log(`  F1 Score:  ${(metrics.f1 * 100).toFixed(1)}%`);
  console.log(`  Accuracy:  ${(metrics.accuracy * 100).toFixed(1)}%`);

  if (details?.errors?.length > 0) {
    console.log(`\n  Errors (${details.errors.length}):`);
    for (const e of details.errors) {
      console.log(`    [${e.expected}→${e.actual}] ${e.label}`);
    }
  }

  console.log(`${'='.repeat(50)}\n`);

  // 輸出機器可讀的單一指標（供 autoresearch loop 使用）
  console.log(`metric:${metrics.f1.toFixed(6)}`);

  return metrics;
}
