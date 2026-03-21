/**
 * Judge 確定性評分權重 Eval
 *
 * 測量 scoreDeterministic 函式在 20 個 ground truth cases 上的完全匹配率
 * 指標：exact match rate（分數完全一致的比例）
 *
 * 純確定性評估，無需本地模型，執行速度快。
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const home = homedir();

// 載入 cases
const casesPath = join(import.meta.dir, 'cases.json');
const { cases } = JSON.parse(readFileSync(casesPath, 'utf-8'));

// 動態 import judge-scoring
const scoringPath = join(home, '.claude/scripts/judge-scoring.js');
const { scoreDeterministic } = await import(scoringPath);

// 解析元件實際檔案路徑
function resolveFilePath(path, type) {
  const base = join(home, '.claude');
  if (type === 'skill') {
    return join(base, path, 'SKILL.md');
  }
  return join(base, path);
}

const results = [];
const details = [];

console.log(`\n${'='.repeat(55)}`);
console.log('  Judge 確定性評分權重 Eval');
console.log(`${'='.repeat(55)}`);
console.log(`  共 ${cases.length} 個 cases\n`);

for (const c of cases) {
  const filePath = resolveFilePath(c.path, c.type);

  if (!existsSync(filePath)) {
    console.error(`  [SKIP] 檔案不存在：${filePath}`);
    continue;
  }

  const actualScore = scoreDeterministic(filePath, c.type);
  const match = actualScore === c.ground_truth_deterministic;

  results.push({ match, path: c.path, actual: actualScore, expected: c.ground_truth_deterministic });
  details.push({
    label: c.label,
    expected: c.ground_truth_deterministic,
    actual: actualScore,
    match,
  });

  const status = match ? 'OK' : 'MISMATCH';
  console.log(`  [${status}] expected=${c.ground_truth_deterministic} actual=${actualScore} | ${c.label}`);
}

// 計算 exact match rate
const matched = results.filter(r => r.match).length;
const total = results.length;
const exactMatchRate = total > 0 ? matched / total : 0;

// 顯示不匹配的 cases
const mismatches = details.filter(d => !d.match);

console.log(`\n${'='.repeat(55)}`);
console.log(`  Cases 評估完成：${total}/${cases.length}`);
console.log(`  完全匹配：${matched}/${total}`);
console.log(`  Exact match rate：${(exactMatchRate * 100).toFixed(1)}%`);

if (mismatches.length > 0) {
  console.log(`\n  不匹配的 cases（${mismatches.length} 個）：`);
  for (const d of mismatches) {
    const diff = d.actual - d.expected;
    const sign = diff > 0 ? '+' : '';
    console.log(`    expected=${d.expected} actual=${d.actual} (${sign}${diff}) | ${d.label}`);
  }
}

console.log(`${'='.repeat(55)}\n`);

// 輸出機器可讀指標（供 autoresearch loop 使用）
console.log(`metric:${exactMatchRate.toFixed(6)}`);

process.exit(exactMatchRate >= 0.8 ? 0 : 1);
