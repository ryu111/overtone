/**
 * Session 摘要 prompt Eval（#7）
 *
 * 測量 briefing-builder.js 的 summarySystem prompt 品質。
 * 對每個 case，用 summarySystem prompt + askLocalModel 重新生成摘要，
 * 用 token overlap 指標比對 ground truth 的關鍵名詞覆蓋率。
 *
 * 主指標：semantic similarity（本地模型語意判斷，0-1）
 */

import { join } from 'path';
import { homedir } from 'os';

const HOME = homedir();

const localModel = await import(join(HOME, '.claude/scripts/local-model.js'));
const askLocalModel = localModel.askLocalModel;

const data = await import('./cases.json');
const { name, variable_file, variable_description, cases } = data.default ?? data;

// summarySystem prompt（來自 briefing-builder.js 行 63-70）
const SUMMARY_SYSTEM = `你是 Nova 系統的 session 摘要生成器。

規則：
- 2-3 句話，涵蓋：做了什麼、結果如何
- 使用繁體中文，具體檔案名和數字（不說「一些改動」，說「修改 guards.js 的 3 個 regex」）
- 從工具使用和 commit 記錄推斷主要活動
- 重點：產出了什麼（程式碼/文件/設定），而非過程（讀了/搜了）

範例：
輸入：工具 Read:15, Bash:8, Edit:3 | commit: feat(heartbeat) 新增心跳引擎
輸出：實作心跳引擎模組（heartbeat.js），包含 daemon lifecycle 和 timer 管理。共修改 3 個檔案，新增 1 個模組。

只回覆摘要文字。`;

import { semanticScore } from '../semantic-judge.js';

/**
 * 對單一 case 重新生成摘要，回傳 overlap rate
 */
async function evaluateCase(c) {
  const toolStr = Object.entries(c.toolCounts || {})
    .map(([k, v]) => `${k}: ${v}次`)
    .join(', ') || '無工具';

  const prompt = `根據以下 session 資料，寫一段 2-3 句的中文摘要：

工具使用：${toolStr}
使用者指令：${(c.prompts || []).join(' | ') || '無'}
委派 agent：${(c.agents || []).join(', ') || '無'}
${c.recentCommits ? 'Git commits：\n' + c.recentCommits : ''}`;

  const fallback = `Session 包含 ${c.promptCount} 個指令，使用了 ${Object.keys(c.toolCounts || {}).join(', ') || '無工具'}。`;

  let generated = null;
  try {
    generated = await askLocalModel(prompt, fallback, null, { system: SUMMARY_SYSTEM });
  } catch (err) {
    return {
      label: c.label,
      overlap: 0,
      skipped: true,
      reason: `模型呼叫失敗: ${err.message}`,
    };
  }

  const score = await semanticScore(generated, c.ground_truth);

  return {
    label: c.label,
    overlap: score,
    skipped: false,
    generated: generated?.slice(0, 80),
    groundTruth: c.ground_truth?.slice(0, 80),
  };
}

// 並行跑所有 case
console.log(`\n執行 ${name} Eval（${cases.length} 個 cases）...`);
console.log(`variable: ${variable_file}`);
console.log(`variable_description: ${variable_description}\n`);

const results = [];
for (const c of cases) {
  results.push(await evaluateCase(c));
}

// 計算指標
const validResults = results.filter((r) => !r.skipped);
const skipped = results.filter((r) => r.skipped);
const totalOverlap = validResults.reduce((sum, r) => sum + r.overlap, 0);
const avgOverlap = validResults.length > 0 ? totalOverlap / validResults.length : 0;

// 報告
console.log('='.repeat(55));
console.log(`  ${name} Eval Report`);
console.log('='.repeat(55));
console.log(`  Total cases:    ${cases.length}`);
console.log(`  Valid cases:    ${validResults.length}`);
console.log(`  Skipped:        ${skipped.length}`);
console.log(`  Avg overlap:    ${(avgOverlap * 100).toFixed(1)}%`);
console.log();

const lowOverlap = validResults.filter((r) => r.overlap < 0.3);
if (lowOverlap.length > 0) {
  console.log(`  低覆蓋率 case (${lowOverlap.length}):`);
  for (const r of lowOverlap) {
    console.log(`    [${(r.overlap * 100).toFixed(0)}%] ${r.label}`);
    if (r.generated) console.log(`         生成：${r.generated}`);
    if (r.groundTruth) console.log(`         期望：${r.groundTruth}`);
  }
}

if (skipped.length > 0) {
  console.log(`\n  跳過 case (${skipped.length}):`);
  for (const r of skipped) {
    console.log(`    ${r.label}: ${r.reason}`);
  }
}

console.log('='.repeat(55));
console.log();

// 輸出機器可讀指標（供 autoresearch loop 使用）
console.log(`metric:${avgOverlap.toFixed(6)}`);
