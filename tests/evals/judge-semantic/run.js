/**
 * Judge 語意評分 prompt Eval
 *
 * 測量 scoreWithModel 函式在 20 個 ground truth cases 上的準確度
 * 指標：1 - MAE/50（越高越好，1.0 = 完美匹配）
 *
 * 注意：此 eval 需要本地模型在 port 8000 運行（Qwen3-8B）
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const home = homedir();
const require = createRequire(import.meta.url);

// 載入 cases
const casesPath = join(import.meta.dir, 'cases.json');
const { cases } = JSON.parse(readFileSync(casesPath, 'utf-8'));

// 動態 import judge-scoring（使用 ~/ 路徑）
const scoringPath = join(home, '.claude/scripts/judge-scoring.js');
const { scoreWithModel } = await import(scoringPath);

// 解析元件實際檔案路徑
function resolveFilePath(path, type) {
  const base = join(home, '.claude');
  if (type === 'skill') {
    return join(base, path, 'SKILL.md');
  }
  // rule、agent、hook 直接拼接
  return join(base, path);
}

const results = [];
const details = [];

console.log(`\n${'='.repeat(55)}`);
console.log('  Judge 語意評分 prompt Eval');
console.log(`${'='.repeat(55)}`);
console.log(`  共 ${cases.length} 個 cases，正在評分（需本地模型）...\n`);

for (const c of cases) {
  const filePath = resolveFilePath(c.path, c.type);

  if (!existsSync(filePath)) {
    console.error(`  [SKIP] 檔案不存在：${filePath}`);
    continue;
  }

  const content = readFileSync(filePath, 'utf-8');

  process.stdout.write(`  評分中：${c.label}... `);

  let actualSemantic = null;
  try {
    const result = await scoreWithModel(filePath, c.type, content);
    if (result && typeof result.total === 'number') {
      actualSemantic = result.total;
    }
  } catch (e) {
    console.error(`[ERROR] ${e.message}`);
  }

  if (actualSemantic === null) {
    console.log('模型未回應，跳過');
    continue;
  }

  const error = Math.abs(actualSemantic - c.ground_truth_semantic);
  results.push({ error, path: c.path, actual: actualSemantic, expected: c.ground_truth_semantic });
  details.push({
    label: c.label,
    expected: c.ground_truth_semantic,
    actual: actualSemantic,
    error,
  });

  console.log(`done (expected=${c.ground_truth_semantic}, actual=${actualSemantic}, err=${error})`);
}

// 計算 MAE
if (results.length === 0) {
  console.error('\n  所有 cases 均未取得語意分數，可能本地模型未啟動');
  console.log('metric:0.000000');
  process.exit(1);
}

const mae = results.reduce((sum, r) => sum + r.error, 0) / results.length;
const metric = 1 - mae / 50;

// 按誤差排序，顯示最差的前 5 個
const worst = [...details].sort((a, b) => b.error - a.error).slice(0, 5);

console.log(`\n${'='.repeat(55)}`);
console.log(`  Cases 評分完成：${results.length}/${cases.length}`);
console.log(`  MAE：${mae.toFixed(2)} 分（平均絕對誤差，越小越好）`);
console.log(`  指標：${metric.toFixed(6)}（1 - MAE/50，越高越好）`);

if (worst.length > 0) {
  console.log(`\n  誤差最大的 ${worst.length} 個 cases：`);
  for (const d of worst) {
    const sign = d.actual > d.expected ? '+' : '-';
    console.log(`    err=${d.error} | expected=${d.expected} actual=${d.actual} (${sign}${Math.abs(d.actual - d.expected)}) | ${d.label}`);
  }
}

console.log(`${'='.repeat(55)}\n`);

// 輸出機器可讀指標（供 autoresearch loop 使用）
console.log(`metric:${metric.toFixed(6)}`);

process.exit(metric >= 0.8 ? 0 : 1);
