/**
 * Local Model System Prompt Eval — 測量 commit 分類準確度
 *
 * 用本地模型（Qwen3-8B）分類 commit type(scope)，
 * 比對 ground truth 計算 exact match accuracy。
 *
 * 這裡的 positive/negative 映射：
 *   positive = 正確分類, negative = 錯誤分類
 *   → 用 accuracy 而非 F1 作為主指標
 */
import { join } from 'path';
import { homedir } from 'os';
import { requireLlm } from '../eval-runner.js';

await requireLlm('local-model');

const { askLocalModel } = await import(join(homedir(), '.claude/scripts/local-model.js'));
const data = await import('./cases.json');
const { cases, system_prompt } = data.default ?? data;

let correct = 0;
let total = cases.length;
const errors = [];

// 並行跑所有 case
const promises = cases.map(async (c) => {
  const response = await askLocalModel(c.input, '', null, {
    system: system_prompt,
    temperature: 0.1,
  });

  const actual = (response || '').trim().toLowerCase().replace(/\s+/g, '');
  const expected = c.expected.toLowerCase().replace(/\s+/g, '');

  // 寬鬆比對：type 正確 + scope 正確（忽略大小寫和空白）
  const typeMatch = actual.split('(')[0] === expected.split('(')[0];
  const scopeActual = actual.match(/\(([^)]+)\)/)?.[1] || '';
  const scopeExpected = expected.match(/\(([^)]+)\)/)?.[1] || '';
  const scopeMatch = scopeActual === scopeExpected;

  return {
    label: c.label,
    input: c.input,
    expected: c.expected,
    actual: response?.trim() || '(empty)',
    typeMatch,
    scopeMatch,
    exactMatch: typeMatch && scopeMatch,
  };
});

const settled = await Promise.all(promises);

for (const r of settled) {
  if (r.exactMatch) {
    correct++;
  } else {
    errors.push(r);
  }
}

const accuracy = total > 0 ? correct / total : 0;
const typeAccuracy = settled.filter(r => r.typeMatch).length / total;

console.log(`\n${'='.repeat(50)}`);
console.log(`  Local Model Commit 分類 Eval Report`);
console.log(`${'='.repeat(50)}`);
console.log(`  Total cases: ${total}`);
console.log(`  Exact match: ${correct}/${total} (${(accuracy * 100).toFixed(1)}%)`);
console.log(`  Type correct: ${settled.filter(r => r.typeMatch).length}/${total} (${(typeAccuracy * 100).toFixed(1)}%)`);
console.log(`  Scope correct: ${settled.filter(r => r.scopeMatch).length}/${total}`);

if (errors.length > 0) {
  console.log(`\n  Errors (${errors.length}):`);
  for (const e of errors) {
    const typeIcon = e.typeMatch ? '✓' : '✗';
    const scopeIcon = e.scopeMatch ? '✓' : '✗';
    console.log(`    [type:${typeIcon} scope:${scopeIcon}] ${e.label}`);
    console.log(`      expected: ${e.expected}`);
    console.log(`      actual:   ${e.actual}`);
  }
}

console.log(`${'='.repeat(50)}\n`);
console.log(`metric:${accuracy.toFixed(6)}`);

process.exit(accuracy >= 0.8 ? 0 : 1);
