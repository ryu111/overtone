/**
 * 行為門檻值 Eval（#6）
 *
 * 測量 learner-suggestions.js 中 habitThreshold (0.6) 和
 * antiPatternThreshold (0.4) 的 F1 score。
 *
 * ground truth = 行為是否已在 behaviors.jsonl 中生成建議
 * 預測 = 用當前門檻值判斷 confidence 是否達標
 *
 * 主指標：macro F1（正向和反向行為分別計算 F1 再平均）
 */

import { join } from 'path';
import { homedir } from 'os';
import { calculateMetrics, printReport } from '../eval-runner.js';

const HOME = homedir();

const data = await import('./cases.json');
const { name, variable_file, variable_description, meta, cases } = data.default ?? data;

const habitThreshold = meta?.habit_threshold ?? 0.6;
const antiPatternThreshold = meta?.anti_pattern_threshold ?? 0.4;

console.log(`\n執行 ${name} Eval（${cases.length} 個 cases）...`);
console.log(`variable: ${variable_file}`);
console.log(`variable_description: ${variable_description}`);
console.log(`habitThreshold=${habitThreshold}, antiPatternThreshold=${antiPatternThreshold}\n`);

// 對每個行為用門檻值判斷是否應觸發建議
const results = cases.map((c) => {
  const threshold = c.polarity === -1 ? antiPatternThreshold : habitThreshold;
  const predicted = c.confidence >= threshold;

  return {
    label: c.label,
    pattern: c.pattern,
    polarity: c.polarity,
    confidence: c.confidence,
    threshold,
    expected: c.should_trigger ? 'positive' : 'negative',
    actual: predicted ? 'positive' : 'negative',
    correct: predicted === c.should_trigger,
  };
});

// 整體指標
const overallMetrics = calculateMetrics(results);

// 正向行為（polarity=1）F1
const posResults = results.filter((r) => r.polarity === 1);
const posMetrics = calculateMetrics(posResults);

// 反向行為（polarity=-1）F1
const negResults = results.filter((r) => r.polarity === -1);
const negMetrics = calculateMetrics(negResults);

// Macro F1（正反向 F1 平均）
const macroF1 = (posMetrics.f1 + negMetrics.f1) / 2;

// 找出誤判案例
const errors = results.filter((r) => !r.correct);

// 報告
console.log('='.repeat(60));
console.log(`  ${name} Eval Report`);
console.log('='.repeat(60));
console.log(`  Total cases:  ${results.length}`);
console.log(`  Correct:      ${results.filter((r) => r.correct).length}`);
console.log();
console.log('  整體指標:');
console.log(`    Precision: ${(overallMetrics.precision * 100).toFixed(1)}%`);
console.log(`    Recall:    ${(overallMetrics.recall * 100).toFixed(1)}%`);
console.log(`    F1:        ${(overallMetrics.f1 * 100).toFixed(1)}%`);
console.log(`    Accuracy:  ${(overallMetrics.accuracy * 100).toFixed(1)}%`);
console.log();
console.log(`  polarity=+1（習慣，threshold=${habitThreshold}）:`);
console.log(`    TP:${posMetrics.tp} FP:${posMetrics.fp} TN:${posMetrics.tn} FN:${posMetrics.fn}`);
console.log(`    F1: ${(posMetrics.f1 * 100).toFixed(1)}%`);
console.log();
console.log(`  polarity=-1（反模式，threshold=${antiPatternThreshold}）:`);
console.log(`    TP:${negMetrics.tp} FP:${negMetrics.fp} TN:${negMetrics.tn} FN:${negMetrics.fn}`);
console.log(`    F1: ${(negMetrics.f1 * 100).toFixed(1)}%`);
console.log();
console.log(`  Macro F1（(pos+neg)/2）: ${(macroF1 * 100).toFixed(1)}%`);

if (errors.length > 0) {
  console.log(`\n  誤判案例 (${errors.length}):`);
  // 先列 FN（應該觸發但沒觸發）
  const fns = errors.filter((e) => e.expected === 'positive' && e.actual === 'negative');
  const fps = errors.filter((e) => e.expected === 'negative' && e.actual === 'positive');
  if (fns.length > 0) {
    console.log(`    FN（應觸發但未達門檻，${fns.length} 個）:`);
    for (const e of fns) {
      console.log(`      conf=${e.confidence.toFixed(2)} < ${e.threshold} [${e.label}] ${e.pattern}`);
    }
  }
  if (fps.length > 0) {
    console.log(`    FP（達門檻但無建議，${fps.length} 個）:`);
    for (const e of fps) {
      console.log(`      conf=${e.confidence.toFixed(2)} >= ${e.threshold} [${e.label}] ${e.pattern}`);
    }
  }
}

console.log('='.repeat(60));
console.log();

// 輸出機器可讀指標（供 autoresearch loop 使用）
console.log(`metric:${macroF1.toFixed(6)}`);
