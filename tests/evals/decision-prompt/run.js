/**
 * 決策 prompt Eval（#11）
 *
 * 測量 decision.js 的 buildDecisionPrompt 決策準確度。
 * 對每個 case，用本地模型重新做維護決策，比較 action 是否正確。
 *
 * 主指標：accuracy（action 完全匹配）
 */

import { join } from 'path';
import { homedir } from 'os';
import { requireLlm } from '../eval-runner.js';

const HOME = homedir();

await requireLlm('decision-prompt');

const localModel = await import(join(HOME, '.claude/scripts/local-model.js'));
const askLocalModel = localModel.askLocalModel;

const data = await import('./cases.json');
const { name, variable_file, variable_description, cases } = data.default ?? data;

/**
 * 根據 state 建構決策 prompt（簡化版，用於 eval）
 */
function buildSimpleDecisionPrompt(state) {
  const lines = [
    '你是 Nova 專案的維護 agent。根據以下狀態，決定需要執行的維護動作。',
    '',
    '決策規則：',
    '- 有變更（hasChanges=true）→ commit',
    '- 無候選行為（candidates=0, avgConfidence=0）→ skip',
    '- 候選行為存在但置信度不足 → skip',
    '- 無錯誤且無需更新 → skip',
    '',
    '當前狀態：',
    JSON.stringify(state, null, 2),
    '',
    '只回覆一行，格式：ACTION: <commit|skip>',
  ];
  return lines.join('\n');
}

const DECISION_SYSTEM = `你是 Nova 系統的維護決策器。根據狀態輸出維護動作。
只回覆一行：ACTION: commit 或 ACTION: skip。不輸出其他內容。`;

/**
 * 對單一 case 執行決策，回傳預測的 action
 */
async function predictAction(c) {
  const prompt = buildSimpleDecisionPrompt(c.state);

  const raw = await askLocalModel(prompt, 'ACTION: skip', null, {
    system: DECISION_SYSTEM,
    temperature: 0.1,
  });

  if (!raw) return 'skip';

  // 解析輸出：ACTION: commit 或 ACTION: skip
  const match = raw.match(/ACTION:\s*(commit|skip)/i);
  if (match) return match[1].toLowerCase();

  // fallback：看有沒有 commit 關鍵字
  if (raw.toLowerCase().includes('commit')) return 'commit';
  return 'skip';
}

// 並行跑所有 case
console.log(`\n執行 ${name} Eval（${cases.length} 個 cases）...`);
console.log(`variable: ${variable_file}`);
console.log(`variable_description: ${variable_description}\n`);

const results = await Promise.all(
  cases.map(async (c) => {
    const predicted = await predictAction(c);
    const correct = predicted === c.expected_action;
    return {
      label: c.label,
      state: c.state,
      expected: c.expected_action,
      actual: predicted,
      correct,
    };
  })
);

// 計算指標
const total = results.length;
const correct = results.filter((r) => r.correct).length;
const accuracy = total > 0 ? correct / total : 0;

// 分組統計
const commitResults = results.filter((r) => r.expected === 'commit');
const skipResults = results.filter((r) => r.expected === 'skip');
const commitCorrect = commitResults.filter((r) => r.correct).length;
const skipCorrect = skipResults.filter((r) => r.correct).length;

// 報告
console.log('='.repeat(50));
console.log(`  ${name} Eval Report`);
console.log('='.repeat(50));
console.log(`  Total cases:  ${total}`);
console.log(`  Correct:      ${correct}`);
console.log(`  Accuracy:     ${(accuracy * 100).toFixed(1)}%`);
console.log();
console.log(`  commit cases: ${commitCorrect}/${commitResults.length}`);
console.log(`  skip cases:   ${skipCorrect}/${skipResults.length}`);

const errors = results.filter((r) => !r.correct);
if (errors.length > 0) {
  console.log(`\n  決策錯誤 (${errors.length}):`);
  for (const e of errors) {
    console.log(`    [期望:${e.expected} → 實際:${e.actual}] ${e.label}`);
    console.log(`      state: ${JSON.stringify(e.state)}`);
  }
}

console.log('='.repeat(50));
console.log();

// 輸出機器可讀指標（供 autoresearch loop 使用）
console.log(`metric:${accuracy.toFixed(6)}`);
